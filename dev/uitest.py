"""Real-browser click-through test (Playwright + Chromium headless).

Usage: python3 dev/uitest.py

Where the node tools check logic (dev/tests.js) or a scripted DOM session
(dev/domtest.js), this one drives the real thing: actual layout, actual pixels, actual
focus rings, across six viewports from 390px touch to 1440px desktop. It prints one
PASS/FAIL line per check, writes screenshots to dev/review/ for eyeballing, and exits
non-zero if anything failed.

Optional dependencies, both skipped rather than fatal:
  playwright  -- the whole file SKIPs (exit 0) when it is missing or Chromium will not
                 launch, so the suite stays runnable on a machine without a browser
  pillow      -- only the one pixel-sampling check SKIPs; everything else still runs

Checks are grouped into one function per area of the UI and run in a fixed order,
because they share a single page: later sections read the palette state earlier ones
leave behind. Keep the sequence in main() intact when adding a section.
"""
import colorsys
import io
import struct
import sys
import tempfile
import zlib
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('SKIP playwright not installed')
    sys.exit(0)

try:
    from PIL import Image
except ImportError:
    Image = None

ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / 'index.html').as_uri()
REVIEW = ROOT / 'dev' / 'review'
REVIEW.mkdir(parents=True, exist_ok=True)

# Eight-colour palette, used by the narrow-viewport sections to squeeze the strips.
H8 = 'ff6b4a-ffc93c-2ec4b6-3b82f6-7c5cf6-f472b6-a3e635-facc15'

RESULTS = []


def check(name, ok, extra=''):
    """Record and report one assertion."""
    RESULTS.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + (f' — {extra}' if extra and not ok else ''))


def open_menu(pg, btn, menu):
    pg.locator(f'#{btn}').click()
    pg.wait_for_timeout(200)
    return pg.locator(f'#{menu}.open').count() == 1


def hue_of(hex_text):
    s = hex_text.strip().lstrip('#')
    r, g, b = (int(s[i:i+2], 16)/255 for i in (0, 2, 4))
    return colorsys.rgb_to_hsv(r, g, b)[0]*360


def write_red_png(path):
    """A 64x64 solid-red PNG, written by hand so the image test needs no fixture."""
    w = h = 64
    raw = b''.join(b'\x00' + b'\xff\x00\x00' * w for _ in range(h))

    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    open(path, 'wb').write(
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw))
        + chunk(b'IEND', b'')
    )


# --------------------------------------------------------------------------- desktop

def desktop_layout(pg):
    pg.goto(URL)
    pg.wait_for_timeout(700)
    check('loads with 5 strips', pg.locator('.strip').count() == 5)
    hb = pg.locator('header').bounding_box()
    sb = pg.locator('.strip').first.bounding_box()
    check('floating header overlaps strips (desktop)', hb and sb and hb['y'] + hb['height'] > sb['y'],
          f"header bottom={hb['y'] + hb['height']:.0f} strip top={sb['y']:.0f}")
    check('toolbar toggle hidden on desktop', not pg.locator('#toolsToggle').is_visible())
    check('space kbd hint on generate', pg.locator('#generateBtn .key').is_visible())


def desktop_generate_and_lock(pg):
    h1 = pg.locator('.strip .hex').all_inner_texts()
    pg.keyboard.press('Space')
    pg.wait_for_timeout(350)
    h2 = pg.locator('.strip .hex').all_inner_texts()
    check('spacebar generates', h1 != h2)
    pg.locator('.strip').nth(0).hover()
    pg.locator('.strip').nth(0).locator('[data-action="lock"]').click()
    pg.keyboard.press('Space')
    pg.wait_for_timeout(350)
    h3 = pg.locator('.strip .hex').all_inner_texts()
    check('locked color holds', h3[0] == h2[0] and h3[1:] != h2[1:])
    pg.locator('.strip').nth(2).locator('.hex').focus()
    pg.keyboard.press('l')
    check('L locks focused strip', 'active' in (pg.locator('.strip').nth(2).locator('[data-action="lock"]').get_attribute('class') or ''))


