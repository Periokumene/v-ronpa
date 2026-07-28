# CSP authoring contract v3

This document, the v3 preset, validator, and regression tests are the authoritative CSP layered-character authoring
contract. v3 is a hard cut: the v2 direct-leaf `body`, `/MAIN`, uppercase preset aliases, nested runtime groups, and older
visibility rules are rejected.

## Folder model

```text
/root
  body/
    0/
      <drawable layers>
    1/
      <drawable layers>
  <lowerCamelGroup>/
    0/
      <drawable layers>
    1/
      <drawable layers>
  effect/                 # optional
    0/
    1/
```

- `/root` is fixed. Content outside it is reported in `validation.json` and ignored.
- `body` is the only required direct child. It is a numeric runtime group, must contain `0`, and must be the backmost
  direct child.
- Every other direct child is an optional runtime group. Every group name, including `body`, must match
  `^[a-z][A-Za-z0-9]*$`.
- Runtime groups are flat. A group contains only numeric variant leaf folders; a variant contains only drawable layers.
- Variant names are continuous ASCII decimal integers `0..N` without leading zeroes.
- `effect`, when present, must be the frontmost direct child.
- Direct-child source order is the background-to-foreground runtime `drawOrder`. `armL` and `armR` are identifiers only;
  the tool does not infer, validate, or swap direction from pixels.
- Runtime names and generated paths/tokens must remain distinct under NFC normalization and case folding. Empty names,
  controls, and `>+-/\` are unsafe.

Drawable names inside a variant—such as `C`, `C2`, `L`, `H`, `S`, `basecolor`, `detail`, `line`, `ao`, or `shadow`—are
not runtime vocabulary.

## Default visibility

- `body/0` must exist, be effectively visible, and produce non-transparent pixels.
- Every ordinary group, including `body`, effectively selects variant `0` and only `0`; all nonzero variants are hidden.
- Every `effect` variant is hidden. The group is absent from the source/default composition until explicitly selected.

These rules are checked against the CSP/PSD visibility chain. A hidden ordinary parent cannot be used to make a visible
`0` appear valid.

## Generated vocabulary

- `sourcePreview` is the effective source composition.
- `default` expands to `sourcePreview`.
- `character.defaultComposition` is `["default"]`.
- Every ordinary or effect variant generates `${group}${index}`, for example `body0`, `eye4`, `armR2`, or `leg0`.
- `effect` additionally generates `effectOff`, which removes the whole group.
- No `bodyOff`, other off token, or character-specific alias is generated.

## Rendering boundary

Folder boundaries may use normal or pass-through blending. Boundary clipping, masks, vector masks, effects, and other blend
modes are rejected because they cannot be reproduced safely after the folder is split into independent sprites. Opacity,
blend modes, masks and supported effects inside a leaf are rasterized into that leaf. Recoverable uncommon CSP/PSD content
is reported as a warning; inability to obtain non-empty pixels is an error.

Every generated leaf uses `sprite.pixelsPerUnit = 1` and
`localTransform.scale = { x: 1, y: 1, z: 1 }`. One source texel is therefore one character-local unit. The tool and project
validators require a finite, positive, square, pack-wide source-pixel scale.

`stageScale` is `referenceStageHeight / canvasHeight`. The single character anchor is
`[canvasWidth / 2, canvasHeight - body0AlphaBottom + anchorBottomOffset]`. Other body variants retain their authored
canvas coordinates; they are not normalized against `body/0`. There is no union-bounds fallback: invalid `body/0` pixels
reject the run.

## Fixing a rejected run

Open `workspace/outputs/<character>/<run-id>/reports/validation.json`. Failed runs retain the archived source hash,
manifest, and any CSP/PSD reports produced before rejection, but contain no partial `character/` directory. Fix the CSP and
build again; immutable run JSON and PNG files must not be edited in place.
