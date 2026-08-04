# Changelog

## 0.8.0

- Split project discovery between App-owned `asset.config.mjs` and sibling
  `nani.config.mjs` without changing logical entry or script identities.
- Switched asset completion and character previews to the shared App-relative
  asset scanner, slash AssetIds, MIME capabilities, and explicit CharacterId
  bindings; removed generated-module and business-kind parsing.
- Added catalog-driven resource binding completion for image, audio, video,
  model, font, JSON, PinP, and character parameters.

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
