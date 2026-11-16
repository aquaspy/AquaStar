AquaStar NEO plays with Artix Experimental Launcher 5.6.1's standalone Ruffle build, The BattleOn Engine, on Linux x64, Windows x64, and macOS. Artix published that launcher on November 13, 2026. There is no Windows ARM build.

The binaries report `Ruffle 0.7.1-local`. The Linux binary prints `VERGEN_IDEMPOTENT_OUTPUT` where a commit hash would be. Its build timestamp is `2026-11-13T20:39:10Z`. The Windows x64 binary prints commit `981db4db7e9b94e303ceae2967fbb5d7293ebb42` and the date `2026-11-13`. The macOS binary prints commit `fa80649a46b10c3b61d384ee53bf12614cf4a2c7` and the same date. The copy bundled with the launcher is licensed under the MIT license or the Apache License 2.0, at your option. The full text shipped with the 1.7.0 binary, which uses the same license, is `artix-ruffle-1.7.0-LICENSE.md`. The 5.6.1 AppImage extracts its own `LICENSE.md` beside `ruffle_desktop` when the pin is published.

The macOS build is one universal binary, `Artix Games Launcher · The BattleOn Engine`, for Apple silicon and Intel. `LC_BUILD_VERSION` and `LSMinimumSystemVersion` both say 11.0. The signature is ad hoc, identifier `com.artix.launcher.ruffle`. There is no separate stock Ruffle pin.

Artix's notes for this build say crowded AdventureQuest Worlds rooms run faster on laptops and weaker PCs.
