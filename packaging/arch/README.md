# Native Arch Linux package

The native `aquastar-neo` package installs `/usr/bin/aquastar-neo`, a desktop entry,
icons and resources in `/usr/lib/aqua-star-neo`. Its package metadata replaces the
previous `aqua-star` package so pacman can upgrade existing installations. It uses the system GTK/WebKit and
GPU libraries, without an AppImage runtime or bundled Ubuntu GTK environment.
The Tauri application identifier and user data paths remain unchanged.

On Arch x86_64, install the `base-devel` group and the dependencies listed in
`PKGBUILD.in` (Rust, Clang, Python, pkgconf and the native runtime libraries), then
run from the repository root as a regular user:

```sh
bash scripts/build-arch-package.sh
```

The script snapshots the current checkout, including local changes, into the
sibling `AquaStar-workspace/arch/` directory. It generates a `PKGBUILD`, `.SRCINFO`
and a SHA-256-checked source archive, then runs `makepkg`. It does not install
packages or invoke sudo. For an independent recipe/source upload:

```sh
bash scripts/build-arch-package.sh --prepare-only --output /path/outside/checkout
cd /path/outside/checkout
makepkg
```

Install the resulting package explicitly with `sudo pacman -U aquastar-neo-*.pkg.tar.zst`.
Close any existing launcher or game before testing AquaStar NEO because the single-instance
mechanism otherwise continues using the old executable.

Players are downloaded on first use using the existing pinned catalog and SHA-256
verification. The package does not redistribute Adobe Flash. Ruffle is the default;
Flash additionally requires legacy GTK 2 (currently supplied through AUR) and NSS.
Installing GTK 2 is optional. The bundled minimal FFmpeg/OpenH264 recording component
is built from the existing pinned sources; its notices, manifest and corresponding
source bundle accompany the package. `nasm` is an optional build optimization; the media
recipe already supports machines without it.

Prerelease versions map `1.0.0-rc.1` to `1.0.0rc.1`, so pacman's `vercmp` sorts it
below `1.0.0`. The NEO package name remains separate from Electron's `aquastar`.

`.github/workflows/desktop-arch.yml` builds and tests in a current Arch container
as an unprivileged user, then uploads the native package and its source recipe.
It supports manual dispatch, pull requests, and pushes to `neo` and `neo-dev`.
It does not publish to AUR or install anything on the host. The NEO release workflow calls it to attach these assets to `neo-v*` releases. Standalone pull request, development, and manual checks only upload workflow artifacts.
A successful package build does not establish Wayland permissions, UI behavior or
FPS: those require an interactive test on the target desktop.

## Host-library AppImage variant

To retain the native library environment in an AppImage, install
[appimagetool](https://github.com/AppImage/appimagetool) and convert the native package:

```sh
APPIMAGETOOL=/path/to/appimagetool bash scripts/appimage-from-arch.sh \
  /path/aquastar-neo-1.0.0-1-x86_64.pkg.tar.zst /path/aquastar-neo_1.0.0_Arch-native_x86_64.AppImage
```

This variant uses the same system dependencies and downloaded players as the
native package. Its AppRun directly executes the launcher; it does not inject
Ubuntu GTK libraries, rewrite player binaries or alter the Ruffle engine. It is
an Arch-targeted alternative to the existing general Linux release workflow,
not a replacement for testing other Linux distributions. Closing the old app is
required before comparing builds. Keep graphics, game FPS limit, quality,
window size, scene and player population comparable when investigating performance.
