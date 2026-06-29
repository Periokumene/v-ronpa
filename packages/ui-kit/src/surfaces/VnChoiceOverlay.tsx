import type { StoryChoiceOption } from "@v-ronpa/contracts";
import type { CSSProperties } from "react";
import { RichTextRenderer } from "./RichTextRenderer";
import { VN_UI_LAYER_Z_INDEX } from "./vnLayers";

export interface VnChoiceOverlayProps {
  choices: StoryChoiceOption[];
  onChoice?: (index: number, choice: StoryChoiceOption) => void;
}

export function VnChoiceOverlay({ choices, onChoice }: VnChoiceOverlayProps) {
  if (choices.length === 0) return null;

  function selectChoice(index: number) {
    const choice = choices[index];
    if (!choice || choice.enabled === false) return;
    onChoice?.(index, choice);
  }

  return (
    <section aria-label="对话选项" data-testid="vn-choice-overlay" role="group" style={overlayStyle}>
      <div style={choiceListStyle}>
        {choices.map((choice, index) => (
          <button
            aria-disabled={choice.enabled === false}
            data-testid={`vn-choice-${index}`}
            disabled={choice.enabled === false}
            key={`${choice.id ?? choice.text}-${index}`}
            onClick={() => selectChoice(index)}
            style={choice.enabled === false ? disabledChoiceButtonStyle : choiceButtonStyle}
            type="button"
          >
            <RichTextRenderer document={choice.richText} fallbackText={choice.text} />
          </button>
        ))}
      </div>
    </section>
  );
}

const overlayStyle: CSSProperties = {
  position: "absolute",
  zIndex: VN_UI_LAYER_Z_INDEX.choiceOverlay,
  inset: 0,
  display: "grid",
  placeItems: "center",
  padding: "clamp(20px, 6vw, 80px)",
  pointerEvents: "none"
};

const choiceListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  width: "min(620px, 100%)",
  maxHeight: "min(560px, 70vh)",
  overflowY: "auto",
  pointerEvents: "auto"
};

const choiceButtonStyle: CSSProperties = {
  minHeight: 44,
  padding: "10px 14px",
  border: "1px solid rgba(110, 231, 216, 0.5)",
  borderRadius: 6,
  background: "rgba(22, 34, 45, 0.9)",
  boxShadow: "0 14px 36px rgba(0, 0, 0, 0.28)",
  color: "#f7fbff",
  textAlign: "left",
  whiteSpace: "pre-wrap"
};

const disabledChoiceButtonStyle: CSSProperties = {
  ...choiceButtonStyle,
  cursor: "not-allowed",
  opacity: 0.52
};
