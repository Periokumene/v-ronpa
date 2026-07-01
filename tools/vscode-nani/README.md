# V-Ronpa Nani

VS Code language support for V-Ronpa `.nani` scripts.

## Features

- Registers `.nani` files with the `nani` language id.
- Provides TextMate syntax highlighting for comments, labels, commands, parameters, flags, expressions, dialogue, inline commands, and textId markers.
- Provides catalog-derived command and parameter completion from `naniCommandCatalog`.
- Provides current-file label completion for `@goto #` and `goto:#`.
- Provides parser diagnostics from `parseScenario`.
- Provides runtime compiler diagnostics from `compileRuntimeScript` with approximate command-line ranges.

Compiler diagnostics in this first version are not parameter-accurate because `RuntimeCompilerDiagnostic` does not currently expose source locations. They are mapped to the most likely command line when possible, otherwise to the start of the document.

## Local Verification

```bash
pnpm --filter v-ronpa-nani test
pnpm --filter v-ronpa-nani build
pnpm --filter v-ronpa-nani package:vsix
```
