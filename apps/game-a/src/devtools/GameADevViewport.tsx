import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  resolveGameADevViewportLayout,
  type GameADevViewportMode,
  type GameADevViewportSize
} from "./gameADevViewportLayout";
import "./GameADevViewport.css";

export function GameADevViewport({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<GameADevViewportMode>("fidelity");
  const [browserSize, setBrowserSize] = useState(readBrowserSize);
  const [cellSize, setCellSize] = useState(readBrowserSize);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const measure = () => {
      const nextBrowserSize = readBrowserSize();
      const nextCellSize = { width: frame.clientWidth, height: frame.clientHeight };
      setBrowserSize((current) => sameSize(current, nextBrowserSize) ? current : nextBrowserSize);
      setCellSize((current) => sameSize(current, nextCellSize) ? current : nextCellSize);
    };
    measure();

    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(frame);
    globalThis.addEventListener?.("resize", measure);
    return () => {
      observer?.disconnect();
      globalThis.removeEventListener?.("resize", measure);
    };
  }, []);

  const layout = useMemo(
    () => resolveGameADevViewportLayout({ browser: browserSize, cell: cellSize, mode }),
    [browserSize, cellSize, mode]
  );
  const stageStyle = {
    width: `${layout.logicalWidth}px`,
    height: `${layout.logicalHeight}px`,
    transform: `translate3d(${layout.offsetX}px, ${layout.offsetY}px, 0) scale(${layout.scale})`
  } satisfies CSSProperties;

  return (
    <div
      className="game-a-dev-viewport"
      data-display-scale={layout.scale.toFixed(6)}
      data-logical-height={Math.round(layout.logicalHeight)}
      data-logical-width={Math.round(layout.logicalWidth)}
      data-mode={mode}
      data-testid="game-a-dev-viewport"
      ref={frameRef}
    >
      <div className="game-a-dev-viewport-stage" data-testid="game-a-dev-viewport-stage" style={stageStyle}>
        {children}
      </div>
      <div
        aria-label="Game preview layout"
        className="game-a-dev-viewport-toolbar"
        data-testid="game-a-dev-viewport-toolbar"
        role="group"
      >
        <button
          aria-pressed={mode === "fidelity"}
          data-testid="game-a-dev-viewport-fidelity"
          onClick={() => setMode("fidelity")}
          type="button"
        >
          Fidelity
        </button>
        <button
          aria-pressed={mode === "responsive"}
          data-testid="game-a-dev-viewport-responsive"
          onClick={() => setMode("responsive")}
          type="button"
        >
          Responsive
        </button>
        <span aria-live="polite">
          {Math.round(layout.logicalWidth)}×{Math.round(layout.logicalHeight)} · {Math.round(layout.scale * 100)}%
        </span>
      </div>
    </div>
  );
}

function readBrowserSize(): GameADevViewportSize {
  if (typeof window === "undefined") return { width: 1, height: 1 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function sameSize(left: GameADevViewportSize, right: GameADevViewportSize): boolean {
  return left.width === right.width && left.height === right.height;
}
