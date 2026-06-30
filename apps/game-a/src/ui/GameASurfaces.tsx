import type { CSSProperties, FormEvent, ReactNode } from "react";
import type {
  BacklogOverlayActions,
  BacklogOverlayViewModel,
  GameInteractionShellSurfaces,
  PauseMenuOverlayActions,
  PauseMenuOverlayViewModel,
  RuntimeInputPromptActions,
  RuntimeInputPromptViewModel,
  RuntimeToastActions,
  RuntimeToastLayerViewModel,
  SaveLoadOverlayActions,
  SaveLoadOverlayViewModel,
  SettingsOverlayActions,
  SettingsOverlayViewModel,
  SurfaceSlotProps,
  TitleActions,
  TitleViewModel,
  VnChoicesActions,
  VnChoicesViewModel,
  VnCommandBarActions,
  VnCommandBarViewModel,
  VnDialogViewModel
} from "@v-ronpa/app-vn-shell";
import { RichTextRenderer, SurfaceFrame } from "@v-ronpa/ui-kit";
import type { GameAUiConfig } from "./gameAUiConfig";
import type { GameAUiAssets } from "./resolveGameAUiAssets";

export function createGameASurfaces({
  assets,
  config
}: {
  assets: GameAUiAssets;
  config: GameAUiConfig;
}): GameInteractionShellSurfaces {
  return {
    Dialog: (props) => <GameADialogSurface {...props} assets={assets} config={config} />,
    Choices: GameAChoiceOverlay,
    CommandBar: GameACommandBar,
    Title: (props) => <GameATitleSurface {...props} config={config} />,
    ToastLayer: GameAToastLayer,
    InputPrompt: GameAInputPrompt,
    BacklogOverlay: GameABacklogOverlay,
    SaveLoadOverlay: GameASaveLoadOverlay,
    SettingsOverlay: GameASettingsOverlay,
    PauseMenuOverlay: GameAPauseMenuOverlay
  };
}

export function GameADialogSurface({
  assets,
  config,
  model
}: SurfaceSlotProps<VnDialogViewModel> & {
  assets: GameAUiAssets;
  config: GameAUiConfig;
}) {
  const frameStyle = {
    "--game-a-dialog-frame": assets.dialogFrameUri ? `url(${assets.dialogFrameUri})` : undefined
  } as CSSProperties;
  return (
    <SurfaceFrame
      aria-label="视觉小说对话"
      as="section"
      data-frame={assets.dialogFrameUri ? "resolved" : "fallback"}
      data-state={model.state}
      data-testid="vn-dialog-surface"
      role="region"
      className="game-a-dialog-surface"
      style={frameStyle}
    >
      <div className="game-a-dialog-header">
        {config.dialog.showSpeakerName && model.speakerLabel ? (
          <div data-testid="vn-dialog-speaker" className="game-a-dialog-speaker">
            {model.speakerLabel}
          </div>
        ) : null}
        <div aria-live="polite" data-testid="vn-dialog-state" className="game-a-dialog-state">
          {model.state === "ended" ? "已结束" : model.state === "choices" ? "等待选择" : "阅读中"}
        </div>
      </div>
      <p data-testid="vn-dialog-text" className={`game-a-dialog-text game-a-dialog-text-${model.display?.textSize ?? "medium"}`}>
        <RichTextRenderer document={model.richText} fallbackText={model.text} />
      </p>
    </SurfaceFrame>
  );
}

function GameAChoiceOverlay({ actions, model }: SurfaceSlotProps<VnChoicesViewModel, VnChoicesActions>) {
  if (!model.visible || model.choices.length === 0) return null;
  return (
    <section aria-label="对话选项" data-testid="vn-choice-overlay" className="game-a-choice-overlay">
      <div className="game-a-choice-list">
        {model.choices.map((choice, index) => (
          <button
            aria-disabled={choice.enabled === false}
            className="game-a-choice-button"
            data-testid={`vn-choice-${index}`}
            disabled={choice.enabled === false}
            key={`${choice.id ?? choice.text}-${index}`}
            onClick={() => actions.choose(index, choice)}
            type="button"
          >
            <RichTextRenderer document={choice.richText} fallbackText={choice.text} />
          </button>
        ))}
      </div>
    </section>
  );
}

