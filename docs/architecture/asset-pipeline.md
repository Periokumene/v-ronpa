# App-relative Asset Pipeline

Each independently published App owns one source root:

```text
apps/game-a/assets/**
apps/game-harness/assets/**
```

An AssetId is the lowercase kebab path below `assets/`, with only the final
extension removed. It does not include `assets`, an App name, a capability,
or a protocol prefix: `assets/bg/home.png` is `bg/home`. Its uniqueness
boundary is one App-owned registry, so different Apps may legitimately use the
same ID.

The conventional top-level folders are `bg`, `char`, `font`, `bgm`,
`sfx`, `bleep`, `voice/<locale>`, `video`, `model`, `ui`, and
`thumb`. They are organizational only. Capability is derived from MIME and
declared by the consumer requirement; a PNG in `bg/` may be consumed by both
a background command and PinP. Asset management does not define business kinds
such as background, texture, voice, FX, or character-pack.

## One rule implementation

`@v-ronpa/asset-project` is the Node-only authority shared by generation,
validation, Vite, and the VS Code extension. Each App's `asset.config.mjs`
contains only the relative source root, publish mount, generated module, and
opaque bundle entries. The scanner:

- rejects symlinks, dot segments, unsupported extensions, invalid casing, and
  duplicate IDs, including two formats with the same stem;
- emits deterministic `AssetDefinition[]` values with
  `uri: "assets/..."` and an authoritative MIME;
- registers `char/<slug>/character.json` as the opaque `char/<slug>` JSON
  asset while leaving its internal CSP layer files out of the registry;
- generates the explicit `characterAssetIdByCharacterId` map, so runtime code
  never derives `char/ema` from CharacterId `Ema`.

`pnpm generate:assets` is the only writer. It produces `generatedAssets.ts`
and the Nani catalogs. `pnpm validate:assets` calls the same scanner and
generator in check mode, then validates MIME, media streams, voice mapping,
character packs, manifests, registries, and forbidden raw URLs. There is no
second discovery table, kind override, ID alias, or compatibility normalizer.

## Manifest, registry, and publish boundary

ContentManifest v5 contains one `assets: AssetDefinition[]` list and explicit
`AssetRequirement[]` values. An App creates exactly one AssetRegistry with its
deployment `baseUri`. Consumers provide `{ id, capability }`; the registry
checks MIME capability and is solely responsible for turning the manifest's
relative URI into a final URL. Consumers must not infer folders, extensions, or
URLs from AssetId.

The Vite plugin mounts the source tree at `/assets/**` during development and
copies it without hashes to `dist/assets/**` during build. Vite-owned JS, CSS,
and imported implementation files live under `dist/_bundle/**`.
`publicDir: false` prevents a second static authority. This layout works under
root or subpath deployment through `import.meta.env.BASE_URL`.

Renderer-private implementation resources are a different ownership boundary.
For example, Pixi FX textures live inside `pixi-presenter` and use
`new URL(..., import.meta.url)`; they are bundled below `_bundle` and never
appear in an App manifest. App content assets must always use the App registry.

## Nani binding without VN identity changes

Nani project configuration is separate in `nani.config.mjs`. Existing scope,
entry, and script identities remain unchanged:

```text
apps/game-a/src/nani/**      -> game-a/**
apps/game-a/src/nani-dev/**  -> game-a/dev/**
apps/game-a/src/nani-test/** -> game-a/test/**
apps/game-harness/src/nani/** -> harness/**
```

The parser produces syntax, labels, dependencies, and exact source mapping; it
does not discover assets. The shared command catalog annotates resource-bearing
parameters with either direct AssetId/capability binding or CharacterId lookup.
`@v-ronpa/nani-project` performs this binding after compilation and emits
per-script and per-entry requirements. Control values such as `group:music`
are not AssetIds, and commands without a primary resource do not add a
requirement.

This changes only resource argument text such as `@back bg/home`. It does not
change `VnEntry.id`, `gameId`, `scriptPath`, scriptRoot, labels, choices,
goto targets, textId, entry selection, or cross-script diagnostics. A resource
argument edit changes that script's semantic revision; moving the underlying
file without changing the argument does not.

Voice is an explicit generated index:
`voiceIndex[locale][originalTextId] = AssetId`. Build-time normalization is
used only for matching a voice filename to a declared textId; runtime dispatch
does not construct `voice:<locale>:<textId>`. Missing voice remains legal,
while collisions, invalid locales, and orphan voice files fail validation.

## Layered character production and preparation

The CSP workspace and run outputs remain tool-owned. Promotion mirrors the
accepted whole directory into `apps/<app>/assets/char/<slug>`, deleting stale
target files, then runs generation and validation. Merging directories is
forbidden. The layered-character validator derives one pack-wide source-pixel
scale and validates the JSON package; density is not duplicated in
`character.json`.

