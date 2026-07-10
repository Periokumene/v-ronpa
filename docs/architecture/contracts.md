# Public Contracts

`packages/contracts` and compiled `.nani` IR are public API. Contract changes
require a CCR and contract regression tests.

## SaveData v6

SaveData has one accepted version: `6`. It requires top-level `gameId`. A VN
section requires `entryId`, generated `scriptRevision`, a `SaveableStorySnapshot`,
terminal `PixiStageSnapshot`, and terminal visibility for `dialog`, `commandBar`,
and `toastLayer`.

Story runtime/presentation waits, renderer tasks, hints, tweens, timers, media
handles, media progress, input prompts, transition progress, and toast contents
are not saveable. `createVnSaveCheckpoint()` rejects unstable stops rather than
deleting transient state. Restore rejects mismatched game, entry, or revision
before mutating app state.

The global inventory, evidence, and character sections remain shared across
VN/Navi/Trial. A VN-focused game may provide valid empty initial gameplay state.

There is no v5 migration, legacy database fallback, extension bag, or deprecated
schema alias.

## Flow and overlays

Save operations are UI operation kinds, not root game modes. `pause-menu` is
the pause root; backlog/save/load/settings are
nested shared sections. Unused confirmation overlay kinds are not public contract.
