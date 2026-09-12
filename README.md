# opencolors 🎨

A free-forever palette maker in a **single HTML file**: no accounts, no paywall, no tracking, no build. Open it and make palettes.

**Try it:** press `Space` to generate, click any hex to copy it.

## Features

- Fast palette generator (8 themes: random, pastel, vivid, warm, cool, light, dark, mono)
- Lock, copy, adjust, swap, sort
- Create from an image, from a word ("ocean", "matcha", …), or from open source presets
- 1,030 color names (from public-domain xkcd survey)
- Contrast checker (WCAG), color-vision simulator, full edit panel with shades
- Save palettes locally, export link / CSS / Tailwind / SCSS / JSON / SVG / gradient / PNG
- Keyboard-first: `Space` generate · `L` lock · `←` `→` reorder · `Ctrl Z` undo
- Mobile-friendly with collapsible toolbar

## Quick start

Just open `index.html` in a browser. Or serve it:

```sh
cd opencolors && python3 -m http.server 8000
# → http://localhost:8000
```

## Deploy to GitHub Pages

One static file, zero backend.

1. Push this folder as your repo root (or into `docs/`).
2. GitHub → **Settings → Pages → Deploy from a branch** → `main` / `(root)` (or `/docs`).
3. Done! your site is live at `https://<you>.github.io/<repo>/`.

Share links, PNG export, and saved palettes all work the same once hosted.

## Tests

Four tools, each covering what the others cannot:

```sh
node dev/harness.js   #  64 functional smoke tests — app logic against a stub DOM
node dev/domtest.js   #  98 interaction steps      — real DOM (jsdom), golden snapshot
node dev/audit.js     #  74 contrast / a11y / heuristic checks
python3 dev/uitest.py #  88 real-browser checks    — layout and pixels (Playwright)
```

`harness.js` and `audit.js` need nothing but node. The other two skip cleanly — a
`SKIP` line and exit 0 — when their optional dependency is missing, so the suite is
always runnable:

| tool | optional dependency | if absent |
| --- | --- | --- |
| `domtest.js` | `npm install jsdom` | the whole file skips |
| `uitest.py` | `pip install playwright && playwright install chromium` | the whole file skips |
| `uitest.py` | `pip install pillow` | only the one pixel-sampling check skips |

### The golden snapshot

`domtest.js` loads `index.html` into a real DOM, clicks through a scripted session and
compares every step against `dev/domtest.golden.json`. `Math.random` and `Date.now` are
pinned, so a diff is always a real difference and never noise. After an *intended*
behaviour change, regenerate it and read the diff before committing:

```sh
node dev/domtest.js --update
```

## Project layout

```
index.html               # the entire app (HTML + CSS + JS, self-contained)
dev/
  appenv.js              # shared loader: runs index.html's script against a stub DOM
  harness.js, tests.js   # functional smoke tests, using appenv
  domtest.js             # scripted real-DOM session (jsdom)
  domtest.golden.json    # the snapshot domtest.js compares against
  audit.js               # static/computed accessibility audit, using appenv
  uitest.py              # Playwright click-through; screenshots go to dev/review/
```

`appenv.js` is what lets `harness.js` and `audit.js` test the app's real `genHex`,
`pickText` and friends instead of a copy that can silently drift from it.

## Credits

Icons are [Feather Icons](https://feathericons.com) (MIT). Starter presets are the top 20 sets from [nice-color-palettes](https://github.com/Jam3/nice-color-palettes) (MIT). Color names blend an original dictionary with the public-domain xkcd color survey (CC0). Vision simulation uses [libDaltonLens](https://github.com/DaltonLens/libDaltonLens) matrices (public domain). Everything else is original.

## License

MIT — see [LICENSE](LICENSE).
