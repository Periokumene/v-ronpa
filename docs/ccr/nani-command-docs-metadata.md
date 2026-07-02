# Nani Command Docs Metadata

## Requested Change

Add optional structured `docs` metadata to `.nani` command definitions and command parameter specs. The metadata carries Chinese authoring help, examples, documented defaults, recommended ranges, allowed values, and current runtime support notes for editor tooling.

## Affected Packages

- `packages/contracts`
- `tools/vscode-nani`

## Why Existing Contract Is Insufficient

`NaniCommandDefinition` and `NaniCommandParamSpec` only expose command names, categories, statuses, execution boundaries, and loose parameter type names. VS Code completion can list commands and params, but cannot explain parameter intent, defaults, recommended authoring ranges, or whether a declared parameter is currently consumed by the runtime compiler.

## Proposed Shape

Add optional fields:

```ts
interface NaniCommandDefinition {
  docs?: {
    zh: string;
    examples?: string[];
    runtimeNoteZh?: string;
  };
}

interface NaniCommandParamSpec {
  docs?: {
    zh: string;
    defaultValue?: string | number | boolean;
    recommendedRange?: { min?: number; max?: number; unit?: string; noteZh?: string };
    allowedValues?: string[];
    examples?: string[];
    runtimeSupport?: "consumed" | "declared-not-consumed";
    runtimeNoteZh?: string;
  };
}
```

The metadata is documentation-only. Recommended ranges do not change parser, compiler, or runtime validation.

## Fixtures And Tests

- Contract schema tests validate the new optional docs fields.
- Contract tests assert every implemented command and implemented command parameter has Chinese docs.
- VS Code language fact and hover tests assert completion and hover display the docs, default/range hints, and runtime support notes.

## Rebase Impact

Worktrees that add or change `.nani` command catalog entries should either provide docs metadata for implemented commands or intentionally defer docs coverage with a follow-up task.
