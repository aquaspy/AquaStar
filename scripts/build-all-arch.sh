#!/bin/bash
set -euo pipefail

# Packages linux x64 and Windows x64 into releases/. Requires npm ci first.
# Wine is required for the Windows package when this runs on Linux.
# On a Mac: bash scripts/build-arch.sh mac x64

releasefolder="releases"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
cd "$repo_root"

blue="\e[34m"
yellow="\e[36m"
clear="\e[39m"

mkdir -p "./${releasefolder}"
rm -rf ./dist

if [ ! -d "./node_modules" ]; then
    echo -e "${blue}--> Installing dependencies...${clear}"
    npm ci
fi

collect_build() {
    local platform="$1"
    local arch="$2"
    local dest_subdir="$arch"
    if [ "$arch" = "x64" ]; then
        dest_subdir=""
    fi

    echo -e "${blue}--> Building ${platform} ${arch}...${clear}"
    rm -rf ./dist
    bash "${script_dir}/build-arch.sh" "$platform" "$arch"

    local dest="./${releasefolder}"
    if [ -n "$dest_subdir" ]; then
        dest="./${releasefolder}/${dest_subdir}"
    fi
    mkdir -p "$dest"
    cp -a dist/* "$dest/"
    echo -e "${yellow}--> ${platform} ${arch} -> ${dest}${clear}"
}

collect_build linux x64
collect_build win x64

echo -e "${yellow}--> All builds copied to ${releasefolder}/${clear}"
