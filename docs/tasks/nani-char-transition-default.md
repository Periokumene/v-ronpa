# Nani Character Transition Default

## Base Branch

- `integration/v-ronpa-baseline`

## Status

- State: `Done`

## Dependency Changes

- None.

## Goal

Make high-frequency layered-character `@char` expression changes use one compiler-owned 120 ms default while retaining
explicit timing for initial entrance, special pacing, and instantaneous replacement.

## Context

This is a semantic follow-up on the current cumulative character-outline/preload/crossfade worktree. Broad inherited paths
remain listed so the baseline boundary gate can evaluate the complete worktree; this task owns only the compiler, compiler
test, Game A opening timing cleanup, regenerated metadata, and its Nani/architecture/CCR documentation.

## Allowed Paths

- `packages/nani-runtime-compiler/**`
- `packages/layered-character/**`
- `packages/pixi-presenter/**`
- `packages/app-vn-shell/**`
- `apps/game-a/src/**`
- `apps/game-harness/src/**`
- `scripts/generate-assets.mjs`
- `scripts/generate-assets.test.ts`
- `tools/csp-char-unpack/AUTHORING.md`
- `tools/csp-char-unpack/README.md`
- `tests/smoke/**`
- `docs/nani/**`
- `docs/architecture/**`
- `docs/ccr/**`
- `docs/tasks/pixi-layered-character-source-outline.md`
- `docs/tasks/pixi-character-outline-transition-transaction.md`
- `docs/tasks/pixi-character-outline-crossfade-opacity.md`
- `docs/tasks/pixi-character-crossfade-compositing.md`
- `docs/tasks/nani-char-transition-default.md`
- `progress.md`

## Forbidden Paths

- `packages/contracts/**`
- `package.json`
- `pnpm-lock.yaml`
- `apps/game-a/public/game-a/characters/**`
- `apps/game-harness/public/harness/characters/**`

## Required Behavior

- Missing `time` on compiled `@char` becomes exactly 120 ms.
- Explicit numeric, zero, and expression durations override the default.
- Shared timing helpers, `@slide`, direct RuntimeCommands, Pixi stage reduction, and presenter interfaces retain their
  existing semantics.
- Game A initial Alice appearance remains explicitly 300 ms; subsequent expression replacements use the default.
- `wait!`, skip, rapid replacement, prepared-resource synchronization, crossfade compositing, and outline behavior continue
  through their existing single implementations.

## Regression Cases

- Normal: an omitted `@char time` compiles to 120 ms and retains `wait!`.
- Boundary: `time:0`, explicit numeric timing, and runtime-expression timing remain authoritative.
- Isolation: an omitted `@slide time` does not receive the character default.
- Browser: Alice expression switches render with no asset diagnostics, white frame, opacity pulse, or alignment regression.

## Required Gates

```bash
node scripts/generate-assets.mjs --check
pnpm vitest run packages/nani-runtime-compiler/src/index.test.ts apps/game-a/src/gameAScripts.test.ts
pnpm typecheck
pnpm validate:assets
pnpm validate:contracts
pnpm validate:boundaries
pnpm validate:ccr
pnpm --filter @v-ronpa/game-a build
pnpm exec playwright test tests/smoke/game-a-alice.spec.ts --project=game-a --workers=1
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/nani-char-transition-default.md
```

## Done When

- Compiler and authored-content cleanup share one 120 ms source of truth, required gates pass, visual evidence is inspected,
  and package manifests, lockfiles, contracts, and character-pack payloads remain unchanged.
