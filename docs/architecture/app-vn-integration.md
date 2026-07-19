# VN App Integration

`useVnRuntime()` returns named capabilities; apps must not spread its result:

- `shell: VnRuntimeShellPort`
- `presentation: VnPresentationPort`
- `lifecycle: VnLifecyclePort`
- `diagnostics: VnDiagnosticsPort`

`GameInteractionShell` consumes only `VnRuntimeShellPort`. `VnPixiPresenterHost`
consumes `VnPresentationPort`, an asset resolver, and optional diagnostics/capture
callbacks. Navi and Trial facts are host inputs to the flow projection and never
become VN runtime port fields.

Story advance, choice/input submission, movie completion, Auto/Skip control,
toast dismissal, and shell-visible runtime facts all belong to the shell port.
Apps do not reach through an inspection object to perform product actions.

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
`@v-ronpa/app-vn-runtime/debug` entry. `useVnRuntimeWithDebug()` adds one
read-only `VnRuntimeDebugSnapshot` to the four canonical ports. Game A's
development workbench uses the entry's headless inspector/materializer and
commits only through `VnLifecyclePort.restoreVnState()`; see
[Nani devtools](vn-devtools.md).

## Game viewport ownership

The app playfield is the only geometry boundary shared by Game A DOM surfaces
and Pixi. Product UI dimensions and breakpoints are relative to the playfield
container, not the browser window. Pixi continues to measure the host supplied
by `VnPixiPresenterHost`; apps and development tools must not send presenter
resize commands or mirror its dimensions into runtime state.

Development chrome stays outside this boundary. Game A may provide an
app-internal wrapper around the playfield for DEV-only scaling or letterboxing,
but `GameInteractionShell`, runtime ports, checkpoints, and Pixi remain children
of one logical playfield. The production call omits the wrapper and must not
mount development DOM or observers. Host preview modes are app tooling state,
not `app-vn-devtools`, runtime, save, or presentation contracts.

## Browser document ownership

Mounting `GameInteractionShell` automatically installs the internal
document-level browser policy for the whole app, including development chrome
outside the playfield. Apps and Workbench must not duplicate document event
listeners or root resets. The policy remains outside runtime ports, gameplay,
save/checkpoint state, and Pixi/R3F presentation; see
[Web game browser policy](web-game-browser-policy.md) for the interaction,
visual, accessibility, and non-goal matrix.
