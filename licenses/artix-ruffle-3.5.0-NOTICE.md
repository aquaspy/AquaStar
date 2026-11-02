AquaStar NEO plays with Artix Experimental Launcher 3.5.0's standalone Ruffle build on Linux x64, Windows x64, Windows ARM, and macOS.

That build reports `Ruffle 0.7.1-local`. The Linux binary prints `VERGEN_IDEMPOTENT_OUTPUT` where a commit hash would be. The Windows x64, Windows ARM, and macOS binaries print commit `d3ab5426a7507ae18f57ca64ecb79488718baeef` and the date `2026-10-30`. The copy bundled in the launcher's AppImage is licensed under the MIT license or the Apache License 2.0, at your option. The full text shipped with the 1.7.0 binary, which uses the same license, is `artix-ruffle-1.7.0-LICENSE.md`. The 3.5.0 AppImage also extracts its own `LICENSE.md` beside `ruffle_desktop` when the pin is published.

The macOS build is one universal binary, `Artix Games Launcher · Ruffle`, for Apple silicon and Intel. Its minimum system version is 11.0. There is no separate stock Ruffle pin.

Artix's notes for this build say AQW map and character glows are closer to Flash, and a map that stays on the loading screen is retried.
