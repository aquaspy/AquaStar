# Port the companion onto AquaStar Lite

Lite stays a Tauri 2 launcher, and the game stays an external process. Ruffle desktop or the Linux Flash projector draws the game. The shell webview never hosts Flash. This plan copies the Electron features that still make sense under that rule, postpones the HTML companion tools, and leaves PPAPI, in-page Ruffle, and the plugin host on the Electron app. Landing order is L1 through L12. L1, L2, and L3 are the playable launcher. L4 through L12 are the companion tools. The never list is Appendix G, not a pull request.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `pstack/skills/poteto-mode/playbooks/autopilot-stack.md`. The operator lands the stack. Every pull request stops at stack-ready. None of L1 through L12 is an operator-owned build. The operator's items are the open questions in Appendix A.

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
  - [ ] L2 after L1. L3 after L2. L4 after L3. L5 after L4. L6 after L5. L7 after L6. L8 after L7. L9 after L8. L10 after L9. L11 after L10. L12 after L11.
- [ ] Hold the file boundaries. Every owner edits only `lite/**` and the Lite workflows under `.github/workflows/lite-*.yml`. No owner edits `main.js`, `res/`, or `plugins/`.
- [ ] Hold the review gate. L1 through L12 change an interaction. They wait for the operator's review in chat with screenshots and a video before merge.

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
- [ ] Create `lite/src-tauri/src/settings.rs` for `ruffleQuality` and `ruffleGraphics` if pull request 47 is still unmerged.

**Build.**

- [ ] A second Play click reuses the live child instead of spawning another one in `Players::launch`.
- [ ] Closing the `main` window still calls `Players::kill_all`.
- [ ] A second process start focuses the existing launcher. Add the Tauri single-instance hook in `main.rs`.
- [ ] Pass `--quality` and `--graphics` from saved settings. Default graphics is `gl`. After a non-`gl` child exits in the early window, relaunch once with `--graphics gl`, matching `shouldFallbackToGl` in `res/ruffleNative.js`.
- [ ] If pull request 47 has merged, rebase onto it and do not rewrite `ruffle.rs`.

**You see.**

- [ ] One Ruffle window after two Play clicks, and no Ruffle process after the launcher closes.
- [ ] The quality and graphics controls survive a restart, and the player command line contains those flags.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `players.rs` gains tests for one-child reuse, kill on drop, argument order, and the OpenGL relaunch. Run `cargo test --locked` in `lite/src-tauri`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Click Play once for Ruffle at trunk and at head. Save `/tmp/swarm-l1/worker-1/regression.png`. Pass when both sides show the launcher and exactly one ruffle process.
- [ ] Lane 2. Click Play twice. Save `/tmp/swarm-l1/worker-2/second-click.png`. Pass when the process list still has one ruffle child.
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

- [ ] Add buttons for every in-place Useful Page in `plugins/adventure-quest-worlds/urls.js`. That set is Design Notes, balance patch notes, the character lookup, Daily Gifts, the Calendar, Forge, Heromart, Battleon Portal, Twitter, and Reddit. Keep the existing wiki, account, and news buttons.
- [ ] On `account.aq.com`, `www.aq.com`, `game.aq.com`, and `play.dragonfable.com`, set the user agent from `plugins/adventure-quest-worlds/user-agent.js` and send `artixmode` with value `launcher`.
- [ ] After a wiki page loads, hide the known Wikidot ad nodes the way `plugins/adventure-quest-worlds/injections/navigation.js` does.
- [ ] Add About and Help. About opens `https://github.com/aquaspy/AquaStar/releases`. Help lists the Play buttons and the player shutdown rule.

**You see.**

- [ ] Design Notes opens in a Lite window on `www.aq.com`. A second click focuses that window.
- [ ] A host outside the allow-list does not open, and the status line names the rejection.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `pages.rs` gains allow-list, user-agent, and wiki-selector tests. Run `cargo test --locked` in `lite/src-tauri`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Click AQW Wiki at trunk and at head. Save `/tmp/swarm-l3/worker-1/regression.png`. Pass when both sides show a window whose host is `aqwwiki.wikidot.com`.
- [ ] Lane 2. Click Account. Save `/tmp/swarm-l3/worker-2/account.png`. Pass when the window host is `account.aq.com`.
- [ ] Lane 3. Click Design Notes. Save `/tmp/swarm-l3/worker-3/design.png`. Pass when the window host is `www.aq.com` and the path contains `gamedesignnotes`.
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

- [ ] Copy lane 3 and lane 7 screenshots into `/tmp/lite-port-review/l3-review-design.png` and `/tmp/lite-port-review/l3-review-ua.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `/tmp/lite-port-review/l3-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto L2 after the verdict, patch-id unchanged.
- [ ] The root appends L3 onto the L2 branch. The operator lands it. The owner does not merge.

## Add reminders (L4)

**Depends on.** L3.

**Files.**

- [ ] Create `lite/ui/reminders.html` and `lite/ui/reminders.js` from the behavior in `plugins/adventure-quest-worlds/features/reminders/`.
- [ ] Create `lite/src-tauri/src/reminders.rs` to read and write `aquastar_reminders.json`.
- [ ] Edit `lite/ui/index.html` to add the Reminders button.

**Build.**

- [ ] Port `createResetTime` from `plugins/adventure-quest-worlds/core/reset-time.js` and `createListState` from `core/list-state.js` into Rust or a small page script. Daily reset stays midnight in `America/New_York`. Weekly reset stays the following Friday midnight.
- [ ] First run seeds `reminders_default.json`. Copy a legacy `aquastar_reminders.json` once when it exists beside the Lite data dir.

**You see.**

