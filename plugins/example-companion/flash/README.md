# BoxMover.swf

Interactive Flash movie shipped at `assets/boxmover.swf` (arrow keys move the blue square).

Source: `BoxMover.as` (AS3). Rebuild with Apache Flex `mxmlc` (requires `playerglobal.swc`):

```bat
REM From repo root, with Flex SDK available:
set FLEX_HOME=work\flex-sdk
%FLEX_HOME%\bin\mxmlc.bat -target-player=32.0 -swf-version=32 -default-size 550 400 -default-background-color=0x121212 -default-frame-rate=24 -static-link-runtime-shared-libraries=true -output=plugins\example-companion\assets\boxmover.swf plugins\example-companion\flash\BoxMover.as
```

`assets/rectangle.swf` remains a static shape-only SWF for comparison (no ActionScript).

`build-boxmover.js` is obsolete experimental AVM1 output — do not use it to replace the Flex-built SWF.
