import { useEffect, useRef } from "react";
import { PIXI_INNER_BACKGROUND_ID, PIXI_MAIN_BACKGROUND_ID, type PixiStageSnapshot } from "@v-ronpa/contracts";
import {
  createPixiPresenter,
  type PixiAssetResolver,
  type PixiPresenterDiagnostic,
  type PixiPresentationTaskSnapshot,
  type PixiPresenterPort,
  type PixiStageRenderHint
} from "@v-ronpa/pixi-presenter";

export interface PixiLayerProps {
  // Render inputs.
  snapshot: PixiStageSnapshot;
  animate: boolean;
  hints: PixiStageRenderHint[];
  hintSequence: number;
  presentationTasks?: PixiPresentationTaskSnapshot[];

  // Host surface.
  visible: boolean;
  assetResolver?: PixiAssetResolver;

  // Render side effects.
  onDiagnostic?: (diagnostic: PixiPresenterDiagnostic) => void;
  onTasksChanged?: (tasks: PixiPresentationTaskSnapshot[]) => void;
}

export function PixiLayer({
  snapshot,
  animate,
  hints,
  hintSequence,
  presentationTasks = [],
  visible,
  assetResolver,
  onDiagnostic,
  onTasksChanged
}: PixiLayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const presenterRef = useRef<PixiPresenterPort | null>(null);
  const onTasksChangedRef = useRef<typeof onTasksChanged>(onTasksChanged);
  const onDiagnosticRef = useRef<typeof onDiagnostic>(onDiagnostic);

  useEffect(() => {
    onTasksChangedRef.current = onTasksChanged;
  }, [onTasksChanged]);

  useEffect(() => {
    onDiagnosticRef.current = onDiagnostic;
  }, [onDiagnostic]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const options = {
      host,
      ...(assetResolver ? { assetResolver } : {}),
      onDiagnostic: (diagnostic: PixiPresenterDiagnostic) => onDiagnosticRef.current?.(diagnostic),
      onTasksChanged: (tasks: PixiPresentationTaskSnapshot[]) => onTasksChangedRef.current?.(tasks)
    };
    const presenter = createPixiPresenter(options);
    presenterRef.current = presenter;
    void presenter.mount();
    return () => {
      presenter.destroy();
      presenterRef.current = null;
    };
  }, [assetResolver]);

  useEffect(() => {
    const presenter = presenterRef.current;
    if (!presenter) return;
    presenter.reconcile(snapshot, { animate, hints });
  }, [animate, hintSequence, hints, snapshot]);

  return (
    <div
      ref={hostRef}
      data-testid="pixi-layer"
      data-pixi-revision={String(snapshot.revision)}
      data-pixi-animate={String(animate)}
      data-pixi-background={snapshot.backgroundsById[PIXI_MAIN_BACKGROUND_ID]?.appearance ?? "none"}
      data-pixi-inner-background={snapshot.innerBackgroundsById[PIXI_INNER_BACKGROUND_ID]?.appearance ?? "none"}
      data-pixi-actors={formatPixiStageActors(snapshot)}
      data-pixi-characters={formatPixiStageCharacters(snapshot)}
      data-pixi-hints={formatPixiHints(hints)}
      data-pixi-hint-sequence={String(hintSequence)}
      data-pixi-active-tasks={formatPixiPresentationTasks(presentationTasks)}
      className={visible ? "pixi-layer" : "pixi-layer pixi-layer-hidden"}
      aria-hidden={!visible}
    />
  );
}

function formatPixiHints(hints: PixiStageRenderHint[]): string {
  return hints.length > 0 ? hints.map((hint) => hint.type).join(",") : "empty";
}

function formatPixiPresentationTasks(tasks: PixiPresentationTaskSnapshot[]): string {
  if (tasks.length === 0) return "empty";
  return tasks.map((task) => `${task.kind}:${task.target}:${task.status}:${task.durationMs}`).join(", ");
}

function formatPixiStageActors(snapshot: PixiStageSnapshot): string {
  const entries = [
    ...Object.values(snapshot.backgroundsById),
    ...Object.values(snapshot.innerBackgroundsById),
    ...Object.values(snapshot.charactersById)
  ].map((actor) => {
    const visibility = actor.visible ? "visible" : "hidden";
    const pos = actor.pos ? `@${actor.pos[0].toFixed(2)},${actor.pos[1].toFixed(2)}` : "";
    const appearance = actor.kind === "character" ? `/${actor.appearanceExpression || "default"}` : actor.appearance ? `/${actor.appearance}` : "";
    return `${actor.id}${appearance}:${visibility}${pos}`;
  });
  return entries.length > 0 ? entries.join(", ") : "empty";
}

function formatPixiStageCharacters(snapshot: PixiStageSnapshot): string {
  const entries = snapshot.actorOrder.flatMap((id) => {
    const actor = snapshot.charactersById[id];
    if (!actor) return [];
    const pos = actor.pos ? `@${actor.pos[0].toFixed(2)},${actor.pos[1].toFixed(2)}` : "";
    return [`${actor.id}/${actor.appearanceExpression || "default"}${pos}`];
  });
  return entries.length > 0 ? entries.join(", ") : "empty";
}
