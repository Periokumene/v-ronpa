export const gameAUiConfig = {
  dialog: {
    showSpeakerName: true,
    frameAssetId: "ui/dialog-frame",
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
        assetId: "sfx/ui-hover-default",
        gain: 1
      },
      activate: {
        assetId: "sfx/ui-click-default",
        gain: 1
      }
    },
    hoverThrottleMs: 60
  },
  title: {
    title: "白昼梦游行 Daydream Parade",
    backgroundAssetId: "bg/title"
  }
} as const;

export type GameAUiConfig = typeof gameAUiConfig;
export type GameAUiSoundCueId = keyof GameAUiConfig["uiAudio"]["cues"];
