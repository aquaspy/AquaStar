AquaStar NEO plays with Artix Experimental Launcher 2.1.0's standalone Ruffle build on Linux x64, Windows x64, Windows ARM, and macOS.

That build reports `Ruffle 0.7.1-local` and does not print a commit hash. The copy bundled in the launcher's AppImage is licensed under the MIT license or the Apache License 2.0, at your option. The full text shipped with the 1.7.0 binary, which uses the same license, is `artix-ruffle-1.7.0-LICENSE.md`. The 2.1.0 AppImage also extracts its own `LICENSE.md` beside `ruffle_desktop` when the pin is published.

The macOS build is one universal binary, `Artix Games Launcher · Ruffle`, for Apple silicon and Intel. There is no separate stock Ruffle pin.