def desktop_reorder_and_swap(pg):
    before = pg.locator('.strip:not(.swap-clone) .hex').all_inner_texts()
    pg.locator('.strip').nth(1).locator('.hex').focus()
    pg.keyboard.press('ArrowRight')
    after = pg.locator('.strip:not(.swap-clone) .hex').all_inner_texts()
    check('arrow reorders focused strip', len(before) == len(after) and before[1] == after[2] and before[2] == after[1])
    pg.locator('.strip').nth(0).hover()
    pg.wait_for_timeout(150)
    _m0 = pg.locator('.strip .hex').all_inner_texts()
    pg.locator('.swapper button').nth(0).click()
    pg.wait_for_timeout(60)
    check('move animates (color clones cross)', pg.locator('.swap-clone').count() == 2)
    _sb = pg.locator('.strip').nth(0).bounding_box()
    _bytes = pg.screenshot(clip={'x': _sb['x'] + _sb['width'] - 15, 'y': 140, 'width': 30, 'height': 60})
    if Image is None:
        print('SKIP swap shows color, never white — pillow not installed')
    else:
        _img = Image.open(io.BytesIO(_bytes)).convert('RGB')
        _white = sum(1 for px in _img.getdata() if px[0] > 242 and px[1] > 242 and px[2] > 242)
        check('swap shows color, never white', _white == 0)
    open(REVIEW / 'seam-clip.png', 'wb').write(_bytes)
    _cross = pg.screenshot(clip={'x': 0, 'y': 300, 'width': 640, 'height': 300})
    open(REVIEW / 'swap-cross.png', 'wb').write(_cross)
    pg.screenshot(path=str(REVIEW / 'shot-swap.png'))
    pg.wait_for_timeout(400)
    _m1 = pg.locator('.strip .hex').all_inner_texts()
    check('move button swaps strips', _m1[0] == _m0[1] and _m1[1] == _m0[0])
    check('move settles clean', pg.locator('.swap-clone').count() == 0)


def desktop_dock_remix(pg):
    check('remix dock visible', pg.locator('#dock').is_visible())
    pg.locator('#dock [data-dock="lockToggle"]').click()
    pg.locator('#dock [data-dock="lockToggle"]').click()  # two toggles = unlocked from any state
    _bd = pg.locator('.strip:not(.swap-clone) .hex').all_inner_texts()
    pg.locator('#dock [data-dock="reverse"]').click()
    _ad = pg.locator('.strip:not(.swap-clone) .hex').all_inner_texts()
    check('dock reverses unlocked order', _bd == _ad[::-1])
    pg.locator('#dock [data-dock="lockToggle"]').click()
    check('dock lock-all locks all', pg.locator('.strip [data-action="lock"].active').count() == len(_ad))
    pg.locator('#dock [data-dock="lockToggle"]').click()
    check('dock lock-all unlocks all', pg.locator('.strip [data-action="lock"].active').count() == 0)
    # Widening to 8 colours is what makes a long name wrap; restore afterwards.
    _wx = pg.evaluate("colors.map(c=>c.hex)")
    _vw = pg.viewport_size
    pg.set_viewport_size({'width': 1200, 'height': 900})
    pg.evaluate("colors = Array.from({length: 8}, (_, i) => ({hex: ['533cc6','ff6b4a','ffc93c','2ec4b6','3b82f6','7c5cf6','ff0000','00ff00'][i], locked: false})); render();")
    pg.wait_for_timeout(200)
    check('long names wrap', pg.locator('.strip').nth(0).locator('.cname').evaluate("e=>{const r=document.createRange();r.selectNodeContents(e);return r.getClientRects().length}") > 1)
    pg.evaluate("(h)=>{ colors = h.map(hex=>({hex, locked:false})); render(); }", _wx)
    pg.set_viewport_size(_vw)
    pg.wait_for_timeout(200)