- [ ] Reminders opens one window, lists seeded quests, and a copied `/join` line is on the clipboard.
- [ ] A hidden quest stays hidden after restart.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add reset-time and hide-map tests that match `test/unit/reset-time.test.js` and `test/unit/list-state.test.js`. Run `cargo test --locked` in `lite/src-tauri`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open the launcher at trunk and at head. Trunk has no Reminders control. Save `/tmp/swarm-l4/worker-1/regression.png`. Pass when head shows Reminders and trunk does not, and both still show Play.
- [ ] Lane 2. Open Reminders on a fresh data dir. Save `/tmp/swarm-l4/worker-2/seed.png`. Pass when at least one seeded quest title is visible.
- [ ] Lane 3. Read the daily countdown beside a daily quest. Save `/tmp/swarm-l4/worker-3/daily.png`. Pass when the label matches the New York midnight rule for the lane clock.
- [ ] Lane 4. Hide one quest, restart, and reopen. Save `/tmp/swarm-l4/worker-4/hide.png`. Pass when that quest stays hidden.
- [ ] Lane 5. Copy a join command. Save `/tmp/swarm-l4/worker-5/join.png`. Pass when the clipboard starts with `/join`.
- [ ] Lane 6. Add a character tab. Save `/tmp/swarm-l4/worker-6/character.png`. Pass when the new name is a tab and survives restart.
- [ ] Lane 7. Turn on a seasonal filter that excludes the visible seasonal quest. Save `/tmp/swarm-l4/worker-7/season.png`. Pass when that quest is not in the list.
- [ ] Lane 8. Open Reminders twice. Save `/tmp/swarm-l4/worker-8/focus.png`. Pass when only one reminders window exists.
- [ ] Lane 9. Start Ruffle, then close Reminders. Save `/tmp/swarm-l4/worker-9/player.png`. Pass when the ruffle process is still running.
- [ ] Lane 10. Point the data dir at an Electron `aquastar_reminders.json` and open Reminders. Save `/tmp/swarm-l4/worker-10/legacy.png`. Pass when a quest title from that file is visible.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Delay from process start until Play is enabled, in milliseconds, at trunk and at head. Reminders is extra. Also time from the Reminders click until the first quest row is visible.
- [ ] Probe. Interleave five launcher starts on trunk and five on head. Then five Reminders opens at head on the seeded file.
- [ ] Baseline. Record the trunk start median first.
- [ ] Rule. Fail when the head start median exceeds the trunk median by more than 500 ms. Fail Reminders when the first row takes more than 1500 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 and lane 4 screenshots into `/tmp/lite-port-review/l4-review-seed.png` and `/tmp/lite-port-review/l4-review-hide.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `/tmp/lite-port-review/l4-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto L3 after the verdict, patch-id unchanged.
- [ ] The root appends L4 onto the L3 branch. The operator lands it. The owner does not merge.

## Add the to-do list (L5)

**Depends on.** L4.

**Files.**

- [ ] Create `lite/ui/todo.html` and `lite/ui/todo.js` from `plugins/adventure-quest-worlds/features/todo/`.
- [ ] Create `lite/src-tauri/src/todo.rs` for `aquastar_todo.json`.
- [ ] Edit `lite/ui/index.html` to add the To-Do button.

**Build.**

- [ ] Reuse the L4 list kit for ids, seasonal tags, and hide maps. A hidden task means done. Do not add a reset clock.
- [ ] Open http and https links from a task in a Lite page window. Reject every other scheme.

**You see.**

- [ ] A new task with a wiki link survives restart, and Done hides it.
- [ ] An empty first run shows an empty list, not the reminders seed.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `todo.rs` gains tests for empty create, hide-as-done, and link scheme checks. Run `cargo test --locked` in `lite/src-tauri`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open the launcher at trunk and at head. Save `/tmp/swarm-l5/worker-1/regression.png`. Pass when head shows To-Do, trunk does not, and Reminders from L4 still opens.
- [ ] Lane 2. Open To-Do on a fresh data dir. Save `/tmp/swarm-l5/worker-2/empty.png`. Pass when the list has no seeded reminder titles.
- [ ] Lane 3. Add a task and restart. Save `/tmp/swarm-l5/worker-3/save.png`. Pass when the task title is still there.
- [ ] Lane 4. Mark that task done and restart. Save `/tmp/swarm-l5/worker-4/done.png`. Pass when it stays hidden.
- [ ] Lane 5. Attach `https://aqwwiki.wikidot.com/` and open it. Save `/tmp/swarm-l5/worker-5/link.png`. Pass when a wiki window opens.
- [ ] Lane 6. Attach `file:///etc/passwd`. Save `/tmp/swarm-l5/worker-6/bad-link.png`. Pass when no new window opens.
- [ ] Lane 7. Copy a join command. Save `/tmp/swarm-l5/worker-7/join.png`. Pass when the clipboard starts with `/join`.
- [ ] Lane 8. Open To-Do twice. Save `/tmp/swarm-l5/worker-8/focus.png`. Pass when only one to-do window exists.
- [ ] Lane 9. Add a second character and a task on that tab. Save `/tmp/swarm-l5/worker-9/character.png`. Pass when the other character tab does not show that task.
- [ ] Lane 10. Start Ruffle, close To-Do, then close the launcher. Save `/tmp/swarm-l5/worker-10/player.png`. Pass when the player dies only after the launcher closes.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Delay from process start until Play is enabled, at trunk of L4 and at head. Also time from the To-Do click until the empty state or the first row is visible.
- [ ] Probe. Interleave five starts on the L4 base and five on head. Then five To-Do opens at head.
- [ ] Baseline. Record the L4 start median first. L4 is the parent, and trunk of the stack link is that parent.
- [ ] Rule. Fail when the head start median exceeds the L4 median by more than 500 ms. Fail To-Do when the empty state takes more than 1500 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 and lane 3 screenshots into `/tmp/lite-port-review/l5-review-empty.png` and `/tmp/lite-port-review/l5-review-save.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `/tmp/lite-port-review/l5-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto L4 after the verdict, patch-id unchanged.
- [ ] The root appends L5 onto the L4 branch. The operator lands it. The owner does not merge.

