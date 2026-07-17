import type { VnDiagnosticsPort, VnPresentationPort, PresentationTaskObservation } from "@v-ronpa/app-vn-runtime";
import type { PixiAssetResolver, PixiPresentationTaskSnapshot } from "@v-ronpa/pixi-presenter";
import { PixiLayer, type PixiStageCaptureHandle } from "./PixiLayer";

export interface VnPixiPresenterHostProps {
  active: boolean;
  characterOutlineEnabled: boolean;
  presentation: VnPresentationPort;
  diagnostics?: VnDiagnosticsPort;
  assetResolver?: PixiAssetResolver;
  onCaptureHandleChanged?: (handle: PixiStageCaptureHandle | undefined) => void;
}

/**
 * The only React bridge between the headless VN presentation port and Pixi.
 * Renderer task snapshots are narrowed to observations before they leave this host.
 */
export function VnPixiPresenterHost({
  active,
  assetResolver,
  characterOutlineEnabled,
  diagnostics,
  onCaptureHandleChanged,
  presentation
}: VnPixiPresenterHostProps) {
  const stage = presentation.pixiStageRuntime;
  return (
    <PixiLayer
      key={presentation.storySession}
      animate={stage.animate}
      characterOutlineEnabled={characterOutlineEnabled}
      {...(assetResolver ? { assetResolver } : {})}
      hintSequence={stage.hintSequence}
      hints={stage.hints}
      observedTasks={stage.presentationTasks}
      {...(diagnostics ? { onDiagnostic: diagnostics.observeAssetDiagnostic } : {})}
      {...(onCaptureHandleChanged ? { onCaptureHandleChanged } : {})}
      onTasksChanged={(tasks) => presentation.updatePixiPresentationTasks(tasks.map(toTaskObservation))}
      snapshot={stage.snapshot}
      visible={active}
    />
  );
}

function toTaskObservation(task: PixiPresentationTaskSnapshot): PresentationTaskObservation {
  return {
    kind: task.kind,
    target: task.target,
    revision: task.revision,
    status: task.status,
    durationMs: task.durationMs
  };
}
