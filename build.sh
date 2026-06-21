#!/bin/bash
set -euo pipefail

# Multi-arch release script. Requires npm ci first; Wine for Windows builds on Linux.
# Outputs land in releases/ (x64 at top level, other archs in subfolders).

releasefolder="releases"
script_dir="$(cd "$(dirname "$0")" && pwd)"

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
    bash "${script_dir}/scripts/build-arch.sh" "$platform" "$arch"

    local dest="./${releasefolder}"
    if [ -n "$dest_subdir" ]; then
        dest="./${releasefolder}/${dest_subdir}"
    fi
    mkdir -p "$dest"
    cp -a dist/* "$dest/"
    echo -e "${yellow}--> ${platform} ${arch} -> ${dest}${clear}"
}

# Linux: x64 (AppImage + deb), ia32, armv7l
collect_build linux x64
collect_build linux ia32
collect_build linux armv7l

# Windows: x64 and ia32 (needs Wine when run on Linux)
collect_build win x64
collect_build win ia32

# EXPERIMENTAL - macOS, build only on macOS:
# collect_build mac x64

echo -e "${yellow}--> All builds copied to ${releasefolder}/${clear}"
