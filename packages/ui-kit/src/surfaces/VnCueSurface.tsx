import type { RichTextDocument } from "@v-ronpa/contracts";
import type { CSSProperties } from "react";
import { RichTextRenderer } from "./RichTextRenderer";
import type { UiSurfacePresentationLike } from "./types";
import type { VnStoryTextDisplaySettings } from "./VnDialogSurface";
import { VN_UI_LAYER_Z_INDEX } from "./vnLayers";

export interface VnCueSurfaceProps {
  author?: string;
  text: string;
  richText?: RichTextDocument;
  displaySettings?: VnStoryTextDisplaySettings;
  presentation?: UiSurfacePresentationLike;
}

export function VnCueSurface({
  author,
  text,
  richText,
  displaySettings,
  presentation
}: VnCueSurfaceProps) {
  const textSize = displaySettings?.textSize ?? "medium";
  return (
    <section
      aria-label={author ? `演出文本：${author}` : "演出文本"}
      data-author={author}
      data-text-size={textSize}
      data-text-speed={String(displaySettings?.textSpeed ?? 0.5)}
      data-ui-phase={presentation?.phase ?? "shown"}
      data-testid="vn-cue-surface"
      role="region"
      style={{ ...rootStyle, opacity: clamp(presentation?.opacity ?? 1, 0, 1) }}
    >
      <p aria-live="polite" data-testid="vn-cue-text" style={cueTextStyle(textSize)}>
        <RichTextRenderer document={richText} fallbackText={text} />
      </p>
    </section>
  );
}

const rootStyle: CSSProperties = {
  position: "absolute",
  zIndex: VN_UI_LAYER_Z_INDEX.storyTextDisplay,
  inset: "clamp(56px, 10vh, 120px) clamp(28px, 9vw, 144px)",
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
  border: 0,
  background: "none",
  boxShadow: "none",
  pointerEvents: "none"
};

const textStyle: CSSProperties = {
  width: "min(100%, 960px)",
  maxHeight: "100%",
  margin: 0,
  overflow: "hidden",
  color: "#f7fbff",
  fontWeight: 600,
  lineHeight: 1.65,
  textAlign: "center",
  textShadow: "0 2px 8px rgba(0, 0, 0, 0.85)",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere"
};

function cueTextStyle(textSize: VnStoryTextDisplaySettings["textSize"]): CSSProperties {
  return {
    ...textStyle,
    fontSize: textSize === "small" ? 22 : textSize === "large" ? 32 : 26
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
