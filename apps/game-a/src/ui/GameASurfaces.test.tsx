import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createAssetRegistry, type AssetResolver } from "@v-ronpa/asset-registry";
import type {
  BacklogOverlayViewModel,
  SaveLoadOverlayViewModel,
  SettingsOverlayViewModel,
  TitleViewModel,
  VnChoicesViewModel,
  VnCommandBarViewModel,
  VnCueViewModel,
  VnDialogViewModel
} from "@v-ronpa/app-vn-shell";
import { createDefaultSettingsSnapshot, type GameOverlayKind, type GamePauseSection } from "@v-ronpa/contracts";
import { paginateSaveLoadSlotIds } from "@v-ronpa/ui-kit";
import { gameAContentManifest } from "../contentManifest";
import {
  createGameASurfaces,
  GameACommandBar,
  GameACueSurface,
  GameADialogSurface,
  GameAPinpSurface,
  GameASettingsContent,
  type GameASettingsTab,
  type GameASurfaceNavigation
} from "./GameASurfaces";
import { gameAUiConfig } from "./gameAUiConfig";
import { resolveGameAUiAssets } from "./resolveGameAUiAssets";

describe("game-a interaction surfaces", () => {
  it("provides custom implementations for every first-pass surface slot", () => {
    const assets = resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig);
    const surfaces = createGameASurfaces({ assets, config: gameAUiConfig, navigation: createNavigation({}), vnPreparationPending: false });

    expect(Object.keys(surfaces).sort()).toEqual([
      "BacklogOverlay",
      "Choices",
      "CommandBar",
      "Cue",
      "Dialog",
      "InputPrompt",
      "PauseSurface",
      "Pinp",
      "SaveLoadOverlay",
      "SettingsOverlay",
      "Title",
      "ToastLayer"
    ]);
  });

  it("customizes pinp through the formal slot without consuming runtime state directly", () => {
    const markup = renderToStaticMarkup(<GameAPinpSurface actions={{}} model={{
      visible: true,
      assetId: "props:milk-bag",
      uri: "/assets/milk-bag.png",
      alt: "牛奶袋",
      positionPercent: [50, 50],
      heightPercent: 20,
      aspectRatio: [16, 9],
      revision: 1,
      presentation: { targetVisible: true, mounted: true, opacity: 1, phase: "shown" }
    }} />);
    expect(markup).toContain('class="game-a-pinp-surface"');
    expect(markup).toContain('data-testid="runtime-pinp-image"');
  });

  it("renders the resolved title art with six ordered menu entries and preserves existing action dispatch", () => {
    const assets = resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig);
    const surfaces = createGameASurfaces({
      assets,
      config: gameAUiConfig,
      navigation: createNavigation({}),
      vnPreparationPending: false
    });
    const dispatch = vi.fn();
    const TitleSurface = surfaces.Title;
    const element = <TitleSurface actions={{ dispatch }} model={createTitleModel()} />;
    const root = findElementByTestId(element, "title-surface");
    const background = findElementByTestId(element, "title-background");
    const entryTestIds = [
      "title-new-game",
      "title-load",
      "title-settings",
      "title-gallery",
      "title-media",
      "title-exit"
    ];

    expect(assets.titleBackgroundUri).toBe("/assets/bg/title.png");
    expect(root?.props).toMatchObject({ "data-background": "resolved", className: "game-a-title-surface" });
    expect(background?.props).toMatchObject({
      alt: "",
      "aria-hidden": "true",
      className: "game-a-title-background",
      src: "/assets/bg/title.png"
    });
    expect(entryTestIds.map((testId) => titleEntryLabel(findElementByTestId(element, testId)))).toEqual([
      "开始故事",
      "读取存档",
      "运行设置",
      "图鉴回忆",
      "媒体社群",
      "离开这里"
    ]);

    clickElement(findElementByTestId(element, "title-new-game"));
    clickElement(findElementByTestId(element, "title-load"));
    clickElement(findElementByTestId(element, "title-settings"));
    expect(dispatch).toHaveBeenNthCalledWith(1, "new-game");
    expect(dispatch).toHaveBeenNthCalledWith(2, "open-load");
    expect(dispatch).toHaveBeenNthCalledWith(3, "open-settings");

    for (const testId of ["title-gallery", "title-media", "title-exit"]) {
      const entry = findElementByTestId(element, testId);
      expect(entry?.props).toMatchObject({ "data-placeholder": "true", type: "button" });
      expect((entry?.props as { onClick?: unknown }).onClick).toBeUndefined();
      clickElement(entry);
    }
    expect(dispatch).toHaveBeenCalledTimes(3);
  });

  it("keeps the start label stable and exposes busy state while VN presentation prepares", () => {
    const surfaces = createGameASurfaces({
      assets: resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig),
      config: gameAUiConfig,
      navigation: createNavigation({}),
      vnPreparationPending: true
    });
    const TitleSurface = surfaces.Title;
    const element = <TitleSurface actions={{ dispatch: vi.fn() }} model={createTitleModel()} />;
    const start = findElementByTestId(element, "title-new-game");

    expect(start?.props).toMatchObject({
      "aria-busy": true,
      "aria-label": "开始故事（角色资源准备中）",
      disabled: true
    });
    expect(titleEntryLabel(start)).toBe("开始故事");
  });

  it("reports a missing title background while keeping the black title fallback operable", () => {
    const registry = createAssetRegistry(gameAContentManifest);
    const missingTitleResolver: AssetResolver = {
      resolve: (input) => input.id === gameAUiConfig.title.backgroundAssetId ? {
        diagnostic: {
          code: "asset-missing",
          severity: "error",
          id: input.id,
          capability: input.capability,
          message: "missing title background"
        }
      } : registry.resolve(input)
    };
    const assets = resolveGameAUiAssets(missingTitleResolver, gameAUiConfig);
    const surfaces = createGameASurfaces({
      assets,
      config: gameAUiConfig,
      navigation: createNavigation({}),
      vnPreparationPending: false
    });
    const TitleSurface = surfaces.Title;
    const element = <TitleSurface actions={{ dispatch: vi.fn() }} model={createTitleModel()} />;

    expect(assets.titleBackgroundUri).toBeUndefined();
    expect(assets.diagnostics).toMatchObject([
      { code: "asset-missing", id: "bg/title", capability: "image" }
    ]);
    expect(findElementByTestId(element, "title-surface")?.props).toMatchObject({ "data-background": "fallback" });
    expect(findElementByTestId(element, "title-background")).toBeUndefined();
    expect(findElementByTestId(element, "title-new-game")).toBeDefined();
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

    expect(assets.dialogFrameUri).toBe("/assets/ui/dialog-frame.png");
    expect(assets.uiAudio).toEqual({
      cues: {
        activate: { gain: 1, uri: "/assets/sfx/ui-click-default.ogg" },
        hover: { gain: 1, uri: "/assets/sfx/ui-hover-default.ogg" }
      },
      defaults: { click: "activate", hover: "hover" },
      hoverThrottleMs: 60
    });
    expect(gameAUiConfig.dialog.frameAssetId).toBe("ui/dialog-frame");
    expect(gameAUiConfig.dialog.appearance).toEqual({ backgroundOpacity: 1 });
    expect(assets.diagnostics).toEqual([]);
    expect(root?.props).toMatchObject({ "data-frame": "resolved" });
    expect((root?.props as { style?: Record<string, string | number> }).style).toMatchObject({
      pointerEvents: "none",
      opacity: 0.75,
      "--game-a-dialog-background-opacity": 0.92
    });
    expect(root?.props).toMatchObject({ "data-dialog-background-opacity": "0.92" });
  });

  it("delegates Cue to the shared canonical borderless surface", () => {
    const model: VnCueViewModel = {
      visible: true,
      authorId: "Narrator",
      text: "Do not turn around.",
      richText: { text: "Do not turn around.", runs: [{ start: 0, end: 19, style: { bold: true } }] },
      display: { textSize: "large", textSpeed: 0.8 },
      presentation: { targetVisible: false, mounted: true, opacity: 0.5, phase: "hiding" }
    };
    const element = GameACueSurface({ actions: {}, model });
    const root = findElementByTestId(element, "vn-cue-surface");

    expect(root?.props).toMatchObject({
      "aria-label": "演出文本：Narrator",
      "data-text-size": "large",
      "data-ui-phase": "hiding"
    });
    expect((root?.props as { style?: Record<string, unknown> }).style).toMatchObject({
      border: 0,
      background: "none",
      pointerEvents: "none",
      opacity: 0.5
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
      children: "[Mira]"
    });
    expect(state?.props).toMatchObject({
      className: "game-a-dialog-state game-a-screen-reader-only",
      children: "阅读中"
    });
  });

  it.each(["Alice", "alice", "ALICE"])("maps %s to the configured Alice label", (speakerId) => {
    const assets = resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig);
    const element = GameADialogSurface({
      actions: {},
      assets,
      config: gameAUiConfig,
      model: createDialogModel({ speakerId, speakerLabel: speakerId })
    });

    expect(findElementByTestId(element, "vn-dialog-speaker")?.props).toMatchObject({ children: "[爱丽丝]" });
  });

  it("preserves the existing Narrator label mapping", () => {
    const assets = resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig);
    const element = GameADialogSurface({
      actions: {},
      assets,
      config: gameAUiConfig,
      model: createDialogModel({ speakerId: "Narrator", speakerLabel: "Narrator" })
    });

    expect(findElementByTestId(element, "vn-dialog-speaker")?.props).toMatchObject({ children: "[旁白]" });
  });

  it.each(["nar", "NAR"])("hides the configured %s nameplate", (speakerId) => {
    const assets = resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig);
    const element = GameADialogSurface({
      actions: {},
      assets,
      config: gameAUiConfig,
      model: createDialogModel({ speakerId, speakerLabel: speakerId })
    });

    expect(findElementByTestId(element, "vn-dialog-speaker")).toBeUndefined();
  });

  it("keeps the global speaker-name switch authoritative", () => {
    const assets = resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig);
    const hiddenSpeakerConfig = {
      ...gameAUiConfig,
      dialog: { ...gameAUiConfig.dialog, showSpeakerName: false }
    } as unknown as typeof gameAUiConfig;
    const element = GameADialogSurface({
      actions: {},
      assets,
      config: hiddenSpeakerConfig,
      model: createDialogModel({ speakerId: "alice", speakerLabel: "alice" })
    });

    expect(findElementByTestId(element, "vn-dialog-speaker")).toBeUndefined();
  });

  it("renders centered choice skin without changing choice dispatch", () => {
    const assets = resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig);
    const surfaces = createGameASurfaces({ assets, config: gameAUiConfig, navigation: createNavigation({}), vnPreparationPending: false });
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
    const surfaces = createGameASurfaces({ assets, config: gameAUiConfig, navigation: createNavigation({}), vnPreparationPending: false });
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
    const registry = createAssetRegistry(gameAContentManifest);
    const missingResolver: AssetResolver = {
      resolve: (input) => input.id === gameAUiConfig.dialog.frameAssetId ? {
        diagnostic: {
          code: "asset-missing",
          severity: "error",
          id: input.id,
          capability: input.capability,
          message: "missing texture"
        }
      } : registry.resolve(input)
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
    expect(assets.diagnostics).toMatchObject([{ code: "asset-missing", id: "ui/dialog-frame" }]);
    expect(root?.props).toMatchObject({ "data-frame": "fallback" });
    expect(findElementByTestId(element, "vn-dialog-text")).toBeDefined();
  });

  it("reports missing UI audio without creating an alternate resolver or blocking the dialog texture", () => {
    const registry = createAssetRegistry(gameAContentManifest);
    const missingAudioResolver: AssetResolver = {
      resolve: (input) => input.capability === "audio" ? {
        diagnostic: {
          code: "asset-missing",
          severity: "error",
          id: input.id,
          capability: input.capability,
          message: "missing UI sound"
        }
      } : registry.resolve(input)
    };

    const assets = resolveGameAUiAssets(missingAudioResolver, gameAUiConfig);

    expect(assets.dialogFrameUri).toBe("/assets/ui/dialog-frame.png");
    expect(assets.uiAudio.cues).toEqual({});
    expect(assets.diagnostics).toMatchObject([
      { code: "asset-missing", id: "sfx/ui-hover-default", capability: "audio" },
      { code: "asset-missing", id: "sfx/ui-click-default", capability: "audio" }
    ]);
  });

  it("skins command labels without changing dispatched command actions", () => {
    const dispatch = vi.fn();
    const element = GameACommandBar({
      actions: { dispatch },
      model: createCommandBarModel()
    });
    const settings = findElementByTestId(element, "vn-command-settings");
    const quickLoad = findElementByTestId(element, "vn-command-quick-load");
    const commandBar = findElementByTestId(element, "vn-command-bar");

    expect(settings?.props).toMatchObject({
      "data-action": "open-settings",
      children: "SETTINGS"
    });
    expect(quickLoad?.props).toMatchObject({
      "data-action": "quick-load",
      children: "Q.LOAD"
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
      vnPreparationPending: false,
      navigation: createNavigation({ pauseSection: "backlog", dispatch })
    });
    const PauseSurface = surfaces.PauseSurface;
    const BacklogSurface = surfaces.BacklogOverlay;
    const element = (
      <PauseSurface
        actions={{ close: vi.fn(), dispatch }}
        model={{ activeSection: "backlog", capabilities: createNavigation({}).capabilities, navigationLocked: false }}
      >
        <BacklogSurface actions={{ close: vi.fn() }} model={createBacklogModel()} />
      </PauseSurface>
    );
    const pause = findElementByTestId(element, "pause-surface");
    const root = findElementByTestId(element, "backlog-overlay");
    const tabList = findElementByTestId(element, "pause-tab-list");
    const logTab = findElementByTestId(element, "pause-tab-log");
    const saveTab = findElementByTestId(element, "pause-tab-save");
    const returnTitle = findElementByTestId(element, "pause-return-title");
    const close = findElementByTestId(element, "pause-surface-close");

    expect(pause?.props).toMatchObject({
      className: "game-a-pause-screen",
      "data-active-tab": "backlog",
      "aria-modal": "true",
      role: "dialog"
    });
    expect(root?.props).toMatchObject({ className: "game-a-pause-section", "aria-label": "日志" });
    expect(findElementByClassName(element, "game-a-pause-header")).toBeUndefined();
    expect(tabList).toBeDefined();
    expect(logTab?.props).toMatchObject({ "aria-current": "page", children: "LOG" });
    expect(saveTab?.props).toMatchObject({ children: "SAVE" });
    expect(close).toBeDefined();
    expect(returnTitle?.props).toMatchObject({ children: "TITLE" });

    (saveTab?.props as { onClick?: () => void }).onClick?.();
    expect(dispatch).toHaveBeenCalledWith("open-save");
  });

  it("uses the shared speaker label resolver in backlog without applying nameplate visibility", () => {
    const surfaces = createGameASurfaces({
      assets: resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig),
      config: gameAUiConfig,
      navigation: createNavigation({ pauseSection: "backlog" }),
      vnPreparationPending: false
    });
    const BacklogSurface = surfaces.BacklogOverlay;
    const markup = renderToStaticMarkup(
      <BacklogSurface
        actions={{ close: vi.fn() }}
        model={createBacklogModel([
          { speaker: "Alice", text: "Mapped." },
          { speaker: "nar", text: "Hidden only on the nameplate." },
          { speaker: "Mira", text: "Fallback preserves casing." }
        ])}
      />
    );

    expect(markup).toContain("<strong>爱丽丝</strong>");
    expect(markup).toContain("<strong>nar</strong>");
    expect(markup).toContain("<strong>Mira</strong>");
  });

  it("renders save and load as separate pause tabs with CSS thumbnail placeholders for real slot ids", () => {
    const assets = resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig);
    const surfaces = createGameASurfaces({
      assets,
      config: gameAUiConfig,
      vnPreparationPending: false,
      navigation: createNavigation({ pauseSection: "save" })
    });
    const SaveLoadSurface = surfaces.SaveLoadOverlay;
    const saveMarkup = renderGameAPauseMarkup(surfaces, "save", <SaveLoadSurface actions={createSaveLoadActions()} model={createSaveLoadModel("save")} />);

    expect(saveMarkup).toContain('class="game-a-pause-screen"');
    expect(saveMarkup).toContain('data-active-tab="save"');
    expect(saveMarkup).not.toContain('data-testid="save-load-mode"');
    expect(saveMarkup).toContain('data-testid="pause-tab-save"');
    expect(saveMarkup).toContain('aria-current="page"');
    expect(saveMarkup.match(/data-testid="save-slot-\d+-thumbnail"/g)).toEqual([
      'data-testid="save-slot-1-thumbnail"',
      'data-testid="save-slot-2-thumbnail"',
      'data-testid="save-slot-3-thumbnail"',
      'data-testid="save-slot-4-thumbnail"',
      'data-testid="save-slot-5-thumbnail"'
    ]);
    expect(saveMarkup).toContain('data-testid="save-page-indicator"');
    expect(saveMarkup).toContain("1 / 8");
    expect(saveMarkup).toContain('draggable="false"');
    expect(saveMarkup).toContain("<small>M: Saved line</small>");

    const loadSurfaces = createGameASurfaces({
      assets,
      config: gameAUiConfig,
      vnPreparationPending: false,
      navigation: createNavigation({ pauseSection: "load" })
    });
    const LoadSurface = loadSurfaces.SaveLoadOverlay;
    const loadMarkup = renderGameAPauseMarkup(loadSurfaces, "load", <LoadSurface actions={createSaveLoadActions()} model={createSaveLoadModel("load")} />);

    expect(loadMarkup).toContain('class="game-a-pause-screen"');
    expect(loadMarkup).toContain('data-active-tab="load"');
    expect(loadMarkup).toContain('data-testid="pause-tab-load"');
    expect(loadMarkup).toContain('aria-current="page"');
  });

  it("paginates game-a save slot ids in fixed five-row pages", () => {
    const slotIds = Array.from({ length: 40 }, (_, index) => `slot:game-a:${index + 1}`);

    expect(paginateSaveLoadSlotIds(slotIds, 0)).toEqual({
      pageCount: 8,
      pageIndex: 0,
      pageSlotIds: ["slot:game-a:1", "slot:game-a:2", "slot:game-a:3", "slot:game-a:4", "slot:game-a:5"]
    });
    expect(paginateSaveLoadSlotIds(slotIds, 7)).toMatchObject({
      pageCount: 8,
      pageIndex: 7,
      pageSlotIds: ["slot:game-a:36", "slot:game-a:37", "slot:game-a:38", "slot:game-a:39", "slot:game-a:40"]
    });
  });

  it("locks pause tab navigation while load confirmation is visible", () => {
    const surfaces = createGameASurfaces({
      assets: resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig),
      config: gameAUiConfig,
      vnPreparationPending: false,
      navigation: createNavigation({ pauseSection: "load" })
    });
    const SaveLoadSurface = surfaces.SaveLoadOverlay;
    const markup = renderGameAPauseMarkup(
      surfaces,
      "load",
      <SaveLoadSurface actions={createSaveLoadActions()} model={createSaveLoadModel("load", { pendingLoad: true })} />,
      true
    );

    expect(markup).toContain('data-testid="load-confirmation"');
    expect(markup).toMatch(/data-testid="pause-tab-settings"[^>]*disabled=""/);
    expect(markup).toMatch(/data-testid="pause-surface-close"[^>]*disabled=""/);
    expect(markup).toMatch(/data-testid="pause-return-title"[^>]*disabled=""/);
    expect(markup.indexOf('data-testid="load-confirm"')).toBeLessThan(markup.indexOf('data-testid="load-cancel"'));
  });

  it("renders settings inside the VN pause tab shell", () => {
    const surfaces = createGameASurfaces({
      assets: resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig),
      config: gameAUiConfig,
      vnPreparationPending: false,
      navigation: createNavigation({ pauseSection: "settings" })
    });
    const SettingsSurface = surfaces.SettingsOverlay;
    const markup = renderGameAPauseMarkup(surfaces, "settings", <SettingsSurface actions={createSettingsActions()} model={createSettingsModel()} />);

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
    expect(findElementByTestId(soundElement, "settings-sound-ui")).toBeDefined();
    expect(findElementByTestId(soundElement, "settings-group-system")).toBeUndefined();
    expect(findElementByTestId(soundElement, "settings-system-language")).toBeUndefined();

    const displayElement = createSettingsContentElement("display");
    expect(findElementByTestId(displayElement, "settings-group-display")).toBeDefined();
    expect(findElementByTestId(displayElement, "settings-display-textbox-opacity")).toBeUndefined();
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

  it("patches the existing UI sound volume through the SOUND step meter", () => {
    const actions = createSettingsActions();
    const element = createSettingsContentElement("sound", actions);

    (findElementByTestId(element, "settings-sound-ui-next")?.props as { onClick?: () => void }).onClick?.();

    expect(actions.patchSettings).toHaveBeenCalledWith({ sound: { uiVolume: 0.6 } });
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
      vnPreparationPending: false,
      navigation: createNavigation({})
    });
    const SaveLoadSurface = surfaces.SaveLoadOverlay;
    const markup = renderToStaticMarkup(<SaveLoadSurface actions={createSaveLoadActions()} model={createSaveLoadModel("load")} />);

    expect(markup).toContain('class="game-a-overlay-panel"');
    expect(markup).not.toContain('data-testid="pause-tab-list"');
  });
});

