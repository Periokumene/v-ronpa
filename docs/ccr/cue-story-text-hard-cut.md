# Contract Change Request

## Title

Cue story text, StoryText API, and SaveData v9 hard cut

## Status

- State: `Active`
- Task: `docs/tasks/cue-story-text-hard-cut.md`
- Supersedes: SaveData v8 / DB v10 checkpoints and the public DialogReveal naming

## Why Existing Contract Is Insufficient

The current runtime identifies all story text as dialog presentation, while UI
visibility is limited to three runtime groups. A centered, borderless
performance text needs normal story-text identity, backlog, reveal, audio,
auto/skip, and checkpoint semantics without allowing `hideUI/showUI` to own its
surface. App-local state or a second text authority would drift from StoryEngine
and save state.

## Requested Contract Changes

- Add `@cue text author speed textId autoNext` as a story-control command and
  `@hideCue time wait` as a UI-output command. No aliases or compatibility
  commands are provided.
- Add `StoryTextChannel = "dialog" | "cue"`; require `channel` on current story
  text while keeping backlog presentation-neutral.
- Add `VnUiSurfaceId` with `cue`; retain `RuntimeUiGroup` as only `dialog`,
  `commandBar`, and `toastLayer`, so all forms of `hideUI/showUI` exclude Cue.
- Let UI presentation waits target `VnUiSurfaceId` and keep the existing `ui`
  wait channel.
- Require `cue` in `VnUiCheckpoint`.
- Hard cut SaveData to v9 and Game A/Harness IndexedDB namespaces to v11. v8
  saves and v10 databases are neither read nor migrated.
- Hard rename public DialogReveal/dialogPlayback/dialogDisplay APIs to
  StoryTextReveal/storyTextPlayback/storyTextDisplay, without legacy exports.

## Runtime Semantics

`print` and `cue` write the single current story text and backlog through one
StoryEngine path. The channel selects an independent DOM surface. `cue` shows
its surface in the same projection transaction. `hideCue` only transitions the
Cue surface and leaves current text intact. A following dialog or `resetText`
settles Cue hidden. Cue remains mounted during fade-out, and choices may render
over a still-visible Cue.

Reveal, auto, skip, voice, and bleep use one StoryText clock. Stable checkpoints
store the current text, channel, and terminal Cue visibility, but not reveal
progress, audio handles, or transition time.

## Compatibility

This is an intentional hard cut. There is no `centerText` alias, schema union,
save upgrader, old DB fallback, or old API re-export. Historical CCRs retain
their original meaning; this CCR defines the active contract.

## Regression Evidence

- Contract/parser/compiler tests cover catalog shape, rich text, required
  primary arguments, named text controls, exact textId diagnostics, and v8
  rejection.
- Story/dispatch/runtime tests cover channel switching, stop points, backlog,
  Cue visibility and waits, manual settling, hideUI isolation, and restore.
- Shell/ui-kit/app tests cover two mutually exclusive DOM surfaces, centered
  borderless rendering, accessibility, command bar/choice behavior, and DB v11.
- Game A and Harness smoke tests capture Cue visibility, fade completion,
  following dialog, and hideUI independence.
