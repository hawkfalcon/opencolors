// opencolors usability audit — static + computed checks (node, no deps)
// Usage: node dev/audit.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = html.match(/<style>([\s\S]*)<\/style>/)[1];
const js = html.match(/<script>([\s\S]*)<\/script>/)[1];
let pass = 0, fail = 0;
function t(name, ok, detail = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

// ---------- color math ----------
const h2r = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const over = (fg, bg) => { const a = fg[3] ?? 1; return [0, 1, 2].map(i => Math.round(fg[i] * a + bg[i] * (1 - a))); };
function col(s) { s = s.trim(); if (s[0] === '#') return [...h2r(s), 1]; const p = s.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
const V = {};
css.match(/:root\{([\s\S]*?)\}/)[1].split(';').forEach(l => { const m = l.match(/(--[\w-]+):(.+)/); if (m) V[m[1].trim()] = m[2].trim(); });
const WHITE = [255, 255, 255];
const eff = (v, bg = WHITE) => over(col(V[v]), bg);
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

// ---------- strip text simulation ----------
console.log('--- strip text contrast (4000 generated colors) ---');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const x = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return x(f(0)) + x(f(8)) + x(f(4));
}
function genHex(mode, baseHue) {
  switch (mode) {
    case 'pastel': return hslToHex(rnd(0, 360), rnd(45, 68), rnd(76, 88));
    case 'vivid': return hslToHex(rnd(0, 360), rnd(82, 100), rnd(46, 60));
    case 'warm': return hslToHex(Math.random() < .7 ? rnd(0, 55) : rnd(300, 360), rnd(55, 88), rnd(45, 64));
    case 'cool': return hslToHex(rnd(150, 255), rnd(45, 78), rnd(40, 66));
    case 'light': return hslToHex(rnd(0, 360), rnd(28, 60), rnd(72, 90));
    case 'dark': return hslToHex(rnd(0, 360), rnd(28, 62), rnd(16, 36));
    case 'mono': return hslToHex(baseHue + rnd(-9, 9), rnd(30, 80), rnd(20, 86));
    default: return hslToHex(rnd(0, 360), rnd(42, 82), rnd(30, 76));
  }
}
const MODES = ['random', 'pastel', 'vivid', 'warm', 'cool', 'light', 'dark', 'mono'];
const usesBest = js.includes('function pickText');
const choose = usesBest
  ? (hex => { const L = lum(h2r(hex)); return (1.05 / (L + .05)) >= ((L + .05) / .05) ? 'ffffff' : '141414'; })
  : (hex => lum(h2r(hex)) > 0.38 ? '141414' : 'ffffff');
console.log(`INFO text rule in app: ${usesBest ? 'max-contrast (optimal)' : 'fixed 0.38 threshold'}`);
let hexFails = 0, nameFails = 0; const N = 4000;
for (let i = 0; i < N; i++) {
  const hx = genHex(MODES[i % 8], (i * 47) % 360), bg = h2r(hx);
  const r = ratio(h2r(choose(hx)), bg);
  if (r < 3) hexFails++;
  if (r < 4.5) nameFails++;
}
t(`big hex text ≥3:1 fails ${(100 * hexFails / N).toFixed(1)}%`, hexFails / N < 0.02);
t(`small name text ≥4.5:1 fails ${(100 * nameFails / N).toFixed(1)}%`, nameFails / N < 0.02);

// ---------- heuristic static checks ----------
console.log('--- heuristics / robustness ---');
t('100dvh for mobile browser chrome', css.includes('100dvh'));
t('touch-action set (no double-tap zoom)', css.includes('touch-action'));
t('strips disable text selection', /strip[^{]*\{[^}]*user-select\s*:\s*none/.test(css));
const ariaN = (html.match(/<button[^>]*aria-label/g) || []).length;
t(`aria-labels on buttons (${ariaN} found, need 8+)`, ariaN >= 8);
t('adder visible on touch (hover:none)', /hover\s*:\s*none[\s\S]{0,200}\.adder/.test(css));
t('export link file://-safe', js.includes("location.href.split('#')[0]"));
t('all-locked generate guard', js.includes('Everything is locked'));
t('image modal resets on open', js.includes("imgUse').disabled=true"));
t('lang attribute', /<html lang=/.test(html));
t('viewport meta', /name="viewport"/.test(html));
t('focus-visible styling', css.includes(':focus-visible'));
t('esc closes modals', js.includes("e.key==='Escape'"));
t("mobile toolbar toggle exists", /id="toolsToggle"/.test(html));
t("keyboard shortcuts wired (L + arrows)", /stripIndexFromFocus/.test(html));
t("disabled strip buttons stay hidden", /\.actions button:disabled\{visibility:hidden\}/.test(html));
t('200+ color names', (html.split("const NAMED=[")[1].split("].map")[0].match(/\['[A-Za-z]+','[0-9a-f]{6}'\]/g)||[]).length>=200);
t('smart add blends neighbors', /blendHex\(colors\[i-1\]\.hex/.test(html));
t('Feather icons attributed', /Feather Icons/.test(html));
t('reduced-motion support', /prefers-reduced-motion/.test(html));
t('surprise randomizes theme', /genTheme=GEN_THEMES\[rndInt\(0,GEN_THEMES\.length-1\)\]/.test(html));
t('space kbd hint exists', /<kbd class="key">Space<\/kbd>/.test(html));
t("theme/new icons picked", /\n  aperture:'</.test(html) && /\n  zap:'</.test(html));
t('menus flip into viewport', /function placeMenu/.test(html));
t('shortcuts overlay exists', /id="keysOverlay"/.test(html));
t('first-run hint once', /oc\.seenHint/.test(html));
t('free pill opens about', /freePill/.test(html));
t('strip content above adder zone', /\.strip-inner\{[^}]*z-index:6/.test(html));
t('adder hover is hover-capable only', /@media \(hover:hover\)\{\.adder button:hover/.test(html));
t('strip hovers not sticky on touch', /@media \(hover:hover\)\{\.hex:hover/.test(html) && /@media \(hover:hover\)\{\.actions button/.test(html));
t('redo exists', /function redo\(\)/.test(html));
t('number keys lock strips', /e\.key>='1'&&e\.key<='9'/.test(html));
t('c copies focused color', /e\.key==='c'\|\|e\.key==='C'/.test(html));
t('generate disables when locked', /generateBtn'\)\.disabled=/.test(html));
t('hex bubble clamped to slice', /container-type:inline-size/.test(html) && /@container \(max-width:80px\)/.test(html));
t('no native tooltip on hex', !/title="Click to copy"/.test(html));
t('max 9 colors', /const MAX_COLORS = 9;/.test(html));
t('legacy long links clamp', /\.slice\(0,MAX_COLORS\)/.test(html));
t('mouse add steals no focus', /e\.detail===0/.test(html));
t('edit is inline', /class="edit-panel"/.test(html));
t('edit modal deleted', !/id="editOverlay"/.test(html));
t('editing stretches column', /\.strip\.editing\{flex-grow:2\.6\}/.test(html));
t('inline edit keeps + cancels', /function inlineDone/.test(html) && /function inlineCancel/.test(html));
t('no duplicative copy button', !/title="Copy hex"/.test(html));
t('edit panel is chromeless', !/ep-head/.test(html) && /class="ep-x"/.test(html));
t('widening animates', /flex-grow \.3s ease/.test(html));
t('strip moves animate', /function moveStrip/.test(html));
t('swap uses clones (no white flash)', /swap-clone/.test(html));
t('clones carry full strip content', /cloneNode\(true\)/.test(html));
t('remix dock exists', /id="dock"/.test(html));
t('generate is flat (no gloss)', !/255,255,255,\.16\),rgba\(255,255,255,0\) 55%/.test(html));
t('no overflow menu', !/id="moreBtn"/.test(html));
t('about links shortcuts', /id="aboutKeysBtn"/.test(html));
t('droplet hue icon (feather)', /droplet:'<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z/.test(html));
t('preset source linked', /github\.com\/Jam3\/nice-color-palettes/.test(html));
t('brettel-vienot vision', /BRETTEL_TRITAN_SEP/.test(html) && /VIENOT_DEUTAN/.test(html));
t('strip stack layout', /\[data-action="remove"\]\{order:1/.test(html));
t('gap swap button', /class="swapper" data-action="swap"/.test(html) && /act==='swap'/.test(html));
t('dock locks all', /data-dock="lockToggle"/.test(html));
t('open sources credited', /xkcd color survey/.test(html));
t('names wrap', /\.cname\{[\s\S]*?white-space:normal/.test(html));
t('moves respect reduced motion', (html.match(/prefers-reduced-motion/g)||[]).length>=2);

// ---------- touch targets ----------
console.log('--- touch targets (WCAG ≥24px, Apple HIG ≥44px) ---');
const seen = new Set();
for (const m of css.matchAll(/([^{}]+)\{\s*width:(\d+)px;height:(\d+)px/g)) {
  const sel = m[1].trim().split('\n').pop().trim(), w = +m[2], h = +m[3];
  if (seen.has(sel)) continue; seen.add(sel);
  const verdict = Math.min(w, h) >= 44 ? 'HIG-OK' : Math.min(w, h) >= 24 ? 'WCAG-only' : 'TOO-SMALL';
  console.log(`INFO  ${sel}: ${w}x${h} → ${verdict}`);
}
console.log(`---\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