## Add the strategy timer (L6)

**Depends on.** L5.

**Files.**

- [ ] Create `lite/ui/strategy.html` and `lite/ui/strategy.js` from `plugins/adventure-quest-worlds/features/strategy/`.
- [ ] Create `lite/src-tauri/src/strategy.rs` for `aquastar_strategy.json` and the global timer shortcut.
- [ ] Edit `lite/ui/index.html` to add the Strategy button.

**Build.**

- [ ] Seed bosses and potions from `strategy_default.json`. Add new default potions without deleting custom ones.
- [ ] Register one global shortcut, default `Alt+Shift+U`, that toggles the countdown only while the strategy window is open. Use a Tauri global-shortcut plugin. Do not steal the key when the window is closed.

**You see.**

- [ ] Strategy opens, a boss plan is visible, and the shortcut starts and stops the countdown.
- [ ] The shortcut does nothing when Strategy is closed, including while Ruffle is focused.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `strategy.rs` gains tests for the seed merge and for ignoring the shortcut when the window id is absent. Run `cargo test --locked` in `lite/src-tauri`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open the launcher on the L5 base and at head. Save `/tmp/swarm-l6/worker-1/regression.png`. Pass when head shows Strategy, the L5 base does not, and To-Do still opens.
- [ ] Lane 2. Open Strategy on a fresh data dir. Save `/tmp/swarm-l6/worker-2/seed.png`. Pass when a seeded boss name is visible.
- [ ] Lane 3. Press the timer shortcut with Strategy open. Save `/tmp/swarm-l6/worker-3/timer-on.png`. Pass when the countdown label is moving.
- [ ] Lane 4. Press the shortcut again. Save `/tmp/swarm-l6/worker-4/timer-off.png`. Pass when the countdown label is stopped.
- [ ] Lane 5. Close Strategy and press the shortcut while Ruffle is focused. Save `/tmp/swarm-l6/worker-5/ignored.png`. Pass when no strategy window appears and the ruffle process is still one.
- [ ] Lane 6. Change the shortcut, restart, and press the new chord. Save `/tmp/swarm-l6/worker-6/rebind.png`. Pass when the countdown toggles and the old chord does nothing.
- [ ] Lane 7. Add a custom potion, restart, and reopen. Save `/tmp/swarm-l6/worker-7/potion.png`. Pass when the custom potion remains and a seeded potion remains.
- [ ] Lane 8. Open Strategy twice. Save `/tmp/swarm-l6/worker-8/focus.png`. Pass when only one strategy window exists.
- [ ] Lane 9. Edit a role note and restart. Save `/tmp/swarm-l6/worker-9/note.png`. Pass when the note text is still there.
- [ ] Lane 10. Close the launcher. Save `/tmp/swarm-l6/worker-10/quit.png`. Pass when the global shortcut no longer toggles anything and the player process is gone.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Delay from process start until Play is enabled, at the L5 base and at head. Also time from the shortcut press until the countdown label changes, while Strategy is open.
- [ ] Probe. Interleave five starts on the L5 base and five on head. Then five shortcut presses at head with Strategy already open.
- [ ] Baseline. Record the L5 start median first.
- [ ] Rule. Fail when the head start median exceeds the L5 median by more than 500 ms. Fail the shortcut when the label takes more than 200 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 3 and lane 5 screenshots into `/tmp/lite-port-review/l6-review-timer.png` and `/tmp/lite-port-review/l6-review-ignored.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `/tmp/lite-port-review/l6-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto L5 after the verdict, patch-id unchanged.
- [ ] The root appends L6 onto the L5 branch. The operator lands it. The owner does not merge.

## Sync inventory and wiki hover (L7)

**Depends on.** L6.

**Files.**

- [ ] Create `lite/src-tauri/src/inventory.rs` for `aquastar_inventory.json` and the account HTTP sync.
- [ ] Create `lite/ui/inventory.html` and `lite/ui/inventory.js`.
- [ ] Edit the account webview init script so the Sync Now button from `accountSyncButton.js` appears, and so WikiView from `features/wikiview/` runs on wiki and account pages.

**Build.**

- [ ] Sync reads the account webview cookie jar. It does not store a password. Endpoints stay `https://account.aq.com/` Home, CharPage, InventoryData, and BuyBackData.
- [ ] `autoSync` runs about 30 seconds after launch when the last sync is older than two hours, then every two hours.
- [ ] Hover previews call a Rust fetch of `https://aqwwiki.wikidot.com/` only, with a 5 MB cap and a 15 second timeout, matching `wikiFetch.js`.

**You see.**

