# AquaStar NEO 1.0.1

A bug-fix release for macOS and Linux. Like 1.0.0, it is not marked Latest; classic AquaStar stays on the [Latest release](https://github.com/aquaspy/AquaStar/releases/latest).

**macOS now requires 12.3 or later.** Game capture uses ScreenCaptureKit, which starts at macOS 12.3. On macOS 11 through 12.2, keep using [AquaStar NEO 1.0.0](https://github.com/aquaspy/AquaStar/releases/tag/neo-v1.0.0).

## macOS

Thanks to @trizdev for these fixes ([#58](https://github.com/aquaspy/AquaStar/pull/58)), tested on macOS 27.

- **Shortcuts stay registered.** F2, Ctrl+J and the other global shortcuts no longer stop working after a game starts.
- **Capture works.** F2 and Ctrl+J capture the game window through ScreenCaptureKit, and the game keeps focus while you capture.
- **Capture feedback.** A blue outline flashes around the game after a screenshot, and a red outline stays on while recording. Native notifications say "Screenshot taken", "Recording started" and "Recording stopped". The outlines never appear in the capture.
- **Screen Recording permission.** If the switch is already on but macOS still blocks capture (common after replacing an older copy of the app), AquaStar NEO tells you to switch it off and back on, then quit and reopen the app.
- **Recording length.** Recordings keep the real length of what you recorded.
- Menus and the Keybinds page show Option and Cmd instead of Alt and Meta.

## All systems

- **Saved shortcuts apply immediately.** On Windows, macOS and X11 you no longer need to restart AquaStar NEO after changing a keybind.
- **Shortcuts in the launcher.** The menu shows each item's shortcut, and F2 and Ctrl+J also work while the launcher window is focused.

## Linux

- **The `.deb` no longer hangs at launch.** On some systems the desktop portal never answered, and AquaStar NEO waited forever without opening a window. It now waits at most 3 seconds and starts anyway.

## Downloads

| System | File |
| --- | --- |
| Windows 10 or 11 x64, installer | `aquastar-neo_1.0.1_x64-setup.exe` |
| Windows 10 or 11 x64, portable | `aquastar-neo_1.0.1_x64-portable.zip` |
| macOS 12.3 or later, Apple Silicon and Intel | `aquastar-neo_1.0.1_universal.dmg` |
| Debian or Ubuntu x64 | `aquastar-neo_1.0.1_amd64.deb` |
| Other Linux x64 | `aquastar-neo_1.0.1_amd64.AppImage` |
| Arch Linux x64 | `aquastar-neo-1.0.1-1-x86_64.pkg.tar.zst` |
| Arch Linux x64, AppImage using system libraries | `aquastar-neo_1.0.1_Arch-native_x86_64.AppImage` |

`PKGBUILD`, `default.SRCINFO` and `aquastar-neo-1.0.1.tar.gz` are the Arch build recipe and source. `AquaStar-media-sources.tar.xz` is the source of the bundled FFmpeg and OpenH264 recording component. The install notes from [1.0.0](https://github.com/aquaspy/AquaStar/releases/tag/neo-v1.0.0) still apply.

## Known gaps

- **macOS signing.** The app is ad-hoc signed and not notarized. If macOS says the app is damaged or can't be opened, move it to Applications and run `xattr -cr "/Applications/AquaStar NEO.app"`, or allow it under System Settings > Privacy & Security > Open Anyway.
- **Windows and Linux signing.** The packages are not code signed. If SmartScreen blocks the installer, choose More info, then Run anyway.
- **No in-app updater.** To update, download a newer `neo-v*` release.
- **Wayland.** Global shortcuts need the desktop's GlobalShortcuts portal and only work while a game is running, and you pick the game window in the system picker. See the 1.0.0 notes for GNOME and Hyprland.
