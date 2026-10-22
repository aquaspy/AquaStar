#!/usr/bin/env bash
# Download one real release asset. The smoke test does not build the desktop app.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
source "$here/one-match.sh"

tag="${TAG:?}"
pkg="${PACKAGE:?}"
mkdir -p dist

case "$pkg" in
  appimage) pat='aquastar-neo_*_amd64.AppImage' ;;
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
one_match "$PWD"/dist/*
find dist -type f -print
