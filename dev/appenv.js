'use strict';
/* Shared loader for the node-based dev tools.
 *
 * index.html is the entire product, so these tools load its <script> verbatim into
 * a minimal fake DOM instead of re-implementing any of it. Anything duplicated here
 * can drift from the app and quietly stop testing reality — that already happened
 * once, when this suite grew its own stale copy of genHex() and spent months
 * auditing hue/saturation ranges the app no longer used.
 *
 *   const { run } = require('./appenv');
 *   const { genHex } = run('return { genHex };');   // the app's real genHex
 *
 * run(epilogue) evaluates the app and then `epilogue` in one shared scope, and
 * returns whatever the epilogue returns. Pass no epilogue to just initialise the
 * app; pass a whole test file to run it against the app's globals.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function readHtml() { return fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'); }
function readBlock(tag) {
  const html = readHtml();
  const m = html.match(new RegExp('<' + tag + '>([\\s\\S]*)</' + tag + '>'));
  if (!m) throw new Error(`no <${tag}> block found in index.html`);
  return m[1];
}
const readCss = () => readBlock('style');
const readJs = () => readBlock('script');

/* Everything the app touches on an element. Deliberately inert: these tests drive
 * app logic and colour maths, not layout — dev/domtest.js covers the real DOM. */
function makeElement(id) {
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

function makeDom() {
  const els = {};
  const storage = {};
  return {
    els,
    document: {
      getElementById: (id) => els[id] || (els[id] = makeElement(id)),
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => makeElement('dyn'),
      addEventListener() {},
      activeElement: null,
      body: makeElement('body'),
      documentElement: { dataset: {} },
    },
    window: { history: { replaceState() {} }, addEventListener() {}, innerWidth: 1440 },
    location: { hash: '', origin: 'http://x', pathname: '/' },
    navigator: {},
    localStorage: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; },
    },
  };
}

/* Note: matchMedia is intentionally absent, so the app takes the same
 * "no media queries available" branches it did before this loader existed. */
function run(epilogue = '', dom = makeDom()) {
  const body = readJs() + '\n' + epilogue;
  const fn = new Function('window', 'document', 'location', 'navigator', 'localStorage', body);
  return fn(dom.window, dom.document, dom.location, dom.navigator, dom.localStorage);
}

module.exports = { ROOT, readHtml, readCss, readJs, makeElement, makeDom, run };
