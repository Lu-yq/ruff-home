/**
 * Home (Web Framework) for Ruff.
 * A tiny web framework.
 *
 * https://github.com/vilic/ruff-home
 *
 * MIT License
 */

import 'promise';

import * as FS from 'fs';
import * as HTTP from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import * as Path from 'path';
import * as QueryString from 'querystring';
import * as URL from 'url';

export type HTTPMethod = 'GET' | 'POST';

export interface Dictionary<T> {
    [key: string]: T;
}

export type Resolvable<T> = Promise<T> | T;

export interface Request extends IncomingMessage {
    path: string;
    query: Dictionary<string>;
}

export interface Middleware {
    (req: Request, res: ServerResponse): Resolvable<Response | Object | void>;
}

export interface RouteOptions {
    method: string | undefined;
    path: string;
    extendable: boolean;
    middleware: Middleware;
}

export interface Route extends RouteOptions {
    pathWithEndingSlash: string;
}

export abstract class Response {
    abstract applyTo(req: ServerResponse): void;
}

export class ExpectedError {
    constructor(
        public message: string,
        public statusCode = 500
    ) { }
}

export class NotFoundError extends ExpectedError {
    constructor(
        message: string,
        public path: string
    ) {
        super(message, 404);
    }
}

const hop = Object.prototype.hasOwnProperty;

let mimeMap = require('../mime.json');

let voidPromise = Promise.resolve();

export class Server {
    server = HTTP.createServer();
    routes: Route[] = [];

    views: string;
    errorViewsFolder: string;

    private _templateCache: Dictionary<string | undefined> = {};

    constructor({
        views = Path.resolve('views'),
        errorViewsFolder = 'error'
    } = {}) {
        this.views = views;
        this.errorViewsFolder = errorViewsFolder;

        this.server.on('request', (req: IncomingMessage, res: ServerResponse) => {
            this._handleRequest(req as Request, res);
        });
    }

    private _handleRequest(req: Request, res: ServerResponse): void {
        let urlStr = req.url;
        let { pathname, query: queryStr } = URL.parse(urlStr!);

        req.query = QueryString.parse(queryStr);

        let routes = this.routes;
        let index = 0;

        let next = () => {
            let route = routes[index++];

            if (!route) {
                this._handleError(pathname, res, new NotFoundError('Page Not Found', pathname));
                return;
            }

            let method = route.method;

            if (
                (method && method !== req.method) || (
                    pathname !== route.path &&
                    (!route.extendable || pathname.indexOf(route.pathWithEndingSlash) !== 0)
                )
            ) {
                next();
                return;
            }

            req.path = route.extendable && route.path !== '/' ?
                pathname.substr(route.path.length) : pathname;

            let resultResolvable: Resolvable<Response | Object | void>;

            try {
                resultResolvable = route.middleware(req, res);
            } catch (error) {
                this._handleError(pathname, res, error);
                return;
            }

            // Performance reason.
            if (resultResolvable === req) {
                next();
            } else {
                Promise
                    .resolve(resultResolvable)
                    .then(result => {
                        if (result === req) {
                            next();
                        } else {
                            this._handleResult(pathname, res, result);
                        }
                    }, reason => {
                        this._handleError(pathname, res, reason);
                    });
            }
        };

        next();
    }

    add(options: RouteOptions): void {
        let route = options as Route;
        let path = options.path;

        if (path === '/') {
            route.path = path;
            route.pathWithEndingSlash = path;
        } else if (/\/$/.test(path)) {
            route.path = path.substr(0, path.length - 1);
            route.pathWithEndingSlash = path;
        } else {
            route.path = path;
            route.pathWithEndingSlash = path + '/';
        }

        this.routes.push(route);
    }

    use(path: string, middleware: Middleware): void {
        this.add({
            method: undefined,
            path,
            extendable: true,
            middleware
        });
    }

    get(path: string, middleware: Middleware): void {
        this.add({
            method: 'GET',
            path,
            extendable: false,
            middleware
        });
    }

    post(path: string, middleware: Middleware): void {
        this.add({
            method: 'POST',
            path,
            extendable: false,
            middleware
        });
    }

