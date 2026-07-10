import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultSettingsSnapshot } from "@v-ronpa/contracts";
import { defaultStoryPlayTimingPolicy } from "@v-ronpa/story-play";
import {
  GAME_SETTINGS_STORAGE_KEY,
  applySettingsPatch,
  createDebouncedSettingsWriter,
  createMemorySettingsStorage,
  initializeGameSettings,
  loadGameSettings,
  settingsToDialogDisplaySettings,
  settingsToDialogueBleepRuntimeSettings,
  settingsToStoryPlayTimingPolicy,
  settingsToVoiceRuntimeSettings
} from "./useGameSettingsAdapter";

describe("game settings adapter helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads defaults when storage is empty", () => {
    const storage = createMemorySettingsStorage();

    expect(loadGameSettings(storage)).toEqual({
      settings: createDefaultSettingsSnapshot(),
      normalized: false
    });
    expect(storage.getItem(GAME_SETTINGS_STORAGE_KEY)).toBeNull();
  });

  it("fills current-schema defaults and writes the normalized snapshot", () => {
    const storage = createMemorySettingsStorage({
      [GAME_SETTINGS_STORAGE_KEY]: JSON.stringify({
        version: 1,
        display: { textSize: "large" }
      })
    });

    const settings = initializeGameSettings(storage);

    expect(settings.display.textSize).toBe("large");
    expect(settings.display.textboxOpacity).toBe(0.75);
    expect(settings.sound.bgmVolume).toBe(0.25);
    expect(settings.sound.bleepVolume).toBe(1);
    expect(JSON.parse(storage.getItem(GAME_SETTINGS_STORAGE_KEY) ?? "")).toEqual(settings);
  });

  it("rejects legacy settings fields instead of preserving an old schema", () => {
    const storage = createMemorySettingsStorage({
      [GAME_SETTINGS_STORAGE_KEY]: JSON.stringify({
        version: 1,
        system: { language: "zh-TW", skipAll: true, preferFullscreen: false },
        display: { textSpeed: 0.75, textSize: "large", textboxOpacity: 0.4, fontFamilyId: "font:default" },
        sound: {
          masterVolume: 0.5,
          bgmVolume: 0.2,
          sfxVolume: 0.6,
          voiceVolume: 0.8,
          uiVolume: 0.7,
          muted: false,
          voiceInterruption: "interrupt"
        },
        automation: { autoSpeed: 0.25, skipSpeed: 0.9 }
      })
    });

    const settings = initializeGameSettings(storage);

    expect(settings).toEqual(createDefaultSettingsSnapshot());
    expect(JSON.parse(storage.getItem(GAME_SETTINGS_STORAGE_KEY) ?? "")).toEqual(settings);
  });

  it("falls back to defaults and rewrites corrupt settings", () => {
    const storage = createMemorySettingsStorage({
      [GAME_SETTINGS_STORAGE_KEY]: "{not-json"
    });

    const settings = initializeGameSettings(storage);

    expect(settings).toEqual(createDefaultSettingsSnapshot());
    expect(JSON.parse(storage.getItem(GAME_SETTINGS_STORAGE_KEY) ?? "")).toEqual(settings);
  });

  it("treats localStorage failures as non-fatal session defaults", () => {
    const throwingStorage = {
      getItem() {
        throw new Error("storage disabled");
      },
      setItem() {
        throw new Error("storage disabled");
      }
    };

    expect(loadGameSettings(throwingStorage)).toEqual({
      settings: createDefaultSettingsSnapshot(),
      normalized: false
    });
    expect(() => initializeGameSettings(throwingStorage)).not.toThrow();
  });

  it("rejects old placeholder settings as invalid persisted data", () => {
    const storage = createMemorySettingsStorage({
      [GAME_SETTINGS_STORAGE_KEY]: JSON.stringify({ version: 1, placeholder: true })
    });

    expect(initializeGameSettings(storage)).toEqual(createDefaultSettingsSnapshot());
  });

  it("patches canonical settings without replacing unrelated groups", () => {
    const settings = applySettingsPatch(createDefaultSettingsSnapshot(), {
      display: { textSize: "small", textboxOpacity: 0.4 },
      automation: { autoSpeed: 1 }
    });

    expect(settings.display).toMatchObject({ textSize: "small", textboxOpacity: 0.4 });
    expect(settings.automation.autoSpeed).toBe(1);
    expect(settings.sound.bgmVolume).toBe(0.25);
  });

  it("debounces localStorage writes while canonical settings can change immediately", () => {
    vi.useFakeTimers();
    const storage = createMemorySettingsStorage();
    const writer = createDebouncedSettingsWriter({ storage, debounceMs: 100 });
    const first = applySettingsPatch(createDefaultSettingsSnapshot(), { display: { textboxOpacity: 0.4 } });
    const second = applySettingsPatch(first, { display: { textboxOpacity: 0.8 } });

    writer.schedule(first);
    writer.schedule(second);
    expect(storage.getItem(GAME_SETTINGS_STORAGE_KEY)).toBeNull();

    vi.advanceTimersByTime(100);
    expect(JSON.parse(storage.getItem(GAME_SETTINGS_STORAGE_KEY) ?? "")).toEqual(second);
  });

  it("derives narrow runtime settings without exposing the whole snapshot", () => {
    const defaults = createDefaultSettingsSnapshot();
    expect(settingsToStoryPlayTimingPolicy(defaults)).toEqual(defaultStoryPlayTimingPolicy);
    expect(settingsToDialogDisplaySettings(defaults)).toEqual({
      textSize: "medium",
      textboxOpacity: 0.75,
      textSpeed: 0.5
    });
    expect(settingsToVoiceRuntimeSettings(defaults)).toEqual({
      locale: "zh",
      volume: 1
    });
    expect(settingsToDialogueBleepRuntimeSettings(defaults)).toEqual({
      volume: 1
    });

    const fast = applySettingsPatch(defaults, { automation: { autoSpeed: 1, skipSpeed: 1 } });
    const timing = settingsToStoryPlayTimingPolicy(fast);
    expect(timing.autoBaseDelayMs).toBeLessThan(defaultStoryPlayTimingPolicy.autoBaseDelayMs);
    expect(timing.skipDelayMs).toBeLessThan(defaultStoryPlayTimingPolicy.skipDelayMs);

    const muted = applySettingsPatch(defaults, { sound: { masterVolume: 0.5, voiceVolume: 0.4, muted: true } });
    const quietBleep = applySettingsPatch(defaults, { sound: { masterVolume: 0.5, bleepVolume: 0.4 } });
    const audibleJapanese = applySettingsPatch(defaults, {
      system: { language: "ja" },
      sound: { masterVolume: 0.5, voiceVolume: 0.4 }
    });
    const unsupportedVoiceLocale = applySettingsPatch(defaults, { system: { language: "ko" } });
    expect(settingsToVoiceRuntimeSettings(muted)).toEqual({ locale: "zh", volume: 0 });
    expect(settingsToDialogueBleepRuntimeSettings(muted)).toEqual({ volume: 0 });
    expect(settingsToDialogueBleepRuntimeSettings(quietBleep)).toEqual({ volume: 0.2 });
    expect(settingsToVoiceRuntimeSettings(audibleJapanese)).toEqual({ locale: "ja", volume: 0.2 });
    expect(settingsToVoiceRuntimeSettings(unsupportedVoiceLocale)).toEqual({ locale: "zh", volume: 1 });
  });
});
