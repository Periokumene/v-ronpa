import { useEffect, useRef, useState } from "react";
import { PIXI_INNER_BACKGROUND_ID, PIXI_MAIN_BACKGROUND_ID, type PixiStageSnapshot } from "@v-ronpa/contracts";
import {
  createPixiPresenter,
  type PixiAssetResolver,
  type PixiPresenterDiagnostic,
  type PixiPresentationTaskSnapshot,
  type PixiPresenterPort,
  type LayeredCharacterPreloadPlan,
  type PixiThumbnailMime,
  type PixiThumbnailCaptureOptions,
  type PixiThumbnailCaptureResult,
  type PixiCharacterPreparationResult,
} from "@v-ronpa/pixi-presenter";
import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import type { PresentationTaskObservation } from "@v-ronpa/app-vn-runtime";

export interface PixiStageHandle {
  ready: Promise<void>;
  prepareCharacters(plan: LayeredCharacterPreloadPlan): Promise<PixiCharacterPreparationResult>;
  captureThumbnail<Mime extends PixiThumbnailMime = "image/webp">(
    options?: PixiThumbnailCaptureOptions<Mime>
  ): Promise<PixiThumbnailCaptureResult<Mime> | undefined>;
}

export interface PixiLayerProps {
  // Render inputs.
  snapshot: PixiStageSnapshot;
  animate: boolean;
  hints: PixiStageRenderHint[];
  hintSequence: number;
  observedTasks?: PresentationTaskObservation[];

  // Host surface.
  visible: boolean;
  characterOutlineEnabled: boolean;
  characterPreloadPlan: LayeredCharacterPreloadPlan;
  assetResolver?: PixiAssetResolver;

  // Render side effects.
  onDiagnostic?: (diagnostic: PixiPresenterDiagnostic) => void;
  onTasksChanged?: (tasks: PixiPresentationTaskSnapshot[]) => void;
  onStageHandleChanged?: (handle: PixiStageHandle | undefined) => void;
}

export function PixiLayer({
  snapshot,
  animate,
  hints,
  hintSequence,
  observedTasks = [],
  visible,
  characterOutlineEnabled,
  characterPreloadPlan,
  assetResolver,
  onDiagnostic,
  onStageHandleChanged,
  onTasksChanged
}: PixiLayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const presenterRef = useRef<PixiPresenterPort | null>(null);
  const [preparation, setPreparation] = useState<"preparing" | "ready">("preparing");
  const onTasksChangedRef = useRef<typeof onTasksChanged>(onTasksChanged);
  const onDiagnosticRef = useRef<typeof onDiagnostic>(onDiagnostic);
  const onStageHandleChangedRef = useRef<typeof onStageHandleChanged>(onStageHandleChanged);
  const initialCharacterPreloadPlanRef = useRef(characterPreloadPlan);

  useEffect(() => {
    onTasksChangedRef.current = onTasksChanged;
  }, [onTasksChanged]);

  useEffect(() => {
    onDiagnosticRef.current = onDiagnostic;
  }, [onDiagnostic]);

  useEffect(() => {
    onStageHandleChangedRef.current = onStageHandleChanged;
  }, [onStageHandleChanged]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const options = {
      host,
      active: visible,
      characterOutlineEnabled,
      characterPreloadPlan: initialCharacterPreloadPlanRef.current,
      ...(assetResolver ? { assetResolver } : {}),
      onDiagnostic: (diagnostic: PixiPresenterDiagnostic) => onDiagnosticRef.current?.(diagnostic),
      onTasksChanged: (tasks: PixiPresentationTaskSnapshot[]) => onTasksChangedRef.current?.(tasks)
    };
    const presenter = createPixiPresenter(options);
    presenterRef.current = presenter;
    setPreparation("preparing");
    const ready = presenter.mount();
    onStageHandleChangedRef.current?.({
      ready,
      prepareCharacters: (plan) => presenter.prepareCharacters(plan),
      captureThumbnail: (captureOptions) => presenter.captureThumbnail(captureOptions)
    });
    void ready.then(() => {
      if (presenterRef.current === presenter) setPreparation("ready");
    });
    return () => {
      onStageHandleChangedRef.current?.(undefined);
      presenter.destroy();
      presenterRef.current = null;
    };
  }, [assetResolver, characterOutlineEnabled]);

  useEffect(() => {
    presenterRef.current?.setActive(visible);
  }, [visible]);

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
      data-pixi-character-outline={characterOutlineEnabled ? "enabled" : "disabled"}
      data-pixi-character-preparation={preparation}
      data-pixi-rendering={visible ? "active" : "paused"}
      data-pixi-hints={formatPixiHints(hints)}
      data-pixi-hint-sequence={String(hintSequence)}
      data-pixi-active-tasks={formatPixiPresentationTasks(observedTasks)}
      className={visible ? "pixi-layer" : "pixi-layer pixi-layer-hidden"}
      aria-hidden={!visible}
    />
  );
}

function formatPixiHints(hints: PixiStageRenderHint[]): string {
  return hints.length > 0 ? hints.map((hint) => hint.type).join(",") : "empty";
}

function formatPixiPresentationTasks(tasks: PresentationTaskObservation[]): string {
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
