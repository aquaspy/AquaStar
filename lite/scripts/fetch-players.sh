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
        print(
            "\t".join(
                [
                    player["dir"],
                    art["sha256"],
                    art["url"],
                    art["kind"],
                    art["exe"],
                    art.get("extract") or "",
                    art.get("binarySha256") or "",
                ]
            )
        )
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

unpack_zip() {
  local archive="$1" into="$2"
  python3 - "$archive" "$into" <<'PY'
import sys
import zipfile
from pathlib import Path

archive, into = sys.argv[1], Path(sys.argv[2])
with zipfile.ZipFile(archive) as handle:
    for info in handle.infolist():
        name = info.filename
        if not (info.flag_bits & 0x800):
            raw = name.encode("cp437")
            try:
                name = raw.decode("utf-8")
            except UnicodeDecodeError:
                pass
        target = (into / name).resolve()
        if into.resolve() not in target.parents and target != into.resolve():
            raise SystemExit(f"zip entry escapes destination: {name}")
        if name.endswith("/"):
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with handle.open(info) as src, target.open("wb") as dst:
            dst.write(src.read())
PY
}

finish_extract() {
  local extract="$1" exe="$2" binary_sha="$3" into="$4"
  case "$extract" in
    "")
      return 0
      ;;
    appimage)
      local appimage work
      appimage=$(find "$into" -type f -name '*.AppImage' | head -n 1)
      if [[ -z "$appimage" ]]; then
        echo "zip has no AppImage" >&2
        return 1
      fi
      work=$(mktemp -d)
      chmod +x "$appimage"
      if ! (cd "$work" && APPIMAGE_EXTRACT_AND_RUN=1 "$appimage" --appimage-extract); then
        rm -rf "$work"
        echo "appimage extract failed" >&2
        return 1
      fi
      if [[ ! -f "$work/squashfs-root/usr/bin/$exe" ]]; then
        rm -rf "$work"
        echo "appimage is missing usr/bin/$exe" >&2
        return 1
      fi
      find "$into" -mindepth 1 -delete
      cp "$work/squashfs-root/usr/bin/$exe" "$into/$exe"
      chmod +x "$into/$exe"
      if [[ -f "$work/squashfs-root/usr/share/doc/artix-games-launcher/LICENSE.md" ]]; then
        cp "$work/squashfs-root/usr/share/doc/artix-games-launcher/LICENSE.md" "$into/LICENSE.md"
      fi
      rm -rf "$work"
      ;;
    macos-cli)
      local found
      found=$(find "$into" -type f -name "$exe" | head -n 1)
      if [[ -z "$found" ]]; then
        echo "zip has no $exe" >&2
        return 1
      fi
      cp "$found" "$into/.$exe.flat"
      find "$into" -mindepth 1 ! -name ".$exe.flat" -delete
      mv "$into/.$exe.flat" "$into/$exe"
      chmod +x "$into/$exe"
      if [[ -n "$binary_sha" ]]; then
        local got
        got=$(sha256_file "$into/$exe")
        if [[ "$got" != "$binary_sha" ]]; then
          echo "binary checksum mismatch for $exe" >&2
          return 1
        fi
      fi
      if [[ "$(uname -s)" == "Darwin" ]]; then
        vendor_macos_dylibs "$into/$exe"
      fi
      return 0
      ;;
    *)
      echo "fetch-players.sh cannot finish extract $extract" >&2
      return 1
      ;;
  esac
  if [[ -n "$binary_sha" ]]; then
    local got
    got=$(sha256_file "$into/$exe")
    if [[ "$got" != "$binary_sha" ]]; then
      echo "binary checksum mismatch for $exe" >&2
      return 1
    fi
  fi
}

vendor_macos_dylibs() {
  local exe="$1"
  local dir
  dir=$(cd "$(dirname "$exe")" && pwd)
  exe="$dir/$(basename "$exe")"
  python3 - "$exe" "$dir" <<'PY'
import os
import shutil
import subprocess
import sys

exe, dest = sys.argv[1], sys.argv[2]

def run(cmd):
    result = subprocess.run(cmd, check=False, text=True, capture_output=True)
    if result.returncode != 0:
        sys.stderr.write(result.stderr or result.stdout)
        raise SystemExit(result.returncode or 1)
    return result.stdout

def archs(path):
    return run(["lipo", "-archs", path]).split()

def deps(path):
    found = []
    for line in run(["otool", "-L", path]).splitlines()[1:]:
        line = line.strip()
        if not line:
            continue
        found.append(line.split(" (compatibility", 1)[0].strip())
    return found

wanted = archs(exe)
pending = [exe]
seen = {exe}
while pending:
    binary = pending.pop()
    for dep in deps(binary):
        if dep.startswith("/usr/lib/") or dep.startswith("/System/") or dep.startswith("@"):
            continue
        base = os.path.basename(dep)
        local = os.path.join(dest, base)
        own = os.path.basename(binary) == base
        if not own and local not in seen:
            if not os.path.isfile(dep):
                if "fontconfig" in dep:
                    brew = subprocess.run(["brew", "install", "fontconfig"], check=False)
                    if brew.returncode != 0 or not os.path.isfile(dep):
                        raise SystemExit(f"missing {dep}")
                else:
                    raise SystemExit(f"missing {dep}")
            if len(wanted) == 1:
                run(["lipo", dep, "-extract", wanted[0], "-output", local])
            else:
                shutil.copy2(dep, local)
            os.chmod(local, 0o755)
            run(["install_name_tool", "-id", f"@executable_path/{base}", local])
            pending.append(local)
            seen.add(local)
        if not own:
            run(["install_name_tool", "-change", dep, f"@executable_path/{base}", binary])
for path in seen:
    run(["codesign", "--force", "-s", "-", path])
PY
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
      unpack_zip "$archive" "$into"
      ;;
    *)
      echo "unknown archive kind $kind" >&2
      return 1
      ;;
  esac
}

publish_one() {
  local dir="$1" sha="$2" url="$3" kind="$4" exe="$5" extract="$6" binary_sha="$7"
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
  if ! finish_extract "$extract" "$exe" "$binary_sha" "$incoming"; then
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
while IFS=$'\t' read -r dir sha url kind exe extract binary_sha; do
  [[ -n "$dir" ]] || continue
  dirs+=("$dir")
  publish_one "$dir" "$sha" "$url" "$kind" "$exe" "$extract" "$binary_sha"
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
