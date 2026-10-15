# Port the companion onto AquaStar Lite

Electron stays the main AquaStar app permanently. Lite is the light alternative. The game stays an external process, and the shell webview never hosts Flash. Flash standalone is the default player on Linux, Windows, and macOS. Ruffle stays available. This program is L1, then L2, then L3. Inventory sync, recording, and a second game process are out. Appendix H lists what is deferred.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `pstack/skills/poteto-mode/playbooks/autopilot-stack.md`. The operator lands the stack. L1, L2, and L3 stop at stack-ready. The owner does not merge them. The operator's remaining questions are in Appendix A.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

Feature facts are Appendix F. The include, later, and drop calls are Appendix G. What Lite already does is Appendix E.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] Read these from trunk at program start. Re-read them at every tick.
  - [ ] `git show origin/main:pstack/skills/poteto-mode/playbooks/autopilot-stack.md`
  - [ ] `git show origin/main:pstack/skills/poteto-mode/playbooks/autopilot-full.md`
  - [ ] `git show origin/main:pstack/skills/swarm/SKILL.md`
  - [ ] `git show origin/main:pstack/skills/control-ui/SKILL.md`
  - [ ] `git show origin/main:pstack/skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `git show origin/main:pstack/skills/poteto-mode/playbooks/shipping.md`
  - [ ] `git show origin/main:pstack/skills/show-me-your-work/SKILL.md`
  - [ ] `git show origin/main:pstack/skills/technical-writing/SKILL.md`
- [ ] On the operator's go, arm the audit tick as `/loop 1h` with the tick prompt below. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from trunk. Audit the operation against it and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then post a short status message to the operator in chat only when the audit found a tracked change that no earlier status message reported, such as a PR opened, a code-ready head, a round launched or closed, a verdict, a merge, a stuck agent and the action taken, a blocker added or cleared, or a decision only the operator can make. Name every such change and nothing else. Do not repeat a table, the merged list, or an unchanged blocker. If the audit found none, end the turn with no reply text. Either way, log this tick's row in your decision trail. The row names the items reported, or none."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges, or base it on the parent branch when the execution playbook stacks.
  - [ ] L1 branches from `main`.
  - [ ] L2 after L1. L3 after L2.
- [ ] Hold the file boundaries. Every owner edits only `lite/**` and the Lite workflows under `.github/workflows/lite-*.yml`. No owner edits `main.js`, `res/`, or `plugins/`.
- [ ] Hold the review gate. L1, L2, and L3 change an interaction. They wait for the operator's review in chat with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`.
- [ ] Open the PR ready, never draft, per **Opening a PR**. Use the run's built-in PR tool when it has one, else `origin pr create --status open --base <base-branch>` or `gh pr create --base <base-branch>` according to the resolved forge. A stack child targets its parent branch.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Push with hooks on. For Lite that command is `cargo test --locked` in `lite/src-tauri`.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Triage every Bugbot and security-reviewer comment per `../references/bugbot-triage.md`.
- [ ] Rebase onto current trunk before the code-ready report and babysit. Keep that merge base in fix rounds. Rebase again only at merge prep, on a `git merge-tree` conflict with trunk, or on a CI failure that comes from a change on trunk.

### Verdict and merge, for every PR

- [ ] A full swarm runs once, at the code-ready head. Another full swarm runs only for new behavior, a redesign, or a large new diff. A rebase, a merge-conflict resolution, or a minor fix gets a single verifier at the new head. Run each full swarm per `pstack/skills/swarm/SKILL.md`. One gates lane. The ten live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. Two or more audit lanes, each with its own focus, that read the diff and the receipts and distrust the PR body. The root audits the receipts in the merge-ready report before the verdict.
- [ ] Clean only when every lane is `PASS`. Findings go back to the owner, including a defect that a lane filed as a note. A new head gets a fresh verdict, except for results that stay valid under the patch-id rule in `playbooks/shipping.md`.
- [ ] The owner reports stack-ready and does not merge. The root appends the pull request onto its parent branch. The operator lands the chain bottom-up. A lane result stays valid only when the patch-id is unchanged, per `playbooks/shipping.md`.

### Boot recipe, for every live lane

Each live lane runs on its own cloud VM at the PR head. `control-ui` is not in this repository. Drive the Tauri webview and the external player with the computer-use surface. Appendix C records that gap.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] Install WebKitGTK 4.1 and GTK 3 when they are missing. On Linux also install `libgtk2.0-0` before a Flash lane. From `lite/src-tauri`, run `cargo build --release`. Start `./target/release/aquastar-lite` on a virtual display. Wait until the Play buttons are visible.
- [ ] Click, type, and close windows only through the computer-use surface. Read-only diagnostics are the process list, the player command line, the launcher status text, and `cargo test --locked`.
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## Keep one player process (L1)

**Depends on.** None.

**Files.**

- [ ] Edit `lite/src-tauri/src/players.rs`.
- [ ] Edit `lite/src-tauri/src/main.rs`.
- [ ] Edit `lite/ui/index.html`, `lite/ui/main.js`, and `lite/ui/style.css`.
- [ ] Carry `lite/src-tauri/src/ruffle.rs` from pull request 47. That pull request is still open.

**Build.**

- [ ] A second Play click reuses the live child instead of spawning another one in `Players::launch`. Switching engines replaces that child so only one game runs.
- [ ] Closing the `main` window still calls `Players::kill_all`.
- [ ] A second process start focuses the existing launcher. Add the Tauri single-instance hook in `main.rs`.
- [ ] Pass `--quality` and `--graphics` from saved settings. Default graphics is `gl`. After a non-`gl` child exits in the early window, relaunch once with `--graphics gl`, matching `shouldFallbackToGl` in `res/ruffleNative.js`.
- [ ] Pin Adobe's official projector 32.0.0.465 on Windows and macOS, next to the Linux pin that is already 32.0.0.465. Adobe's CDN has no standalone projector for 32.0.0.344. The Artix PPAPI build of that version is not a projector, so it is not downloaded.
- [ ] Windows pin is `https://fpdownload.macromedia.com/pub/flashplayer/updaters/32/flashplayer_32_sa.exe` with SHA-256 `a4b333ac1da12026989549015303d82231982838bccfb544ba5fd188746066f0`. The file is a 32-bit PE. macOS pin is `https://fpdownload.macromedia.com/pub/flashplayer/updaters/32/flashplayer_32_sa.dmg` with SHA-256 `236ecef54a7d6c3eed739c74b7e14946b07b6156cbcedda3bbbf444f1d17023a`.
- [ ] When Flash is supported, the Flash button is the default. Do not start a player until the user clicks.

**You see.**

- [ ] One Flash window after two Play clicks, and no player process after the launcher closes.
- [ ] The quality and graphics controls survive a restart, and a Ruffle command line contains those flags.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `players.rs` gains tests for one-child reuse, kill on drop, argument order, and the OpenGL relaunch. Run `cargo test --locked` in `lite/src-tauri`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Click Play (Flash) once at trunk and at head. Save `/tmp/swarm-l1/worker-1/regression.png`. Pass when both sides show the launcher and exactly one flashplayer process, and the head button order starts with Flash.
- [ ] Lane 2. Click Play (Flash) twice. Save `/tmp/swarm-l1/worker-2/second-click.png`. Pass when the process list still has one flashplayer child.
- [ ] Lane 3. Close the main window. Save `/tmp/swarm-l1/worker-3/quit.png`. Pass when no ruffle or flashplayer child remains.
- [ ] Lane 4. Start the app twice. Save `/tmp/swarm-l1/worker-4/single-instance.png`. Pass when only one launcher window exists.
- [ ] Lane 5. Set quality to low and graphics to gl, then Play. Save `/tmp/swarm-l1/worker-5/args.png`. Pass when the child command line contains `--quality low` and `--graphics gl`.
- [ ] Lane 6. Choose a non-gl backend and force an early exit. Save `/tmp/swarm-l1/worker-6/gl-fallback.png`. Pass when the replacement child command line contains `--graphics gl`.
- [ ] Lane 7. On Linux x64, click Play Flash. Save `/tmp/swarm-l1/worker-7/flash.png`. Pass when the child executable name is flashplayer.
- [ ] Lane 8. Restart the app after Lane 5. Save `/tmp/swarm-l1/worker-8/settings.png`. Pass when the controls still show low and gl.
- [ ] Lane 9. Play again with the binary already unpacked. Save `/tmp/swarm-l1/worker-9/warm.png`. Pass when the status text is not a download error.
- [ ] Lane 10. Remove the unpacked player and block outbound network, then click Play. Save `/tmp/swarm-l1/worker-10/offline.png`. Pass when the status text shows an error and no child remains.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Warm-start delay from the Play click until the ruffle process exists, in milliseconds, at trunk and at head. The settings write is extra work trunk lacks. Also time that write until the controls show the saved values.
- [ ] Probe. Interleave five warm starts on trunk and five on head. The archive is already unpacked. Record the median of each side. Then save quality once at head and time the restart until the control shows it.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Fail when the head median exceeds the trunk median by more than 2000 ms, or when the head median exceeds 3000 ms. Fail the settings write when it exceeds 500 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and lane 5 screenshots into `/tmp/lite-port-review/l1-review-regression.png` and `/tmp/lite-port-review/l1-review-args.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `/tmp/lite-port-review/l1-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends L1 onto `main`. The operator lands it. The owner does not merge.

## Resolve the game URL (L2)

**Depends on.** L1.

**Files.**

- [ ] Create `lite/src-tauri/src/game_url.rs`.
- [ ] Edit `lite/src-tauri/src/players.rs` so the last player argument comes from `game_url.rs`.
- [ ] Edit `lite/ui/index.html` and `lite/ui/main.js` for the custom URL field and the custom SWF picker.

**Build.**

- [ ] `resolve_game_url` returns the live loader from `https://www.artix.com/gamelauncher` when the cache is stale, and `https://game.aq.com/game/gamefiles/Loader4.swf?ver=b` when the page fails the AQW checks in `plugins/adventure-quest-worlds/launcher-config.js`.
- [ ] A non-empty custom URL replaces the loader. A file named `custom-game.swf` or `aqlite_old.swf` replaces the custom URL. Pass that path as the last player argument.

**You see.**

- [ ] Play starts Ruffle with a loader URL, or with the chosen local SWF, as the last argument.
- [ ] Turning the live lookup off keeps the built-in Loader4 URL.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `game_url.rs` gains the launcher-page cases from `test/unit/aqw-launcher-config.test.js`, plus custom URL and both SWF names. Run `cargo test --locked` in `lite/src-tauri`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Click Play with no custom URL at trunk and at head. Save `/tmp/swarm-l2/worker-1/regression.png`. Pass when both sides start one player whose last argument ends in `.swf`.
- [ ] Lane 2. Fresh cache, network allowed. Save `/tmp/swarm-l2/worker-2/live-loader.png`. Pass when the last argument is `https` on `game.aq.com` and contains `Loader`.
- [ ] Lane 3. Turn the live lookup off and Play. Save `/tmp/swarm-l2/worker-3/lookup-off.png`. Pass when the last argument is the Loader4 URL with `ver=b`.
- [ ] Lane 4. Set a custom https SWF URL and Play. Save `/tmp/swarm-l2/worker-4/custom-url.png`. Pass when the last argument equals that URL.
- [ ] Lane 5. Place `custom-game.swf` and set a custom URL, then Play. Save `/tmp/swarm-l2/worker-5/custom-swf.png`. Pass when the last argument is the local `custom-game.swf` path.
- [ ] Lane 6. Remove `custom-game.swf`, leave `aqlite_old.swf`, and Play. Save `/tmp/swarm-l2/worker-6/alias.png`. Pass when the last argument is the `aqlite_old.swf` path.
- [ ] Lane 7. Feed a launcher page with no `Loader` SWF. Save `/tmp/swarm-l2/worker-7/bad-page.png`. Pass when the last argument is the Loader4 fallback.
- [ ] Lane 8. Remove every custom SWF and clear the custom URL. Save `/tmp/swarm-l2/worker-8/cleared.png`. Pass when Play uses the loader URL again.
- [ ] Lane 9. Click the testing-loader control. Save `/tmp/swarm-l2/worker-9/testing.png`. Pass when the last argument contains `Loader_Spider.swf`.
- [ ] Lane 10. Restart after Lane 5. Save `/tmp/swarm-l2/worker-10/persist.png`. Pass when the SWF override is still the file Play receives.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Delay from process start until the Play button is enabled, in milliseconds, at trunk and at head. The live lookup is extra work trunk lacks. Also time a warm cache hit until the button is enabled.
- [ ] Probe. Interleave five cold starts on trunk and five on head with a populated cache. Then five head starts with an empty cache and the network stubbed to a local page.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Fail when the cached head median exceeds the trunk median by more than 500 ms. Fail a cache miss when the button stays disabled for more than 3000 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 and lane 5 screenshots into `/tmp/lite-port-review/l2-review-live.png` and `/tmp/lite-port-review/l2-review-swf.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `/tmp/lite-port-review/l2-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto L1 after the verdict, patch-id unchanged.
- [ ] The root appends L2 onto the L1 branch. The operator lands it. The owner does not merge.

## Open the side pages (L3)

**Depends on.** L2.

**Files.**

- [ ] Edit `lite/src-tauri/src/main.rs` `open_site`.
- [ ] Edit `lite/ui/index.html` and `lite/ui/main.js`.
- [ ] Create `lite/src-tauri/src/pages.rs` for the allow-list, the Artix user agent, and the wiki cleanup script.

**Build.**

- [ ] Add one character-lookup button. Keep the existing wiki, account, and news buttons. Do not add Twitter, Reddit, Heromart, or the rest of the Useful Pages list.
- [ ] On `account.aq.com`, `www.aq.com`, and `game.aq.com`, set the user agent from `plugins/adventure-quest-worlds/user-agent.js` and send `artixmode` with value `launcher`.
- [ ] After a wiki page loads, hide the known Wikidot ad nodes the way `plugins/adventure-quest-worlds/injections/navigation.js` does.
- [ ] Add About and Help. About opens `https://github.com/aquaspy/AquaStar/releases`. Help lists the Play buttons and the player shutdown rule.

**You see.**

- [ ] The character lookup opens in a Lite window. A second click focuses that window.
- [ ] A host outside the allow-list does not open, and the status line names the rejection.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `pages.rs` gains allow-list, user-agent, and wiki-selector tests. Run `cargo test --locked` in `lite/src-tauri`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Click AQW Wiki at trunk and at head. Save `/tmp/swarm-l3/worker-1/regression.png`. Pass when both sides show a window whose host is `aqwwiki.wikidot.com`.
- [ ] Lane 2. Click Account. Save `/tmp/swarm-l3/worker-2/account.png`. Pass when the window host is `account.aq.com`.
- [ ] Lane 3. Click the character lookup with no saved name. Save `/tmp/swarm-l3/worker-3/charpage.png`. Pass when the window host is `www.aq.com` and the path contains `CharPage`.
- [ ] Lane 4. Save a character name and click the character page. Save `/tmp/swarm-l3/worker-4/charpage.png`. Pass when the URL contains `CharPage?id=` and the saved name.
- [ ] Lane 5. Ask the launcher to open `https://example.com`. Save `/tmp/swarm-l3/worker-5/denied.png`. Pass when no new window appears and the status text contains `example.com`.
- [ ] Lane 6. Click AQW Wiki twice. Save `/tmp/swarm-l3/worker-6/focus.png`. Pass when only one wiki window exists.
- [ ] Lane 7. Open Account and read the request user agent from the launcher log. Save `/tmp/swarm-l3/worker-7/ua.png`. Pass when the logged agent has no `Electron` token and the log contains `artixmode`.
- [ ] Lane 8. Open the wiki item page. Save `/tmp/swarm-l3/worker-8/ads.png`. Pass when `#wad-aqwwiki-above-content` is absent.
- [ ] Lane 9. Open About. Save `/tmp/swarm-l3/worker-9/about.png`. Pass when the text contains the Lite version from `tauri.conf.json`.
- [ ] Lane 10. Open Help, then close the main window. Save `/tmp/swarm-l3/worker-10/help.png`. Pass when Help mentions that closing Lite closes the game, and the player process is gone.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Delay from the Wiki click until the wiki window title is non-empty, in milliseconds, at trunk and at head. The user-agent change is extra work. Also time until the first response headers are logged.
- [ ] Probe. Interleave five wiki opens on trunk and five on head. Then five account opens at head with header logging on.
- [ ] Baseline. Record the trunk wiki median first.
- [ ] Rule. Fail when the head wiki median exceeds the trunk median by more than 1500 ms. Fail the account open when the header log is missing after 8000 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 3 and lane 7 screenshots into `/tmp/lite-port-review/l3-review-charpage.png` and `/tmp/lite-port-review/l3-review-ua.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `/tmp/lite-port-review/l3-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto L2 after the verdict, patch-id unchanged.
- [ ] The root appends L3 onto the L2 branch. The operator lands it. The owner does not merge.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

No prototype was built. The calls below are settled. Repo facts came from the tree at `4d9b53a`, from `gh pr view` for pull requests 31, 44, 47, and 48, and from Adobe's CDN.

Settled.

- Electron stays the main AquaStar app permanently. Lite is the light alternative and does not edit `main.js`.
- Flash is the default player on Linux, Windows, and macOS when the projector is present. Ruffle stays the fallback button.
- Adobe's CDN does not serve a standalone projector for 32.0.0.344. Those versioned URLs redirect to the Flash end-of-life page. The Artix-official 32.0.0.344 files in `FlashPlayer/` are PPAPI plugins, not projectors. The official projector still hosted at the updater path is 32.0.0.465 on all three systems. L1 pins that file. The Windows binary is a 32-bit PE.
- VirusTotal's public file API returned `RecaptchaRequiredError` for all three hashes, so this session did not read a fresh detection count and did not upload the files. The Windows hash matches the December 2020 projector published from Adobe's debug-downloads page. The Linux hash matches the pin already in `lite/README.md`.
- Inventory sync is out. Wiki hover does not need those counts for the image preview, and it is deferred in Appendix H because the script is large. Ownership badges need the counts, so they are out.
- Pull request 47 is still open. L1 carries its Ruffle settings and OpenGL fallback.

Unproven, with the default already used in this plan.

- Whether account pages reject a webview that does not send the Artix user agent. L3 sends it anyway, because the Electron plugin does and the cost is one header. Say to drop the header if a logged-in account window works without it.
- Whether a real AQW session completes on the 32.0.0.465 projector and on Ruffle desktop 0.7.1 with `--tcp-connections allow`. This plan did not play a session. Say to block a later lane if a manual login fails.

## Appendix B. Alternatives rejected

A Tauri port of the plugin host lost. The host API returns Electron windows and `ipcMain` channels. Lite would grow a second shell beside Electron, and AQW is the only game the launcher needs.

In-page Ruffle plus `res/socketProxy.js` lost. Native Ruffle already opens TCP. The proxy exists because the webview build cannot. Keeping both players in Lite doubles the network stack for one game.

Porting Char Page Studio lost. The lab and the GIF capture are a second Electron process with PPAPI, `webSecurity` off, and a hidden Flash window. There is no in-webview Flash in Lite to aim that at.

An in-app updater for AquaStar itself lost. The Electron app has none. Releases stay on GitHub via `v*` and `lite-v*` tags.

Building companion windows before the single-player session lost. A reminders window does not help if Play starts two games or the wrong loader. L1 and L2 are first for that reason. The companion windows then lost again on weight, so they are deferred in Appendix H rather than scheduled as L4.

Pinning the 32.0.0.344 PPAPI plugin as if it were a projector lost. It will not launch a SWF by itself. The official standalone projector is 32.0.0.465.

## Appendix C. Risks

`pstack/` is not in this repository. The `git show origin/main:pstack/...` lines will fail until the execution program reads those skills from the Cursor plugin cache. That is a process risk on every pull request, and the owner watches the first tick.

`control-ui` is not installed here. Live lanes drive a Tauri window and an external player through the computer-use surface. A lane that only screenshots the HTML file in a browser is a fail. The owner watches the process list in every report.

L3 user-agent behavior is unproven against a live account login. The owner watches Lane 7 and a manual login note.

The Windows projector is 32-bit. A 64-bit Windows machine can run it, and L1 does not claim a 64-bit projector exists. The macOS pin is a disk image. Linux CI cannot launch that image. The unit test checks the hash and the path. A Mac review still has to mount it once.

L1 downloads official projectors and checks SHA-256 before unpacking. A mismatch is a reject, not a warning. Nothing downloads a new Ruffle at startup.

The font limit in `lite/src-tauri/src/fonts.rs` is already on this branch and is easy to undo by setting `FONTCONFIG_FILE` on the player. L1 must keep `without_launcher_fontconfig`. The owner watches a player start on a machine with a large font set.

Pull request 47 is still open. L1 carries that commit. If it merges first, rebase and do not rewrite `ruffle.rs`.

## Appendix D. Links and reading list

Read these before editing.

- `lite/README.md` for what the launcher already does.
- `docs/PLUGINS.md` and `docs/design/plugin-architecture.md` for the Electron host this plan does not port.
- `docs/FLASH_CHECKLIST.md` for the manual Electron pass. Lite does not tick those PPAPI boxes.
- `res/ruffleNative.js`, `res/socketProxy.js`, `res/flash.js`, and `plugins/adventure-quest-worlds/launcher-config.js`.

L1 and L2 get `pstack/skills/how/SKILL.md` because the player arguments and the URL resolver are the load-bearing design.

The execution program keeps a decision trail at `docs/lite-port-trail.tsv` per `pstack/skills/show-me-your-work/SKILL.md`. One row per fork, verdict, and operator default. This plan file is the trail for the choices already made.

## Appendix E. What Lite already has

Checked on `4d9b53a`. Lite version in `lite/src-tauri/Cargo.toml` and `tauri.conf.json` is `0.1.0`. The Electron `package.json` version is `2.1.1-rc.1`. Nothing under `lite/` is imported by `main.js`.

The published tag `lite-v0.1.0` is commit `dc79be0` and does not contain the font fix. This checkout does.

Commands in `lite/src-tauri/src/main.rs` are `play`, `engines`, and `open_site`. There is no plugin host. `Cargo.toml` depends on `tauri` version `2` with an empty feature list. `Cargo.lock` resolves `tauri` `2.12.4`. No crate name starts with `tauri-plugin`. `tauri.conf.json` has no plugins key. `capabilities/default.json` grants `core:default` to the `main` window only.

- `play` with engine `ruffle` downloads Ruffle desktop 0.7.1, checks SHA-256, and runs `--tcp-connections allow --storage disk --letterbox on --no-gui` plus the hardcoded Loader4 URL. Linux x64, Windows x64, and macOS are supported. A second click starts another child.
- `play` with engine `flash` downloads the Adobe standalone projector `32.0.0.465` on Linux x64 only. Other targets disable the button. This is not PPAPI.
- `engines` disables buttons the OS cannot run.
- `open_site` allows `aqwwiki.wikidot.com`, `account.aq.com`, `www.aq.com`, and `www.artix.com`. Buttons exist for wiki, account, and news. Wiki search reuses the wiki window.
- Closing `main` runs `Players::kill_all`.
- On Linux, `fonts.rs` points WebKit at a fontconfig of at most 48 allow-listed files unless `FONTCONFIG_FILE` is already set. Player processes drop that variable when `AQUASTAR_LITE_FONTCONFIG` is set. That is pull request 44, merge commit `f9e9c98`, in this checkout.
- `WEBKIT_DISABLE_DMABUF_RENDERER=1` is set on Linux when unset. It has been there since the first Lite commit `76b83a6`. It is not the font fix.
- `.github/workflows/lite-check.yml` runs `cargo test --locked`. `.github/workflows/lite-release.yml` builds AppImage, deb, NSIS, and a universal macOS dmg. A `lite-v*` tag publishes a pre-release.

Pull request 47, titled lite add Ruffle quality and graphics settings, is open. Head `d529b12` is not in this checkout. Its Lite Check job passed. The tree has no `lite/src-tauri/src/ruffle.rs`.

Pull request 31, titled Aquastar 2.0 Plugins, merged as `d1d8293` and is in this checkout. It does not touch `lite/`.

Pull request 48 only changes `package.json` and is this checkout's HEAD.

## Appendix F. Feature reference

Facts from the tree at `4d9b53a`. Calls and effort are Appendix G. Paths are the implementation, not a suggestion to edit them from a Lite owner.

### Shell lifecycle

**process-lifecycle.** `main.js` starts one plugin, opens the primary window, and on quit kills native Ruffle, unregisters global shortcuts, and stops the socket proxy.

**single-instance.** `app.requestSingleInstanceLock` in `main.js`. A second process quits. The first focuses `BrowserWindow.getAllWindows()[0]`. It does not focus an external player.

**helper-process-entry.** `res/platform/helper-process.js` spawns `process.execPath` with `--aquastar-helper` for a script under `plugins/` that ends in `.js`. Char Page Studio uses this.

**chromium-switches.** `res/flash.js` `appendPerformanceSwitches` disables background throttling, crashpad, and on Linux `/dev/shm` usage, before any window.

**spellchecker-off.** `main.js` calls `session.defaultSession.setSpellCheckerLanguages([])` on ready.

**packaging.** `package.json` sets `asar` false so the PPAPI file is a real path. `.github/workflows/release.yml` attaches Linux, Windows, and macOS artifacts to a `v*` GitHub Release. `scripts/build-arch.sh` also stages linux ia32 and armv7l AppImages. armv7l has no bundled native Ruffle.

**app-release-no-autoupdate.** There is no `autoUpdater`. About in `res/windows/menu.js` opens `https://github.com/aquaspy/AquaStar/releases`.

**json-store-and-icons.** App data is `appData/AquaStar`. Screenshots go under Pictures. Icons are `Icon/Icon_1024.png` and `Icon/Iconred_1024.png`.

**logging.** Stdout plus, when `swfLog` is true, a text file under `Pictures/AquaStar Screenshots/SWFLogging`. The platform opens the file. The AQW rule decides which URLs are lines.

**crash-and-errors.** Breakpad is disabled. Bad `aquastar.json` shows a dialog and continues. Native Ruffle can retry with OpenGL. There is no `crashReporter`.

**devtools.** `enableDevTools` opens DevTools on windows from `newBrowserWindow`. `isDebugBuild` in `res/const.js` is false.

**protocol-handlers.** No `protocol.register` and no default-protocol client in `main.js` or `res/`.

**zoom.** No zoom API. SWF scale is an embed parameter, default `showall`.

**tray.** No `Tray` usage anywhere in the Electron tree.

**focus-style.** `res/features/common/focus.css` is a stylesheet HTML windows can link. `main.js` does not import it.

**preload-bridge.** `res/platform/preload-bridge.js` exposes `contextBridge` on `plugin:<id>:<channel>`.

**media-permission.** `main.js` allows `media` and `display-capture` only for a window whose URL `isRuffleEligible`.

**sandbox-flags.** The app is not sandboxed. Game windows set `sandbox` false and `plugins` true so PPAPI can load. Settings sets `plugins` false and `sandbox` true.

### Plugin host

**plugin-activation.** `res/platform/plugin-loader.js` `activateSelected` loads one plugin per process. `plugins/_template` is skipped. Safe mode is `pluginSystem` false or `AQUASTAR_DISABLE_PLUGINS=1`, which forces the `bundledDefault` plugin.

**plugin-active-selection.** Settings writes `activePluginId`. The next boot reads it. Empty means the bundled default. A change needs a restart.

**local-plugin-trust.** Local plugins under the AppData plugins folder stay inactive until `trustedLocalPlugins` covers their permissions. `withLocalRequireGate` blocks `fs`, `child_process`, `worker_threads`, and `cluster` during that `activate`.

**plugin-host-api.** `res/platform/plugin-host.js` `createPluginHost`. Permissions include `net-fetch`, `web-request`, `flash-trust`, `inject-scripts`, `persistent-store`, `spawn-helper-process`, and `unsafe-renderer`. Bundled code can still call Node directly.

**plugin-ipc.** Third-party channels are prefixed `plugin:<id>:`. AQW sets `unprefixedIpc` true and keeps bare names in `channels.js`.

**namespaced-store.** `getStore` writes `aquastar.<pluginId>.<ns>.json` unless `storeAliases` names a legacy file. AQW reminders, to-do, strategy, and inventory still write their historic files themselves.

**settings-persistence.** `aquastar.json` under `appData/AquaStar`. `res/platform/settings-merge.js` keeps platform keys at the top level and plugin keys under `plugins[id]`, and also copies plugin keys to the top level.

**settings-ui.** `res/features/settings/settings.html`. Tabs are general, plugin, and keybinds. General rows include language, custom URL, recording format, render mode, Ruffle channel, quality, graphics, the game menu flag, and DevTools. `useDirectWmode` and `swfLog` are JSON only.

**i18n.** `res/po/en-US.js` and `pt-BR.js`. `appLanguage` is `system`, `en-US`, or `pt-BR`. `pt` maps to `pt-BR`.

**help-about.** `res/windows/menu.js` dialogs. Help lists shortcuts. About shows version, OS, and arch.

**web-tools-build.** `scripts/build-web.js` reads the bundled plugin `web.contribute` and writes `web-dist/`. `.github/workflows/pages.yml` deploys it. This is not an Electron window.

**plugin-template.** `plugins/_template/` is a starter. Discovery ignores it. Its only game is an in-window SWF.

**plugin-sample-fixture.** `test/fixtures/sample-plugin/` is a loader fixture, not a shipped plugin.

### Example Companion

**example-boxmover.** Primary game is `plugins/example-companion/assets/boxmover.swf` via `setPrimaryGame`. Ruffle-eligible, no socket config.

**example-static-rectangle.** Launch `example-static-rect` opens `rectangle.swf`.

**example-session-header.** `plugins/example-companion/session.js` adds header `X-AquaStar-Example` on `api.github.com`.

**example-inject-demo.** Alt+I opens a local HTML page and writes `#inject-status`. It does not edit GitHub.

**example-dashboard.** Alt+E opens a sandboxed window that counts visits and fetches the AquaStar GitHub repo JSON through `host.net.fetchText`.

**example-menus-keybinds.** Menu and chords for the two SWFs, the dashboard, the demo, and external GitHub links.

**example-settings-locales.** Settings fields `demoPlayerName` and `demoShowTips`. Catalogs in en-US and pt-BR.

**example-external-links.** `openMode` `external` for GitHub and the plugin docs, because Electron 11 cannot render current github.com.

### Windows, menus, and keys

**window-factory.** `res/instances.js` `newBrowserWindow` picks `main`, `game`, or `win` from `res/windows/config.js`. Game and main are 960 by 530 with the capture preload. Settings is 640 by 680.

**swf-open-modes.** `renderMode` `ruffle-native` loads `res/ruffle_native.html` and starts the desktop binary. `ruffle` loads `res/ruffle_wrapper.html`. Otherwise a SWF loads `res/swf_wrapper.html` when direct wmode is on.

**multi-window.** Each `newBrowserWindow` is another Electron window. Non-standalone games get a number in the title. A 750 ms gate collapses duplicate URLs.

**child-windows.** `new-window` is cancelled and reopened as a plain browser window in the same session.

**feature-windows.** `res/windows/feature-window-controller.js` keeps one window per id. Platform ids are only `settings`. Plugins add the rest.

**menus.** `res/windows/menu.js` builds the menu. Useful Pages prefer the plugin registry when present.

**context-menu.** `res/instances.js` adds a right-click menu. Past 70 windows the setup is skipped.

**shortcuts.** `res/keybindings.js`. Most chords use `electron-localshortcut`. `globalShortcut` is used for screenshot, record, cache reload, and any plugin bind marked global, because PPAPI consumes keys first. Defaults include F2, Ctrl+J, Alt+9, and F11.

**fullscreen-reload-history.** `buildPlatformActions` toggles fullscreen, reloads, clears cache storage, and walks history on the focused `webContents`.

**navigation-hooks.** The host forwards `did-finish-load` to the plugin when `inject-scripts` is granted. AQW returns immediately for game windows.

**window-title-notify.** `res/instances.js` `_notifyWindow` replaces the Electron window title, then restores it. It does not retitle the native Ruffle window.

### Flash, Ruffle, and the network

**flash-ppapi.** `res/flash.js` sets `ppapi-flash-path` and `ppapi-flash-version` from `FlashPlayer/`. Versions are `32.0.0.344` on Windows, macOS, and Linux x64, `32.0.0.445` on Linux ARM, and `34.0.0.137` on Linux 32-bit.

**swf-wrapper.** `res/swf_wrapper.html` embeds an object tag with `wmode` default `direct`, `allowscriptaccess` `always`, and `quality` `best`. `useDirectWmode` false skips the default wrapper.

**flash-trust.** `nw-flash-trust` writes the PPAPI trust list under the Electron user-data Pepper directory. AQW adds the current loader, the testing loader, and the DragonFable loader.

**ruffle-web.** `renderMode` `ruffle` plays the SWF with `res/ruffle/ruffle.js` or a downloaded `ruffle-current` inside the window. Quality is `high`, `medium`, or `low`.

**ruffle-web-update.** `res/ruffleUpdate.js` downloads a Ruffle web release into app data. The next process promotes `ruffle-next` to `ruffle-current`. Channels are `latest` and `nightly`.

**ruffle-native.** `res/ruffleNative.js` spawns the desktop binary. Arguments include `--tcp-connections allow`, `--storage disk`, `--letterbox on`, optional size, quality, graphics, save directory, `--no-gui`, and the SWF last. A non-gl early exit retries with `gl`. The shell window is a status page.

**socket-proxy.** `res/socketProxy.js` listens on `127.0.0.1:8191` and forwards to plugin-allowed hosts. It starts only for in-page Ruffle. Native Ruffle does not use it.

**aqw-ruffle-socket.** `plugins/adventure-quest-worlds/ruffle.js` sets `allowedHosts` to `*.aq.com` and `*.artix.com`, policy port 843, and the servers API.

**aqw-server-list.** The same file names `https://game.aq.com/game/api/data/servers` and fallback hosts `sock7.aq.com`, `sock8.aq.com`, `euro.aqw.artix.com`, and `asia.game.artix.com` with the ports listed there. The plugin does not fetch the list. It is not a server picker.

**session-rules.** `res/platform/session-rules.js` keeps one listener per webRequest event. `res/platform/platform-rules.js` cancels `adsymptotic.com`, `doubleclick.net`, `onesignal.com`, `nitropay.com`, and `translate.googleapis.com`.

**aqw-user-agent.** `plugins/adventure-quest-worlds/user-agent.js` rewrites the User-Agent on `*.aq.com` and `play.dragonfable.com` to the Artix Game Launcher 2.2.0 string and sets `artixmode` to `launcher`.

**aqw-swf-log.** The AQW session rule writes `game.aq.com/game/` URLs when `swfLog` is true. It never cancels.

**custom-url.** Platform key `customUrl`. Used when no custom SWF file is present.

**custom-swf.** `res/customSwf.js` copies a chosen SWF to `custom-game.swf` in app data. It beats `customUrl`.

**aqw-custom-swf-alias.** The AQW manifest `customSwfAliases` includes `aqlite_old.swf`.

### AQW game and pages

**aqw-primary-game.** `setPrimaryGame` id `aqw-main`. Default URL `https://game.aq.com/game/gamefiles/Loader4.swf?ver=b`. `wrap.ruffleEligible` is true.

**aqw-live-loader.** `plugins/adventure-quest-worlds/launcher-config.js` reads `https://www.artix.com/gamelauncher`, parses `AppLaunch.js` text, and accepts only a `game.aq.com` `Loader*.swf`. Cache TTL is 24 hours. `liveLoaderUrl` false skips it.

**aqw-testing-game.** Alt+Q opens `https://game.aq.com/game/gamefiles/Loader_Spider.swf` with a random `ver`.

**aqw-dragonfable.** Alt+1 opens `https://play.dragonfable.com/game/DFLoader.swf?ver=668201`. `standalone` true. No socket config.

**aqw-window-title.** `window-title.js` joins AquaStar and Adventure Quest Worlds in the title, or uses the character name when `featurePlayerName` is on. A custom SWF uses the older-client suffix.

**aqw-render-modes.** The plugin sets eligibility. The platform key `renderMode` chooses `flash`, `ruffle`, or `ruffle-native`.

**aqw-navigation.** `injections/navigation.js` classifies wiki, character, account, and home URLs, strips Wikidot ad nodes, and skips game windows. Account login and Cloudflare frames stay.

**aqw-menus.** `menus.js` adds Game and Features, plus Useful Pages. In-place pages include wiki, design notes, balance notes, account, character page, daily gifts, calendar, forge, Heromart, Battleon Portal, Twitter, and Reddit.

**aqw-keybinds.** Defaults include Alt+W wiki, Alt+A account, Alt+D design notes, Alt+P character page, Alt+N new AQW, Alt+Q testing, Alt+1 DragonFable, Alt+T reminders, Alt+Y to-do, Alt+I inventory, Alt+U strategy, and Alt+K character screenshot. Studio has no default chord.

**aqw-account-and-character.** Settings `playerCharacter`, `featurePlayerName`, `autoSync`, and `liveLoaderUrl`. Alt+P opens `https://account.aq.com/CharPage?id=` plus the saved name.

**accounts.** The platform stores no password. Account pages are plugin URLs. Inventory sync uses the existing `account.aq.com` cookie jar.

### Companion tools

**aqw-reminders.** Alt+T. Sandboxed window. File `aquastar_reminders.json`, seeded from `reminders_default.json`. Daily, weekly, and monthly quests, per-character or shared hides, and a `/join` copy.

**aqw-todo.** Alt+Y. File `aquastar_todo.json`. Categories include drop, shop merge, and reputation farm. Hiding a task means done. Links open in a browser window. No reset clock.

**aqw-strategy.** Alt+U. File `aquastar_strategy.json`. Boss plans, potions, and a global shortcut defaulting to `Alt+Shift+U` that sends `strategyTimerToggle`.

**aqw-list-kit.** `core/list-state.js` and `features/common/list_window_common.js`. Shared by reminders and to-do.

**aqw-reset-time.** `core/reset-time.js`. Midnight in `America/New_York`. Weekly reset is Friday midnight.

**aqw-workspace-ui.** `ui/workspace/character-tabs.js` and `modals.js`. Shared by the list windows and copied into the web build.

**aqw-inventory.** Alt+I. File `aquastar_inventory.json`. Syncs inventory and buyback through `account.aq.com` with Electron `net`. Wheel of Doom is stored empty and not synced. `autoSync` defaults false.

**aqw-account-sync.** `accountSyncButton.js` injects a Sync Now button labeled AquaStar on account pages and calls `syncInventoryNow`.

**aqw-wiki-fetch.** `features/wikiview/wikiFetch.js` handles `fetchWikiPage` for `aqwwiki.wikidot.com` only, 5 MB cap, 15 second timeout.

**aqw-wikiview.** `wikiviewsource.js` adds hover previews, ownership badges, a character switcher, and a merge-shop calculator on wiki, character, and account inventory pages. It does not read the game SWF.

**aqw-locales.** `plugins/adventure-quest-worlds/locales/en-US.js` and `pt-BR.js` for menus, the four tools, studio, and wiki strings.

**aqw-web-tools.** `plugins/adventure-quest-worlds/web/contribute.js` publishes reminders, to-do, and strategy as static pages. Inventory is not included. Browser storage key prefix is `aquastar-tools.`.

**aqw-legacy-channels.** Requiring the feature modules at activate time registers the 30 bare IPC names in `channels.js`.

**screenshots.** `res/instances.js` `takeSS` uses `webContents.capturePage` and writes `Pictures/AquaStar Screenshots/Screenshot-YYYY-M-D_<n>.png`. F2 is global. It does not capture the native Ruffle window.

**screen-recording.** `res/ipc/recording.js` and `res/features/capture/preload_capture.js`. `desktopCapturer` matches the Electron window title. `MediaRecorder` prefers `h264-mkv`, then vp9 or vp8 webm. Ctrl+J toggles. One recording at a time. Audio is described as reliable on Windows only.

**aqw-char-page-screenshot.** Alt+K. `features/charpage/print.js` requires an `<object>` on the focused character page, reloads it in a hidden Flash window at 3840 by 2160, and crops the 715 by 455 movie.

**aqw-char-page-studio.** `processes/charpage-studio-process.js` is a second Electron process with PPAPI. It loads `characterB-studio.swf`, can save a PNG or an 8 second GIF, and blocks navigation away. `features/charpage/studio.js` still registers older channels the menu does not use.

**aqw-empty-scene.** `characterB-empty-scene.swf` renders the avatar on a solid background inside the studio capture window.

## Appendix G. Why each feature is in, later, or out

The player is outside the webview. A feature that draws the SWF inside Electron, or that injects script into that webview, is out. A feature that is a separate HTML window, a URL, or a file can move. Effort is S, M, or L for one owner who already knows this repo. S is a single module and its tests. M crosses the launcher UI and Rust. L needs a new operating-system integration or a second runtime.

### In, with the first three pull requests

**single-instance.** In, L1, effort S. A second launch should focus the launcher you already have. Tauri can do this without hosting Flash. The external player is still not focused. That limit stays.

**ruffle-native.** In, L1, effort M. Lite already spawns this process. The gap is one child, quality, graphics, and the OpenGL retry that `res/ruffleNative.js` already has. Pull request 47 is the same gap and is not merged.

**play-flash.** In, L1, effort M. Flash is the default button on Linux, Windows, and macOS. The pin is Adobe's official standalone projector 32.0.0.465, because 32.0.0.344 has no projector on Adobe's CDN.

**aqw-account-and-character.** In, L3 for the character-page URL, effort S. The name is a query string. Inventory sync is out, so there is no auto-sync.


**aqw-live-loader.** In, L2, effort M. The built-in Loader4 URL already went stale once, which is why pull request 31 added the lookup. The result is a string the external player can open.

**custom-url.** In, L2, effort S. Same string path as the live loader.

**custom-swf.** In, L2, effort S. Native Ruffle already takes a filesystem path as the last argument.

**aqw-custom-swf-alias.** In, L2, effort S. One extra filename, `aqlite_old.swf`, so old files keep working.

**aqw-testing-game.** In, L2, effort S. One more URL on the same player path.

**open-site.** In, L3, effort S. Wiki, account, and news already work. L3 adds the character lookup and nothing else from the Useful Pages list.

**aqw-navigation.** In, L3, effort M. Wiki ad removal is page script in a Tauri webview. It never touches the game window.

**aqw-user-agent.** In, L3, effort M. Account and news windows are still webviews, so they can send the header the Electron session sends. The external player keeps its own agent. Whether Artix checks the header is unproven, and L3 sends it anyway.

**help-about.** In, L3, effort S. Version and the releases link are how people notice a bad build. No Flash involved.


### Deferred or cut

Appendix H is the list. Do not reopen those as pull requests in this program.

### Out

**flash-ppapi.** Out. Tauri has no PPAPI host, and this plan forbids in-webview Flash. The binaries under `FlashPlayer/` stay in the Electron package.

**swf-wrapper.** Out. The object tag needs that PPAPI host.

**flash-trust.** Out. The trust file is for the PPAPI plugin inside Electron user data. The standalone projector does not read it.

**aqw-flash-trust.** Out. Same list, plugin side.

**chromium-switches.** Out. They tune the Electron process that paints the game. The external player does not inherit them.

**sandbox-flags.** Out. `sandbox` false exists so PPAPI loads. Lite's game is not that webview.

**spellchecker-off.** Out. It stops a Chromium download in the Electron session.

**ruffle-web.** Out. That mode is the SWF inside the webview. Lite's Ruffle is the desktop binary.

**ruffle-web-update.** Out. It replaces `ruffle.js` for the webview mode. Lite does not download a new Ruffle at startup.

**socket-proxy.** Out. Native Ruffle opens TCP with `--tcp-connections allow`. The proxy is only for the webview build.

**aqw-ruffle-socket.** Out. Input to that proxy.

**aqw-server-list.** Out. Fallback hosts for that proxy. It is not a picker, so there is nothing to show.

**aqw-render-modes.** Out as a three-way setting. Lite's choice is the Play button. Flash is the default on Linux, Windows, and macOS. Ruffle is the other button.

**media-permission.** Out. It gates `getUserMedia` on the game webview for the in-window recorder.

**helper-process-entry.** Out. The helper is a second copy of the Electron binary so a plugin can run PPAPI again.

**aqw-char-page-studio.** Out. It is that helper plus a Flash lab. A PNG of the public character page is not a substitute, and this plan does not invent one.

**aqw-empty-scene.** Out. It is a SWF the studio plays.

**aqw-char-page-screenshot.** Out. It looks for an `<object>` tag and reloads the page in a hidden Flash window.

**plugin-activation.** Out for Lite. One hardcoded AQW launcher does not need discovery, safe mode, or a restart to switch games.

**plugin-active-selection.** Out. There is no second plugin to select.

**local-plugin-trust.** Out. Local plugins get full Node trust after a prompt. That model does not exist in the Tauri app, and adding it would be a new shell.

**plugin-host-api.** Out. The methods return Electron objects.

**plugin-ipc.** Out. Lite commands stay Rust commands, not a channel prefix scheme.

**plugin-template.** Out. It is documentation for the Electron host.

**plugin-sample-fixture.** Out. It is a unit fixture.

**example-boxmover.** Out. The demo SWF is how Electron tests PPAPI. Lite does not need a second game to prove Play.

**example-static-rectangle.** Out. Same reason.

**example-session-header.** Out. It stamps a demo header on GitHub API calls.

**example-inject-demo.** Out. It demonstrates `executeJavaScript` on a local page.

**example-dashboard.** Out. It is the example plugin's scratch pad.

**example-menus-keybinds.** Out. They open the demo SWFs.

**example-settings-locales.** Out. Demo fields for the example plugin.

**example-external-links.** Out. GitHub links for plugin authors. The About button in L3 covers the releases page.

**preload-bridge.** Out. It is Electron `contextBridge`.

**window-factory.** Out as a port of `BrowserWindow`. Lite already has one launcher window and `WebviewWindowBuilder` for sites. Game pixels are not a webview.

**swf-open-modes.** Out. Three of the four modes paint inside Electron. Lite keeps the external branch only.

**fullscreen-reload-history.** Out. Reload and cache clear target the webview that contains the SWF. The external player ignores them. Close and Play again is the restart.

**context-menu.** Out. The Electron context menu is for the webview. Do not add one until a page needs it.

**tray.** Out. The feature does not exist. Do not invent a tray while porting.

**zoom.** Out. There is no control to copy. Ruffle already gets `--letterbox on`.

**protocol-handlers.** Out. There is no URL scheme to register.

**devtools.** Out as a product setting. Developers can use the webview inspector without a checkbox that warns about Flash.

**focus-style.** Out of the program. Copy the stylesheet into a tool window when that window is built, if the contrast is wrong. It is not its own pull request.

**web-tools-build.** Out of Lite. The static site stays on GitHub Pages. Inventory was already excluded there.

**aqw-web-tools.** Out of Lite. Same site.

**aqw-legacy-channels.** Out. Those names are Electron IPC side effects.

**aqw-swf-log.** Out. The external player does not pass through `webRequest`.

**packaging.** Out as an Electron port. Lite already has `lite-release.yml`. Do not add ia32 or armv7l unless you ask. The Electron workflows keep building the PPAPI app.

**app-release-no-autoupdate.** Out. Keep publishing `lite-v*` tags. Do not add an in-app updater for the launcher.

**json-store-and-icons.** In only as data locations, effort S, folded into L1 and L9. Use the Tauri app data dir and the Pictures dir. Do not copy `nativeImage`.

**process-lifecycle.** In only as the shape of `main.rs`, which already kills players on exit. Do not port `app.on('ready')` or PPAPI registration.

**window-title-notify.** Out. The status line already reports player errors. Flashing the Electron title does not reach the player window.

**accounts.** Out as a password store. Neither app should gain one. Login stays on `account.aq.com`.

## Appendix H. Deferred and cut

Deferred. Each one is a window or a download the user opens on purpose, and none is required to play. Build one only after L3, and only if the idle launcher stays small.

- Reminders, the to-do list, and the strategy timer. Each is another webview plus a JSON file.
- Wiki hover on wiki pages. The image preview does not read inventory. The script is large, so it waits. Ownership badges need inventory counts, so those badges stay out.
- Portuguese catalogs and the shortcut editor.
- A screenshot of the external player window.
- One DragonFable button.
- An opt-in Ruffle update. The pinned desktop build stays the default.

Cut.

- Inventory sync, the account Sync Now button, auto-sync, and wiki badges that need those counts.
- Recording the player. Encoding video is a standing CPU cost, and Electron already records.
- A second AQW process. Two game runtimes fights the point of a light launcher.
- The long Useful Pages list. Wiki, account, news, and the character lookup are enough.
