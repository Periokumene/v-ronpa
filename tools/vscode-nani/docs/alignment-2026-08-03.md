# VS Code Nani Alignment Audit — 2026-08-03

## Baseline

- Previous release: `vscode-nani-v0.6.1` (peeled commit `ee9e80b`).
- Audited feature tip: `4f8d43a` (`feat(nani): hard cut catalog discovery`).
- Feature-baseline range: 10 reachable commits, 192 changed files.
- Implemented release candidate: `77fde93` (`feat(vscode-nani): hard align
  0.7.0`). The audited range through that commit contains 11 reachable commits
  and 206 changed files.
- Release target: `v-ronpa-nani` 0.7.0 / `vscode-nani-v0.7.0`.

## Reachable Commit Accounting

| Commit | Project change | VS Code impact |
|---|---|---|
| `0c22cc0` | Devtools dock visual refinement | No language or resource contract change. |
| `df9f87f` | Game A Devtools viewport chrome | No language or resource contract change. |
| `a899cd5` | Formal title screen and new generated assets | Verify generated background/audio IDs flow through project completion without hardcoded paths. |
| `f4008cb` | Immediate hover audio attempt | No authoring-language change. |
| `63be6f1` | Cue StoryText and HideCue | Add explicit completion/Hover/diagnostic regressions; catalog remains the authority. |
| `90ecd93` | Fast current-script debugging | Audit diagnostic policy and project-analysis authority; no separate VS Code debug surface. |
| `871866a` | Merge of `90ecd93` with identical tree | Merge topology only; not a second implementation. |
| `c57bf81` | Inline staged StoryText | Add `[-]` / `[wait i]` completion, Hover, grammar, documentation, and exact-diagnostic coverage. |
| `952e50d` | Game A speaker-label mapping | Presentation mapping only; no `.nani` syntax change. |
| `4f8d43a` | Recursive catalog discovery, diagnostic policy, split generated output | Hard-cut extension config and shared analysis; release fixes stale 0.6.1 VSIX asset discovery. |
| `77fde93` | VS Code Nani 0.7.0 hard alignment | Converges strict config and catalog analysis, completes Cue/staged authoring, rejects legacy asset config, restores current-pack previews, and stabilizes Extension Host readiness. |
| release closeout (this document's commit) | Audit/task status only | Records gate evidence; no product, syntax, resource, build, or packaging change. |

## Effective Delta

- Commands: `@cue` and `@hideCue`; `@print` gains `textId` and `autoNext`.
- Inline syntax: `[-]` and `[wait i]` stage boundaries in ordinary StoryText
  and static `@print/@cue` text with the parser-defined restrictions.
- Compiler: required primary validation, cross-form StoryText ID validation,
  one-to-many staged lowering, and explicit strict/recoverable policy.
- Project discovery: recursive production/development/test scope roots,
  production+development union, isolated shared test catalog, multiple test
  entries, and structural watching.
- Assets: `runtimeAssetOutputPath` replaces `outputPath`; runtime assets and
  Nani generated modules are split.

## Pre-Release Re-Audit

Immediately before packaging, rerun the range audit from
`vscode-nani-v0.6.1` to the release candidate. Any additional commit must be
classified here and must receive editor regressions when it changes command
catalogs, parser syntax/IR, compiler policy, project discovery, generated asset
paths, or character-pack composition inputs.

## Release-Candidate Result

- Root cause of the reported preview regression: the installed 0.6.1 bundle
  read the removed `outputPath`, while the current Game A/Harness configs expose
  only `runtimeAssetOutputPath`. Version 0.7.0 rejects the old key and reads the
  current split generated modules.
- `@v-ronpa/nani-project` now owns the only strict `naniProject` parser and the
  discovery/parse/compile/disposition/fatal-filter/link/span pipeline. Generator,
  Vite, and VS Code use the hard-cut API; extension catalog code contains no
  compiler/linker or development-warning implementation.
- Fatal scripts retain exact Problems through a source-text publication table
  but are absent from the runnable navigation table.
- Command and parameter suggestions are catalog-derived and guarded by complete
  canonical/alias and consumed-parameter invariants.
- Character Hover, Preview Character at Cursor, candidate contribution images,
  removal-only fallback, and complete projections pass fixture and real
  Alice/Alice Kid pack tests.

## Gate Evidence

- Extension unit suite: 16 files / 112 tests passed.
- Focused parser/project/compiler suite: 7 files / 135 tests passed.
- Contract suite: 59 files / 560 tests passed.
- Repository suite: 99 files / 815 tests passed.
- Extension Host: three consecutive final-candidate runs, each 15/15 passed.
- Subsystem and baseline gates passed, including Game A/Harness production
  builds, diagnostics stress/benchmark guards, and 17/17 Playwright smoke tests.
- `validate:command-docs`, `validate:nani-diagnostics-cleanup`,
  `validate:contracts`, `validate:assets`, `validate:boundaries`, `validate:ccr`,
  task-boundary, and typecheck gates passed.
- `packages/contracts`, `.nani` IR, root `package.json`, and `pnpm-lock.yaml`
  were not changed by the release implementation.
