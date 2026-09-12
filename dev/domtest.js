'use strict';
/* Behavioural snapshot test — drives the real DOM through a scripted session and
 * compares every step against a committed golden file.
 *
 * Usage: node dev/domtest.js              compare against dev/domtest.golden.json
 *        node dev/domtest.js --update     regenerate the golden after an intended
 *                                         behaviour change (then read the diff!)
 *
 * Needs jsdom: npm install jsdom        (prints SKIP and exits 0 when absent)
 *
 * This sits between the other two node tools. dev/tests.js calls app functions
 * directly against a stub DOM, so it checks logic but never a real selector, a real
 * event bubble or a real focus ring; dev/uitest.py checks layout and pixels but needs
 * a browser. This one loads index.html into an actual DOM and clicks it, which is what
 * catches a refactor that is logically identical but structurally not -- a handler
 * bound to the wrong element, a class renamed in JS but not CSS, an animation clone
 * left behind.
 *
 * Math.random and Date.now are pinned, so a run is reproducible and a diff is always a
 * real difference. The golden holds a hash of the whole <body> per step (minus the
 * <script> source, HTML comments and whitespace, which are not behaviour) alongside
 * enough readable fields to say what moved when one does.
 *
 * Known limit: this suite only sees what the UI can reach. Defensive guards behind a
 * condition the renderer already prevents -- e.g. the `colors.length>=MAX_COLORS` bail
 * in the strip click handler, unreachable because no adder is rendered at the maximum
 * -- are covered only by the static checks in dev/audit.js. That gap was found by
 * mutation-testing this file, and is deliberate: faking an unreachable click would
 * test the test, not the app.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./appenv');

const GOLDEN = path.join(__dirname, 'domtest.golden.json');
const UPDATE = process.argv.includes('--update');

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (e) {
  console.log('SKIP jsdom not installed (npm install jsdom)');
  process.exit(0);
}

/* deterministic stand-ins for the two nondeterministic inputs the app reads */
function seededRandom(seed = 987654321) {
  let s = seed;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const FROZEN_NOW = 1700000000000;   // saved-palette ids and timestamps come from Date.now()

const short = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 12);

/* ---------- the session ----------
 * Each step names itself and performs one interaction; the runner snapshots the whole
 * document after every step, so a failure points straight at the action that caused it.
 * `c` offers the few conveniences the steps need: q/click/key/tap/wait and the page. */
/* Theme ids must mirror the app's GEN_THEMES; if one is added there, add it here. */
const THEME_IDS = ['pastel', 'vivid', 'warm', 'cool', 'light', 'dark', 'mono', 'random'];