- [ ] After a manual login in the account window, Sync Now fills the inventory window.
- [ ] Hovering a wiki link shows an image, and a logged-out sync shows an error instead of an empty success.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `inventory.rs` gains tests for the host allow-list, the two-hour gate, and label save. Run `cargo test --locked` in `lite/src-tauri`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open Account on the L6 base and at head. Save `/tmp/swarm-l7/worker-1/regression.png`. Pass when both show `account.aq.com`, and only head shows an Inventory button.
- [ ] Lane 2. Open Inventory before any login. Save `/tmp/swarm-l7/worker-2/logged-out.png`. Pass when the window says sync needs a login and the item table is empty.
- [ ] Lane 3. Log in with the lane's test account and click Sync Now. Save `/tmp/swarm-l7/worker-3/sync.png`. Pass when at least one item name is visible. Skip the lane with a recorded blocker when no test account exists.
- [ ] Lane 4. Restart and reopen Inventory. Save `/tmp/swarm-l7/worker-4/persist.png`. Pass when the Lane 3 item is still listed without a new sync.
- [ ] Lane 5. Set a label and restart. Save `/tmp/swarm-l7/worker-5/label.png`. Pass when the label text remains.
- [ ] Lane 6. Open a wiki item page and hover a link. Save `/tmp/swarm-l7/worker-6/hover.png`. Pass when a preview image is visible.
- [ ] Lane 7. On the account inventory page, confirm the Sync Now button. Save `/tmp/swarm-l7/worker-7/button.png`. Pass when the button text contains Sync Now.
- [ ] Lane 8. Open an item's wiki page from the inventory row. Save `/tmp/swarm-l7/worker-8/row-wiki.png`. Pass when the wiki window path matches that item.
- [ ] Lane 9. Turn on auto-sync, set the last sync to three hours ago, and wait. Save `/tmp/swarm-l7/worker-9/auto.png`. Pass when a sync log line appears without a second click.
- [ ] Lane 10. Point wiki fetch at a non-wikidot host. Save `/tmp/swarm-l7/worker-10/wiki-deny.png`. Pass when the preview stays empty and the log contains the rejection.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Delay from process start until Play is enabled, at the L6 base and at head. Also time a logged-out Inventory open until the login message is visible.
- [ ] Probe. Interleave five starts on the L6 base and five on head. Then five logged-out Inventory opens at head.
- [ ] Baseline. Record the L6 start median first.
- [ ] Rule. Fail when the head start median exceeds the L6 median by more than 500 ms. Fail Inventory when the login message takes more than 1500 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 and lane 6 screenshots into `/tmp/lite-port-review/l7-review-logged-out.png` and `/tmp/lite-port-review/l7-review-hover.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `/tmp/lite-port-review/l7-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto L6 after the verdict, patch-id unchanged.
- [ ] The root appends L7 onto the L6 branch. The operator lands it. The owner does not merge.

## Ship Portuguese and editable shortcuts (L8)

**Depends on.** L7.

**Files.**

- [ ] Create `lite/ui/locales/en-US.js` and `lite/ui/locales/pt-BR.js` from `res/po/` and `plugins/adventure-quest-worlds/locales/`.
- [ ] Edit `lite/ui/index.html` for the language select and the shortcut editor.
- [ ] Edit `lite/src-tauri/src/settings.rs` for `appLanguage` and the shortcut map.

**Build.**

- [ ] Language choices are system, `en-US`, and `pt-BR`. Map `pt` to `pt-BR` and `en` to `en-US`.
- [ ] The editor rebinds Reminders, To-Do, Strategy, Inventory, and the page buttons. It refuses the player keys the external process needs for gameplay. Platform defaults from Electron stay documented in Help, not registered globally, except the strategy timer from L6.

**You see.**

- [ ] Choosing `pt-BR` translates the launcher and Reminders, and the choice survives restart.
- [ ] A rebound Reminders shortcut opens Reminders, and the old chord does not.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add catalog key-parity tests and a test that an unknown language id falls back to `en-US`. Run `cargo test --locked` in `lite/src-tauri`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open the launcher on the L7 base and at head in the default language. Save `/tmp/swarm-l8/worker-1/regression.png`. Pass when both show Play and the head language control exists.
- [ ] Lane 2. Choose `pt-BR` and restart. Save `/tmp/swarm-l8/worker-2/pt.png`. Pass when the Play heading is the Portuguese string from `pt-BR.js`.
- [ ] Lane 3. Open Reminders in `pt-BR`. Save `/tmp/swarm-l8/worker-3/reminders-pt.png`. Pass when the window title is the Portuguese reminders title.
- [ ] Lane 4. Switch back to `en-US`. Save `/tmp/swarm-l8/worker-4/en.png`. Pass when the Play heading is English again.
- [ ] Lane 5. Set language to system on an `en` locale. Save `/tmp/swarm-l8/worker-5/system.png`. Pass when the UI is English.
- [ ] Lane 6. Rebind Reminders and press the new chord. Save `/tmp/swarm-l8/worker-6/rebind.png`. Pass when Reminders opens.
- [ ] Lane 7. Press the old Reminders chord. Save `/tmp/swarm-l8/worker-7/old-chord.png`. Pass when no second reminders window appears.
- [ ] Lane 8. Restart after Lane 6. Save `/tmp/swarm-l8/worker-8/persist.png`. Pass when the new chord still opens Reminders.
- [ ] Lane 9. Try to bind an empty chord. Save `/tmp/swarm-l8/worker-9/empty.png`. Pass when the editor shows an error and the previous chord remains.
- [ ] Lane 10. Open Help. Save `/tmp/swarm-l8/worker-10/help.png`. Pass when Help lists the rebound chord.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Delay from process start until Play is enabled, at the L7 base and at head, in `en-US`. Also time a switch to `pt-BR` until the heading updates.
- [ ] Probe. Interleave five starts on the L7 base and five on head. Then five language switches at head.
- [ ] Baseline. Record the L7 start median first.
- [ ] Rule. Fail when the head start median exceeds the L7 median by more than 500 ms. Fail the switch when the heading takes more than 300 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 and lane 6 screenshots into `/tmp/lite-port-review/l8-review-pt.png` and `/tmp/lite-port-review/l8-review-rebind.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `/tmp/lite-port-review/l8-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto L7 after the verdict, patch-id unchanged.
- [ ] The root appends L8 onto the L7 branch. The operator lands it. The owner does not merge.

## Screenshot the player window (L9)

**Depends on.** L8.

**Files.**

- [ ] Create `lite/src-tauri/src/capture.rs`.
- [ ] Edit `lite/ui/index.html` to add a Screenshot button.

**Build.**

- [ ] Find the external player window by process id, not by the launcher webview. Write a PNG under the Pictures directory using the same file name pattern as `res/instances.js` `takeSS`.
- [ ] If no player is running, show an error in the status line and write nothing.

**You see.**

