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

```sh
node dev/audit.js     # contrast + accessibility + heuristic audit
node dev/harness.js   # 64 functional smoke tests
python3 dev/uitest.py # 88 real-browser checks (Playwright + Chromium)
```

Browser tests need Playwright (`pip install playwright` + `playwright install chromium`) and Chromium's system libraries on Linux.

## Project layout

```
index.html            # the entire app (HTML + CSS + JS, self-contained)
dev/
  audit.js            # static/computed accessibility audit
  harness.js, tests.js# fake-DOM functional smoke tests
  uitest.py           # Playwright click-through + screenshots
```

## Credits

Icons are [Feather Icons](https://feathericons.com) (MIT). Starter presets are the top 20 sets from [nice-color-palettes](https://github.com/Jam3/nice-color-palettes) (MIT). Color names blend an original dictionary with the public-domain xkcd color survey (CC0). Vision simulation uses [libDaltonLens](https://github.com/DaltonLens/libDaltonLens) matrices (public domain). Everything else is original.

## License

MIT — see [LICENSE](LICENSE).
