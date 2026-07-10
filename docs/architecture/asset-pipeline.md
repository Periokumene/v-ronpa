# Runtime Asset Pipeline

Each app owns a declarative `asset.config.mjs`. Generation scans its public
assets, compiles configured `.nani` entries, emits stable semantic SHA-256 script
revisions, derives script asset refs, and records selected runtime providers.

`RuntimeAssetFragment` is the only provider protocol. A `runtime-assets-*`
package may contribute stable IDs, runtime assets, optional fonts, and source
identity. It must not create a manifest, registry, resolver, loader, or alternate
validator. It may depend only on contracts and asset-registry.

`runtime-assets-pixi` is the first provider. Apps select `providers: ["pixi"]`;
generated modules expose its fragment. `composeContentManifest()` combines
generated assets, provider fragments, and explicit UI/preload/optional refs.
Every duplicate ID fails; nothing silently overrides another source. The result
is parsed by `ContentManifestSchema` and creates exactly one AssetRegistry.

Future `runtime-assets-r3f`-style packages must reuse this protocol, composition,
diagnostics, conformance test, and boundary gate.

`pnpm generate:assets` updates generated modules. `pnpm validate:assets` checks
generated freshness, files, fonts, character packs, provider refs, final
manifests, and final registries.
