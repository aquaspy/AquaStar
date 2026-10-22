#!/usr/bin/env bash
# Exit 0 once a window manager has claimed this X11 display.
set -euo pipefail
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50; do
  if xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -q '0x'; then
    exit 0
  fi
  sleep 0.1
done
echo "No window manager claimed the X11 root" >&2
exit 1
