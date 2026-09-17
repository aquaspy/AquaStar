# Example Companion

Reference AquaStar plugin that exercises the Host API end-to-end.

## What it demonstrates

| Capability | Where |
|------------|--------|
| Primary “game” stage | `stage/index.html` — canvas box mover (arrows) + embedded SWF |
| Valid Flash binary | `assets/rectangle.swf` (minimal). Optional interactive `assets/boxmover.swf` from `flash/BoxMover.as` |
| Keybinds | Alt+N stage, Alt+G GitHub, Alt+R Releases, Alt+D plugin docs, Alt+E dashboard |
| Menus | App Useful Pages (in-place) + game menu (new-window) + Example submenu |
| Session rules | Custom header on `github.com` requests |
| Navigation hooks | Banner injection on AquaStar GitHub pages |
| Settings section | Demo name + tip toggle |
| Feature window + IPC + store | Dashboard (`persistent-store`, namespaced IPC, `net-fetch`) |
| Locales | `locales/en-US.js`, `pt-BR.js` |

## Try it

1. `npm start`
2. **Alt+9 → General** → Active plugin → **Example Companion** → Save → restart
3. Main window: move the box with arrow keys; confirm Flash embed loads
4. **Alt+G / Alt+R / Alt+D** open GitHub / Releases / `docs/PLUGINS.md`
5. **Alt+E** opens the dashboard (visit counter + GitHub API fetch)

## Flash source

See `flash/README.md` to compile `BoxMover.as` into `assets/boxmover.swf`. Without Flex SDK, the HTML canvas still demonstrates input and `rectangle.swf` still proves PPAPI Flash.

## Not a template

`plugins/_template/` stays minimal. This folder is the **worked example** — copy ideas from here, not the empty stub alone.
