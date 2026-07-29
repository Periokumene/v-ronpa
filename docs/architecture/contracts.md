# Public Contracts

`packages/contracts` and compiled `.nani` IR are public API. Contract changes
require a CCR and contract regression tests.

The parser's exact source-map sidecar is also public frontend API, but it is not
part of `ScenarioIR`, RuntimeCommand, RuntimeScript, or saves. Parser/compiler
API changes require a CCR and must preserve runtime contract snapshots. See
[Nani Source Diagnostics](nani-source-diagnostics.md).

Nani workbench anchors, decision traces, inspection results, and materializer
outcomes are debug-only types under `app-vn-runtime/debug`; they are not public
content contracts and are never serialized into SaveData. The workbench does
not add syntax, parser/IR shapes, RuntimeCommand variants, or save fields.

## ContentManifest v4 and SaveData v8

ContentManifest has one accepted version: `4`. A `VnEntryDef` identifies one VN
experience with `initialScriptPath` and optional `startLabel`; script source and
revision do not live on the entry. Runtime source is an ordered, path-unique
`VnRuntimeScriptCatalog` of `{ scriptPath, sourceText, scriptRevision }` records.

SaveData has one accepted version: `8`. It requires top-level `gameId`. A VN
section requires `entryId`, `script: { scriptPath, scriptRevision }`, a `SaveableStorySnapshot`,
terminal `PixiStageSnapshot`, terminal visibility for `dialog`, `commandBar`, and
`toastLayer`, plus canonical persistent-media intent. Media intent is keyed by BGM
group and looping-SFX tracking key and stores only `sourceRef`, target `volume`,
and the optional SFX `group`. Tracking keys, source refs, and explicit groups are
non-empty; volumes are finite numbers. Command reduction normalizes omitted play
volumes to BGM `0.7` and SFX `1` before checkpoint collection.

Story runtime/presentation waits, renderer tasks, hints, tweens, timers, media
handles, one-shot SFX, voice, bleep, movie state, media progress, playback cursors,
fade progress, input prompts, transition progress, and toast contents are not
saveable. `createVnSaveCheckpoint()` rejects unstable stops rather than deleting
transient state. Restore rejects mismatched game, entry, or revision before
stopping live media or mutating app state.

`PixiStageSnapshot.characterTone` is an optional SaveData-v8-compatible target
state for `@charTone`. It stores the code-owned preset ID, finite non-negative
artistic amount, owning `scopeScriptPath`, and terminal transition request.
Save validation requires the scope path to equal `vn.script.scriptPath`.
Renderer tween progress and fixed easing remain transient; older v8 saves
without the optional field restore with tone disabled.

The global inventory, evidence, and character sections remain shared across
VN/Navi/Trial. A VN-focused game may provide valid empty initial gameplay state.

There is no manifest v3 or SaveData v7 migration, legacy database fallback,
extension bag, or deprecated schema alias. `story` does not duplicate the saved
script path. Game A and Harness use fresh v10 database namespaces.

The change record and supersession scope are defined by
[Game A Multi-Nani Runtime Hard Cut](../ccr/game-a-multi-nani-runtime-hard-cut.md).

## Flow and overlays

Save operations are UI operation kinds, not root game modes. Backlog, save,
load, and settings are sibling `GamePauseSection` tabs owned by the paused flow
state; switching tabs replaces `pauseSection` and never creates history.
`GameOverlayKind` is reserved for independent title load/settings overlays.
Unused confirmation overlay kinds are not public contract.
