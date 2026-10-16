#!/usr/bin/env bash
# Download one real release asset. The smoke test does not build Lite.
set -euo pipefail

tag="${TAG:?}"
pkg="${PACKAGE:?}"
mkdir -p dist

case "$pkg" in
  appimage) pat='*.AppImage' ;;
  deb) pat='*.deb' ;;
  nsis) pat='*-setup.exe' ;;
  portable) pat='*-portable.zip' ;;
  dmg) pat='*.dmg' ;;
  *)
    echo "unknown package $pkg" >&2
    exit 1
    ;;
esac

gh release download "$tag" --repo "$GITHUB_REPOSITORY" --pattern "$pat" --dir dist --clobber
find dist -type f -print
