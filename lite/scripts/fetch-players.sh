#!/usr/bin/env bash
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
lite=$(cd "$here/.." && pwd)
json="$lite/players.json"
dest="$lite/src-tauri/players"
mkdir -p "$dest"

case "$(uname -s)" in
  Linux) host_os=linux ;;
  Darwin) host_os=macos ;;
  *)
    echo "fetch-players.sh supports Linux and macOS. On Windows run fetch-players.ps1." >&2
    exit 1
    ;;
esac

rows=$(python3 - "$json" "$host_os" <<'PY'
import json
import sys

path, host = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as handle:
    data = json.load(handle)
for player in data["players"]:
    for art in player["artifacts"]:
        if art["os"] != host:
            continue
        print("\t".join([player["dir"], art["sha256"], art["url"], art["kind"], art["exe"]]))
PY
)

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

tree_match() {
  local dir="$1" exe="$2" sha="$3" got
  [[ -f "$dir/$exe" && -f "$dir/.aquastar-pin" ]] || return 1
  got=$(tr -d '[:space:]' < "$dir/.aquastar-pin")
  [[ "$got" == "$sha" ]]
}

swap_in() {
  local incoming="$1" live="$2" trash="$3"
  if [[ -e "$live" ]]; then
    rm -rf "$trash"
    mv "$live" "$trash"
  fi
  mv "$incoming" "$live"
  rm -rf "$trash"
}

unpack_kind() {
  local kind="$1" url="$2" archive="$3" into="$4"
  case "$kind" in
    tar.gz)
      tar -xzf "$archive" -C "$into"
      ;;
    exe)
      local name="${url%%\?*}"
      name="${name##*/}"
      cp "$archive" "$into/$name"
      ;;
    dmg)
      if [[ "$(uname -s)" != "Darwin" ]]; then
        echo "dmg players are unpacked on macOS" >&2
        return 1
      fi
      local mount
      mount=$(mktemp -d)
      hdiutil attach -nobrowse -readonly -mountpoint "$mount" "$archive"
      ditto "$mount/Flash Player.app" "$into/Flash Player.app"
      hdiutil detach -force "$mount"
      rmdir "$mount" || true
      ;;
    zip)
      echo "zip players are unpacked on Windows" >&2
      return 1
      ;;
    *)
      echo "unknown archive kind $kind" >&2
      return 1
      ;;
  esac
}

publish_one() {
  local dir="$1" sha="$2" url="$3" kind="$4" exe="$5"
  local live="$dest/$dir"
  local incoming="$dest/.$dir.incoming"
  local trash="$dest/.$dir.trash"
  local temp="$dest/.$dir.download"

  if tree_match "$incoming" "$exe" "$sha"; then
    swap_in "$incoming" "$live" "$trash"
    return 0
  fi
  rm -rf "$incoming"
  if tree_match "$live" "$exe" "$sha"; then
    rm -rf "$trash"
    return 0
  fi

  if ! curl -fsSL -o "$temp" "$url"; then
    rm -f "$temp"
    echo "download failed: $url" >&2
    exit 1
  fi
  local got
  got=$(sha256_file "$temp")
  if [[ "$got" != "$sha" ]]; then
    rm -f "$temp"
    echo "checksum mismatch for $url" >&2
    exit 1
  fi
  mkdir -p "$incoming"
  if ! unpack_kind "$kind" "$url" "$temp" "$incoming"; then
    rm -rf "$incoming"
    rm -f "$temp"
    exit 1
  fi
  printf '%s\n' "$sha" > "$incoming/.aquastar-pin"
  if ! tree_match "$incoming" "$exe" "$sha"; then
    rm -rf "$incoming"
    rm -f "$temp"
    echo "unpacked $url is missing $exe" >&2
    exit 1
  fi
  swap_in "$incoming" "$live" "$trash"
  rm -f "$temp"
}

dirs=()
while IFS=$'\t' read -r dir sha url kind exe; do
  [[ -n "$dir" ]] || continue
  dirs+=("$dir")
  publish_one "$dir" "$sha" "$url" "$kind" "$exe"
done <<< "$rows"

if [[ ${#dirs[@]} -eq 0 ]]; then
  echo "players.json has no $host_os artifacts" >&2
  exit 1
fi

is_selected() {
  local name="$1" dir
  for dir in "${dirs[@]}"; do
    [[ "$dir" == "$name" ]] && return 0
  done
  return 1
}

shopt -s nullglob dotglob
for path in "$dest"/*; do
  [[ -d "$path" ]] || continue
  name=$(basename "$path")
  if is_selected "$name" || [[ "$name" == .*.incoming || "$name" == .*.trash ]]; then
    continue
  fi
  rm -rf "$path"
done