- [ ] With Ruffle visible, Screenshot writes a PNG whose dimensions match the player window, and the status line shows the path.
- [ ] With no player, Screenshot writes no file.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `capture.rs` gains tests for the file name, the missing-process error, and refusing to capture the launcher window id. Run `cargo test --locked` in `lite/src-tauri`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Click Play at the L8 base and at head. Save `/tmp/swarm-l9/worker-1/regression.png`. Pass when both start one ruffle process. Head also shows Screenshot. The L8 base does not.
- [ ] Lane 2. Click Screenshot while Ruffle is open. Save `/tmp/swarm-l9/worker-2/shot.png`. Pass when a new PNG exists and the status line contains its path.
- [ ] Lane 3. Open that PNG. Save `/tmp/swarm-l9/worker-3/png.png`. Pass when the image width and height are both greater than 50.
- [ ] Lane 4. Click Screenshot with no player. Save `/tmp/swarm-l9/worker-4/none.png`. Pass when the status line reports no player and the PNG count is unchanged.
- [ ] Lane 5. Click Screenshot twice. Save `/tmp/swarm-l9/worker-5/two.png`. Pass when two PNGs exist with different names.
- [ ] Lane 6. Click Play Flash on Linux and Screenshot. Save `/tmp/swarm-l9/worker-6/flash-shot.png`. Pass when the PNG exists and the captured window is not the launcher.
- [ ] Lane 7. Cover the player with another window and Screenshot. Save `/tmp/swarm-l9/worker-7/occluded.png`. Pass when a PNG is still written. Record whether the pixels are the player or the cover, and do not fail on occlusion.
- [ ] Lane 8. Close the player, then Screenshot. Save `/tmp/swarm-l9/worker-8/closed.png`. Pass when no new PNG appears.
- [ ] Lane 9. Restart the launcher and Screenshot an already running player from the previous process. Save `/tmp/swarm-l9/worker-9/orphan.png`. Pass when the status line reports no tracked player. L1 owns the child list, and a new launcher does not adopt an orphan.
- [ ] Lane 10. Fill the screenshot directory until the write fails. Save `/tmp/swarm-l9/worker-10/disk.png`. Pass when the status line shows the write error and the launcher stays open.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Delay from process start until Play is enabled, at the L8 base and at head. Also time from the Screenshot click until the PNG file exists.
- [ ] Probe. Interleave five starts on the L8 base and five on head. Then five screenshots at head with Ruffle already open.
- [ ] Baseline. Record the L8 start median first.
- [ ] Rule. Fail when the head start median exceeds the L8 median by more than 500 ms. Fail a screenshot when the file takes more than 2000 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 and lane 3 screenshots into `/tmp/lite-port-review/l9-review-shot.png` and `/tmp/lite-port-review/l9-review-png.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `/tmp/lite-port-review/l9-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto L8 after the verdict, patch-id unchanged.
- [ ] The root appends L9 onto the L8 branch. The operator lands it. The owner does not merge.

## Record the player window (L10)

**Depends on.** L9.

**Files.**

- [ ] Edit `lite/src-tauri/src/capture.rs`.
- [ ] Edit `lite/ui/index.html` and `lite/ui/main.js` for a Record button.

**Build.**

- [ ] Record the same player window L9 found. Write a file the user picks. One recording at a time.
- [ ] Do not use the Electron `desktopCapturer` path. If the platform API cannot see the external window, stop and report that, and do not fall back to recording the launcher webview.

**You see.**

- [ ] Record starts, the button shows a stop state, and stop writes a playable file.
- [ ] A second record click while one is active does not start another file.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `capture.rs` gains tests for the single-recording flag and for refusing a launcher window id. Run `cargo test --locked` in `lite/src-tauri`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Click Screenshot on the L9 base and at head. Save `/tmp/swarm-l10/worker-1/regression.png`. Pass when both write a PNG. Head also shows Record.
- [ ] Lane 2. Start Record with Ruffle open, wait two seconds, and stop. Save `/tmp/swarm-l10/worker-2/record.png`. Pass when the chosen file exists and its size is greater than 1 KB.
- [ ] Lane 3. Play the file. Save `/tmp/swarm-l10/worker-3/playback.png`. Pass when a frame from the player is visible in the recording.
- [ ] Lane 4. Click Record twice before stop. Save `/tmp/swarm-l10/worker-4/twice.png`. Pass when only one output file grows.
- [ ] Lane 5. Click Record with no player. Save `/tmp/swarm-l10/worker-5/none.png`. Pass when the status line reports no player and no file is created.
- [ ] Lane 6. Close the player during a recording. Save `/tmp/swarm-l10/worker-6/died.png`. Pass when recording stops and the partial file is kept or the status line explains the stop.
- [ ] Lane 7. Cancel the save dialog. Save `/tmp/swarm-l10/worker-7/cancel.png`. Pass when no file is written and the button returns to idle.
- [ ] Lane 8. Record the Flash projector on Linux. Save `/tmp/swarm-l10/worker-8/flash.png`. Pass when the file exists and playback is not the launcher window.
- [ ] Lane 9. Start Ruffle after Record was refused, then Record. Save `/tmp/swarm-l10/worker-9/retry.png`. Pass when the second attempt writes a file.
- [ ] Lane 10. Close the launcher during a recording. Save `/tmp/swarm-l10/worker-10/quit.png`. Pass when the player process is gone and the recording file is closed.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Screenshot delay from L9, repeated at the L9 base and at head, so both sides produce the same metric. Also time a two-second recording until the file is closed, which trunk lacks.
- [ ] Probe. Interleave five screenshots on the L9 base and five on head. Then one two-second recording at head.
- [ ] Baseline. Record the L9 screenshot median first.
- [ ] Rule. Fail when the head screenshot median exceeds the L9 median by more than 500 ms. Fail the recording when the file is not closed within 5000 ms of stop.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 and lane 3 screenshots into `/tmp/lite-port-review/l10-review-record.png` and `/tmp/lite-port-review/l10-review-playback.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `/tmp/lite-port-review/l10-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto L9 after the verdict, patch-id unchanged.
- [ ] The root appends L10 onto the L9 branch. The operator lands it. The owner does not merge.

## Add DragonFable and a second AQW player (L11)

**Depends on.** L10.

**Files.**

