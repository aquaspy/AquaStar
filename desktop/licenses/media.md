# Recording component notices

AquaStar invokes FFmpeg as a separate executable. The minimal build enables OpenH264 and FFmpeg's native AAC encoder; it does not enable GPL/nonfree features or libx264.

| Component | Source | License |
| --- | --- | --- |
| FFmpeg 8.1.3 | https://ffmpeg.org/releases/ffmpeg-8.1.3.tar.xz | LGPL 2.1 or later |
| OpenH264 2.6.0 | https://github.com/cisco/openh264/tree/v2.6.0 | BSD 2-clause |

The corresponding unmodified source archives, SHA-256 values and complete build recipe are provided by [`build-media.py`](../scripts/build-media.py). The generated `media/licenses-<os>-<arch>/` directory includes the actual license texts and a manifest with source URLs, hashes and build flags. Build the source bundle with `--source-bundle` when distributing the compiled component; the desktop release workflow publishes it separately from the installer.

The native capture code also uses XCap (Apache 2.0), windows-capture and wasapi (MIT), ashpd and PipeWire Rust bindings (MIT), and libpulse-binding (MIT/Apache 2.0). Their source versions are recorded in Cargo.lock. Operating-system multimedia libraries are supplied by the operating system.

Preserve the names, source availability, license texts and build recipe when redistributing these components. This feature does not modify the bundled game players or their notices.
