import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createAssetRegistry, type AssetResolver } from "@v-ronpa/asset-registry";
import type {
  BacklogOverlayViewModel,
  SaveLoadOverlayViewModel,
  SettingsOverlayViewModel,
  VnChoicesViewModel,
  VnCommandBarViewModel,
  VnDialogViewModel
} from "@v-ronpa/app-vn-shell";
import { createDefaultSettingsSnapshot, type GameOverlayKind } from "@v-ronpa/contracts";
import { gameAContentManifest } from "../contentManifest";
import {
  createGameASurfaces,
  GameACommandBar,
  GameADialogSurface,
  GameASettingsContent,
  type GameASettingsTab,
  type GameASurfaceNavigation
} from "./GameASurfaces";
import { gameAUiConfig } from "./gameAUiConfig";
import { resolveGameAUiAssets } from "./resolveGameAUiAssets";

describe("game-a interaction surfaces", () => {
  it("provides custom implementations for every first-pass surface slot", () => {
    const assets = resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig);
    const surfaces = createGameASurfaces({ assets, config: gameAUiConfig, navigation: createNavigation({}) });

    expect(Object.keys(surfaces).sort()).toEqual([
      "BacklogOverlay",
      "Choices",
      "CommandBar",
      "Dialog",
      "InputPrompt",
      "PauseMenuOverlay",
      "SaveLoadOverlay",
      "SettingsOverlay",
      "Title",
      "ToastLayer"
    ]);
  });

  it("resolves the configured dialog frame asset while keeping the dialog frame CSS-only", () => {
    const assets = resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig);
    const element = GameADialogSurface({
      actions: {},
      assets,
      config: gameAUiConfig,
      model: createDialogModel()
    });
    const root = findElementByTestId(element, "vn-dialog-surface");

    expect(assets.dialogFrameUri).toBe("/game-a/ui/game-a-dialog-frame.png");
    expect(gameAUiConfig.dialog.frameAssetId).toBe("texture:ui:game-a-dialog-frame");
    expect(assets.diagnostics).toEqual([]);
    expect(root?.props).toMatchObject({ "data-frame": "resolved" });
    expect((root?.props as { style?: Record<string, string | number> }).style).toMatchObject({
      pointerEvents: "none",
      opacity: 0.75,
      "--dialog-opacity": 0.92
    });
  });

  it("renders a reference-style floating speaker plate while keeping state text screen-reader only", () => {
    const assets = resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig);
    const element = GameADialogSurface({
      actions: {},
      assets,
      config: gameAUiConfig,
      model: createDialogModel()
    });
    const speaker = findElementByTestId(element, "vn-dialog-speaker");
    const state = findElementByTestId(element, "vn-dialog-state");

    expect(speaker?.props).toMatchObject({
      className: "game-a-dialog-speaker",
      children: "[MIRA]"
    });
    expect(state?.props).toMatchObject({
      className: "game-a-dialog-state game-a-screen-reader-only",
      children: "阅读中"
    });
  });

  it("renders centered choice skin without changing choice dispatch", () => {
    const assets = resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig);
    const surfaces = createGameASurfaces({ assets, config: gameAUiConfig, navigation: createNavigation({}) });
    const ChoiceSurface = surfaces.Choices;
    const choose = vi.fn();
    const element = <ChoiceSurface actions={{ choose }} model={createChoiceModel()} />;
    const overlay = findElementByTestId(element, "vn-choice-overlay");
    const firstChoice = findElementByTestId(element, "vn-choice-0");
    const copy = findElementByClassName(element, "game-a-choice-copy");

    expect(overlay?.props).toMatchObject({
      className: "game-a-choice-overlay",
      role: "group"
    });
    expect(firstChoice?.props).toMatchObject({
      "aria-disabled": false,
      className: "game-a-choice-button",
      disabled: false
    });
    expect(copy).toBeDefined();

    (firstChoice?.props as { onClick?: () => void }).onClick?.();
    expect(choose).toHaveBeenCalledWith(0, expect.objectContaining({ text: "继续调查" }));
  });

  it("keeps disabled choices inert for game-a choice skin", () => {
    const assets = resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig);
    const surfaces = createGameASurfaces({ assets, config: gameAUiConfig, navigation: createNavigation({}) });
    const ChoiceSurface = surfaces.Choices;
    const choose = vi.fn();
    const element = <ChoiceSurface actions={{ choose }} model={createChoiceModel([{ text: "Locked", enabled: false }])} />;
    const lockedChoice = findElementByTestId(element, "vn-choice-0");

    expect(lockedChoice?.props).toMatchObject({
      "aria-disabled": true,
      disabled: true
    });

    (lockedChoice?.props as { onClick?: () => void }).onClick?.();
    expect(choose).not.toHaveBeenCalled();
  });

  it("returns diagnostics and keeps the dialog renderable when the texture is missing", () => {
    const missingResolver: AssetResolver = {
      resolve: () => ({
        diagnostic: {
          code: "asset-missing",
          severity: "error",
          id: "texture:ui:game-a-dialog-frame",
          kind: "texture",
          message: "missing texture"
        }
      })
    };
    const assets = resolveGameAUiAssets(missingResolver, gameAUiConfig);
    const element = GameADialogSurface({
      actions: {},
      assets,
      config: gameAUiConfig,
      model: createDialogModel()
    });
    const root = findElementByTestId(element, "vn-dialog-surface");

    expect(assets.dialogFrameUri).toBeUndefined();
    expect(assets.diagnostics).toMatchObject([{ code: "asset-missing", id: "texture:ui:game-a-dialog-frame" }]);
    expect(root?.props).toMatchObject({ "data-frame": "fallback" });
    expect(findElementByTestId(element, "vn-dialog-text")).toBeDefined();
  });

  it("skins command labels without changing dispatched command actions", () => {
    const dispatch = vi.fn();
    const element = GameACommandBar({
      actions: { dispatch },
      model: createCommandBarModel()
    });
    const settings = findElementByTestId(element, "vn-command-settings");
    const commandBar = findElementByTestId(element, "vn-command-bar");

    expect(settings?.props).toMatchObject({
      "data-action": "open-settings",
      children: "SETTINGS"
    });
    expect(commandBar?.props).toMatchObject({
      "data-ui-phase": "showing",
      style: { opacity: 0.5 }
    });
    (settings?.props as { onClick?: () => void }).onClick?.();
    expect(dispatch).toHaveBeenCalledWith("open-settings");
  });

  it("renders backlog inside the shared pause tab shell and switches tabs through app navigation", () => {
    const dispatch = vi.fn();
    const surfaces = createGameASurfaces({
      assets: resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig),
      config: gameAUiConfig,
      navigation: createNavigation({ activeOverlay: "vn-backlog", dispatch })
    });
    const BacklogSurface = surfaces.BacklogOverlay;
    const element = <BacklogSurface actions={{ close: vi.fn() }} model={createBacklogModel()} />;
    const root = findElementByTestId(element, "backlog-overlay");
    const tabList = findElementByTestId(element, "pause-tab-list");
    const logTab = findElementByTestId(element, "pause-tab-log");
    const saveTab = findElementByTestId(element, "pause-tab-save");
    const returnTitle = findElementByTestId(element, "pause-return-title");
    const close = findElementByTestId(element, "backlog-overlay-close");

    expect(root?.props).toMatchObject({
      className: "game-a-pause-screen",
      "data-active-tab": "log"
    });
    expect(findElementByClassName(element, "game-a-pause-header")).toBeUndefined();
    expect(tabList).toBeDefined();
    expect(logTab?.props).toMatchObject({ "aria-current": "page", children: "LOG" });
    expect(saveTab?.props).toMatchObject({ children: "SAVE" });
    expect(close).toBeDefined();
    expect(returnTitle?.props).toMatchObject({ children: "TITLE" });

    (saveTab?.props as { onClick?: () => void }).onClick?.();
    expect(dispatch).toHaveBeenCalledWith("open-save");
  });

  it("renders save and load as separate pause tabs with CSS thumbnail placeholders for real slot ids", () => {
    const assets = resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig);
    const surfaces = createGameASurfaces({
      assets,
      config: gameAUiConfig,
      navigation: createNavigation({ activeOverlay: "vn-save" })
    });
    const SaveLoadSurface = surfaces.SaveLoadOverlay;
    const saveElement = <SaveLoadSurface actions={createSaveLoadActions()} model={createSaveLoadModel("save")} />;
    const saveRoot = findElementByTestId(saveElement, "save-load-overlay");
    const saveTab = findElementByTestId(saveElement, "pause-tab-save");
    const saveIds = collectTestIds(saveElement);

    expect(saveRoot?.props).toMatchObject({
      className: "game-a-pause-screen",
      "data-active-tab": "save"
    });
    expect(findElementByTestId(saveElement, "save-load-mode")).toBeUndefined();
    expect(saveTab?.props).toMatchObject({ "aria-current": "page" });
    expect(saveIds.filter((id) => id.endsWith("-thumbnail"))).toEqual([
      "save-slot-1-thumbnail",
      "save-slot-2-thumbnail",
      "save-slot-3-thumbnail"
    ]);

    const loadSurfaces = createGameASurfaces({
      assets,
      config: gameAUiConfig,
      navigation: createNavigation({ activeOverlay: "vn-load" })
    });
    const LoadSurface = loadSurfaces.SaveLoadOverlay;
    const loadElement = <LoadSurface actions={createSaveLoadActions()} model={createSaveLoadModel("load")} />;

    expect(findElementByTestId(loadElement, "save-load-overlay")?.props).toMatchObject({
      className: "game-a-pause-screen",
      "data-active-tab": "load"
    });
    expect(findElementByTestId(loadElement, "pause-tab-load")?.props).toMatchObject({ "aria-current": "page" });
  });

  it("locks pause tab navigation while load confirmation is visible", () => {
    const dispatch = vi.fn();
    const cancelLoad = vi.fn();
    const confirmLoad = vi.fn();
    const surfaces = createGameASurfaces({
      assets: resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig),
      config: gameAUiConfig,
      navigation: createNavigation({ activeOverlay: "vn-load", dispatch })
    });
    const SaveLoadSurface = surfaces.SaveLoadOverlay;
    const element = (
      <SaveLoadSurface
        actions={{ ...createSaveLoadActions(), cancelLoad, confirmLoad }}
        model={createSaveLoadModel("load", { pendingLoad: true })}
      />
    );
    const root = findElementByTestId(element, "save-load-overlay");
    const settingsTab = findElementByTestId(element, "pause-tab-settings");
    const close = findElementByTestId(element, "save-load-overlay-close");
    const returnTitle = findElementByTestId(element, "pause-return-title");
    const cancel = findElementByTestId(element, "load-cancel");
    const confirm = findElementByTestId(element, "load-confirm");
    const testIds = collectTestIds(element);

    expect(settingsTab?.props).toMatchObject({ disabled: true });
    expect(close?.props).toMatchObject({ disabled: true });
    expect(returnTitle?.props).toMatchObject({ disabled: true });
    expect(testIds.indexOf("load-confirm")).toBeLessThan(testIds.indexOf("load-cancel"));
    (settingsTab?.props as { onClick?: () => void }).onClick?.();
    expect(dispatch).not.toHaveBeenCalled();

    triggerEscapeCapture(root);
    expect(cancelLoad).toHaveBeenCalledOnce();

    (cancel?.props as { onClick?: () => void }).onClick?.();
    (confirm?.props as { onClick?: () => void }).onClick?.();
    expect(cancelLoad).toHaveBeenCalledTimes(2);
    expect(confirmLoad).toHaveBeenCalledOnce();
  });

  it("renders settings inside the VN pause tab shell", () => {
    const surfaces = createGameASurfaces({
      assets: resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig),
      config: gameAUiConfig,
      navigation: createNavigation({ activeOverlay: "vn-settings" })
    });
    const SettingsSurface = surfaces.SettingsOverlay;
    const markup = renderToStaticMarkup(<SettingsSurface actions={createSettingsActions()} model={createSettingsModel()} />);

    expect(markup).toContain('data-testid="settings-overlay"');
    expect(markup).toContain('class="game-a-pause-screen"');
    expect(markup).toContain('data-active-tab="settings"');
    expect(markup).toContain('data-testid="pause-tab-settings"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('data-settings-tab="system"');
    expect(markup).toContain('data-testid="settings-group-system"');
  });

  it("renders the Settings SYSTEM subtab by default and keeps other groups out of the DOM", () => {
    const element = createSettingsContentElement("system");

    expect(findElementByTestId(element, "settings-group-system")).toBeDefined();
    expect(findElementByTestId(element, "settings-system-language")).toBeDefined();
    expect(findElementByTestId(element, "settings-system-skip-all")).toBeDefined();
    expect(findElementByTestId(element, "settings-group-display")).toBeUndefined();
    expect(findElementByTestId(element, "settings-display-text-size")).toBeUndefined();
    expect(findElementByTestId(element, "settings-subtab-system")?.props).toMatchObject({ "aria-current": "page" });
  });

  it("switches Settings subtabs without affecting the outer pause tabs", () => {
    const onSettingsTabChange = vi.fn();
    const element = createSettingsContentElement("system", createSettingsActions(), createSettingsModel(), onSettingsTabChange);
    const soundTab = findElementByTestId(element, "settings-subtab-sound");

    (soundTab?.props as { onClick?: () => void }).onClick?.();
    expect(onSettingsTabChange).toHaveBeenCalledWith("sound");

    const soundElement = createSettingsContentElement("sound");
    expect(findElementByTestId(soundElement, "settings-group-sound")).toBeDefined();
    expect(findElementByTestId(soundElement, "settings-sound-master")).toBeDefined();
    expect(findElementByTestId(soundElement, "settings-group-system")).toBeUndefined();
    expect(findElementByTestId(soundElement, "settings-system-language")).toBeUndefined();

    const displayElement = createSettingsContentElement("display");
    expect(findElementByTestId(displayElement, "settings-group-display")).toBeDefined();
    expect(findElementByTestId(displayElement, "settings-display-textbox-opacity")).toBeDefined();
    expect(findElementByTestId(displayElement, "settings-sound-master")).toBeUndefined();

    const automationElement = createSettingsContentElement("automation");
    expect(findElementByTestId(automationElement, "settings-group-automation")).toBeDefined();
    expect(findElementByTestId(automationElement, "settings-automation-auto-speed")).toBeDefined();
    expect(findElementByTestId(automationElement, "settings-display-text-size")).toBeUndefined();
  });

  it("patches numeric Settings values through step meters and clamps at 0..1", () => {
    const actions = createSettingsActions();
    const element = createSettingsContentElement("display", actions);
    const textSpeedPrevious = findElementByTestId(element, "settings-display-text-speed-previous");
    const textSpeedNext = findElementByTestId(element, "settings-display-text-speed-next");

    (textSpeedNext?.props as { onClick?: () => void }).onClick?.();
    expect(actions.patchSettings).toHaveBeenCalledWith({ display: { textSpeed: 0.6 } });
    (textSpeedPrevious?.props as { onClick?: () => void }).onClick?.();
    expect(actions.patchSettings).toHaveBeenCalledWith({ display: { textSpeed: 0.4 } });

    const highModel = createSettingsModel();
    highModel.settings.display.textSpeed = 0.96;
    const highElement = createSettingsContentElement("display", actions, highModel);
    (findElementByTestId(highElement, "settings-display-text-speed-next")?.props as { onClick?: () => void }).onClick?.();
    expect(actions.patchSettings).toHaveBeenCalledWith({ display: { textSpeed: 1 } });

    const boundaryModel = createSettingsModel();
    boundaryModel.settings.display.textSpeed = 0;
    const boundaryElement = createSettingsContentElement("display", actions, boundaryModel);
    expect(findElementByTestId(boundaryElement, "settings-display-text-speed-previous")?.props).toMatchObject({ disabled: true });
  });

  it("patches discrete Settings values through option steppers", () => {
    const actions = createSettingsActions();
    const systemElement = createSettingsContentElement("system", actions);
    const languageNext = findElementByTestId(systemElement, "settings-system-language-next");

    (languageNext?.props as { onClick?: () => void }).onClick?.();
    expect(actions.patchSettings).toHaveBeenCalledWith({ system: { language: "zh-TW" } });

    const displayElement = createSettingsContentElement("display", actions);
    (findElementByTestId(displayElement, "settings-display-text-size-next")?.props as { onClick?: () => void }).onClick?.();
    expect(actions.patchSettings).toHaveBeenCalledWith({ display: { textSize: "large" } });
    (findElementByTestId(displayElement, "settings-display-text-size-previous")?.props as { onClick?: () => void }).onClick?.();
    expect(actions.patchSettings).toHaveBeenCalledWith({ display: { textSize: "small" } });
  });

  it("patches boolean Settings values through binary steppers", () => {
    const actions = createSettingsActions();
    const systemElement = createSettingsContentElement("system", actions);

    (findElementByTestId(systemElement, "settings-system-skip-all-next")?.props as { onClick?: () => void }).onClick?.();
    expect(actions.patchSettings).toHaveBeenCalledWith({ system: { skipAll: true } });

    const enabledModel = createSettingsModel();
    enabledModel.settings.system.skipAll = true;
    const enabledElement = createSettingsContentElement("system", actions, enabledModel);
    (findElementByTestId(enabledElement, "settings-system-skip-all-previous")?.props as { onClick?: () => void }).onClick?.();
    expect(actions.patchSettings).toHaveBeenCalledWith({ system: { skipAll: false } });
  });

  it("does not render native range, checkbox, or select controls in game-a Settings tabs", () => {
    for (const tab of ["system", "display", "sound", "automation"] as const) {
      expect(collectNativeSettingControls(createSettingsContentElement(tab))).toEqual([]);
    }
  });

  it("keeps title load isolated from the VN pause tab shell", () => {
    const surfaces = createGameASurfaces({
      assets: resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig),
      config: gameAUiConfig,
      navigation: createNavigation({ activeOverlay: "title-load" })
    });
    const SaveLoadSurface = surfaces.SaveLoadOverlay;
    const element = <SaveLoadSurface actions={createSaveLoadActions()} model={createSaveLoadModel("load")} />;

    expect(findElementByTestId(element, "save-load-overlay")?.props).toMatchObject({
      className: "game-a-overlay-panel"
    });
    expect(findElementByTestId(element, "pause-tab-list")).toBeUndefined();
  });
});

