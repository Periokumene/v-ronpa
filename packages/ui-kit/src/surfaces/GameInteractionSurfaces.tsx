import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Tooltip from "@radix-ui/react-tooltip";
import type {
  GameOverlayKind,
  GameUiAction,
  InteractionCapabilitySnapshot,
  SaveSlotSummary,
  SettingsPatch,
  SettingsSnapshot,
  StoryBacklogEntry
} from "@v-ronpa/contracts";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { RichTextRenderer } from "./RichTextRenderer";
import type { UiSurfacePresentationLike } from "./types";

export interface TitleSurfaceProps {
  capabilities: InteractionCapabilitySnapshot;
  onAction: (action: GameUiAction) => void;
  title?: string;
}

export function TitleSurface({ capabilities, onAction, title = "V-Ronpa" }: TitleSurfaceProps) {
  return (
    <section aria-label="Title menu" data-testid="title-surface" style={titleRootStyle}>
      <div style={titleContentStyle}>
        <p style={kickerStyle}>Visual mystery harness</p>
        <h1 style={titleStyle}>{title}</h1>
        <div style={titleActionsStyle}>
          <button data-testid="title-new-game" disabled={!capabilities.canStartNewGame} onClick={() => onAction("new-game")} style={primaryButtonStyle} type="button">
            New Game
          </button>
          <button data-testid="title-load" disabled={!capabilities.canLoad} onClick={() => onAction("open-load")} style={secondaryButtonStyle} type="button">
            Load Game
          </button>
          <button data-testid="title-settings" disabled={!capabilities.canOpenSettings} onClick={() => onAction("open-settings")} style={secondaryButtonStyle} type="button">
            Settings
          </button>
        </div>
      </div>
    </section>
  );
}

export interface VnCommandBarProps {
  commands: VnCommandBarCommand[];
  onAction: (action: GameUiAction) => void;
  presentation?: UiSurfacePresentationLike;
}

export interface VnCommandBarCommand {
  action: GameUiAction;
  label: string;
  enabled: boolean;
  testId: string;
  active?: boolean;
  toggle: boolean;
}

