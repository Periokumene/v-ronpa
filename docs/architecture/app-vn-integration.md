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
capability and treats collection rejection as the final race-safe authority. A
checkpoint contains the terminal Story/Pixi/UI state and canonical VN persistent
media intent; restore materializes BGM and looping SFX from the beginning.

An `AudioPort` passed to `useVnRuntime()` is exclusively owned by that runtime.
Reset, accepted restore, and unmount all use one disposal path: invalidate voice
gates/tokens, stop the complete audio and video ports, and clear runtime media
handles and related refs. Identity rejection happens before cleanup.
`VnLifecyclePort.resetRuntime()` has no soft-media option.

Game A uses `gameId: game-a`; Harness uses `gameId: game-harness`. Both use one
AssetRegistry, one Pixi presenter host, the same shared pause sections, and v9
database namespaces. Game A must not import session, dispatch, presenter, Pixi,
Navi, Trial, Dexie, or Howler packages directly.

Harness-only runtime diagnostics helpers are available from the explicit
`@v-ronpa/app-vn-runtime/debug` entry.