function createDialogModel(): VnDialogViewModel {
  return {
    visible: true,
    speakerId: "Mira",
    speakerLabel: "Mira",
    text: "The corridor light flickers once.",
    state: "line",
    display: { textSize: "medium", textboxOpacity: 0.92, textSpeed: 0.5 },
    presentation: { targetVisible: false, mounted: true, opacity: 0.75, phase: "hiding" }
  };
}

function createChoiceModel(choices: VnChoicesViewModel["choices"] = [{ text: "继续调查", enabled: true }]): VnChoicesViewModel {
  return {
    visible: true,
    choices
  };
}

function createCommandBarModel(): VnCommandBarViewModel {
  return {
    visible: true,
    presentation: { targetVisible: true, mounted: true, opacity: 0.5, phase: "showing" },
    capabilities: {
      canStartNewGame: false,
      canSave: true,
      canLoad: true,
      canOpenSettings: true,
      canOpenBacklog: true,
      canOpenPauseMenu: true,
      canAuto: true,
      canSkip: true,
      canReturnTitle: true
    },
    activeActions: {},
    commands: [
      { action: "open-backlog", label: "LOG", enabled: true, active: false, testId: "vn-command-backlog", toggle: false },
      { action: "toggle-skip", label: "SKIP", enabled: true, active: false, testId: "vn-command-skip", toggle: true },
      { action: "toggle-auto", label: "AUTO", enabled: true, active: false, testId: "vn-command-auto", toggle: true },
      { action: "open-save", label: "SAVE", enabled: true, active: false, testId: "vn-command-save", toggle: false },
      { action: "open-load", label: "LOAD", enabled: true, active: false, testId: "vn-command-load", toggle: false },
      { action: "open-settings", label: "SETTING", enabled: true, active: false, testId: "vn-command-settings", toggle: false }
    ]
  };
}

