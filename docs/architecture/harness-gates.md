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
- Playwright Game A title/VN/pause/save/settings/Pixi/movie evidence and Harness
  VN/Navi/Trial pause evidence.

Game A smoke content is enabled only with `VITE_ENABLE_TEST_ENTRIES=1` and
`?vnEntry=smoke`. Production build validation rejects smoke markers in output.
Existing green tests do not replace regression coverage for new public behavior.
