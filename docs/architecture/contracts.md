# Contract Boundary Guide

## Public Contract Packages

- `packages/contracts`: source of truth for schemas, fixtures, save data, top
  modes, Navi runtime state, Trial runtime state, inventory, trial definitions,
  input bindings, camera modes, runtime assets, Story snapshots, Story effects,
  and presentation command wire shapes.
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
  `InputLockState`, and `CameraControlMode`.
- Browser assets must declare runtime files, compression, LOD, and collision
  proxy relationships through `RuntimeAsset` and `CollisionProxy`.
- `GameMode` is intentionally narrow: `navi` and `trial` are the playable root
  modes; VN2D/VN3D belong to Navi substates or Trial presentation profiles.
- Renderer-specific objects must not appear in contracts.
- Script source locations must be preserved through parse and compile outputs.

## Snapshots

Hard gate snapshots cover:

- `.nani` AST/IR
- StoryEngine runtime state
- StoryEffect bridge outputs
- Trial outcomes
- Trial graph validation diagnostics
- Navi and Trial director runtime state
- Presentation command logs

Snapshot changes are reviewed as public API changes.
