import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { createAssetRegistry, type AssetResolver } from "@v-ronpa/asset-registry";
import type { VnDialogViewModel } from "@v-ronpa/app-vn-shell";
import { gameAContentManifest } from "../contentManifest";
import { createGameASurfaces, GameADialogSurface } from "./GameASurfaces";
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

  it("resolves the generated dialog frame through the manifest and applies it to the dialog surface", () => {
    const assets = resolveGameAUiAssets(createAssetRegistry(gameAContentManifest), gameAUiConfig);
    const element = GameADialogSurface({
      actions: {},
      assets,
      config: gameAUiConfig,
      model: createDialogModel()
    });
    const root = findElementByTestId(element, "vn-dialog-surface");

    expect(assets.dialogFrameUri).toBe("/game-a/ui/dialog-frame.png");
    expect(assets.diagnostics).toEqual([]);
    expect(root?.props).toMatchObject({ "data-frame": "resolved" });
    expect((root?.props as { style?: Record<string, string> }).style).toMatchObject({
      "--game-a-dialog-frame": "url(/game-a/ui/dialog-frame.png)",
      pointerEvents: "none"
    });
  });

  it("returns diagnostics and keeps the dialog renderable when the texture is missing", () => {
    const missingResolver: AssetResolver = {
      resolve: () => ({
        diagnostic: {
          code: "asset-missing",
          severity: "error",
          id: gameAUiConfig.dialog.frameAssetId,
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
    expect(assets.diagnostics).toMatchObject([{ code: "asset-missing", id: gameAUiConfig.dialog.frameAssetId }]);
    expect(root?.props).toMatchObject({ "data-frame": "fallback" });
    expect(findElementByTestId(element, "vn-dialog-text")).toBeDefined();
  });
});

function createDialogModel(): VnDialogViewModel {
  return {
    visible: true,
    speakerId: "Mira",
    speakerLabel: "Mira",
    text: "The corridor light flickers once.",
    state: "line",
    display: { textSize: "medium", textboxOpacity: 0.92, textSpeed: 0.5 }
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
