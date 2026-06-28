# Voice-Aware AUTO Advance Gate

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/textid-auto-voice-runtime`

## Worktree Path

- Codex managed worktree:
  `/Users/periokumene/.codex/worktrees/a74a/v-ronpa`

## Status

- State: `Review`
- Owner: `TBD`
- Created: `2026-06-28`
- Updated: `2026-06-28`
- Completed Commit: `TBD`

## Goal

Implement app-layer AUTO gating that respects active dialogue voice playback
without moving media concerns into StoryEngine or `story-play`.

End-to-end flow:

```text
story-play AUTO / autoNext text minimum timer fires
-> app runtime adapter requests automation advance
-> current voice gate checks successful AudioPort.playVoice handle
-> AudioHandle.finished must resolve { reason: "ended" }
-> app waits fixed 500ms post-voice delay
-> adapter requests the next StoryEngine step
```

Playback failures use the same lifecycle boundary but do not take the post-voice
delay:

```text
AudioHandle.finished resolves { reason: "failed" }
-> current gate clears the voice wait
-> if AUTO / autoNext is already pending, adapter requests the next StoryEngine step
```

## Constraints

- `story-play` remains a pure playback state machine that computes the text
  minimum stay time and pacing intent only.
- StoryEngine, save data, backlog, Pixi, R3F, and DOM rendering stay
  voice-playback agnostic.
- AUTO and script `[>]` one-shot `autoNext` use the same voice gate behavior.
- Manual advance and choices clear the gate, stop the current voice, and advance
  immediately when the current Story state can advance.
- Manual input during a non-confirmable wait must not stop voice if it cannot
  advance the story.
- SKIP never plays new voice, never waits for voice, and stops the active voice
  at each print boundary.
- Muted voice, zero voice volume, and missing assets do not install a gate.
  Playback failures resolve the installed gate with `failed` and do not block
  automation.
- No new settings field; the 500ms post-voice delay is app runtime policy.

## Allowed Paths

- `docs/tasks/**`
- `docs/architecture/**`
- `packages/media-save/**`
- `apps/game/src/**`

## Contracts

- `packages/media-save` extends `AudioHandle` with
  `finished: Promise<{ reason: "ended" | "stopped" | "failed" }>` for BGM,
  SFX, and voice handles.
- `AudioHandle.finished` is a terminal lifecycle contract: it must never reject,
  must resolve at most once, must resolve `ended` only for natural one-shot
  completion, must resolve `stopped` for explicit stop/replacement/stopAll, and
  must resolve `failed` for asynchronous load/playback failures.
- App media effects add a `stop-voice` boundary effect.
- No `packages/contracts` schema or `.nani` IR change is introduced by this
  task.

## Regression Requirements

- Media handle lifecycle:
  - natural voice/SFX end resolves `finished` with `ended`;
  - `stop()`, `fadeOutAndStop()`, replacement by same id, and `stopAll()` resolve
    with `stopped`;
  - asynchronous Howler `loaderror` and `playerror` resolve with `failed`;
  - repeated stop paths resolve only once.
- AUTO gate:
  - voice ending before text minimum time does not advance early;
  - text minimum time expiring while voice is active waits for natural voice end;
  - natural voice end adds the fixed 500ms delay before advance;
  - voice failure after text minimum time releases the pending AUTO / `autoNext`
    advance immediately without the post-voice delay;
  - voice failure before text minimum time clears the gate so the later
    AUTO / `autoNext` request advances normally;
  - `autoNext` uses the same gate behavior.
- No-block paths:
  - missing voice asset, play failure, muted or zero-volume voice do not block
    automation;
  - stopped or cleared voice handles cannot release stale pending advance.
- Boundary paths:
  - every new `print` stops the previous voice;
  - unvoiced prints stop voice and do not install a new gate;
  - manual advance, choice, load, reset, overlay close, trial entry, and story end
    clear the gate;
  - manual input during a timer-only or input wait does not stop voice unless the
    story can actually advance.

## Required Gates

```bash
pnpm test packages/media-save/src/index.test.ts apps/game/src/interaction/useVerticalSliceRuntimeAdapter.test.ts
pnpm validate:contracts
pnpm typecheck
pnpm validate:assets
pnpm validate:boundaries
```

## Review Packet

- Changed files summary.
- Targeted test and gate output.
- Architecture doc update summary.
- Residual risks and future follow-ups.
