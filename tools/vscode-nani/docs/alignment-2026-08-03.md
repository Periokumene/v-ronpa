# VS Code Nani Alignment Audit — 2026-08-03

## Baseline

- Previous release: `vscode-nani-v0.6.1` (peeled commit `ee9e80b`).
- Audited feature tip: `4f8d43a` (`feat(nani): hard cut catalog discovery`).
- Range: 10 reachable commits, 192 changed files.
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