- [ ] Edit `lite/src-tauri/src/game_url.rs` and `lite/src-tauri/src/players.rs`.
- [ ] Edit `lite/ui/index.html` for DragonFable and New AQW buttons.

**Build.**

- [ ] DragonFable launches `https://play.dragonfable.com/game/DFLoader.swf?ver=668201` as its own child. It does not replace the AQW child.
- [ ] New AQW starts a second AQW child with the resolved L2 URL. Cap live children at two AQW processes plus one DragonFable process. A further click focuses an existing child of that kind.

**You see.**

- [ ] AQW and DragonFable can be open together, and closing the launcher kills both.
- [ ] A third AQW click does not create a third AQW process.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `players.rs` gains tests for the per-kind cap and for kill-all covering mixed children. Run `cargo test --locked` in `lite/src-tauri`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Click Play once on the L10 base and at head. Save `/tmp/swarm-l11/worker-1/regression.png`. Pass when both keep a single AQW child after one click.
- [ ] Lane 2. Click DragonFable. Save `/tmp/swarm-l11/worker-2/df.png`. Pass when a child exists whose last argument contains `DFLoader.swf`.
- [ ] Lane 3. Click Play and DragonFable. Save `/tmp/swarm-l11/worker-3/both.png`. Pass when both children exist.
- [ ] Lane 4. Click New AQW. Save `/tmp/swarm-l11/worker-4/second.png`. Pass when two AQW children exist.
- [ ] Lane 5. Click New AQW again. Save `/tmp/swarm-l11/worker-5/cap.png`. Pass when the AQW child count stays at two.
- [ ] Lane 6. Click DragonFable again. Save `/tmp/swarm-l11/worker-6/df-cap.png`. Pass when the DragonFable child count stays at one.
- [ ] Lane 7. Close the launcher. Save `/tmp/swarm-l11/worker-7/quit.png`. Pass when no ruffle or flashplayer child remains.
- [ ] Lane 8. Use a custom SWF and click New AQW. Save `/tmp/swarm-l11/worker-8/custom.png`. Pass when both AQW children receive that SWF path.
- [ ] Lane 9. Turn the live loader off and click DragonFable. Save `/tmp/swarm-l11/worker-9/df-stable.png`. Pass when DragonFable still uses `DFLoader.swf` and AQW uses Loader4.
- [ ] Lane 10. Screenshot from L9 while two AQW children exist. Save `/tmp/swarm-l11/worker-10/which.png`. Pass when the status line names which child was captured.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Warm Play delay until the first ruffle process exists, at the L10 base and at head. Also time until the second AQW child exists, which the base lacks.
- [ ] Probe. Interleave five warm Plays on the L10 base and five on head. Then five New AQW clicks at head with one child already running.
- [ ] Baseline. Record the L10 Play median first.
- [ ] Rule. Fail when the head Play median exceeds the L10 median by more than 2000 ms. Fail the second child when it takes more than 3000 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 3 and lane 5 screenshots into `/tmp/lite-port-review/l11-review-both.png` and `/tmp/lite-port-review/l11-review-cap.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `/tmp/lite-port-review/l11-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto L10 after the verdict, patch-id unchanged.
- [ ] The root appends L11 onto the L10 branch. The operator lands it. The owner does not merge.

## Update Ruffle on request (L12)

**Depends on.** L11.

**Files.**

- [ ] Create `lite/src-tauri/src/ruffle_update.rs`.
- [ ] Edit `lite/ui/index.html` for a channel select and an Update button.

**Build.**

- [ ] Default stays the pinned 0.7.1 archive and its SHA-256 from `players.rs`. Update runs only after an explicit click.
- [ ] Channels are `latest` and `nightly`, using the same GitHub release URLs as `res/ruffleNative.js`. Reject a download whose SHA-256 is absent. Keep the previous binary if the new one fails the hash or fails to start.

**You see.**

- [ ] Without a click, Play still runs 0.7.1.
- [ ] After a successful update, Play runs the new tag, and a failed hash leaves 0.7.1 in place.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `ruffle_update.rs` gains tests for hash reject, channel URL choice, and keeping the previous directory. Run `cargo test --locked` in `lite/src-tauri`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Click Play on the L11 base and at head with no update click. Save `/tmp/swarm-l12/worker-1/regression.png`. Pass when both child paths contain `ruffle-0.7.1`.
- [ ] Lane 2. Open the update control and do not click it. Save `/tmp/swarm-l12/worker-2/idle.png`. Pass when the status line does not say a download started.
- [ ] Lane 3. Click Update against a local fake release with a matching hash. Save `/tmp/swarm-l12/worker-3/updated.png`. Pass when the next Play path contains the fake tag.
- [ ] Lane 4. Click Update against a fake release with a bad hash. Save `/tmp/swarm-l12/worker-4/bad-hash.png`. Pass when Play still uses the previous tag.
- [ ] Lane 5. Choose nightly and click Update on the fake server. Save `/tmp/swarm-l12/worker-5/nightly.png`. Pass when the requested URL contains the nightly query the unit test locks.
- [ ] Lane 6. Kill the network during a download. Save `/tmp/swarm-l12/worker-6/offline.png`. Pass when Play still starts the previous binary.
- [ ] Lane 7. Restart after Lane 3. Save `/tmp/swarm-l12/worker-7/persist.png`. Pass when Play still uses the new tag.
- [ ] Lane 8. Click Restore bundled. Save `/tmp/swarm-l12/worker-8/restore.png`. Pass when the next Play path contains `ruffle-0.7.1`.
- [ ] Lane 9. Start Play during a download. Save `/tmp/swarm-l12/worker-9/during.png`. Pass when the running child stays the old binary until the launcher is restarted.
- [ ] Lane 10. Point Update at a non-GitHub host. Save `/tmp/swarm-l12/worker-10/host.png`. Pass when the status line rejects the host and no new directory appears.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Warm Play delay until the ruffle process exists, at the L11 base and at head, with no update clicked. Also time a hash reject until the status line shows the error.
- [ ] Probe. Interleave five warm Plays on the L11 base and five on head. Then five bad-hash updates at head against the local fake server.
- [ ] Baseline. Record the L11 Play median first.
- [ ] Rule. Fail when the head Play median exceeds the L11 median by more than 2000 ms. Fail the hash reject when the error takes more than 1000 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and lane 4 screenshots into `/tmp/lite-port-review/l12-review-pin.png` and `/tmp/lite-port-review/l12-review-hash.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `/tmp/lite-port-review/l12-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto L11 after the verdict, patch-id unchanged.
- [ ] The root appends L12 onto the L11 branch. The operator lands it. The owner does not merge.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