function createBacklogModel(): BacklogOverlayViewModel {
  return {
    visible: true,
    entries: [
      { speaker: "M", text: "You were right." },
      { speaker: "Y", text: "Then we keep looking." }
    ]
  };
}

function createSaveLoadModel(
  mode: SaveLoadOverlayViewModel["mode"],
  { pendingLoad = false }: { pendingLoad?: boolean } = {}
): SaveLoadOverlayViewModel {
  const filledSlot = {
    id: "slot:game-a:1",
    label: "Game A 1",
    savedAt: "2026-07-08T12:00:00.000Z",
    mode: "vn" as const,
    speaker: "M",
    text: "Saved line"
  };
  return {
    visible: true,
    mode,
    slotIds: ["slot:game-a:1", "slot:game-a:2", "slot:game-a:3"],
    slots: [filledSlot],
    canSave: true,
    pendingLoadSlot: pendingLoad ? filledSlot : undefined
  };
}

function createSaveLoadActions() {
  return {
    cancelLoad: vi.fn(),
    close: vi.fn(),
    confirmLoad: vi.fn(),
    requestLoad: vi.fn(),
    save: vi.fn()
  };
}

function createSettingsModel(): SettingsOverlayViewModel {
  return {
    visible: true,
    settings: createDefaultSettingsSnapshot()
  };
}

