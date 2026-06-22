# Contract Change Request

## Requested Change

Remove the generic branch-local command family from the `.nani` runtime bridge.
Every top-level `@` command must be declared in `commandCatalog` before it can
compile to `RuntimeCommand` and enter app dispatch.

## Affected Packages

- `packages/contracts`
- `packages/nani-parser`
- `packages/nani-runtime-compiler`
- `packages/story-engine`
- `apps/game`

## Why Existing Contract Is Insufficient

The generic command family made the runtime bridge less strict than the catalog
model. A misspelled or branch-local command could look intentionally routable
without a stable command declaration, parameter contract, or adapter owner. This
undercuts `commandCatalog` as the only declaration source.

## Proposed Shape

- `NaniCommandSource` allows only `naninovel` and `v-ronpa`.
- The catalog contains only explicit Naninovel official commands and explicit
  V-Ronpa project commands.
- `nani-runtime-compiler` rejects unknown top-level command ids with
  `unknown-command` diagnostics.
- `VnOutputRouteTable` routes only by explicit command id and category fallback.
- Branch-local command experiments must add a V-Ronpa catalog entry before app
  adapters can consume them.

## Fixtures And Tests

- Contract tests pin the catalog to 77 official commands and 83 total commands.
- Compiler tests keep unknown command handling as an error-level diagnostic.
- StoryEngine tests pin the implemented command set without generic command
  exclusions.
- App route tests cover command-specific one-to-many routes and category
  fallback only.

## Rebase Impact

Branches that previously depended on generic branch-local commands must promote
those commands into explicit V-Ronpa catalog declarations, add normalization in
`nani-runtime-compiler`, and route the resulting `RuntimeCommand` through
`VnOutputRouteTable`.
