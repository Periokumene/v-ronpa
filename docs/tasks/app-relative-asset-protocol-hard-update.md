# App-relative Asset Protocol Hard Update

## Status

- State: `Review`
- Owner: `Codex`
- Created: `2026-08-04`
- Contract authority: [`app-relative-asset-protocol-v5.md`](../ccr/app-relative-asset-protocol-v5.md)

## Objective

Atomically replace App-prefixed, colon-kind, public-directory assets with one
App-relative `assets/**` protocol. The integration state must contain no old
alias, mirror, provider fragment, dual schema, runtime normalization, or save
migration.

## Scope

- `apps/game-a/**`, `apps/game-harness/**`
- `packages/contracts/**`, `packages/asset-project/**`, `packages/asset-registry/**`
- Nani parser/compiler/project, VN runtime/dispatch/shell, Pixi/R3F/UI consumers
- `packages/pixi-presenter/**`; remove `packages/runtime-assets-pixi/**`
- generator, validators, VS Code Nani extension, smoke tests, active docs, CCRs,
  package manifests, TypeScript project references, and lockfile

## Required behavior

- AssetId is a strict slash-kebab path below an App's `assets/` root.
- ContentManifest v5 exposes one definition list and capability requirements;
  one App-owned registry resolves URLs against deployment base URI.
- Directories organize files but do not impose business-purpose kinds.
- Nani parser and RuntimeScript contain no asset list. Catalog metadata drives
  post-compile requirements while VN entry/script/text identities stay stable.
- Voice and CharacterId bindings use generated explicit indexes.
- Vite serves `/assets/**`, emits `dist/assets/**`, and puts implementation
  bundles/private renderer assets below `dist/_bundle/**`.
- ContentManifest 5, PixiStageSnapshot 6, SettingsSnapshot 3, and SaveData 11
  reject old versions without conversion or deletion.

## Regression cases

- Contracts accept slash AssetIds, reject colon/raw/dot/extension/case drift,
  and keep general `IdSchema` colon-compatible.
- Scanner covers deterministic output, MIME, duplicate stems, bundles,
  CharacterId collisions, and independent cross-App IDs.
- Registry covers base URI, missing/duplicate/raw/capability mismatch, including
  one image satisfying background and PinP requirements.
- Nani binding covers every implemented resource command, CharacterId lookup,
  group controls, voiceIndex, and parser/RuntimeScript asset absence.
- Settings/save old versions report unsupported and preserve old storage.
- Both App builds contain only `assets`, `_bundle`, and `index.html`; smoke tests
  exercise image/audio/video/font/model/character/PinP paths.

## Verification

Run the root generation/check, contract, command-doc, boundary, CCR, typecheck,
unit, extension, App build, smoke, and baseline gates. After generation, run
check mode again and require no second-pass generated diff.
