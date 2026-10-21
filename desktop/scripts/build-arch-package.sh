#!/usr/bin/env bash
# Build from the current checkout without installing packages or elevating privileges.
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
output="$root/../AquaStar-workspace/arch"
prepare_only=false
while (($#)); do
  case "$1" in
    --output) output=$(realpath -m -- "$2"); shift 2 ;;
    --prepare-only) prepare_only=true; shift ;;
    --) shift; break ;;
    *) echo "Usage: $0 [--output DIR] [--prepare-only] [-- MAKEPKG_OPTIONS...]" >&2; exit 2 ;;
  esac
done
python "$root/desktop/scripts/prepare-arch-package.py" --output "$output"
if $prepare_only; then exit 0; fi
cd "$output"
makepkg "$@"
# Distribute corresponding media sources beside the installer instead of
# installing a large development source archive into every user installation.
if [[ -f src/media-build/AquaStar-media-sources.tar.xz ]]; then
  cp src/media-build/AquaStar-media-sources.tar.xz ./AquaStar-media-sources.tar.xz
fi
