# Gameplay Domain P1

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `subsystem/gameplay-domain-p1`

## Worktree Path

- `.worktrees/gameplay-domain-p1`

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

Trial keyword outcomes:

- `correct`
- `miss`
- `not-owned`
- `not-available`
- `keyword-not-found`
- `invalid-segment`
- `timeout`

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
| Evidence submit rules | Unit tests cover accepted and rejected evidence |
| Package boundary | `pnpm validate:boundaries` passes |
| Worktree boundary | `validate:subsystem` passes with this task card |

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

```bash
pnpm typecheck
pnpm test
pnpm validate:boundaries
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/gameplay-domain-p1.md
```

## Review Packet

Include:

- Changed files summary.
- Public API summary for `packages/gameplay`.
- Test and gate output.
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
