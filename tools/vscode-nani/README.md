# V-Ronpa Nani

VS Code language support for V-Ronpa `.nani` scripts.

## Features

- Registers `.nani` files with the `nani` language id.
- Provides TextMate syntax highlighting for comments, labels, commands, parameters, flags, expressions, dialogue, inline commands, and textId markers.
- Provides catalog-derived command, parameter, and allowed-value completion from bundled `naniCommandCatalog` metadata.
- Provides current-file label completion for `@goto #` and `goto:#`.
- Provides parser diagnostics from `parseScenario`.
- Provides runtime compiler diagnostics from `compileRuntimeScript` with approximate command-line ranges.
- Provides VS Code-only semantic warnings for invalid `showUI` / `hideUI` runtime UI targets.

Examples:

```nani
@hideUI commandBar time:0.2 wait!
@showUI target:dialog time:0.2 wait!
@rain power:0.5 wind:-0.2 hue:215 tint:0.55 time:0.4
```

Command and parameter docs, runtime support notes, and stateful Pixi effect semantics are sourced from `@v-ronpa/contracts` when the extension bundle is built. For example, effect hovers explain current `time` interpolation behavior from the shared command catalog instead of maintaining separate VS Code-local docs.

Compiler diagnostics in this first version are not parameter-accurate because `RuntimeCompilerDiagnostic` does not currently expose source locations. They are mapped to the most likely command line when possible, otherwise to the start of the document.

## Local Verification

```bash
pnpm --filter v-ronpa-nani test
pnpm --filter v-ronpa-nani build
pnpm --filter v-ronpa-nani package:vsix
```
