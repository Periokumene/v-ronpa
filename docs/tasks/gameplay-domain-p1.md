# Gameplay Domain P1

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/domain-p1-gameplay`

## Worktree Path

- Manual Git worktree suggestion: `.worktrees/gameplay-domain-p1`
- Codex App may assign a managed path under `$CODEX_HOME/worktrees`; use the assigned path if launched from Codex App.

## Status

- State: `Ready` (`Draft | Ready | In Progress | Blocked | Review | Done | Archived`)
- Owner: `TBD`
- Created: `2026-06-14`
- Updated: `2026-06-14`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/gameplay-domain-p1.md`

## Goal

Turn `packages/gameplay` into a stable pure domain package for gameplay-owned state updates and trial rule judgments.

This task merges the earlier gameplay P1/P2 planning: complete the core gameplay helpers and split the current single-file implementation into maintainable internal modules without changing shared contracts.

Concretely, this worktree should produce a package that downstream directors can call without knowing about UI, renderer, story execution, or Trial segment routing. The package should own only:

- inventory item quantity changes for gifts/tools
- evidence ownership and submission bookkeeping
- character affinity/status/skill state updates
- pure exploration outcome application for gameplay-owned outcomes
- pure Trial rule judgments for keyword, timeout, and evidence-submit decisions
- selectors that make current gameplay state easy for directors, tests, and harness code to inspect

## Context

Relevant baseline decisions:

- `GameFlowMachine` owns top-level `navi` / `trial` mode switching.
- `navi-director` owns Navi substates and routing such as `walk`, `vn2d-overlay`, `inventory`, and `event`.
- `trial-director` owns Trial segment transitions and presentation profile routing.
- `story-engine` owns `.nani` script execution and emits typed `StoryEffect` records.
- `gameplay` owns inventory, evidence ownership, character state, exploration state changes, and pure trial rule judgments.
- Evidence is not an inventory item. Evidence lives in `EvidenceState.ownedEvidenceIds`; gifts/tools live in `InventoryState.items`.
- Trial rule helpers must not return `nextSegmentId`; segment graph routing remains in `trial-director`.

Reference docs:

- `docs/architecture/system-guide.md`
- `docs/architecture/contracts.md`
- `docs/architecture/presentation-pipeline.md`
- `docs/architecture/subsystem-fanout.md`

## Constraints

- Keep `gameplay` independent from React, DOM, Pixi, R3F, Dexie, Howler, and browser APIs.
- Do not modify shared contract packages.
- Do not modify director packages in this task.
- Do not add app or harness preview surfaces in this task.
- Do not validate item category against manifest data in this task.
- Do not expand evidence submission history beyond current `submittedEvidenceIds`.
- Character status remains a simple string collection.
- Selector helpers are gameplay package API, not shared contract.
- `grant-item` must only mutate `InventoryState.items`; do not infer evidence ownership from item id prefixes.
- Evidence ownership changes only through `grant-evidence` / `remove-evidence`.

## Allowed Paths

- `packages/gameplay/**`

## Forbidden Paths

- `packages/contracts/**`
- `packages/presentation-contracts/**`
- `packages/nani-parser/**`
- `packages/story-engine/**`
- `packages/navi-director/**`
- `packages/trial-director/**`
- `apps/game/**`
- `tests/smoke/**`

## Contracts

Honor these existing contracts without modifying them:

- `InventoryState`
- `EvidenceState`
- `CharacterState`
- `InteractableDef`
- `TrialDefinition`
- `TrialSegment`
- `GameplayEvent`

If any implementation requires contract changes, stop and create a CCR instead of editing contract files.

## Dependency Changes

None. Do not edit `package.json` or `pnpm-lock.yaml`.

## Ownership And Routing

`gameplay` applies only gameplay-owned state changes and returns structured results for observability.

Routing ownership:

| Intent / Outcome | Primary Owner |
|---|---|
| `grant-item` | `gameplay` |
| `grant-evidence` | `gameplay` |
| `character-state` | `gameplay` |
| `start-script` | `navi-director` + `story-engine` |
| `open-inventory` | `navi-director` + `ui-kit` |
| `break keyword` | `gameplay` judges, `trial-director` routes |
| `submit evidence` | `gameplay` judges, `trial-director` routes |
| `timeout` | `gameplay` judges, `trial-director` routes |
| Trial segment transition | `trial-director` |
| Top-level mode transition | `game-flow-machine` |

