# Public Contracts

`packages/contracts` and compiled `.nani` IR are public API. Contract changes
require a CCR and contract regression tests.

The parser's exact source-map sidecar is also public frontend API, but it is not
part of `ScenarioIR`, RuntimeCommand, RuntimeScript, or saves. Parser/compiler
API changes require a CCR and must preserve runtime contract snapshots. See
[Nani Source Diagnostics](nani-source-diagnostics.md).

## SaveData v7

SaveData has one accepted version: `7`. It requires top-level `gameId`. A VN
section requires `entryId`, generated `scriptRevision`, a `SaveableStorySnapshot`,
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

The global inventory, evidence, and character sections remain shared across
VN/Navi/Trial. A VN-focused game may provide valid empty initial gameplay state.

There is no v6 migration, legacy database fallback, extension bag, or deprecated
schema alias. A v7 VN section without `media` is invalid.

The change record and supersession scope are defined by
[SaveData v7 VN Persistent Media](../ccr/save-data-v7-vn-persistent-media.md).

## Flow and overlays

Save operations are UI operation kinds, not root game modes. Backlog, save,
load, and settings are sibling `GamePauseSection` tabs owned by the paused flow
state; switching tabs replaces `pauseSection` and never creates history.
`GameOverlayKind` is reserved for independent title load/settings overlays.
Unused confirmation overlay kinds are not public contract.