const SESSION = [
  ['load', async (c) => { await c.wait(120); }],

  /* generate */
  ['generate-button', async (c) => c.click(c.d.getElementById('generateBtn'))],
  ['generate-spacebar', async (c) => c.key(' ')],

  /* Cycle every generation theme before anything is locked. genHex() has one branch
   * per theme id; without this only its 'random' default is ever exercised, so a
   * change to any single theme's HSL range would go unnoticed. */
  ...THEME_IDS.flatMap((id) => [
    [`theme-${id}`, async (c) => {
      c.click(c.d.getElementById('themeBtn'));
      c.click(c.q(`#themeMenu [data-gt="${id}"]`));
    }],
    [`generate-${id}`, async (c) => c.click(c.d.getElementById('generateBtn'))],
  ]),

  /* locking, three ways in */
  ['lock-by-click', async (c) => c.click(c.q('.strip[data-index="0"] [data-action="lock"]'))],
  ['lock-by-L-key', async (c) => { c.q('.strip[data-index="2"] .hex').focus(); c.key('l'); }],
  ['lock-by-number-key', async (c) => c.key('3')],
  ['copy-focused-color', async (c) => c.key('c')],
  ['generate-with-locks-held', async (c) => c.click(c.d.getElementById('generateBtn'))],

  /* reordering: exercises the FLIP clone animation against a real DOM */
  ['arrow-right-immediate', async (c) => { c.q('.strip[data-index="1"] .hex').focus(); c.key('ArrowRight'); }],
  ['arrow-right-settled', async (c) => c.wait(700)],
  ['swapper-button', async (c) => { c.click(c.q('.swapper[data-index="1"] button')); await c.wait(700); }],

  /* remix dock */
  ['dock-sort-hue', async (c) => c.click(c.q('#dock [data-dock="sortHue"]'))],
  ['dock-sort-light', async (c) => c.click(c.q('#dock [data-dock="sortLight"]'))],
  ['dock-reverse', async (c) => c.click(c.q('#dock [data-dock="reverse"]'))],
  ['dock-shuffle', async (c) => c.click(c.q('#dock [data-dock="shuffle"]'))],
  ['dock-lock-all', async (c) => c.click(c.q('#dock [data-dock="lockToggle"]'))],
  ['dock-unlock-all', async (c) => c.click(c.q('#dock [data-dock="lockToggle"]'))],
  ['dock-sort-hue-again', async (c) => c.click(c.q('#dock [data-dock="sortHue"]'))],

  /* history */
  ['undo-ctrl-z', async (c) => c.key('z', { ctrlKey: true })],
  ['redo-ctrl-shift-z', async (c) => c.key('z', { ctrlKey: true, shiftKey: true })],
  ['redo-ctrl-y', async (c) => c.key('y', { ctrlKey: true })],
  ['undo-button', async (c) => c.click(c.d.getElementById('undoBtn'))],

  /* add / remove */
  ['add-in-gap', async (c) => c.click(c.q('.adder[data-index="2"] button'))],
  ['remove-strip', async (c) => c.click(c.q('.strip[data-index="2"] [data-action="remove"]'))],

  /* grow to the 9-colour maximum and back: this is what exercises the many/full
   * classes on #strips and the disappearance of adders at MAX_COLORS. Without it a
   * change to those thresholds is invisible to this suite. */
  ['grow-to-6', async (c) => c.click(c.q('.adder button'))],
  ['grow-to-7', async (c) => c.click(c.q('.adder button'))],
  ['grow-to-8', async (c) => c.click(c.q('.adder button'))],
  ['grow-to-9-maximum', async (c) => c.click(c.q('.adder button'))],
  ['shrink-back-to-5', async (c) => {
    for (let i = 0; i < 4; i++) c.click(c.q('.strip[data-index="1"] [data-action="remove"]'));
  }],

  /* inline colour editor */
  ['edit-open', async (c) => c.click(c.q('.strip[data-index="0"] [data-action="edit"]'))],
  ['edit-type-hex', async (c) => {
    const i = c.d.getElementById('hexInput');
    i.value = '#123456'; i.dispatchEvent(new c.w.Event('input', { bubbles: true }));
  }],
  ['edit-hue-slider', async (c) => {
    const s = c.d.getElementById('hueSlider');
    s.value = '210'; s.dispatchEvent(new c.w.Event('input', { bubbles: true }));
  }],
  ['edit-pick-shade', async (c) => c.click(c.q('.shade-row .shade'))],
  ['edit-done', async (c) => c.click(c.q('[data-pact="done"]'))],
  ['edit-open-second', async (c) => c.click(c.q('.strip[data-index="1"] [data-action="edit"]'))],
  ['edit-escape-cancels', async (c) => c.key('Escape')],
  ['edit-open-third', async (c) => c.click(c.q('.strip[data-index="1"] [data-action="edit"]'))],
  ['edit-cancel-button', async (c) => c.click(c.q('[data-pact="cancel"]'))],
  ['undo-after-edit', async (c) => c.key('z', { ctrlKey: true })],

  /* dropdown menus */
  ['theme-menu-open', async (c) => c.click(c.d.getElementById('themeBtn'))],
  ['theme-menu-inner-click', async (c) => c.click(c.d.getElementById('themeMenu'))],
  ['theme-menu-escape', async (c) => c.key('Escape')],
  ['new-menu-open', async (c) => c.click(c.d.getElementById('newBtn'))],
  ['new-menu-escape', async (c) => c.key('Escape')],
  ['check-menu-open', async (c) => c.click(c.d.getElementById('checkBtn'))],
  ['check-menu-escape', async (c) => c.key('Escape')],
  ['theme-pick-vivid', async (c) => { c.click(c.d.getElementById('themeBtn')); c.click(c.q('#themeMenu [data-gt="vivid"]')); }],
  ['theme-pick-mono', async (c) => { c.click(c.d.getElementById('themeBtn')); c.click(c.q('#themeMenu [data-gt="mono"]')); }],

  /* create menu: presets, words, surprise, image */
  ['explore-modal-open', async (c) => { c.click(c.d.getElementById('newBtn')); c.click(c.q('#newMenu [data-new="explore"]')); }],
  ['preset-loaded', async (c) => c.click(c.q('.preset[data-preset="3"]'))],
  ['mood-modal-open', async (c) => { c.click(c.d.getElementById('newBtn')); c.click(c.q('#newMenu [data-new="mood"]')); }],
  ['word-palette-applied', async (c) => {
    c.d.getElementById('moodInput').value = 'ocean';
    c.click(c.d.getElementById('moodGo'));
  }],
  ['surprise-me', async (c) => { c.click(c.d.getElementById('newBtn')); c.click(c.q('#newMenu [data-new="random"]')); }],
  ['image-modal-open', async (c) => { c.click(c.d.getElementById('newBtn')); c.click(c.q('#newMenu [data-new="image"]')); }],
  ['image-modal-escape', async (c) => c.key('Escape')],

  /* check menu: contrast + vision */
  ['contrast-modal-open', async (c) => { c.click(c.d.getElementById('checkBtn')); c.click(c.q('#checkMenu [data-check="contrast"]')); }],
  ['contrast-pick-bg', async (c) => c.click(c.q('#bgPicks .pick[data-i="2"]'))],
  ['contrast-pick-fg', async (c) => c.click(c.q('#fgPicks .pick[data-i="1"]'))],
  ['contrast-escape', async (c) => c.key('Escape')],
  ['vision-modal-open', async (c) => { c.click(c.d.getElementById('checkBtn')); c.click(c.q('#checkMenu [data-check="vision"]')); }],
  ['vision-escape', async (c) => c.key('Escape')],

  /* export */
  ['export-modal-open', async (c) => c.click(c.d.getElementById('exportBtn'))],
  ['export-rename', async (c) => {
    const n = c.d.getElementById('expName');
    n.value = 'Renamed Palette'; n.dispatchEvent(new c.w.Event('input', { bubbles: true }));
  }],
  ['export-reroll-name', async (c) => c.click(c.d.getElementById('expDice'))],
  ['export-copy-buttons', async (c) => {
    for (const id of ['copyLinkBtn', 'copyCssBtn', 'copyHexBtn', 'copyTailwind',
      'copyScss', 'copyJson', 'copySvg', 'copyGradient']) c.click(c.d.getElementById(id));
  }],
  ['export-download-png', async (c) => c.click(c.d.getElementById('pngBtn'))],
  ['export-escape', async (c) => c.key('Escape')],

  /* saved drawer: load before delete, or there is nothing left to load */
  ['save-current', async (c) => c.click(c.d.getElementById('saveCurrentBtn'))],
  ['save-duplicate-rejected', async (c) => c.click(c.d.getElementById('saveCurrentBtn'))],
  ['saved-drawer-open', async (c) => c.click(c.d.getElementById('savedBtn'))],
  ['saved-load', async (c) => c.click(c.q('.saved-item'))],
  ['saved-reopen-after-load', async (c) => c.click(c.d.getElementById('savedBtn'))],
  ['saved-delete', async (c) => c.click(c.q('.saved-item .del-btn'))],
  ['saved-escape', async (c) => c.key('Escape')],

  /* about + shortcuts */
  ['about-open', async (c) => c.click(c.d.getElementById('freePill'))],
  ['about-to-shortcuts', async (c) => c.click(c.d.getElementById('aboutKeysBtn'))],
  ['shortcuts-toggle-shut', async (c) => c.key('?')],
  ['shortcuts-toggle-open', async (c) => c.key('?')],
  ['shortcuts-escape', async (c) => c.key('Escape')],

  /* header chrome */
  ['name-dice', async (c) => c.click(c.d.getElementById('nameDice'))],
  ['toolbar-collapse', async (c) => c.click(c.d.getElementById('toolsToggle'))],
  ['toolbar-expand', async (c) => c.click(c.d.getElementById('toolsToggle'))],
];