function createDialogModel(overrides: Partial<VnDialogViewModel> = {}): VnDialogViewModel {
  return {
    visible: true,
    speakerId: "Mira",
    speakerLabel: "Mira",
    text: "The corridor light flickers once.",
    state: "line",
    appearance: { backgroundOpacity: 0.92 },
    display: { textSize: "medium", textSpeed: 0.5 },
    presentation: { targetVisible: false, mounted: true, opacity: 0.75, phase: "hiding" },
    ...overrides
  };
}

function createTitleModel(): TitleViewModel {
  return {
    visible: true,
    title: "Game A",
    capabilities: {
      canStartNewGame: true,
      canSave: false,
      canLoad: true,
      canOpenSettings: true,
      canOpenBacklog: false,
      canOpenPause: false,
      canAuto: false,
      canSkip: false,
      canReturnTitle: false
    }
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
      canOpenPause: true,
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
      { action: "quick-save", label: "Q.SAVE", enabled: true, active: false, testId: "vn-command-quick-save", toggle: false },
      { action: "open-load", label: "LOAD", enabled: true, active: false, testId: "vn-command-load", toggle: false },
      { action: "quick-load", label: "Q.LOAD", enabled: true, active: false, testId: "vn-command-quick-load", toggle: false },
      { action: "open-settings", label: "SETTING", enabled: true, active: false, testId: "vn-command-settings", toggle: false }
    ]
  };
}

