AquaStar NEO plays with Artix Experimental Launcher 4.6.0's standalone Ruffle build, The BattleOn Engine, on Linux x64, Windows x64, and macOS. Artix published that launcher on November 6, 2026. There is no Windows ARM build.

The binaries report `Ruffle 0.7.1-local`. The Linux binary prints `VERGEN_IDEMPOTENT_OUTPUT` where a commit hash would be. The Windows x64 binary prints commit `26625e19d12f82209bf15602508e0008364b26bf` and the date `2026-11-04`. The macOS binary prints commit `38b4c97b6c412cca5ce588c63411870f1a3acc28` and the same date. The copy bundled with the launcher is licensed under the MIT license or the Apache License 2.0, at your option. The full text shipped with the 1.7.0 binary, which uses the same license, is `artix-ruffle-1.7.0-LICENSE.md`. The 4.6.0 AppImage extracts its own `LICENSE.md` beside `ruffle_desktop` when the pin is published. That file is the same text as the 3.5.0 copy.

The macOS build is one universal binary, `Artix Games Launcher · The BattleOn Engine`, for Apple silicon and Intel. `LC_BUILD_VERSION` and `LSMinimumSystemVersion` both say 11.0. The signature is ad hoc, identifier `com.artix.launcher.ruffle`. There is no separate stock Ruffle pin.

Artix's notes for this build rename the engine The BattleOn Engine and say busy rooms load faster.
