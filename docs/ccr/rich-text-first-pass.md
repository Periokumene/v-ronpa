# Contract Change Request

## Requested Change

Add a serializable first-pass rich text document contract for dialogue-facing
text, plus manifest-declared font assets for `<font face='font:...'>`.

## Affected Packages

- `packages/contracts`
- `packages/nani-parser`
- `packages/nani-runtime-compiler`
- `packages/story-engine`
- `packages/asset-registry`
- `packages/ui-kit`
- `apps/game`

## Why Existing Contract Is Insufficient

The previous text path stored only plain strings plus an early `@format`
experiment under `StoryTextState.formats`. That shape could not represent
inline emphasis, color, size, font face, superscript/subscript, or per-choice
rich text without forcing downstream renderers to re-parse script markup or
store React/CSS runtime state in saves.

## Proposed Shape

`RichTextDocument` is added as:

```ts
{
  text: string;
  runs: Array<{
    start: number;
    end: number;
    style: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      strike?: boolean;
      color?: string;
      markColor?: string;
      sizeScale?: number;
      fontId?: string;
      verticalAlign?: "sub" | "sup";
    };
  }>;
}
```

`RuntimeCommand` gains optional top-level `richText`; `params.text` remains the
plain string. `StoryTextState.current`, `StoryBacklogEntry`, and
`StoryChoiceOption` gain optional `richText`. Saves remain naturally compatible
because the new fields are optional and no DOM, React, CSSProperties, reveal
state, or font load state is persisted.

Whenever a `richText` snapshot appears beside a plain `text` field, the
snapshot's `richText.text` must match that plain string. This keeps saves and
runtime commands self-consistent and prevents downstream renderers from
re-parsing script markup or repairing mismatched text/range state.

`RuntimeAssetKind` gains `font`, `RuntimeAssetFormat` gains `woff`, `woff2`,
`ttf`, and `otf`, and `ContentManifest` gains:

```ts
fonts: Array<{
  id: string;
  family: string;
  sourceRef: string;
  weight?: string;
  style?: "normal" | "italic" | "oblique";
}>;
```

`sourceRef` must resolve to a runtime asset of kind `font`. Rich text runs store
only `fontId`; app composition emits controlled `@font-face` CSS.

`StoryTextState.formats` and StoryEngine `@format` state writes are removed.
The Naninovel `format` command stays catalog-declared but is no longer part of
the first-pass rich text execution path.

## Fixtures And Tests

- Contract tests cover `RichTextDocument`, optional save fields, font asset
  kinds/formats, and manifest font declarations.
- Parser/compiler tests cover supported first-pass tags, entities, nesting,
  invalid tags or unsupported attributes as visible source text with
  diagnostics, and dialogue/print/append/choice/toast output.
- Story tests cover current text, backlog, append offsetting, and choices.
- UI/app tests cover shared rendering for dialogue, choices, toast, Backlog,
  font fallback diagnostics, and reveal clipping.
- The vertical-slice harness adds a rich text branch covering color, size,
  font face, newline, choice, toast, and Backlog paths.

## Rebase Impact

Branches touching `RuntimeCommand`, story snapshots, save parsing, Content
Manifest validation, command catalog expectations, or text UI surfaces must
rebase. Work that still reads or writes `StoryTextState.formats` must migrate
to `RichTextDocument` or leave formatting out of scope.
