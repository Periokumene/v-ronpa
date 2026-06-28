# Contract Change Request

## Requested Change

Add dialogue reveal bleep configuration and playback primitives so the app can
play a looping short sound while dialogue text is being revealed.

## Affected Packages

- `packages/contracts`
- `packages/asset-registry`
- `packages/media-save`
- `apps/game`
- `scripts/generate-assets.mjs`
- `scripts/validate-assets.mjs`

## Why Existing Contract Is Insufficient

Dialogue reveal already emits app-local reveal lifecycle events, but there is no
public content configuration for selecting a default bleep sound or speaker
specific overrides. Using `sfx` commands would make the sound script-authored
instead of presentation-derived, and using voice playback would couple bleep to
the voice auto-advance gate.

The existing runtime asset kinds also cannot distinguish bleep fixtures from
ordinary script SFX, and `AudioPort` has no separate method for bleep playback.
Keeping bleep behind a dedicated port method prevents it from sharing lifecycle
with `@sfx` / `@stopSfx` handles while still allowing an audio backend to
implement it as a looped short clip.

## Proposed Shape

`RuntimeAssetKind` gains:

```ts
"bleep"
```

`ContentManifest` gains optional content audio configuration:

```ts
audio?: {
  dialogueBleep?: {
    enabled?: boolean;
    defaultSound?: { sourceRef: string; gain?: number } | null;
    speakerOverrides?: Record<string, { sourceRef: string; gain?: number } | null>;
  };
};
```

Semantics:

- Missing `audio.dialogueBleep` means no dialogue bleep.
- `enabled` defaults to `true` when `dialogueBleep` exists.
- `defaultSound` is used for all speakers unless a speaker override is present.
- `speakerOverrides` keys are exact `.nani` dialogue speaker ids from `xxx:`.
- `null` means explicitly no bleep for that slot.
- Non-null `sourceRef` values must resolve to runtime assets of kind `bleep`.

`SettingsSnapshot.sound` gains `bleepVolume`, defaulting to `1`.

`AudioPort` gains:

```ts
playDialogueBleep(id: string, uri: string, options?: { volume?: number }): AudioHandle;
```

Follow-up runtime semantics:

- Dialogue voice and bleep selection is unified in app-layer dialogue audio
  planning, not split between separate adapter paths.
- A resolvable `voice:<locale>:<textId>` asset suppresses bleep for that line,
  even when voice volume is zero.
- A `textId` whose voice asset is missing is treated as planned localization or
  future voice work, not as an audio error; the line may fallback to bleep.
- A voice asset kind mismatch is reported as a warning and still falls back to
  bleep when bleep configuration allows it.

## Fixtures And Tests

- Contract tests cover `bleep` runtime asset kind, manifest audio config, null
  overrides, and default `bleepVolume`.
- Asset registry tests cover bleep reference validation, missing bleep assets,
  and kind mismatches.
- Media tests cover `playDialogueBleep` as looped playback.
- App adapter tests cover default bleep, speaker override, null override, exact
  speaker matching, skip/hidden/instant no-op behavior, and bleep stop paths.
- Harness assets add `apps/game/public/harness/media/bleep/*.ogg`.

## Rebase Impact

Branches touching public contracts, asset generation, AudioPort mocks, settings
snapshots, or `useVerticalSliceRuntimeAdapter` must rebase and account for the
new `bleep` asset kind, optional manifest audio config, required
`AudioPort.playDialogueBleep` mock method, and `sound.bleepVolume`.
