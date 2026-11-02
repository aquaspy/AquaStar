# AquaStar NEO 1.0.3

This release updates the game player. Like earlier NEO releases, it is not marked Latest; classic AquaStar stays on the [Latest release](https://github.com/aquaspy/AquaStar/releases/latest).

## Artix Ruffle 3.5.0

AquaStar NEO now ships the player from [Artix Games Launcher 3.5.0](https://www.artix.com/experiments/artixexperimentallauncher/) (October 30, 2026) on Windows, macOS and Linux, replacing 3.0.0. The 3.5.0 is Artix's launcher version; this AquaStar NEO release is 1.0.3.

Improvements Artix lists for this player:

- **AQW map and character glows.** They are closer to Flash.
- **Maps stuck loading.** A map that stays on the loading screen is retried.

The Flash projector is still optional, and your quality and graphics settings carry over. The command-line hint in Preferences now shows `--ruffle3.5`.

## Downloads

| System | File |
| --- | --- |
| Windows 10 or 11 x64, installer | `aquastar-neo_1.0.3_x64-setup.exe` |
| Windows 10 or 11 x64, portable | `aquastar-neo_1.0.3_x64-portable.zip` |
| macOS 12.3 or later, Apple Silicon and Intel | `aquastar-neo_1.0.3_universal.dmg` |
| Debian or Ubuntu x64 | `aquastar-neo_1.0.3_amd64.deb` |
| Other Linux x64 | `aquastar-neo_1.0.3_amd64.AppImage` |
| Arch Linux x64 | `aquastar-neo-1.0.3-1-x86_64.pkg.tar.zst` |
| Arch Linux x64, AppImage using system libraries | `aquastar-neo_1.0.3_Arch-native_x86_64.AppImage` |

`PKGBUILD`, `default.SRCINFO` and `aquastar-neo-1.0.3.tar.gz` are the Arch build recipe and source. `AquaStar-media-sources.tar.xz` is the source of the bundled FFmpeg and OpenH264 recording component. The install notes from [1.0.0](https://github.com/aquaspy/AquaStar/releases/tag/neo-v1.0.0) still apply. On macOS 11 through 12.2, use [1.0.0](https://github.com/aquaspy/AquaStar/releases/tag/neo-v1.0.0).

## Known gaps

- **macOS signing.** The app is ad-hoc signed and not notarized. If macOS says the app is damaged or can't be opened, move it to Applications and run `xattr -cr "/Applications/AquaStar NEO.app"`, or allow it under System Settings > Privacy & Security > Open Anyway.
- **Windows and Linux signing.** The packages are not code signed. If SmartScreen blocks the installer, choose More info, then Run anyway.
- **No in-app updater.** To update, download a newer `neo-v*` release.
- **Wayland.** Global shortcuts need the desktop's GlobalShortcuts portal and only work while a game is running, and you pick the game window in the system picker. See the 1.0.0 notes for GNOME and Hyprland.
