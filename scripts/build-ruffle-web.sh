#!/usr/bin/env bash
# Build the pinned toommyliu/ruffle web player and copy its selfhosted dist
# into res/ruffle.
#
# Requires: Rust stable with wasm32-unknown-unknown and rust-src, Node.js 24,
# Java, and wasm-bindgen 0.2.127. wasm-opt is optional.
#
# RUFFLE_SRC     checkout to build (default: clone into .ruffle-src)
# RUFFLE_SKIP_BUILD=1   copy an existing web/packages/selfhosted/dist
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHA="$(tr -d '[:space:]' < "$ROOT/ruffle/RUFFLE_COMMIT")"
SRC="${RUFFLE_SRC:-$ROOT/.ruffle-src}"
DEST="$ROOT/res/ruffle"

if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
    echo "ruffle/RUFFLE_COMMIT must be a 40-character sha, got: $SHA" >&2
    exit 1
fi

need_node="$(node -v || true)"
case "$need_node" in
    v24.*) ;;
    *)
        echo "Node.js 24 is required (found ${need_node:-none})." >&2
        exit 1
        ;;
esac

if ! command -v java >/dev/null 2>&1; then
    echo "Java is required (the Ruffle web build uses it)." >&2
    exit 1
fi

if ! rustup target list --installed | grep -qx 'wasm32-unknown-unknown'; then
    rustup target add wasm32-unknown-unknown
fi
if ! rustup component list --installed | grep -qx 'rust-src'; then
    rustup component add rust-src
fi

bindgen_have="$(wasm-bindgen --version 2>/dev/null | awk '{print $2}' || true)"
if [[ "$bindgen_have" != "0.2.127" ]]; then
    bindir="${HOME}/.local/bin"
    mkdir -p "$bindir"
    tmp="$(mktemp -d)"
    curl -fsSL -o "$tmp/wb.tgz" \
        https://github.com/rustwasm/wasm-bindgen/releases/download/0.2.127/wasm-bindgen-0.2.127-x86_64-unknown-linux-musl.tar.gz
    tar -xzf "$tmp/wb.tgz" -C "$tmp"
    install -m 755 "$tmp"/wasm-bindgen-*/wasm-bindgen "$bindir/wasm-bindgen"
    export PATH="$bindir:$PATH"
    rm -rf "$tmp"
fi

if ! command -v wasm-opt >/dev/null 2>&1; then
    echo "wasm-opt not found. The wasm will be larger and less optimized."
fi

if [[ ! -d "$SRC/.git" ]]; then
    git clone --filter=blob:none --no-tags https://github.com/toommyliu/ruffle.git "$SRC"
fi

git -C "$SRC" fetch --no-tags origin "$SHA"
git -C "$SRC" checkout --detach "$SHA"
head_sha="$(git -C "$SRC" rev-parse HEAD)"
if [[ "$head_sha" != "$SHA" ]]; then
    echo "checkout is $head_sha, expected $SHA" >&2
    exit 1
fi

if [[ "${RUFFLE_SKIP_BUILD:-}" != "1" ]]; then
    export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-2}"
    (
        cd "$SRC/web"
        npm ci
        npm run build --workspace=ruffle-core
        npm run build --workspace=ruffle-selfhosted
    )
fi

if [[ ! -f "$SRC/web/packages/selfhosted/dist/ruffle.js" ]]; then
    echo "selfhosted dist is missing ruffle.js" >&2
    exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$SRC/web/packages/selfhosted/dist/." "$DEST/"
cp "$SRC/web/packages/selfhosted/LICENSE_MIT" "$DEST/LICENSE_MIT"
cp "$SRC/web/packages/selfhosted/LICENSE_APACHE" "$DEST/LICENSE_APACHE"
cat > "$DEST/PROVENANCE" <<EOF
source: https://github.com/toommyliu/ruffle
commit: ${SHA}
upstream-base: e2643c2d1 (https://github.com/ruffle-rs/ruffle/commit/e2643c2d1)
cherry-pick: c1233491b skipped
cherry-pick-reason: does not apply cleanly (vendor/wgpu-hal GLES files were deleted on main)
license: MIT OR Apache-2.0
player: web/packages/selfhosted/dist
built: $(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

echo "Vendored Ruffle web dist at res/ruffle from ${SHA}"
