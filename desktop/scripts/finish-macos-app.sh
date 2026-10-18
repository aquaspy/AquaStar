#!/usr/bin/env bash
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
desktop=$(cd "$here/.." && pwd)
target="$desktop/src-tauri/target"

app=""
while IFS= read -r candidate; do
  case "$candidate" in
    *universal-apple-darwin*) app="$candidate" ;;
  esac
  if [[ -z "$app" ]]; then
    app="$candidate"
  fi
done < <(find "$target" -type d -name "AquaStar.app")

if [[ -z "$app" ]]; then
  echo "AquaStar.app not found under $target" >&2
  exit 1
fi

plist="$app/Contents/Info.plist"
python3 - "$plist" <<'PY'
import plistlib
import sys
path = sys.argv[1]
with open(path, "rb") as handle:
    info = plistlib.load(handle)
info["CFBundleDisplayName"] = "AquaStar"
info["CFBundleName"] = "AquaStar"
with open(path, "wb") as handle:
    plistlib.dump(info, handle, fmt=plistlib.FMT_XML)
PY

players="$app/Contents/Resources/players"
if [[ -d "$players" ]]; then
  while IFS= read -r nested; do
    codesign --force --deep -s - "$nested"
  done < <(find "$players" -type d -name "*.app")
  while IFS= read -r loose; do
    codesign --force -s - "$loose"
  done < <(find "$players" -type f \( -name 'ruffle_desktop' -o -name '*.dylib' \))
fi
codesign --force --deep -s - "$app"

bundle=$(cd "$(dirname "$app")/.." && pwd)
dmg_dir="$bundle/dmg"
mkdir -p "$dmg_dir"
ver=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$desktop/src-tauri/tauri.conf.json")
dmg="$dmg_dir/AquaStar_${ver}_universal.dmg"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
cp -R "$app" "$stage/"
ln -s /Applications "$stage/Applications"
hdiutil create -volname "AquaStar" -srcfolder "$stage" -ov -format UDZO "$dmg"
echo "$dmg"
