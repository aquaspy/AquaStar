#!/usr/bin/env bash
# Build AquaStar for a single platform/arch with the matching PPAPI Flash binary.
# Usage: bash scripts/build-arch.sh <linux|win|mac> <x64|ia32|armv7l>
set -euo pipefail

PLATFORM="${1:-}"
ARCH="${2:-}"

if [ -z "$PLATFORM" ] || [ -z "$ARCH" ]; then
    echo "Usage: $0 <linux|win|mac> <x64|ia32|armv7l>" >&2
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
    mac:x64)
        FLASH="PepperFlashPlayer.plugin"
        BUILD_ARGS=(npx electron-builder --mac zip --x64 --publish never)
        ;;
    *)
        echo "Unsupported platform/arch: ${PLATFORM} ${ARCH}" >&2
        exit 1
        ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKDIR="${ROOT}/work-${PLATFORM}-${ARCH}"

if [ ! -e "${ROOT}/FlashPlayer/${FLASH}" ]; then
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
# cp -R, not cp -r. macOS cp -r follows symlinks, so node_modules/.bin/electron-builder
# becomes a loose copy of the CLI and require('./out/cli/cli') cannot be resolved.
cp -R \
    "${ROOT}/Icon" \
    "${ROOT}/build" \
    "${ROOT}/LICENSE.md" \
    "${ROOT}/res" \
    "${ROOT}/plugins" \
    "${ROOT}/scripts" \
    "${ROOT}/main.js" \
    "${ROOT}/package.json" \
    "${ROOT}/package-lock.json" \
    "${ROOT}/node_modules" \
    "$WORKDIR/"
if [ -d "${ROOT}/FlashPlayer/${FLASH}" ]; then
    cp -R "${ROOT}/FlashPlayer/${FLASH}" "$WORKDIR/FlashPlayer/"
else
    cp "${ROOT}/FlashPlayer/${FLASH}" "$WORKDIR/FlashPlayer/"
fi

# The staging list above is kept by hand, so check the result with the staged copy of the
# platform itself: every runtime entry exists and a bundled default plugin can be discovered.
# Without plugins/ the app starts with no game to open and exits (a release shipped like that).
node "$WORKDIR/scripts/verify-staging.js" "$WORKDIR"

# STAGE_ONLY=1 stops here so the staged folder can be inspected or run without packaging.
if [ "${STAGE_ONLY:-}" = "1" ]; then
    echo "--> Staged ${PLATFORM} ${ARCH} at ${WORKDIR} (STAGE_ONLY)"
    exit 0
fi

cd "$WORKDIR"
"${BUILD_ARGS[@]}"
if [ "$PLATFORM" = "linux" ] && compgen -G "dist/*.deb" > /dev/null; then
    python3 "$ROOT/scripts/normalize-deb-version.py" dist/*.deb
fi

mkdir -p "${ROOT}/dist"
if compgen -G "dist/*" > /dev/null; then
    # cp -a is GNU-only. macOS cp rejects it.
    cp -R dist/* "${ROOT}/dist/"
fi

echo "--> Done: ${PLATFORM} ${ARCH}"