def desktop_presets_and_strip_layout(pg):
    pg.locator('#newBtn').click(); pg.wait_for_timeout(200)
    pg.locator('#newMenu [data-new="explore"]').click(); pg.wait_for_timeout(300)
    _pname = pg.locator('.preset').first.locator('p').inner_text()
    pg.locator('.preset').first.click(); pg.wait_for_timeout(300)
    check('explore preset loads', pg.locator('.strip').count() == 5 and pg.locator('#paletteNameLabel').inner_text() == _pname)
    pg.keyboard.press('Control+z')
    pg.wait_for_timeout(250)
    check('gap swaps render', pg.locator('.swapper').count() == pg.locator('.strip').count() - 1)
    _s = pg.locator('.strip').nth(4)
    _hb = _s.locator('.hex').bounding_box()
    _bb = {a: _s.locator(f'[data-action="{a}"]').bounding_box() for a in ['lock', 'edit', 'remove']}
    check('strip stack layout', _bb['lock']['y']+_bb['lock']['height'] <= _hb['y'] and _bb['edit']['y']+_bb['edit']['height'] <= _hb['y'] and _bb['remove']['y'] >= _hb['y']+_hb['height'] and pg.locator('[data-action="left"]').count() == 0 and pg.locator('[data-action="right"]').count() == 0)
    pg.locator('.strip .hex').nth(1).click()
    pg.wait_for_timeout(300)
    check('copy shows toast', pg.locator('.toast').count() >= 1)


def desktop_menus(pg):
    check('theme menu opens', open_menu(pg, 'themeBtn', 'themeMenu'))
    pg.locator('#themeMenu [data-gt="pastel"]').click()
    pg.wait_for_timeout(200)
    check('theme switches label', 'Pastel' in (pg.locator('#themeBtn').inner_text() or ''))
    pg.keyboard.press('Space')  # generate once under the theme just picked
    pg.wait_for_timeout(300)
    check('new menu opens', open_menu(pg, 'newBtn', 'newMenu'))
    pg.keyboard.press('Escape')
    pg.click('#newBtn'); pg.wait_for_timeout(200)
    pg.locator('[data-new="random"]').click(); pg.wait_for_timeout(400)
    check('surprise unlocks all', pg.locator('.strip [data-action="lock"].active').count() == 0)
    check('surprise keeps count', pg.locator('.strip').count() == 5)
    check('surprise announces theme', 'Theme:' in pg.locator('#toasts').inner_text())
    pg.click('#newBtn'); pg.wait_for_timeout(200)  # leave menu open for next test
    pg.locator('#newMenu [data-new="mood"]').click()
    pg.wait_for_timeout(300)
    check('mood modal opens', pg.locator('#moodOverlay.open').count() == 1)
    pg.locator('#moodInput').fill('ocean')
    pg.locator('#moodGo').click()
    pg.wait_for_timeout(300)
    check('word palette applies + names', 'Ocean' in (pg.locator('#paletteNameLabel').inner_text() or ''))
    pg.locator('#checkBtn').click()
    pg.wait_for_timeout(200)
    pg.locator('#checkMenu [data-check="vision"]').click()
    pg.wait_for_timeout(300)
    check('vision modal renders 4 rows', pg.locator('.vis-row').count() == 4)
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(200)
    check('esc closes modal', pg.locator('.overlay.open').count() == 0)


def desktop_export(pg):
    pg.locator('#exportBtn').click()
    pg.wait_for_timeout(300)
    check('export shows link+css', ('#' in (pg.locator('#expLink').input_value() or '')) and ('--color-1' in (pg.locator('#expCss').inner_text() or '')))
    pg.locator('#exportOverlay .x-btn').focus()
    pg.keyboard.press('Shift+Tab')
    check('focus trap wraps in dialog', pg.evaluate("document.activeElement.id") == 'pngBtn')
    pg.keyboard.press('Escape')
    pg.keyboard.press('Escape')


def desktop_saved_about_shortcuts(pg):
    pg.locator('#savedBtn').click()
    pg.wait_for_timeout(300)
    check('saved drawer opens', pg.locator('#savedOverlay.open').count() == 1)
    pg.locator('#saveCurrentBtn').click()
    pg.wait_for_timeout(300)
    check('save adds item', pg.locator('.saved-item').count() == 1)
    pg.keyboard.press('Escape')
    pg.locator('#freePill').click()
    pg.wait_for_timeout(300)
    check('about opens', pg.locator('#aboutOverlay.open').count() == 1)
    pg.keyboard.press('Escape')
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(200)
    pg.keyboard.press('?')
    pg.wait_for_timeout(300)
    check('? opens shortcuts', pg.locator('#keysOverlay.open').count() == 1)
    pg.screenshot(path=str(REVIEW / 'shot-keys.png'))
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(200)
    check('shortcuts close on esc', pg.locator('#keysOverlay.open').count() == 0)
    pg.locator('#freePill').click()
    pg.wait_for_timeout(300)
    pg.locator('#aboutKeysBtn').click()
    pg.wait_for_timeout(300)
    check('about popup opens shortcuts', pg.locator('#keysOverlay.open').count() == 1)
    pg.keyboard.press('?')
    pg.wait_for_timeout(200)
    check('? toggles shortcuts shut', pg.locator('#keysOverlay.open').count() == 0)


