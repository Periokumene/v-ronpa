# Nani Workbench Source-Focus IDE Design QA

## Evidence

- Source visual truth: `/Users/periokumene/.codex/generated_images/019f7438-91b6-7d30-b2d8-e69a55c9ed84/exec-7a71f61f-22b8-4551-883a-69e58a5ac5b3.png`
- Browser-rendered implementation: `test-results/game-a-workbench-ide-720.png`
- Full-view comparison: `test-results/design-qa/workbench-reference-vs-implementation.png`
- Focused implementation states:
  - `test-results/game-a-workbench-expanded.png`
  - `test-results/game-a-workbench-ide-320.png`
  - `test-results/game-a-workbench-overlay.png`
  - `test-results/design-qa/workbench-decision-browser.png`
  - `test-results/design-qa/workbench-compiler-error-browser.png`
- Comparison viewport: `1672 × 941`, 720px Dock, source-first IDE state.
- Responsive viewports: `1280 × 720` at the persisted/default Dock width, `1672 × 941` at 320px, and `820 × 720` overlay.

The full-view comparison places the source truth and browser implementation in one 3344 × 941 image. Focused evidence is separate because Find, Branch, Problems, minimum-width density, and overlay behavior cannot all be represented in one stable state.

## State And Interaction Coverage

- Ready/source browsing, current and pinned markers, contextual Run-to-line.
- Top-level Preview and stable State installation.
- Full-source Find, match stepping, Symbols filtering and navigation.
- Choice and input decisions in the transient Branch panel.
- Parser/compiler rejection in Problems while the last-known-good game frame remains installed.
- Dock resize, 320px density, collapse, narrow-screen overlay, panel resize, and persisted reload.
- Cancellable versus accepted/Finishing primary actions are covered by component tests; the accepted transition is intentionally too short to freeze as a misleading browser state.
- The browser and Playwright run checked console errors. No unexpected console or page errors were observed; the WebGL readback performance warning is non-fatal and unchanged from the game renderer.

## Findings

- Information hierarchy matches the accepted direction: file/status, command strip, breadcrumb, uninterrupted source stage, compact tool panel, and status bar.
- The game surface keeps its fidelity geometry when the Dock changes size; the Dock no longer induces the previous responsive layout mutation.
- Color, density, mono typography, flat borders, and Phosphor controls stay coherent with the visual truth while respecting the approved English copy and 45vw limit.
- At 320px the command strip becomes icon-first, secondary status fields recede, source remains readable, and no action overlays source text.
- Branch and Problems are visually distinct without reintroducing large form cards.
- No actionable P0, P1, or P2 mismatch remains.

## Comparison History

### Iteration 1

- P2: At the 420px/default density, contextual `Run to line` copy could overlap long source text.
- Fix: Hide the contextual action label below 520px while retaining the Phosphor Play icon, tooltip, ARIA label, and test identifier.
- Post-fix evidence: `test-results/game-a-workbench-expanded.png` and `test-results/design-qa/workbench-ide-420-browser.png`.

### Iteration 2

- P2: Find used `:focus-within` to reveal an input that was still `display:none`, so keyboard and trigger focus could not bootstrap the overlay.
- Fix: Add a transient DOM-local `is-open` view state, focus after the keyboard event, and restore Dock focus on close. No query or open state is persisted.
- Post-fix evidence: the passing Game A smoke covers global `Ctrl+F`, complete source retention, stepping, Escape isolation, and reopening; the full-view layout remains unchanged.

### Iteration 3

- P2: The 320→420 pointer-resize scenario counted the 7px hit-area offset twice in its test choreography.
- Fix: Drag from the separator center to an exact 100px delta and keep the production width calculation unchanged.
- Post-fix evidence: `test-results/game-a-workbench-ide-320.png`, `test-results/game-a-workbench-expanded.png`, and the passing Game A smoke.

## Residual P3 Polish

- The 720px command strip intentionally remains denser and lower-contrast than a full desktop IDE because the Dock must preserve the game as the primary surface.
- Very large authored scripts may eventually justify virtualization, but current `content-visibility` behavior is sufficient and avoids a second source model.

final result: passed
