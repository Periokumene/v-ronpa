export { DialogBox } from "./surfaces/DialogBox";
export {
  RichTextRenderer,
  richTextFontCssVariableName,
  richTextFontFamilyValue,
} from "./surfaces/RichTextRenderer";
export type { RichTextRendererProps } from "./surfaces/RichTextRenderer";
export { RichTextFontStyles, createRichTextFontCss } from "./surfaces/RichTextFontStyles";
export type {
  CreateRichTextFontCssInput,
  RichTextFontAssetResolver,
  RichTextFontCssResult,
  RichTextFontDiagnostic,
  RichTextFontRuntimeDiagnostic,
  RichTextFontStylesProps
} from "./surfaces/RichTextFontStyles";
export {
  GameOverlayHost,
  paginateSaveLoadSlotIds,
  ReadOnlyBacklogOverlay,
  SAVE_LOAD_SLOTS_PER_PAGE,
  SaveLoadOverlay,
  SettingsOverlay,
  TitleSurface,
  VnCommandBar
} from "./surfaces/GameInteractionSurfaces";
export { InspectorLite } from "./surfaces/InspectorLite";
export {
  RuntimeInputPromptSurface,
  RuntimeMovieOverlaySurface,
  RuntimeToastLayer
} from "./surfaces/RuntimeUiSurfaces";
export { ScenarioTabs } from "./surfaces/ScenarioTabs";
export { SurfaceFrame } from "./surfaces/SurfaceFrame";
export { VnChoiceOverlay } from "./surfaces/VnChoiceOverlay";
export { VnCueSurface } from "./surfaces/VnCueSurface";
export { VnDialogSurface } from "./surfaces/VnDialogSurface";
export { DEFAULT_VN_DIALOG_APPEARANCE, resolveVnDialogAppearance } from "./surfaces/vnDialogAppearance";
export type {
  GameOverlayHostProps,
  ReadOnlyBacklogOverlayProps,
  SaveLoadOverlayProps,
  SettingsOverlayProps,
  TitleSurfaceProps,
  VnCommandBarCommand,
  VnCommandBarProps
} from "./surfaces/GameInteractionSurfaces";
export type { InspectorLiteProps, ScenarioOption, UiSurfacePresentationLike } from "./surfaces/types";
export type { SurfaceFrameInteraction, SurfaceFrameProps } from "./surfaces/SurfaceFrame";
export type {
  RuntimeInputPromptProps,
  RuntimeMovieOverlayProps,
  RuntimeToastLayerProps,
  RuntimeToastView
} from "./surfaces/RuntimeUiSurfaces";
export type { VnChoiceOverlayProps } from "./surfaces/VnChoiceOverlay";
export type { VnCueSurfaceProps } from "./surfaces/VnCueSurface";
export type { VnStoryTextDisplaySettings, VnDialogState, VnDialogSurfaceProps } from "./surfaces/VnDialogSurface";
export type { VnDialogAppearance } from "./surfaces/vnDialogAppearance";
