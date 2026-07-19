# Contract Change Request

> Status: accepted for the Nani debug workbench hard upgrade.

## Requested Change

Make the four product VN capabilities the only root runtime boundary and move
all inspection state behind the explicit debug entry. Story automation actions
become product shell actions because Game A and Harness overlays invoke them as
normal gameplay behavior.

## Affected Packages

- `packages/app-vn-runtime`
- `apps/game-a`
- `apps/game-harness`
- `packages/app-vn-devtools`

## Why Existing Contract Is Insufficient

`VnRuntimeDebugPort` currently combines read-only inspection with Auto/Skip
product mutations, while `UseVnRuntimeResult` exposes it from the root entry.
That contradicts the documented product boundary and makes app code depend on a
nominally debug-only capability. Harness additionally republishes the same VN
capabilities as both canonical ports and flattened aliases.

## Proposed Shape

- `VnRuntimeShellPort` owns `toggleStoryAuto`, `toggleStorySkip`, and
  `stopStoryAutomation` in addition to its existing product interactions.
- Root `useVnRuntime()` returns only `shell`, `presentation`, `lifecycle`, and
  `diagnostics`.
- Root exports no `VnRuntimeDebugPort` and no debug result field.
- `@v-ronpa/app-vn-runtime/debug` exports `useVnRuntimeWithDebug()` and a
  read-only `VnRuntimeDebugSnapshot` for Harness and development tooling.
- Harness consumers use canonical ports and one explicit debug snapshot; all
  flattened VN aliases are removed.
- The new Nani workbench consumes canonical product ports plus pure helpers from
  the explicit debug entry. It does not add debug mutations to product ports.

## Runtime Ownership

- Shell actions remain implemented by the same StoryPlay/session authority.
- Debug inspection does not gain an alternate reducer or command dispatcher.
- Apps own flow changes and installation of an accepted materialized checkpoint.
- `app-vn-shell` remains a product interaction surface and does not own the
  development Dock.

## Compatibility And Migration

This is an atomic hard cut. There are no deprecated aliases, forwarding
adapters, compatibility exports, or staged dual interfaces. Game A and Harness
must migrate in the same upgrade sequence.

No `.nani` IR, RuntimeCommand, SaveData, SaveableVnState, manifest, or command
catalog shape changes. Existing saves continue to be accepted only when their
game, entry, and script revision match; no migration is added.

## Tests And Gates

- Shell automation actions cover active and rejected/no-op states.
- Root result and exports prove the debug surface is absent.
- The explicit debug hook exposes data only.
- Game A and Harness overlay tests prove product actions route through shell.
- Boundary and cleanup gates reject reintroduction of root debug mutations or
  Harness flattened aliases.
- Game A/Harness builds and smoke tests remain required.

## Rebase Impact

Branches reading `runtime.debug` or flattened Harness VN properties must rebase
onto canonical shell/presentation/lifecycle/diagnostics ports. No compatibility
window is provided.
