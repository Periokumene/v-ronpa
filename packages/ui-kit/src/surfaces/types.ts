import type { PresentationCommand } from "@v-ronpa/contracts";

export interface ScenarioOption {
  id: string;
  label: string;
}

export interface InspectorLiteProps {
  mode: string;
  detail?: string;
  inputLock?: string;
  naviSubstate?: string;
  trialPresentation?: string;
  scriptPointer: number;
  variables: Record<string, unknown>;
  inventoryItems: Record<string, number>;
  evidenceIds: string[];
  trialSegmentId?: string;
  presentationCommands: PresentationCommand[];
  onGrantItem?: (itemId: string) => void;
  onGrantEvidence?: (evidenceId: string) => void;
  onJumpLabel?: (label: string) => void;
  onForceOutcome?: (outcome: string) => void;
}
