# Contract Boundary Guide

## Public Contract Packages

- `packages/contracts`: source of truth for schemas, fixtures, save data, top
  modes, interaction shell context, overlay/action/capability snapshots, UI
  asset refs, style profile refs, Navi runtime state, Trial runtime state,
  inventory, trial definitions, evidence definitions, input bindings, camera
  modes, runtime assets, Story snapshots, RuntimeCommand bridge schemas, typed
  gameplay events, and `.nani` command catalog metadata.
- `packages/nani-parser`: `.nani` AST and IR shape.

Changes to these packages are cross-module changes. A module worktree must not
edit them opportunistically. Add a Contract Change Request under `docs/ccr/`
and merge the change through the integration baseline first.

## Compatibility Rules

- Contracts should be additive when possible.
- Rename and deletion require snapshot updates and migration notes.
- Save data must include `version`.
- Save data must store `StoryRuntimeSnapshot`, not arbitrary engine objects.
- Input and camera coordination must flow through `InputBindingMap`,
  `InputActionState`, `InputLockState`, and `CameraControlMode`.
- Browser assets must declare runtime files, compression, LOD, and collision
  proxy relationships through `ContentManifest.runtimeAssets`,
  `RuntimeAsset`, and `CollisionProxy`.
- Runtime asset references must be id-only. `AssetRef`,
  `WorldMapDef.assetRefs`, `RuntimeScript.assets`, `UiAssetRef`, evidence
  visuals, and mesh-backed collision proxies must not carry direct URLs.
- Apps create `AssetRegistry` instances from parsed content manifests and
  inject structural resolvers into renderer/media adapters. Pixi, R3F, Howler,
  and DOM UI code must not assemble public asset paths.
- `GameMode` is intentionally narrow: `navi` and `trial` are the playable root
  modes; VN2D/VN3D belong to Navi substates or Trial presentation profiles.
  `title`, `paused`, and `saving` are shell flow states and must not absorb
  Navi/Trial runtime ownership.
- Interaction shell controls should use `GameOverlayKind`, `GameUiAction`,
  `GameInteractionContext`, and `InteractionCapabilitySnapshot`. App adapters
  and UI surfaces must not redefine these shapes locally.
- Save/load lists should use `SaveSlotSummary`. `media-save` derives slot
  summaries from save data, while app adapters collect the current runtime
  snapshot. `SaveData` itself should remain the restore payload, not the list
  preview authority.
- Settings should use the public `SettingsSnapshot` contract. The snapshot is a
  versioned user-preference shape grouped by system, display, sound, and
  automation. It is persisted by app adapters outside `SaveData`; `media-save`
  must not store or merge settings as part of save slots.
- Presenter runtime traces are adapter internals. They must not be used as
  SaveData shapes or as public stage snapshots.
- UI asset refs and interaction style profiles are manifest/config references.
  They must not contain renderer objects, React components, Pixi instances, or
  Three.js objects.
- Renderer-specific objects must not appear in contracts.
- Script source locations must be preserved through parse and compile outputs.
- `.nani` `CommandIR.args` must preserve ordered command tokens with raw
  value/param/flag information. Legacy `primary`, `params`, and `flags` may
  exist for migration, but compiler logic should derive command shape from
  ordered args plus `commandCatalog`.
- RuntimeCommand params must use canonical runtime field names only. Raw parser
  aliases and source params belong in `sourceCommand`.
- RuntimeCommand may carry unresolved expression values and `condition/unless`
  expressions. The compiler preserves them; StoryEngine evaluates them against
  story variables before app adapter fanout.
- `commandCatalog` is the only declaration source for `.nani` commands.
  Runtime handler registries bind execution only; they must not define command
  metadata independently.
- `commandCatalog.execution` is the public boundary for whether a command is
  StoryEngine control flow, Pixi presentation, gameplay, or declared-only
  compatibility.
- `NaniCommandStatus` is the command maturity signal. `implemented` means
  V-Ronpa has tested runtime behavior for the command; it is not a promise that
  every official Naninovel parameter is fully compatible.
- Explicit Pixi `wait!` stores a `StoryPresentationWait` with `expectedTasks`
  supplied by app/Pixi transaction code. Active Pixi tasks and tween progress
  are not save data.
- Official Naninovel commands and V-Ronpa project commands are declared
  explicitly. Branch-local experiments must add catalog entries before they can
  compile to `RuntimeCommand`.
- `ItemDef` is limited to gifts and tools. Evidence is modeled separately as
  `EvidenceDef` and stored in `EvidenceState`.
- `EvidenceState.ownedEvidenceIds` is the save/runtime ownership list for
  evidence. Evidence must not be duplicated into `InventoryState.items`.
- `GameplayEvent` is the typed bridge for story-triggered gameplay changes.
  Story scripts may grant evidence, but evidence submission is a Trial UI action
  consumed by `trial-director`, not a `.nani` gameplay event.
- `TrialDefinition` is the rule source for debate truth bullets, breakable
  keywords, accepted evidence, and segment transitions. Routed `RuntimeCommand`
  visual cues may mark keywords, but they must not define trial rules.
- `InteractableDef.action` may use `start-trial` to enter an existing
  `TrialDefinition` from Navi exploration. The action is director-owned: it
  does not mutate gameplay state, and app runtime code creates or restores the
  `TrialRuntimeState`.

## Evidence / Trial Rule Ownership

- Content manifests declare evidence objects through `EvidenceDef`, including
  display fields and stable visual asset references.
- `.nani` scripts declare narrative timing and presentation anchors such as
  `@trialKeyword`; they can emit typed gameplay events such as
  `@gameplay grant-evidence id:evidence:keycard`.
- `Gameplay` consumes evidence ownership and returns pure rule judgments such
  as correct, miss, timeout, or accepted evidence.
- `TrialDirector` consumes the `TrialDefinition` graph and gameplay rule
  judgments to move between discussion, debate, evidence-submit, minigame, and
  failure segments.

## Snapshots

Hard gate snapshots cover:

- `.nani` AST/IR
- StoryEngine runtime state
- RuntimeCommand bridge outputs
- Trial outcomes
- Trial graph validation diagnostics
- Navi and Trial director runtime state
- Pixi presentation snapshots and render hints

See also:

- `docs/nani/command-catalog.md`
- `docs/architecture/vn-runtime-dispatcher.md`

Snapshot changes are reviewed as public API changes.
