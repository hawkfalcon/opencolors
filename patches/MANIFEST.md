# Patch series: mobile UX pass (18 patches)

Against `main` @ `0e95c66`. Applies in order, one feature per patch; each patch
carries its code, test updates, audit guards, and README counts together.

**Verified:** all 18 apply cleanly onto pristine `0e95c66` with `git apply`,
the result is byte-identical to the tested branch tip (`3f90c05`), and the
applied tree runs green: harness 64/64, audit 93/93, golden MATCH (96/8/0).

## How to merge

One command, from a clean checkout of `main` (series built against `0e95c66`):

```sh
./patches/apply.sh
```

That applies all 18 patches in order, one commit per patch, using the
subjects in the table below, and stops at the first failure. To resume,
pass the remaining files explicitly:

```sh
./patches/apply.sh 14-generate-leads-dock.patch 15-redo-button.patch 16-history-section-in-dock.patch 17-deterministic-domtest.patch 18-golden-snapshot-refresh.patch
```

The script only stages the files each patch touches, so the `patches/`
folder itself never leaks into your history.

Manual fallback (same result, more typing), one patch at a time:

```sh
git apply 01-always-visible-mobile-controls.patch
git add -A && git commit -m "Keep strip controls visible on touch phones"
git apply 02-remove-tools-toggle.patch
git add -A && git commit -m "Remove the collapsible-toolbar toggle"
# … and so on through 18 (filenames sort into the right order)
```

After the last patch, optionally confirm green:

```sh
node dev/harness.js && node dev/audit.js && node dev/domtest.js
```

## The patches

| # | File | Suggested commit subject | Contents |
|---|------|--------------------------|----------|
| 01 | `01-always-visible-mobile-controls.patch` | Keep strip controls visible on touch phones | 40px always-visible actions/adder/swapper keys off width; swap glyph rotates for vertical strips; +2 audit guards (→76) |
| 02 | `02-remove-tools-toggle.patch` | Remove the collapsible-toolbar toggle | Delete toggle button/CSS/collapse JS/persisted state; README feature line; drop 2 domtest steps (→96); −1 guard (→75). The toolset wrapper stays — patch 07 turns it into the tab bar |
| 03 | `03-repair-stale-domtest-header.patch` | Fix stale header selectors in domtest | Name-dice step → header-rename typing; fingerprint reads the name input (net zero steps) |
| 04 | `04-editing-strip-fits-mobile.patch` | Fit the inline editor on mobile screens | Editing strip + siblings size to content, panel can't nested-scroll; +2 guards (→77) |
| 05 | `05-edit-height-glide.patch` | Glide the editor open and closed | `animateHeight` (WAAPI, layout-participating, reduced-motion safe); +1 guard (→78) |
| 06 | `06-done-only-editor-exit.patch` | Exit the inline editor via Done only | Remove the floating cancel X + its dead top padding (46→18px); Esc still cancels; domtest commits via strip click; guard swap (stays 78) |
| 07 | `07-labeled-mobile-tab-bar.patch` | Add a labeled tab bar on mobile | Toolset becomes a scrollable icon-over-label row; dropdowns pin below their tab; Undo gets a (still desktop-hidden) label; +1 guard (→79) |
| 08 | `08-labeled-bottom-dock.patch` | Label the bottom dock buttons | Icon-over-text dock buttons, lock label flips Lock/Unlock, narrow phones scroll the bar, clearance 76→92px; +1 guard (→80) |
| 09 | `09-mobile-a11y-quick-wins.patch` | Mobile accessibility quick wins | 16px text inputs (no iOS focus zoom), `role=status` toasts, full-opacity color names; +3 guards (→83) |
| 10 | `10-centered-mobile-tabs.patch` | Center the mobile tabs | Slim tabs to fit 375px (56px/5px gap) + scroll-safe auto-margin centering; +1 guard (→84) |
| 11 | `11-mobile-name-robustness.patch` | Harden the mobile palette-name field | Sizer tracks input font (13.5/16), width cap 260→320 on mobile, logo pinned left; +3 guards (→87) |
| 12 | `12-label-undo-everywhere.patch` | Label Undo everywhere | Drop the icon-only treatment (button + CSS); +1 guard (→88) |
| 13 | `13-theme-button-live-dot.patch` | Show the theme as a live dot on its button | Dot preview + plain "Theme" label, dynamic title/aria; +1 guard (→89) |
| 14 | `14-generate-leads-dock.patch` | Move Generate to the head of the dock | First dock slot, capsule styling, dock renamed "Palette actions", kbd hint dock-hidden; +1 guard (→90) |
| 15 | `15-redo-button.patch` | Add a Redo button | Mirrored redo icon, button + wiring to the existing redo stack; +1 guard (→91) |
| 16 | `16-history-section-in-dock.patch` | Group Undo/Redo as a dock history section | History pair between shuffle and lock with its own divider; dividers use dark ink (visible on white); +2 guards (→93) |
| 17 | `17-deterministic-domtest.patch` | Make the domtest golden deterministic | Mask wall-clock-volatile toasts from the body hash; assert the sort toast fires directly (no count changes) |
| 18 | `18-golden-snapshot-refresh.patch` | Refresh the domtest golden snapshot | Regenerated `dev/domtest.golden.json` for the new UI + session (review as one snapshot bump) |

## Notes

- Order matters: later patches anchor on lines earlier ones add. Apply in
  filename order.
- You commit, so authorship is yours — nothing in the patches attributes
  anyone else.
- This series supersedes the `arena/01a0a313-opencolors` branch / PR #3,
  which contains the same net change plus its reverted experiments; after
  merging you can close that PR.
- Regeneration scripts (one asserted edit-script per patch) live outside
  this folder and are not part of the merge.
