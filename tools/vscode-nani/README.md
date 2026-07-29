# V-Ronpa Nani

VS Code language support for V-Ronpa `.nani` scripts.

## Features

- Registers `.nani` files with the `nani` language id.
- Provides TextMate syntax highlighting for comments, labels, commands, parameters, flags, expressions, dialogue, inline commands, and textId markers.
- Provides catalog-derived command, parameter, and allowed-value completion from bundled `naniCommandCatalog` metadata.
- Limits normal completion to runtime-implemented commands and compiler-consumed parameters. Handwritten compatibility commands and declared-but-unconsumed parameters still receive hover and compiler diagnostics.
- Provides current-file label completion for `@goto #` and `goto:#`.
- Loads production and test Nani catalogs from the nearest `asset.config.mjs` in trusted file workspaces.
- Completes local labels before registered logical script paths, then completes labels from the selected target after `path.nani#`.
- Publishes exact shared-linker diagnostics for malformed, dynamic, relative, wildcard, unknown-script, and unknown-label endpoints.
- Resolves navigation endpoint hovers and Cmd/Ctrl+click definitions across registered `.nani` source files.
- Discovers the nearest `asset.config.mjs` for an opened `.nani` file and completes generated background, BGM, SFX, video, and layered-character resources.
- Completes layered-character expression tokens from the matching `compositions.json`, including comma-separated `@char` and `@slide` expressions.
- Renders a native 320x420 hover preview when the pointer is over the static identity value of an `@char` command.
- Lazily renders native IntelliSense details for a selected `@char` appearance-token candidate, showing its local image and the complete projected character without adding a persistent panel.
- Publishes parser and runtime-compiler diagnostics with exact original-source UTF-16 ranges.
- Preserves shared diagnostic codes and severities under the single VS Code diagnostic source `nani`.
- Surfaces compiler-owned warnings for invalid `showUI` / `hideUI` runtime UI targets and ignored promoted-primary values.

Examples:

```nani
@hideUI commandBar time:0.2 wait!
@showUI target:dialog time:0.2 wait!
@rain power:0.5 wind:-0.2 hue:215 tint:0.55 time:0.4
@charTone rain amount:1 time:0.3 wait!
```

Command and parameter docs, runtime support notes, and stateful Pixi effect semantics are sourced from `@v-ronpa/contracts` when the extension bundle is built. For example, effect hovers explain current `time` interpolation behavior from the shared command catalog instead of maintaining separate VS Code-local docs.
Both `@charTone ` / `@charTone r` primary-value completion and
`@charTone preset:` named-value completion expose the six code-owned
multicolor presets plus `none`. Hovering a primary preset or `amount` shows the
shared catalog documentation, default, and recommended artistic range.
Renderer easing is fixed internally and is not offered as an authoring
parameter.

Normal completion excludes commands whose catalog status is not `implemented` and parameters whose shared `runtimeSupport` is `declared-not-consumed`. This prevents the editor from suggesting options such as `@bgm loop!` or media `wait!` that the current compiler intentionally diagnoses, while preserving compatibility diagnostics for existing scripts.

## Multi-Script Navigation

In a trusted file workspace, the extension reads the nearest `asset.config.mjs`
and indexes the top-level production `entry/scripts` plus each
`testCatalogs.<name>.entry/scripts` catalog independently. Physical
`sourceFile` paths are mapped to their registered logical `scriptPath`, so
editor diagnostics use the same catalog authority as asset generation and the
runtime linker.

```nani
@goto #LocalLabel
@goto game-a/chapter-02.nani
@goto game-a/chapter-02.nani#Start
@choice "Continue" goto:game-a/chapter-02.nani#Start
```

Local label candidates appear before logical script paths. After a path and
`#`, IntelliSense switches to labels from that target script. Hover reports the
resolved script, label, and production/test catalog; Go to Definition opens the
registered source and selects the label when present.

