export const gameAUiConfig = {
  dialog: {
    showSpeakerName: true,
    frameAssetId: "texture:ui:game-a-dialog-frame",
    appearance: {
      backgroundOpacity: 1
    }
  },
  uiAudio: {
    defaults: {
      hover: "hover",
      click: "activate"
    },
    cues: {
      hover: {
        sourceRef: "sfx:ui-hover-default",
        gain: 1
      },
      activate: {
        sourceRef: "sfx:ui-click-default",
        gain: 1
      }
    },
    hoverThrottleMs: 60
  },
  title: {
    title: "Game A"
  }
} as const;

export type GameAUiConfig = typeof gameAUiConfig;
export type GameAUiSoundCueId = keyof GameAUiConfig["uiAudio"]["cues"];
