import {
  CHARACTER_TONE_PRESET_IDS,
  type CharacterTonePresetId,
  type PixiStageSnapshot,
  type RuntimeCommand
} from "@v-ronpa/contracts";
import {
  booleanParam,
  changedSnapshot,
  durationMsParam,
  emptyReduction,
  numberParam,
  stringParam,
  unsupportedPixiParams,
  withWaitTasks,
  type PixiRuntimeCommandReduction
} from "./reduction";

const characterTonePresetIds = new Set<string>(CHARACTER_TONE_PRESET_IDS);

export function reduceCharacterTone(
  snapshot: PixiStageSnapshot,
  command: RuntimeCommand
): PixiRuntimeCommandReduction {
  const requestedPreset = stringParam(command, "preset");
  const requestedAmount = numberParam(command, "amount");
  const durationMs = durationMsParam(command, 0);
  const wait = booleanParam(command, "wait", false);
  const scopeScriptPath = command.loc.scriptPath;

  if (requestedPreset && requestedPreset !== "none" && !characterTonePresetIds.has(requestedPreset)) {
    return unsupportedPixiParams(snapshot, command, `unknown character tone preset: ${requestedPreset}`);
  }
  if (requestedAmount !== undefined && (!Number.isFinite(requestedAmount) || requestedAmount < 0)) {
    return unsupportedPixiParams(snapshot, command, "amount must be a finite non-negative number");
  }
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return unsupportedPixiParams(snapshot, command, "durationMs must be a finite non-negative number");
  }
  if (requestedPreset === "none" && requestedAmount !== undefined && requestedAmount > 0) {
    return unsupportedPixiParams(snapshot, command, "none cannot be combined with a positive amount");
  }

  const remove = requestedPreset === "none" || requestedAmount === 0;
  if (remove) {
    if (!snapshot.characterTone) return emptyReduction(snapshot);
    const { characterTone: _characterTone, ...withoutTone } = snapshot;
    const reduction = changedSnapshot(withoutTone);
    if (durationMs <= 0) return reduction;
    return {
      ...withWaitTasks(command, reduction, "character-tone-transition", ["character-tone"]),
      hints: [{ type: "character-tone-remove", durationMs, scopeScriptPath, wait }]
    };
  }

  const preset = requestedPreset ? requestedPreset as CharacterTonePresetId : snapshot.characterTone?.preset;
  if (!preset) return unsupportedPixiParams(snapshot, command, "a positive amount requires an active preset");
  const amount = requestedAmount ?? (requestedPreset ? 1 : snapshot.characterTone?.amount);
  if (amount === undefined) return unsupportedPixiParams(snapshot, command, "missing amount and active preset");
  if (
    snapshot.characterTone?.preset === preset &&
    snapshot.characterTone.amount === amount &&
    snapshot.characterTone.scopeScriptPath === scopeScriptPath
  ) return emptyReduction(snapshot);

  return withWaitTasks(command, changedSnapshot({
    ...snapshot,
    characterTone: { preset, amount, scopeScriptPath, transition: { durationMs, wait } }
  }), "character-tone-transition", ["character-tone"]);
}
