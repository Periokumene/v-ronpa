import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type {
  BacklogOverlayActions,
  BacklogOverlayViewModel,
  GameInteractionShellSurfaces,
  PauseSurfaceActions,
  PauseSurfaceViewModel,
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
  VnCueViewModel,
  VnDialogViewModel
} from "@v-ronpa/app-vn-shell";
import {
  VN_PAUSE_SECTIONS,
  SETTINGS_LANGUAGE_OPTIONS,
  SETTINGS_SECTION_DESCRIPTORS,
  SETTINGS_TEXT_SIZE_OPTIONS,
  adjacentSettingsOption,
  createEscapeCaptureRef,
  normalizeSettingsStep,
  type SettingsOption,
  type SettingsSectionId
} from "@v-ronpa/app-vn-shell";
import type { GamePauseSection, GameUiAction, InteractionCapabilitySnapshot } from "@v-ronpa/contracts";
import {
  paginateSaveLoadSlotIds,
  RichTextRenderer,
  SAVE_LOAD_SLOTS_PER_PAGE,
  SurfaceFrame,
  VnCueSurface as SharedVnCueSurface
} from "@v-ronpa/ui-kit";
import type { GameAUiConfig } from "./gameAUiConfig";
import type { GameAUiAssets } from "./resolveGameAUiAssets";

export interface GameASurfaceNavigation {
  pauseSection?: GamePauseSection | undefined;
  capabilities: InteractionCapabilitySnapshot;
  dispatch(action: GameUiAction): void;
}

export function createGameASurfaces({
  assets,
  config,
  navigation,
  vnPreparationPending
}: {
  assets: GameAUiAssets;
  config: GameAUiConfig;
  navigation: GameASurfaceNavigation;
  vnPreparationPending: boolean;
}): GameInteractionShellSurfaces {
  return {
    Dialog: (props) => <GameADialogSurface {...props} assets={assets} config={config} />,
    Cue: GameACueSurface,
    Choices: GameAChoiceOverlay,
    CommandBar: GameACommandBar,
    Title: (props) => <GameATitleSurface {...props} assets={assets} config={config} vnPreparationPending={vnPreparationPending} />,
    ToastLayer: GameAToastLayer,
    InputPrompt: GameAInputPrompt,
    PauseSurface: GameAPauseSurface,
    BacklogOverlay: (props) => <GameABacklogOverlay {...props} navigation={navigation} />,
    SaveLoadOverlay: (props) => <GameASaveLoadOverlay {...props} navigation={navigation} />,
    SettingsOverlay: (props) => <GameASettingsOverlay {...props} navigation={navigation} />
  };
}

export function GameACueSurface({ model }: SurfaceSlotProps<VnCueViewModel>) {
  return (
    <SharedVnCueSurface
      {...(model.authorId ? { author: model.authorId } : {})}
      text={model.text}
      {...(model.richText ? { richText: model.richText } : {})}
      {...(model.display ? { displaySettings: model.display } : {})}
      presentation={model.presentation}
    />
  );
}

export function GameADialogSurface({
  assets,
  config,
  model
}: SurfaceSlotProps<VnDialogViewModel> & {
  assets: GameAUiAssets;
  config: GameAUiConfig;
}) {
  return (
    <SurfaceFrame
      aria-label="视觉小说对话"
      as="section"
      data-frame={assets.dialogFrameUri ? "resolved" : "fallback"}
      data-dialog-background-opacity={String(model.appearance.backgroundOpacity)}
      data-state={model.state}
      data-ui-phase={model.presentation.phase}
      data-testid="vn-dialog-surface"
      role="region"
      className="game-a-dialog-surface"
      style={gameADialogStyle(model)}
    >
      {config.dialog.showSpeakerName && model.speakerLabel ? (
        <div data-testid="vn-dialog-speaker" className="game-a-dialog-speaker">
          {formatGameASpeakerLabel(model.speakerLabel)}
        </div>
      ) : null}
      <div aria-live="polite" data-testid="vn-dialog-state" className="game-a-dialog-state game-a-screen-reader-only">
        {model.state === "ended" ? "已结束" : model.state === "choices" ? "等待选择" : "阅读中"}
      </div>
      <div className="game-a-dialog-copy">
        <p data-testid="vn-dialog-text" className={`game-a-dialog-text game-a-dialog-text-${model.display?.textSize ?? "medium"}`}>
          <RichTextRenderer document={model.richText} fallbackText={model.text} />
        </p>
      </div>
    </SurfaceFrame>
  );
}

