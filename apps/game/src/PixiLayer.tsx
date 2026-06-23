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
      data-pixi-background={snapshot.backgroundsById.MainBackground?.appearance ?? snapshot.background?.backgroundId ?? "none"}
      data-pixi-revision={String(snapshot.revision)}
      data-pixi-actors={formatPixiStageActors(snapshot)}
      data-pixi-animate={String(animate)}
      data-pixi-hints={formatPixiHints(hints)}
      data-pixi-hint-sequence={String(hintSequence)}
      data-pixi-slots={formatPixiStageSlots(snapshot)}
      className={visible ? "pixi-layer" : "pixi-layer pixi-layer-hidden"}
      aria-hidden={!visible}
    />
  );
}

function formatPixiHints(hints: PixiStageRenderHint[]): string {
  return hints.length > 0 ? hints.map((hint) => hint.type).join(",") : "empty";
}

function formatPixiStageActors(snapshot: PixiStageSnapshot): string {
  const entries = [...Object.values(snapshot.backgroundsById), ...Object.values(snapshot.charactersById)].map((actor) => {
    const visibility = actor.visible ? "visible" : "hidden";
    const pos = actor.pos ? `@${actor.pos[0].toFixed(2)},${actor.pos[1].toFixed(2)}` : "";
    return `${actor.id}:${visibility}${pos}`;
  });
  return entries.length > 0 ? entries.join(", ") : "empty";
}

function formatPixiStageSlots(snapshot: PixiStageSnapshot): string {
  const entries = (["left", "center", "right"] as const).flatMap((slot) => {
    const portrait = snapshot.slots[slot];
    if (!portrait) return [];
    return [`${slot}:${portrait.characterId}${portrait.portraitId ? `/${portrait.portraitId}` : ""}`];
  });
  return entries.length > 0 ? entries.join(", ") : "empty";
}