No prototype was built. The open product questions are preference calls, and a throwaway build of PPAPI inside Tauri would be the port itself. Repo facts came from the tree at `4d9b53a` and from `gh pr view` for pull requests 31, 44, 47, and 48.

Unproven, with the default already used in this plan.

- Whether account pages reject a webview that does not send the Artix user agent. L3 sends it anyway, because the Electron plugin does and the cost is one header. Say to drop the header if a logged-in account window works without it.
- Whether Windows or macOS should download a Flash projector. The default is no. Those systems stay Ruffle only, which is what `players.rs` does now.
- Whether pull request 47 should merge before L1. The default is that L1 implements the same flags and rebases if 47 lands first. Say to merge 47 first if you want that review to finish on its own branch.
- Whether Lite should replace the Electron app. The default is no. Electron keeps PPAPI and the plugin host. Lite does not edit `main.js`.
- Whether a real AQW session completes on Ruffle desktop 0.7.1 with `--tcp-connections allow`. The Electron native path uses that flag and does not start `res/socketProxy.js`. This plan did not play a session. Say to block L1 if a manual session fails.
- Whether the Linux projector still reaches the AQW login. `lite/README.md` says it does. No test in the tree runs the projector. Say to disable the Flash button if a manual login fails.
- A test account for L7 sync does not exist in this repo. Lane 3 of L7 records a blocker instead of inventing a login.

## Appendix B. Alternatives rejected

A Tauri port of the plugin host lost. The host API returns Electron windows and `ipcMain` channels. Lite would grow a second shell beside Electron, and AQW is the only game the launcher needs. DragonFable is one URL button in L11, not a plugin.

In-page Ruffle plus `res/socketProxy.js` lost. Native Ruffle already opens TCP. The proxy exists because the webview build cannot. Keeping both players in Lite doubles the network stack for one game.

Porting Char Page Studio lost. The lab and the GIF capture are a second Electron process with PPAPI, `webSecurity` off, and a hidden Flash window. There is no in-webview Flash in Lite to aim that at.

An in-app updater for AquaStar itself lost. The Electron app has none. Releases stay on GitHub via `v*` and `lite-v*` tags.

Building the companion tools before the single-player session lost. A reminders window does not help if Play starts two games or the wrong loader. L1 and L2 are first for that reason.

Merging screenshot and recording into one pull request lost. Recording needs a window id that screenshot has already proven. L10 stops if L9 cannot see the external window.

## Appendix C. Risks

`pstack/` is not in this repository. The `git show origin/main:pstack/...` lines will fail until the execution program reads those skills from the Cursor plugin cache. That is a process risk on every pull request, and the owner watches the first tick.

`control-ui` is not installed here. Live lanes drive a Tauri window and an external player through the computer-use surface. A lane that only screenshots the HTML file in a browser is a fail. The owner watches the process list in every report.

L3 user-agent behavior is unproven against a live account login. The owner watches Lane 7 and a manual login note.

L7 needs a real account session. Without one, Lane 3 stays blocked and the pull request does not become stack-ready.

L9 and L10 depend on the operating system exposing the player window. If Lane 2 of L9 cannot see it, L10 does not start. The owner reports that instead of recording the launcher.

L11 raises the child cap. A bug there can leak players after quit. Lane 7 is the guard.

L12 downloads and runs a new native binary. The hash check and the host allow-list are the guards. A missing hash is a reject, not a warning.

The font limit in `lite/src-tauri/src/fonts.rs` is already on this branch and is easy to undo by setting `FONTCONFIG_FILE` on the player. L1 must keep `without_launcher_fontconfig`. The owner watches a player start on a machine with a large font set.

Pull request 47 may merge during the program. L1 rebases onto it. A conflict in `players.rs` is expected and is not a reason to rewrite the settings twice.

## Appendix D. Links and reading list

Read these before editing.

- `lite/README.md` for what the launcher already does.
- `docs/PLUGINS.md` and `docs/design/plugin-architecture.md` for the Electron host this plan does not port.
- `docs/FLASH_CHECKLIST.md` for the manual Electron pass. Lite does not tick those PPAPI boxes.
- `res/ruffleNative.js`, `res/socketProxy.js`, `res/flash.js`, and `plugins/adventure-quest-worlds/launcher-config.js`.

L1 and L2 get `pstack/skills/how/SKILL.md` because the player arguments and the URL resolver are the load-bearing design. L7 and L10 get `pstack/skills/interrogate/SKILL.md` because cookie sync and window capture are the two designs most likely to be wrong.

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

**play-flash.** In, L1, effort S. Keep the Linux projector button. Do not add Windows or macOS projectors unless you override Appendix A.

**aqw-live-loader.** In, L2, effort M. The built-in Loader4 URL already went stale once, which is why pull request 31 added the lookup. The result is a string the external player can open.

**custom-url.** In, L2, effort S. Same string path as the live loader.

**custom-swf.** In, L2, effort S. Native Ruffle already takes a filesystem path as the last argument.

**aqw-custom-swf-alias.** In, L2, effort S. One extra filename, `aqlite_old.swf`, so old files keep working.

**aqw-testing-game.** In, L2, effort S. One more URL on the same player path.

