# Harness Assets

Integrated harness-showcase fixture assets live here so the game harness can
validate VN, Navi, Trial, Pixi, R3F, media, and UI behavior without entering
the production asset pipeline.

Assets in this directory are registered into
`ContentManifest.runtimeAssets` by `pnpm generate:assets`. Runtime code should
use the asset ids below and resolve them through the app-created
`AssetRegistry`; do not load these files by public URL from adapters or
scripts.

## Workflow

- Add or replace files under `apps/game-harness/public/harness/**`.
- Run `pnpm generate:assets` to update
  `apps/game-harness/src/harness/generatedAssets.ts`.
- Run `pnpm validate:assets` to verify the generated manifest is current, files
  exist, and source code does not contain hardcoded runtime asset paths.
- Voice fixtures must use `media/voice/<locale>/<textId>.ogg`. The `<textId>`
  stem is the script `|#textId|` value and may contain only letters, numbers,
  `_`, and `-`.
- Dialogue bleep fixtures must use `media/bleep/<bleepId>.ogg`. The `<bleepId>`
  stem becomes `bleep:<bleepId>` and may contain only letters, numbers, `_`,
  and `-`.

## Voice Fixture Set

The `zh` voice fixtures include one synthetic smoke-test clip and one
reference-derived sample route extracted only as data from the external
`story-board - 副本` project. The current harness keeps its own `.nani` syntax
and runtime path; the imported files are only audio fixtures named by textId.
The real sample is exposed through the single harness-showcase choice 3 branch.
The former timing-based AUTO/SKIP browser hook is intentionally absent; its
deterministic replacement is tracked in `docs/review-watchlist.md`.

| TextId range | Files | Scenario branch |
|---|---:|---|
| `voice_validation_0001` | 1 | Basic textId voice asset smoke test |
| `0102Adv03_Ema001..004` | 4 | Real sample A: broadcast decision |
| `0102Adv03_Sherry001..004` | 4 | Real sample A: broadcast decision |
| `0102Adv03_Margo001..004` | 4 | Real sample A: broadcast decision |
| `0102Adv04_Ema001..004` | 4 | Real sample B: evidence handoff |
| `0102Adv04_Sherry001..004` | 4 | Real sample B: evidence handoff |
| `0102Adv04_Margo001..004` | 4 | Real sample B: evidence handoff |

## Dialogue Bleep Fixture Set

Dialogue bleep fixtures validate the dialogue audio planner's unvoiced fallback
path. `bleep:dialogue-default` is the manifest default, `bleep:dialogue-felix`
is the speaker override sample, and the `Narrator` speaker is configured as a
null override in the harness manifest.

## Registered Asset Ids

| Asset id | Kind | Intended validation use |
|---|---|---|
| `bg:harness` | `background` | Default VN/Pixi background |
| `bg:black` | `background` | High-contrast Pixi FX checks |
| `bg:classroom` | `background` | Alternate VN/Pixi background |
| `Ema` | `character-pack` | Layered character pack entry JSON |
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
| `bleep:dialogue-default` | `bleep` | Default dialogue bleep fallback |
| `bleep:dialogue-felix` | `bleep` | Speaker override dialogue bleep fallback |
| `voice:zh:voice_validation_0001` | `voice` | textId voice asset validation |
| `voice:zh:0102Adv03_*` | `voice` | Choice 3 real textId voice asset validation |
| `voice:zh:0102Adv04_*` | `voice` | Choice 3 real textId voice asset validation |
| `video:validation-intro` | `video` | Blocking movie playback |

These files are harness fixtures. They may be removed after the harness-showcase
integration has been accepted or replaced by production assets, but their asset
ids should be migrated through `ContentManifest.runtimeAssets` rather than
converted back to raw paths.
