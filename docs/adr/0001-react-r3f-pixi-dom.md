# ADR 0001: React + R3F + Pixi + DOM Presentation Split

## Status

Accepted

## Decision

Use React as the app shell. Use R3F for 3D scenes, Pixi for VN/trial 2D canvas
effects, and DOM/Radix/CSS Modules for text-heavy UI and accessibility-sensitive
controls.

## Rationale

The game combines 3D exploration, 2D visual-novel staging, and high-speed trial
overlays. A single renderer would either make text/UI too hard or make 2D
effects too weak. A port-based split keeps gameplay independent from renderer
choices.

## Consequences

- Presenters must implement stable ports.
- Harness smoke tests must inspect both DOM and canvas layers.
- Future engine replacement targets adapter packages rather than core logic.