def desktop_adder_zone(pg):
    sb0 = pg.locator('.strip').nth(0).bounding_box()
    sb1 = pg.locator('.strip').nth(1).bounding_box()
    seam_x = (sb0['x'] + sb0['width'] + sb1['x']) / 2
    pg.mouse.move(seam_x, sb0['y'] + sb0['height'] / 2)
    pg.wait_for_timeout(250)
    pg.screenshot(path=str(REVIEW / 'shot-adder.png'))
    pg.mouse.click(seam_x + 12, sb0['y'] + sb0['height'] - 120)
    pg.wait_for_timeout(250)
    check('adder zone click adds color', pg.locator('.strip').count() == 6)
    # The inserted colour is a blend, so its hue should sit between its neighbours'.
    hx = pg.locator('.strip .hex').all_inner_texts()
    _h = [hue_of(x) for x in hx]
    _d = ((_h[2]-_h[0]+540) % 360)-180
    _mid = (_h[0]+_d/2) % 360
    _dd = abs(_h[1]-_mid); _dd = min(_dd, 360-_dd)
    check('added color fits between neighbors', _dd < 18)
    pg.keyboard.press('Control+z')
    pg.wait_for_timeout(250)
    check('undo restores count', pg.locator('.strip').count() == 5)
    pg.locator('.adder button').first.hover()
    pg.wait_for_timeout(250)
    _bg = pg.evaluate("getComputedStyle(document.querySelector('.adder button')).backgroundColor")
    _rgb = [int(x) for x in _bg[_bg.find('(')+1:_bg.find(')')].split(',')[:3]]
    check('adder hover stays frost (no blue)', all(v >= 200 for v in _rgb))


def desktop_inline_editor(pg):
    pg.locator('.strip').nth(1).hover()
    pg.wait_for_timeout(150)
    pg.locator('.strip [data-action="edit"]').nth(1).click()
    pg.wait_for_timeout(450)
    check('edit opens inline', pg.locator('#strip-1.editing .edit-panel').count() == 1)
    check('edit focuses hex', pg.evaluate("document.activeElement.id") == 'hexInput')
    _ew = pg.locator('#strip-1').bounding_box()['width']
    _ow = pg.locator('#strip-0').bounding_box()['width']
    check('editing column stretches', _ew > _ow * 1.5)
    check('widening animates', 'flex-grow' in pg.locator('#strip-1').evaluate("s=>getComputedStyle(s).transition"))
    _eb = pg.locator('#strip-1').evaluate("s=>s.style.backgroundColor")
    _sh0 = pg.locator('#shadeGrid .shade').first.get_attribute('data-shade')
    _hv = int(pg.locator('#hueSlider').input_value())
    _ht = '200' if abs(_hv - 200) > 20 else '20'
    pg.locator('#hueSlider').evaluate(f"el=>{{el.value='{_ht}';el.dispatchEvent(new Event('input',{{bubbles:true}}));}}")
    pg.wait_for_timeout(200)
    check('slider edits live in context', pg.locator('#strip-1').evaluate("s=>s.style.backgroundColor") != _eb)
    check('shades follow edits', pg.locator('#shadeGrid .shade').first.get_attribute('data-shade') != _sh0)
    # A shade click re-renders the grid, which used to detach the clicked node and make
    # the strip handler read the click as "outside the panel" -- committing and closing
    # the editor. Both of these failed then: the second click had no panel to act on,
    # and a later Escape could no longer revert. dev/domtest.js covers the same bug
    # headlessly; this is the check that would have caught it in a real browser.
    pg.locator('#shadeGrid .shade').nth(3).click()
    pg.wait_for_timeout(250)
    check('shade click keeps editor open', pg.locator('.edit-panel').count() == 1)
    pg.locator('#shadeGrid .shade').nth(4).click()
    pg.wait_for_timeout(250)
    check('shade click is repeatable', pg.locator('.edit-panel').count() == 1)
    pg.screenshot(path=str(REVIEW / 'shot-editing.png'))
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(300)
    check('esc reverts + collapses', pg.locator('.edit-panel').count() == 0 and pg.locator('#strip-1').evaluate("s=>s.style.backgroundColor") == _eb)
    _t0 = pg.locator('.strip .hex').nth(2).inner_text()
    pg.locator('.strip').nth(2).hover()
    pg.wait_for_timeout(150)
    pg.locator('.strip [data-action="edit"]').nth(2).click()
    pg.wait_for_timeout(450)
    _lv = int(pg.locator('#lightSlider').input_value())
    _lt = '90' if _lv < 70 else '10'
    pg.locator('#lightSlider').evaluate(f"el=>{{el.value='{_lt}';el.dispatchEvent(new Event('input',{{bubbles:true}}));}}")
    pg.wait_for_timeout(200)
    pg.locator('[data-pact="done"]').click()
    pg.wait_for_timeout(300)
    check('done keeps + collapses', pg.locator('.edit-panel').count() == 0 and pg.locator('.strip .hex').nth(2).inner_text() != _t0)
    pg.keyboard.press('Control+z')
    pg.wait_for_timeout(250)
    check('edit session undoes in one step', pg.locator('.strip .hex').nth(2).inner_text() == _t0)