    listen(port: number, hostname?: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.server.listen(port, hostname, (error: Error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    private _handleResult(path: string, res: ServerResponse, result: Response | Object | void): void {
        if ((<any>res)._headerSent) {
            return;
        }

        if (result instanceof Response) {
            result.applyTo(res);
        } else {
            // Ideally, we should convert result into an instance of response and apply it later.
            // But as it's running on board, that step is skipped for performance reason.

            let html = this._render(path, result);

            if (html === undefined) {
                let json = JSON.stringify(result);

                if (json) {
                    res.setHeader('Content-Type', 'application/json');
                    res.write(json);
                }

                res.end();
            } else {
                res.setHeader('Content-Type', 'text/html');
                res.write(html);
                res.end();
            }
        }
    }

    private _handleError(path: string, res: ServerResponse, error: ExpectedError | Error | Object): void {
        if ((<any>res)._headerSent) {
            return;
        }

        let html: string;
        let statusCode: number;

        if (error instanceof ExpectedError) {
            statusCode = error.statusCode;
            html = this._render(`${this.errorViewsFolder}/${statusCode}`, error) ||
                error.message;
        } else {
            statusCode = 500;
            html = 'Server Error';
        }

        res.statusCode = statusCode;
        res.setHeader('Content-Type', 'text/html');

        res.write(html);
        res.end();

        console.error(error);
    }

    private _render(view: string, data: any): string | undefined {
        if (view === '/') {
            view += 'index';
        }

        let template: string | undefined;

        if (hop.call(this._templateCache, view)) {
            template = this._templateCache[view];

            if (!template) {
                return undefined;
            }
        } else {
            let viewPath = Path.join(this.views, view + '.html');

            if (FS.existsSync(viewPath)) {
                template = FS.readFileSync(viewPath, 'utf-8');
                this._templateCache[view] = template;
            } else {
                this._templateCache[view] = undefined;
                return undefined;
            }
        }

        data = data || Object.create(null);

        return template.replace(/\{([$\w\d.-]+)\}/g, (text: string, expression: string) => {
            let keys = expression.split('.');

            let node = data;

            for (let key of keys) {
                node = node[key];

                if (node === undefined) {
                    return text;
                }
            }

            return node;
        });
    }

    static static(path: string, defaultPath = '/index.html'): Middleware {
        return (req, res) => {
            return new Promise((resolve, reject) => {
                if (defaultPath && defaultPath[0] !== '/') {
                    defaultPath = '/' + defaultPath;
                }

                let urlPath = req.path === '/' ? defaultPath : req.path;
                let filePath: string | undefined = Path.join(path, urlPath);

                let candidates = [
                    {
                        path: `${filePath}.gz`,
                        gzipped: true
                    },
                    {
                        path: filePath,
                        gzipped: false
                    }
                ]

                let target = findAndMerge(candidates, candidate => {
                    try {
                        let stats = FS.statSync(candidate.path);
                        return stats.isFile() ?
                            { size: stats.size } : undefined;
                    } catch (error) {
                        return undefined;
                    }
                });

                if (!target) {
                    resolve(req);
                    return;
                }

                if (target.gzipped) {
                    res.setHeader('Content-Encoding', 'gzip');
                }

                res.setHeader('Content-Length', target.size.toString());

                let extname = Path.extname(filePath);

                res.setHeader(
                    'Content-Type',
                    hop.call(mimeMap, extname) ?
                        mimeMap[extname] : 'application/octet-stream'
                );

                try {
                    let stream = FS.createReadStream(target.path);

                    stream.pipe(res);

                    stream.on('error', reject);
                    res.on('error', reject);

                    res.on('end', () => resolve());
                } catch (error) {
                    reject(error);
                }
            });
        };
    }
}

export default Server;

type FindAndMergeFilter<T, U> = (item: T) => U | undefined;

function findAndMerge<T, U>(items: T[], filter: FindAndMergeFilter<T, U>): T & U | undefined {
    for (let item of items) {
        let ret = filter(item);

        if (ret) {
            return assign(item, ret);
        }
    }

    return undefined;
}

function assign<T, U>(target: T, source: U): T & U {
    for (let key of Object.keys(source)) {
        if (!(key in target)) {
            (<any>target)[key] = (<any>source)[key];
        }
    }

    return target as T & U;
}
