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

## Fixing a rejected run

Open `workspace/outputs/<character>/<run-id>/reports/validation.json`. The failed manifest records the exact archived input,
so corrections can be compared against the rejected source. Fix the CSP and build again; do not edit generated JSON or PNG
files in place because every run is immutable evidence.