Untrusted, unconfigured, and unregistered `.nani` files retain the existing
single-file parser/compiler diagnostics and local-label completion. Catalogs
containing `sourceFormat` entries such as the Harness TypeScript template are
intentionally outside the 0.6.0 editor boundary and also fall back to
single-file support. Configuration conflicts are reported against
`asset.config.mjs` with diagnostic source `nani-project`.

## Project Assets

Project-aware completion is enabled only in a [trusted VS Code workspace](https://code.visualstudio.com/docs/editor/workspace-trust). Starting at the current `.nani` file, the extension finds the closest ancestor `asset.config.mjs`, resolves its paths from the closest `pnpm-workspace.yaml` root, and dynamically loads the config.

The configured generated assets export is the only authority for resource IDs. The extension does not reproduce the repository's filename-to-ID generation rules. After adding or renaming raw assets, run the project's existing asset generator; the extension watches the generated module and refreshes as soon as it changes.

Layered-character token names are read directly from each generated character pack's sibling `compositions.json`. Those files are watched independently, so token edits become available without regenerating or reinstalling the extension.

Use **V-Ronpa Nani: Refresh Project Assets** from the Command Palette if an external tool changes files without producing a filesystem notification. The existing command now invalidates both asset metadata and Nani script catalogs. Missing or malformed project metadata is reported in the **V-Ronpa Nani** output channel; single-file parser/compiler diagnostics and command hover remain available while project-derived completion falls back. The asset index is completion-only: unknown IDs are not diagnosed because external paths and dynamic IDs remain valid authoring inputs.

## Character Assembly Preview

Hover the identity expression in a command such as `@char alice.body0,eye1,mouth3,armR4` to inspect the assembled layered character. The preview uses the generated character-pack mapping and the shared layered-character resolver, then embeds only the active PNG layers into a content-addressed SVG in VS Code extension storage. It reproduces layer order, anchors, pivots, scale, Z rotation, flips, color multiplication, and alpha. It intentionally does not approximate Pixi outlines, filters, animation, transitions, or stage transforms from other command parameters.

Command-name and non-identity parameter hovers continue to show language documentation. Preview failures are reported inside the hover and under `[char-preview]` in the **V-Ronpa Nani** output channel; they are never added to Problems. During a same-line edit, the last valid image remains visible with an explicit updating or invalid warning. Inserting or deleting a newline clears that conservative line cache.

Use **V-Ronpa Nani: Preview Character at Cursor** to move the caret to the current line's character identity and open the native hover. The command has no default keybinding and never edits the script. Dynamic IDs, dynamic appearance expressions, and wildcard targets are not guessed.

### Completion Preview

Type a partial appearance token such as `@char alice.eye1,mo` and select a character token in IntelliSense. The native completion details area lazily shows the candidate's newly active image content and the complete character that would result if the candidate were accepted. Creating or filtering the completion list does not read character PNGs; preview work begins only when VS Code resolves a selected completion item.

Completion previews close with IntelliSense and do not create a Webview, panel, editor decoration, or background image. The UI intentionally omits token expansion and internal layer provenance. A candidate that only removes layers shows the projected complete character with a short no-new-image state. Preview failures stay in the completion documentation and the `[char-preview]` output channel.

The parser source map is the only diagnostic-location authority. The extension converts each half-open offset span to UTF-16 line/column positions; it does not inspect messages, search source text, or manufacture fallback ranges. Results computed for an older document version are discarded. If a parser/compiler or span invariant fails, the extension records the error in the **V-Ronpa Nani** output channel and clears diagnostics for that unchanged document version rather than publishing a guessed range.

## Local Verification

```bash
pnpm --filter v-ronpa-nani test
pnpm --filter v-ronpa-nani test:extension
pnpm --filter v-ronpa-nani build
pnpm --filter v-ronpa-nani package:vsix
```

The package command reads the extension version from `package.json` and writes `v-ronpa-nani-<version>.vsix`.
Extension Host tests run directly on macOS and Windows; on Linux the launcher uses
`xvfb-run -a` and therefore requires Xvfb to be installed.