/* ---------- runner ---------- */
async function runSession() {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.message || e)));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://example.test/index.html',
    virtualConsole: vc,
    beforeParse(w) {
      w.Math.random = seededRandom();
      w.Date.now = () => FROZEN_NOW;
      /* jsdom has neither, so this also covers the clipboard fallback path */
      w.navigator.clipboard = undefined;
    },
  });
  const w = dom.window, d = w.document;

  /* Drift guard: THEME_IDS drives the generate-<id> steps, so a theme added to (or
   * renamed in) the app would silently go untested. Fail loudly instead. */
  const appThemes = [...d.querySelectorAll('#themeMenu [data-gt]')].map((b) => b.dataset.gt);
  const missing = appThemes.filter((t) => !THEME_IDS.includes(t));
  if (missing.length) throw new Error(`THEME_IDS is stale — app has theme(s) not covered here: ${missing.join(', ')}`);
  const unknown = THEME_IDS.filter((t) => !appThemes.includes(t));
  if (unknown.length) throw new Error(`THEME_IDS lists theme(s) the app no longer has: ${unknown.join(', ')}`);

  /* Hash of the rendered body. The app's own <script> source, HTML comments and
   * whitespace are excluded: none of them are behaviour, and two of them are exactly
   * what a cleanup refactor is allowed to churn. */
  const fingerprint = () => short(d.body.innerHTML
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' '));

  const c = {
    w, d,
    q: (s) => d.querySelector(s),
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    click: (el) => { if (!el) throw new Error('nothing to click'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })); },
    key: (k, init = {}) => d.dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, init))),
  };

  const steps = [];
  for (const [name, act] of SESSION) {
    c.step = name;
    try {
      await act(c);
    } catch (e) {
      throw new Error(`step "${name}" failed: ${e.message}`);
    }
    const hexes = [...d.querySelectorAll('.strip .hex')].map((e) => e.textContent).join(',');
    steps.push({
      name,
      body: fingerprint(),
      title: d.title,
      strips: d.querySelectorAll('.strip').length,
      hexes,
      /* The ink decision per strip. Storing the whole style attribute made the golden
       * ~880 bytes a step and drowned real diffs, so this keeps the part a human needs
       * (which --on won) plus a short hash of the rest: any change to --hover or --sh
       * still shows up, without spelling it out 98 times. */
      inks: [...d.querySelectorAll('.strip')].map((e) => {
        const st = e.getAttribute('style') || '';
        const on = (st.match(/--on:([^;]+)/) || [, '?'])[1];
        return on + ':' + short(st).slice(0, 6);
      }).join(','),
      clones: d.querySelectorAll('.swap-clone').length,
      overlays: d.querySelectorAll('.overlay.open').length,
      menus: d.querySelectorAll('.menu.open').length,
      undoDisabled: d.getElementById('undoBtn').disabled,
      generateDisabled: d.getElementById('generateBtn').disabled,
      paletteName: d.getElementById('paletteNameLabel').textContent,
      chrome: [
        d.getElementById('savedBtn').innerHTML,
        d.getElementById('themeBtn').innerHTML,
        (d.querySelector('#dock [data-dock="lockToggle"]') || {}).innerHTML,
      ].map(short).join(','),
    });
  }

  /* whole-panel outputs, which are more useful verbatim than as a hash */
  const panels = {
    visionRows: d.getElementById('visionRows').innerHTML,
    savedList: d.getElementById('savedList').innerHTML,
    exportLink: d.getElementById('expLink').value,
    exportCss: d.getElementById('expCss').textContent,
    exportHex: d.getElementById('expHex').value,
    swatches: d.getElementById('expSwatches').innerHTML,
    hash: w.location.hash,
    storageKeys: Object.keys(w.localStorage).sort(),
  };
  /* jsdom implements neither canvas nor the Clipboard API; those two are expected and
   * identical on every revision, so they are normalised rather than ignored -- a new
   * error still fails the run. */
  const realErrors = errors.filter((e) => !/HTMLCanvasElement's getContext/.test(e));
  w.close();
  return { steps, panels, errors: realErrors, expectedJsdomGaps: errors.length - realErrors.length };
}

