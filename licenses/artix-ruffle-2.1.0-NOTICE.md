AquaStar NEO plays with Artix Experimental Launcher 2.1.0's standalone Ruffle build on Linux x64, Windows x64, Windows ARM, and macOS.

That build reports `Ruffle 0.7.1-local`. The Linux binary prints `VERGEN_IDEMPOTENT_OUTPUT` where a commit hash would be. The Windows x64 binary prints commit `fa436684c651b1f2f7641aa86b542f15fa7c793a` and the date `2026-10-21`. The macOS universal binary prints commit `ac40277aa8a119f5c309ddbbff9e29234a1eafa7` and the same date. The copy bundled in the launcher's AppImage is licensed under the MIT license or the Apache License 2.0, at your option. The full text shipped with the 1.7.0 binary, which uses the same license, is `artix-ruffle-1.7.0-LICENSE.md`. The 2.1.0 AppImage also extracts its own `LICENSE.md` beside `ruffle_desktop` when the pin is published.

The macOS build is one universal binary, `Artix Games Launcher · Ruffle`, for Apple silicon and Intel. There is no separate stock Ruffle pin.
