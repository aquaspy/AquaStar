# Game screenshots and recording (3.x development)

Open **Preferences → Screenshots and recording → Open Capture Controls**, or use the Tools menu. Start a game first. **F2** saves a PNG; **Ctrl+J** starts or stops an MP4 recording. These shortcuts follow the saved keybindings and are registered while a player is running. With several game windows, choose the target in Capture Controls.

Shortcuts act directly: neither F2 nor Ctrl+J opens a control window or an AquaStar message dialog. The Wayland system picker may still appear when authorization is needed. Status, saved paths, errors and a Stop Recording button are available in the existing launcher Preferences. Open Capture Controls manually if you want the optional separate controls, including REC and elapsed time while the launcher is hidden. Closing the controls hides them during recording; it does not silently stop the recording. Closing the game finalizes the completed portion. The launcher returns afterwards, or exits after a direct `--no-launcher` session.

## Files and defaults

- Screenshots retain the captured window's pixel resolution.
- Video uses H.264 in MP4, up to 1920×1080 at 30 FPS, without enlarging smaller windows. Its dimensions stay fixed if the game is resized.
- macOS before 12.3 uses the legacy image capture path at 15 FPS.
- Recordings contain video only. Game, microphone and system audio are not captured. There is no audio option.
- Default folders are the system Pictures directory's `AquaStar Screenshots` and Videos directory's `AquaStar Recordings`. Change them through the native folder picker.

Settings are stored separately in `capture-settings.json` in the Tauri configuration directory. Existing Electron settings are not overwritten. Only one recording can run at a time. Temporary fragmented MP4 files are retained on finalization errors, rather than reported as successfully saved recordings.

## Platform behavior

| System | Capture path | Audio |
| --- | --- | --- |
| Windows | Windows Graphics Capture, targeting the player window | None |
| macOS 12.3+ | ScreenCaptureKit helper targeting the player window | None |
| macOS 11–12.2 | Core Graphics image capture, capped at 15 FPS | None |
| Linux X11 | XComposite window pixmap, with window-drawable fallback | None |
| Linux Wayland | ScreenCast portal and its private PipeWire remote | None |

On Wayland, select the game window in the system picker. Desktops that support only monitor capture are reported as unsupported; AquaStar does not capture the entire monitor instead. The portal cannot reliably expose the selected window's PID, so select the window matching the game chosen in AquaStar. Audio is not captured.


Minimizing an X11/Windows game ends the current recording and saves its completed portion. Closing or automatically replacing a player process never transfers an ongoing recording to another process. Capture availability does not change the launcher's operating-system minimum.

## Encoder and packaging

The installer includes a minimal standalone FFmpeg 8.1.3/OpenH264 2.6.0 build. No download or separately installed FFmpeg is needed at runtime. Only file/pipe protocols and the required codecs, filters and containers are enabled. The Linux x64 component measured approximately 4.4 MiB before installer compression.

Build it with `python3 desktop/scripts/build-media.py`. Sources, checksums and configure flags are pinned in the build script. Source downloads and compiler output live outside the checkout in the sibling workspace. Generated binaries and license manifests are placed in the ignored `desktop/src-tauri/media/` directory. macOS universal packages include both native architectures; Windows portable ZIPs include the media directory beside the executable. See [media notices](../desktop/licenses/media.md).

The local build script prepares the media component when missing or its build recipe/native helper changes. For a manual optimized binary, copy `src-tauri/media/` beside the executable, or use a normal Tauri bundle. `AQUASTAR_CAPTURE_FFMPEG` is a debug-only encoder override, not a plugin or production API.

## Validation

The native `capture-probe` example records a synthetic window using the real capture and encoder paths. `desktop/scripts/smoke/capture.py` validates the PNG, H.264 metadata, duration and absence of audio tracks. The Capture Check workflow builds all three platforms and exercises window capture on Linux and Windows; macOS interactive permission, Retina and game-renderer behavior require a real Mac test. Wayland likewise requires a compatible compositor session.

Do not describe compilation or fixture tests as proof of authenticated gameplay, every graphics backend, or every supported OS version. Before production, test Flash/Ruffle, occlusion, resize, minimized windows, absence of audio tracks, permissions, disk-full failures, close/exit finalization, direct startup and a ten-minute recording. Record capture FPS, video timing, game performance and package-size changes.

### GNOME/Zorin Wayland validation (after rc.5)

An interactive portal test found that Mutter rejects the earlier frame-rate constraints. Development builds now accept the compositor's native/variable frame rate and use the recorder's own 30 FPS clock. The selected default pixel format is also included among the allowed alternatives. VideoCrop metadata is requested and applied to capture the window bounds instead of the compositor's larger backing canvas; the window's own decorations/shadow can remain.

Earlier audio-enabled development builds were validated on GNOME/Zorin Wayland: PNG, a ten-second H.264/AAC recording with a process-owned tone on a private silent sink, and motion in all 20 sampled frames. Track durations differed by approximately 27 ms. A separate three-second capture of Artix Ruffle using Automatic/Vulkan and a local sample SWF also succeeded. This does not establish authenticated AQW gameplay, every compositor, or long-session performance on Wayland. macOS recording still needs a real test.

These fixes are newer than the published v3.0.0-rc.5 installers. Use an updated development build for Wayland capture.

### Remembering Wayland authorization

On Wayland, Capture Controls offers **Remember window authorization**, enabled by default for new settings. AquaStar requests a persistent ScreenCast permission and stores a returned restore token with owner-only file permissions. Subsequent captures of that same live game can restore the selection without another picker, if supported by the desktop. The latest returned token replaces the single-use token. Tokens are never exposed to plugin or tool WebViews.

**Remember window authorization** defaults on for new installations and settings without this field; explicitly saved choices are preserved. The first selection still requires system approval.

A grant is bound to the player's PID, process start time and boot identity. A different/restarted game requires a new selection; the most recently authorized game is remembered. Turning the option off deletes the locally saved token; it does not promise to revoke the portal's own permission records. Your desktop may ask again after permission revocation, missing/unsupported tokens or session changes. No background capture stream stays running between captures.

GNOME/Zorin was tested with two consecutive native captures: the first returned a token and the second restored it without picker delay. This confirms reuse for the same still-open window, not a permanent grant for future game processes or every compositor.

### GNOME Wayland capture shortcuts

On GNOME Wayland without the GlobalShortcuts portal, enable **Use GNOME shortcuts for capture** in Preferences. This opt-in creates two AquaStar custom keyboard shortcuts, preserves unrelated entries, and activates the configured capture keys while a tracked game runs. Normal shutdown suspends the bindings; disabling the option removes AquaStar's entries. Local builds must remain at their current executable path while the integration is enabled. Other Wayland desktops may require their own shortcut setup.

Preferences also provides direct screenshot/recording buttons and displays the actual output folders. Defaults are `Pictures/AquaStar Screenshots` (PNG) and `Videos/AquaStar Recordings` (MP4), using the OS user directories. Capture feedback uses desktop notifications without opening a window: Linux requests a silent, transient notification for 2.5 seconds, replacing the previous capture notification. Desktop notification policy may suppress it or control its duration.


Current recordings are always silent. The removed `audio` preference is accepted only for compatibility and is omitted when capture settings are saved again.

Linux notification delivery uses a persistent D-Bus sender so GNOME does not immediately destroy the source and subsequent capture notifications can replace the previous one. Sending errors are logged to stderr. The native probe checks consecutive messages; visible banners were confirmed by the GNOME Wayland tester after this fix. Desktop policy can still hide banners, particularly during fullscreen or Do Not Disturb.
