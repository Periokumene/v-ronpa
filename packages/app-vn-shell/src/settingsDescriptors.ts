import type { SettingsSnapshot } from "@v-ronpa/contracts";

export type SettingsSectionId = keyof Pick<SettingsSnapshot, "system" | "display" | "sound" | "automation">;
export interface SettingsSectionDescriptor {
  id: SettingsSectionId;
  label: string;
  testId: string;
}
export interface SettingsOption<T extends string> {
  value: T;
  label: string;
}

export const SETTINGS_SECTION_DESCRIPTORS: SettingsSectionDescriptor[] = [
  { id: "system", label: "SYSTEM", testId: "settings-subtab-system" },
  { id: "display", label: "DISPLAY", testId: "settings-subtab-display" },
  { id: "sound", label: "SOUND", testId: "settings-subtab-sound" },
  { id: "automation", label: "AUTO", testId: "settings-subtab-auto" }
];

export const SETTINGS_LANGUAGE_OPTIONS: SettingsOption<SettingsSnapshot["system"]["language"]>[] = [
  { value: "zh-CN", label: "简体中文" },
  { value: "zh-TW", label: "繁体中文" },
  { value: "en", label: "英语" },
  { value: "ja", label: "日语" },
  { value: "ko", label: "韩语" }
];

export const SETTINGS_TEXT_SIZE_OPTIONS: SettingsOption<SettingsSnapshot["display"]["textSize"]>[] = [
  { value: "small", label: "小" },
  { value: "medium", label: "中" },
  { value: "large", label: "大" }
];

export function normalizeSettingsStep(value: number): number {
  return Math.min(1, Math.max(0, Math.round(value * 10) / 10));
}

export function adjacentSettingsOption<T extends string>(
  options: readonly SettingsOption<T>[],
  value: T,
  direction: -1 | 1
): SettingsOption<T> | undefined {
  const current = Math.max(0, options.findIndex((option) => option.value === value));
  return options[current + direction];
}
