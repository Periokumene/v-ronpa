import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createAssetRegistry, type AssetResolver } from "@v-ronpa/asset-registry";
import type { VnCommandBarViewModel, VnDialogViewModel } from "@v-ronpa/app-vn-shell";
import { gameAContentManifest } from "../contentManifest";
import { createGameASurfaces, GameACommandBar, GameADialogSurface } from "./GameASurfaces";
import { gameAUiConfig } from "./gameAUiConfig";
import { resolveGameAUiAssets } from "./resolveGameAUiAssets";

describe("game-a interaction surfaces", () => {
  it("provides custom implementations for every first-pass surface slot", () => {
    const assets = resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig);
    const surfaces = createGameASurfaces({ assets, config: gameAUiConfig });

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

function findElementByTestId(node: ReactNode, testId: string): ReactElement | undefined {
  let match: ReactElement | undefined;
  visit(node, (current) => {
    if (match || !isValidElement(current)) return;
    const props = current.props as Record<string, unknown>;
    if (props["data-testid"] === testId) match = current;
  });
  return match;
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