function GameACommandBar({ actions, model }: SurfaceSlotProps<VnCommandBarViewModel, VnCommandBarActions>) {
  if (!model.visible) return null;
  return (
    <nav aria-label="VN command bar" data-testid="vn-command-bar" className="game-a-command-bar">
      {model.commands.map((command) => (
        <button
          {...(command.toggle ? { "aria-pressed": command.active } : {})}
          className={command.active ? "game-a-command-button game-a-command-button-active" : "game-a-command-button"}
          data-testid={command.testId}
          disabled={!command.enabled}
          key={command.testId}
          onClick={() => actions.dispatch(command.action)}
          type="button"
        >
          {command.label}
        </button>
      ))}
    </nav>
  );
}

function GameATitleSurface({ actions, config, model }: SurfaceSlotProps<TitleViewModel, TitleActions> & { config: GameAUiConfig }) {
  if (!model.visible) return null;
  return (
    <section aria-label="Title menu" data-testid="title-surface" className="game-a-title-surface">
      <div className="game-a-title-panel">
        <span className="game-a-title-kicker">VN Framework</span>
        <h1>{config.title.title}</h1>
        <button data-testid="title-new-game" disabled={!model.capabilities.canStartNewGame} onClick={() => actions.dispatch("new-game")} type="button">
          New Game
        </button>
        <button data-testid="title-load" disabled={!model.capabilities.canLoad} onClick={() => actions.dispatch("open-load")} type="button">
          Load
        </button>
        <button data-testid="title-settings" disabled={!model.capabilities.canOpenSettings} onClick={() => actions.dispatch("open-settings")} type="button">
          Settings
        </button>
      </div>
    </section>
  );
}

function GameAToastLayer({ actions, model }: SurfaceSlotProps<RuntimeToastLayerViewModel, RuntimeToastActions>) {
  if (!model.visible || model.toasts.length === 0) return null;
  return (
    <div aria-live="polite" data-testid="runtime-toast-layer" className="game-a-toast-layer">
      {model.toasts.map((toast) => (
        <button data-testid="runtime-toast" key={toast.id} onClick={() => actions.dismiss(toast.id)} type="button">
          <RichTextRenderer document={toast.richText} fallbackText={toast.text} />
        </button>
      ))}
    </div>
  );
}

function GameAInputPrompt({ actions, model }: SurfaceSlotProps<RuntimeInputPromptViewModel, RuntimeInputPromptActions>) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const field = form.elements.namedItem("runtime-input") as HTMLInputElement | null;
    actions.submit(field?.value ?? "");
  }

  return (
    <form aria-label="Runtime input prompt" data-testid="runtime-input-prompt" className="game-a-input-prompt" onSubmit={submit}>
      <label>
        <span>{model.prompt.summary ?? model.prompt.variableName}</span>
        <input
          data-testid="runtime-input-field"
          defaultValue={model.prompt.defaultValue === undefined ? "" : String(model.prompt.defaultValue)}
          name="runtime-input"
          type={model.prompt.valueType === "number" ? "number" : "text"}
        />
      </label>
      <button data-testid="runtime-input-submit" type="submit">
        OK
      </button>
    </form>
  );
}

