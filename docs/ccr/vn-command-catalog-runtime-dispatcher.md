# Contract Change Request

## Requested Change

Add a first-class `.nani` command catalog to `packages/contracts`, add a
`wildcard-event` StoryEffect shape, and clarify that StoryEngine command
handlers are execution bindings rather than command declarations.

## Affected Packages

- `packages/contracts`
- `packages/nani-parser`
- `packages/story-engine`
- `apps/game`

## Why Existing Contract Is Insufficient

The VN presentation and UI workstreams both need to add commands and runtime
outputs. Without a shared catalog, command definitions could drift across parser
tests, StoryEngine handler registration, app routing, and docs. The previous
StoryEffect bridge also had no generic route for future branch-local commands,
forcing new features to touch public presentation commands too early.

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
- `@wildcard-<type>` commands emit `wildcard-event` StoryEffects with
  `wildcardType`, `routeKey`, generic params, and source command metadata.
- `presentationCommands` remains the presentation command log. `effects` is the
  incremental side-effect stream.

## Fixtures And Tests

- `packages/contracts/src/index.test.ts` covers the 77 official commands,
  9 wildcard commands, command id normalization, parameter type names, and
  `wildcard-event` schema.
- `packages/nani-parser/src/index.test.ts` covers official parameter retention
  without semantic validation.
- `packages/story-engine/src/index.test.ts` covers catalog-derived validation,
  stub/no-op commands, unsupported implemented params, wildcard effects, and
  handler registry drift rejection. It also verifies reducer diagnostics and
  historical command migration for `back`, `shake`, and `goto`.
- `apps/game/src/vnOutputRoutes.test.ts` covers fixed route table behavior,
  one-to-many targets, presentation/effect source separation, and wildcard
  routeKey overrides.
- `tests/smoke/vertical-slice.spec.ts` keeps VN dialog and Pixi visibility
  covered through the app harness.

## Rebase Impact

Branches adding VN commands must rebase on this catalog and either add explicit
official-compatible command declarations or use `@wildcard-<type>` for
branch-local experiments. Branches touching VN app routing should use
`VnRuntimeDispatcher` and `VnOutputRouteTable` instead of routing StoryEngine
outputs inside scenario code.
