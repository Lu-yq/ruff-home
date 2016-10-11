import * as Path from 'path';

import fetch from 'fetch';
import { Server } from '../';

import 't';

const port = 8088;
const baseUrl = `http://127.0.0.1:${port}`;

describe('Static files', () => {
    let server: Server;

    before(() => {
        server = new Server();
        server.use('/', Server.static(Path.join(__dirname, '../../test/static')));
        return server.listen(port);
    });

    after(() => {
        return new Promise((resolve, reject) => {
            server.server.close((error: any) => error ? reject(error) : resolve());
        });
    })

    it('Should handle files with configured content type', () => {
        return fetch(`${baseUrl}/1.html`)
            .then(response => response.text())
            .then(text => {
                text.trim().should.equal('text/html');
            });
    });

    it('Should handle files with unknown content type', () => {
        return fetch(`${baseUrl}/2.unknown`)
            .then(response => response.text())
            .then(text => {
                text.trim().should.equal('application/octet-stream');
            });
    });

    it('Should handle pre-gzipped files', () => {
        return fetch(`${baseUrl}/3.js`)
            .then(response => {
                response.headers['content-encoding'].should.equal('gzip');
                return response.buffer();
            })
            .then(buffer => {
                buffer.length.should.be.greaterThan(0);
            });
    });
});

describe('Static files under specified path', () => {
    let server: Server;

    before(() => {
        server = new Server();
        server.use('/build', Server.static(Path.join(__dirname, '../../test/static')));
        return server.listen(port);
    });

    after(() => {
        return new Promise((resolve, reject) => {
            server.server.close((error: any) => error ? reject(error) : resolve());
        });
    })

    it('Should handle files with configured content type', () => {
        return fetch(`${baseUrl}/build/1.html`)
            .then(response => response.text())
            .then(text => {
                text.trim().should.equal('text/html');
            });
    });

    it('Should handle files with unknown content type', () => {
        return fetch(`${baseUrl}/build/2.unknown`)
            .then(response => response.text())
            .then(text => {
                text.trim().should.equal('application/octet-stream');
            });
    });

    it('Should handle pre-gzipped files', () => {
        return fetch(`${baseUrl}/build/3.js`)
            .then(response => {
                response.headers['content-encoding'].should.equal('gzip');
                return response.buffer();
            })
            .then(buffer => {
                buffer.length.should.be.greaterThan(0);
            });
    });
});
