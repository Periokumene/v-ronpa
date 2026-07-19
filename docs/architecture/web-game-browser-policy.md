# Web Game Browser Policy

## Authority

`packages/app-vn-shell` owns the current browser baseline. Every
`GameInteractionShell` installs the same document policy automatically; apps,
Workbench, gameplay, runtime, Pixi, and R3F must not install competing policy
listeners. Installation is reference-counted per `Document`, so React
StrictMode remounts and multiple shell mounts share one listener set and the
last unmount restores the previous document marker.

The policy is intentionally internal. It adds no shell prop, runtime port,
contract, or package export. Game A and Harness both consume it through their
existing `GameInteractionShell` mount. A separate `web-game-host` package is
not justified while those are the only consumers.

## Interaction Rules

The active document has `data-v-ronpa-web-game-document="active"` on `<html>`.
The marker scopes both the CSS reset and the following capture-phase event
rules:

| Browser behavior | Static/game DOM | Text input, textarea, contenteditable |
|---|---|---|
| Text selection / `selectstart` | blocked | allowed |
| Native context menu | blocked | allowed |
| Native `dragstart` | blocked | allowed |
| File drop | blocked | blocked |
| URL/HTML/image drop | blocked | blocked |
| Plain-text drop | blocked | allowed |

Text-editable inputs are text, search, email, password, telephone, URL, and
number fields. Radio, checkbox, range, button, and other controls are not text
editing exceptions. A missing `DataTransfer` must be safe and must not throw.

`html` and `body` use `overscroll-behavior: none`; descendant scroll regions
use `contain`. This prevents scroll chaining and browser edge navigation from
originating in the game document without disabling browser zoom. Global
`touch-action: none` and `user-scalable=no` are prohibited.

## Visual And Control Ownership

The document reset owns only UA leakage: selection, overscroll, button
appearance, number/search decorations, `color-scheme: only dark`, and
`forced-color-adjust: none`. Visual skins remain local:

- `ui-kit` owns the default Settings Slider, Switch, and enum stepper.
- Game A owns its product Settings and input styling.
- `app-vn-devtools` owns Workbench search, number, text, and semantic radio
  styling.

No default Settings surface may render native `select`, checkbox, or range
controls. Text-like controls must explicitly disable autocomplete,
autocorrection, autocapitalization, spellcheck, and browser search/number
decorations where those services are inappropriate.

Save preview images set `draggable={false}`. Runtime video sets `playsInline`,
`disablePictureInPicture`, and `disableRemotePlayback`, and does not expose
native controls.

## Fixed Art Direction And Accessibility

System forced colors and reduced-motion preferences do not branch or rewrite
the authored game/tool presentation. This is a deliberate fixed-art-direction
choice: app and Workbench CSS must not add `prefers-reduced-motion` branches,
and runtime/Pixi/R3F timing does not consume a system motion preference.

The policy does not remove semantic accessibility. ARIA, roles, labels,
screen-reader text, keyboard interaction, `focus-visible`, and browser/page
zoom remain required. Because `forced-color-adjust: none` opts out of system
forced colors, visual review must explicitly confirm text, disabled states,
selected states, and focus indicators remain distinguishable.

## Explicit Non-Goals

This policy does not own:

- window focus, `visibilitychange`, background execution, or automatic pause;
- `beforeunload`, `popstate`, Backspace/Alt+Left interception, refresh, close,
  or History API behavior;
- fullscreen entry or exit;
- cross-browser compatibility layers or polyfills.

`preferFullscreen` remains in Settings v2 but currently has no effect. A future
task must either connect it to a user-gesture-driven Fullscreen API flow or
remove it from the public Settings contract with the required contract process.

## Extraction Rule

Create a separate `web-game-host` only after at least one of these conditions
exists: a third playable app that cannot use `GameInteractionShell`, an
independent non-VN host, PWA/Electron lifecycle requirements, or a need for
public policy configuration/multiple policy instances. Until then, package
extraction is over-design and is prohibited.

## Verification

Unit tests cover install/cleanup, reference counting, editable exceptions, and
drop classification. Game A and Harness smoke tests prove the policy marker and
final DOM properties. The repository drift guard rejects reduced-motion
branches, zoom-disabling viewport declarations, global touch locks, and scope
growth into lifecycle/navigation/fullscreen behavior.

Trackpad edge gestures, forced-color readability, disabled/selected contrast,
and focus visibility retain a manual Chromium acceptance pass because synthetic
events cannot fully reproduce operating-system gesture feedback.
