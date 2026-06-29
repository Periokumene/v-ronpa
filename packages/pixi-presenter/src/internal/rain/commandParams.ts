import type { PixiRainCommandParams } from "@v-ronpa/contracts";

export const DEFAULT_RAIN_COMMAND_PARAMS: PixiRainCommandParams = {
  power: 1,
  wind: -1,
  hue: 215,
  tint: 0.55,
};

export const RAIN_POWER_MIN = 0;
export const RAIN_POWER_MAX = 1;
export const RAIN_WIND_MIN = -1;
export const RAIN_WIND_MAX = 1;
export const RAIN_HUE_WRAP = 360;
export const RAIN_TINT_MIN = 0;
export const RAIN_TINT_MAX = 2;
