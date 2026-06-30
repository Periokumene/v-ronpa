# First Subsystem Fan-Out

Use this after the contract and harness baseline is frozen.

| Worktree | Allowed paths | Primary gate |
|---|---|---|
| nani-parser | `packages/nani-parser/**`, parser fixtures | `.nani` AST/IR snapshots |
| story-engine | `packages/story-engine/**` | runtime state snapshots |
| story-play | `packages/story-play/**` | playback mode and schedule tests |
| app-vn-session | `packages/app-vn-session/**` | VN boot/advance/choice/input/runtime-wait/presentation-wait/restore tests |
| app-vn-dispatch | `packages/app-vn-dispatch/**` | route/transaction/media/UI/reveal/audio tests |
| app-vn-runtime | `packages/app-vn-runtime/**`, app VN wrapper when assigned | shared VN loop, media/voice/reveal/wait/restore tests |
| app-vn-shell | `packages/app-vn-shell/**` | shell rendering, hit plane, settings, and overlay action tests |
| gameplay | `packages/gameplay/**` | trial and inventory outcome tests |
| navi-director | `packages/navi-director/**` | Navi substate and interaction tests |
| trial-director | `packages/trial-director/**` | Trial segment/profile/outcome tests |
| pixi-presenter | `packages/pixi-presenter/**`, harness route when assigned | screenshot evidence |
| r3f-adapter | `packages/r3f-adapter/**`, harness route when assigned | 3D smoke evidence |
| ui-kit | `packages/ui-kit/**`, app CSS when assigned | DOM interaction smoke |
| game-a | `apps/game-a/**`, `tests/smoke/game-a-*.spec.ts` | VN app build and smoke |
| harness | `apps/game-harness/**`, `tests/smoke/**` | Playwright report |

Shared contracts require a CCR.

Each subsystem task must use a dedicated task card and run:

```bash
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/<name>.md
```

`validate:subsystem` enforces task allowed paths, CCR requirements, dependency
boundaries, typecheck, contract tests, unit tests, both app builds
(`@v-ronpa/game-a` and `@v-ronpa/game-harness`), and smoke tests.

Dependency changes are forbidden by default. If a subsystem truly needs
`package.json` or `pnpm-lock.yaml` edits, its task card must mark
`Dependency Changes` as `Allowed` and explain why before work begins.
