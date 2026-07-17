# CSP authoring contract

## Folder model

- Pass the character root explicitly, normally `/MAIN`. Content outside it is reported but ignored.
- Every folder with child folders is structural. It may not also contain direct drawable layers.
- Every folder without child folders is a sprite. Its visible drawable descendants are composited into one cropped PNG.
- The character root must be structural; empty folders and transparent sprite results are invalid.
- Folder names are runtime identifiers. They must not be empty, `.` or `..`, contain control characters, or use the reserved
  expression/path characters `>`, `+`, `-`, `/`, and `\`.
- Runtime and asset paths must remain distinct under Unicode normalization and case-insensitive filesystems.

Hidden leaf folders are still exported as available variants. Hidden drawable layers inside a leaf stay excluded from that
sprite. Variant selection for `Default` uses effective visibility, including ancestor visibility.

## Default visibility

Sibling leaf folders form one exclusive runtime group. Every group must have exactly one effectively visible leaf, with two
exceptions:

- a group whose exact name is `EYE` may have zero or one;
- a group whose exact name is `EFFECT` may have zero or one.

Two visible leaves in any group are invalid. Zero visible leaves in BODY, ArmL, ArmR, MOUTH, or any unrecognized group are
also invalid.

## Rendering boundary

Folder boundaries may use normal or pass-through blending. Boundary clipping, masks, vector masks, effects, and other blend
modes are rejected because they cannot be reproduced safely after the folder is split into independent sprites. Opacity,
blend modes, masks and supported effects inside a leaf are rasterized into that leaf. Recoverable uncommon CSP/PSD content
is reported as a warning; inability to obtain non-empty pixels is an error.

## Source-pixel invariant

Every generated leaf uses `sprite.pixelsPerUnit = 1` and `localTransform.scale = { x: 1, y: 1, z: 1 }`. Therefore one
source texel is exactly one character-local unit. Project-authored packs may use another density, but every layer in one
pack must describe the same square source pixel:

```text
unitsPerPixelX = abs(localTransform.scale.x) / sprite.pixelsPerUnit
unitsPerPixelY = abs(localTransform.scale.y) / sprite.pixelsPerUnit
```

Both axes must be finite and positive, X and Y must match, and every layer must match the pack-wide value within relative
error `1e-6`. The CSP pack validator enforces this before a run is accepted. Do not edit generated density or transform
metadata after generation; fix the source or generator and produce a new immutable run.

This invariant is consumed twice downstream: project asset validation rejects the promoted pack, and Pixi converts the one
source texel through the character and actor transforms into final-Filter sampling vectors. VN entries preload only the
layers named by their generated expression plans. Do not solve a rejected run by adding another density field, renderer
override, per-layer outline, or a second export standard.

## Fixing a rejected run

Open `workspace/outputs/<character>/<run-id>/reports/validation.json`. The failed manifest records the exact archived input,
so corrections can be compared against the rejected source. Fix the CSP and build again; do not edit generated JSON or PNG
files in place because every run is immutable evidence.
