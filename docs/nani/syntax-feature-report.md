# Nani P1 Syntax Feature Report

## Source Scope

This report migrates the external Naninovel-style syntax notes into an internal
V-Ronpa reference. It is not a full Naninovel compatibility promise. It records
which syntax is in the P1 parser baseline and which source-material ideas are
outside the current contract.

P1 follows the current V-Ronpa contract and architecture:

- Parser output is generic `.nani` AST/IR.
- Parser diagnostics are message-based and do not add diagnostic codes.
- StoryEngine, Gameplay, TrialDirector, rendering, persistence, localization,
  and app harness behavior are outside this parser task.
- Unsupported command names from the external sample are not reserved as
  placeholders in examples or acceptance criteria.

## 1. P1 Included Syntax

### Statement Types

P1 covers line-oriented parsing for:

| Statement | Recognition | P1 output |
|---|---|---|
| Comment | line starts with `;` | `CommentIR` |
| Label | line starts with `#` | `LabelIR` and `scenario.labels` |
| Command | line starts with `@` | `CommandIR` |
| Text | no command/comment/label prefix | `TextIR` |

### Source Locations

Every parsed statement must preserve:

- `scriptPath`
- `line`
- `column`
- `raw`

Inline commands also preserve a source location and `inlineIndex`.

### Command Shape

P1 parser commands are generic IR, not command execution. The parser preserves:

- normalized `commandId`
- optional primary argument
- `params`
- `flags`
- optional `condition`
- optional `unless`
- source location

Supported value shapes are the existing `NaniValue` variants:

- string
- number
- boolean
- list
- expression
- raw local reference such as `#Label`

### Text Shape

P1 text supports:

- speaker ID, for example `Felix:`
- speaker appearance, for example `Felix.Neutral:`
- plain text tokens
- inline commands such as `[>]` and `[< speed:0.8]`
- print parameter extraction from inline `<` commands

P1 does not parse localization IDs or managed-text references.

### Local Flow Syntax

P1 fixtures use local labels and local jumps:

```nani
#Start
@choice "Inspect the case file" goto:#InspectFile
@goto #End
```

Parser diagnostics should cover:

- duplicate labels
- missing local label references in command primary values such as `@goto #Missing`
- missing local label references in `goto:#Missing` command params

Known local references must not produce diagnostics. Diagnostics must not stop
the parser from returning a partial scenario.

### P1 Fixture Command Set

The P1 examples use only commands that align with the current parser/contract
baseline and downstream StoryEngine expectations:

- `@set`
- `@back`
- `@charEnter`
- `@choice`
- `@goto`
- `@gameplay grant-evidence`
- `@shake`
- `@flash`
- `@focus`
- `@end`

The parser still preserves command IDs generically, but P1 fixtures and tests
should not introduce unsupported command placeholders.

## 2. P1 Known But Unused Syntax

These syntax concepts are recognized as relevant to visual-novel style scripts
but are intentionally unused in the P1 fixtures.

| Feature area | Reason not in P1 | Suggested phase | Owning subsystem |
|---|---|---|---|
| Text localization IDs and text references | Requires stable localization and voice/backlog identity design | P2 | StoryEngine + tooling |
| Indentation child blocks | Requires block tree construction, not just line-oriented IR | P2 | nani-parser + StoryEngine |
| Block control flow | Requires expression semantics and runtime execution model | P2 | StoryEngine |
| Subroutine flow | Requires call stack semantics | P2 | StoryEngine |
| Input/save/unlock/toast style app commands | Requires UI, save, achievement, or notification contracts | P3 | app/harness + media-save + ui-kit |
| Multi-speaker text | Requires dialogue presentation and backlog policy | P2 | StoryEngine + ui-kit |
| Async, await, and track control | Requires scheduler/runtime track model | P3 | StoryEngine |
| Managed text and automatic voice mapping | Requires content tooling and asset pipeline | P3 | tooling + media-save |
| Rich reveal events | Requires text reveal runtime and presentation ports | P3 | StoryEngine + presentation |
| Unity scene/timeline/effect command families | Not part of the browser-first V-Ronpa contract | P3 / Future ADR | out of scope unless a future ADR adds them |

No P1 acceptance test should depend on these features.

## 3. P2 Candidates

P2 candidates are features that could extend the parser after the P1 IR baseline
is stable:

- local label reference diagnostics for endpoint params beyond command primary
  `#Label` and `goto:#Label`
- explicit parse support for indentation blocks
- stable text identity syntax after localization requirements are approved
- richer inline token classification for wait markers and print parameter
  patches
- external script dependency modeling for cross-file jumps or calls

Any P2 change that alters `packages/nani-parser/src/types.ts` requires a CCR.

## 4. P3 / Future

P3 and later work belongs outside this parser baseline:

- full expression parsing or evaluation
- command schema validation
- runtime command execution
- StoryEngine scheduling and multi-track execution
- editor tooling for visual script authoring
- localization, voice, and managed-text build pipelines
- renderer-specific effects or Unity compatibility layers

These items should become separate task cards only after the relevant contracts
or ADRs exist.
