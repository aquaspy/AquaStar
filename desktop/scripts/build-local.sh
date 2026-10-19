#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
profile=debug
run=false
args=(build --locked)
for option in "$@"; do
  case "$option" in
    --release) profile=release; args+=(--release) ;;
    --run) run=true ;;
    *) echo "Usage: $0 [--release] [--run]" >&2; exit 2 ;;
  esac
done

if ! command -v cargo >/dev/null; then
  echo 'Rust/Cargo is required. If Rust is installed, run: source "$HOME/.cargo/env"' >&2
  exit 1
fi
if [[ $(uname -s) == Linux ]]; then
  if ! pkg-config --exists webkit2gtk-4.1 gtk+-3.0 dbus-1; then
    echo 'Install the Linux build dependencies first:' >&2
    echo 'sudo apt-get install -y build-essential pkg-config libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libdbus-1-dev' >&2
    exit 1
  fi
fi

cd "$root/src-tauri"
media_os=$(case "$(uname -s)" in Darwin) echo macos;; Linux) echo linux;; *) echo windows;; esac)
media_arch=$(uname -m)
case "$media_arch" in arm64|aarch64) media_arch=aarch64;; amd64|x86_64) media_arch=x86_64;; esac
media_suffix=
[[ "$media_os" != windows ]] || media_suffix=.exe
if [[ ! -f "media/ffmpeg-${media_os}-${media_arch}${media_suffix}" ]]; then
  python3 ../scripts/build-media.py
fi
cargo "${args[@]}"
binary="${CARGO_TARGET_DIR:-$PWD/target}/$profile/aquastar-lite"
mkdir -p "$(dirname "$binary")/media"
cp -R media/. "$(dirname "$binary")/media/"
[[ "$media_os" != windows ]] || binary="${binary}.exe"
echo "Local build: $binary"
if [[ $run == true ]]; then
  exec "$binary"
fi
