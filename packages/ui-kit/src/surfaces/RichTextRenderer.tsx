import type { CSSProperties, ReactNode } from "react";
import type { RichTextDocument, RichTextRunStyle } from "@v-ronpa/contracts";

export interface RichTextRendererProps {
  document?: RichTextDocument | undefined;
  fallbackText: string;
}

interface RichTextBoundary {
  index: number;
  start: RichTextRunStyle[];
  end: RichTextRunStyle[];
}

export function RichTextRenderer({ document, fallbackText }: RichTextRendererProps) {
  if (!document || document.runs.length === 0) return <>{fallbackText}</>;
  return <>{renderRichTextDocument(document)}</>;
}

export function richTextFontCssVariableName(fontFaceId: string): string {
  return `--v-ronpa-rich-font-${fontFaceId.replace(/[^a-zA-Z0-9_-]/gu, "_")}`;
}

export function richTextFontFamilyValue(fontFaceId: string): string {
  return `var(${richTextFontCssVariableName(fontFaceId)}, inherit)`;
}

function renderRichTextDocument(document: RichTextDocument): ReactNode[] {
  const units = Array.from(document.text);
  const boundaries = collectBoundaries(document);
  const nodes: ReactNode[] = [];
  const active: RichTextRunStyle[] = [];
  let cursor = 0;
  let key = 0;

  for (const boundary of boundaries) {
    if (boundary.index > cursor) {
      nodes.push(renderTextSlice(units.slice(cursor, boundary.index).join(""), active, key++));
    }
    for (const ending of boundary.end) removeActiveStyle(active, ending);
    active.push(...boundary.start);
    cursor = boundary.index;
  }

  if (cursor < units.length) nodes.push(renderTextSlice(units.slice(cursor).join(""), active, key++));
  return nodes;
}

function collectBoundaries(document: RichTextDocument): RichTextBoundary[] {
  const byIndex = new Map<number, RichTextBoundary>();
  function boundary(index: number): RichTextBoundary {
    const current = byIndex.get(index);
    if (current) return current;
    const next = { index, start: [], end: [] };
    byIndex.set(index, next);
    return next;
  }
  for (const run of document.runs) {
    boundary(run.start).start.push(run.style);
    boundary(run.end).end.push(run.style);
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

function removeActiveStyle(active: RichTextRunStyle[], style: RichTextRunStyle): void {
  const index = active.indexOf(style);
  if (index >= 0) active.splice(index, 1);
}

function renderTextSlice(text: string, active: RichTextRunStyle[], key: number): ReactNode {
  if (active.length === 0) return text;
  return (
    <span data-rich-text-run="" key={key} style={mergeStyles(active)}>
      {text}
    </span>
  );
}

function mergeStyles(styles: RichTextRunStyle[]): CSSProperties {
  const merged: CSSProperties = {};
  for (const style of styles) {
    if (style.bold) merged.fontWeight = 700;
    if (style.italic) merged.fontStyle = "italic";
    if (style.underline) merged.textDecoration = appendTextDecoration(merged.textDecoration, "underline");
    if (style.strike) merged.textDecoration = appendTextDecoration(merged.textDecoration, "line-through");
    if (style.color) merged.color = style.color;
    if (style.markColor) merged.backgroundColor = style.markColor === "default" ? "rgba(255, 209, 102, 0.34)" : style.markColor;
    if (style.sizeScale) merged.fontSize = `${Math.round(style.sizeScale * 100)}%`;
    if (style.fontFaceId) merged.fontFamily = richTextFontFamilyValue(style.fontFaceId);
    if (style.verticalAlign) {
      merged.verticalAlign = style.verticalAlign;
      merged.fontSize = merged.fontSize ?? "75%";
    }
  }
  return merged;
}

function appendTextDecoration(current: CSSProperties["textDecoration"], value: string): string {
  const parts = new Set(String(current ?? "").split(/\s+/u).filter(Boolean));
  parts.add(value);
  return [...parts].join(" ");
}