# ------------------------------------------------------------------ separate contexts

def hash_routing(b):
    """Palette-in-URL: bad hash, over-long hash, and the two-colour minimum."""
    hp = b.new_page(viewport={'width': 1280, 'height': 800})
    hp.goto(URL + '#notahash'); hp.wait_for_timeout(400)
    check('bad hash falls back to defaults', hp.locator('.strip').count() == 5)
    hp.goto(URL + '#e6194b-f58231-ffe119-bcf60c-3cb44b-42d4f4-4363d8-911eb4-f032e6-ffffff-9a6324-800000'); hp.wait_for_timeout(400)
    hp.reload(); hp.wait_for_timeout(400)
    check('long hash clamps to 9', hp.locator('.strip').count() == 9)
    check('no adders at max', hp.locator('.adder').count() == 0)
    hp.goto(URL + '#2a9d8f-e9c46a'); hp.wait_for_timeout(400)
    hp.reload(); hp.wait_for_timeout(400)
    check('2-color hash loads', hp.locator('.strip').count() == 2)
    hp.close()


def downloads_and_image(b, pg):
    """PNG export download, then pulling a palette out of an uploaded image."""
    dctx = b.new_context(viewport={'width': 1280, 'height': 800}, accept_downloads=True)
    dp = dctx.new_page()
    dp.goto(URL); dp.wait_for_timeout(500)
    dp.click('#exportBtn'); dp.wait_for_timeout(300)
    with dp.expect_download() as _dli:
        dp.click('#pngBtn')
    _dl = _dli.value
    check('png downloads', _dl.suggested_filename.endswith('.png'))
    pg.click('#newBtn'); pg.wait_for_timeout(200)
    pg.locator('[data-new="image"]').click(); pg.wait_for_timeout(300)
    _red = tempfile.NamedTemporaryFile(suffix='.png', delete=False).name
    write_red_png(_red)
    pg.set_input_files('#imgFile', _red)
    pg.wait_for_function("!document.querySelector('#imgUse').disabled", timeout=8000)
    check('image extraction enables use', not pg.locator('#imgUse').is_disabled())
    pg.click('#imgUse'); pg.wait_for_timeout(400)
    _hx0 = pg.locator('.strip .hex').first.inner_text().strip().lstrip('#')
    _r, _g, _bb = (int(_hx0[i:i+2], 16)/255 for i in (0, 2, 4))
    _rh = colorsys.rgb_to_hsv(_r, _g, _bb)[0]*360
    check('image palette is red-ish', _rh < 25 or _rh > 335)
    pg.keyboard.press('Escape')
    dctx.close()
    pg.screenshot(path=str(REVIEW / 'shot-desktop.png'))