`applyExplorationOutcome(state, outcome)` must apply gameplay-owned outcomes and return unchanged state for director-owned outcomes such as `start-script`.

## Implementation Requirements

Split `packages/gameplay/src` into internal modules:

- `state.ts`
- `inventory.ts`
- `evidence.ts`
- `characters.ts`
- `exploration.ts`
- `trial-rules.ts`
- `events.ts`
- `selectors.ts`
- `index.ts`

Keep `index.ts` as the public re-export surface.

Required behavior:

- Inventory supports grant, remove, consume, clamps at zero, and removes zero-quantity entries.
- Evidence supports grant, remove, ownership check, owned list selector, and submission recording using current `EvidenceState`.
- Characters support affinity clamp 0-100, add/remove status, unlock skill, and default state lookup.
- `applyGameplayEvent(state, event)` returns `{ state, result }`.
- `applyExplorationOutcome(state, outcome)` returns `{ state, result }`.
- `resolveDebateKeyword(trial, segmentId, evidenceState, keywordId, evidenceId)` checks segment validity, keyword existence, evidence ownership, segment availability, and correctness.
- `submitEvidence(segment, evidenceId)` returns accepted/rejected only.
- Trial rule outcomes must not include `nextSegmentId`.

Debate keyword outcomes:

- `correct`
- `miss`
- `not-owned`
- `not-available`
- `keyword-not-found`
- `invalid-segment`

Timeout outcome:

- `timeout`

`resolveDebateKeyword` covers keyword/evidence judgments. `resolveTrialTimeout` covers timeout judgments. Segment routing fields such as `onCorrect`, `onMiss`, `onTimeout`, `onAccepted`, and `onRejected` remain `trial-director` concerns.

Selector helpers:

- `hasItem`
- `getItemQuantity`
- `hasEvidence`
- `listOwnedEvidenceIds`
- `getCharacterState`

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Inventory reducer behavior | Unit tests show grant/remove/consume, zero cleanup, no negative quantities |
| Evidence reducer behavior | Unit tests show grant/remove/has/list/record submission |
| Character reducer behavior | Unit tests show affinity clamp, status add/remove, skill unlock |
| Gameplay event application | Unit tests show `{ state, result }` for applied and failed/no-op events |
| Exploration outcome application | Unit tests show gameplay-owned outcomes mutate state and `start-script` returns director-owned result |
| Trial keyword rules | Unit tests cover `correct`, `miss`, `not-owned`, `not-available`, `keyword-not-found`, `invalid-segment` |
| Trial timeout rules | Unit tests cover timeout as a separate debate rule judgment |
| Evidence submit rules | Unit tests cover accepted and rejected evidence |
| Package boundary | `pnpm validate:boundaries` passes |
| Worktree boundary | `validate:subsystem` passes with this task card |

## Regression Requirements

This task must add or update tests for every public gameplay behavior it changes.

Keep regression tests inside `packages/gameplay/**`. Do not widen scope into contracts, directors, app harness, or smoke tests to make these cases pass.

Recommended test files:

- `packages/gameplay/src/inventory.test.ts`
- `packages/gameplay/src/evidence.test.ts`
- `packages/gameplay/src/characters.test.ts`
- `packages/gameplay/src/events.test.ts`
- `packages/gameplay/src/exploration.test.ts`
- `packages/gameplay/src/trial-rules.test.ts`
- `packages/gameplay/src/selectors.test.ts`

Required regression cases:

- Inventory:
  - grant item increments quantity
  - remove item decrements quantity
  - consume item returns an observable success/failure result
  - remove/consume clamps at zero and removes zero-quantity entries
  - `grant-item` never mutates `EvidenceState`
- Evidence:
  - grant evidence adds ownership once
  - remove evidence removes ownership
  - ownership check distinguishes owned and missing evidence
  - owned evidence selector returns stable ids
  - submission recording uses current `submittedEvidenceIds`
- Characters:
  - affinity changes clamp to 0-100
  - status add/remove is stable and idempotent where appropriate
  - skill unlock avoids duplicate ids
  - missing character lookup returns a default state without mutating input state
