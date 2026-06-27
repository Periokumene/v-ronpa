# Harness Assets

Temporary first-slice assets live here so subsystem worktrees can validate
presentation behavior without entering the production asset pipeline.

Assets in this directory are registered into
`ContentManifest.runtimeAssets` by `pnpm generate:assets`. Runtime code should
use the asset ids below and resolve them through the app-created
`AssetRegistry`; do not load these files by public URL from adapters or
scripts.

## Workflow

- Add or replace files under `apps/game/public/harness/**`.
- Run `pnpm generate:assets` to update
  `apps/game/src/harness/generatedAssets.ts`.
- Run `pnpm validate:assets` to verify the generated manifest is current, files
  exist, and source code does not contain hardcoded runtime asset paths.
- Voice fixtures must use `media/voice/<locale>/<textId>.ogg`. The `<textId>`
  stem is the script `|#textId|` value and may contain only letters, numbers,
  `_`, and `-`.

## Registered Asset Ids

| Asset id | Kind | Intended validation use |
|---|---|---|
| `bg:harness` | `background` | Default VN/Pixi background |
| `bg:black` | `background` | High-contrast Pixi FX checks |
| `bg:classroom` | `background` | Alternate VN/Pixi background |
| `portrait:felix:neutral` | `portrait` | Felix neutral portrait |
| `portrait:felix:concerned` | `portrait` | Felix concerned portrait |
| `portrait:mira:neutral` | `portrait` | Mira neutral portrait |
| `portrait:ren:neutral` | `portrait` | Ren neutral portrait |
| `model:academy-hall` | `glb` | Navi academy hall model |
| `model:classroom` | `glb` | Navi classroom model |
| `model:props-case-file` | `glb` | Harness prop registration coverage |
| `model:props-door` | `glb` | Harness prop registration coverage |
| `texture:evidence:keycard-thumbnail` | `texture` | Evidence thumbnail/icon reference |
| `texture:item:notebook-thumbnail` | `texture` | Item thumbnail registration coverage |
| `bgm:validation-main` | `bgm` | Default BGM group playback |
| `bgm:validation-alt` | `bgm` | Same-group BGM replacement |
| `bgm:validation-layer` | `bgm` | Second BGM group coexistence |
| `bgm:validation-extra` | `bgm` | Reserved BGM resolver coverage |
| `sfx:rain-inside-car-loop` | `sfx` | Looping SFX tracking |
| `sfx:shock-fadeout` | `sfx` | One-shot or `sfxFast` |
| `sfx:knock-door` | `sfx` | One-shot SFX |
| `voice:zh:voice_validation_0001` | `voice` | textId auto voice validation |
| `video:validation-intro` | `video` | Blocking movie playback |

These files are harness fixtures. They may be removed after the vertical-slice
integration has been accepted or replaced by production assets, but their asset
ids should be migrated through `ContentManifest.runtimeAssets` rather than
converted back to raw paths.
