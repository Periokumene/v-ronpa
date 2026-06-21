# Contract Change Request

## Requested Change

Add a first-class `.nani` command catalog to `packages/contracts`, add a
wildcard RuntimeCommand route, and clarify that StoryEngine command handlers are
execution bindings rather than command declarations.

## Affected Packages

- `packages/contracts`
- `packages/nani-parser`
- `packages/story-engine`
- `apps/game`

## Why Existing Contract Is Insufficient

The VN presentation and UI workstreams both need to add commands and runtime
outputs. Without a shared catalog, command definitions could drift across parser
tests, StoryEngine handler registration, app routing, and docs. The previous
runtime bridge also had no generic route for future branch-local commands,
forcing new features to touch package-specific adapter contracts too early.

## Proposed Shape

- `commandCatalog` is the only declaration source for `.nani` commands.
- Naninovel official commands are explicit catalog entries with canonical name,
  lowercase runtime id, category, parameter specs, children support, status, and
  source.
- Compatibility params may be attached to official command entries, but each
  one is marked with `source: "v-ronpa"` so it is not confused with official
  Naninovel syntax.
- `NaniCommandHandlerRegistry` registers execution handlers only and rejects
  handlers not declared in the catalog.
- `@wildcard-<type>` commands compile to RuntimeCommands with `wildcardType`,
  `routeKey`, generic params, and source command metadata.
- RuntimeCommand is the dispatch stream. StoryEngine owns story state and emits
  incremental RuntimeCommands; package-specific Pixi/UI/gameplay adapters own
  their projections.

## Fixtures And Tests

- `packages/contracts/src/index.test.ts` covers the 77 official commands,
  9 wildcard commands, command id normalization, parameter type names, and
  RuntimeCommand schema.
- `packages/nani-parser/src/index.test.ts` covers official parameter retention
  without semantic validation.
- `packages/story-engine/src/index.test.ts` covers catalog-derived validation,
  stub/no-op commands, unsupported implemented params, wildcard RuntimeCommands,
  and handler registry drift rejection. It also verifies reducer diagnostics and
  historical command migration for `back`, `shake`, and `goto`.
- `apps/game/src/vnOutputRoutes.test.ts` covers fixed route table behavior,
  one-to-many RuntimeCommand targets, and wildcard routeKey overrides.
- `tests/smoke/vertical-slice.spec.ts` keeps VN dialog and Pixi visibility
  covered through the app harness.

## Rebase Impact

Branches adding VN commands must rebase on this catalog and either add explicit
official-compatible command declarations or use `@wildcard-<type>` for
branch-local experiments. Branches touching VN app routing should use
`VnRuntimeDispatcher` and `VnOutputRouteTable` instead of routing StoryEngine
outputs inside scenario code.
