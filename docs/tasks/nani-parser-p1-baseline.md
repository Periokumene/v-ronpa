# Nani Parser P1 Baseline

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/p1-nani-parser`

## Worktree Path

- `.worktrees/nani-parser-p1`

## Status

- State: `Ready` (`Draft | Ready | In Progress | Blocked | Review | Done | Archived`)
- Owner: `TBD`
- Created: `2026-06-14`
- Updated: `2026-06-14`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/nani-parser-p1-baseline.md`

## Goal

Establish the V-Ronpa P1 `.nani` parser baseline with real script fixtures, matching syntax documentation, parser diagnostics, and snapshot-style tests.

This task converts the external Naninovel-style sample materials into a V-Ronpa-specific baseline:

- two P1 `.nani` fixture scripts
- one Markdown example document
- one syntax feature report
- parser tests that prove the fixtures parse into stable IR
- missing local label reference diagnostics

## Context

Current parser state:

- `packages/nani-parser` is a public API package.
- It currently parses comments, labels, commands, text, speaker appearance, inline commands, generic params, flags, expressions, and duplicate labels.
- It does not execute scripts.
- It does not own StoryEngine command semantics.
- It does not own Trial keyword/evidence rules.

Relevant architecture decisions:

- `.nani` compiles to AST/IR; StoryEngine consumes IR and emits `StoryEffect`.
- `@gameplay grant-evidence id:evidence:keycard` is allowed as a script command, but parser treats it as a generic command.
- `@trialKeyword` is deferred from P1 because it needs StoryEngine / TrialDirector integration to validate meaningfully.
- Trial keyword/evidence rule binding belongs to `TrialDefinition`, not `.nani`.
- Evidence is granted through typed gameplay events downstream, not by parser logic.
- P1 does not include localization/text-id tooling.

Reference docs:

- `docs/architecture/contracts.md`
- `docs/architecture/system-guide.md`
- `docs/architecture/presentation-pipeline.md`
- `docs/architecture/worktree-flow.md`
- `docs/architecture/subsystem-fanout.md`
- `docs/templates/worktree-task-card.md`

Source materials used for authoring only:

- `/Users/periokumene/Downloads/基础nani脚本范例.md`
- `/Users/periokumene/Downloads/语法特性报告.md`

Do not treat the Downloads files as final project artifacts.

## Constraints

- Keep `nani-parser` pure and renderer-free.
- Do not import from `@v-ronpa/contracts`, StoryEngine, Gameplay, TrialDirector, React, DOM, Pixi, R3F, Dexie, Howler, or browser APIs.
- Do not execute expressions.
- Do not execute commands.
- Do not validate Trial rules.
- Do not add Langium or any parser dependency.
- Do not add StoryEngine tests in this task.
- Do not add app or harness changes.
- Do not implement indentation block execution.
- Do not implement localization/text-id parsing as P1 behavior.
- Do not include `@trialKeyword` in P1 fixtures.
- Any change to `packages/nani-parser/src/types.ts` must stop and become a CCR discussion.

## Allowed Paths

- `docs/nani/**`
- `packages/nani-parser/**`

## Forbidden Paths

- `packages/contracts/**`
- `packages/presentation-contracts/**`
- `packages/nani-parser/src/types.ts`
- `packages/story-engine/**`
- `packages/gameplay/**`
- `packages/navi-director/**`
- `packages/trial-director/**`
- `packages/game-flow-machine/**`
- `packages/pixi-presenter/**`
- `packages/r3f-adapter/**`
- `packages/ui-kit/**`
- `packages/media-save/**`
- `apps/game/**`
- `tests/smoke/**`
- `pnpm-lock.yaml`

## Contracts

Honor these current public parser contracts without modifying their type shape:

- `ParserPort`
- `ParseScenarioInput`
- `ParseScenarioResult`
- `ScenarioIR`
- `StatementIR`
- `CommandIR`
- `TextIR`
- `TextToken`
- `NaniValue`
- `Diagnostic`
- `SourceLocation`

Expected P1 parser behavior:

- Preserve source locations.
- Preserve command IDs and params as generic IR.
- Preserve inline command positions.
- Preserve labels in `scenario.labels`.
- Preserve local script dependencies and assets where current parser already supports them.
- Emit diagnostics for duplicate labels and missing local label references.
- Continue returning a partial scenario even when diagnostics are present.

## Dependency Changes

None. Do not edit `package.json` or `pnpm-lock.yaml`.

## Fixture Requirements

Create these `.nani` fixtures:

- `packages/nani-parser/fixtures/basic-navi.p1.nani`
- `packages/nani-parser/fixtures/basic-trial-discussion.p1.nani`

### `basic-navi.p1.nani`

Must use harness-aligned names and P1 syntax only.

Required content:

- `Felix`
- `Mira`
- `Narrator`
- `#Start`
- at least one local branch label
- at least one `@goto #Label`
- at least two consecutive `@choice ... goto:#Label` commands
- `@set` with simple assignment/default-style value
- `@back`
- `@charEnter`
- one or two small effects such as `@shake` or `@flash`
- `@gameplay grant-evidence id:evidence:keycard`
- speaker appearance such as `Felix.Neutral:`
- inline `[>]`
- inline `[< speed:0.8]`

Must not include:

- `@input`
- `@save`
- `@unlock`
- `@toast`
- `@trialKeyword`
- text IDs such as `|#D001|`
- localization references such as `|#&D022|`
- indentation-based child blocks
- block `@if/@else/@while`
- `@gosub/@return`
- multi-speaker text

### `basic-trial-discussion.p1.nani`

Must cover Trial discussion presentation anchors without Trial debate rules.

Required content:

