# AquaStar Empty Scene SWF

`characterB-empty-scene.swf` is the native-Flash renderer used by **Char Page
Studio → Cenário vazio**. It is separate from `characterB-studio.swf`: the
latter remains the derived official Char Page, while this movie creates a
clean scene with a solid background and no Char Page interface.

## What it contains

The movie reuses the AQW avatar compositor from the vendored
`vendor/swf2png-item-base.swf` base. The accompanying
`vendor/swf2png-item-preview.fla` is the original library reference:

- `LoadController` downloads equipment SWFs and loads them with `loadBytes`
  into an isolated `ApplicationDomain`.
- `CharacterBaseRender` assembles class/armor, hair or helm, weapon, cape,
  pet, ground and all six AQW color channels.
- `Main.as` and `CharacterDialogRender.as` are AquaStar replacements. They
  remove the AIR TCP server and PNG encoder, read FlashVars, draw the solid
  background, and centre the completed avatar on the stage.

The retained `CharacterDialogRender` class name is intentional. FFDec replaces
classes already present in the base SWF; retaining that linkage lets us rebuild
without hand-editing ABC or the FLA library.

## Supported FlashVars

The renderer accepts the usual public Char Page fields, including the normal
and cosmetic armor, helm, weapon and cape fields; hair, pet, ground, gender,
`ia1`, and the six `intColor*` values. Cosmetic fields win when a usable
`strCust*File` is supplied, matching the Studio's visible cosmetics.

Additional Studio fields:

| FlashVar | Default | Purpose |
| --- | --- | --- |
| `studioAssetBaseUrl` | `https://game.aq.com/game/gamefiles` | AQW asset root used by the loader. |
| `studioBackgroundColor` | `16708037` (`#FEF1C5`) | Solid scene background as a decimal RGB value. |
| `studioFrameRate` | `30` | Playback rate: `30` for the current scene rate or `24` for AQW's native rate. |
| `studioAvatarScale` | `1` | Multiplier applied after centring. |
| `studioAvatarOffsetX` / `studioAvatarOffsetY` | `0` | Pixel offsets after centring. |
| `studioUseWeapon` | `true` | `false` loads `items/swords/unarmed.swf`. |

The host page still passes the weapon FlashVars themselves, so existing
Char Page Studio controls continue to work. `studioUseWeapon` is available to
callers that want to select Unarmed without mutating those fields.

## Rebuilding

Prerequisites:

1. Keep the tracked `vendor/swf2png-item-base.swf` base alongside this file.
2. Install JPEXS FFDec and locate `ffdec-cli.exe`. The developer copy in
   `work/charpage-lab/ffdec/` is auto-detected when present.
3. Run from the repository root:

```powershell
& .\res\features\charpage\empty-scene\build-empty-scene.ps1
```

Or pass `-FFDecPath C:\path\to\ffdec-cli.exe`.

The script imports `scripts/` into a temporary copy of `Item.swf`, then writes
`res/features/charpage/characterB-empty-scene.swf`. Finally it verifies the
header. A successful output must report **version=15**, **715×455**, and
**30 FPS**. Version 15 is deliberate: AquaStar's PPAPI plugin is Flash 32,
whereas the supplied AIR build is SWF version 34 and cannot be used directly.

## Testing checklist

1. Open Char Page Studio, choose **Cenário vazio**, load a character and render.
2. Check a normal character, a cosmetic armor, helm, cape, pet, ground, dagger
   or gauntlet, and both genders.
3. Compare all six color controls with the public Char Page.
4. Toggle **Mostrar arma** and confirm that Unarmed is invisible.
5. Verify solid background color, zoom, offsets and PNG capture.
6. Re-run `npm test` after changes to the host integration.

## Attribution

This feature derives its compositor and its `Item.swf` base from SWF2PNG,
licensed under MIT, Copyright (c) 2025 Anthony S. The required notice is in
`SWF2PNG-NOTICE.md`. The AIR-only TCP service, image encoder invocation and
debug UI are not used by AquaStar.