def mobile(b, errors):
    m = b.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    m.on('pageerror', lambda e: errors.append('mobile: ' + str(e)))
    m.goto(URL)
    m.wait_for_timeout(600)
    mhb = m.locator('header').bounding_box()
    msb = m.locator('.strip').first.bounding_box()
    check('mobile header above strips (no overlap)', mhb and msb and mhb['y'] + mhb['height'] <= msb['y'] + 1,
          f"header bottom={mhb['y'] + mhb['height']:.0f} strip top={msb['y']:.0f}")
    check('toolbar toggle visible on mobile', m.locator('#toolsToggle').is_visible())
    for _id in ['themeBtn', 'newBtn', 'checkBtn']:
        m.click(f'#{_id}'); m.wait_for_timeout(150)
        _mb = m.locator(f'#{_id}').evaluate("b=>{const r=b.parentElement.querySelector('.menu').getBoundingClientRect();return [r.left,r.right];}")
        check(f'mobile {_id} menu in viewport', _mb[0] >= 0 and _mb[1] <= 390)
        m.keyboard.press('Escape')
    check('space kbd hidden on mobile', not m.locator('#generateBtn .key').is_visible())
    check('adders visible on touch', m.locator('.adder button').first.is_visible())
    m.locator('.strip [data-action="edit"]').nth(0).tap()
    m.wait_for_timeout(400)
    check('mobile edit opens inline', m.locator('.edit-panel').count() == 1)
    m.screenshot(path=str(REVIEW / 'shot-editing-mobile.png'))
    m.locator('[data-pact="done"]').tap()
    m.wait_for_timeout(300)
    check('mobile done collapses', m.locator('.edit-panel').count() == 0)
    h0 = m.locator('#topbar').bounding_box()['height']
    m.locator('#toolsToggle').click()
    check('toolbar collapses on mobile', not m.locator('#toolset').is_visible())
    h1 = m.locator('#topbar').bounding_box()['height']
    check('collapsed header is shorter', h1 < h0)
    m.screenshot(path=str(REVIEW / 'shot-mobile-collapsed.png'))
    m.locator('#toolsToggle').click()
    m.locator('#generateBtn').tap()
    m.wait_for_timeout(300)
    m.screenshot(path=str(REVIEW / 'shot-mobile.png'))


def first_run_hint(b):
    """A fresh context, so localStorage is empty and the hint is due to appear."""
    ctx2 = b.new_context(viewport={'width': 1440, 'height': 900})
    pg2 = ctx2.new_page()
    pg2.goto(URL)
    pg2.wait_for_timeout(1400)
    check('first-run hint shows', 'Press Space' in pg2.locator('#toasts').inner_text())
    pg2.wait_for_timeout(4200)
    check('first-run hint dismisses', 'Press Space' not in pg2.locator('#toasts').inner_text())
    pg2.reload()
    pg2.wait_for_timeout(1400)
    check('first-run hint once only', 'Press Space' not in pg2.locator('#toasts').inner_text())
    ctx2.close()


def narrow_slice(b):
    """Eight colours in a 1100px window: the strips get thin enough to break layout."""
    ctx3 = b.new_context(viewport={'width': 1100, 'height': 800})
    pg3 = ctx3.new_page()
    pg3.goto(URL + '#' + H8)
    pg3.wait_for_timeout(700)
    check('8 strips load from hash', pg3.locator('.strip').count() == 8)
    hb = pg3.locator('.strip .hex').nth(5).bounding_box()
    pg3.mouse.click(hb['x'] + 2, hb['y'] + hb['height'] / 2)
    pg3.wait_for_timeout(300)
    check('hex edge copies (not adds)', pg3.locator('.strip').count() == 8 and 'Copied' in pg3.locator('#toasts').inner_text())
    pg3.evaluate("document.querySelector('.adder button').focus()")
    pg3.keyboard.press('Enter')
    pg3.wait_for_timeout(300)
    check('keyboard add keeps focus', pg3.locator('.strip').count() == 9 and pg3.evaluate("document.activeElement.classList.contains('hex')"))
    pg3.goto(URL + '#' + H8)
    pg3.wait_for_timeout(700)
    sb = pg3.locator('.strip').nth(5).bounding_box()
    pg3.mouse.click(sb['x'] + sb['width'] - 1, sb['y'] + 170)
    pg3.wait_for_timeout(300)
    check('gap zone still adds', pg3.locator('.strip').count() == 9)
    check('mouse add steals no focus', pg3.evaluate("!document.activeElement.classList.contains('hex')"))
    check('adders gone at max', pg3.locator('.adder').count() == 0)
    hb2 = pg3.locator('.strip .hex').nth(5).bounding_box()
    sb2 = pg3.locator('.strip').nth(5).bounding_box()
    check('hex fits narrow slice', hb2['width'] <= sb2['width'])
    ctx3.close()


