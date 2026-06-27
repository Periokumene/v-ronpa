# Contract Change Request

## Requested Change

Add dialogue text identity metadata to `.nani` text IR and expose it to app
runtime voice playback without making StoryEngine or save data own audio state.

Also remove the unused `SettingsSnapshot.sound.voiceInterruption` field and add
voice playback to the public `AudioPort`.

## Affected Packages

- `packages/contracts`
- `packages/nani-parser`
- `packages/nani-runtime-compiler`
- `packages/story-engine`
- `packages/media-save`
- `apps/game`

## Why Existing Contract Is Insufficient

The current parser has no stable per-line dialogue identity, so the app cannot
auto-bind a voice asset to a line without explicit audio commands or
speaker/author inference. That would force every voiced line to duplicate audio
declarations in script content and would mix voice lookup rules with character
metadata.

The existing `AudioPort` only exposes BGM and SFX playback, so app runtime code
cannot represent single-active voice playback behind the same media boundary.

`voiceInterruption` was persisted in settings but no runtime behavior consumed
it. Keeping it would create a second policy for voice interruption while this
task standardizes on one active voice handle where each new line stops the
previous voice.

## Proposed Shape

`TextIR` gains optional metadata:

```ts
interface TextIR {
  kind: "text";
  speaker?: string;
  appearance?: string;
  tokens: TextToken[];
  printParams?: Record<string, NaniValue>;
  textId?: string;
}
```

Parser behavior:

- Dialogue lines may contain one Naninovel-style marker: `|#textId|`.
- `textId` is filename-safe in this task: letters, numbers, `_`, and `-`.
  This keeps script ids, generated asset ids, and flat voice filenames on one
  standard.
- The marker is stripped from text tokens and does not become visible text.
- Empty, invalid, multiple, or same-script duplicate textIds produce parser
  diagnostics.
- `@print`, `@append`, and `@toast` do not parse this marker as metadata.

Compiler behavior:

- `TextIR.textId` compiles to synthetic dialogue `print.params.textId`.
- No synthetic `@voice` or explicit `@stopVoice` command is generated.

Runtime behavior:

- StoryEngine may emit `print.params.textId`, but current text, backlog, and
  save snapshots store only visible text.
- App adapter derives `play-voice` effects from emitted `print` commands during
  story step commit.
- Asset id convention is `voice:<locale>:<textId>`.
- Missing voice assets produce runtime asset warnings and do not call audio
  playback.

Settings and media behavior:

- `SettingsSnapshot.sound.voiceInterruption` is removed.
- App settings migration strips legacy persisted `sound.voiceInterruption` and
  preserves other settings.
- `AudioPort` gains:

```ts
playVoice(id: string, uri: string, options?: { volume?: number }): AudioHandle;
```

## Fixtures And Tests

- Contract tests update default `SettingsSnapshot` expectations.
- Parser tests cover valid, empty, invalid, multiple, and duplicate textId
  markers.
- Compiler tests cover `print.params.textId` and no-param unvoiced lines.
- StoryEngine tests cover emitted textId without current/backlog/save storage.
- Media tests cover `AudioPort.playVoice`.
- App adapter tests cover voice derivation, skip suppression, active voice
  interruption, missing asset warnings, and volume settings.
- Asset manifest tests cover `voice:zh:voice_validation_0001`.
- Asset validation enforces `media/voice/<locale>/<textId>.ogg` and the same
  filename-safe textId rule.

## Rebase Impact

Branches touching parser IR, settings snapshots, media ports, app runtime
adapter tests, or harness manifests must rebase and account for:

- `TextIR.textId` as optional metadata.
- Absence of `settings.sound.voiceInterruption`.
- Required `AudioPort.playVoice` in mocks.
- Generated harness voice assets under `media/voice/<locale>/`.