/* ---------- compare ---------- */
function diffReport(got, want) {
  const out = [];
  if (JSON.stringify(got.errors) !== JSON.stringify(want.errors)) {
    out.push(`errors:\n    got  ${JSON.stringify(got.errors)}\n    want ${JSON.stringify(want.errors)}`);
  }
  for (const k of Object.keys(want.panels)) {
    if (JSON.stringify(got.panels[k]) !== JSON.stringify(want.panels[k])) {
      out.push(`panel ${k}:\n    got  ${JSON.stringify(got.panels[k]).slice(0, 300)}\n    want ${JSON.stringify(want.panels[k]).slice(0, 300)}`);
    }
  }
  const n = Math.max(got.steps.length, want.steps.length);
  for (let i = 0; i < n; i++) {
    const g = got.steps[i], x = want.steps[i];
    if (!g || !x) { out.push(`step ${i}: present in one run only (${g ? 'got' : 'want'})`); continue; }
    for (const f of Object.keys(x)) {
      if (JSON.stringify(g[f]) !== JSON.stringify(x[f])) {
        out.push(`step ${i + 1} "${x.name}" field "${f}":\n    got  ${JSON.stringify(g[f]).slice(0, 300)}\n    want ${JSON.stringify(x[f]).slice(0, 300)}`);
      }
    }
  }
  return out;
}

(async () => {
  const got = await runSession();
  console.log(`ran ${got.steps.length} interaction steps against a real DOM`);

  if (UPDATE) {
    fs.writeFileSync(GOLDEN, JSON.stringify(got, null, 1) + '\n');
    console.log(`UPDATE wrote ${path.relative(ROOT, GOLDEN)} — read the diff before committing it`);
    return;
  }
  if (!fs.existsSync(GOLDEN)) {
    console.log(`FAIL no golden file at ${path.relative(ROOT, GOLDEN)} — run: node dev/domtest.js --update`);
    process.exit(1);
  }
  const want = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  const diffs = diffReport(got, want);
  if (!diffs.length) {
    console.log(`GOLDEN MATCH ✓  ${got.steps.length} steps, ${Object.keys(got.panels).length} panels, ${got.errors.length} errors`);
    return;
  }
  console.log(`GOLDEN MISMATCH ✗  ${diffs.length} difference(s):`);
  diffs.slice(0, 25).forEach((x) => console.log('  - ' + x));
  if (diffs.length > 25) console.log(`  … and ${diffs.length - 25} more`);
  console.log('\nIf this change was intended, regenerate with: node dev/domtest.js --update');
  process.exit(1);
})();
