'use strict';

var Chai = require('chai');

Chai.should();
Chai.use(require('chai-as-promised'));

require('../bld/test/static-files-test');
