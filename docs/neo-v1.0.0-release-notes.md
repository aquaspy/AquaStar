# AquaStar NEO 1.0.0

AquaStar NEO is a new AQW launcher built on Tauri 2. It is a separate app from classic AquaStar (the 2.x line, built on Electron). Classic AquaStar stays on the [Latest release](https://github.com/aquaspy/AquaStar/releases/latest), and this release is not marked Latest.

The launcher UI runs in the system webview. The game does not: AquaStar NEO starts it in a separate player process, Artix Ruffle or the Flash projector. The launcher stays open while you play, so the wiki and search stay usable. Turn on "Hide the launcher during gameplay" if you want it out of the way.

## Players

- **Artix Ruffle 2.1.0** is the default player. It is the Ruffle build Artix publishes for its own launcher, downloaded from `chaoslabs.artix.com` and checked against a pinned SHA-256. You choose quality (High by default) and the graphics backend (Automatic by default) in Preferences. If a backend crashes at startup, AquaStar NEO relaunches the game once with OpenGL (Metal on macOS).
- **Adobe Flash projector 32.0.0.465** is optional. It is an Intel build; on Apple Silicon, macOS runs it through Rosetta 2.
- Stock Ruffle is not included. A saved stock Ruffle choice switches to Artix Ruffle.

## Highlights

- Separate player process, with **Restart Ruffle** and **Restart Flash** in Preferences.
- One Preferences page (General, Adventure Quest Worlds, Keybinds) that saves as you edit.
- Screenshots and recording: F2 saves a PNG and Ctrl+J starts or stops an MP4 (H.264, up to 1080p at 30 FPS). Recordings are video only, with no audio. The encoder ships with the app.
- Wiki, account and news open in their own windows, with ads blocked.
- Inventory sync from your saved account session.
- Desktop plugins: install a local ZIP, review its permissions and enable it. Plugin tools run in isolated webviews. The AQW plugin is built in and includes a Char Page Studio tool. Saving PNG or GIF from Char Page Studio works on Windows only for now.
- Command line: `--aqw`, `--no-launcher`, `--game=<id>`, `--tool=<id>`, `--ruffle`, `--flash` and `--launcher`.
- AquaStar NEO reads your classic AquaStar profile (`aquastar.json`, reminders, to-do list and strategy), so existing settings carry over.

## What's new compared to classic AquaStar 2.x

- Tauri and the system webview instead of Electron 11.
- Games run in Artix Ruffle or the Flash projector instead of the PPAPI Flash plugin or Ruffle Web inside the app window.
- A native universal macOS app for Apple Silicon and Intel. Classic AquaStar on macOS is an Intel build.
- Native window capture on Windows, macOS, X11 and Wayland.
- A new plugin API. Classic Electron plugins do not work in AquaStar NEO.
- A Windows portable zip and a native Arch Linux package.

## What changed since the 3.0.0 release candidates

The `v3.0.0-rc` builds were early versions of this app. There is no AquaStar 3.x; that line is now AquaStar NEO. Since 3.0.0-rc.6:

- Renamed to AquaStar NEO. Packages and the executable are now `aquastar-neo`, and they replace the earlier `aqua-star` package on Debian and Arch.
- Artix Ruffle 2.1.0 replaces Artix Ruffle 1.7.0 and stock Ruffle 0.7.1.
- Settings moved into one Preferences page in the launcher, and Restart Ruffle and Restart Flash were added.
- Wayland: capture fixes, and global shortcuts through the GlobalShortcuts portal, with a Hyprland shortcut helper for Omarchy.
- New native Arch package and an Arch-native AppImage.
- Plugin shortcuts now survive a game start or exit.
- The remote wiki and account pages no longer get the app's core permissions, and they load over HTTPS only.

## Downloads

| System | File |
| --- | --- |
| Windows 10 or 11 x64, installer | `aquastar-neo_1.0.0_x64-setup.exe` |
| Windows 10 or 11 x64, portable | `aquastar-neo_1.0.0_x64-portable.zip` |
| macOS 11 or later, Apple Silicon and Intel | `aquastar-neo_1.0.0_universal.dmg` |
| Debian or Ubuntu x64 | `aquastar-neo_1.0.0_amd64.deb` |
| Other Linux x64 | `aquastar-neo_1.0.0_amd64.AppImage` |
| Arch Linux x64 | `aquastar-neo-1.0.0-1-x86_64.pkg.tar.zst` |
| Arch Linux x64, AppImage using system libraries | `aquastar-neo_1.0.0_Arch-native_x86_64.AppImage` |

Notes:

- The Windows installer downloads WebView2 if it is missing. The portable zip uses the WebView2 already on the system. Unzip it and run `aquastar-neo.exe`; it keeps its data in a `data` folder next to the executable.
- The `.deb` needs WebKitGTK 4.1. The Flash projector also needs GTK 2 and NSS; the AppImage carries its own copy of GTK 2.
- The Arch package and the Arch-native AppImage use the system libraries and download the players on first use. Flash on Arch needs GTK 2 from the AUR.
- `PKGBUILD`, `default.SRCINFO` and `aquastar-neo-1.0.0.tar.gz` are the Arch build recipe and source. `AquaStar-media-sources.tar.xz` is the source of the bundled FFmpeg and OpenH264 recording component.

## Known gaps

- **macOS signing.** The app is ad-hoc signed and not notarized. If macOS says the app is damaged or can't be opened, move it to Applications and run `xattr -cr "/Applications/AquaStar NEO.app"`, or allow it under System Settings > Privacy & Security > Open Anyway.
- **Windows signing.** The installer and the executable are not code signed. If SmartScreen blocks them, choose More info, then Run anyway.
- **No in-app updater.** To update, download a newer `neo-v*` release.
- **Wayland shortcuts.** Global shortcuts need the desktop's GlobalShortcuts portal and only work while a game is running. On GNOME without that portal, turn on "Use GNOME shortcuts for capture" in Preferences; it covers the capture keys only. Hyprland ignores the suggested keys, so use the Hyprland shortcuts helper on Omarchy or bind the actions yourself (`hyprctl globalshortcuts` lists them). Other Wayland desktops may need manual setup.
- **Wayland capture.** You pick the game window in the system picker. Desktops that only offer whole-monitor capture are not supported.
