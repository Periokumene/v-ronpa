# Contract Boundary Guide

## Public Contract Packages

- `packages/contracts`: source of truth for schemas, fixtures, save data, top
  modes, Navi runtime state, Trial runtime state, inventory, trial definitions,
  evidence definitions, input bindings, camera modes, runtime assets, Story
  snapshots, Story effects, typed gameplay events, `.nani` command catalog
  metadata, and presentation command wire shapes.
- `packages/presentation-contracts`: runtime ports for presenter adapters.
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
  proxy relationships through `RuntimeAsset` and `CollisionProxy`.
- `GameMode` is intentionally narrow: `navi` and `trial` are the playable root
  modes; VN2D/VN3D belong to Navi substates or Trial presentation profiles.
- Renderer-specific objects must not appear in contracts.
- Script source locations must be preserved through parse and compile outputs.
- `commandCatalog` is the only declaration source for `.nani` commands.
  Runtime handler registries bind execution only; they must not define command
  metadata independently.
- Official Naninovel commands are declared explicitly. Branch-local experiments
  should use `@wildcard-<type>` with `routeKey` until they are promoted to
  stable commands.
- `ItemDef` is limited to gifts and tools. Evidence is modeled separately as
  `EvidenceDef` and stored in `EvidenceState`.
- `EvidenceState.ownedEvidenceIds` is the save/runtime ownership list for
  evidence. Evidence must not be duplicated into `InventoryState.items`.
- `GameplayEvent` is the typed bridge for story-triggered gameplay changes.
  Story scripts may grant evidence, but evidence submission is a Trial UI action
  consumed by `trial-director`, not a `.nani` gameplay event.
- `TrialDefinition` is the rule source for debate truth bullets, breakable
  keywords, accepted evidence, and segment transitions. Presentation commands
  may visually mark keywords, but they must not define trial rules.

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
- StoryEffect bridge outputs
- Trial outcomes
- Trial graph validation diagnostics
- Navi and Trial director runtime state
- Presentation command logs

See also:

- `docs/nani/command-catalog.md`
- `docs/architecture/vn-runtime-dispatcher.md`

Snapshot changes are reviewed as public API changes.
