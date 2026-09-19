'use strict';
/* opencolors usability audit — contrast, accessibility and heuristic checks.
 *
 * Usage: node dev/audit.js     (exit code 1 if any check fails)
 *
 * Two kinds of check live here, and the split is deliberate:
 *
 *   MEASURING is independent. The WCAG luminance/contrast maths below is written out
 *   here rather than imported from the app, because an audit that grades the app with
 *   the app's own ruler cannot catch a bug in that ruler.
 *
 *   SAMPLING is imported. Which colours the app can generate, and which ink it puts on
 *   them, come from the real genHex()/pickText() via dev/appenv.js. Duplicating those
 *   is what let this file drift out of sync once already — it was auditing a 'warm'
 *   hue range of 300-360 and a 'light' saturation of 28-60 that the app had long
 *   since changed to 335-360 and 36-64.
 *
 * The heuristic checks are intentionally literal: they are regression guards for
 * specific decisions, so they assert on the exact source they protect.
 */
const { readHtml, readCss, readJs, makeDom, run } = require('./appenv');

const html = readHtml();
const css = readCss();
const js = readJs();

let pass = 0, fail = 0;
function t(name, ok, detail = '') {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

/* Load the app far enough to borrow its generator. The first-run hint is marked as
 * seen so its toast timers don't hold the process open. */
const dom = makeDom();
dom.localStorage.setItem('oc.seenHint', '1');
const app = run('return { genHex, pickText, INK_LIGHT, INK_DARK, GEN_THEMES };', dom);

/* ---------- independent WCAG colour maths ---------- */
const h2r = (h) => {
  h = h.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/* composite a possibly-translucent foreground over an opaque background */
const over = (fg, bg) => {
  const a = fg[3] ?? 1;
  return [0, 1, 2].map((i) => Math.round(fg[i] * a + bg[i] * (1 - a)));
};
const col = (s) => {
  s = s.trim();
  if (s[0] === '#') return [...h2r(s), 1];
  const p = s.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number);
  return [p[0], p[1], p[2], p[3] ?? 1];
};

/* the :root custom properties, so chrome colours can be graded by name */
const V = {};
css.match(/:root\{([\s\S]*?)\}/)[1].split(';').forEach((l) => {
  const m = l.match(/(--[\w-]+):(.+)/);
  if (m) V[m[1].trim()] = m[2].trim();
});
const WHITE = [255, 255, 255];
const eff = (v, bg = WHITE) => over(col(V[v]), bg);

/* contrast of a foreground against a background; either may be a --var or a hex */
function cc(name, fg, bg, min, behind = WHITE) {
  const f = fg.startsWith('--') ? eff(fg, behind) : h2r(fg);
  const b = bg.startsWith('--') ? eff(bg, behind) : h2r(bg);
  const r = ratio(f, b);
  t(`${name}: ${r.toFixed(2)}:1 (needs ${min})`, r >= min);
}

console.log('--- UI chrome contrast (WCAG AA) ---');
cc('ink on header button', '--ink', '--chrome-2', 4.5);
cc('muted on header button', '--muted', '--chrome-2', 4.5);
cc('primary button text', '--accent-ink', '--accent', 4.5);
cc('badge text on pill', '--muted', '--pill', 4.5);
cc('menu text on surface', '--ink', '--surface', 4.5);
cc('toast text over white', '--toast-fg', '--toast-bg', 4.5);
cc('toast text over pure red', '--toast-fg', '--toast-bg', 4.5, [255, 0, 0]);
cc('toast text over yellow', '--toast-fg', '--toast-bg', 4.5, [255, 235, 59]);
cc('input text', '--ink', '--input-bg', 4.5);
cc('white icon on pop blue', 'ffffff', '0066FF', 3);

console.log('--- strip text contrast (20000 generated colors) ---');
/* Two inks cannot cover every background. A colour whose relative luminance falls
 * between the two crossovers misses 4.5:1 against BOTH #ffffff and #141414, so the
 * flat "fails < 2%" bar this file used to carry was unreachable by construction — it
 * was red from the very first commit, and it hid a genuine picker bug behind a
 * failure everyone had learned to ignore. Assert what is actually guaranteed:
 *
 *   - large hex text clears 3:1 for every colour the app can generate;
 *   - the picker always takes the stronger of the two inks;
 *   - every colour that misses 4.5:1 misses it with BOTH inks, so it is a limit of
 *     having two inks rather than a wrong choice by the picker.
 *
 * Grading uses this file's own maths against the app's own ink constants, so a
 * regression in pickText() resurfaces immediately as an "avoidable" miss. */
const MODES = app.GEN_THEMES.map((x) => x.id);
const INKS = [app.INK_LIGHT, app.INK_DARK].map(h2r);
const N = 20000;
let bigFails = 0, smallFails = 0, avoidable = 0, worst = Infinity, choseBest = true;
for (let i = 0; i < N; i++) {
  const hx = app.genHex(MODES[i % MODES.length], (i * 47) % 360);
  const bg = h2r(hx);
  const got = ratio(h2r(app.pickText(hx)), bg);
  const best = Math.max(...INKS.map((ink) => ratio(ink, bg)));
  if (got < best - 1e-9) choseBest = false;
  if (got < 3) bigFails++;
  if (got < 4.5) { smallFails++; if (best >= 4.5) avoidable++; }
  if (got < worst) worst = got;
}
console.log(`INFO sampling app genHex() over ${MODES.length} themes: ${MODES.join(', ')}`);
console.log(`INFO inks ${app.INK_LIGHT} / ${app.INK_DARK}, worst small-text ratio ${worst.toFixed(2)}:1`);
console.log(`INFO small text misses 4.5:1 on ${(100 * smallFails / N).toFixed(2)}% of colors — the two-ink floor, ${avoidable} of them avoidable`);
t(`large hex text ≥3:1 (${bigFails}/${N} fail)`, bigFails === 0);
t('text picker always takes the stronger ink', choseBest);
t(`every 4.5:1 miss is beyond both inks (${avoidable} avoidable)`, avoidable === 0);

console.log('--- heuristics / robustness ---');
/* layout & mobile */
t('100dvh for mobile browser chrome', css.includes('100dvh'));
t('touch-action set (no double-tap zoom)', css.includes('touch-action'));
t('strips disable text selection', /strip[^{]*\{[^}]*user-select\s*:\s*none/.test(css));
t('adder visible on touch (hover:none)', /hover\s*:\s*none[\s\S]{0,200}\.adder/.test(css));
t('controls always visible on mobile (max-width)', /max-width:720px[\s\S]*?\.actions button\{[^}]*opacity:\.95/.test(css) && /max-width:720px[\s\S]*?\.adder button\{[^}]*opacity:1/.test(css) && /max-width:720px[\s\S]*?\.swapper button\{[^}]*opacity:1/.test(css));
t('lang attribute', /<html lang=/.test(html));
t('viewport meta', /name="viewport"/.test(html));
t('swap icon rotates on mobile (vertical strips)', /max-width:720px[\s\S]*?\.swapper button svg\{[^}]*rotate\(90deg\)/.test(css));
t('editing strip fits editor on mobile', /max-width:720px[\s\S]*?\.strip\.editing\{[^}]*flex:none/.test(css) && /max-width:720px[\s\S]*?\.edit-panel\{[^}]*max-height:none/.test(css));
t('edit open/close glides height', /animateHeight\(stripEl,startH,stripEl\.offsetHeight,320\)/.test(js) && /animateHeight\(stripEl,startH,stripEl\.offsetHeight,260\)/.test(js));
t('hex bubble clamped to slice', /container-type:inline-size/.test(html) && /@container \(max-width:80px\)/.test(html));

/* accessibility */
const ariaN = (html.match(/<button[^>]*aria-label/g) || []).length;
t(`aria-labels on buttons (${ariaN} found, need 8+)`, ariaN >= 8);
t('focus-visible styling', css.includes(':focus-visible'));
t('disabled strip buttons stay hidden', /\.actions button:disabled\{visibility:hidden\}/.test(html));
t('reduced-motion support', /prefers-reduced-motion/.test(html));
t('moves respect reduced motion', (html.match(/prefers-reduced-motion/g) || []).length >= 2);
t('names wrap', /\.cname\{[\s\S]*?white-space:normal/.test(html));
t('no native tooltip on hex', !/title="Click to copy"/.test(html));

/* keyboard */
t('esc closes modals', js.includes("e.key==='Escape'"));
t('keyboard shortcuts wired (L + arrows)', /stripIndexFromFocus/.test(html));
t('number keys lock strips', /e\.key>='1'&&e\.key<='9'/.test(html));
t('c copies focused color', /e\.key==='c'\|\|e\.key==='C'/.test(html));
t('space kbd hint exists', /<kbd class="key">Space<\/kbd>/.test(html));
t('shortcuts overlay exists', /id="keysOverlay"/.test(html));

/* strips: rendering, editing, reordering */
t('strip content above adder zone', /\.strip-inner\{[^}]*z-index:6/.test(html));
t('adder hover is hover-capable only', /@media \(hover:hover\)\{\.adder button:hover/.test(html));
t('strip hovers not sticky on touch', /@media \(hover:hover\)\{\.hex:hover/.test(html) && /@media \(hover:hover\)\{\.actions button/.test(html));
t('smart add blends neighbors', /blendHex\(colors\[i-1\]\.hex/.test(html));
t('mouse add steals no focus', /e\.detail===0/.test(html));
t('max 9 colors', /const MAX_COLORS = 9;/.test(html));
t('legacy long links clamp', /\.slice\(0,MAX_COLORS\)/.test(html));
t('200+ color names', (html.split('const NAMED=[')[1].split('].map')[0].match(/\['[A-Za-z]+','[0-9a-f]{6}'\]/g) || []).length >= 200);
t('edit is inline', /class="edit-panel"/.test(html));
t('edit modal deleted', !/id="editOverlay"/.test(html));
t('editing stretches column', /\.strip\.editing\{flex-grow:2\.6\}/.test(html));
t('inline edit keeps + cancels', /function inlineDone/.test(html) && /function inlineCancel/.test(html));
t('no duplicative copy button', !/title="Copy hex"/.test(html));
t('mobile tabs show labels', /max-width:720px[\s\S]*?\.toolset \.btn \.lbl\{[^}]*display:inline/.test(css));
t('mobile text inputs dodge iOS auto-zoom', /#paletteNameInput,\.word-row input,\.exp-row input\{font-size:16px\}/.test(css));
t('toasts announced to screen readers', /id="toasts" role="status"/.test(html));
t('color names at full opacity', /\.cname\{[^}]*opacity:1;/.test(css));
t('mobile tabs centered but scroll-safe', /\.toolset::before,\.toolset::after\{content:'';margin:auto\}/.test(css));
t('dock buttons labeled everywhere', /'lockToggle','lock','Lock'/.test(html) && /#dock button \.lbl\{display:inline/.test(css) && !/#dock button \.lbl\{display:none\}/.test(css));
t('editing siblings keep size on mobile', /max-width:720px[\s\S]*?main\.editing \.strip:not\(\.editing\)\{[^}]*flex:none/.test(css));
t('edit panel exits via Done only', !/ep-head/.test(html) && !/ep-x/.test(html) && /data-pact="done"/.test(html));
t('widening animates', /flex-grow \.3s ease/.test(html));
t('strip moves animate', /function moveStrip/.test(html));
t('swap uses clones (no white flash)', /swap-clone/.test(html));
t('clones carry full strip content', /cloneNode\(true\)/.test(html));
t('strip stack layout', /\[data-action="remove"\]\{order:1/.test(html));
t('gap swap button', /class="swapper" data-action="swap"/.test(html) && /act==='swap'/.test(html));

/* generation, menus & modals */
t('generate disables when locked', /generateBtn'\)\.disabled=/.test(html));
t('all-locked generate guard', js.includes('Everything is locked'));
t('surprise randomizes theme', /genTheme=GEN_THEMES\[rndInt\(0,GEN_THEMES\.length-1\)\]/.test(html));
t('redo exists', /function redo\(\)/.test(html));
t('menus flip into viewport', /function placeMenu/.test(html));
t('theme/new icons picked', /\n  aperture:'</.test(html) && /\n  zap:'</.test(html));
t('droplet hue icon (feather)', /droplet:'<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z/.test(html));
t('remix dock exists', /id="dock"/.test(html));
t('dock locks all', /data-dock="lockToggle"/.test(html));
t('no overflow menu', !/id="moreBtn"/.test(html));
t('generate is flat (no gloss)', !/255,255,255,\.16\),rgba\(255,255,255,0\) 55%/.test(html));
t('image modal resets on open', js.includes("imgUse').disabled=true"));
t('export link file://-safe', js.includes("location.href.split('#')[0]"));
t('first-run hint once', /oc\.seenHint/.test(html));
t('free pill opens about', /freePill/.test(html));
t('about links shortcuts', /id="aboutKeysBtn"/.test(html));
t('brettel-vienot vision', /BRETTEL_TRITAN_SEP/.test(html) && /VIENOT_DEUTAN/.test(html));

/* attribution */
t('Feather icons attributed', /Feather Icons/.test(html));
t('preset source linked', /github\.com\/Jam3\/nice-color-palettes/.test(html));
t('open sources credited', /xkcd color survey/.test(html));

/* ---------- touch targets (informational) ---------- */
console.log('--- touch targets (WCAG ≥24px, Apple HIG ≥44px) ---');
const seen = new Set();
for (const m of css.matchAll(/([^{}]+)\{\s*width:(\d+)px;height:(\d+)px/g)) {
  const sel = m[1].trim().split('\n').pop().trim(), w = +m[2], h = +m[3];
  if (seen.has(sel)) continue;
  seen.add(sel);
  const verdict = Math.min(w, h) >= 44 ? 'HIG-OK' : Math.min(w, h) >= 24 ? 'WCAG-only' : 'TOO-SMALL';
  console.log(`INFO  ${sel}: ${w}x${h} → ${verdict}`);
}

console.log(`---\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
