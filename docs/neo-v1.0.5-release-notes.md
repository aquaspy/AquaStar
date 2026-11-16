# AquaStar NEO 1.0.5

This release updates the game player. Like earlier NEO releases, it is not marked Latest; classic AquaStar stays on the [Latest release](https://github.com/aquaspy/AquaStar/releases/latest).

## Artix Experimental Launcher 5.6.1

AquaStar NEO now ships the player from [Artix Experimental Launcher 5.6.1](https://www.artix.com/experiments/artixexperimentallauncher/), The BattleOn Engine (November 13, 2026), on Windows, macOS and Linux, replacing 4.6.0. The 5.6.1 is Artix's launcher version; this AquaStar NEO release is 1.0.5.

Improvements Artix lists for this player:

- **Crowded rooms in AdventureQuest Worlds** run faster on laptops and weaker PCs. In Artix's tests, up to about 40% faster on a budget laptop and about 17% on an entry-level laptop with 4 GB of memory. Fast desktop PCs and high-end tablets run about the same.
- **Weaker computers and phones** that draw on the processor draw quicker.
- **Intel laptops** with built-in graphics should have far fewer long freezes.
- **NVIDIA and Intel graphics** draw glows and shading on armor and spells in fewer steps, for more FPS. Windows also uses less graphics memory.
- **Smoother motion.** 60 FPS games now really run at 60 on a 60 Hz screen, Linux is even on 120 and 144 Hz screens, and very fast (280 Hz and up) and variable-refresh monitors (G-SYNC, FreeSync, ProMotion) should no longer step the picture back and forth. On Windows, a game window that isn't in front keeps its pace better.
- **The game closes less** on phones and 4 GB PCs. It now checks how much memory a job needs first; if it doesn't fit, it draws that one thing another way and keeps playing instead of closing. Pressing Home frees memory at once.
- **4 GB Windows PCs.** Running out of memory is much less likely to end the game with an error: it slows down and plays on.
- **Scrolling** feels right with a Mac trackpad and a Windows mouse wheel. You can drag to select text in game text boxes.
- **AdventureQuest Worlds.** Colour-custom capes, tails and armors (Cunning Fox Tail CC, Oblivion Cloak, Archfiend Cloak of Nulgath) no longer flash their original colours. Glows, rays and portals are no longer too dim. The camera tool colour box takes typing again.
- **DragonFable.** Your character no longer shows up somewhere else when a fight starts. The Chaosweaver's red bottles look right. The first letter of a bold word no longer goes missing at the end of a dialogue line.
- **AMD Radeon on Windows.** Green dots and coloured squares on big pictures are gone. The fix costs a little speed in the heaviest rooms, but in Artix's tests those laptops are still faster than before.
- **With little memory,** the game draws some things straight to the screen to stay open, so crowded rooms can be slower there (25 to 35% in Artix's test with 3.5 GB).
- **Memory.** 4 GB is the minimum Artix lists, and 8 GB is recommended.

Artix also lists these Windows fixes as potentially fixed, because they could not test every device: crashes on Intel laptops with an older driver, the game closing with "Parent device is lost" on NVIDIA cards, and DragonFable stalls of up to a second on Battle Speed Fastest.

The Flash projector is still optional, and your quality and graphics settings carry over. The command-line hint in Preferences now shows `--ruffle5.6`.

## Downloads

| System | File |
| --- | --- |
| Windows 10 or 11 x64, installer | `aquastar-neo_1.0.5_x64-setup.exe` |
| Windows 10 or 11 x64, portable | `aquastar-neo_1.0.5_x64-portable.zip` |
| macOS 12.3 or later, Apple Silicon and Intel | `aquastar-neo_1.0.5_universal.dmg` |
| Debian or Ubuntu x64 | `aquastar-neo_1.0.5_amd64.deb` |
| Other Linux x64 | `aquastar-neo_1.0.5_amd64.AppImage` |
| Arch Linux x64 | `aquastar-neo-1.0.5-1-x86_64.pkg.tar.zst` |
| Arch Linux x64, AppImage using system libraries | `aquastar-neo_1.0.5_Arch-native_x86_64.AppImage` |

`PKGBUILD`, `default.SRCINFO` and `aquastar-neo-1.0.5.tar.gz` are the Arch build recipe and source. `AquaStar-media-sources.tar.xz` is the source of the bundled FFmpeg and OpenH264 recording component. The install notes from [1.0.0](https://github.com/aquaspy/AquaStar/releases/tag/neo-v1.0.0) still apply. On macOS 11 through 12.2, use [1.0.0](https://github.com/aquaspy/AquaStar/releases/tag/neo-v1.0.0).

## Known gaps

- **macOS signing.** The app is ad-hoc signed and not notarized. If macOS says the app is damaged or can't be opened, move it to Applications and run `xattr -cr "/Applications/AquaStar NEO.app"`, or allow it under System Settings > Privacy & Security > Open Anyway.
- **Windows and Linux signing.** The packages are not code signed. If SmartScreen blocks the installer, choose More info, then Run anyway.
- **No in-app updater.** To update, download a newer `neo-v*` release.
- **Wayland.** Global shortcuts need the desktop's GlobalShortcuts portal and only work while a game is running, and you pick the game window in the system picker. See the 1.0.0 notes for GNOME and Hyprland.
