#!/usr/bin/env bash
# Copy the GTK 2 libraries the Flash projector loads into
# desktop/src-tauri/flash-gtk2/. The AppImage build places that directory at
# usr/lib/aqua-star-neo/flash-gtk2 and the projector child is the only process
# whose LD_LIBRARY_PATH points there. The deb does not ship this directory; it
# depends on libgtk2.0-0t64 | libgtk2.0-0 and libnss3.
#
# NSS stays on the system. A partial copy of libnss3.so fails at runtime
# because NSS opens libsoftokn3.so from the same directory.
set -euo pipefail

dest="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/flash-gtk2"
rm -rf "$dest"
mkdir -p "$dest"

copy_soname() {
  local name="$1"
  local found=""
  local dir
  for dir in /usr/lib /usr/lib64 /lib /lib64; do
    if [[ -e "$dir/$name" ]]; then
      found="$dir/$name"
      break
    fi
    found="$(find "$dir" -name "$name" -print -quit 2>/dev/null || true)"
    if [[ -n "$found" ]]; then
      break
    fi
  done
  if [[ -z "$found" ]]; then
    echo "bundle-flash-gtk2: $name not found. Install libgtk2.0-0 (or libgtk2.0-0t64)." >&2
    exit 1
  fi
  cp -L "$found" "$dest/$name"
  chmod 644 "$dest/$name"
}

copy_soname libgtk-x11-2.0.so.0
copy_soname libgdk-x11-2.0.so.0

for name in libgtk-x11-2.0.so.0 libgdk-x11-2.0.so.0; do
  if ! grep -aq $'\x7fELF' "$dest/$name"; then
    echo "bundle-flash-gtk2: $dest/$name is not an ELF file" >&2
    exit 1
  fi
done

echo "bundle-flash-gtk2: wrote $dest"