function GameAChoiceOverlay({ actions, model }: SurfaceSlotProps<VnChoicesViewModel, VnChoicesActions>) {
  if (!model.visible || model.choices.length === 0) return null;

  function selectChoice(index: number, choice: VnChoicesViewModel["choices"][number]) {
    if (choice.enabled === false) return;
    actions.choose(index, choice);
  }

  return (
    <section aria-label="对话选项" data-testid="vn-choice-overlay" role="group" className="game-a-choice-overlay">
      <div className="game-a-choice-list">
        {model.choices.map((choice, index) => (
          <button
            aria-disabled={choice.enabled === false}
            className="game-a-choice-button"
            data-testid={`vn-choice-${index}`}
            disabled={choice.enabled === false}
            key={`${choice.id ?? choice.text}-${index}`}
            onClick={() => selectChoice(index, choice)}
            type="button"
          >
            <span className="game-a-choice-copy">
              <RichTextRenderer document={choice.richText} fallbackText={choice.text} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function GameACommandBar({ actions, model }: SurfaceSlotProps<VnCommandBarViewModel, VnCommandBarActions>) {
  if (!model.visible) return null;
  return (
    <nav
      aria-label="视觉小说指令栏"
      data-testid="vn-command-bar"
      data-ui-phase={model.presentation.phase}
      className="game-a-command-bar"
      style={{ opacity: model.presentation.opacity }}
    >
      {model.commands.map((command) => (
        <button
          {...(command.toggle ? { "aria-pressed": command.active } : {})}
          className={command.active ? "game-a-command-button game-a-command-button-active" : "game-a-command-button"}
          data-action={command.action}
          data-testid={command.testId}
          disabled={!command.enabled}
          key={command.testId}
          onClick={() => actions.dispatch(command.action)}
          type="button"
        >
          {formatGameACommandLabel(command.label)}
        </button>
      ))}
    </nav>
  );
}

function formatGameASpeakerLabel(label: string): string {
  return `[${label.toUpperCase()}]`;
}

function formatGameACommandLabel(label: string): string {
  const normalized = label.toUpperCase();
  if (normalized === "SETTING" || normalized === "SETTINGS") return "SETTINGS";
  return normalized;
}

function gameADialogStyle(model: VnDialogViewModel): CSSProperties & Record<string, string | number> {
  return {
    opacity: model.presentation.opacity,
    "--game-a-dialog-background-opacity": model.appearance.backgroundOpacity
  };
}

function formatSaveLoadOverlayTitle(mode: SaveLoadOverlayViewModel["mode"], context: "pause" | "title"): string {
  if (context === "title") return mode === "save" ? "保存游戏" : "读取游戏";
  return mode === "save" ? "保存数据" : "读取数据";
}

function GameATitleSurface({
  actions,
  assets,
  config,
  model,
  vnPreparationPending
}: SurfaceSlotProps<TitleViewModel, TitleActions> & {
  assets: GameAUiAssets;
  config: GameAUiConfig;
  vnPreparationPending: boolean;
}) {
  if (!model.visible) return null;
  return (
    <section
      aria-label="标题菜单"
      className="game-a-title-surface"
      data-background={assets.titleBackgroundUri ? "resolved" : "fallback"}
      data-testid="title-surface"
    >
      <div className="game-a-title-artboard" data-testid="title-artboard">
        {assets.titleBackgroundUri ? (
          <img
            alt=""
            aria-hidden="true"
            className="game-a-title-background"
            data-testid="title-background"
            draggable={false}
            fetchPriority="high"
            src={assets.titleBackgroundUri}
          />
        ) : null}
        <h1 className="game-a-screen-reader-only">{config.title.title}</h1>
        <nav aria-label="主菜单" className="game-a-title-menu" data-testid="title-menu">
          <button
            {...(vnPreparationPending
              ? { "aria-busy": true, "aria-label": "开始故事（角色资源准备中）" }
              : {})}
            className="game-a-title-menu-button"
            data-testid="title-new-game"
            disabled={!model.capabilities.canStartNewGame || vnPreparationPending}
            onClick={() => actions.dispatch("new-game")}
            type="button"
          >
            <span aria-hidden="true" className="game-a-title-menu-prefix">&gt;</span>
            <span className="game-a-title-menu-label">开始故事</span>
          </button>
          <button
            className="game-a-title-menu-button"
            data-testid="title-load"
            disabled={!model.capabilities.canLoad}
            onClick={() => actions.dispatch("open-load")}
            type="button"
          >
            <span aria-hidden="true" className="game-a-title-menu-prefix">&gt;</span>
            <span className="game-a-title-menu-label">读取存档</span>
          </button>
          <button
            className="game-a-title-menu-button"
            data-testid="title-settings"
            disabled={!model.capabilities.canOpenSettings}
            onClick={() => actions.dispatch("open-settings")}
            type="button"
          >
            <span aria-hidden="true" className="game-a-title-menu-prefix">&gt;</span>
            <span className="game-a-title-menu-label">运行设置</span>
          </button>
          <button className="game-a-title-menu-button" data-placeholder="true" data-testid="title-gallery" type="button">
            <span aria-hidden="true" className="game-a-title-menu-prefix">&gt;</span>
            <span className="game-a-title-menu-label">图鉴回忆</span>
          </button>
          <button className="game-a-title-menu-button" data-placeholder="true" data-testid="title-media" type="button">
            <span aria-hidden="true" className="game-a-title-menu-prefix">&gt;</span>
            <span className="game-a-title-menu-label">媒体社群</span>
          </button>
          <button className="game-a-title-menu-button" data-placeholder="true" data-testid="title-exit" type="button">
            <span aria-hidden="true" className="game-a-title-menu-prefix">&gt;</span>
            <span className="game-a-title-menu-label">离开这里</span>
          </button>
        </nav>
      </div>
    </section>
  );
}

function GameAToastLayer({ actions, model }: SurfaceSlotProps<RuntimeToastLayerViewModel, RuntimeToastActions>) {
  if (!model.visible || model.toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      data-testid="runtime-toast-layer"
      data-ui-phase={model.presentation.phase}
      className="game-a-toast-layer"
      style={{ opacity: model.presentation.opacity }}
    >
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
    <form aria-label="运行时输入" data-testid="runtime-input-prompt" className="game-a-input-prompt" onSubmit={submit}>
      <label>
        <span>{model.prompt.summary ?? model.prompt.variableName}</span>
        <input
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          data-testid="runtime-input-field"
          defaultValue={model.prompt.defaultValue === undefined ? "" : String(model.prompt.defaultValue)}
          enterKeyHint="done"
          inputMode={model.prompt.valueType === "number" ? "decimal" : "text"}
          name="runtime-input"
          spellCheck={false}
          type={model.prompt.valueType === "number" ? "number" : "text"}
        />
      </label>
      <button data-testid="runtime-input-submit" type="submit">
        确定
      </button>
    </form>
  );
}

function GameABacklogOverlay({
  model
}: SurfaceSlotProps<BacklogOverlayViewModel, BacklogOverlayActions> & {
  navigation: GameASurfaceNavigation;
}) {
  return (
    <GameAPauseSectionContent testId="backlog-overlay" title="日志">
      {model.entries.length === 0 ? (
        <p data-testid="backlog-empty" className="game-a-overlay-empty">暂无日志。</p>
      ) : (
        <ol data-testid="backlog-list" className="game-a-backlog-list">
          {model.entries.map((entry, index) => (
            <li data-testid={`backlog-entry-${index}`} key={`${entry.speaker ?? "narrator"}-${index}`}>
              <strong>{entry.speaker ?? "旁白"}</strong>
              <span>
                <RichTextRenderer document={entry.richText} fallbackText={entry.text} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </GameAPauseSectionContent>
  );
}

function GameASaveLoadOverlay({
  actions,
  model,
  navigation
}: SurfaceSlotProps<SaveLoadOverlayViewModel, SaveLoadOverlayActions> & {
  navigation: GameASurfaceNavigation;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const slotIdsKey = model.slotIds.join("\u0000");
  const slotsById = new Map(model.slots.map((slot) => [slot.id, slot]));
  const page = paginateSaveLoadSlotIds(model.slotIds, pageIndex);
  const loadPreviews = actions.loadPreviews;
  const pageSlotIdsKey = page.pageSlotIds.join("\u0000");

  useEffect(() => {
    setPageIndex(0);
  }, [model.mode, slotIdsKey]);

  useEffect(() => {
    loadPreviews?.(page.pageSlotIds);
  }, [loadPreviews, pageSlotIdsKey]);

  const content = (
    <>
      {model.lastError ? (
        <p data-testid="save-load-error" className="game-a-save-error" role="alert">
          {model.lastError.message}
        </p>
      ) : null}
      <div data-testid="save-slot-grid" className="game-a-save-grid">
        {page.pageSlotIds.map((slotId, index) => {
          const absoluteIndex = page.pageIndex * SAVE_LOAD_SLOTS_PER_PAGE + index;
          const slot = slotsById.get(slotId);
          const preview = model.slotPreviewsById[slotId];
          const disabled = model.busy || (model.mode === "save" ? !model.canSave : !slot);
          return (
            <button
              className="game-a-save-row"
              data-save-state={slot ? "filled" : "empty"}
              data-testid={`save-slot-${absoluteIndex + 1}`}
              disabled={disabled}
              key={slotId}
              onClick={() => (model.mode === "save" ? actions.save(slotId) : actions.requestLoad(slotId))}
              type="button"
            >
              <span className="game-a-save-row-number">{String(absoluteIndex + 1).padStart(2, "0")}</span>
              {preview ? (
                <img
                  alt=""
                  className="game-a-save-thumbnail"
                  data-testid={`save-slot-${absoluteIndex + 1}-thumbnail`}
                  draggable={false}
                  src={preview.uri}
                  width={preview.width}
                  height={preview.height}
                />
              ) : (
                <span aria-hidden="true" className="game-a-save-thumbnail" data-testid={`save-slot-${absoluteIndex + 1}-thumbnail`} />
              )}
              <span className="game-a-save-copy">
                <strong>{slot?.label ?? `存档 ${absoluteIndex + 1}`}</strong>
                <span>{slot ? new Date(slot.savedAt).toLocaleString() : "< 空存档 >"}</span>
                <small>{slot?.speaker ? `${slot.speaker}: ${slot.text ?? ""}` : slot?.text ?? "无数据"}</small>
              </span>
              <span className="game-a-save-meta">{slot ? slot.mode.toUpperCase() : "--:--:--"}</span>
            </button>
          );
        })}
      </div>
      <div className="game-a-save-pagination" data-testid="save-page-controls">
        <button
          aria-label="上一页"
          data-testid="save-page-prev"
          disabled={model.busy || page.pageIndex === 0}
          onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
          type="button"
        >
          &lt;
        </button>
        <span aria-live="polite" data-testid="save-page-indicator">
          {page.pageIndex + 1} / {page.pageCount}
        </span>
        <button
          aria-label="下一页"
          data-testid="save-page-next"
          disabled={model.busy || page.pageIndex >= page.pageCount - 1}
          onClick={() => setPageIndex((current) => Math.min(page.pageCount - 1, current + 1))}
          type="button"
        >
          &gt;
        </button>
      </div>
      {model.pendingLoadSlot ? (
        <div data-testid="load-confirmation" className="game-a-load-confirmation" role="alertdialog" aria-modal="true">
          <strong>确定读取此存档？</strong>
          <span>当前进度将被 {model.pendingLoadSlot.label} 覆盖。</span>
          <div>
            <button data-testid="load-confirm" disabled={model.busy} onClick={actions.confirmLoad} type="button">
              读取
            </button>
            <button data-testid="load-cancel" disabled={model.busy} onClick={actions.cancelLoad} type="button">
              取消
            </button>
          </div>
        </div>
      ) : null}
    </>
  );

  if (!navigation.pauseSection) {
    return (
      <GameAOverlayPanel onClose={actions.close} testId="save-load-overlay" title={formatSaveLoadOverlayTitle(model.mode, "title")}>
        {content}
      </GameAOverlayPanel>
    );
  }

  return (
    <GameAPauseSectionContent
      onEscapeCapture={model.pendingLoadSlot ? actions.cancelLoad : undefined}
      testId="save-load-overlay"
      title={formatSaveLoadOverlayTitle(model.mode, "pause")}
    >
      {content}
    </GameAPauseSectionContent>
  );
}

function GameASettingsOverlay({
  actions,
  model,
  navigation
}: SurfaceSlotProps<SettingsOverlayViewModel, SettingsOverlayActions> & {
  navigation: GameASurfaceNavigation;
}) {
  const [activeSettingsTab, setActiveSettingsTab] = useState<GameASettingsTab>("system");
  const content = (
    <GameASettingsContent
      actions={actions}
      activeSettingsTab={activeSettingsTab}
      model={model}
      onSettingsTabChange={setActiveSettingsTab}
    />
  );

  if (!navigation.pauseSection) {
    return (
      <GameAOverlayPanel onClose={actions.close} testId="settings-overlay" title="设置">
        {content}
      </GameAOverlayPanel>
    );
  }

  return (
    <GameAPauseSectionContent testId="settings-overlay" title="设置">
      {content}
    </GameAPauseSectionContent>
  );
}

export type GameASettingsTab = SettingsSectionId;
type GameASettingsSnapshot = SettingsOverlayViewModel["settings"];

export function GameASettingsContent({
  actions,
  activeSettingsTab,
  model,
  onSettingsTabChange
}: {
  actions: SettingsOverlayActions;
  activeSettingsTab: GameASettingsTab;
  model: SettingsOverlayViewModel;
  onSettingsTabChange: (tab: GameASettingsTab) => void;
}) {
  const tabLabel = SETTINGS_SECTION_DESCRIPTORS.find((section) => section.id === activeSettingsTab)?.label ?? "SYSTEM";

  return (
    <div className="game-a-settings-page" data-settings-tab={activeSettingsTab} data-testid="settings-page">
      <div data-testid="settings-groups" className="game-a-settings-rows">
        <section data-testid={`settings-group-${activeSettingsTab}`} className="game-a-settings-panel" aria-label={`${tabLabel} 设置`}>
          {renderGameASettingsRows({ actions, activeSettingsTab, settings: model.settings })}
        </section>
      </div>
      <div className="game-a-settings-footer">
        <button className="game-a-settings-reset" data-testid="settings-reset" onClick={actions.resetSettings} type="button">
          重置
        </button>
        <GameASettingsSubtabs activeTab={activeSettingsTab} onTabChange={onSettingsTabChange} />
      </div>
    </div>
  );
}

function renderGameASettingsRows({
  actions,
  activeSettingsTab,
  settings
}: {
  actions: SettingsOverlayActions;
  activeSettingsTab: GameASettingsTab;
  settings: GameASettingsSnapshot;
}) {
  switch (activeSettingsTab) {
    case "system":
      return (
        <>
          <GameASettingRow label="语言" testId="settings-system-language">
            <GameAOptionStepper
              label="语言"
              onChange={(language) => actions.patchSettings({ system: { language } })}
              options={SETTINGS_LANGUAGE_OPTIONS}
              testId="settings-system-language"
              value={settings.system.language}
            />
          </GameASettingRow>
          <GameASettingRow label="跳过未读文本" testId="settings-system-skip-all">
            <GameABinaryStepper
              label="跳过未读文本"
              onChange={(skipAll) => actions.patchSettings({ system: { skipAll } })}
              testId="settings-system-skip-all"
              value={settings.system.skipAll}
            />
          </GameASettingRow>
          <GameASettingRow label="优先全屏" testId="settings-system-fullscreen">
            <GameABinaryStepper
              label="优先全屏"
              onChange={(preferFullscreen) => actions.patchSettings({ system: { preferFullscreen } })}
              testId="settings-system-fullscreen"
              value={settings.system.preferFullscreen}
            />
          </GameASettingRow>
        </>
      );
    case "display":
      return (
        <>
          <GameASettingRow label="文字大小" testId="settings-display-text-size">
            <GameAOptionStepper
              label="文字大小"
              onChange={(textSize) => actions.patchSettings({ display: { textSize } })}
              options={SETTINGS_TEXT_SIZE_OPTIONS}
              testId="settings-display-text-size"
              value={settings.display.textSize}
            />
          </GameASettingRow>
          <GameASettingRow label="文字速度" testId="settings-display-text-speed">
            <GameAStepMeter
              label="文字速度"
              onChange={(textSpeed) => actions.patchSettings({ display: { textSpeed } })}
              testId="settings-display-text-speed"
              value={settings.display.textSpeed}
            />
          </GameASettingRow>
        </>
      );
    case "sound":
      return (
        <>
          <GameASettingRow label="全部静音" testId="settings-sound-muted">
            <GameABinaryStepper
              label="全部静音"
              onChange={(muted) => actions.patchSettings({ sound: { muted } })}
              testId="settings-sound-muted"
              value={settings.sound.muted}
            />
          </GameASettingRow>
          <GameASettingRow label="主音量" testId="settings-sound-master">
            <GameAStepMeter label="主音量" onChange={(masterVolume) => actions.patchSettings({ sound: { masterVolume } })} testId="settings-sound-master" value={settings.sound.masterVolume} />
          </GameASettingRow>
          <GameASettingRow label="背景音乐音量" testId="settings-sound-bgm">
            <GameAStepMeter label="背景音乐音量" onChange={(bgmVolume) => actions.patchSettings({ sound: { bgmVolume } })} testId="settings-sound-bgm" value={settings.sound.bgmVolume} />
          </GameASettingRow>
          <GameASettingRow label="音效音量" testId="settings-sound-sfx">
            <GameAStepMeter label="音效音量" onChange={(sfxVolume) => actions.patchSettings({ sound: { sfxVolume } })} testId="settings-sound-sfx" value={settings.sound.sfxVolume} />
          </GameASettingRow>
          <GameASettingRow label="界面音效音量" testId="settings-sound-ui">
            <GameAStepMeter label="界面音效音量" onChange={(uiVolume) => actions.patchSettings({ sound: { uiVolume } })} testId="settings-sound-ui" value={settings.sound.uiVolume} />
          </GameASettingRow>
          <GameASettingRow label="对话提示音量" testId="settings-sound-bleep">
            <GameAStepMeter label="对话提示音量" onChange={(bleepVolume) => actions.patchSettings({ sound: { bleepVolume } })} testId="settings-sound-bleep" value={settings.sound.bleepVolume} />
          </GameASettingRow>
          <GameASettingRow label="语音音量" testId="settings-sound-voice">
            <GameAStepMeter label="语音音量" onChange={(voiceVolume) => actions.patchSettings({ sound: { voiceVolume } })} testId="settings-sound-voice" value={settings.sound.voiceVolume} />
          </GameASettingRow>
        </>
      );
    case "automation":
      return (
        <>
          <GameASettingRow label="自动速度" testId="settings-automation-auto-speed">
            <GameAStepMeter
              label="自动速度"
              onChange={(autoSpeed) => actions.patchSettings({ automation: { autoSpeed } })}
              testId="settings-automation-auto-speed"
              value={settings.automation.autoSpeed}
            />
          </GameASettingRow>
          <GameASettingRow label="快进速度" testId="settings-automation-skip-speed">
            <GameAStepMeter
              label="快进速度"
              onChange={(skipSpeed) => actions.patchSettings({ automation: { skipSpeed } })}
              testId="settings-automation-skip-speed"
              value={settings.automation.skipSpeed}
            />
          </GameASettingRow>
        </>
      );
  }
}

function GameASettingRow({
  children,
  label,
  testId
}: {
  children: ReactNode;
  label: string;
  testId: string;
}) {
  return (
    <div className="game-a-setting-row" data-testid={`${testId}-row`}>
      <span className="game-a-setting-label" id={`${testId}-label`}>
        {label}
      </span>
      <div className="game-a-setting-control">{children}</div>
    </div>
  );
}

function GameAStepMeter({
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
  const normalized = normalizeSettingsStep(value);
  const filledBlocks = Math.round(normalized * 10);
  const valueText = `${Math.round(normalized * 100)}%`;
  const previous = normalizeSettingsStep(normalized - 0.1);
  const next = normalizeSettingsStep(normalized + 0.1);

  return (
    <div className="game-a-step-meter" data-testid={testId} data-value={String(normalized)} role="group" aria-label={label}>
      <button
        aria-label={`${label}减少`}
        data-testid={`${testId}-previous`}
        disabled={normalized <= 0}
        onClick={() => onChange(previous)}
        type="button"
      >
        {"<"}
      </button>
      <div
        aria-label={`${label}当前值`}
        aria-valuemax={1}
        aria-valuemin={0}
        aria-valuenow={normalized}
        aria-valuetext={valueText}
        className="game-a-step-meter-blocks"
        data-testid={`${testId}-meter`}
        role="meter"
      >
        {Array.from({ length: 10 }, (_, index) => (
          <span aria-hidden="true" className={index < filledBlocks ? "game-a-step-block game-a-step-block-active" : "game-a-step-block"} key={index} />
        ))}
      </div>
      <button
        aria-label={`${label}增加`}
        data-testid={`${testId}-next`}
        disabled={normalized >= 1}
        onClick={() => onChange(next)}
        type="button"
      >
        {">"}
      </button>
      <span className="game-a-screen-reader-only" data-testid={`${testId}-value`}>
        {valueText}
      </span>
    </div>
  );
}

function GameAOptionStepper<T extends string>({
  label,
  onChange,
  options,
  testId,
  value
}: {
  label: string;
  onChange: (value: T) => void;
  options: readonly SettingsOption<T>[];
  testId: string;
  value: T;
}) {
  const currentIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const currentOption = options[currentIndex] ?? options[0];
  if (!currentOption) return null;
  const previousOption = adjacentSettingsOption(options, value, -1);
  const nextOption = adjacentSettingsOption(options, value, 1);

  return (
    <div className="game-a-option-stepper" data-testid={testId} data-value={currentOption.value} role="group" aria-label={label}>
      <button
        aria-label={`${label}上一个`}
        data-testid={`${testId}-previous`}
        disabled={!previousOption}
        onClick={() => {
          if (previousOption) onChange(previousOption.value);
        }}
        type="button"
      >
        {"<"}
      </button>
      <span className="game-a-stepper-value" data-testid={`${testId}-value`}>
        {currentOption.label}
      </span>
      <button
        aria-label={`${label}下一个`}
        data-testid={`${testId}-next`}
        disabled={!nextOption}
        onClick={() => {
          if (nextOption) onChange(nextOption.value);
        }}
        type="button"
      >
        {">"}
      </button>
    </div>
  );
}

function GameABinaryStepper({
  label,
  onChange,
  testId,
  value
}: {
  label: string;
  onChange: (value: boolean) => void;
  testId: string;
  value: boolean;
}) {
  return (
    <div className="game-a-option-stepper game-a-binary-stepper" data-testid={testId} data-value={value ? "on" : "off"} role="group" aria-label={label}>
      <button aria-label={`${label}关闭`} data-testid={`${testId}-previous`} disabled={!value} onClick={() => onChange(false)} type="button">
        {"<"}
      </button>
      <span className="game-a-stepper-value" data-testid={`${testId}-value`}>
        {value ? "开" : "关"}
      </span>
      <button aria-label={`${label}开启`} data-testid={`${testId}-next`} disabled={value} onClick={() => onChange(true)} type="button">
        {">"}
      </button>
    </div>
  );
}

function GameASettingsSubtabs({
  activeTab,
  onTabChange
}: {
  activeTab: GameASettingsTab;
  onTabChange: (tab: GameASettingsTab) => void;
}) {
  return (
    <nav aria-label="设置分类" className="game-a-settings-subtabs" data-testid="settings-subtab-list">
      {SETTINGS_SECTION_DESCRIPTORS.map((section) => {
        const active = activeTab === section.id;
        return (
          <button
            aria-current={active ? "page" : undefined}
            className={active ? "game-a-settings-subtab game-a-settings-subtab-active" : "game-a-settings-subtab"}
            data-testid={section.testId}
            key={section.id}
            onClick={() => {
              if (!active) onTabChange(section.id);
            }}
            type="button"
          >
            {section.label}
          </button>
        );
      })}
    </nav>
  );
}

const GAME_A_PAUSE_SECTION_TITLES: Record<GamePauseSection, string> = {
  backlog: "日志",
  save: "保存数据",
  load: "读取数据",
  settings: "设置"
};

function GameAPauseSurface({
  actions,
  children,
  model
}: SurfaceSlotProps<PauseSurfaceViewModel, PauseSurfaceActions> & { children?: ReactNode }) {
  const title = GAME_A_PAUSE_SECTION_TITLES[model.activeSection];
  return (
    <section
      aria-label="暂停菜单"
      aria-modal="true"
      className="game-a-pause-screen"
      data-active-tab={model.activeSection}
      data-pause-section={model.activeSection}
      data-testid="pause-surface"
      role="dialog"
    >
      <div className="game-a-pause-panel">
        <button
          aria-label="关闭暂停菜单"
          className="game-a-pause-close"
          data-testid="pause-surface-close"
          disabled={model.navigationLocked}
          onClick={actions.close}
          type="button"
        >
          x
        </button>
        <div className="game-a-pause-heading">
          <span className="game-a-pause-number">
            {String(VN_PAUSE_SECTIONS.findIndex((section) => section.id === model.activeSection) + 1).padStart(2, "0")}
          </span>
          <strong>{title}</strong>
        </div>
        <div className="game-a-pause-nav-row">
          <nav aria-label="暂停菜单页签" className="game-a-pause-tabs" data-testid="pause-tab-list">
            {VN_PAUSE_SECTIONS.map((section) => {
              const active = model.activeSection === section.id;
              const enabled = section.id === "backlog"
                ? model.capabilities.canOpenBacklog
                : section.id === "save"
                  ? model.capabilities.canSave
                  : section.id === "load"
                    ? model.capabilities.canLoad
                    : model.capabilities.canOpenSettings;
              const disabled = model.navigationLocked || !enabled;
              return (
                <button
                  aria-current={active ? "page" : undefined}
                  className={active ? "game-a-pause-tab game-a-pause-tab-active" : "game-a-pause-tab"}
                  data-testid={section.testId}
                  disabled={disabled}
                  key={section.id}
                  onClick={() => {
                    if (!active && !disabled) actions.dispatch(section.action);
                  }}
                  type="button"
                >
                  {section.label}
                </button>
              );
            })}
          </nav>
          <button
            className="game-a-pause-return-title"
            data-testid="pause-return-title"
            disabled={model.navigationLocked || !model.capabilities.canReturnTitle}
            onClick={() => actions.dispatch("return-title")}
            type="button"
          >
            TITLE
          </button>
        </div>
        <div className="game-a-pause-content">{children}</div>
      </div>
    </section>
  );
}

function GameAPauseSectionContent({
  children,
  onEscapeCapture,
  testId,
  title
}: {
  children: ReactNode;
  onEscapeCapture?: (() => void) | undefined;
  testId: string;
  title: string;
}) {
  const escapeCaptureRef = createEscapeCaptureRef(onEscapeCapture);
  return (
    <section aria-label={title} className="game-a-pause-section" data-testid={testId} ref={escapeCaptureRef}>
      {children}
    </section>
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
        <button aria-label={`关闭${title}`} data-testid={`${testId}-close`} onClick={onClose} type="button">
          x
        </button>
      </header>
      {children}
    </section>
  );
}