export function VnCommandBar({ commands, onAction, presentation }: VnCommandBarProps) {
  return (
    <Tooltip.Provider delayDuration={120}>
      <nav
        aria-label="VN command bar"
        data-testid="vn-command-bar"
        data-ui-phase={presentation?.phase ?? "shown"}
        style={surfacePresentationStyle(commandBarStyle, presentation)}
      >
        {commands.map((command) => {
          const active = Boolean(command.active);
          return (
            <Tooltip.Root key={command.testId}>
              <Tooltip.Trigger asChild>
                <button
                  {...(command.toggle ? { "aria-pressed": active } : {})}
                  data-testid={command.testId}
                  disabled={!command.enabled}
                  onClick={() => onAction(command.action)}
                  style={!command.enabled ? disabledCommandButtonStyle : active ? activeCommandButtonStyle : commandButtonStyle}
                  type="button"
                >
                  {command.label}
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content side="top" style={tooltipStyle}>
                  {command.label}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        })}
      </nav>
    </Tooltip.Provider>
  );
}

export interface GameOverlayHostProps {
  activeOverlay: GameOverlayKind | undefined;
  children?: ReactNode;
}

export function GameOverlayHost({ activeOverlay, children }: GameOverlayHostProps) {
  if (!activeOverlay) return null;
  return (
    <div data-overlay={activeOverlay} data-testid="game-overlay-host" style={overlayHostStyle}>
      {children}
    </div>
  );
}

export interface ReadOnlyBacklogOverlayProps {
  embedded?: boolean;
  entries: StoryBacklogEntry[];
  onClose: () => void;
}

export function ReadOnlyBacklogOverlay({ embedded = false, entries, onClose }: ReadOnlyBacklogOverlayProps) {
  const content = (
      <ScrollArea.Root style={scrollRootStyle}>
        <ScrollArea.Viewport style={scrollViewportStyle}>
          {entries.length === 0 ? (
            <p data-testid="backlog-empty" style={emptyStyle}>No backlog yet.</p>
          ) : (
            <ol data-testid="backlog-list" style={listStyle}>
              {entries.map((entry, index) => (
                <li data-testid={`backlog-entry-${index}`} key={`${entry.speaker ?? "narrator"}-${index}`} style={backlogItemStyle}>
                  <strong>{entry.speaker ?? "Narrator"}</strong>
                  <span style={backlogTextStyle}>
                    <RichTextRenderer document={entry.richText} fallbackText={entry.text} />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" style={scrollbarStyle}>
          <ScrollArea.Thumb style={scrollThumbStyle} />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
  );
  if (embedded) return <div data-testid="backlog-overlay" style={embeddedSectionStyle}>{content}</div>;
  return <OverlayPanel onClose={onClose} testId="backlog-overlay" title="Backlog">{content}</OverlayPanel>;
}

export interface SaveLoadOverlayProps {
  embedded?: boolean;
  mode: "save" | "load";
  slotIds: string[];
  slots: SaveSlotSummary[];
  slotPreviewsById?: Record<string, SaveLoadSlotPreview>;
  canSave: boolean;
  pendingLoadSlot: SaveSlotSummary | undefined;
  busy?: boolean;
  lastError?: SaveLoadOverlayError | undefined;
  onSave: (slotId: string) => void;
  onRequestLoad: (slotId: string) => void;
  onConfirmLoad: () => void;
  onCancelLoad: () => void;
  onLoadPreviews?: (slotIds: string[]) => void;
  onClose: () => void;
}

export interface SaveLoadSlotPreview {
  kind: "image";
  uri: string;
  width: number;
  height: number;
}

export interface SaveLoadOverlayError {
  message: string;
}

export const SAVE_LOAD_SLOTS_PER_PAGE = 5;

export function paginateSaveLoadSlotIds(slotIds: string[], pageIndex: number): {
  pageCount: number;
  pageIndex: number;
  pageSlotIds: string[];
} {
  const pageCount = Math.max(1, Math.ceil(slotIds.length / SAVE_LOAD_SLOTS_PER_PAGE));
  const requestedPageIndex = Number.isFinite(pageIndex) ? Math.floor(pageIndex) : 0;
  const clampedPageIndex = Math.min(Math.max(0, requestedPageIndex), pageCount - 1);
  const start = clampedPageIndex * SAVE_LOAD_SLOTS_PER_PAGE;
  return {
    pageCount,
    pageIndex: clampedPageIndex,
    pageSlotIds: slotIds.slice(start, start + SAVE_LOAD_SLOTS_PER_PAGE)
  };
}

export function SaveLoadOverlay({
  embedded = false,
  mode,
  slotIds,
  slots,
  slotPreviewsById = {},
  canSave,
  pendingLoadSlot,
  busy = false,
  lastError,
  onSave,
  onRequestLoad,
  onConfirmLoad,
  onCancelLoad,
  onLoadPreviews,
  onClose
}: SaveLoadOverlayProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const slotIdsKey = slotIds.join("\u0000");
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const title = mode === "save" ? "Save Game" : "Load Game";
  const page = paginateSaveLoadSlotIds(slotIds, pageIndex);
  const pageSlotIdsKey = page.pageSlotIds.join("\u0000");

  useEffect(() => {
    setPageIndex(0);
  }, [mode, slotIdsKey]);

  useEffect(() => {
    onLoadPreviews?.(page.pageSlotIds);
  }, [onLoadPreviews, pageSlotIdsKey]);

  const content = (
    <>
      <div data-testid="save-load-mode" style={modeBadgeStyle}>{mode}</div>
      {lastError ? (
        <div data-testid="save-load-error" role="alert" style={saveLoadErrorStyle}>
          {lastError.message}
        </div>
      ) : null}
      <div data-testid="save-slot-grid" style={slotGridStyle}>
        {page.pageSlotIds.map((slotId, index) => {
          const absoluteIndex = page.pageIndex * SAVE_LOAD_SLOTS_PER_PAGE + index;
          const slot = slotsById.get(slotId);
          const preview = slotPreviewsById[slotId];
          const disabled = busy || (mode === "save" ? !canSave : !slot);
          return (
            <button
              data-testid={`save-slot-${absoluteIndex + 1}`}
              disabled={disabled}
              key={slotId}
              onClick={() => (mode === "save" ? onSave(slotId) : onRequestLoad(slotId))}
              style={disabled ? disabledSlotStyle : slotStyle}
              type="button"
            >
              {preview ? (
                <img
                  alt=""
                  data-testid={`save-slot-${absoluteIndex + 1}-thumbnail`}
                  src={preview.uri}
                  width={preview.width}
                  height={preview.height}
                  style={slotThumbnailStyle}
                />
              ) : (
                <span aria-hidden="true" data-testid={`save-slot-${absoluteIndex + 1}-thumbnail`} style={slotThumbnailPlaceholderStyle} />
              )}
              <strong>{slot?.label ?? `Slot ${absoluteIndex + 1}`}</strong>
              <span>{slot ? new Date(slot.savedAt).toLocaleString() : "Empty"}</span>
              <small>{slot?.speaker ? `${slot.speaker}: ${slot.text ?? ""}` : slot?.text ?? "No data"}</small>
            </button>
          );
        })}
      </div>
      <div data-testid="save-page-controls" style={slotPagerStyle}>
        <button
          data-testid="save-page-prev"
          disabled={busy || page.pageIndex === 0}
          onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
          style={secondaryButtonStyle}
          type="button"
        >
          Prev
        </button>
        <span data-testid="save-page-indicator" style={slotPagerIndicatorStyle}>
          Page {page.pageIndex + 1} / {page.pageCount}
        </span>
        <button
          data-testid="save-page-next"
          disabled={busy || page.pageIndex >= page.pageCount - 1}
          onClick={() => setPageIndex((current) => Math.min(page.pageCount - 1, current + 1))}
          style={secondaryButtonStyle}
          type="button"
        >
          Next
        </button>
      </div>
      <AlertDialog.Root open={Boolean(pendingLoadSlot)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay style={confirmOverlayStyle} />
          <AlertDialog.Content
            data-testid="load-confirmation"
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onCancelLoad();
            }}
            style={confirmContentStyle}
          >
            <AlertDialog.Title style={confirmTitleStyle}>Load this slot?</AlertDialog.Title>
            <AlertDialog.Description style={confirmTextStyle}>
              Current progress will be replaced by {pendingLoadSlot?.label ?? "this save"}.
            </AlertDialog.Description>
            <div style={confirmActionsStyle}>
              <AlertDialog.Cancel asChild>
                <button data-testid="load-cancel" disabled={busy} onClick={onCancelLoad} style={secondaryButtonStyle} type="button">
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button data-testid="load-confirm" disabled={busy} onClick={onConfirmLoad} style={primaryButtonStyle} type="button">
                  Load
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
  if (embedded) return <div data-testid="save-load-overlay" style={embeddedSectionStyle}>{content}</div>;
  return <OverlayPanel onClose={onClose} testId="save-load-overlay" title={title}>{content}</OverlayPanel>;
}

export interface SettingsOverlayProps {
  embedded?: boolean;
  onPatchSettings: (patch: SettingsPatch) => void;
  onResetSettings: () => void;
  onClose: () => void;
  settings: SettingsSnapshot;
}

export function SettingsOverlay({ embedded = false, onClose, onPatchSettings, onResetSettings, settings }: SettingsOverlayProps) {
  const content = (
    <>
      <div data-testid="settings-groups" style={settingsGroupsStyle}>
        <section aria-label="System settings" data-testid="settings-group-system" style={settingsGroupStyle}>
          <h3 style={settingsGroupTitleStyle}>System</h3>
          <SettingsSelect
            label="Language"
            testId="settings-system-language"
            value={settings.system.language}
            options={[
              ["zh-CN", "Chinese (Simplified)"],
              ["zh-TW", "Chinese (Traditional)"],
              ["en", "English"],
              ["ja", "Japanese"],
              ["ko", "Korean"]
            ]}
            onChange={(language) => onPatchSettings({ system: { language: language as SettingsSnapshot["system"]["language"] } })}
          />
          <SettingsToggle
            checked={settings.system.skipAll}
            label="Skip unread text"
            onChange={(skipAll) => onPatchSettings({ system: { skipAll } })}
            testId="settings-system-skip-all"
          />
          <SettingsToggle
            checked={settings.system.preferFullscreen}
            label="Prefer fullscreen"
            onChange={(preferFullscreen) => onPatchSettings({ system: { preferFullscreen } })}
            testId="settings-system-fullscreen"
          />
        </section>

        <section aria-label="Display settings" data-testid="settings-group-display" style={settingsGroupStyle}>
          <h3 style={settingsGroupTitleStyle}>Display</h3>
          <SettingsSelect
            label="Text size"
            testId="settings-display-text-size"
            value={settings.display.textSize}
            options={[
              ["small", "Small"],
              ["medium", "Medium"],
              ["large", "Large"]
            ]}
            onChange={(textSize) => onPatchSettings({ display: { textSize: textSize as SettingsSnapshot["display"]["textSize"] } })}
          />
          <SettingsSlider
            label="Text speed"
            onChange={(textSpeed) => onPatchSettings({ display: { textSpeed } })}
            testId="settings-display-text-speed"
            value={settings.display.textSpeed}
          />
          <SettingsSlider
            label="Textbox opacity"
            onChange={(textboxOpacity) => onPatchSettings({ display: { textboxOpacity } })}
            testId="settings-display-textbox-opacity"
            value={settings.display.textboxOpacity}
          />
          <SettingsSelect
            label="Textbox font"
            testId="settings-display-font"
            value={settings.display.fontFamilyId}
            options={[["font:default", "Default"]]}
            onChange={(fontFamilyId) => onPatchSettings({ display: { fontFamilyId } })}
          />
        </section>

        <section aria-label="Sound settings" data-testid="settings-group-sound" style={settingsGroupStyle}>
          <h3 style={settingsGroupTitleStyle}>Sound</h3>
          <SettingsToggle
            checked={settings.sound.muted}
            label="Mute all"
            onChange={(muted) => onPatchSettings({ sound: { muted } })}
            testId="settings-sound-muted"
          />
          <SettingsSlider
            label="Master volume"
            onChange={(masterVolume) => onPatchSettings({ sound: { masterVolume } })}
            testId="settings-sound-master"
            value={settings.sound.masterVolume}
          />
          <SettingsSlider
            label="BGM volume"
            onChange={(bgmVolume) => onPatchSettings({ sound: { bgmVolume } })}
            testId="settings-sound-bgm"
            value={settings.sound.bgmVolume}
          />
          <SettingsSlider
            label="SFX volume"
            onChange={(sfxVolume) => onPatchSettings({ sound: { sfxVolume } })}
            testId="settings-sound-sfx"
            value={settings.sound.sfxVolume}
          />
          <SettingsSlider
            label="Bleep volume"
            onChange={(bleepVolume) => onPatchSettings({ sound: { bleepVolume } })}
            testId="settings-sound-bleep"
            value={settings.sound.bleepVolume}
          />
          <SettingsSlider
            label="Voice volume"
            onChange={(voiceVolume) => onPatchSettings({ sound: { voiceVolume } })}
            testId="settings-sound-voice"
            value={settings.sound.voiceVolume}
          />
          <SettingsSlider
            label="UI volume"
            onChange={(uiVolume) => onPatchSettings({ sound: { uiVolume } })}
            testId="settings-sound-ui"
            value={settings.sound.uiVolume}
          />
        </section>

        <section aria-label="Automation settings" data-testid="settings-group-automation" style={settingsGroupStyle}>
          <h3 style={settingsGroupTitleStyle}>Automation</h3>
          <SettingsSlider
            label="Auto speed"
            onChange={(autoSpeed) => onPatchSettings({ automation: { autoSpeed } })}
            testId="settings-automation-auto-speed"
            value={settings.automation.autoSpeed}
          />
          <SettingsSlider
            label="Skip speed"
            onChange={(skipSpeed) => onPatchSettings({ automation: { skipSpeed } })}
            testId="settings-automation-skip-speed"
            value={settings.automation.skipSpeed}
          />
        </section>
      </div>
      <div style={settingsActionsStyle}>
        <button data-testid="settings-reset" onClick={onResetSettings} style={secondaryButtonStyle} type="button">
          Reset
        </button>
      </div>
    </>
  );
  if (embedded) return <div data-testid="settings-overlay" style={embeddedSectionStyle}>{content}</div>;
  return <OverlayPanel onClose={onClose} testId="settings-overlay" title="Settings">{content}</OverlayPanel>;
}

function SettingsSlider({
  label,
  onChange,
  testId,
  value
}: {
  label: string;
  onChange: (value: number) => void;
  testId: string;
  value: number;
}) {
  const percent = Math.round(value * 100);
  return (
    <label style={settingsControlStyle}>
      <span>{label}</span>
      <input
        aria-label={label}
        data-testid={testId}
        max={100}
        min={0}
        onChange={(event) => onChange(Number(event.currentTarget.value) / 100)}
        style={settingsRangeStyle}
        type="range"
        value={percent}
      />
      <output data-testid={`${testId}-value`} style={settingsValueStyle}>{percent}%</output>
    </label>
  );
}

function SettingsToggle({
  checked,
  label,
  onChange,
  testId
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
  testId: string;
}) {
  return (
    <label style={settingsControlStyle}>
      <span>{label}</span>
      <input
        aria-label={label}
        checked={checked}
        data-testid={testId}
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
    </label>
  );
}

function SettingsSelect({
  label,
  onChange,
  options,
  testId,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  testId: string;
  value: string;
}) {
  return (
    <label style={settingsControlStyle}>
      <span>{label}</span>
      <select
        aria-label={label}
        data-testid={testId}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={settingsSelectStyle}
        value={value}
      >
        {options.map(([optionValue, text]) => (
          <option key={optionValue} value={optionValue}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function OverlayPanel({ children, onClose, testId, title }: { children: ReactNode; onClose: () => void; testId: string; title: string }) {
  return (
    <section aria-label={title} data-testid={testId} style={panelStyle}>
      <header style={panelHeaderStyle}>
        <h2 style={panelTitleStyle}>{title}</h2>
        <button aria-label={`Close ${title}`} data-testid={`${testId}-close`} onClick={onClose} style={iconButtonStyle} type="button">
          x
        </button>
      </header>
      {children}
    </section>
  );
}

// Interaction surface styles are grouped by effect area. Within each group,
// declarations flow from placement to sizing, layout, spacing, chrome, and text.

// Shared actions.
const primaryButtonStyle: CSSProperties = {
  border: "1px solid #ffd166",
  borderRadius: 6,
  background: "#ffd166",
  color: "#111827",
  fontWeight: 700
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.28)",
  borderRadius: 6,
  background: "rgba(8,13,18,0.78)",
  color: "#f8fbff"
};

const iconButtonStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 6
};

// Title surface.
const titleRootStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 20,
  display: "grid",
  alignItems: "center",
  padding: "min(8vw, 72px)",
  background: "linear-gradient(135deg, #10151b, #263238 58%, #35233d)",
  color: "#f8fbff"
};

const titleContentStyle: CSSProperties = {
  maxWidth: 520,
  display: "grid",
  gap: 20
};

const kickerStyle: CSSProperties = {
  margin: 0,
  color: "#6ee7d8",
  fontSize: 13,
  letterSpacing: 0
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 56,
  lineHeight: 1,
  letterSpacing: 0
};

const titleActionsStyle: CSSProperties = {
  width: 260,
  display: "grid",
  gap: 10
};

// VN command bar.
const commandBarStyle: CSSProperties = {
  position: "absolute",
  zIndex: 10,
  top: 16,
  right: 16,
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: 6
};

function surfacePresentationStyle(
  style: CSSProperties,
  presentation: UiSurfacePresentationLike | undefined
): CSSProperties {
  return presentation ? { ...style, opacity: presentation.opacity } : style;
}

const commandButtonStyle: CSSProperties = {
  border: "1px solid rgba(255, 209, 102, 0.62)",
  borderRadius: 5,
  background: "rgba(10,16,22,0.78)",
  color: "#fff4cf",
  fontSize: 12
};

const activeCommandButtonStyle: CSSProperties = {
  ...commandButtonStyle,
  background: "rgba(255, 209, 102, 0.92)",
  color: "#111827"
};

const disabledCommandButtonStyle: CSSProperties = {
  ...commandButtonStyle,
  opacity: 0.42
};

const tooltipStyle: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 4,
  background: "#0f1720",
  color: "#fff",
  fontSize: 12
};

// Overlay host and shared panel.
const overlayHostStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 32,
  display: "grid",
  placeItems: "center",
  border: "1px solid transparent",
  background: "rgba(2, 6, 10, 0.5)"
};

const panelStyle: CSSProperties = {
  width: "min(920px, calc(100vw - 40px))",
  maxHeight: "min(720px, calc(100vh - 40px))",
  display: "grid",
  gap: 14,
  padding: 18,
  border: "1px solid rgba(255,255,255,0.22)",
  borderRadius: 8,
  background: "rgba(11, 16, 23, 0.94)",
  boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
  color: "#f8fbff"
};

const embeddedSectionStyle: CSSProperties = {
  width: "min(920px, calc(100vw - 40px))",
  maxHeight: "min(650px, calc(100vh - 110px))",
  overflow: "auto",
  display: "grid",
  gap: 14,
  padding: 18,
  border: "1px solid rgba(255,255,255,0.22)",
  borderRadius: 8,
  background: "rgba(11, 16, 23, 0.94)",
  color: "#f8fbff"
};

const panelHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12
};

const panelTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 24,
  letterSpacing: 0
};

const scrollRootStyle: CSSProperties = {
  height: "min(480px, 62vh)",
  overflow: "hidden"
};

const scrollViewportStyle: CSSProperties = {
  width: "100%",
  height: "100%"
};

const scrollbarStyle: CSSProperties = {
  width: 8,
  background: "rgba(255,255,255,0.08)"
};

const scrollThumbStyle: CSSProperties = {
  borderRadius: 999,
  background: "rgba(255,255,255,0.32)"
};

// Backlog overlay.
const emptyStyle: CSSProperties = {
  margin: 0,
  color: "rgba(255,255,255,0.68)"
};

const listStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  margin: 0,
  padding: 0,
  listStyle: "none"
};

const backlogItemStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: 12,
  borderRadius: 6,
  background: "rgba(255,255,255,0.07)"
};

const backlogTextStyle: CSSProperties = {
  whiteSpace: "pre-wrap"
};

// Settings overlay.
const settingsGroupsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  overflow: "auto",
  paddingRight: 4
};

const settingsGroupStyle: CSSProperties = {
  display: "grid",
  alignContent: "start",
  gap: 10,
  padding: 12,
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 6,
  background: "rgba(255,255,255,0.05)"
};

const settingsGroupTitleStyle: CSSProperties = {
  margin: 0,
  color: "#ffd166",
  fontSize: 15,
  letterSpacing: 0
};

const settingsControlStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(100px, 1fr) minmax(92px, 1.2fr) auto",
  alignItems: "center",
  gap: 8,
  color: "rgba(255,255,255,0.82)",
  fontSize: 13
};

