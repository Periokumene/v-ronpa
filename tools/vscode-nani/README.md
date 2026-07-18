# V-Ronpa Nani

VS Code language support for V-Ronpa `.nani` scripts.

## Features

- Registers `.nani` files with the `nani` language id.
- Provides TextMate syntax highlighting for comments, labels, commands, parameters, flags, expressions, dialogue, inline commands, and textId markers.
- Provides catalog-derived command, parameter, and allowed-value completion from bundled `naniCommandCatalog` metadata.
- Limits normal completion to runtime-implemented commands and compiler-consumed parameters. Handwritten compatibility commands and declared-but-unconsumed parameters still receive hover and compiler diagnostics.
- Provides current-file label completion for `@goto #` and `goto:#`.
- Discovers the nearest `asset.config.mjs` for an opened `.nani` file and completes generated background, BGM, SFX, video, and layered-character resources.
- Completes layered-character expression tokens from the matching `compositions.json`, including comma-separated `@char` and `@slide` expressions.
- Renders a native 320x420 hover preview when the pointer is over the static identity value of an `@char` command.
- Publishes parser and runtime-compiler diagnostics with exact original-source UTF-16 ranges.
- Preserves shared diagnostic codes and severities under the single VS Code diagnostic source `nani`.
- Surfaces compiler-owned warnings for invalid `showUI` / `hideUI` runtime UI targets and ignored promoted-primary values.

Examples:

```nani
@hideUI commandBar time:0.2 wait!
@showUI target:dialog time:0.2 wait!
@rain power:0.5 wind:-0.2 hue:215 tint:0.55 time:0.4
```

Command and parameter docs, runtime support notes, and stateful Pixi effect semantics are sourced from `@v-ronpa/contracts` when the extension bundle is built. For example, effect hovers explain current `time` interpolation behavior from the shared command catalog instead of maintaining separate VS Code-local docs.

Normal completion excludes commands whose catalog status is not `implemented` and parameters whose shared `runtimeSupport` is `declared-not-consumed`. This prevents the editor from suggesting options such as `@bgm loop!` or media `wait!` that the current compiler intentionally diagnoses, while preserving compatibility diagnostics for existing scripts.

## Project Assets

Project-aware completion is enabled only in a [trusted VS Code workspace](https://code.visualstudio.com/docs/editor/workspace-trust). Starting at the current `.nani` file, the extension finds the closest ancestor `asset.config.mjs`, resolves its paths from the closest `pnpm-workspace.yaml` root, and dynamically loads the config.

The configured generated assets export is the only authority for resource IDs. The extension does not reproduce the repository's filename-to-ID generation rules. After adding or renaming raw assets, run the project's existing asset generator; the extension watches the generated module and refreshes as soon as it changes.

Layered-character token names are read directly from each generated character pack's sibling `compositions.json`. Those files are watched independently, so token edits become available without regenerating or reinstalling the extension.

Use **V-Ronpa Nani: Refresh Project Assets** from the Command Palette if an external tool changes files without producing a filesystem notification. Missing or malformed project metadata is reported in the **V-Ronpa Nani** output channel and never disables parser, compiler, hover, or catalog completion features. The asset index is completion-only: unknown IDs are not diagnosed because external paths and dynamic IDs remain valid authoring inputs.

## Character Assembly Preview

Hover the identity expression in a command such as `@char alice.EYE1,MOUTH3` to inspect the assembled layered character. The preview uses the generated character-pack mapping and the shared layered-character resolver, then embeds only the active PNG layers into a content-addressed SVG in VS Code extension storage. It reproduces layer order, anchors, pivots, scale, Z rotation, flips, color multiplication, and alpha. It intentionally does not approximate Pixi outlines, filters, animation, transitions, or stage transforms from other command parameters.

Command-name and non-identity parameter hovers continue to show language documentation. Preview failures are reported inside the hover and under `[char-preview]` in the **V-Ronpa Nani** output channel; they are never added to Problems. During a same-line edit, the last valid image remains visible with an explicit updating or invalid warning. Inserting or deleting a newline clears that conservative line cache.

Use **V-Ronpa Nani: Preview Character at Cursor** to move the caret to the current line's character identity and open the native hover. The command has no default keybinding and never edits the script. Dynamic IDs, dynamic appearance expressions, and wildcard targets are not guessed.

The parser source map is the only diagnostic-location authority. The extension converts each half-open offset span with `TextDocument.positionAt`; it does not inspect messages, search source text, or manufacture fallback ranges. Results computed for an older document version are discarded. If a parser/compiler or span invariant fails, the extension records the error in the **V-Ronpa Nani** output channel and clears diagnostics for that unchanged document version rather than publishing a guessed range.

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
