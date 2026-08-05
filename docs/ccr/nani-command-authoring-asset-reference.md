# Contract Change Request: Nani Authoring Asset References

## Status

Accepted for the VS Code Nani 0.8.0 alignment.

## Problem

`NaniCommandParamSpec.resource` identifies parameters that produce App asset
loading requirements. That is sufficient for runtime and generation, but it
cannot describe non-loading parameters such as `stopBgm.bgmPath` and
`stopSfx.sfxPath`. The VS Code extension therefore cannot offer catalog-driven
asset completion, hover, definition, or typo diagnostics for those selectors.

## Decision

- Preserve `NaniCommandParamSpec.resource` and `NaniCommandResourceBinding`
  without changes.
- Add optional `NaniCommandParamSpec.authoring.assetReference` metadata with a
  capability, resolution, runtime parameter name, and the literal role
  `selector`.
- Mark only `stopBgm.bgmPath` and `stopSfx.sfxPath` as audio AssetId selectors.
- The metadata is authoring-only. Parser, compiler, `nani-project`, generator,
  runtime, manifests, requirements, script revisions, and execution disposition
  must not consume it.

## Compatibility

This is an additive command-catalog metadata change. It does not change `.nani`
syntax, ScenarioIR, RuntimeScript, ContentManifest, AssetRequirement, save data,
or runtime behavior. Existing `resource` consumers continue to observe the same
bindings.

## Regression Requirements

- The command catalog schema accepts the new strict authoring shape and rejects
  unknown fields.
- Both stop selectors expose the audio AssetId metadata without a `resource`
  binding.
- The complete existing set of loading `resource` bindings remains unchanged.
- `nani-project` and runtime tests pass without source changes.
