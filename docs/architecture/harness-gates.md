# Harness and Regression Gates

The Harness is an app composition surface for VN/Navi/Trial integration and
debug visibility. It may use the explicit runtime debug entry, but production
shells consume canonical ports.

Required gates:

- unit/contract tests for flow, checkpoint identity, pure dispatch/model, ports,
  asset composition, and save rejection;
- `validate:assets`, `validate:boundaries`, `validate:ccr`, app cleanup, and VN
  runtime cleanup;
- Game A and Harness production builds;
- Playwright Game A title/VN/pause/save/settings/Pixi/movie evidence, persistent
  BGM/looping-SFX save-load plus title cleanup, and Harness VN/Navi/Trial pause
  evidence.

Game A product Nani lives only under `apps/game-a/src/nani/**`. Test-only Nani
lives under `apps/game-a/src/test-nani/**`, has a separate generated metadata
module, and is enabled only with `VITE_ENABLE_TEST_ENTRIES=1` plus an explicit
`?vnEntry=<test-id>`. Browser tests must not navigate product labels or literal
product dialogue as test checkpoints. Production build validation rejects the
complete test path/id/checkpoint namespace.

Playwright gates always start fresh, correctly configured app servers. On
macOS, Chromium is launched through ANGLE's Metal backend and the independent
smoke scenarios run with two workers. Other platforms retain a one-worker
fallback until their hardware WebGL backend is explicitly qualified. Reusing
an existing server is never an accepted gate mode.

The Harness smoke gate is split into independent Navi/Trial, VN/save-load, and
Pixi visual scenarios. R3F continuous rendering is active only during
interactive Navi; the hidden exploration canvas uses demand rendering. The
Pixi presenter remains mounted and prepared but its ticker is paused whenever
the VN surface is hidden. Smoke asserts these states through
`data-r3f-rendering` and `data-pixi-rendering`.

Trace recording is opt-in (`--trace on`) for a focused reproduction. The
default gate keeps traces off because recording a long WebGL interaction
materially changes its timing and can create hundreds of MiB of artifacts.
Failure screenshots remain enabled.

The timing-sensitive AUTO/SKIP browser suite is temporarily disabled. Its
deterministic, independent replacement criteria are tracked in
`docs/review-watchlist.md`; headless unit coverage remains required. Existing
green tests do not replace regression coverage for new public behavior.
