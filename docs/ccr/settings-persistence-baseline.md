# Contract Change Request

## Requested Change

Replace the placeholder `SettingsSnapshot` shell with a versioned, grouped
settings snapshot for app-owned user preferences.

## Affected Packages

- `packages/contracts`
- `packages/ui-kit`
- `apps/game`

## Why Existing Contract Is Insufficient

The current `SettingsSnapshot` only stores a placeholder flag, so the settings
overlay cannot expose durable user preferences or feed narrow runtime consumers
such as VN dialog display and AUTO/SKIP timing.

## Proposed Shape

`SettingsSnapshot` remains `version: 1` and now contains:

- `system`: language, skip-all preference, fullscreen preference.
- `display`: text speed, text size, textbox opacity, and font id.
- `sound`: master/BGM/SFX/voice/UI volumes and mute.
- `automation`: AUTO and SKIP speed preferences.

Normalized numeric preferences use `0..1`. The app persists this snapshot in
localStorage and rewrites missing fields with defaults. Settings do not enter
`SaveData`, StoryEngine state, RuntimeCommand output, or `media-save`.

Follow-up CCR `textid-auto-voice-runtime` removes the unused
`sound.voiceInterruption` field and migrates legacy localStorage by stripping
that field while preserving the rest of the settings snapshot.

## Fixtures And Tests

- Contract tests cover defaults, old placeholder rejection, and invalid
  normalized values.
- App adapter tests cover localStorage defaults, migration, corrupt data, patch,
  debounce, and runtime selector mapping.
- UI tests cover controlled settings overlay wiring and absence of subtitle
  preview rendering.
- Smoke tests cover title/VN settings entry, real VN dialog display impact,
  AUTO timing impact, and save/load preserving settings outside `SaveData`.

## Rebase Impact

Branches that parse `SettingsSnapshot` must sync to the grouped shape. Save/load
branches are unaffected because `SaveData` is unchanged.