**open-site.** In, L3, effort S. Wiki, account, and news already work. Design notes, gifts, calendar, and the character lookup are more allow-listed HTTPS pages.

**aqw-navigation.** In, L3, effort M. Wiki ad removal is page script in a Tauri webview. It never touches the game window.

**aqw-user-agent.** In, L3, effort M. Account and news windows are still webviews, so they can send the header the Electron session sends. The external player keeps its own agent. Whether Artix checks the header is unproven, and L3 sends it anyway.

**help-about.** In, L3, effort S. Version and the releases link are how people notice a bad build. No Flash involved.

**aqw-account-and-character.** In, L3 for the character-page URL, effort S. The name is a query string. Auto-sync waits for L7.

### Later, L4 through L12

**aqw-reminders.** Later, L4, effort M. Local HTML and a JSON file. The reset clock is pure date math in `reset-time.js`.

**aqw-reset-time.** Later, L4, effort S. It has no UI of its own. It ships with reminders.

**aqw-list-kit.** Later, L4, effort M. Port it once and let to-do reuse it.

**aqw-workspace-ui.** Later, L4, effort M. Character tabs are part of the reminders window.

**aqw-todo.** Later, L5, effort M. Same kit, different file, no clock.

**aqw-strategy.** Later, L6, effort M. The window is HTML. The timer chord is a global shortcut, which Tauri does not have in this tree yet, so this is the first plugin dependency.

**shortcuts.** Later, L6 for the strategy chord and L8 for the editor, effort M. F2 and Ctrl+J do not move until capture exists, because those chords exist to hit a focused Flash window. An external player does not deliver them to the shell.

**namespaced-store.** Later, with L4, effort S. Lite can write the same JSON filenames. It should not grow the full `getStore` host.

**settings-persistence.** Later, L1 starts it for Ruffle flags, effort M. Do not copy the dual-write merge. One Lite settings file is enough. Electron `aquastar.json` stays the Electron file, except L4 may read a legacy reminders file once.

**settings-ui.** Later, split across L1, L2, and L8, effort M. Port the rows Lite uses. Do not port the plugin picker.

**aqw-inventory.** Later, L7, effort L. Sync is HTTP plus the account cookie jar. It does not need the SWF. It does need a logged-in webview, which is the hard part.

**aqw-account-sync.** Later, L7, effort M. The button is injected into the account page, which Lite can still open.

**aqw-wiki-fetch.** Later, L7, effort S. A server-side GET of a public wiki URL. The CORS reason is unchanged.

**aqw-wikiview.** Later, L7, effort M. Hover and badges run on wiki and account HTML, not on the game. Badges need inventory counts, so they ship together.

**i18n.** Later, L8, effort M. en-US and pt-BR already exist as data.

**aqw-locales.** Later, L8, effort M. Same catalogs, new windows.

**screenshots.** Later, L9, effort L. `capturePage` sees the Electron webview only. Lite has to capture the other process. That is a different feature, not a port of the call.

**screen-recording.** Later, L10, effort L. Same window id as L9. If L9 cannot see the window, drop recording instead of filming the launcher. The vp8 limit is an Electron 11 limit and does not apply to a native capture.

**aqw-dragonfable.** Later, L11, effort S. One more external URL. It does not need the plugin host.

**multi-window.** Later, L11, effort M. Two AQW children plus one DragonFable child is the cap. Electron's unbounded window list is not the goal.

**ruffle-native update.** Later, L12, effort M. The pin stays the default so a bad release cannot start itself. Update is a button.

**aqw-window-title.** Later, L11, effort S. Set the launcher title from the character name. The player window is `--no-gui` and is not retitled.

**aqw-menus.** Later, as buttons on the launcher from L3 through L11, effort M. Do not rebuild the Electron menu template. The launcher is a small window, and buttons match what Lite already uses.

**aqw-keybinds.** Later, L8, effort M. Rebind the companion actions. Do not register a global chord for every Electron default.

**session-rules.** Later, only the wiki cleanup in L3, effort S. The ad-domain cancel list does not see the external player's traffic. Do not pretend it does.

**child-windows.** Later, L3, effort S. `open_site` already focuses an existing label. Keep that, and do not implement Electron `new-window`.

**feature-windows.** Later, L4 through L7, effort M. One window per tool, focus on second open. Same rule as the Electron controller, without `BrowserWindow`.

**logging.** Later, a status line only, effort S. The SWF request log cannot see an external player. Drop `swfLog`.

**crash-and-errors.** Later, L1 for the OpenGL retry, effort S. Do not port crashpad. It is already off.

### Out

**flash-ppapi.** Out. Tauri has no PPAPI host, and this plan forbids in-webview Flash. The binaries under `FlashPlayer/` stay in the Electron package.

**swf-wrapper.** Out. The object tag needs that PPAPI host.

**flash-trust.** Out. The trust file is for the PPAPI plugin inside Electron user data. The standalone projector does not read it.

**aqw-flash-trust.** Out. Same list, plugin side.

**chromium-switches.** Out. They tune the Electron process that paints the game. The external player does not inherit them.

**sandbox-flags.** Out. `sandbox` false exists so PPAPI loads. Lite's game is not that webview.

**spellchecker-off.** Out. It stops a Chromium download in the Electron session.

**ruffle-web.** Out. That mode is the SWF inside the webview. Lite's Ruffle is the desktop binary.

**ruffle-web-update.** Out. It replaces `ruffle.js` for the webview mode. L12 updates the desktop binary instead.

**socket-proxy.** Out. Native Ruffle opens TCP with `--tcp-connections allow`. The proxy is only for the webview build.

**aqw-ruffle-socket.** Out. Input to that proxy.

**aqw-server-list.** Out. Fallback hosts for that proxy. It is not a picker, so there is nothing to show.

**aqw-render-modes.** Out as a three-way setting. Lite's choice is the Play button, Ruffle or Flash, and Flash only where the projector exists.

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
