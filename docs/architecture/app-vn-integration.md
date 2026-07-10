# VN App Integration

`useVnRuntime()` returns named capabilities; apps must not spread its result:

- `shell: VnRuntimeShellPort`
- `presentation: VnPresentationPort`
- `lifecycle: VnLifecyclePort`
- `diagnostics: VnDiagnosticsPort`
- `debug: VnRuntimeDebugPort`

`GameInteractionShell` consumes only `VnRuntimeShellPort`. `VnPixiPresenterHost`
consumes `VnPresentationPort`, an asset resolver, and optional diagnostics/capture
callbacks. Navi and Trial facts are host inputs to the flow projection and never
become VN runtime port fields.

Apps own SaveData composition. They call `createVnSaveCheckpoint()` and pass its
Result into the shared save controller. The controller requires `canSave` for UI
capability and treats collection rejection as the final race-safe authority.

Game A uses `gameId: game-a`; Harness uses `gameId: game-harness`. Both use one
AssetRegistry, one Pixi presenter host, the same shared pause sections, and v8
database namespaces. Game A must not import session, dispatch, presenter, Pixi,
Navi, Trial, Dexie, or Howler packages directly.

Harness-only runtime diagnostics helpers are available from the explicit
`@v-ronpa/app-vn-runtime/debug` entry.
