# VS Code Nani Alignment Audit — 2026-08-05

## Baseline

- Previous release: `vscode-nani-v0.7.0` (peeled commit `63df884`).
- Audited range: `vscode-nani-v0.7.0..9a956b7`.
- Range size: 6 commits, 671 changed paths, including 452 renames.
- Release target: `v-ronpa-nani` 0.8.0 / `vscode-nani-v0.8.0`.

## Reachable Commit Accounting

| Commit | Project change | VS Code impact |
|---|---|---|
| `f7a691b` | Stage Game A home-quarrel scene | New content references must flow through project scanning. |
| `da7cbc7` | Common VS Code project tasks | No language contract change. |
| `f7d028c` | Retune default character framing | Character preview continues to consume pack metadata. |
| `b4883fc` | Enrich home-quarrel presentation | New resource references remain App-relative. |
| `b8a21ef` | Asset Protocol v5 hard update | Adopt slash AssetIds, MIME capabilities, App asset roots, split configs, explicit CharacterId bindings, and post-compile requirements. |
| `9a956b7` | Record PinP surface contract | Add PinP authoring contexts and regressions. |

## Effective Delta

- App content is discovered only below the configured `assets/**` root.
- AssetId is a lowercase slash-kebab App-relative identity without extension,
  colon protocol, raw URI, or App prefix.
- Asset definitions and loading requirements are separate; capability is
  image, audio, video, font, model, or JSON.
- `asset.config.mjs` owns assets and sibling `nani.config.mjs` owns script
  scopes, entries, and voice locales.
- ScenarioIR and RuntimeScript do not contain asset lists; shared catalog
  resource metadata drives post-compile requirements in `nani-project`.
- `@pinp` is a non-blocking saveable DOM image surface. `visible:false` is its
  asset-free hide form.
- Rich-text font faces use FontFaceId such as `serif`, not `font:serif`.

## 0.8.0 Boundary Decision

- Static missing and wrong-capability references are VS Code Problems with
  source `nani-assets`; they are not new shared `nani-project` fatal errors.
- Existing loading `resource` metadata and requirements remain untouched.
- Additive authoring-only catalog metadata identifies `stopBgm.bgmPath` and
  `stopSfx.sfxPath` as audio selectors. Parser, compiler, project, generator,
  runtime, and Apps do not consume it.
- Dynamic expressions, group-only controls, and character wildcards are not
  statically guessed.
- FontFace support is syntax-level only; no App face registry is inferred.

## Acceptance Focus

- One scanner snapshot feeds extension completion, diagnostics, hover,
  definition, navigation, and character preview.
- Recursive watchers detect new, renamed, and deleted assets and scripts, plus
  creation, deletion, and repair of both config files.
- Asset errors use exact source spans and never change shared execution
  disposition.
- Final review must show zero diff in `nani-project`, parser, compiler, asset
  packages, Apps, runtime, renderer, root manifests, and lockfile.