- Gameplay events:
  - `applyGameplayEvent` handles every current `GameplayEvent` variant
  - applied events return `{ state, result }`
  - failed, invalid, or no-op cases return observable results without hidden mutation
- Exploration outcomes:
  - gameplay-owned outcomes mutate only gameplay state
  - `start-script` returns a director-owned result and leaves gameplay state unchanged
  - `none` leaves gameplay state unchanged
- Trial keyword rules:
  - correct evidence returns `correct`
  - wrong evidence returns `miss`
  - missing evidence ownership returns `not-owned`
  - evidence not available in the segment returns `not-available`
  - unknown keyword returns `keyword-not-found`
  - non-debate or missing segment returns `invalid-segment`
  - rule outcomes do not include `nextSegmentId`
- Trial timeout and evidence submit:
  - timeout is covered separately from keyword judgment
  - evidence-submit accepts configured evidence
  - evidence-submit rejects unconfigured evidence
  - evidence-submit outcome does not include segment routing
- Selectors:
  - `hasItem`
  - `getItemQuantity`
  - `hasEvidence`
  - `listOwnedEvidenceIds`
  - `getCharacterState`

If an implementation cannot cover a required case inside `packages/gameplay/**`, stop and document the gap in the review packet instead of modifying forbidden paths.

## Programmatic Acceptance

The implementation is programmatically acceptable when these checks pass from the worktree:

```bash
pnpm vitest run packages/gameplay
pnpm typecheck
pnpm validate:boundaries
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/gameplay-domain-p1.md
```

Expected evidence:

- `packages/gameplay` tests cover every row in the acceptance matrix above.
- `pnpm typecheck` confirms all public exports remain type-safe for downstream packages.
- `pnpm validate:boundaries` confirms no renderer, browser, persistence, or app dependencies entered gameplay.
- `validate:subsystem` confirms changed files stay inside this task card, CCR rules hold, contracts still validate, the app still builds, and smoke tests still pass after the package changes.

## Manual Acceptance

The reviewer should inspect the final diff and review packet for:

- `index.ts` exposes a clear public gameplay API and does not leak internal module layout unnecessarily.
- Internal files are cohesive: inventory logic in inventory module, evidence logic in evidence module, character logic in characters module, trial judgments in trial-rules module, and selectors in selectors module.
- No gameplay helper performs Trial segment routing or returns `nextSegmentId`.
- No helper imports or references React, DOM, Pixi, R3F, Dexie, Howler, browser globals, app harness code, or story-engine internals.
- Evidence remains separate from inventory in behavior, tests, naming, and review summary.
- Unit tests are readable enough to act as contract examples for future `navi-director`, `trial-director`, and harness worktrees.
- Residual risks explicitly call out any follow-up needed in `navi-director`, `trial-director`, `story-engine`, or harness integration.

## CCR Triggers

Stop and add a CCR under `docs/ccr/` if the task requires:

- changes to `packages/contracts`
- changes to `GameplayEvent`
- changes to `TrialDefinition`
- changes to save data or manifest shape
- richer evidence submission history
- changes to `.nani` IR
- changes outside `packages/gameplay/**`
- new dependencies

## Required Gates

Local iteration gates:

```bash
pnpm vitest run packages/gameplay
pnpm typecheck
pnpm validate:boundaries
```

Merge gate:

```bash
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/gameplay-domain-p1.md
```

## Review Packet

Include:

- Changed files summary.
- Public API summary for `packages/gameplay`.
- Test and gate output.
- Regression coverage summary mapping tests to the required regression cases.
- Confirmation that no shared contracts changed.
- Confirmation that no app/harness preview was added.
- Residual risks or follow-up recommendations for `navi-director`, `trial-director`, or harness integration.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting this task should only affect `packages/gameplay/**`.

No save migration, fixture migration, app cleanup, or harness screenshot update should be required because this task does not change shared contracts or app surfaces.

## Done When

- `packages/gameplay` is internally split into focused modules.
- All required gameplay helpers are implemented and exported through `index.ts`.
- Trial rule helpers check evidence ownership via `EvidenceState`.
- Director-owned exploration outcomes are observable and do not mutate gameplay state.
- Unit tests cover the acceptance matrix.
- Diff stays inside allowed paths.
- Required gates pass.
- Review packet includes residual risks and confirms no CCR was needed.
