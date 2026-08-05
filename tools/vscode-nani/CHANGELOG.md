# Changelog

## 0.9.1

- Grouped resource-bearing command completions into stable sort bands: normal
  parameters and flags appear before primary fixed values and App resources.
- Kept typed resource prefixes focused exclusively on matching assets, so a
  short folder prefix immediately removes parameters from the completion list.
- Added unit and Extension Host coverage for the final VS Code display order.

## 0.9.0

- Added lazy native IntelliSense previews for every App image completion without
  imposing an AssetId folder convention.
- Added the same fixed 320x180 contain preview to static image AssetId hovers;
  PNG, WebP, and AVIF render directly while KTX2 remains discoverable with an
  explicit unsupported-preview notice.
- Added content-addressed asset preview SVG storage, project invalidation,
  stale-result rejection, and graceful output-channel failures without adding
  Problems diagnostics.
- Kept image discovery MIME-driven: root assets and arbitrary nested folders
  are treated equally, and opaque character layers remain outside the App asset
  completion index.

## 0.8.0

- Added one coherent project context for asset scanning, script analysis,
  recursive asset/Nani/config watching, and stale-generation rejection.
- Split project discovery between App-owned `asset.config.mjs` and sibling
  `nani.config.mjs` without changing logical entry or script identities.
- Switched asset completion and character previews to the shared App-relative
  asset scanner, slash AssetIds, MIME capabilities, and explicit CharacterId
  bindings; removed generated-module and business-kind parsing.
- Added extension-owned exact errors, hover, and source definition for static
  App asset references without changing shared project fatal behavior.
- Added catalog-driven non-loading `stopBgm` / `stopSfx` selector completion
  without generating requirements.
- Added context-correct PinP show/hide completion and current FontFaceId grammar,
  snippet, hover, and parser-diagnostic coverage.
- Asset completion follows actual catalog slots; FontFace registry completion
  and model command slots are intentionally not claimed.

## 0.7.0

- Hard-cut project config, recursive catalog discovery, parse/compile/link,
  diagnostic disposition, fatal-source filtering, exact span projection, and
  unsaved-source analysis onto the shared `@v-ronpa/nani-project` package.
- Added automatic managed-root `.nani` watching, production+development
  navigation with development-only target warnings, and one isolated shared
  test catalog with multiple explicit entries.
- Removed per-file registration and non-`.nani` project-source fallback.
- Added complete catalog-derived `@cue` / `@hideCue` completion, primary and
  parameter hover, boolean flags, and exact required-text/textId diagnostics.
- Added completion, hover, and distinct TextMate scopes for staged `[-]` and
  `[wait i]` story text with explicit dialogue/quoted/unquoted boundaries.
- Switched project asset loading exclusively to `runtimeAssetOutputPath` and
  explicitly rejects the removed `outputPath` key.
- Restored character assembly hover, Preview Character at Cursor, token-local
  completion images, and complete-character projections against current Game A
  and Harness generated assets.
- Stabilized Extension Host catalog tests by waiting for real catalog
  completion and definition results instead of treating empty diagnostics as
  an indexing-ready signal.

## 0.6.1

- Added catalog-driven `@charTone` command, parameter, preset, and diagnostic
  support.
- Added primary-value completion for the recommended `@charTone rain` form as
  well as the existing `preset:rain` named form.
- Added primary-value hover documentation for code-owned Tone presets and
  documented the unbounded `amount` multiplier.
- Documented that a named `@char` defaults to `visible:true`, including after
  `@hideChars`; explicit `visible:false` remains authoritative.
- Confirmed CSP v2/v3 lowercase composition tokens, numeric `body0` variants,
  and additional character packs continue to flow through project-derived
  resource completion and character previews.

## 0.6.0

- Added trusted-workspace indexing for production and test `.nani` catalogs declared by the nearest `asset.config.mjs`.
- Added exact shared-linker diagnostics for static navigation endpoints, including live cross-file updates from unsaved target edits.
- Added staged local-label, logical-script-path, and target-label completion for `@goto` and `@choice goto:`.
- Added resolved endpoint hover, local and cross-script Go to Definition, and dedicated TextMate scopes for logical paths and label fragments.
- Added `nani-project` Problems for invalid or conflicting script registration.
- Kept untrusted, unconfigured, and unmanaged files on the existing single-file fallback.
- Kept `v-ronpa-nani.refreshProjectAssets` as the stable manual refresh command while extending it to invalidate script catalogs.

No V-Ronpa contracts, runtime/gameplay logic, asset generation rules, root dependency metadata, or lockfile are changed by this release.