const settingsRangeStyle: CSSProperties = {
  width: "100%",
  minWidth: 92
};

const settingsSelectStyle: CSSProperties = {
  minWidth: 120,
  border: "1px solid rgba(255,255,255,0.24)",
  borderRadius: 5,
  background: "#101821",
  color: "#f8fbff"
};

const settingsValueStyle: CSSProperties = {
  minWidth: 38,
  color: "#6ee7d8",
  textAlign: "right",
  fontSize: 12
};

const settingsActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end"
};

// Save/load overlay.
const modeBadgeStyle: CSSProperties = {
  width: "fit-content",
  padding: "3px 8px",
  borderRadius: 999,
  background: "rgba(110,231,216,0.14)",
  color: "#6ee7d8",
  textTransform: "uppercase",
  fontSize: 12
};

const saveLoadErrorStyle: CSSProperties = {
  border: "1px solid rgba(248,113,113,0.35)",
  borderRadius: 6,
  padding: "8px 10px",
  color: "#fecaca",
  background: "rgba(127,29,29,0.28)",
  fontSize: 12
};

const slotGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10
};

const slotStyle: CSSProperties = {
  minHeight: 110,
  display: "grid",
  alignContent: "start",
  gap: 6,
  border: "1px solid rgba(110,231,216,0.35)",
  borderRadius: 6,
  background: "rgba(255,255,255,0.07)",
  color: "#f8fbff",
  textAlign: "left"
};

const slotThumbnailStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "16 / 9",
  height: "auto",
  objectFit: "cover",
  borderRadius: 4,
  background: "rgba(0,0,0,0.22)"
};

const slotThumbnailPlaceholderStyle: CSSProperties = {
  display: "block",
  width: "100%",
  aspectRatio: "16 / 9",
  borderRadius: 4,
  background: "linear-gradient(135deg, rgba(255,255,255,0.11), rgba(110,231,216,0.08))"
};

const disabledSlotStyle: CSSProperties = {
  ...slotStyle,
  opacity: 0.42
};

const slotPagerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  marginTop: 12
};

const slotPagerIndicatorStyle: CSSProperties = {
  minWidth: 88,
  color: "rgba(255,255,255,0.72)",
  fontSize: 12,
  textAlign: "center"
};

// Load confirmation dialog.
const confirmOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 40,
  background: "rgba(0,0,0,0.46)"
};

const confirmContentStyle: CSSProperties = {
  position: "fixed",
  zIndex: 41,
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(420px, calc(100vw - 32px))",
  padding: 18,
  border: "1px solid rgba(255,255,255,0.22)",
  borderRadius: 8,
  background: "#101821",
  color: "#fff"
};

const confirmTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 20
};

const confirmTextStyle: CSSProperties = {
  margin: "10px 0 0",
  color: "rgba(255,255,255,0.75)"
};

const confirmActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 18
};
