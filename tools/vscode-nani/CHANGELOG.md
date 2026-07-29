# Changelog

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
- Kept untrusted, unconfigured, unregistered, and non-`.nani` source-format catalogs on the existing single-file fallback.
- Kept `v-ronpa-nani.refreshProjectAssets` as the stable manual refresh command while extending it to invalidate script catalogs.

No V-Ronpa contracts, runtime/gameplay logic, asset generation rules, root dependency metadata, or lockfile are changed by this release.