function createSettingsActions() {
  return {
    close: vi.fn(),
    patchSettings: vi.fn(),
    resetSettings: vi.fn()
  };
}

function createSettingsContentElement(
  activeSettingsTab: GameASettingsTab,
  actions = createSettingsActions(),
  model = createSettingsModel(),
  onSettingsTabChange = vi.fn()
) {
  return (
    <GameASettingsContent
      actions={actions}
      activeSettingsTab={activeSettingsTab}
      model={model}
      onSettingsTabChange={onSettingsTabChange}
    />
  );
}

function createNavigation({
  activeOverlay,
  dispatch = vi.fn()
}: {
  activeOverlay?: GameOverlayKind | undefined;
  dispatch?: GameASurfaceNavigation["dispatch"];
}): GameASurfaceNavigation {
  return {
    activeOverlay,
    capabilities: {
      canStartNewGame: false,
      canSave: true,
      canLoad: true,
      canOpenSettings: true,
      canOpenBacklog: true,
      canOpenPauseMenu: true,
      canAuto: true,
      canSkip: true,
      canReturnTitle: true
    },
    dispatch
  };
}

function findElementByTestId(node: ReactNode, testId: string): ReactElement | undefined {
  let match: ReactElement | undefined;
  visit(node, (current) => {
    if (match || !isValidElement(current)) return;
    const props = current.props as Record<string, unknown>;
    if (props["data-testid"] === testId) match = current;
  });
  return match;
}

