import { useEffect, useRef, useState } from "react";
import {
  SettingsSnapshotSchema,
  createDefaultSettingsSnapshot,
  type SettingsPatch,
  type SettingsSnapshot
} from "@v-ronpa/contracts";
import {
  defaultStoryPlayTimingPolicy,
  type StoryPlayTimingPolicy
} from "@v-ronpa/story-play";
import type { VnDialogDisplaySettings } from "@v-ronpa/ui-kit";

export const GAME_SETTINGS_STORAGE_KEY = "v-ronpa:settings:v1";
export const GAME_SETTINGS_WRITE_DEBOUNCE_MS = 120;

export interface GameSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LoadedGameSettings {
  settings: SettingsSnapshot;
  migrated: boolean;
}

export interface DebouncedSettingsWriter {
  schedule(settings: SettingsSnapshot): void;
  flush(): void;
  cancel(): void;
}

export interface UseGameSettingsAdapterOptions {
  storage?: GameSettingsStorage | undefined;
  storageKey?: string | undefined;
  debounceMs?: number | undefined;
}

export interface VoiceRuntimeSettings {
  locale: string;
  volume: number;
}

interface ResolvedGameSettingsWriterConfig {
  storage: GameSettingsStorage | undefined;
  storageKey: string;
  debounceMs: number;
}

export function useGameSettingsAdapter({
  storage = resolveBrowserSettingsStorage(),
  storageKey = GAME_SETTINGS_STORAGE_KEY,
  debounceMs = GAME_SETTINGS_WRITE_DEBOUNCE_MS
}: UseGameSettingsAdapterOptions = {}) {
  const initialLoadRef = useRef<LoadedGameSettings | undefined>(undefined);
  const writerRef = useRef<DebouncedSettingsWriter | undefined>(undefined);
  const writerConfigRef = useRef<ResolvedGameSettingsWriterConfig | undefined>(undefined);
  if (!writerRef.current) {
    writerRef.current = createDebouncedSettingsWriter({ storage, storageKey, debounceMs });
    writerConfigRef.current = { storage, storageKey, debounceMs };
  }
  const [settings, setSettingsState] = useState<SettingsSnapshot>(() => {
    const loaded = loadGameSettings(storage, storageKey);
    initialLoadRef.current = loaded;
    return loaded.settings;
  });

  useEffect(() => {
    const writerConfig = writerConfigRef.current;
    if (
      !writerConfig ||
      writerConfig.storage !== storage ||
      writerConfig.storageKey !== storageKey ||
      writerConfig.debounceMs !== debounceMs
    ) {
      writerRef.current?.flush();
      writerRef.current = createDebouncedSettingsWriter({ storage, storageKey, debounceMs });
      writerConfigRef.current = { storage, storageKey, debounceMs };
    }

    if (initialLoadRef.current?.migrated) {
      persistGameSettings(storage, initialLoadRef.current.settings, storageKey);
      initialLoadRef.current = undefined;
    }

    return () => writerRef.current?.flush();
  }, [debounceMs, storage, storageKey]);

  function setSettings(next: SettingsSnapshot) {
    const parsed = SettingsSnapshotSchema.parse(next);
    setSettingsState(parsed);
    writerRef.current?.schedule(parsed);
  }

  function patchSettings(patch: SettingsPatch) {
    setSettingsState((current) => {
      const next = applySettingsPatch(current, patch);
      writerRef.current?.schedule(next);
      return next;
    });
  }

  function resetSettings() {
    setSettings(createDefaultSettingsSnapshot());
  }

  return {
    patchSettings,
    resetSettings,
    setSettings,
    settings
  };
}

export function initializeGameSettings(
  storage: GameSettingsStorage | undefined,
  storageKey = GAME_SETTINGS_STORAGE_KEY
): SettingsSnapshot {
  const loaded = loadGameSettings(storage, storageKey);
  if (loaded.migrated) persistGameSettings(storage, loaded.settings, storageKey);
  return loaded.settings;
}

export function loadGameSettings(
  storage: GameSettingsStorage | undefined,
  storageKey = GAME_SETTINGS_STORAGE_KEY
): LoadedGameSettings {
  if (!storage) return { settings: createDefaultSettingsSnapshot(), migrated: false };

  let raw: string | null;
  try {
    raw = storage.getItem(storageKey);
  } catch {
    return { settings: createDefaultSettingsSnapshot(), migrated: false };
  }
  if (!raw) return { settings: createDefaultSettingsSnapshot(), migrated: false };

  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = SettingsSnapshotSchema.safeParse(parsed);
    if (!result.success) {
      const legacy = stripLegacySettingsFields(parsed);
      const legacyResult = SettingsSnapshotSchema.safeParse(legacy.value);
      if (!legacyResult.success) return { settings: createDefaultSettingsSnapshot(), migrated: true };
      return { settings: legacyResult.data, migrated: true };
    }
    const settings = result.data;
    return {
      settings,
      migrated: JSON.stringify(settings) !== raw
    };
  } catch {
    return { settings: createDefaultSettingsSnapshot(), migrated: true };
  }
}

