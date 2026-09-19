#!/bin/sh
# Apply every patch in this folder, in order, with one commit per patch.
#
# Usage: from a clean checkout of main (series built against 0e95c66):
#
#   ./patches/apply.sh
#
# It stops at the first patch that fails. To resume, pass the remaining
# patch files (basenames are looked up in this folder):
#
#   ./patches/apply.sh 14-generate-leads-dock.patch 15-redo-button.patch ...
set -eu

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"

git rev-parse --show-toplevel >/dev/null 2>&1 || {
  echo "error: run this from inside your main checkout" >&2
  exit 1
}
if [ -n "$(git status --porcelain | grep -v '^??')" ]; then
  echo "error: working tree has staged or unstaged changes; commit or stash first" >&2
  exit 1
fi
case "$(git rev-parse HEAD)" in
  0e95c66a53f6c10ccfdc2a907f82db31afc21a07*) ;;
  *) echo "note: HEAD is $(git rev-parse --short HEAD); patches were built against 0e95c66" >&2 ;;
esac

subject_for() {
  case "$(basename "$1")" in
    01-*) echo "Keep strip controls visible on touch phones" ;;
    02-*) echo "Remove the collapsible-toolbar toggle" ;;
    03-*) echo "Fix stale header selectors in domtest" ;;
    04-*) echo "Fit the inline editor on mobile screens" ;;
    05-*) echo "Glide the editor open and closed" ;;
    06-*) echo "Exit the inline editor via Done only" ;;
    07-*) echo "Add a labeled tab bar on mobile" ;;
    08-*) echo "Label the bottom dock buttons" ;;
    09-*) echo "Mobile accessibility quick wins" ;;
    10-*) echo "Center the mobile tabs" ;;
    11-*) echo "Harden the mobile palette-name field" ;;
    12-*) echo "Label Undo everywhere" ;;
    13-*) echo "Show the theme as a live dot on its button" ;;
    14-*) echo "Move Generate to the head of the dock" ;;
    15-*) echo "Add a Redo button" ;;
    16-*) echo "Group Undo/Redo as a dock history section" ;;
    17-*) echo "Make the domtest golden deterministic" ;;
    18-*) echo "Refresh the domtest golden snapshot" ;;
    *) echo "error: no commit subject for $1" >&2; exit 1 ;;
  esac
}

apply_one() {
  msg="$(subject_for "$1")"
  echo "=== $(basename "$1"): $msg"
  git apply "$1"
  git apply --numstat "$1" | awk '{print $NF}' | xargs git add --
  git commit -qm "$msg"
}

n=0
if [ "$#" -eq 0 ]; then
  for p in "$PATCH_DIR"/*.patch; do
    apply_one "$p"
    n=$((n + 1))
  done
else
  for p in "$@"; do
    case "$p" in
      */*) apply_one "$p" ;;
      *) apply_one "$PATCH_DIR/$p" ;;
    esac
    n=$((n + 1))
  done
fi

echo "applied $n patch(es); HEAD is now $(git rev-parse --short HEAD)"
