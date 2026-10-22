# AquaStar NEO 1.0.0

AquaStar NEO 1.0.0 is the first public release of the Tauri launcher. It is a separate product from classic AquaStar Electron 2.1.0. This release is not marked Latest on GitHub. Latest stays the Electron release.

## Downloads

The `neo-v1.0.0` release has these builds.

- Linux x64: a `.deb` package and an AppImage. An Arch package is attached by the same release workflow.
- Windows x64: an NSIS installer and a portable zip. The NSIS installer uses Tauri's default WebView2 mode, `downloadBootstrapper`.
- macOS: a universal app for Apple silicon and Intel, minimum macOS 11.0, plus a disk image.

## Players

The game player is Artix Ruffle 2.1.0, downloaded from `chaoslabs.artix.com`. The optional player is the Adobe Flash projector 32.0.0.465. This release does not download or ship stock Ruffle.

## Signing

The macOS build is ad-hoc signed. It is not notarized, and there is no Apple Developer ID certificate in this release. Windows and Linux packages are not code signed. macOS asks you to allow the app in Privacy & Security before it opens.

## Updates

NEO does not contain an in-app updater. Install a newer build from a `neo-v*` release. The classic Electron app updates Ruffle from `github.com/ruffle-rs/ruffle`, not from this repository, so this release is not offered there.
