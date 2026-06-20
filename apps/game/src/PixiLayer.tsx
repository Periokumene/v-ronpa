import { useEffect, useRef } from "react";
import type { PixiStageSnapshot } from "@v-ronpa/contracts";
import { createPixiPresenter, type PixiPresenterPort, type PixiStageRenderHint } from "@v-ronpa/pixi-presenter";

export function PixiLayer({
  animate,
  hints,
  hintSequence,
  snapshot,
  visible
}: {
  animate: boolean;
  hints: PixiStageRenderHint[];
  hintSequence: number;
  snapshot: PixiStageSnapshot;
  visible: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const presenterRef = useRef<PixiPresenterPort | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const presenter = createPixiPresenter({ host });
    presenterRef.current = presenter;
    void presenter.mount();
    return () => {
      presenter.destroy();
      presenterRef.current = null;
    };
  }, []);

  useEffect(() => {
    const presenter = presenterRef.current;
    if (!presenter) return;
    presenter.reconcile(snapshot, { animate, hints });
  }, [animate, hintSequence, hints, snapshot]);

  return (
    <div
      ref={hostRef}
      data-testid="pixi-layer"
      data-pixi-background={snapshot.background?.backgroundId ?? "none"}
      data-pixi-revision={String(snapshot.revision)}
      data-pixi-slots={formatPixiStageSlots(snapshot)}
      className={visible ? "pixi-layer" : "pixi-layer pixi-layer-hidden"}
      aria-hidden={!visible}
    />
  );
}

function formatPixiStageSlots(snapshot: PixiStageSnapshot): string {
  const entries = (["left", "center", "right"] as const).flatMap((slot) => {
    const portrait = snapshot.slots[slot];
    if (!portrait) return [];
    return [`${slot}:${portrait.characterId}${portrait.portraitId ? `/${portrait.portraitId}` : ""}`];
  });
  return entries.length > 0 ? entries.join(", ") : "empty";
}