- `Felix`
- `Mira`
- `Narrator`
- `#TrialOpening`
- at least one local branch label
- at least one `@goto #Label`
- `@cameraFocus`
- `@charEnter`
- `@focus`
- one small effect such as `@flash` or `@shake`
- ordinary dialogue lines with speaker appearance
- inline `[>]` or `[< speed:...]`

Must not include:

- `@trialKeyword`
- evidence/keyword binding
- evidence submission
- `@gameplay submit-evidence`
- Trial segment transition rules
- text IDs/localization
- indentation-based child blocks

## Documentation Requirements

Create these docs:

- `docs/nani/basic-p1-examples.md`
- `docs/nani/syntax-feature-report.md`

### `docs/nani/basic-p1-examples.md`

Must include:

- purpose of the P1 examples
- architecture boundary summary
- full code block for `basic-navi.p1.nani`
- full code block for `basic-trial-discussion.p1.nani`
- explanation that these scripts are parser fixtures first
- explanation that StoryEngine may later consume the same fixtures downstream
- explicit note that `@trialKeyword` is deferred

### `docs/nani/syntax-feature-report.md`

Must include four sections:

1. P1 Included Syntax
2. P1 Known But Unused Syntax
3. P2 Candidates
4. P3 / Future

The report must stay synchronized with the fixtures:

- Every syntax feature used by the fixtures must appear in P1 Included Syntax.
- Every removed feature from the original external sample must appear in P1 Known But Unused, P2, or P3.
- Do not delete or forget unused Naninovel-like features just because P1 removes them.

Required "known but unused" entries:

- `@input`
- `@save`
- `@unlock`
- `@toast`
- text IDs
- localization references
- indentation child blocks
- block `@if/@else/@while`
- `@gosub/@return`
- `@trialKeyword`
- multi-speaker text
- `@trialKeyword ... evidence:...`
- async / await / track control
- relative and wildcard endpoints
- managed text
- auto voice mapping
- rich reveal events
- Unity-specific scene/timeline/effect commands

Each unused feature must include:

- reason it is not in P1
- suggested phase: P2 or P3
- owning subsystem when known

## Parser Implementation Requirements

Update `packages/nani-parser` only as needed to support the fixtures and acceptance tests.

Required parser additions:

- Load and parse both fixture files in tests.
- Add local label reference diagnostics for known local endpoint patterns:
  - command primary `#Label`, such as `@goto #Known`
  - command param `goto:#Label`, such as `@choice "Text" goto:#Known`
- Missing label refs must produce diagnostics.
- Known local refs must not produce diagnostics.
- Duplicate label diagnostic must continue to work.

Do not add diagnostic `code` unless a CCR is created first.

Do not implement:

- block tree construction
- expression parsing/evaluation
- command schema validation
- localization parser
- endpoint resolver for external scripts
- Trial rule validation
- StoryEngine command execution

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Navi fixture exists | `packages/nani-parser/fixtures/basic-navi.p1.nani` is present and matches docs |
| Trial discussion fixture exists | `packages/nani-parser/fixtures/basic-trial-discussion.p1.nani` is present and matches docs |
| Markdown examples exist | `docs/nani/basic-p1-examples.md` includes both fixture contents |
| Syntax report exists | `docs/nani/syntax-feature-report.md` lists included and unused syntax |
| Fixture parse stability | Unit tests snapshot statement kinds, labels, selected commands, inline tokens |
| Local label validation | Unit tests pass for known labels and emit diagnostics for missing labels |
| Duplicate label validation | Existing duplicate label test still passes |
| Parser purity | `pnpm validate:boundaries` passes |
| Worktree boundary | `validate:subsystem` passes with this task card |
| No accidental StoryEngine work | Diff contains no `packages/story-engine/**` changes |
| No accidental contract change | Diff contains no `packages/nani-parser/src/types.ts` changes |

## CCR Triggers

Stop and add a CCR under `docs/ccr/` if the task requires:

- changing `packages/nani-parser/src/types.ts`
- adding diagnostic `code`
- changing `ScenarioIR`, `CommandIR`, `TextIR`, `TextToken`, or `NaniValue`
- changing `ParserPort`
- adding parser dependencies
- changing StoryEngine behavior
- changing TrialDefinition or GameplayEvent
- changing app/harness behavior
- editing files outside Allowed Paths

## Required Gates

```bash
pnpm typecheck
pnpm test
pnpm validate:boundaries
pnpm validate:contracts
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/nani-parser-p1-baseline.md
```

Package-specific checks:

```bash
pnpm vitest run packages/nani-parser
```

## Review Packet

Include:

- Changed files summary.
- Fixture summary for both `.nani` scripts.
- Syntax report summary, especially P1 excluded features.
- Parser behavior summary for local label diagnostics.
- Test and gate output.
- Confirmation that `packages/nani-parser/src/types.ts` was not changed.
- Confirmation that no StoryEngine, TrialDirector, Gameplay, app, or smoke files changed.
- Residual risks and recommended follow-up task cards.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting this task should remove only:

- `docs/nani/**`
- `packages/nani-parser/fixtures/**`
- parser implementation/test changes under `packages/nani-parser/**`

No save migration, contract migration, app cleanup, screenshot update, or harness rebuild should be required.

## Done When

- Two P1 `.nani` fixtures exist and parse successfully.
- Docs and fixtures are synchronized.
- Syntax report records both used and intentionally unused syntax.
- Missing local label references produce parser diagnostics.
- Existing parser capabilities continue to pass.
- No public IR type shape changes were made.
- Diff stays inside Allowed Paths.
- Required gates pass.
- Review packet includes verification and residual risks.

## Notes

This card intentionally treats the two `.nani` files as parser fixtures first. StoryEngine can later consume them in a separate task, but this worktree should not cross that boundary.