function triggerEscapeCapture(element: ReactElement | undefined) {
  const listeners: Array<(event: KeyboardEvent) => void> = [];
  const removeEventListener = vi.fn();
  const ref =
    ((element?.props as { ref?: unknown } | undefined)?.ref as ((element: HTMLElement | null) => void | (() => void)) | undefined) ??
    ((element as (ReactElement & { ref?: unknown }) | undefined)?.ref as ((element: HTMLElement | null) => void | (() => void)) | undefined);
  expect(ref).toBeTypeOf("function");
  ref?.({
    ownerDocument: {
      defaultView: {
        addEventListener: vi.fn((_type: string, listener: (event: KeyboardEvent) => void) => listeners.push(listener)),
        removeEventListener
      }
    }
  } as unknown as HTMLElement);

  const event = {
    key: "Escape",
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    stopPropagation: vi.fn()
  } as unknown as KeyboardEvent;
  listeners.forEach((listener) => listener(event));
  expect((event.preventDefault as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
  expect((event.stopPropagation as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
  expect((event.stopImmediatePropagation as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
}

function collectTestIds(node: ReactNode): string[] {
  const values: string[] = [];
  visit(node, (current) => {
    if (!isValidElement(current)) return;
    const value = (current.props as Record<string, unknown>)["data-testid"];
    if (typeof value === "string") values.push(value);
  });
  return values;
}

function findElementByClassName(node: ReactNode, className: string): ReactElement | undefined {
  let match: ReactElement | undefined;
  visit(node, (current) => {
    if (match || !isValidElement(current)) return;
    const props = current.props as Record<string, unknown>;
    if (props.className === className) match = current;
  });
  return match;
}

function collectNativeSettingControls(node: ReactNode): string[] {
  const controls: string[] = [];
  visit(node, (current) => {
    if (!isValidElement(current)) return;
    const type = current.type;
    const props = current.props as Record<string, unknown>;
    if (type === "select") controls.push("select");
    if (type === "input" && (props.type === "range" || props.type === "checkbox")) controls.push(String(props.type));
  });
  return controls;
}

function visit(node: ReactNode, visitor: (node: ReactNode) => void) {
  if (!isValidElement(node)) return;
  if (typeof node.type === "function") {
    const renderFunctionComponent = node.type as (props: unknown) => ReactNode;
    visit(renderFunctionComponent(node.props), visitor);
    return;
  }
  visitor(node);
  Children.forEach((node.props as { children?: ReactNode }).children, (child) => visit(child, visitor));
}
