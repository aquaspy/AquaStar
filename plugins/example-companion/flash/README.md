# BoxMover.swf (interactive Flash)

`assets/rectangle.swf` is a **static** SWF from the Flash file-format examples (purple/lavender field + shape). It only proves PPAPI Flash loads — it has **no ActionScript**.

The playable demo (arrow keys) lives in `stage/index.html` (HTML canvas) so the example plugin works without a Flex/Animate toolchain.

## Build an interactive SWF (optional)

Requires [Apache Flex SDK](https://flex.apache.org/) `mxmlc` on PATH:

```bash
mxmlc -static-link-runtime-shared-libraries=true -output ../assets/boxmover.swf BoxMover.as
```

When `assets/boxmover.swf` exists and is a real movie (>200 bytes), the stage embed prefers it over `rectangle.swf`.

> `build-boxmover.js` is an experimental AVM1 bytecoder — do not ship its output unless FFDec decompiles it cleanly to readable AS2.
