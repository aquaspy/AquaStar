#!/usr/bin/env bash
# Build AquaStar for a single platform/arch with the matching PPAPI Flash binary.
# Usage: bash scripts/build-arch.sh <linux|win> <x64|ia32|armv7l>
set -euo pipefail

PLATFORM="${1:-}"
ARCH="${2:-}"

if [ -z "$PLATFORM" ] || [ -z "$ARCH" ]; then
    echo "Usage: $0 <linux|win> <x64|ia32|armv7l>" >&2
    exit 1
fi

case "${PLATFORM}:${ARCH}" in
    linux:x64)
        FLASH="libpepflashplayer.so"
        BUILD_ARGS=(npm run dist-l)
        ;;
    linux:ia32)
        FLASH="libpepflashplayer32bits.so"
        BUILD_ARGS=(npx electron-builder --linux AppImage --ia32 --publish never)
        ;;
    linux:armv7l)
        FLASH="libpepflashplayerARM.so"
        BUILD_ARGS=(npx electron-builder --linux AppImage --armv7l --publish never)
        ;;
    win:x64)
        FLASH="pepflashplayer.dll"
        BUILD_ARGS=(npm run dist-w)
        ;;
    win:ia32)
        FLASH="pepflashplayer32bits.dll"
        BUILD_ARGS=(npx electron-builder --win nsis --ia32 --publish never)
        ;;
    *)
        echo "Unsupported platform/arch: ${PLATFORM} ${ARCH}" >&2
        exit 1
        ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKDIR="${ROOT}/work-${PLATFORM}-${ARCH}"

if [ ! -f "${ROOT}/FlashPlayer/${FLASH}" ]; then
    echo "Flash plugin not found: ${ROOT}/FlashPlayer/${FLASH}" >&2
    exit 1
fi

if [ ! -d "${ROOT}/node_modules" ]; then
    echo "node_modules missing — run npm ci first" >&2
    exit 1
fi

echo "--> Building ${PLATFORM} ${ARCH} (Flash: ${FLASH})"

rm -rf "$WORKDIR"
mkdir -p "$WORKDIR/FlashPlayer"
cp -r \
    "${ROOT}/Icon" \
    "${ROOT}/LICENSE.md" \
    "${ROOT}/res" \
    "${ROOT}/main.js" \
    "${ROOT}/package.json" \
    "${ROOT}/package-lock.json" \
    "${ROOT}/node_modules" \
    "$WORKDIR/"
cp "${ROOT}/FlashPlayer/${FLASH}" "$WORKDIR/FlashPlayer/"

cd "$WORKDIR"
"${BUILD_ARGS[@]}"

mkdir -p "${ROOT}/dist"
if compgen -G "dist/*" > /dev/null; then
    cp -a dist/* "${ROOT}/dist/"
fi

echo "--> Done: ${PLATFORM} ${ARCH}"
