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
    echo 'sudo apt-get install -y build-essential pkg-config libwebkit2gtk-4.1-dev libgtk-3-dev libappindicator3-dev librsvg2-dev libdbus-1-dev' >&2
    exit 1
  fi
fi

cd "$root/src-tauri"
cargo "${args[@]}"
binary="${CARGO_TARGET_DIR:-$PWD/target}/$profile/aquastar-lite"
echo "Local build: $binary"
if [[ $run == true ]]; then
  exec "$binary"
fi
