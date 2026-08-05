# Harness and Regression Gates

The Harness is an app composition surface for VN/Navi/Trial integration and
debug visibility. It may use the explicit runtime debug entry, but production
shells consume canonical ports. Its adapter exposes the four ports, one
read-only debug snapshot, and Harness-owned state; it must not recreate flat
aliases for story, Pixi, or automation actions.

Required gates:

- unit/contract tests for flow, checkpoint identity, pure dispatch/model, ports,
  asset composition, and save rejection;
- `validate:assets`, `validate:boundaries`, `validate:ccr`, app cleanup, and VN
  runtime cleanup;
- Game A and Harness production builds;
- Playwright Game A title/VN/pause/save/settings/Pixi/movie evidence, persistent
  BGM/looping-SFX save-load plus title cleanup, and Harness VN/Navi/Trial pause
  evidence.

The Nani workbench is a Game A development surface in its first version. Harness
does not mount or depend on `app-vn-devtools`; future host-state materialization
must compose through the shared `app-vn-devtools` host transaction with only
app policy callbacks, rather than expanding the VN debug core or cloning the
transaction in an app.

Game A production, development, and test Nani live under
`apps/game-a/src/nani/**`, `apps/game-a/src/nani-dev/**`, and
`apps/game-a/src/nani-test/**`. All three use the shared directory discovery
contract; test entries share one generated catalog. Vite selects the general
smoke and Alice visual entries only in the dedicated `game-a-test-smoke` and
`game-a-test-character` modes. Each Playwright
project visits `/` on its own server; product runtime code does not parse
test-entry URLs or expose an entry override. Browser tests must not navigate
product labels or literal product dialogue as test checkpoints. Production
build validation rejects the complete development/test path and id namespaces,
virtual snapshot and dirty/update protocols, workbench text, test IDs,
source-update event names, and tab-session keys.

Harness showcase source is the ordinary discovered file
`apps/game-harness/src/nani/harness-showcase.nani`. Runtime adapter tests,
semantic golden checks, and benchmarks consume that file or its generated
catalog; no alternate source-template path exists.

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

The Pixi scenario must also assert terminal Stage snapshot readouts for weather,
persistent screen filters, and actor effects; wait tasks must reach zero at
settled checkpoints and all effect readouts must be empty at final cleanup.
Frame-difference checks for continuous weather/filter animation prove motion is
active without becoming pixel-style baselines. Static effects use precise
Presenter unit assertions and terminal readouts, while retained checkpoint
screenshots remain human visual evidence and failure screenshots remain the
diagnostic fallback.

Trace recording is opt-in (`--trace on`) for a focused reproduction. The
default gate keeps traces off because recording a long WebGL interaction
materially changes its timing and can create hundreds of MiB of artifacts.
Failure screenshots remain enabled.

The timing-sensitive AUTO/SKIP browser suite is temporarily disabled. Its
deterministic, independent replacement criteria are tracked in
`docs/review-watchlist.md`; headless unit coverage remains required. Existing
green tests do not replace regression coverage for new public behavior.