Nani binding derives one character preparation plan per compiled script from
explicit `@char` and `@slide` usage. The plan is stored beside
`scriptRevision` and `requirements` in generated Nani metadata, not in
ScenarioIR, RuntimeScript, hand-written App configuration, or the character
pack. The App shell prepares only referenced expressions and saved visible
expressions before a transaction. Unprepared or invalid expressions report a
diagnostic and do not initiate a compatibility lookup or background load.

## Pixi final-character outline and token transitions

Outline enablement is a required app-owned boolean passed through the canonical VN Pixi host. Game A and Harness currently
pass `true` explicitly. A future Game-A-only policy changes only the Harness value to `false`; shared code has no default.

Each actor owns one persistent `final-character-root`. Stable rendering contains one ordinary layer composition. A visible
expression change temporarily holds only outgoing and incoming compositions beneath that root and crossfades them for the
effective `@char` duration: 120 ms when `time` is omitted, or the explicitly declared value. The presentation task is
created only after both compositions and their first-frame alphas exist. The
root attaches one transition-only isolation Filter before the clock starts. A rapid replacement settles the previous
transition to its target before starting the next one. Initial appearance and hide/show use the same presentation-owned
opacity channel rather than attenuating the outline Filter input.

For an enabled actor, every active complete composition owns one final-output
WebGL Filter. When `@charTone` is active, a separate private OKLab Tone Filter
runs immediately before it over the complete composition; individual layer
Sprites never receive tone. The final-output Filter sees the composition at full
coverage, samples the center plus eight neighbor positions, and produces the colored character and white shell atomically.
Neighbor alpha is the source-over union `1 - Π(1-aᵢ)` and white outer alpha is
`neighborAlpha × (1-centerAlpha)`. Only after that calculation does the shader multiply the premultiplied result by
`uOpacity`. `uOpacity` combines actor alpha with the outgoing/incoming transition weight, so animation opacity can never be
misread as texture coverage and cannot create a white interior fade.

Weighted final compositions are not combined with ordinary source-over. That operation would reduce two perfectly aligned
opaque branches to alpha `1-t(1-t)`, or `0.75` at the transition midpoint, and produce the observed semi-transparent pulse.
Instead, the outgoing Filter writes with premultiplied `normal` and the incoming Filter writes with premultiplied `add`
inside the root's transparent isolation target. The isolated result is therefore exactly
`(1-t) × outgoing + t × incoming`, then returns to the actor scene with `normal`. Direct additive blending against the
background is forbidden.

The source step is `unitsPerPixel × stageScale`; each composition's global linear transform converts its X/Y vectors to
Filter input UVs. This preserves one original sprite texel through viewport resize, actor scale, and rotation. Padding is
derived from the transformed diagonal extent plus one antialias pixel. Filter instances keep their own transform and opacity
uniforms while sharing one `GlProgram`.

Steady-state enabled structure is `L + 1 final filter + optional 1 tone filter`;
token transitions are at most
`2L + 2 final filters + optional 2 tone filters + 1 isolation filter`
for the declared transition only. Both branches subscribe to the same live
global tone palette/amount, so expression replacement cannot create a tone
seam. The isolation Filter is lazily reused per actor, detached outside transitions, and
destroyed with the presentation; its filter target is pooled and limited to character screen bounds. The outgoing Filter is
destroyed when the transition settles, without destroying Assets-owned textures. The disabled path uses the same
prepared-resource, opacity scheduler, and isolated crossfade. It temporarily attaches lightweight whole-composition opacity
Filters so internal layers are finalized before weighting, and returns to a filter-free stable state when actor opacity is
`1`.

The following alternatives are intentionally forbidden:

- per-Sprite outline filters, which expose white seams between body, face, arms, and other overlapping layers;
- eight shifted full-character copies or an independently renderable white silhouette branch;
- one Filter over already crossfaded RGBA, because flattened alpha cannot distinguish source coverage from outgoing/incoming
  animation opacity and therefore fills a fading character interior with white;
- ordinary source-over between weighted complete compositions, because shared opaque coverage falls to `0.75` at midpoint;
- direct additive branch blending against the actor scene, because it also adds character color to the background;
- source-sized `RenderTexture.create` or `generateTexture`, which makes large packs such as Ema exceed the intended memory
  envelope;
- invalid-pack fallback to an unoutlined character. Invalid non-empty packs emit
  `asset-invalid-character-source-pixel-scale` and render the existing empty-character state.

Actor alpha is applied by each final composition Filter after outline generation; blur, bokeh, and screen effects continue
to wrap the isolated completed actor. Neither the outline nor transition isolation Filter is added to the viewport-wide
actor filter stack. Tone is likewise never attached to the character layer,
stage root, background, weather, or DOM surface. Each composition destroys its
owned Filter instances, while cached source textures remain Assets-owned. The
implementation supplies GLSL for the existing WebGL path only; WebGPU migration must be coordinated with the other Pixi
effects rather than adding an outline-only renderer fork.
