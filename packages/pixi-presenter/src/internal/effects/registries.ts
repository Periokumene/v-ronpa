import type { PixiWeatherKind } from "@v-ronpa/contracts";
import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";

// This is the one visible family-membership declaration. Each family dispatcher
// keys its typed controller registry from these tuples, so registration also
// covers reconcile/run, resize, clear, and destroy traversal.
export const WEATHER_EFFECT_KINDS = ["rain", "snow", "sun"] as const satisfies readonly PixiWeatherKind[];
export const PERSISTENT_SCREEN_EFFECT_KEYS = ["bokeh", "waterVeil", "pulse", "staticFilter", "glitch", "vignette"] as const;
export const TRANSIENT_EFFECT_HINT_TYPES = [
  "flash", "shake", "glitch", "impact", "afterimage", "shutter", "flicker"
] as const satisfies readonly PixiStageRenderHint["type"][];

assertUniqueRegistry("weather", WEATHER_EFFECT_KINDS);
assertUniqueRegistry("persistent screen", PERSISTENT_SCREEN_EFFECT_KEYS);
assertUniqueRegistry("transient", TRANSIENT_EFFECT_HINT_TYPES);

function assertUniqueRegistry(family: string, entries: readonly string[]): void {
  const duplicates = entries.filter((entry, index) => entries.indexOf(entry) !== index);
  if (duplicates.length > 0) throw new Error(`Duplicate ${family} effect registration: ${duplicates.join(", ")}`);
}
