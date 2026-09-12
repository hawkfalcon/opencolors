/* Functional smoke tests for the app's own globals.
 *
 * Not a module: harness.js evaluates this file in the same function scope as
 * index.html's <script> (see appenv.run), so every app global is already in scope and
 * nothing needs importing. Run it with:  node dev/harness.js
 *
 * The order is load-bearing. Most of these read the palette state that earlier ones
 * leave behind -- generate, sort, lock, edit, move and undo all mutate `colors` -- so
 * keep the sequence intact and append new checks at the end.
 */
let __n = 0;
function t(name, cond) {
  __n++;
  if (cond) console.log('PASS ' + name);
  else { console.error('FAIL ' + name); process.exitCode = 1; }
}

/* Small predicates, so an assertion reads as the property it checks rather than as
 * the loop that computes it. */
const isHex = (s) => /^[0-9a-f]{6}$/.test(s);
const hexSeq = () => colors.map((c) => c.hex).join();
const hues = () => colors.map((c) => hexToHsl(c.hex).h);
const lights = () => colors.map((c) => hexToHsl(c.hex).l);
const ascending = (xs) => xs.every((v, i) => i === 0 || xs[i - 1] <= v);
const descending = (xs) => xs.every((v, i) => i === 0 || xs[i - 1] >= v);
/* hue is circular, so 359 is one degree from 0 */
const hueNear = (h, target, tol) => {
  const d = Math.abs(h - target);
  return Math.min(d, 360 - d) < tol;
};
/* widest single-channel gap: enough to say "this barely moved" without exact equality */
const maxChannelDelta = (a, b) => Math.max(...[0, 2, 4].map(
  (i) => Math.abs(parseInt(a.substr(i, 2), 16) - parseInt(b.substr(i, 2), 16))
));

/* ---------- colour maths ---------- */
const roundTripped = hexToHsl('2a9d8f');
t('hsl roundtrip', isHex(hslToHex(roundTripped.h, roundTripped.s, roundTripped.l)));
const blackWhite = contrastRatio('000000', 'ffffff');
t('black/white contrast ~21', blackWhite > 20.9 && blackWhite < 21.1);
t('onColor picks', onColor('ffffff') === '#141414' && onColor('000000') === '#ffffff');
t('colorName', typeof colorName('ff0000') === 'string' && colorName('ff0000').length > 0);

/* ---------- generation ---------- */
const GEN_MODES = ['random', 'pastel', 'vivid', 'warm', 'cool', 'light', 'dark', 'mono'];
for (const genMode of GEN_MODES) t('genHex ' + genMode, isHex(genHex(genMode, 200)));
t('mono hue-ish', hueNear(hexToHsl(genHex('mono', 200)).h, 200, 25));
t('defaults loaded', colors.length === 5 && colors.every((c) => isHex(c.hex)));

generate();
t('generate keeps count', colors.length === 5);
t('paletteName set', typeof paletteName === 'string' && paletteName.includes(' '));
t('randName shape', randName().split(' ').length === 2);
t('slug', slug('Velvet Lagoon!') === 'velvet-lagoon');

/* ---------- undo / redo ---------- */
const beforeGenerate = hexSeq();
generate();
const afterGenerate = hexSeq();
undo();
t('undo restores', hexSeq() === beforeGenerate);
redo();
t('redo restores', hexSeq() === afterGenerate);

/* ---------- remix: sorting and locking ---------- */
pushHistory();
moreAction('sortHue');
t('sortHue sorted', ascending(hues()));

moreAction('reverse'); moreAction('shuffle'); moreAction('sortLight');
t('sortLight lightest-first', descending(lights()));

/* a locked strip must not be dragged out of place by a sort */
const pinnedHex = colors[2].hex;
colors[2].locked = true;
moreAction('sortHue');
t('sort pins locked strips', colors[2].hex === pinnedHex);

moreAction('lockToggle');
t('lock-all locks all', colors.every((c) => c.locked));
moreAction('lockToggle');
t('lock-all unlocks all', colors.every((c) => !c.locked));

colors[2].locked = false;
moreAction('sortHue');
t('sortHue toggles back', ascending(hues()));
/* repeating a sort reverses it, so this one runs the other way round */
moreAction('sortLight');
t('sortLight toggles', ascending(lights()));
t('remix keeps colors', colors.length === 5 && colors.every((c) => isHex(c.hex)));

/* ---------- word-seeded palettes ---------- */
const oceanA = paletteFromWord('ocean', 5), oceanB = paletteFromWord('ocean', 5);
t('word deterministic', oceanA.join() === oceanB.join());
t('word valid hex', oceanA.every(isHex));
t('ocean is blue', oceanA.every((hex) => {
  const h = hexToHsl(hex).h;
  return h > 170 && h < 240;
}));
t('multi-word', paletteFromWord('neon desert', 7).length === 7);
t('empty word', paletteFromWord('', 4).length === 4);

