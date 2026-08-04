# Contract Change Request: App-relative Asset Protocol v5 Hard Update

## Status

Accepted and implemented as an atomic hard update.

## Problem

The previous content contract mixed App URL namespaces, business-purpose asset
kinds, provider fragments, direct URL knowledge, and Nani resource discovery.
IDs such as `bg:home-outside` depended on a command-facing prefix, while source
and publish paths repeated `public/game-a/game-a`-style ownership. The same PNG
could be artificially classified as background or texture even though loading
requires only an image capability.

## Decision

- App content lives only below `apps/<app>/assets/**`.
- AssetId is the lowercase kebab relative path below `assets/`, with the final
  extension removed, for example `bg/home`. It excludes App name, `assets`, a
  colon protocol, extension, business kind, dot segment, and raw URI.
- AssetId uniqueness is scoped to one App-owned registry. Cross-App collisions
  are legal; any future composition namespace belongs at that composition
  boundary.
- ContentManifest hard-cuts to version 5 with one `AssetDefinition[]` and
  explicit `AssetRequirement[]`. Requirements declare only `image`, `audio`,
  `video`, `font`, `model`, or `json` loading capability.
- The App registry validates MIME capability and is the sole component that
  combines manifest-relative `assets/...` URIs with the deployment base URI.
- `RuntimeAssetKind`, `RuntimeAssetFormat`, `RuntimeAsset`, `AssetRef`, provider
  fragments, `runtimeAssets`, and `composeContentManifest` are removed.
- FontFace identity is separate from AssetId. A face has either a system-family
  source or an explicit font AssetId. SettingsSnapshot hard-cuts to version 3.
- CharacterId remains story identity. Generation emits an explicit
  CharacterId-to-AssetId index; runtime derivation is forbidden.
- Renderer-private implementation resources remain inside their presenter or
  adapter and use module URLs. They do not enter an App manifest.

## Nani and VN boundary

ScenarioIR and RuntimeScript no longer carry asset lists. Resource metadata is
owned by the shared command catalog and is bound after compilation by
`nani-project`. The binder emits per-script and per-entry requirements, using a
direct AssetId or the explicit character index. Control parameters are not
treated as resources.

Voice matching is build-time-only and emits
`voiceIndex[locale][originalTextId] = AssetId`. The dispatcher performs an
index lookup and never constructs a colon ID.

This CCR does not change `VnEntry.id`, `gameId`, scriptRoot, `scriptPath`,
labels, choices, goto endpoints, textId, entry selection, or cross-script
diagnostic semantics. Script revisions change only when the compiled resource
argument text changes, not when an asset file is moved behind an unchanged ID.

## Publish contract

The shared asset project implementation serves source assets at `/assets/**`
in development and emits them unchanged to `dist/assets/**`. Vite-owned output
uses `dist/_bundle/**`; `publicDir` is disabled. This preserves App-relative
manifest URIs and supports subpath deployment through the registry base URI.

## Serialization hard cut

- ContentManifest: `4 -> 5`
- PixiStageSnapshot: `5 -> 6`
- SettingsSnapshot: `2 -> 3`
- SaveData: `10 -> 11`
- Game A and Harness save database namespaces: `v12 -> v13`

Unsupported versions produce explicit unsupported-version diagnostics/results.
No migration, alias, redirect, compatibility reader, runtime normalization, or
automatic deletion of old storage is provided.

## Rejected alternatives

- `relativepath:...` or another protocol prefix: the App-relative path already
  carries the needed identity and a prefix recreates the old coupling.
- App name in every AssetId: independently published Apps already provide the
  uniqueness boundary.
- Directory-derived business kinds: folders aid people but do not define what
  a consumer may do with the bytes.
- Dual old/new protocols or an alias table: this would create two authorities
  and make validation unable to prove the hard update complete.

## Regression requirements

Contract tests cover strict AssetId and FontFaceId rules while preserving the
general colon-capable IdSchema. Scanner, Vite, registry, Nani binding, voice,
character, font, save/settings rejection, production layout, and App smoke
tests cover both normal and invalid paths. Generated files must be idempotent,
and active source/build output must contain no legacy content URL or asset
protocol outside explicit negative tests and historical records.
