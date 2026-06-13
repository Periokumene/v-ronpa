# Web 3D Asset Pipeline Contracts

## Intent

Browser assets must be declared in contracts before renderer worktrees depend
on them. Source files, optimized runtime files, collision proxies, LODs, and
texture budgets are separate concerns.

## Runtime Assets

`RuntimeAsset` is the shipping asset shape:

- `sourceUri`: optional authoring source for traceability.
- `optimizedUri`: runtime file loaded by the app.
- `format`: `glb`, `gltf`, `webp`, `ktx2`, `mp3`, `mp4`, etc.
- `compression`: `meshopt`, `draco`, `ktx2`, `webp`, and related runtime
  constraints.
- `lods`: lower-detail runtime alternatives with distance thresholds.
- `collisionProxyIds`: explicit links to non-render collision data.

Renderer packages load `optimizedUri`. They should not load authoring sources.

## Collision Proxies

`CollisionProxy` covers `box`, `sphere`, `capsule`, `convex-mesh`, `trimesh`,
and `navmesh`. A `WorldMapDef` declares which proxies define walkable or
interactable space.

Navi first-person movement must be collision-ready before production maps are
added. Harness placeholders can still use simple geometry, but map definitions
must keep the proxy references.

## Budgets

Texture and mesh budgets live beside runtime assets so review can happen during
contract changes. A future asset build task should use glTF Transform and image
compression tooling, then validate the generated manifest against
`ContentManifestSchema`.

