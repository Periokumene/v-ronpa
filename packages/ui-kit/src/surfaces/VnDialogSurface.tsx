import type { RichTextDocument } from "@v-ronpa/contracts";
import { useId } from "react";
import type { CSSProperties } from "react";
import { RichTextRenderer } from "./RichTextRenderer";
import type { UiSurfacePresentationLike } from "./types";
import { VN_UI_LAYER_Z_INDEX } from "./vnLayers";

export interface VnDialogDisplaySettings {
  textSize: "small" | "medium" | "large";
  textboxOpacity: number;
  textSpeed: number;
}

export interface VnDialogSurfaceProps {
  speaker?: string;
  text: string;
  richText?: RichTextDocument;
  displaySettings?: VnDialogDisplaySettings;
  presentation?: UiSurfacePresentationLike;
  state?: VnDialogState;
}

export type VnDialogState = "line" | "choices" | "ended";

const DEFAULT_DISPLAY_SETTINGS = {
  textSize: "medium",
  textboxOpacity: 0.84,
  textSpeed: 0.5
} as const satisfies VnDialogDisplaySettings;

const TEXTBOX_OPACITY_LIMITS = {
  primaryMin: 0.2,
  secondaryMin: 0.18,
  max: 1,
  secondaryMultiplier: 0.92
} as const;

const TEXT_SPEED_TRANSITION_MS = {
  max: 260,
  range: 180
} as const;

export function VnDialogSurface({
  speaker,
  text,
  richText,
  displaySettings,
  presentation,
  state = "line"
}: VnDialogSurfaceProps) {
  const speakerLabel = speaker ?? "旁白";
  const speakerId = useId();
  const textId = useId();
  const textSize = displaySettings?.textSize ?? DEFAULT_DISPLAY_SETTINGS.textSize;
  const textSpeed = displaySettings?.textSpeed ?? DEFAULT_DISPLAY_SETTINGS.textSpeed;
  const textboxOpacity = displaySettings?.textboxOpacity ?? DEFAULT_DISPLAY_SETTINGS.textboxOpacity;

  return (
    <section
      aria-describedby={textId}
      aria-label="视觉小说对话"
      aria-labelledby={speakerId}
      data-state={state}
      data-text-size={textSize}
      data-text-speed={String(textSpeed)}
      data-textbox-opacity={String(textboxOpacity)}
      data-ui-phase={presentation?.phase ?? "shown"}
      data-testid="vn-dialog-surface"
      role="region"
      style={dialogRootStyle(textboxOpacity, presentation?.opacity ?? 1)}
    >
      <div style={headerStyle}>
        <div data-testid="vn-dialog-speaker" id={speakerId} style={speakerStyle}>
          {speakerLabel}
        </div>
        <div aria-live="polite" data-testid="vn-dialog-state" style={stateStyle}>
          {state === "ended" ? "已结束" : state === "choices" ? "等待选择" : "阅读中"}
        </div>
      </div>

      <p data-testid="vn-dialog-text" id={textId} style={dialogTextStyle(textSize, textSpeed)}>
        <RichTextRenderer document={richText} fallbackText={text} />
      </p>

      {state === "ended" && (
        <div aria-live="polite" data-testid="vn-dialog-ended" role="status" style={endedStyle}>
          本段剧情已结束，无法继续推进。
        </div>
      )}
    </section>
  );
}

// Render parameters are grouped by surface scope. Within each style, values flow
// from placement to layout, then chrome, then text/effects.

// Dialog shell.
const rootStyle: CSSProperties = {
  position: "absolute",
  zIndex: VN_UI_LAYER_Z_INDEX.dialogDisplay,
  left: "clamp(20px, 7vw, 96px)",
  right: "clamp(20px, 7vw, 96px)",
  bottom: 28,
  display: "grid",
  gap: 10,
  minHeight: 132,
  padding: "14px 16px 12px",
  border: "1px solid rgba(255, 209, 102, 0.4)",
  borderRadius: 8,
  background: "linear-gradient(180deg, rgba(11, 16, 23, 0.91), rgba(13, 20, 31, 0.84))",
  boxShadow: "0 18px 42px rgba(0, 0, 0, 0.34)",
  color: "#edf7f8",
  backdropFilter: "blur(12px)",
  pointerEvents: "none"
};

function dialogRootStyle(textboxOpacity: number, opacity: number): CSSProperties {
  const primaryOpacity = clamp(textboxOpacity, TEXTBOX_OPACITY_LIMITS.primaryMin, TEXTBOX_OPACITY_LIMITS.max);
  const secondaryOpacity = clamp(
    textboxOpacity * TEXTBOX_OPACITY_LIMITS.secondaryMultiplier,
    TEXTBOX_OPACITY_LIMITS.secondaryMin,
    TEXTBOX_OPACITY_LIMITS.max
  );
  return {
    ...rootStyle,
    opacity: clamp(opacity, 0, 1),
    background: `linear-gradient(180deg, rgba(11, 16, 23, ${primaryOpacity}), rgba(13, 20, 31, ${secondaryOpacity}))`
  };
}

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12
};

// Dialog identity and state.
const speakerStyle: CSSProperties = {
  width: "fit-content",
  maxWidth: "min(48vw, 420px)",
  overflow: "hidden",
  padding: "4px 10px",
  border: "1px solid rgba(255, 209, 102, 0.45)",
  borderRadius: 6,
  color: "var(--gold, #ffd166)",
  fontSize: 14,
  fontWeight: 700,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};

const stateStyle: CSSProperties = {
  color: "var(--accent, #6ee7d8)",
  fontSize: 12,
  letterSpacing: 0,
  textTransform: "uppercase"
};

// Dialog text flow.
const textStyle: CSSProperties = {
  maxWidth: 940,
  margin: 0,
  color: "#f7fbff",
  fontSize: 16,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap"
};

function dialogTextStyle(textSize: VnDialogDisplaySettings["textSize"], textSpeed: number): CSSProperties {
  return {
    ...textStyle,
    fontSize: textSize === "small" ? 15 : textSize === "large" ? 18 : 16,
    transitionDuration: `${Math.round(TEXT_SPEED_TRANSITION_MS.max - clamp(textSpeed, 0, 1) * TEXT_SPEED_TRANSITION_MS.range)}ms`
  };
}

const endedStyle: CSSProperties = {
  width: "fit-content",
  padding: "4px 8px",
  border: "1px solid rgba(255, 92, 138, 0.42)",
  borderRadius: 6,
  color: "#ffb3c7",
  fontSize: 13
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
