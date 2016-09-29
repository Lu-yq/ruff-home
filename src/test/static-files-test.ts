import * as Path from 'path';

import fetch from 'fetch';
import { Server } from '../';

import 't';

describe('Static files', () => {
    let server: Server;
    let port = 8088;
    let baseUrl = `http://127.0.0.1:${port}`;

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