/* ---------- colour-vision simulation ---------- */
for (const [label, key] of VISION) t('vision ' + label.split(' ')[0], isHex(simulateVision('ff6b6b', key)));

/* ---------- export builders ---------- */
const tailwind = buildTailwind();
t('tailwind', tailwind.includes('theme.extend.colors') && tailwind.includes('#'));
const scss = buildScss();
t('scss', scss.split('\n').length === colors.length && scss.startsWith('$'));
t('json', JSON.parse(buildJson()).colors.length === colors.length);
t('gradient', buildGradient().startsWith('background: linear-gradient'));
const svg = buildSvg();
t('svg', svg.startsWith('<svg') && svg.endsWith('</svg>'));

/* ---------- palette loading ---------- */
setPalette(['ff0000', '00ff00', '0000ff', 'ffff00', 'ff00ff', '00ffff', '123456', 'abcdef', '111111', '222222']);
t('setPalette clamps to 9', colors.length === 9);
setPalette(['ff0000']);
t('setPalette pads to 2', colors.length === 2);

/* ---------- shipped data tables ---------- */
t('MOOD entries valid', Object.values(MOOD).every((v) => Array.isArray(v) && v.length === 4));
t('PRESETS valid', PRESETS.length === 20 && PRESETS.every((p) => p.colors.length === 5 && p.colors.every(isHex)));
t('genTheme default', genTheme === 'random' && GEN_THEMES.length === 8);

/* ---------- naming ---------- */
t('colorName basics', colorName('ff0000') === 'Red' && colorName('0000ff') === 'Blue'
  && colorName('ffffff') === 'White' && colorName('000000') === 'Black');
t('name pool deep', NAMED.length > 800);
const taken = new Set(['Red']);
t('colorName dedupes', colorName('ff0000', taken) !== 'Red' && taken.size === 2);
t('NAMED has 200+ names', NAMED.length >= 200);

/* ---------- blending ---------- */
t('blendHex valid', isHex(blendHex('ff0000', '0000ff')) && isHex(blendHex('ffffff', '000000')));
t('blendHex midpoint', hueNear(hexToHsl(blendHex('ff0000', '0000ff')).h, 300, 15));
t('blendHex wraps hue', hueNear(hexToHsl(blendHex(hslToHex(350, 80, 50), hslToHex(10, 80, 50))).h, 0, 15));
t('blendHex grays stay gray', hexToHsl(blendHex('888888', 'bbbbbb')).s < 10);

/* ---------- inline edit session ---------- */
openEdit(0);
const backup0 = editBackup;
colors[0].hex = '123456';
inlineDone();
t('inline done keeps', colors[0].hex === '123456' && editIndex === -1);
undo();
t('inline session undoes once', colors[0].hex === backup0);

openEdit(1);
const backup1 = editBackup, undoDepth = undoStack.length;
colors[1].hex = 'abcdef';
inlineCancel();
/* cancelling must rewind the history entry openEdit pushed, not leave it behind */
t('inline cancel reverts clean', colors[1].hex === backup1 && undoStack.length === undoDepth - 1 && editIndex === -1);

/* ---------- moving strips ---------- */
const hex0 = colors[0].hex, hex1 = colors[1].hex;
moveStrip(0, 1);
t('moveStrip swaps', colors[0].hex === hex1 && colors[1].hex === hex0);

const lock0 = colors[0].locked, lock1 = colors[1].locked;
colors[0].locked = true; colors[1].locked = false;
moveStrip(0, 1);
t('move carries lock with color', colors[0].locked === false && colors[1].locked === true);
moveStrip(0, 1);
colors[0].locked = lock0; colors[1].locked = lock1;
undo();
t('move undo restores', colors[0].hex === hex0 && colors[1].hex === hex1);

/* ---------- vision golden values ---------- */
/* White and black have no hue to lose, so a simulation that shifts them is broken. */
t('vision preserves white/black', ['protan', 'deutan', 'tritan'].every((key) =>
  maxChannelDelta(simulateVision('ffffff', key), 'ffffff') <= 1 && simulateVision('000000', key) === '000000'));
t('vision goldens', simulateVision('ff0000', 'protan') === '5e5e0c'
  && simulateVision('ff0000', 'deutan') === '939300' && simulateVision('0000ff', 'tritan') === '006288');
t('achroma luminance', simulateAchroma('ffffff') === 'ffffff' && simulateAchroma('808080') === '808080'
  && simulateAchroma('00ff00') === 'dbdbdb');

console.log('---');
console.log(process.exitCode ? 'SMOKE FAILED' : `ALL ${__n} SMOKE TESTS PASSED`);
