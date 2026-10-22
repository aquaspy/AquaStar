#!/usr/bin/env bash
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
source "$here/one-match.sh"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/dist"

if one_match "$tmp/dist/"*.AppImage; then
  echo "a missing AppImage was accepted" >&2
  exit 1
fi

touch "$tmp/dist/aquastar-neo_1.0.0_amd64.AppImage"
touch "$tmp/dist/aquastar-neo_1.0.0_Arch-native_x86_64.AppImage"
if one_match "$tmp/dist/"*.AppImage; then
  echo "two AppImages were accepted" >&2
  exit 1
fi

rm "$tmp/dist/aquastar-neo_1.0.0_Arch-native_x86_64.AppImage"
got=$(one_match "$tmp/dist/"*.AppImage)
[[ "$got" == "$tmp/dist/aquastar-neo_1.0.0_amd64.AppImage" ]]
echo "one AppImage selected"
