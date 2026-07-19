# VS Code Nani Alignment Audit — 2026-07-17

> **Status: Historical / Superseded.** This file records the July 2026 catalog and asset-alignment audit. Its former editor-diagnostic implementation notes are superseded by the repository's exact-source diagnostic architecture; the VS Code adapter now consumes parser/compiler spans without local semantic probes or range inference.

## Baseline and method

- Baseline tag: `vscode-nani-adapter-baseline-2026-07-03` (annotated tag object `1cb35cd`, peeled commit `294f799`).
- Audit range: every commit reachable from current `06a95cc` and not reachable from the baseline tag.
- Count: 27 commits, including the two side-branch commits `5071ede` and `7f32521` and their merge commits.
- Each merge was reviewed against its first parent; the side-branch commit was reviewed separately so behavior is neither missed nor counted twice.
- `git diff vscode-nani-adapter-baseline-2026-07-03..06a95cc -- packages/nani-parser tools/vscode-nani` confirms that the parser and extension had no post-tag changes before this alignment work.

## Commit-by-commit review

| Commit | Date | Subject | Nani/compiler relevance | Effective change and adapter action |
|---|---|---|---|---|
| `9d0082f` | 2026-07-04 | Update game-a opening assets and centered choices | Content/resources | Replaced opening media/background references and regenerated asset metadata. No grammar or compiler change. The project asset index must read generated IDs instead of carrying Game A constants. |
| `24a0d0d` | 2026-07-05 | chore: batch updates | Runtime media semantics | Added pathless active-volume adjustment for BGM and looped SFX, same-resource/no-restart volume updates, `time` as volume-ramp duration in that form, and operational playback `fade`. Adapter keeps `group`, `volume`, `time`, and `fade` available and documents the delta in this audit. |
| `6366012` | 2026-07-05 | feat(game-a): add VN debug launch targets | Content/debug wiring | Added debug launch content and an earlier Alice composition pack. No parser/compiler syntax change. Resource discovery must be app-relative rather than tied to one launch route. |
| `39bfe95` | 2026-07-06 | refactor: simplify layered character anchors | Presentation/contracts | Changed layered-character anchor representation. No `.nani` command, parameter, default, or compiler IR change. No adapter action. |
| `fed8f79` | 2026-07-06 | docs: split app VN integration guidance | None | Documentation reorganization only. No adapter action. |
| `a2faf6c` | 2026-07-08 | feat(game-a): add VN pause tabs and settings controls | None | App DOM/settings work only. No adapter action. |
| `f5478e1` | 2026-07-09 | feat: hard cut save data v5 architecture | Save contracts | Save architecture changed, but not `.nani` authoring or compiler normalization. No adapter action. |
| `1d48ce4` | 2026-07-09 | Update save and load slot pagination | Save/UI contracts | No language or command behavior change. No adapter action. |
| `2244a79` | 2026-07-09 | Unify save slot storage and thumbnails | Save/media storage | No `.nani` command behavior change. No adapter action. |
| `4921a4f` | 2026-07-11 | feat(contracts): converge save and flow authority | Contract organization | Contract convergence retained command-catalog behavior; changes were save/flow boundaries rather than new Nani syntax. Adapter continues consuming the shared catalog. |
| `11f20ba` | 2026-07-11 | refactor(pixi): split stage model and runtime asset provider | Runtime wiring | Dispatch/provider boundaries moved without changing Nani command forms. Generated runtime assets remain app-owned, which supports indexing the app's configured output rather than provider registries. |
| `5115c43` | 2026-07-11 | refactor(vn): expose canonical runtime ports and checkpoints | Runtime boundary | No authoring syntax or compiler normalization change. No adapter action. |
| `0373d9f` | 2026-07-11 | feat(apps): unify Game A and Harness runtime wiring | Asset/script configuration | Consolidated app asset configs and script metadata. This establishes nearest `asset.config.mjs` plus its generated output as the correct project-resource discovery boundary. |
| `fd8e73c` | 2026-07-11 | chore(architecture): enforce converged boundaries and docs | Architecture | No command semantics change. Adapter must not import runtime presenter/provider implementations. |
| `5071ede` | 2026-07-11 | feat(vn): persist media across save lifecycle | Compiler/catalog/runtime media | BGM now always loops; catalog `loop` remains declared but compiler no longer consumes it. Default play volumes are BGM `0.7` and SFX `1`. BGM and looping SFX persist/restore; one-shot SFX, playback cursor, and fade progress do not. Adapter must hide declared-not-consumed media params while retaining diagnostics. |
| `ac0b364` | 2026-07-11 | merge: persist VN media lifecycle | Merge only | First-parent merge of `5071ede`; no additional language delta beyond that side commit. |
| `1451575` | 2026-07-11 | refactor pause navigation and fullscreen surface | Content/UI | Opening content and UI contracts changed, but no Nani grammar/compiler behavior changed. No adapter action. |
| `7e1382c` | 2026-07-11 | feat(game-a): add UI button audio feedback | Assets | Added generated SFX resources for DOM UI. They are discoverable as SFX assets but do not add Nani syntax. |
| `7a32946` | 2026-07-12 | feat(game-a): replace dialogue font with fusion pixel | Assets/config | Added font config and generated font assets. Fonts are not a supported Nani resource-completion slot in this iteration. |
| `bb2bf09` | 2026-07-12 | feat(game-a): apply fusion pixel font across ui | UI | No Nani/compiler impact. |
| `7f32521` | 2026-07-16 | feat(tools): standardize csp character unpack pipeline | Asset tooling | Standardized character source processing. No Nani grammar change; downstream `compositions.json` remains the token authority. |
| `67a1c5d` | 2026-07-16 | merge: add csp character unpack pipeline | Merge only | First-parent merge of `7f32521`; no additional language delta. |
| `1276d02` | 2026-07-17 | feat: rebuild Alice layered character workflow | Resource vocabulary | Rebuilt Alice and introduced the current composition vocabulary. Adapter must read tokens live rather than embed this project-specific list. |
| `c1ca257` | 2026-07-17 | feat(pixi): add source-pixel character outlines | Presentation | Rendering-only behavior; no command, parameter, or compiler change. |
| `08aecf6` | 2026-07-17 | feat: harden layered character transitions | Compiler default | Omitted `@char time` now normalizes to `durationMs:120`; explicit `0`, numeric values, and expressions still override. The default applies to `@char`, not `@slide`, `@arrange`, or `@hideChars`. Adapter audit and regression tests must preserve this distinction. |
| `932ff32` | 2026-07-17 | test: harden and accelerate browser smoke gates | Script organization/test content | Moved smoke scripts into test-only entries and generated separate test metadata. No new syntax. It exposed the existing `@flash time:0.05` misuse, which silently compiled to the 160ms default. |
| `06a95cc` | 2026-07-17 | feat(vn): decouple dialog background opacity | UI contract | Dialog presentation setting only. No Nani/compiler action. |

