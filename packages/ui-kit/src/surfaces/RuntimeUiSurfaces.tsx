import { useState, type CSSProperties, type FormEvent } from "react";

export interface RuntimeToastView {
  id: string;
  text: string;
}

export interface RuntimeToastLayerProps {
  visible?: boolean;
  toasts: RuntimeToastView[];
  onDismiss?: (toastId: string) => void;
}

export function RuntimeToastLayer({ onDismiss, toasts, visible = true }: RuntimeToastLayerProps) {
  if (!visible || toasts.length === 0) return null;
  return (
    <div aria-live="polite" data-testid="runtime-toast-layer" style={toastLayerStyle}>
      {toasts.map((toast) => (
        <button data-testid="runtime-toast" key={toast.id} onClick={() => onDismiss?.(toast.id)} style={toastStyle} type="button">
          {toast.text}
        </button>
      ))}
    </div>
  );
}

export interface RuntimeInputPromptProps {
  defaultValue?: string | number | boolean;
  summary?: string;
  valueType: "string" | "number" | "boolean";
  variableName: string;
  onSubmit: (value: string | number | boolean) => void;
}

export function RuntimeInputPromptSurface({
  defaultValue,
  onSubmit,
  summary,
  valueType,
  variableName
}: RuntimeInputPromptProps) {
  const [value, setValue] = useState(defaultValue === undefined ? "" : String(defaultValue));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(value);
  }

  return (
    <form aria-label="Runtime input prompt" data-testid="runtime-input-prompt" onSubmit={submit} style={promptStyle}>
      <label style={promptLabelStyle}>
        <span>{summary ?? variableName}</span>
        <input
          data-testid="runtime-input-field"
          onChange={(event) => setValue(event.currentTarget.value)}
          style={promptInputStyle}
          type={valueType === "number" ? "number" : "text"}
          value={value}
        />
      </label>
      <button data-testid="runtime-input-submit" style={promptButtonStyle} type="submit">
        OK
      </button>
    </form>
  );
}

export interface RuntimeMovieOverlayProps {
  blocking: boolean;
  sourceRef: string;
  uri?: string;
  onEnded?: () => void;
  onSkip?: () => void;
  onVideoElement?: (element: HTMLVideoElement | null) => void;
}

export function RuntimeMovieOverlaySurface({
  blocking,
  onEnded,
  onSkip,
  onVideoElement,
  sourceRef,
  uri
}: RuntimeMovieOverlayProps) {
  return (
    <section aria-label="Runtime movie overlay" data-testid="runtime-movie-overlay" style={movieOverlayStyle}>
      {uri ? (
        <video
          controls
          data-testid="runtime-movie-video"
          key={uri}
          onEnded={onEnded}
          ref={onVideoElement}
          style={movieVideoStyle}
        />
      ) : (
        <div data-testid="runtime-movie-missing" style={movieMissingStyle}>{sourceRef}</div>
      )}
      {blocking ? (
        <button data-testid="runtime-movie-skip" onClick={onSkip} style={movieSkipStyle} type="button">
          Skip
        </button>
      ) : null}
    </section>
  );
}

const toastLayerStyle: CSSProperties = {
  position: "absolute",
  zIndex: 10,
  top: 24,
  right: 24,
  display: "grid",
  gap: 8,
  pointerEvents: "auto"
};

const toastStyle: CSSProperties = {
  maxWidth: 320,
  padding: "10px 12px",
  border: "1px solid rgba(110, 231, 216, 0.42)",
  borderRadius: 6,
  background: "rgba(14, 22, 32, 0.92)",
  color: "#f7fbff",
  textAlign: "left"
};

const promptStyle: CSSProperties = {
  position: "absolute",
  zIndex: 11,
  left: "50%",
  top: "50%",
  display: "flex",
  alignItems: "end",
  gap: 10,
  width: "min(520px, calc(100vw - 32px))",
  padding: 14,
  border: "1px solid rgba(255, 209, 102, 0.48)",
  borderRadius: 8,
  background: "rgba(12, 18, 28, 0.96)",
  boxShadow: "0 18px 48px rgba(0,0,0,0.4)",
  color: "#f7fbff",
  transform: "translate(-50%, -50%)"
};

const promptLabelStyle: CSSProperties = {
  display: "grid",
  flex: 1,
  gap: 6,
  fontSize: 13
};

const promptInputStyle: CSSProperties = {
  minWidth: 0,
  padding: "9px 10px",
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 6,
  background: "rgba(255,255,255,0.08)",
  color: "#fff"
};

const promptButtonStyle: CSSProperties = {
  padding: "9px 14px",
  border: 0,
  borderRadius: 6,
  background: "#ffd166",
  color: "#10151f",
  fontWeight: 700
};

const movieOverlayStyle: CSSProperties = {
  position: "absolute",
  zIndex: 9,
  inset: 0,
  display: "grid",
  placeItems: "center",
  background: "rgba(0, 0, 0, 0.76)",
  pointerEvents: "auto"
};

const movieVideoStyle: CSSProperties = {
  width: "min(960px, 92vw)",
  maxHeight: "78vh",
  background: "#000"
};

const movieMissingStyle: CSSProperties = {
  padding: 16,
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 8,
  color: "#fff"
};

const movieSkipStyle: CSSProperties = {
  position: "absolute",
  right: 24,
  bottom: 24,
  padding: "9px 12px",
  border: "1px solid rgba(255,255,255,0.22)",
  borderRadius: 6,
  background: "rgba(255,255,255,0.1)",
  color: "#fff"
};
