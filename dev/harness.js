// Minimal fake-DOM harness: loads index.html <script> + dev/tests.js in one scope
// Usage: node dev/harness.js
function fakeEl(id) {
  return {
    _id: id, innerHTML: '', textContent: '', value: '', title: '',
    disabled: false, hidden: false, width: 0, height: 0,
    style: { setProperty() {} }, dataset: {}, files: [],
    options: [{ text: 'Random' }], selectedIndex: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {},
    appendChild() {}, remove() {}, click() {}, focus() {}, select() {},
    setAttribute() {}, insertAdjacentHTML() {},
    querySelectorAll: () => [], querySelector: () => null,
    getContext: () => null, toDataURL: () => 'data:,',
  };
}
const els = {};
global.document = {
  getElementById: (id) => els[id] || (els[id] = fakeEl(id)),
  querySelectorAll: () => [], querySelector: () => null,
  createElement: () => fakeEl('dyn'),
  addEventListener() {}, activeElement: null, body: fakeEl('body'),
  documentElement: { dataset: {} },
};
global.window = { history: { replaceState() {} }, addEventListener(){}, innerWidth: 1440 };
global.location = { hash: '', origin: 'http://x', pathname: '/' };
global.navigator = {};
global.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = v; }, removeItem(k) { delete this._m[k]; } };
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const app = html.match(/<script>([\s\S]*)<\/script>/)[1];
const tests = fs.readFileSync(path.join(__dirname, 'tests.js'), 'utf8');
eval(app + '\n' + tests);