## Complete effective authoring delta

### Parser grammar

- No parser-level syntax, token, statement, inline-command, expression, label, or source-location shape was added or changed in the audited range.
- TextMate grammar therefore needs no new syntax rule for this alignment.

### Commands and parameters

- `@bgm [bgmPath] group:<id> volume:<decimal> time:<seconds>`:
  - With no path, updates the active BGM group's volume.
  - With the same active path/group, updates volume without restarting playback.
  - `time` is the volume-ramp duration for those update forms.
- `@sfx [sfxPath] group:<id> volume:<decimal> time:<seconds>`:
  - With no path, updates an active looped SFX group's volume.
  - Reissuing the same looped path/group updates volume without restart.
- `fade` controls playback fade-in/crossfade or stop fade; it is not the volume-adjustment duration.
- BGM playback is unconditionally looped. `@bgm loop:`/`loop!` remains official Naninovel catalog vocabulary but is `declared-not-consumed` by the V-Ronpa compiler.
- Media `wait!` is likewise declared but not consumed for `bgm`, `sfx`, `sfxFast`, `stopBgm`, and `stopSfx`; the runtime has no SFX-completion wait lifecycle.
- `@char` without `time` defaults to 120ms. Explicit `time:0`, numbers, and expressions take precedence.

### Defaults and persistence

- New BGM play default: volume `0.7`, looping always enabled.
- New SFX play default: volume `1`; only `loop:true` SFX participates in persistent media state.
- Save/restore contains active BGM groups and looped SFX groups with source/group/volume.
- One-shot SFX, playback cursor, in-progress fade, and ramp progress are not serialized.
- `@flash` continues to use `duration` in milliseconds with default `160`; `time` is not a declared flash parameter.

### Project resource vocabulary

Alice's current generated composition tokens are:

- Base: `Default`, `SourcePreview`.
- Eyes: `EYE0`–`EYE5`, `EYEOff`.
- Mouth: `MOUTH0`–`MOUTH6`.
- Left arm: `ArmL0`–`ArmL4`.
- Right arm: `ArmR0`–`ArmR2`.
- Effect: `EFFECT0`–`EFFECT2`, `EFFECTOff`.

These are asset-pack data, not language keywords. Other apps and character packs may expose different tokens.

## Alignment decisions

- Default completion exposes only `implemented` commands and parameters whose shared catalog metadata says `runtimeSupport: consumed`.
- Handwritten compatibility content remains parseable and retains shared hover/compiler diagnostics.
- Resource IDs come only from the nearest asset config's generated module; character tokens come only from `compositions.json`.
- Unknown project resources are not diagnosed because external paths and dynamic IDs are valid.
- The runtime compiler owns ignored promoted-primary diagnostics such as flash `time:`; the VS Code adapter only publishes the compiler's structured result.
- Existing content is corrected to remove `@sfx wait!` and use `@flash duration:50`.
