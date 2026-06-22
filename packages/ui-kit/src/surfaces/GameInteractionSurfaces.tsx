import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Tooltip from "@radix-ui/react-tooltip";
import type {
  GameOverlayKind,
  GameUiAction,
  InteractionCapabilitySnapshot,
  InteractionStyleProfile,
  SaveSlotSummary,
  StoryBacklogEntry
} from "@v-ronpa/contracts";
import type { CSSProperties, ReactNode } from "react";

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
  capabilities: InteractionCapabilitySnapshot;
  activeActions?: Partial<Record<GameUiAction, boolean>>;
  onAction: (action: GameUiAction) => void;
}

export function VnCommandBar({ activeActions = {}, capabilities, onAction }: VnCommandBarProps) {
  const commands: Array<{ action: GameUiAction; label: string; enabled: boolean; testId: string }> = [
    { action: "open-backlog", label: "LOG", enabled: capabilities.canOpenBacklog, testId: "vn-command-backlog" },
    { action: "toggle-skip", label: "SKIP", enabled: capabilities.canSkip, testId: "vn-command-skip" },
    { action: "toggle-auto", label: "AUTO", enabled: capabilities.canAuto, testId: "vn-command-auto" },
    { action: "open-save", label: "SAVE", enabled: capabilities.canSave, testId: "vn-command-save" },
    { action: "open-load", label: "LOAD", enabled: capabilities.canLoad, testId: "vn-command-load" },
    { action: "open-settings", label: "SETTING", enabled: capabilities.canOpenSettings, testId: "vn-command-settings" }
  ];

  return (
    <Tooltip.Provider delayDuration={120}>
      <nav aria-label="VN command bar" data-testid="vn-command-bar" style={commandBarStyle}>
        {commands.map((command) => {
          const active = Boolean(activeActions[command.action]);
          const toggleCommand = command.action === "toggle-auto" || command.action === "toggle-skip";
          return (
            <Tooltip.Root key={command.testId}>
              <Tooltip.Trigger asChild>
                <button
                  {...(toggleCommand ? { "aria-pressed": active } : {})}
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
  styleProfile?: InteractionStyleProfile;
}

export function GameOverlayHost({ activeOverlay, children, styleProfile }: GameOverlayHostProps) {
  if (!activeOverlay) return null;
  const accentColor = styleProfile?.tokens.accentColor ?? "#ffd166";
  return (
    <div data-overlay={activeOverlay} data-testid="game-overlay-host" style={{ ...overlayHostStyle, borderColor: accentColor }}>
      {children}
    </div>
  );
}

export interface ReadOnlyBacklogOverlayProps {
  entries: StoryBacklogEntry[];
  onClose: () => void;
}

export function ReadOnlyBacklogOverlay({ entries, onClose }: ReadOnlyBacklogOverlayProps) {
  return (
    <OverlayPanel onClose={onClose} testId="backlog-overlay" title="Backlog">
      <ScrollArea.Root style={scrollRootStyle}>
        <ScrollArea.Viewport style={scrollViewportStyle}>
          {entries.length === 0 ? (
            <p data-testid="backlog-empty" style={emptyStyle}>No backlog yet.</p>
          ) : (
            <ol data-testid="backlog-list" style={listStyle}>
              {entries.map((entry, index) => (
                <li data-testid={`backlog-entry-${index}`} key={`${entry.speaker ?? "narrator"}-${index}`} style={backlogItemStyle}>
                  <strong>{entry.speaker ?? "Narrator"}</strong>
                  <span>{entry.text}</span>
                </li>
              ))}
            </ol>
          )}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" style={scrollbarStyle}>
          <ScrollArea.Thumb style={scrollThumbStyle} />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </OverlayPanel>
  );
}

export interface SaveLoadOverlayProps {
  mode: "save" | "load";
  slotIds: string[];
  slots: SaveSlotSummary[];
  canSave: boolean;
  pendingLoadSlot: SaveSlotSummary | undefined;
  onSave: (slotId: string) => void;
  onRequestLoad: (slotId: string) => void;
  onConfirmLoad: () => void;
  onCancelLoad: () => void;
  onClose: () => void;
}

export function SaveLoadOverlay({
  mode,
  slotIds,
  slots,
  canSave,
  pendingLoadSlot,
  onSave,
  onRequestLoad,
  onConfirmLoad,
  onCancelLoad,
  onClose
}: SaveLoadOverlayProps) {
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const title = mode === "save" ? "Save Game" : "Load Game";

  return (
    <OverlayPanel onClose={onClose} testId="save-load-overlay" title={title}>
      <div data-testid="save-load-mode" style={modeBadgeStyle}>{mode}</div>
      <div data-testid="save-slot-grid" style={slotGridStyle}>
        {slotIds.map((slotId, index) => {
          const slot = slotsById.get(slotId);
          const disabled = mode === "save" ? !canSave : !slot;
          return (
            <button
              data-testid={`save-slot-${index + 1}`}
              disabled={disabled}
              key={slotId}
              onClick={() => (mode === "save" ? onSave(slotId) : onRequestLoad(slotId))}
              style={disabled ? disabledSlotStyle : slotStyle}
              type="button"
            >
              <strong>{slot?.label ?? `Slot ${index + 1}`}</strong>
              <span>{slot ? new Date(slot.savedAt).toLocaleString() : "Empty"}</span>
              <small>{slot?.speaker ? `${slot.speaker}: ${slot.text ?? ""}` : slot?.text ?? "No data"}</small>
            </button>
          );
        })}
      </div>
      <AlertDialog.Root open={Boolean(pendingLoadSlot)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay style={confirmOverlayStyle} />
          <AlertDialog.Content data-testid="load-confirmation" style={confirmContentStyle}>
            <AlertDialog.Title style={confirmTitleStyle}>Load this slot?</AlertDialog.Title>
            <AlertDialog.Description style={confirmTextStyle}>
              Current progress will be replaced by {pendingLoadSlot?.label ?? "this save"}.
            </AlertDialog.Description>
            <div style={confirmActionsStyle}>
              <AlertDialog.Cancel asChild>
                <button data-testid="load-cancel" onClick={onCancelLoad} style={secondaryButtonStyle} type="button">
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button data-testid="load-confirm" onClick={onConfirmLoad} style={primaryButtonStyle} type="button">
                  Load
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </OverlayPanel>
  );
}

export interface SettingsOverlayProps {
  onClose: () => void;
}

export function SettingsOverlay({ onClose }: SettingsOverlayProps) {
  return (
    <OverlayPanel onClose={onClose} testId="settings-overlay" title="Settings">
      <div aria-label="Settings placeholder" data-testid="settings-empty" style={emptyPanelStyle} />
    </OverlayPanel>
  );
}

export interface PauseMenuOverlayProps {
  capabilities: InteractionCapabilitySnapshot;
  onAction: (action: GameUiAction) => void;
  onClose: () => void;
}

export function PauseMenuOverlay({ capabilities, onAction, onClose }: PauseMenuOverlayProps) {
  return (
    <OverlayPanel onClose={onClose} testId="pause-menu-overlay" title="Pause">
      <div style={pauseActionsStyle}>
        <button data-testid="pause-save" disabled={!capabilities.canSave} onClick={() => onAction("open-save")} style={secondaryButtonStyle} type="button">
          Save
        </button>
        <button data-testid="pause-load" disabled={!capabilities.canLoad} onClick={() => onAction("open-load")} style={secondaryButtonStyle} type="button">
          Load
        </button>
        <button data-testid="pause-settings" disabled={!capabilities.canOpenSettings} onClick={() => onAction("open-settings")} style={secondaryButtonStyle} type="button">
          Settings
        </button>
        <button data-testid="pause-return-title" disabled={!capabilities.canReturnTitle} onClick={() => onAction("return-title")} style={secondaryButtonStyle} type="button">
          Return Title
        </button>
      </div>
    </OverlayPanel>
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

const titleContentStyle: CSSProperties = { display: "grid", gap: 20, maxWidth: 520 };
const kickerStyle: CSSProperties = { margin: 0, color: "#6ee7d8", fontSize: 13, letterSpacing: 0 };
const titleStyle: CSSProperties = { margin: 0, fontSize: 56, lineHeight: 1, letterSpacing: 0 };
const titleActionsStyle: CSSProperties = { display: "grid", gap: 10, width: 260 };
const primaryButtonStyle: CSSProperties = { borderRadius: 6, border: "1px solid #ffd166", background: "#ffd166", color: "#111827", fontWeight: 700 };
const secondaryButtonStyle: CSSProperties = { borderRadius: 6, border: "1px solid rgba(255,255,255,0.28)", background: "rgba(8,13,18,0.78)", color: "#f8fbff" };
const commandBarStyle: CSSProperties = { position: "absolute", zIndex: 10, top: 16, right: 16, display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" };
const commandButtonStyle: CSSProperties = { borderRadius: 5, border: "1px solid rgba(255, 209, 102, 0.62)", background: "rgba(10,16,22,0.78)", color: "#fff4cf", fontSize: 12 };
const activeCommandButtonStyle: CSSProperties = { ...commandButtonStyle, background: "rgba(255, 209, 102, 0.92)", color: "#111827" };
const disabledCommandButtonStyle: CSSProperties = { ...commandButtonStyle, opacity: 0.42 };
const tooltipStyle: CSSProperties = { padding: "4px 8px", borderRadius: 4, background: "#0f1720", color: "#fff", fontSize: 12 };
const overlayHostStyle: CSSProperties = { position: "absolute", zIndex: 32, inset: 0, display: "grid", placeItems: "center", background: "rgba(2, 6, 10, 0.5)", border: "1px solid transparent" };
const panelStyle: CSSProperties = { width: "min(920px, calc(100vw - 40px))", maxHeight: "min(720px, calc(100vh - 40px))", display: "grid", gap: 14, padding: 18, borderRadius: 8, border: "1px solid rgba(255,255,255,0.22)", background: "rgba(11, 16, 23, 0.94)", color: "#f8fbff", boxShadow: "0 24px 80px rgba(0,0,0,0.45)" };
const panelHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 };
const panelTitleStyle: CSSProperties = { margin: 0, fontSize: 24, letterSpacing: 0 };
const iconButtonStyle: CSSProperties = { width: 32, height: 32, borderRadius: 6 };
const scrollRootStyle: CSSProperties = { height: "min(480px, 62vh)", overflow: "hidden" };
const scrollViewportStyle: CSSProperties = { width: "100%", height: "100%" };
const scrollbarStyle: CSSProperties = { width: 8, background: "rgba(255,255,255,0.08)" };
const scrollThumbStyle: CSSProperties = { borderRadius: 999, background: "rgba(255,255,255,0.32)" };
const emptyStyle: CSSProperties = { margin: 0, color: "rgba(255,255,255,0.68)" };
const emptyPanelStyle: CSSProperties = { minHeight: 180, display: "grid", placeItems: "center", border: "1px dashed rgba(255,255,255,0.22)", borderRadius: 6, color: "rgba(255,255,255,0.72)" };
const listStyle: CSSProperties = { display: "grid", gap: 10, margin: 0, padding: 0, listStyle: "none" };
const backlogItemStyle: CSSProperties = { display: "grid", gap: 4, padding: 12, borderRadius: 6, background: "rgba(255,255,255,0.07)" };
const modeBadgeStyle: CSSProperties = { width: "fit-content", padding: "3px 8px", borderRadius: 999, background: "rgba(110,231,216,0.14)", color: "#6ee7d8", textTransform: "uppercase", fontSize: 12 };
const slotGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 };
const slotStyle: CSSProperties = { minHeight: 110, display: "grid", gap: 6, alignContent: "start", textAlign: "left", borderRadius: 6, border: "1px solid rgba(110,231,216,0.35)", background: "rgba(255,255,255,0.07)", color: "#f8fbff" };
const disabledSlotStyle: CSSProperties = { ...slotStyle, opacity: 0.42 };
const confirmOverlayStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.46)" };
const confirmContentStyle: CSSProperties = { position: "fixed", zIndex: 41, left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: "min(420px, calc(100vw - 32px))", padding: 18, borderRadius: 8, border: "1px solid rgba(255,255,255,0.22)", background: "#101821", color: "#fff" };
const confirmTitleStyle: CSSProperties = { margin: 0, fontSize: 20 };
const confirmTextStyle: CSSProperties = { margin: "10px 0 0", color: "rgba(255,255,255,0.75)" };
const confirmActionsStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 };
const pauseActionsStyle: CSSProperties = { display: "grid", gap: 10, width: "min(320px, 100%)" };
