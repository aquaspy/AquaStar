#!/usr/bin/env bash
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
lite=$(cd "$here/.." && pwd)
target="$lite/src-tauri/target"

app=""
while IFS= read -r candidate; do
  case "$candidate" in
    *universal-apple-darwin*) app="$candidate" ;;
  esac
  if [[ -z "$app" ]]; then
    app="$candidate"
  fi
done < <(find "$target" -type d -name "AquaStar Lite.app")

if [[ -z "$app" ]]; then
  echo "AquaStar Lite.app not found under $target" >&2
  exit 1
fi

players="$app/Contents/Resources/players"
if [[ -d "$players" ]]; then
  while IFS= read -r nested; do
    codesign --force --deep -s - "$nested"
  done < <(find "$players" -type d -name "*.app")
fi
codesign --force --deep -s - "$app"

bundle=$(cd "$(dirname "$app")/.." && pwd)
dmg_dir="$bundle/dmg"
mkdir -p "$dmg_dir"
ver=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$lite/src-tauri/tauri.conf.json")
dmg="$dmg_dir/AquaStar.Lite_${ver}_universal.dmg"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
cp -R "$app" "$stage/"
ln -s /Applications "$stage/Applications"
hdiutil create -volname "AquaStar Lite" -srcfolder "$stage" -ov -format UDZO "$dmg"
echo "$dmg"
