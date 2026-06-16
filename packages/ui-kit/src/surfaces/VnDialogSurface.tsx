import type { StoryChoiceOption } from "@v-ronpa/contracts";
import { useId } from "react";
import type { CSSProperties, KeyboardEvent } from "react";

export interface VnDialogSurfaceProps {
  speaker?: string;
  text: string;
  choices?: StoryChoiceOption[];
  ended?: boolean;
  onAdvance?: () => void;
  onAdvanceBlocked?: (reason: "ended") => void;
  onChoice?: (index: number, choice: StoryChoiceOption) => void;
  onCancel?: () => void;
}

export function VnDialogSurface({
  speaker,
  text,
  choices = [],
  ended = false,
  onAdvance,
  onAdvanceBlocked,
  onChoice,
  onCancel
}: VnDialogSurfaceProps) {
  const hasChoices = !ended && choices.length > 0;
  const state = ended ? "ended" : hasChoices ? "choices" : "line";
  const speakerLabel = speaker ?? "Narrator";
  const speakerId = useId();
  const textId = useId();

  function selectChoice(index: number) {
    const choice = choices[index];
    if (!choice) return;

    onChoice?.(index, choice);
  }

  function handleAdvance() {
    if (ended) {
      onAdvanceBlocked?.("ended");
      return;
    }

    if (!hasChoices) {
      onAdvance?.();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel?.();
      return;
    }

    if (event.key !== "Enter" || event.currentTarget !== event.target) return;

    // Root-level Enter/Escape mirrors harness input locks without replacing native button behavior.
    event.preventDefault();

    if (ended) {
      onAdvanceBlocked?.("ended");
      return;
    }

    if (hasChoices) {
      selectChoice(0);
      return;
    }

    onAdvance?.();
  }

  return (
    <section
      aria-describedby={textId}
      aria-label="Visual novel dialog"
      aria-labelledby={speakerId}
      aria-keyshortcuts="Enter Escape"
      data-state={state}
      data-testid="vn-dialog-surface"
      onKeyDown={handleKeyDown}
      role="region"
      style={rootStyle}
      tabIndex={0}
    >
      <div style={headerStyle}>
        <div data-testid="vn-dialog-speaker" id={speakerId} style={speakerStyle}>
          {speakerLabel}
        </div>
        <div aria-live="polite" data-testid="vn-dialog-state" style={stateStyle}>
          {ended ? "Ended" : hasChoices ? "Choice pending" : "Ready"}
        </div>
      </div>

      <p data-testid="vn-dialog-text" id={textId} style={textStyle}>
        {text}
      </p>

      {hasChoices && (
        <div aria-label="Dialog choices" data-testid="vn-dialog-choices" role="group" style={choiceListStyle}>
          {choices.map((choice, index) => (
            <button
              data-testid={`vn-dialog-choice-${index}`}
              key={`${choice.text}-${index}`}
              onClick={() => selectChoice(index)}
              style={choiceButtonStyle}
              type="button"
            >
              {choice.text}
            </button>
          ))}
        </div>
      )}

      {ended && (
        <div aria-live="polite" data-testid="vn-dialog-ended" role="status" style={endedStyle}>
          Story segment ended. Advance is blocked.
        </div>
      )}

      <div style={controlRowStyle}>
        <button
          aria-disabled={ended || hasChoices}
          data-testid="vn-dialog-advance"
          disabled={ended || hasChoices}
          onClick={handleAdvance}
          style={ended || hasChoices ? disabledButtonStyle : controlButtonStyle}
          type="button"
        >
          Advance
        </button>
        <button data-testid="vn-dialog-cancel" onClick={onCancel} style={controlButtonStyle} type="button">
          Cancel
        </button>
      </div>
    </section>
  );
}

const rootStyle: CSSProperties = {
  position: "absolute",
  zIndex: 7,
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
  backdropFilter: "blur(12px)"
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12
};

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

const textStyle: CSSProperties = {
  maxWidth: 940,
  margin: 0,
  color: "#f7fbff",
  fontSize: 16,
  lineHeight: 1.55
};

const choiceListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 2
};

const controlRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 2
};

const controlButtonStyle: CSSProperties = {
  borderRadius: 6
};

const choiceButtonStyle: CSSProperties = {
  ...controlButtonStyle,
  borderColor: "rgba(110, 231, 216, 0.42)",
  background: "rgba(22, 34, 45, 0.86)"
};

const disabledButtonStyle: CSSProperties = {
  ...controlButtonStyle,
  cursor: "not-allowed",
  opacity: 0.52
};

const endedStyle: CSSProperties = {
  width: "fit-content",
  padding: "4px 8px",
  border: "1px solid rgba(255, 92, 138, 0.42)",
  borderRadius: 6,
  color: "#ffb3c7",
  fontSize: 13
};