function GameABacklogOverlay({ actions, model }: SurfaceSlotProps<BacklogOverlayViewModel, BacklogOverlayActions>) {
  return (
    <GameAOverlayPanel onClose={actions.close} testId="backlog-overlay" title="Backlog">
      {model.entries.length === 0 ? (
        <p data-testid="backlog-empty" className="game-a-overlay-empty">No backlog yet.</p>
      ) : (
        <ol data-testid="backlog-list" className="game-a-backlog-list">
          {model.entries.map((entry, index) => (
            <li data-testid={`backlog-entry-${index}`} key={`${entry.speaker ?? "narrator"}-${index}`}>
              <strong>{entry.speaker ?? "Narrator"}</strong>
              <span>
                <RichTextRenderer document={entry.richText} fallbackText={entry.text} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </GameAOverlayPanel>
  );
}

function GameASaveLoadOverlay({ actions, model }: SurfaceSlotProps<SaveLoadOverlayViewModel, SaveLoadOverlayActions>) {
  const slotsById = new Map(model.slots.map((slot) => [slot.id, slot]));
  return (
    <GameAOverlayPanel onClose={actions.close} testId="save-load-overlay" title={model.mode === "save" ? "Save Game" : "Load Game"}>
      <div data-testid="save-load-mode" className="game-a-mode-badge">{model.mode}</div>
      <div data-testid="save-slot-grid" className="game-a-save-grid">
        {model.slotIds.map((slotId, index) => {
          const slot = slotsById.get(slotId);
          const disabled = model.mode === "save" ? !model.canSave : !slot;
          return (
            <button
              data-testid={`save-slot-${index + 1}`}
              disabled={disabled}
              key={slotId}
              onClick={() => (model.mode === "save" ? actions.save(slotId) : actions.requestLoad(slotId))}
              type="button"
            >
              <strong>{slot?.label ?? `Slot ${index + 1}`}</strong>
              <span>{slot ? new Date(slot.savedAt).toLocaleString() : "Empty"}</span>
              <small>{slot?.speaker ? `${slot.speaker}: ${slot.text ?? ""}` : slot?.text ?? "No data"}</small>
            </button>
          );
        })}
      </div>
      {model.pendingLoadSlot ? (
        <div data-testid="load-confirmation" className="game-a-load-confirmation" role="alertdialog" aria-modal="true">
          <strong>Load this slot?</strong>
          <span>Current progress will be replaced by {model.pendingLoadSlot.label}.</span>
          <div>
            <button data-testid="load-cancel" onClick={actions.cancelLoad} type="button">
              Cancel
            </button>
            <button data-testid="load-confirm" onClick={actions.confirmLoad} type="button">
              Load
            </button>
          </div>
        </div>
      ) : null}
    </GameAOverlayPanel>
  );
}

function GameASettingsOverlay({ actions, model }: SurfaceSlotProps<SettingsOverlayViewModel, SettingsOverlayActions>) {
  return (
    <GameAOverlayPanel onClose={actions.close} testId="settings-overlay" title="Settings">
      <div data-testid="settings-groups" className="game-a-settings-grid">
        <section data-testid="settings-group-system" aria-label="System settings">
          <h3>System</h3>
          <label>
            <span>Language</span>
            <select
              aria-label="Language"
              data-testid="settings-system-language"
              onChange={(event) => actions.patchSettings({ system: { language: event.currentTarget.value as SettingsOverlayViewModel["settings"]["system"]["language"] } })}
              value={model.settings.system.language}
            >
              <option value="zh-CN">Chinese (Simplified)</option>
              <option value="zh-TW">Chinese (Traditional)</option>
              <option value="en">English</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
            </select>
          </label>
          <GameAToggle
            checked={model.settings.system.skipAll}
            label="Skip unread text"
            onChange={(skipAll) => actions.patchSettings({ system: { skipAll } })}
            testId="settings-system-skip-all"
          />
          <GameAToggle
            checked={model.settings.system.preferFullscreen}
            label="Prefer fullscreen"
            onChange={(preferFullscreen) => actions.patchSettings({ system: { preferFullscreen } })}
            testId="settings-system-fullscreen"
          />
        </section>
        <section data-testid="settings-group-display" aria-label="Display settings">
          <h3>Display</h3>
          <label>
            <span>Text size</span>
            <select
              aria-label="Text size"
              data-testid="settings-display-text-size"
              onChange={(event) => actions.patchSettings({ display: { textSize: event.currentTarget.value as SettingsOverlayViewModel["settings"]["display"]["textSize"] } })}
              value={model.settings.display.textSize}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </label>
          <GameASlider label="Text speed" onChange={(textSpeed) => actions.patchSettings({ display: { textSpeed } })} testId="settings-display-text-speed" value={model.settings.display.textSpeed} />
          <GameASlider label="Textbox opacity" onChange={(textboxOpacity) => actions.patchSettings({ display: { textboxOpacity } })} testId="settings-display-textbox-opacity" value={model.settings.display.textboxOpacity} />
        </section>
        <section data-testid="settings-group-sound" aria-label="Sound settings">
          <h3>Sound</h3>
          <GameAToggle checked={model.settings.sound.muted} label="Mute all" onChange={(muted) => actions.patchSettings({ sound: { muted } })} testId="settings-sound-muted" />
          <GameASlider label="Master volume" onChange={(masterVolume) => actions.patchSettings({ sound: { masterVolume } })} testId="settings-sound-master" value={model.settings.sound.masterVolume} />
          <GameASlider label="BGM volume" onChange={(bgmVolume) => actions.patchSettings({ sound: { bgmVolume } })} testId="settings-sound-bgm" value={model.settings.sound.bgmVolume} />
          <GameASlider label="SFX volume" onChange={(sfxVolume) => actions.patchSettings({ sound: { sfxVolume } })} testId="settings-sound-sfx" value={model.settings.sound.sfxVolume} />
          <GameASlider label="Bleep volume" onChange={(bleepVolume) => actions.patchSettings({ sound: { bleepVolume } })} testId="settings-sound-bleep" value={model.settings.sound.bleepVolume} />
          <GameASlider label="Voice volume" onChange={(voiceVolume) => actions.patchSettings({ sound: { voiceVolume } })} testId="settings-sound-voice" value={model.settings.sound.voiceVolume} />
        </section>
        <section data-testid="settings-group-automation" aria-label="Automation settings">
          <h3>Automation</h3>
          <GameASlider label="Auto speed" onChange={(autoSpeed) => actions.patchSettings({ automation: { autoSpeed } })} testId="settings-automation-auto-speed" value={model.settings.automation.autoSpeed} />
          <GameASlider label="Skip speed" onChange={(skipSpeed) => actions.patchSettings({ automation: { skipSpeed } })} testId="settings-automation-skip-speed" value={model.settings.automation.skipSpeed} />
        </section>
      </div>
      <button data-testid="settings-reset" onClick={actions.resetSettings} type="button">
        Reset
      </button>
    </GameAOverlayPanel>
  );
}

function GameAPauseMenuOverlay({ actions, model }: SurfaceSlotProps<PauseMenuOverlayViewModel, PauseMenuOverlayActions>) {
  return (
    <GameAOverlayPanel onClose={actions.close} testId="pause-menu-overlay" title="Pause">
      <div className="game-a-pause-actions">
        <button data-testid="pause-save" disabled={!model.capabilities.canSave} onClick={() => actions.dispatch("open-save")} type="button">
          Save
        </button>
        <button data-testid="pause-load" disabled={!model.capabilities.canLoad} onClick={() => actions.dispatch("open-load")} type="button">
          Load
        </button>
        <button data-testid="pause-settings" disabled={!model.capabilities.canOpenSettings} onClick={() => actions.dispatch("open-settings")} type="button">
          Settings
        </button>
        <button data-testid="pause-return-title" disabled={!model.capabilities.canReturnTitle} onClick={() => actions.dispatch("return-title")} type="button">
          Return Title
        </button>
      </div>
    </GameAOverlayPanel>
  );
}

function GameAOverlayPanel({
  children,
  onClose,
  testId,
  title
}: {
  children: ReactNode;
  onClose: () => void;
  testId: string;
  title: string;
}) {
  return (
    <section aria-label={title} data-testid={testId} className="game-a-overlay-panel">
      <header>
        <h2>{title}</h2>
        <button aria-label={`Close ${title}`} data-testid={`${testId}-close`} onClick={onClose} type="button">
          x
        </button>
      </header>
      {children}
    </section>
  );
}

function GameASlider({
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
    <label>
      <span>{label}</span>
      <input
        aria-label={label}
        data-testid={testId}
        max={100}
        min={0}
        onChange={(event) => onChange(Number(event.currentTarget.value) / 100)}
        type="range"
        value={percent}
      />
      <output data-testid={`${testId}-value`}>{percent}%</output>
    </label>
  );
}

function GameAToggle({
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
    <label>
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
