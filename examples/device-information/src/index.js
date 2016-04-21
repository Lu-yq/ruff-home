'use strict';

var Path = require('path');
var Server = require('home').Server;

var server = new Server();

server.use('/', Server.static('static'));

server.get('/', function (req) {
    return {
        sn: process.ruff.sn,
        time: Date.now()
    };
});

server.listen(80);
