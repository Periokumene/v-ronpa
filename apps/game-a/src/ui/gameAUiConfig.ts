export const gameAUiConfig = {
  dialog: {
    showSpeakerName: true,
    frameRole: "dialog-frame"
  },
  title: {
    title: "Game A"
  }
} as const;

export type GameAUiConfig = typeof gameAUiConfig;
