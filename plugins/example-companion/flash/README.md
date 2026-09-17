# BoxMover.swf

ActionScript 3 source for a tiny interactive Flash movie (arrow keys move a square).

## Build (optional)

Requires [Apache Flex SDK](https://flex.apache.org/) `mxmlc` on PATH:

```bash
mxmlc -static-link-runtime-shared-libraries=true -output ../assets/boxmover.swf BoxMover.as
```

Then point `stage/index.html` at `../assets/boxmover.swf` (it already prefers `boxmover.swf` when present, else falls back to `rectangle.swf` + the HTML canvas demo).

AquaStar does **not** ship a Flex toolchain; the example plugin’s primary window is `stage/index.html`, which always demonstrates keyboard input and embeds a valid SWF so PPAPI Flash loads.