function createBacklogModel(entries: BacklogOverlayViewModel["entries"] = [
  { speaker: "M", text: "You were right." },
  { speaker: "Y", text: "Then we keep looking." }
]): BacklogOverlayViewModel {
  return {
    visible: true,
    placement: "pause",
    entries
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
    placement: "pause",
    mode,
    slotIds: Array.from({ length: 40 }, (_, index) => `slot:game-a:${index + 1}`),
    slots: [filledSlot],
    slotPreviewsById: {
      "slot:game-a:1": {
        height: 180,
        kind: "image",
        mime: "image/webp",
        uri: "blob:game-a-save-preview",
        width: 320
      }
    },
    canSave: true,
    pendingLoadSlot: pendingLoad ? filledSlot : undefined,
    busy: false,
    activeOperation: undefined,
    lastError: undefined
  };
}

function createSaveLoadActions() {
  return {
    cancelLoad: vi.fn(),
    close: vi.fn(),
    confirmLoad: vi.fn(),
    loadPreviews: vi.fn(),
    requestLoad: vi.fn(),
    save: vi.fn()
  };
}

function createSettingsModel(): SettingsOverlayViewModel {
  return {
    visible: true,
    placement: "pause",
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

function renderGameAPauseMarkup(
  surfaces: ReturnType<typeof createGameASurfaces>,
  activeSection: GamePauseSection,
  children: ReactNode,
  navigationLocked = false
) {
  const PauseSurface = surfaces.PauseSurface;
  return renderToStaticMarkup(
    <PauseSurface
      actions={{ close: vi.fn(), dispatch: vi.fn() }}
      model={{ activeSection, capabilities: createNavigation({}).capabilities, navigationLocked }}
    >
      {children}
    </PauseSurface>
  );
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
  pauseSection,
  dispatch = vi.fn()
}: {
  pauseSection?: GameASurfaceNavigation["pauseSection"];
  dispatch?: GameASurfaceNavigation["dispatch"];
}): GameASurfaceNavigation {
  return {
    pauseSection,
    capabilities: {
      canStartNewGame: false,
      canSave: true,
      canLoad: true,
      canOpenSettings: true,
      canOpenBacklog: true,
      canOpenPause: true,
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

function titleEntryLabel(entry: ReactElement | undefined): string | undefined {
  const label = findElementByClassName(entry, "game-a-title-menu-label");
  const children = (label?.props as { children?: unknown } | undefined)?.children;
  return typeof children === "string" ? children : undefined;
}

function clickElement(element: ReactElement | undefined) {
  (element?.props as { onClick?: () => void } | undefined)?.onClick?.();
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
