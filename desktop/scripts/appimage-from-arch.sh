#!/usr/bin/env bash
set -euo pipefail
if (($# != 2)); then
  echo "Usage: APPIMAGETOOL=/path/to/appimagetool $0 PACKAGE.pkg.tar.zst OUTPUT.AppImage" >&2
  exit 2
fi
package=$(realpath -- "$1")
output=$(realpath -m -- "$2")
tool=$(command -v "${APPIMAGETOOL:-appimagetool}") || {
  echo 'Install appimagetool or set APPIMAGETOOL to its executable path.' >&2; exit 1;
}
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
tar --no-same-owner -xf "$package" -C "$stage"
[[ -x "$stage/usr/bin/aquastar-lite" ]] || { echo 'Not an AquaStar native package.' >&2; exit 1; }
install -m644 "$stage/usr/share/applications/aquastar-lite.desktop" "$stage/AquaStar.desktop"
install -m644 "$stage/usr/share/icons/hicolor/128x128/apps/aquastar-lite.png" "$stage/aquastar-lite.png"
cat > "$stage/AppRun" <<'APP_RUN'
#!/usr/bin/env bash
set -euo pipefail
APPDIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export APPDIR
exec "$APPDIR/usr/bin/aquastar-lite" "$@"
APP_RUN
chmod +x "$stage/AppRun"
ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 "$tool" -n "$stage" "$output"
