export const gameAUiConfig = {
  dialog: {
    showSpeakerName: true,
    frameAssetId: "texture:ui:game-a-dialog-frame"
  },
  title: {
    title: "Game A"
  }
} as const;

export type GameAUiConfig = typeof gameAUiConfig;
