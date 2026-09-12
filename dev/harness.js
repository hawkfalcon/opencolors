'use strict';
/* Functional smoke-test runner: evaluates index.html's <script> and dev/tests.js in
 * one shared scope, so the tests run against the app's real globals.
 *
 * Usage: node dev/harness.js     (exit code 1 if any test fails)
 */
const fs = require('fs');
const path = require('path');
const { run } = require('./appenv');

run(fs.readFileSync(path.join(__dirname, 'tests.js'), 'utf8'));
