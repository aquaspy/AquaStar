# AquaStar NEO development plan

**All implementation work on AquaStar NEO is done in pstack poteto-mode.** Use the pstack principles, and the pstack skills when a task calls for one.

AquaStar NEO is a separate product from classic AquaStar. Classic AquaStar is the Electron app on `main` and `dev`. NEO development is `neo-dev`. Stable NEO is `neo`. The version sequence starts at `1.0.0`. Tags use `neo-v*` (for example `neo-v1.0.0`). An `rc`, `alpha`, or `beta` tag is a prerelease. No NEO release is marked Latest. Latest stays the classic Electron release. The old `v3.0.0-*`, `v2.1.1-rc.*` and `lite-v*` tags and their releases were deleted on 2026-10-22.

The sections below record the earlier plan, when this launcher was called AquaStar 3.0 and lived in `desktop/`. The [product split on 21 October 2026](#product-split-21-october-2026) replaces that plan's branch and release rules.

## Goals

- Launch the same games from a small native shell, with the game in a standalone player.
- Match the Electron UI as closely as possible.
- Cover every desktop target that has a player and a supported system webview.
- Leave every SWF unchanged.
- Ship each phase from `neo-dev` as a pre-release after the smoke workflow passes.

## Non-goals

- Android or any other mobile build.
- PPAPI Flash, or Flash inside the webview.
- Porting the plugin host, local plugins, or the example companion.
- Char Page Studio, Alt+K char page print, and screen recording in 3.0.
- Editing any SWF.
- Publishing Lite as its own product.
- Moving the GitHub Latest release off the current stable before the 3.0 final.
- Merging to `main` without an explicit yes.

## Platform matrix

The shell uses the operating system's webview. Windows uses WebView2, macOS uses WKWebView, and Linux uses WebKitGTK 4.1. Tauri documents macOS 10.15 as its floor, and WebKitGTK 4.1 on Ubuntu 22.04, Debian 12, and Fedora 37. The current Lite config asks for macOS 11.0.

| System | 3.0 | Notes |
| --- | --- | --- |
| Windows 10 or later, x64 | Yes | WebView2. Artix player. |
| Windows 10 or later, x86 | Flash only | Artix 2.1.0 publishes no Windows x86 Ruffle build. The projector is the player used there. |
| Windows on ARM | Yes | Artix 2.1.0 windows-arm64. |
| Windows 7 and 8.1 | Stay on 2.x | WebView2 runtime 109 is the last one that starts. Runtime and SDK 110.0.1519.0 and higher do not support these systems. A 3.0 build counts only if one pinned to runtime 109 actually launches. |
| macOS 11 and later, Apple silicon | Yes | Artix player. |
| macOS 11 and later, Intel | Yes | The same Artix 2.1.0 universal binary as Apple silicon. |
| macOS 10.15 | Only if a build runs | Tauri's documented floor is 10.15. The current config asks for 11.0, so 10.15 is in only after that floor is lowered and a launch works. |
| macOS below 10.15 | Stay on 2.x | |
| Linux x64 with WebKitGTK 4.1 | Yes | Artix player. |
| Linux i686 with WebKitGTK 4.1 | No player | Artix 2.1.0 publishes no i686 build, and there is no projector pin. |
| Linux aarch64 with WebKitGTK 4.1 | No player | Artix 2.1.0 publishes no aarch64 build, and there is no projector pin. |
| Older Linux without WebKitGTK 4.1 | Stay on 2.x | |
| Android | No | |

## Player matrix

The players that ship are in `players.json`. Ruffle is Artix 2.1.0 on Linux x64, Windows x64, Windows ARM, and macOS. One universal macOS zip covers Apple silicon and Intel. The Flash projector 32.0.0.465 is optional and is never the default. Linux i686 and Linux aarch64 have no player pin. Windows x86 has the projector only. AquaStar NEO does not pass `--performance-mode`. Artix's default is `auto`.

| Target | Default | Also available |
| --- | --- | --- |
| Windows x64 | Artix 2.1.0 | Flash projector. The pinned Windows projector is a 32-bit program. |
| Windows ARM | Artix 2.1.0 | No projector pin. |
| Windows x86 | Flash projector | No Ruffle pin. |
| Linux x64 | Artix 2.1.0 | Flash projector for Linux x64. |
| Linux i686 | None | No Ruffle pin and no projector pin. |
| Linux aarch64 | None | No Ruffle pin and no projector pin. |
| macOS arm64 | Artix 2.1.0 universal | The pinned macOS projector is an Intel build. |
| macOS x64 | Artix 2.1.0 universal | Flash projector. |

The Artix binary accepts `--title`, `--companion`, `--companion-name`, `--tcp-connections allow`, `--graphics`, `--quality`, and `--performance-mode`. Every Ruffle launch passes `--title`. On Linux the existing `flash_gtk.c` preload sets the projector window title, because the projector has no title flag. The paragraphs further down that still name stock Ruffle 0.7.1 describe the earlier plan.

## Feature migration

| Feature | 3.0 | What happens |
| --- | --- | --- |
| Play AQW | Migrate | The shell starts the standalone player with the loader URL. |
| Live loader URL | Migrate | Fetch the loader from the Artix Game Launcher page, cache it, and fall back to the built-in URL. |
| Custom SWF and custom URL | Migrate | A custom SWF still wins over a custom URL. |
| DragonFable | Migrate | Same menu entry, aimed at the standalone player. |
| AQW testing instance | Drop | Obsolete. Remove its loader, menu and Alt+Q from both 2.x and 3.x. |
| Window title, fullscreen, quality, graphics | Migrate | Artix flags, including `--title`. |
| Menus and Useful Pages | Migrate | URLs and labels come from the game JSON. |
| Wiki, design notes, account, char page, gifts, calendar, forge, heromart, portal, Twitter, Reddit | Migrate | Open in the shell browser or the system browser. |
| Ad and navigation cleanup | Migrate | A document script on the loader page, as Lite does now. |
| WikiView hover, badges, server switcher, merge calculator | Migrate | The hover image is fetched in Rust. The other tools are first-party pages. |
| Account sync and inventory | Migrate | Login and inventory HTTP run in Rust. |
| Reminders, to-do, strategy, timer | Migrate | Same JSON files the Electron app already writes. |
| Settings and languages | Migrate | Same `aquastar.json` fields the shell still uses, and the existing locale files. The UI matches Electron. |
| Web tools site | Migrate | Already a static site. |
| Single instance and the about window | Migrate | One running shell, and an about window that shows the shell version. |
| PPAPI Flash and the in-page Ruffle | Drop | The game runs in a standalone player. |
| Socket proxy and Pepper trust | Drop | The player opens its own sockets. |
| Plugin host and local plugins | Drop | A game JSON file plus first-party pages. |
| Char Page Studio | Drop (superseded) | Originally dropped. The 3.x launcher now ships it as a tool of the bundled plugin: the scene opens in its own Ruffle window instead of an embedded Flash. See `README.md`. |
| Alt+K char page print | Drop | Stays on the 2.x branch. |
| Screen recording and F2 capture | Drop | Stays on the 2.x branch. |
| Record the player window to MP4 | 3.1 | Native capture of the standalone player window. |

## Architecture

The launcher lives at the repository root. The notes in this section describe the earlier `desktop/` layout and are kept as history.

The shell is a Tauri 2 window. The game is a separate process started with `std::process::Command`. The shell watches that process and closes it when the game window closes.

Each game is a JSON manifest. The manifest lists URLs, menu entries, player flags, and which first-party pages exist. Those pages ship with the app. They call a fixed set of Tauri commands. Each window has a capability file that allows only the commands that page needs. The shell ships its own pages and loads no outside plugin code.

AdventureQuest Worlds content moves out of `plugins/adventure-quest-worlds/` into that manifest and the first-party pages. The platform side keeps naming no game.

Two Linux workarounds already in Lite stay. `WEBKIT_DISABLE_DMABUF_RENDERER=1` avoids the WebKit DMA-BUF memory growth and the NVIDIA blank window. The fontconfig allowlist stops WebKit from scanning a huge font set at startup.

The repo stores pin URLs in `players.json`. The first launch downloads the pinned Artix player and, on targets that have one, the Flash projector. Bundle a player into the installer only after its license allows it.

Before the first commit that changes the product, cut `electron-2.x` from `dev`. That branch is the Electron 2.x line. This plan can live on both branches.

## How the work ships

Work lands on `neo-dev` by direct commit. Stable NEO is `neo`. Do not open pull requests for NEO work.

`.github/workflows/desktop-release.yml` builds this tree for `neo-v*` tags. A tag with `-rc`, `-alpha`, or `-beta` is a prerelease. A `neo-v*` tag without those suffixes is a stable NEO release. Both pass `--latest=false`. Latest stays the classic Electron release. Do not push a `v*` or `v3.0.0-*` tag for a NEO build. The old `v3.0.0-*` tags were deleted on 2026-10-22.

Each finished phase is a pre-release. The smoke workflow has to pass on the tagged commit.

Do not merge NEO into `main`. `main` and `dev` are the classic Electron line. Later paragraphs that still name `v3.0.0`, `desktop/`, and `2.x` describe the plan before the product split.

## Phased plan

Each phase ends the same way. The smoke workflow passes, the phase is tagged as a pre-release on the Tauri workflow, and Latest does not move.

### 1. Player matrix

Keep growing `desktop/` into the 3.0 shell. Launch the Artix binary by default where a pin exists. Keep the projector selectable and off by default. Carry over the live loader, custom SWF, custom URL, and DragonFable.

The check is that `cargo test` passes and smoke passes for an Artix launch on Linux x64, Windows x64, and macOS.

### 2. Settings and list windows

Rebuild settings, reminders, to-do, and strategy so they match the Electron windows and use the same JSON files.

The check is that an Electron profile fixture opens in 3.0 and those four windows show the values in the fixture.

### 3. Account, inventory, and wiki

Move login, inventory sync, and the wiki hover fetch into Rust. Ship badges, the server switcher, and the merge calculator as first-party pages.

The check is that saved HTTP fixtures fill the inventory list and the hover image, with no live account in the test.

### 4. Menus and the dropped features

Read Useful Pages, locales, and the about window from the game manifest and the existing locale files. Remove Char Page Studio, Alt+K, and screen recording from the 3.0 package. They remain on `electron-2.x`.

The check is that a test visits every Useful Page URL in the manifest, and the 3.0 package listing contains no studio program, no recording command, and no Alt+K binding.

### 5. Final

Switch the stable release path to the Tauri app and tag `v3.0.0` only when the user says this replaces Electron as the current release. Merge to `main` only with a separate explicit yes.

Reorganize the branches at that point.

- `main` is the 3.x stable line.
- `dev` is 3.x development.
- `2.x` is the 2.x stable line and replaces `electron-2.x`.
- `2.x-dev` is 2.x development.

Delete old unused branches only after listing them and getting the user's explicit approval for each deletion. Do not rename or delete a branch while this paragraph is only a plan.

Inventory sync reported success and wrote no items. The account page now returns rows from `https://account.aq.com/AQW/InventoryData` as arrays (`Name xN`, type, code, Inv or Bank, Gold or AC, Free or Member, date). 3.0 was still calling `myapi/inventory/InventoryData` and treating `{ "data": [] }` as a finished sync. The button then said `AquaStar: Synced!`. Alpha.7 reads the account-page URL, still accepts the older object rows when that URL is empty, and refuses to write or report success when both lists have no named item. The inventory window also ships `inventory_worker.js`, which the page already starts. A saved array fixture covers the account-page shape.

The stable tag path is prepared in `desktop-release.yml` and is not executed. A `v3.0.0` tag publishes a release that is not a prerelease and is not Latest. A `v3.*-*` tag stays a prerelease and is not Latest. Electron's release workflow still ignores every `v3.` tag. Moving Latest, tagging `v3.0.0`, merging to `main`, and renaming or deleting branches each still need their own yes.

Branches that stay:

- `main` becomes the 3.x stable line. It is not deleted.
- `dev` stays 3.x development.
- `electron-2.x` is the rename source for `2.x`. It is not deleted.
- `2.x-dev` does not exist yet. Creating it is part of the rename, not a deletion.
- `cursor/electron-mac-zip-symlinks-99c5` has two commits that are not in `electron-2.x` (the mac zip symlink unpack, and the 2.1.1-rc.7 bump). It is not on the deletion list.

Proposed deletions. Each one still needs its own yes.

Tips already contained in `dev` and `electron-2.x`:

- `cursor/linux-hicolor-icons-ef66`. Hicolor icon sizes, already on both kept lines.
- `cursor/lite-l1-player-391a`. One Flash projector, already on both kept lines.
- `cursor/lite-windows-portable-3cae`. Portable zip notes, already on both kept lines.
- `cursor/native-ruffle-capture-69e9`. Capture naming, already on both kept lines.
- `cursor/prerelease-release-flags-9a26`. Prerelease flags, already on both kept lines.

No shared history with `main`, `dev`, or `electron-2.x`. Deleting the branch drops those commits. A tag named below keeps the tip commit if the tag stays.

- `1.10`. Old 1.10 line from August 2026. The `v1.10.*` tags are separate.
- `aquastar-lite`. First Tauri proof of concept. The current `desktop/` tree is on `dev`.
- `bump-2.1.1-rc.1`. Version-bump branch. `main` already carries the 2.1.1-rc.1 release.
- `cursor/lite-port-plan-391a`. Early Lite port notes. The 3.0 plan replaced them. The branch still has text that is not in `electron-2.x`.
- `cursor/lite-ruffle-settings-c45f`. Ruffle quality settings. Those settings are on `dev`.
- `dev-star`. 2024 ARM Flash experiment.
- `flash-artix`. Old upstream merge for the Artix Flash build.
- `herosmash`. 2021 HeroSmash rebrand. The tip is already tagged `beta0.2+hs0.0.1`.
- `launcher-perf`. Spellchecker experiment from October 2026.
- `lite-blank-window-fix`. Linux blank-window fix. The later Lite tree has that fix.
- `lite-cleanup`. Lite cleanup branch. The later Lite tree has that cleanup.
- `lite-release-workflow`. First `lite-v*` release workflow. The current workflow is on `dev`.
- `lite-webkit-fontconfig`. WebKit font allow-list. That allow-list is on `dev`.
- `master`. 2024 merge of `dev-star`. Stale name, not the current `main`.
- `perf-review`. Ruffle quality test formatting.
- `plugins`. Old build-path fix for plugins.
- `pstack-models`. The per-role model rule. The rule file is on `dev`.
- `release-2.1.0`. 2.1.0 bump branch. Tag `v2.1.0` is separate.
- `ruffle-native`. Ruffle desktop experiment.
- `ruffle-native-bundled`. Bundled Ruffle desktop experiment.
- `ruffle-native-gl`. OpenGL default for Ruffle desktop. That behavior is on `dev`.
- `ruffle-native-prune`. Prune old downloaded Ruffle versions.
- `strategyboard`. September 2026 strategy board merge fix.
- `update-flash34-ruffle071`. Flash 34 and Ruffle 0.7.1 pin. That Ruffle pin was removed. Artix 2.1.0 is the Ruffle pin that ships.

The check is that the user has confirmed the stable tag, smoke passed on that commit, and any merge to `main` has its own confirmation. A branch rename or deletion also needs its own approval.

## Launcher UI review before stable

The user confirmed that 3.0 keeps the game in its standalone player window. Embedding or reparenting the player is not planned for this release. The launcher receives its own visual design while keeping the migrated tools and the existing system webview requirements.

The proposal and compatibility checklist live in [launcher-3.0-ui.md](design/launcher-3.0-ui.md). Its HTML preview is a design artifact, not the shipped launcher.

Stable publication remains on hold for the performance and interface review. The user verified the corrected Buy Back sync with an authenticated account. The Electron 2.1.1-rc macOS game-size improvement must remain intact while the early-activation startup error is corrected.

## Risks

- WebView2 109 is frozen. A current Tauri build links a newer WebView2 and will not start on Windows 7 or 8.1. Those systems stay on 2.x unless a 109-pinned build is proven.
- macOS below 10.15 cannot follow Tauri's documented floor. macOS 10.15 still has to be proven, because the current config asks for 11.0.
- Linux without WebKitGTK 4.1 stays on 2.x.
- The Artix player is an unsigned binary pinned by URL. Treat an upstream URL change as a new pin, with a smoke run, before a release.
- The removed stock Ruffle build had no `--title` or `--companion`. The Artix 2.1.0 pin accepts both, and every Ruffle launch passes `--title`.
- Windows on ARM had no desktop player in the Ruffle 0.7.1 release. Artix 2.1.0 publishes a windows-arm64 build, and that is the pin that ships.
- The shell should use less memory than Electron. The player process is still there. Measure a real session before quoting a savings.
- The Electron app rewrites the User-Agent on `*.aq.com` page loads. The game no longer loads in the shell webview, so that rewrite has nothing to attach to. Confirm the Artix player is accepted without it.
- Linux WebKit still needs the DMA-BUF switch and the font allowlist. Dropping either one brings back the memory growth, the NVIDIA blank window, or the startup hang.
- macOS signing is ad-hoc today. A hardened, notarized build is separate work and is not required to ship a pre-release.

## Resolved decisions

1. AquaStar 3.0 fully replaces the Electron app. The 2.x line stays maintained on `electron-2.x` for people who prefer the old launcher. `desktop/` evolves into 3.0. The `lite-v0.2.0` pre-releases were the lab. Lite is not released as a separate product.
2. Support as many desktop systems as the matrix above allows. The Ruffle pin that ships is Artix 2.1.0. The Flash projector remains an option where the platform has one, and it is never the default. Linux i686 and Linux aarch64 have no player. Windows x86 uses the projector. PPAPI is dropped. There is no Android build. Windows 7, Windows 8.1, and macOS below 10.15 stay on 2.x unless a Tauri build is shown to run. WebView2 runtime 109 is the last runtime for Windows 7 and 8.1.
3. Char Page Studio, Alt+K char page print, and screen recording, including F2 capture, are dropped for 3.0. Native MP4 recording of the standalone player window is a possible 3.1 item.
4. The UI matches the Electron UI as closely as possible. No SWF is modified.
5. The plugin host is not ported. Each game is a JSON manifest. First-party pages sit on a fixed Tauri command API, with a capability file per window.
6. All implementation work on 3.0 is done in pstack poteto-mode, using the pstack principles and skills where warranted.
7. Commit directly to `dev`. Do not open pull requests. Ship each phase as a pre-release with the smoke workflow passing. Latest stays the current stable until the 3.0 final. Never merge to `main` without an explicit confirmation.

## Sources

- WebView2 runtime 109 is the last runtime for Windows 7 and 8.1, per [Introduction to Microsoft Edge WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/).
- The Artix 2.1.0 player archives are the Linux x64 zip, the macOS universal zip, and the Windows zip of per-arch zips under https://chaoslabs.artix.com/Ruffle/2.1.0/. The pins are `players.json`.
- Player pins and the current macOS floor are `players.json` and `src-tauri/tauri.conf.json`.

## Repository organization completed, 17 October 2026

The user authorized the agreed branch cleanup and file organization before stable publication. This instruction supersedes the earlier sequencing that deferred branch organization until the stable tag.

- `electron-2.x` was renamed to `2.x`; `2.x-dev` was created at the same maintenance commit.
- The 29 previously listed and approved obsolete branches were deleted after creating and verifying a complete local Git bundle. Exact-tip leases prevented deleting a branch that had advanced after review.
- The remote now has only `main`, `dev`, `2.x`, `2.x-dev`, and the explicitly preserved `cursor/electron-mac-zip-symlinks-99c5`.
- `main`, existing tags, and GitHub Latest were unchanged. No stable release was published. The merge and stable publication still require their separate explicit approvals.
- The [repository map](REPOSITORY.md) documents source, shared assets, examples, documentation, and generated files. Local builds, SDK, worktrees, backups, and reports are grouped in the sibling `AquaStar-workspace/` directory. The previous local-build path remains a compatibility link.

## Candidate releases authorized, 17 October 2026

The user requested the updated public README and fresh pre-releases for both maintained lines before production testing. The next candidates are `v3.0.0-rc.2` from `dev` and `v2.1.1-rc.8` from `2.x-dev`. The existing `v2.1.0` pre-release and earlier tags remain unchanged. The README can be updated on the default branch without merging the application changes. Stable tags, promotion to production, and changing Latest remain outside this authorization.

## Desktop naming and candidate update, 17 October 2026

The user requested renaming the active `lite/` source to `desktop/`, removing retired Tauri snapshots from the other branches, and deleting the previously preserved cursor branch. That branch tip is preserved in the verified pre-cleanup bundle. The final candidate tags for this revision are `v3.0.0-rc.3` and `v2.1.1-rc.9`; the already pushed `rc.2` and `rc.8` builds were canceled before publication when these changes were requested. Those tags were not moved at the time. The old `v3.0.0-*`, `v2.1.1-rc.*` and `lite-v*` tags and their releases were deleted on 2026-10-22.

The public product name is AquaStar NEO. Release numbers remain on the 3.x sequence. The executable and package names use AquaStar NEO; the stable application identifier remains unchanged so profiles, portal grants and shortcut bindings continue to work. Debian candidate control versions use the `~rc` form so that a later stable version sorts after its candidate. Public filenames identify the product, candidate, and architecture. The README compares the Artix/AE patched standalone player in 3.x with the browser Ruffle used in 2.x; Intel Mac uses the official standalone pin.

## Product split, 21 October 2026

The owner approved a repository split. AquaStar NEO is no longer AquaStar 3.0, and it does not replace the Electron app.

- This tree is NEO only. The launcher, plugins, scripts, and workflows live at the repository root. The Electron application is not in this tree.
- `neo-dev` is NEO development. `neo` is the NEO stable branch. Classic Electron `main` and `dev` are a separate history.
- The version in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` is `1.0.0`. The Cargo package and binary stay `aquastar-neo`. The bundle identifier stays `io.github.aquaspy.aquastar-lite`, so existing settings, portal grants, and shortcut bindings keep their directory.
- Release tags are `neo-v*`. An `rc`, `alpha`, or `beta` tag is a prerelease. No NEO release is marked Latest. The old `v3.0.0-*`, `v2.1.1-rc.*` and `lite-v*` tags and their releases were deleted on 2026-10-22.
- CI for this tree runs on pushes to `neo` and `neo-dev`.
