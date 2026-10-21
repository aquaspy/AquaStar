# SPA 0.3.48 header compatibility

This is libspa 0.10.1 from https://crates.io/crates/libspa/0.10.1 (MIT), with compatibility patches in `src/param/video/raw.rs` and `src/buffer/meta.rs`.

Ubuntu 22.04 supplies PipeWire/SPA 0.3.48 headers. The upstream Rust wrapper names the newer `flags` member and assumes an unsigned modifier; those headers have no named flags field and declare a signed modifier. This fails compilation even with all newer version features disabled.

Initialize the raw POD with the same zero defaults; expose flags only with the existing `v0_3_65` feature, whose dependency checks require newer headers; cast modifier bits to the generated type. AquaStar does not use the newer flags API. No C struct layouts or system headers are replaced, and no runtime minimum is raised.

Keep the original license and other sources intact. Verify this patch with Ubuntu 22.04 CI and the current local SDK. Remove the patch when an upstream release supports these headers with the same behavior.

The metadata helpers also use their equivalent field expressions (`data`, nonzero width/height), because the older headers do not expose the newer inline functions to bindgen.
