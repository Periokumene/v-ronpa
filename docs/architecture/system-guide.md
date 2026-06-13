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

docs/tasks/*
  -> strict worktree task cards

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
  keyword resolution, timeout handling, and evidence submission outcomes.
- `StoryEngine` owns script semantics, variables, backlog, choices, performs,
  serializable Story snapshots, and story-generated `StoryEffect` bridge
  events.
- `gameplay` owns domain reducers for exploration, inventory/evidence,
  character state, and trial outcomes.
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
are renderer-independent, so a command like `@shake target:hero` never knows
whether Pixi, DOM, or another future presenter executes the motion.

```text
.nani source
  -> nani-parser AST/IR
  -> StoryEngine command registry
  -> typed event reducer
  -> StoryEffect / presentation commands / gameplay events
  -> Pixi, R3F, DOM adapters
```

## First-Round Thin Slices

- Parse labels, comments, commands, text, inline commands, choices, and jumps.
- Validate fixtures with Zod.
- Run a headless story reducer snapshot.
- Resolve trial keyword outcomes with evidence.
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
