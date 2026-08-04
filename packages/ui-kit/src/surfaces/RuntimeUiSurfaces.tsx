import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import type { RichTextDocument } from "@v-ronpa/contracts";
import { RichTextRenderer } from "./RichTextRenderer";
import type { UiSurfacePresentationLike } from "./types";

export interface RuntimeToastView {
  id: string;
  text: string;
  richText?: RichTextDocument;
}

export interface RuntimeToastLayerProps {
  visible?: boolean;
  toasts: RuntimeToastView[];
  onDismiss?: (toastId: string) => void;
  presentation?: UiSurfacePresentationLike;
}

export function RuntimeToastLayer({ onDismiss, presentation, toasts, visible = true }: RuntimeToastLayerProps) {
  if (!visible || toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      data-testid="runtime-toast-layer"
      data-ui-phase={presentation?.phase ?? "shown"}
      style={presentation ? { ...toastLayerStyle, opacity: presentation.opacity } : toastLayerStyle}
    >
      {toasts.map((toast) => (
        <button data-testid="runtime-toast" key={toast.id} onClick={() => onDismiss?.(toast.id)} style={toastStyle} type="button">
          <RichTextRenderer document={toast.richText} fallbackText={toast.text} />
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

export interface RuntimePinpSurfaceProps {
  alt: string;
  aspectRatio: [number, number];
  className?: string;
  frameStyle?: CSSProperties;
  heightPercent: number;
  positionPercent: [number, number];
  presentation: UiSurfacePresentationLike;
  revision: number;
  assetId: string;
  uri?: string;
}

export function RuntimePinpSurface({
  alt,
  aspectRatio,
  className,
  frameStyle,
  heightPercent,
  positionPercent,
  presentation,
  revision,
  assetId,
  uri
}: RuntimePinpSurfaceProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [revision, assetId, uri]);
  return <RuntimePinpFrame
    alt={alt}
    aspectRatio={aspectRatio}
    {...(className ? { className } : {})}
    {...(frameStyle ? { frameStyle } : {})}
    heightPercent={heightPercent}
    onImageError={() => setFailed(true)}
    positionPercent={positionPercent}
    presentation={presentation}
    revision={revision}
    assetId={assetId}
    unavailable={!uri || failed}
    {...(uri ? { uri } : {})}
  />;
}

export interface RuntimePinpFrameProps extends RuntimePinpSurfaceProps {
  onImageError(): void;
  unavailable: boolean;
}

export function RuntimePinpFrame({
  alt,
  aspectRatio,
  className,
  frameStyle,
  heightPercent,
  onImageError,
  positionPercent,
  presentation,
  revision,
  assetId,
  unavailable,
  uri
}: RuntimePinpFrameProps) {
  return (
    <figure
      className={className}
      data-pinp-asset-id={assetId}
      data-ui-phase={presentation.phase}
      data-testid="runtime-pinp-surface"
      style={{
        ...pinpFrameStyle,
        left: `${positionPercent[0]}%`,
        top: `${positionPercent[1]}%`,
        height: `${heightPercent}%`,
        aspectRatio: `${aspectRatio[0]} / ${aspectRatio[1]}`,
        opacity: presentation.opacity,
        ...frameStyle
      }}
    >
      {unavailable ? (
        <div
          aria-label={`图片加载失败：${alt || assetId}`}
          data-testid="runtime-pinp-missing"
          role="img"
          style={pinpMissingStyle}
        >
          <span>PINP IMAGE UNAVAILABLE</span>
          <code>{assetId}</code>
        </div>
      ) : (
        <img
          alt={alt}
          data-testid="runtime-pinp-image"
          draggable={false}
          key={`${assetId}:${revision}`}
          onError={onImageError}
          src={uri}
          style={pinpImageStyle}
        />
      )}
    </figure>
  );
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
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          data-testid="runtime-input-field"
          enterKeyHint="done"
          inputMode={valueType === "number" ? "decimal" : "text"}
          onChange={(event) => setValue(event.currentTarget.value)}
          spellCheck={false}
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
  assetId: string;
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
  assetId,
  uri
}: RuntimeMovieOverlayProps) {
  return (
    <section aria-label="Runtime movie overlay" data-testid="runtime-movie-overlay" style={movieOverlayStyle}>
      {uri ? (
        <video
          data-testid="runtime-movie-video"
          disablePictureInPicture
          disableRemotePlayback
          key={uri}
          onEnded={onEnded}
          playsInline
          ref={onVideoElement}
          style={movieVideoStyle}
        />
      ) : (
        <div data-testid="runtime-movie-missing" style={movieMissingStyle}>{assetId}</div>
      )}
      {blocking ? (
        <button data-testid="runtime-movie-skip" onClick={onSkip} style={movieSkipStyle} type="button">
          Skip
        </button>
      ) : null}
    </section>
  );
}

// Runtime surfaces are grouped by overlay scope. Style property order is:
// placement, sizing, layout, spacing, chrome, typography.

// Toast stack.
const toastLayerStyle: CSSProperties = {
  position: "absolute",
  zIndex: 10,
  top: 24,
  right: 24,
  display: "grid",
  gap: 8,
  pointerEvents: "auto"
};

const pinpFrameStyle: CSSProperties = {
  position: "absolute",
  zIndex: "var(--vn-pinp-z-index, 8)",
  boxSizing: "border-box",
  margin: 0,
  overflow: "hidden",
  border: "1px solid var(--vn-pinp-border, rgba(255,255,255,0.26))",
  borderRadius: 0,
  background: "var(--vn-pinp-background, rgba(0,0,0,0.18))",
  boxShadow: "var(--vn-pinp-shadow, 0 10px 28px rgba(0,0,0,0.24))",
  transform: "translate(-50%, -50%)",
  pointerEvents: "none"
};

const pinpImageStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  objectFit: "contain",
  userSelect: "none",
  pointerEvents: "none"
};

const pinpMissingStyle: CSSProperties = {
  display: "grid",
  placeContent: "center",
  gap: 6,
  width: "100%",
  height: "100%",
  padding: 10,
  overflow: "hidden",
  background: "rgba(12,16,22,0.82)",
  color: "rgba(255,255,255,0.78)",
  fontSize: 11,
  textAlign: "center"
};

const toastStyle: CSSProperties = {
  maxWidth: 320,
  padding: "10px 12px",
  border: "1px solid rgba(110, 231, 216, 0.42)",
  borderRadius: 6,
  background: "rgba(14, 22, 32, 0.92)",
  color: "#f7fbff",
  textAlign: "left",
  whiteSpace: "pre-wrap"
};

// Blocking input prompt.
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
  appearance: "none",
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  caretColor: "#ffd166",
  font: "inherit"
};

const promptButtonStyle: CSSProperties = {
  padding: "9px 14px",
  border: 0,
  borderRadius: 6,
  background: "#ffd166",
  color: "#10151f",
  fontWeight: 700
};

// Full-playfield movie render surface.
const movieOverlayStyle: CSSProperties = {
  position: "absolute",
  zIndex: 30,
  inset: 0,
  display: "grid",
  placeItems: "center",
  background: "#000",
  pointerEvents: "auto"
};

const movieVideoStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  background: "#000",
  objectFit: "contain"
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
