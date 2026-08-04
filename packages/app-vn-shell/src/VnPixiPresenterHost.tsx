import type { VnDiagnosticsPort, VnPresentationPort, PresentationTaskObservation } from "@v-ronpa/app-vn-runtime";
import type { PixiAssetResolver, PixiPresentationTaskSnapshot } from "@v-ronpa/pixi-presenter";
import { PixiLayer, type PixiStageHandle, type VnPixiCharacterPreparationPlan } from "./PixiLayer";
import type { AssetId } from "@v-ronpa/contracts";

export interface VnPixiPresenterHostProps {
  active: boolean;
  characterOutlineEnabled: boolean;
  characterPreloadPlan: VnPixiCharacterPreparationPlan;
  characterAssetIdByCharacterId: Readonly<Record<string, AssetId>>;
  presentation: VnPresentationPort;
  diagnostics?: VnDiagnosticsPort;
  assetResolver?: PixiAssetResolver;
  onStageHandleChanged?: (handle: PixiStageHandle | undefined) => void;
}

/**
 * The only React bridge between the headless VN presentation port and Pixi.
 * Renderer task snapshots are narrowed to observations before they leave this host.
 */
export function VnPixiPresenterHost({
  active,
  assetResolver,
  characterOutlineEnabled,
  characterPreloadPlan,
  characterAssetIdByCharacterId,
  diagnostics,
  onStageHandleChanged,
  presentation
}: VnPixiPresenterHostProps) {
  const stage = presentation.pixiStageRuntime;
  return (
    <PixiLayer
      animate={stage.animate}
      characterOutlineEnabled={characterOutlineEnabled}
      characterPreloadPlan={characterPreloadPlan}
      characterAssetIdByCharacterId={characterAssetIdByCharacterId}
      {...(assetResolver ? { assetResolver } : {})}
      hintSequence={stage.hintSequence}
      hints={stage.hints}
      observedTasks={stage.presentationTasks}
      {...(diagnostics ? { onDiagnostic: diagnostics.observeAssetDiagnostic } : {})}
      {...(onStageHandleChanged ? { onStageHandleChanged } : {})}
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
