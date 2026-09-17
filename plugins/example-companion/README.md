# Example Companion

Reference AquaStar plugin. The **primary game is `assets/boxmover.swf`** — a compiled Flash movie where arrow keys move a blue square.

## What it demonstrates

| Capability | Where |
|------------|--------|
| Primary Flash game | `assets/boxmover.swf` (shipped, built from `flash/BoxMover.as`) |
| Extra launch | Static `assets/rectangle.swf` (no AS — contrast) |
| Keybinds | Alt+N new BoxMover, Alt+G GitHub, Alt+R Releases, Alt+D plugin docs, Alt+E dashboard |
| Menus | Pages + Example submenu from the plugin; AquaStar chrome stays Settings/Help/About |
| Session rules | Custom header on `api.github.com` only (never rewrite GitHub page UA) |
| Navigation hooks | Local inject-demo page (Alt+I) — GitHub DOM is not touched |
| Settings section | Demo name + tip toggle |
| Feature window | Dashboard (store, IPC, `net-fetch`) |
| Locales | `locales/en-US.js`, `pt-BR.js` |

## Try it

1. `npm start`
2. Alt+9 → **Example Companion** → Save → **restart**
3. Main window loads **BoxMover.swf** — click the window, use arrow keys
4. Alt+G / Alt+R / Alt+D / Alt+E for GitHub / docs / dashboard

## Rebuild the SWF

```bat
plugins\example-companion\flash\build.bat
```

See `flash/README.md`. The compiled `assets/boxmover.swf` is committed so users do not need Flex.
