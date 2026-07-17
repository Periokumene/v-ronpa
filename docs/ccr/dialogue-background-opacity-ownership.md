# Contract Change Request

## Requested Change

Remove `SettingsSnapshot.display.textboxOpacity` from player-owned settings,
advance the settings snapshot directly to version 2, and expose Dialogue panel
background opacity as an independent shell appearance parameter with a base
default of `1`.

## Affected Packages

- `packages/contracts`
- `packages/ui-kit`
- `packages/app-vn-shell`
- `apps/game-a`
- `apps/game-harness`

## Why Existing Contract Is Insufficient

Textbox opacity is currently persisted as a player-wide display preference and
then mixed into `VnDialogDisplaySettings` beside text size and reveal speed.
That makes product Dialogue chrome player-owned and gives the same visual value
three conflicting defaults across contracts, the shared UI surface, and Game A.

Dialogue background opacity is product presentation configuration. It must not
be stored in `SettingsSnapshot`, patched by the Settings overlay, or restored
from player storage. Runtime surface visibility remains separately controlled
by `UiSurfacePresentation.opacity`.

## Proposed Shape

`SettingsSnapshot` hard-cuts to version 2. Its display group contains only:

```ts
interface SettingsDisplaySnapshot {
  textSpeed: number;
  textSize: "small" | "medium" | "large";
  fontFamilyId: string;
}
```

The Dialogue shell gains an independent appearance input:

```ts
interface VnDialogAppearance {
  backgroundOpacity: number;
}

const DEFAULT_VN_DIALOG_APPEARANCE = {
  backgroundOpacity: 1
};
```

`VnDialogViewModel.appearance` contains the resolved appearance for both the
default shared surface and custom product surfaces. `VnDialogDisplaySettings`
retains only text size and text speed. `UiSurfacePresentation.opacity` remains
the authority for show/hide transitions.

This is a hard update:

- Version 1 snapshots are rejected.
- Existing version 1 localStorage keys are not read, migrated, or deleted.
- `display.textboxOpacity` is not stripped or mapped into Dialogue appearance.
- Current apps use new version 2 storage keys and start from version 2 defaults.

## Fixtures And Tests

- Contract tests cover version 2 defaults, version 1 rejection, and strict
  rejection of `display.textboxOpacity`.
- Settings adapter tests cover version 2 storage and narrow dialog display
  settings without opacity.
- Shell and UI tests cover default `backgroundOpacity: 1`, explicit appearance,
  bounded appearance values, and independence from transition opacity.
- Shared and Game A Settings tests prove the player control is absent.
- Playwright smoke proves both apps render Dialogue with the new appearance
  attribute and no opacity setting.

## Rebase Impact

Branches that construct `SettingsSnapshot`, `VnDialogDisplaySettings`,
`VnDialogViewModel`, or Settings UI fixtures must update to version 2 and remove
`textboxOpacity`. Persisted version 1 settings are intentionally discarded.