def keyboard_and_locks(b):
    ctx4 = b.new_context(viewport={'width': 1440, 'height': 900})
    pg4 = ctx4.new_page()
    pg4.goto(URL)
    pg4.wait_for_timeout(700)
    h0 = pg4.locator('.strip .hex').all_inner_texts()
    pg4.keyboard.press('Space'); pg4.wait_for_timeout(200)
    h1 = pg4.locator('.strip .hex').all_inner_texts()
    pg4.keyboard.press('Control+z'); pg4.wait_for_timeout(200)
    hu = pg4.locator('.strip .hex').all_inner_texts()
    pg4.keyboard.press('Control+Shift+z'); pg4.wait_for_timeout(200)
    check('redo restores generate', hu == h0 and pg4.locator('.strip .hex').all_inner_texts() == h1)
    pg4.keyboard.press('2'); pg4.wait_for_timeout(200)
    check('number key locks strip', pg4.evaluate("document.querySelectorAll('.strip')[1].querySelector('[data-action=\"lock\"]').classList.contains('active')"))
    pg4.locator('.strip .hex').nth(0).focus()
    pg4.keyboard.press('c'); pg4.wait_for_timeout(200)
    check('c copies focused hex', 'Copied #' in pg4.locator('#toasts').inner_text())
    pg4.keyboard.press('1'); pg4.keyboard.press('3'); pg4.keyboard.press('4'); pg4.keyboard.press('5')
    pg4.wait_for_timeout(300)
    check('generate disables when all locked', pg4.locator('#generateBtn').is_disabled())
    pg4.keyboard.press('1'); pg4.wait_for_timeout(200)
    check('generate re-enables on unlock', pg4.locator('#generateBtn').is_enabled())
    ctx4.close()


def extreme_slice(b):
    """Nine colours at 740px -- the narrowest a strip ever gets."""
    ctx5 = b.new_context(viewport={'width': 740, 'height': 800})
    pg5 = ctx5.new_page()
    pg5.goto(URL + '#' + H8 + '-ef4444')
    pg5.wait_for_timeout(700)
    hb5 = pg5.locator('.strip .hex').nth(5).bounding_box()
    sb5 = pg5.locator('.strip').nth(5).bounding_box()
    check('hex fits extreme slice', hb5['width'] <= sb5['width'])
    ctx5.close()


# ------------------------------------------------------------------------------ runner

def main():
    with sync_playwright() as p:
        try:
            b = p.chromium.launch(args=['--no-sandbox'])
        except Exception as e:
            print('SKIP chromium launch failed:', str(e)[:300])
            return
        pg = b.new_page(viewport={'width': 1440, 'height': 900})
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

        desktop_layout(pg)
        desktop_generate_and_lock(pg)
        desktop_reorder_and_swap(pg)
        desktop_dock_remix(pg)
        desktop_presets_and_strip_layout(pg)
        desktop_menus(pg)
        desktop_export(pg)
        desktop_saved_about_shortcuts(pg)
        desktop_adder_zone(pg)
        desktop_inline_editor(pg)
        hash_routing(b)
        downloads_and_image(b, pg)
        mobile(b, errors)
        first_run_hint(b)
        narrow_slice(b)
        keyboard_and_locks(b)
        extreme_slice(b)

        check('no JS/page errors', len(errors) == 0, '; '.join(errors[:4]))
        b.close()

    failed = [name for name, ok in RESULTS if not ok]
    if failed:
        print(f'BROWSER TEST FAILED: {len(failed)} of {len(RESULTS)} checks')
        sys.exit(1)
    print('BROWSER TEST DONE')


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        print('BROWSER HARNESS ERROR:', str(e)[:500])
        sys.exit(1)
