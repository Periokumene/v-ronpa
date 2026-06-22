# Contract Change Request

## Status

- ID: `CCR-0002`
- State: `Accepted`
- Owner: `integration`
- Created: `2026-06-22`
- Updated: `2026-06-22`
- Originating Worktree: `public-core`
- Base Branch: `integration/v-ronpa-baseline`
- Archive Status: `Active`
- Archive Target: `docs/archive/ccr/CCR-0002-trial-entry-interactable.md`

## Summary

Add a director-owned Trial entry action to `InteractableDef.action` so Navi
exploration can enter an existing `TrialDefinition` without adding a separate
harness scenario or overloading VN script startup.

## Requested Change

Add an additive interactable action variant:

```ts
{ type: "start-trial"; trialId: string; segmentId?: string }
```

`trialId` references a `TrialDefinition`. `segmentId` optionally lets a harness
or authored map enter a specific Trial segment, such as a debate, while still
using `trial-director` to derive presentation profile and input lock.

## Affected Packages

- `packages/contracts`
- `packages/gameplay`
- `packages/navi-director`
- `apps/game`

## Why Existing Contract Is Insufficient

`start-script` enters a VN script overlay and `change-map` enters another Navi
map. Neither shape can express a mode transition into `GameMode` `trial`
without hiding Trial state inside script labels or app-local fixture strings.

Trial already has public `TrialDefinition`, `TrialRuntimeState`, and
`SaveData.trial` contracts. The missing public edge was the exploration action
that hands a confirmed Navi interactable to the app-level Trial runtime.

## Proposed Shape

- `InteractableDef.action` accepts `start-trial`.
- `gameplay.resolveInteractable` returns a `start-trial` exploration outcome.
- `gameplay.applyExplorationOutcome` treats `start-trial` as
  `owner: "director"` and leaves gameplay state unchanged.
- `navi-director` keeps Navi authoritative for focus/confirm and returns the
  director-owned outcome to the app.
- The app runtime adapter creates `TrialRuntimeState`, enters `GameMode`
  `trial`, and renders the existing Trial stage inside the accepted
  vertical-slice harness.

This change is additive. Existing maps, saves, scripts, and interaction actions
remain valid. No save migration is required.

## Fixtures And Tests

- Contract tests parse `start-trial` interactables inside `ContentManifest`.
- Gameplay tests cover `start-trial` resolve/apply behavior as director-owned.
- Navi director tests prove confirmation returns `start-trial` without mutating
  gameplay or entering VN overlay state.
- App runtime tests cover Trial interaction context and optional Trial save
  collection.
- The vertical-slice smoke test enters Trial from the existing scenario,
  resolves a keyword, and returns to Navi before continuing the VN route.

## Rebase Impact

Branches that construct `InteractableDef.action` unions or exhaustive
`ExplorationOutcome` switches must sync with the new `start-trial` variant.