export function persistGameSettings(
  storage: GameSettingsStorage | undefined,
  settings: SettingsSnapshot,
  storageKey = GAME_SETTINGS_STORAGE_KEY
) {
  if (!storage) return;
  try {
    storage.setItem(storageKey, JSON.stringify(SettingsSnapshotSchema.parse(settings)));
  } catch {
    // Persistence is best-effort; canonical in-memory settings remain authoritative for the session.
  }
}

export function applySettingsPatch(settings: SettingsSnapshot, patch: SettingsPatch): SettingsSnapshot {
  return SettingsSnapshotSchema.parse({
    ...settings,
    ...(patch.system ? { system: { ...settings.system, ...patch.system } } : {}),
    ...(patch.display ? { display: { ...settings.display, ...patch.display } } : {}),
    ...(patch.sound ? { sound: { ...settings.sound, ...patch.sound } } : {}),
    ...(patch.automation ? { automation: { ...settings.automation, ...patch.automation } } : {})
  });
}

export function settingsToStoryPlayTimingPolicy(settings: SettingsSnapshot): StoryPlayTimingPolicy {
  const autoMultiplier = speedToDelayMultiplier(settings.automation.autoSpeed);
  const skipMultiplier = speedToDelayMultiplier(settings.automation.skipSpeed);
  return {
    autoBaseDelayMs: Math.round(defaultStoryPlayTimingPolicy.autoBaseDelayMs * autoMultiplier),
    autoPerVisibleCharMs: Math.max(
      1,
      Math.round(defaultStoryPlayTimingPolicy.autoPerVisibleCharMs * autoMultiplier)
    ),
    autoMinDelayMs: Math.max(200, Math.round(defaultStoryPlayTimingPolicy.autoMinDelayMs * autoMultiplier)),
    autoMaxDelayMs: Math.max(600, Math.round(defaultStoryPlayTimingPolicy.autoMaxDelayMs * autoMultiplier)),
    skipDelayMs: Math.max(20, Math.round(defaultStoryPlayTimingPolicy.skipDelayMs * skipMultiplier))
  };
}

export function settingsToDialogDisplaySettings(settings: SettingsSnapshot): VnDialogDisplaySettings {
  return {
    textSize: settings.display.textSize,
    textboxOpacity: settings.display.textboxOpacity,
    textSpeed: settings.display.textSpeed
  };
}

export function settingsToVoiceRuntimeSettings(settings: SettingsSnapshot): VoiceRuntimeSettings {
  return {
    locale: settingsLanguageToVoiceLocale(settings.system.language),
    volume: settings.sound.muted ? 0 : settings.sound.masterVolume * settings.sound.voiceVolume
  };
}

export function createDebouncedSettingsWriter({
  clearTimeoutFn = clearTimeout,
  debounceMs = GAME_SETTINGS_WRITE_DEBOUNCE_MS,
  setTimeoutFn = setTimeout,
  storage,
  storageKey = GAME_SETTINGS_STORAGE_KEY
}: {
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
  debounceMs?: number;
  setTimeoutFn?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  storage?: GameSettingsStorage | undefined;
  storageKey?: string;
}): DebouncedSettingsWriter {
  let pending: SettingsSnapshot | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function cancel() {
    if (timeout) clearTimeoutFn(timeout);
    timeout = undefined;
  }

  function flush() {
    cancel();
    if (!pending) return;
    persistGameSettings(storage, pending, storageKey);
    pending = undefined;
  }

  return {
    cancel,
    flush,
    schedule(settings) {
      pending = SettingsSnapshotSchema.parse(settings);
      cancel();
      timeout = setTimeoutFn(flush, debounceMs);
    }
  };
}

export function createMemorySettingsStorage(initial: Record<string, string> = {}): GameSettingsStorage & {
  values: Map<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

function resolveBrowserSettingsStorage(): GameSettingsStorage | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}

function speedToDelayMultiplier(speed: number): number {
  return 1.75 - speed * 1.5;
}

function settingsLanguageToVoiceLocale(language: SettingsSnapshot["system"]["language"]): string {
  if (language === "zh-CN" || language === "zh-TW") return "zh";
  if (language === "ja" || language === "en") return language;
  return "zh";
}

function stripLegacySettingsFields(value: unknown): { value: unknown; stripped: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { value, stripped: false };
  const root = value as Record<string, unknown>;
  const sound = root.sound;
  if (!sound || typeof sound !== "object" || Array.isArray(sound) || !("voiceInterruption" in sound)) {
    return { value, stripped: false };
  }
  const { voiceInterruption: _voiceInterruption, ...nextSound } = sound as Record<string, unknown>;
  void _voiceInterruption;
  return { value: { ...root, sound: nextSound }, stripped: true };
}
