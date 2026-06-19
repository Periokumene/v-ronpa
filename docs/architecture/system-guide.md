# V-Ronpa System Guide

## Intent

This project starts with a contract and harness baseline. The goal is not to
ship production gameplay in the first milestone; it is to make every future
worktree branch depend on stable public contracts, shared fixtures, and clear
verification gates.

## Layering

```text
AGENTS.md
  -> durable repo rules and commands

docs/architecture/*
  -> system design, package ownership, gates, worktree flow

docs/templates/*
  -> reusable templates, not assigned work

docs/tasks/*
  -> concrete active or pending worktree task cards only

docs/archive/completed-tasks/*
  -> completed task records kept out of the active task queue

packages/contracts
  -> public schemas and semantic contracts

adapters and apps
  -> rendering, persistence, media, and harness surfaces
```

## Runtime Boundaries

- `GameFlowMachine` owns top-level modes: `loading`, `navi`, `trial`, `paused`,
  and `saving`.
- `navi-director` owns Navi substates: `walk`, `interacting`, `vn2d-overlay`,
  `inventory`, and `event`.
- `trial-director` owns Trial segment flow, presentation profile selection,
  timeout handling, evidence submission outcomes, and segment transitions.
- `StoryEngine` owns script semantics, variables, backlog, choices, performs,
  serializable Story snapshots, and story-generated `StoryEffect` bridge
  events. Its `NaniCommandHandlerRegistry` binds command execution but does not
  define command metadata.
- `gameplay` owns domain reducers for exploration, inventory, evidence
  ownership, character state, and pure trial rule judgments.
- `media-save` owns Dexie IndexedDB save storage, Howler audio playback,
  HTMLVideo playback, and future WebAudio rhythm adapter notes.
- `presentation-contracts` owns renderer-independent visual commands and
  snapshots.
- `r3f-adapter` owns 3D scene presentation only.
- `pixi-presenter` owns 2D canvas/WebGL presentation only.
- `ui-kit` owns DOM overlays, text-heavy surfaces, controls, and Inspector Lite.

## Mode Model

The game has two primary playable modes:

- `navi`: first-person 3D exploration. Walk, interactables, inventory,
  character-state changes, event triggers, and foreground VN2D overlays are
  substates of Navi, not separate global modes.
- `trial`: 3D class-trial staging. Discussion, debate, evidence-submit, and
  future minigames are Trial segments. `vn2d`, `vn3d`, `debate3d`, and
  `minigame` are presentation profiles selected by the current Trial segment.

This prevents `VN2D` and `VN3D` from being treated as equivalent top-level game
modes. VN2D is an overlay-heavy presentation path; VN3D requires 3D camera
focus, staged character standees, Pixi/DOM overlays, and may participate in
Trial-specific input locks.

See also:

- `docs/architecture/input-and-camera.md`
- `docs/architecture/asset-pipeline.md`

## Script To Presentation

`.nani` scripts compile to IR. Runtime command handlers translate IR into
state patches, game events, and presentation commands. Presentation commands
are renderer-independent, so a command like `@shake actorId:hero` never knows
whether Pixi, DOM, or another future presenter executes the motion.

Command declarations live in the contracts `commandCatalog`. The catalog stores
Naninovel canonical names, lowercase runtime ids, categories, parameter specs,
children support, implementation status, and wildcard entries. StoryEngine
derives validation and handler registration checks from it.

Story scripts can emit typed gameplay events, for example
`@gameplay grant-evidence id:evidence:keycard`. These events can update
saveable gameplay state, but they do not submit evidence during Trial. Evidence
submission remains a Trial UI action routed through `trial-director`.

```text
.nani source
  -> nani-parser AST/IR
  -> contracts commandCatalog validation
  -> StoryEngine NaniCommandHandlerRegistry
  -> typed event reducer
  -> StoryEffect / presentation commands / gameplay events
  -> VnRuntimeDispatcher route table
  -> Pixi, R3F, DOM, gameplay, media, Navi, Trial consumers
```

See also:

- `docs/nani/command-catalog.md`
- `docs/architecture/vn-runtime-dispatcher.md`

## Evidence And Trial Rules

Evidence is not an inventory item. Gifts and tools live in `ItemDef` and
`InventoryState.items`; case evidence lives in `EvidenceDef` and
`EvidenceState.ownedEvidenceIds`.

`TrialDefinition` owns the rule graph: debate truth bullets, breakable
keywords, accepted evidence, timeout/miss/correct branches, evidence-submit
branches, and minigame transitions. `.nani` scripts provide the narrative and
visual timing for those segments, while TrialDirector applies graph transitions
after Gameplay returns pure rule judgments.

## First-Round Thin Slices

- Parse labels, comments, commands, text, inline commands, choices, and jumps.
- Validate fixtures with Zod.
- Run a headless story reducer snapshot.
- Resolve trial keyword outcomes with evidence without putting segment flow in
  gameplay helpers.
- Render harness scenes for Navi walk/VN2D/inventory and Trial VN3D/debate.
- Capture Playwright smoke screenshots for visual evidence.
- Validate Trial graph references before subsystem fanout.
- Validate save data through a versioned migrator boundary.

## Non-Goals

- No production character art pipeline yet.
- No real GLB environments yet.
- No Langium implementation yet.
- No full rhythm/WebAudio gameplay yet.
- No complete visual novel editor yet.
