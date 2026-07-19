import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const smokeSourceFile = fileURLToPath(new URL("../../apps/game-a/src/test-nani/smoke.nani", import.meta.url));
const smokePreviewText = "CHECKPOINT SMOKE 00 - test-only VN entry is active.";

// This intentionally covers the full edit/HMR/restore/branch/media workflow;
// leave enough headroom when the long Harness smoke runs in parallel on CI.
test.setTimeout(420_000);

test("game-a ships product UI while exercising the test-only VN entry", async ({ page }) => {
  const consoleErrors: string[] = [];
  const uiAudioRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    if (request.url().includes("/game-a/media/sfx/ui-")) uiAudioRequests.push(request.url());
  });

  await page.addInitScript(() => {
    localStorage.removeItem("v-ronpa:game-a:settings:v2");
    indexedDB.deleteDatabase("v-ronpa-game-a-saves-v10");
  });
  await page.goto("/");

  await expect(page.getByTestId("game-a-playfield")).toBeVisible();
  await expect(page.getByTestId("game-a-app-id")).toHaveText("game-a");
  await expect(page.getByTestId("title-surface")).toHaveClass(/game-a-title-surface/);
  await expect(page.locator("html")).toHaveAttribute("data-v-ronpa-web-game-document", "active");
  const workbench = page.getByTestId("vn-devtools-dock");
  await expect(workbench).toBeVisible();
  await expect(workbench).toHaveAttribute("aria-label", "Nani Workbench");
  await expect(workbench).toContainText("test / smoke.nani");
  await expect(page.getByTestId("vn-devtools-source-editor")).toBeVisible();
  const workbenchStaticPolicy = await page.getByTestId("vn-devtools-source-editor").evaluate((target) => {
    const contextMenu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    const selectStart = new Event("selectstart", { bubbles: true, cancelable: true });
    target.dispatchEvent(contextMenu);
    target.dispatchEvent(selectStart);
    return { contextMenu: contextMenu.defaultPrevented, selectStart: selectStart.defaultPrevented };
  });
  expect(workbenchStaticPolicy).toEqual({ contextMenu: true, selectStart: true });
  await expect(page.getByTestId("vn-devtools-bottom-panel")).toHaveAttribute("data-active-panel", "state");
  await expect(workbench.getByLabel("Current runtime position")).toHaveCount(0);
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute(
    "data-pixi-character-preparation",
    "ready",
    { timeout: 15_000 }
  );
  const initialPlayfieldWidth = (await page.getByTestId("game-a-playfield").boundingBox())?.width ?? 0;
  const initialWorkbenchWidth = (await workbench.boundingBox())?.width ?? 0;
  expect(initialWorkbenchWidth).toBeGreaterThanOrEqual(320);
  expect(initialWorkbenchWidth).toBeLessThanOrEqual(720);
  expect(initialWorkbenchWidth).toBeLessThanOrEqual(1280 * 0.45 + 1);
  const initialViewportGeometry = await readDevViewportGeometry(page);
  expect(initialViewportGeometry).toMatchObject({
    mode: "fidelity",
    logicalWidth: 1280,
    logicalHeight: 720,
    playfieldOffsetWidth: 1280,
    playfieldOffsetHeight: 720,
    pixiLayerOffsetWidth: 1280,
    pixiLayerOffsetHeight: 720
  });
  expect(initialViewportGeometry.scale).toBeLessThan(1);
  expect(initialViewportGeometry.stageWidth).toBeCloseTo(initialViewportGeometry.cellWidth, 0);
  const storySessionBeforeLayoutChanges = await readDevtoolsStorySession(page);
  await page.screenshot({ path: "test-results/game-a-workbench-expanded.png", fullPage: true });

  const sourceLineCount = await page.locator('[data-testid^="vn-devtools-line-"]').count();
  await page.keyboard.press("Control+f");
  const sourceFind = page.getByTestId("vn-devtools-search");
  await expect(sourceFind).toBeFocused();
  expect(await sourceFind.evaluate((target) => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(false);
  await sourceFind.fill("CHECKPOINT SMOKE");
  await expect(page.locator('[data-testid^="vn-devtools-line-"]')).toHaveCount(sourceLineCount);
  await expect(page.getByTestId("vn-devtools-find-count")).not.toHaveText("0 / 0");
  await sourceFind.press("Enter");
  await expect(page.locator('.vn-devtools-source-line[data-find-current="true"]')).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(sourceFind).toHaveValue("");

  await page.keyboard.press("Control+Shift+o");
  const symbolSearch = page.getByTestId("vn-devtools-symbol-search");
  await expect(symbolSearch).toBeFocused();
  await symbolSearch.fill("Interaction");
  await page.getByRole("option", { name: /Interaction/ }).click();
  await expect(page.locator(".vn-devtools-source-line.is-selected")).toContainText("#Interaction");
  expect(await readDevtoolsStorySession(page)).toBe(storySessionBeforeLayoutChanges);

  await page.setViewportSize({ width: 1672, height: 941 });
  await page.getByTestId("vn-devtools-resizer").focus();
  await page.keyboard.press("End");
  await expect.poll(async () => Math.round((await workbench.boundingBox())?.width ?? 0)).toBe(720);
  await page.screenshot({ path: "test-results/game-a-workbench-ide-720.png", fullPage: true });
  await page.keyboard.press("Home");
  await expect.poll(async () => Math.round((await workbench.boundingBox())?.width ?? 0)).toBe(320);
  await page.screenshot({ path: "test-results/game-a-workbench-ide-320.png", fullPage: true });
  const minWidthResizer = await page.getByTestId("vn-devtools-resizer").boundingBox();
  if (!minWidthResizer) throw new Error("Workbench resizer is unavailable.");
  await page.mouse.move(minWidthResizer.x + minWidthResizer.width / 2, minWidthResizer.y + 24);
  await page.mouse.down();
  await page.mouse.move(minWidthResizer.x + minWidthResizer.width / 2 - 100, minWidthResizer.y + 24);
  await page.mouse.up();
  await expect.poll(async () => Math.round((await workbench.boundingBox())?.width ?? 0)).toBe(420);
  await page.setViewportSize({ width: 1280, height: 720 });

  await workbench.getByRole("button", { name: "Collapse Nani Workbench" }).click();
  await expect(page.getByTestId("vn-devtools-collapsed-button")).toBeVisible();
  await expect.poll(async () => (await page.getByTestId("game-a-playfield").boundingBox())?.width ?? 0).toBeGreaterThan(initialPlayfieldWidth);
  await expect.poll(async () => (await readDevViewportGeometry(page)).scale).toBe(1);
  expect(await readDevViewportGeometry(page)).toMatchObject({
    mode: "fidelity",
    logicalWidth: 1280,
    logicalHeight: 720,
    playfieldOffsetWidth: 1280,
    playfieldOffsetHeight: 720
  });
  await page.screenshot({ path: "test-results/game-a-workbench-collapsed.png", fullPage: true });
  await page.getByTestId("vn-devtools-collapsed-button").click();
  await expect(workbench).toBeVisible();
  const widthBeforeKeyboardResize = (await workbench.boundingBox())?.width ?? 0;
  await page.getByTestId("vn-devtools-resizer").focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await workbench.boundingBox())?.width ?? 0).toBeGreaterThan(widthBeforeKeyboardResize);
  const resizedFidelityGeometry = await readDevViewportGeometry(page);
  expect(resizedFidelityGeometry.logicalWidth).toBe(1280);
  expect(resizedFidelityGeometry.logicalHeight).toBe(720);
  expect(resizedFidelityGeometry.scale).toBeLessThan(initialViewportGeometry.scale);
  await page.getByTestId("game-a-dev-viewport-responsive").click();
  await expect(page.getByTestId("game-a-dev-viewport-responsive")).toHaveAttribute("aria-pressed", "true");
  const responsiveGeometry = await readDevViewportGeometry(page);
  expect(responsiveGeometry).toMatchObject({ mode: "responsive", scale: 1 });
  expect(responsiveGeometry.logicalWidth).toBe(responsiveGeometry.cellWidth);
  expect(responsiveGeometry.logicalHeight).toBe(responsiveGeometry.cellHeight);
  expect(responsiveGeometry.playfieldOffsetWidth).toBe(responsiveGeometry.cellWidth);
  expect(responsiveGeometry.pixiLayerOffsetWidth).toBe(responsiveGeometry.playfieldOffsetWidth);
  expect(responsiveGeometry.pixiLayerOffsetHeight).toBe(responsiveGeometry.playfieldOffsetHeight);
  expect(await readDevtoolsStorySession(page)).toBe(storySessionBeforeLayoutChanges);
  await page.getByTestId("game-a-dev-viewport-fidelity").click();
  await expect(page.getByTestId("game-a-dev-viewport-fidelity")).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 820, height: 720 });
  await expect.poll(async () => page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>('[data-testid="vn-devtools-dock"]');
    return dock ? getComputedStyle(dock).position : "missing";
  })).toBe("fixed");
  await expect.poll(async () => (await page.getByTestId("game-a-playfield").boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(819);
  expect((await workbench.boundingBox())?.width ?? 900).toBeLessThanOrEqual(820 * 0.92 + 1);
  await page.screenshot({ path: "test-results/game-a-workbench-overlay.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: "test-results/game-a-title.png", fullPage: true });

  await page.getByTestId("title-settings").click();
  await expect.poll(() => uiAudioRequests.some((url) => url.endsWith("/ui-click-default.ogg"))).toBe(true);
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  await page.getByTestId("settings-subtab-sound").hover();
  await expect.poll(() => uiAudioRequests.some((url) => url.endsWith("/ui-hover-default.ogg"))).toBe(true);
  await clickByTestId(page, "settings-subtab-sound");
  await clickByTestId(page, "settings-sound-ui-next");
  await expect(page.getByTestId("settings-sound-ui-value")).toHaveText("60%");
  await page.waitForTimeout(160);
  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem("v-ronpa:game-a:settings:v2");
    return raw ? (JSON.parse(raw) as { sound?: { uiVolume?: number } }).sound?.uiVolume : undefined;
  })).toBe(0.6);
  await page.screenshot({ path: "test-results/game-a-settings-sound.png", fullPage: true });
  await clickByTestId(page, "settings-subtab-display");
  await expect(page.getByTestId("settings-display-textbox-opacity")).toHaveCount(0);
  await clickByTestId(page, "settings-display-text-size-next");
  await clickByTestId(page, "settings-display-text-speed-next");
  await page.screenshot({ path: "test-results/game-a-settings.png", fullPage: true });
  await clickByTestId(page, "settings-overlay-close");

  await expect(page.getByTestId("pixi-layer")).toHaveAttribute(
    "data-pixi-character-preparation",
    "ready",
    { timeout: 15_000 }
  );
  await expect(page.getByTestId("title-new-game")).toBeEnabled({ timeout: 15_000 });
  await clickByTestId(page, "title-new-game");
  await expect(page.getByTestId("game-a-mode")).toHaveText("视觉小说");
  await advanceUntilText(page, "CHECKPOINT SMOKE 00", 6);
  const storySessionBeforePreview = await readDevtoolsStorySession(page);
  const firstStableLine = page.locator('[data-testid^="vn-devtools-line-"]').filter({ hasText: "CHECKPOINT SMOKE 00" }).first();
  await firstStableLine.locator(".vn-devtools-line-select").click();
  await page.getByTestId("vn-devtools-primary-action").click();
  await expect(workbench).toContainText("Stable checkpoint installed");
  await expect(page.getByTestId("vn-devtools-bottom-panel")).toHaveAttribute("data-active-panel", "state");
  await expect(firstStableLine.getByLabel("Pinned preview target")).toBeVisible();
  await expect(firstStableLine.getByLabel("Current runtime position")).toBeVisible();
  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT SMOKE 00");
  await expect.poll(() => readDevtoolsStorySession(page)).toBe(storySessionBeforePreview + 1);
  const previewSnapshot = await readGameSnapshot(page);
  expect(previewSnapshot).toMatchObject({
    mode: "vn",
    workbench: {
      phase: "ready",
      pinned: true
    },
    story: {
      instructionPointer: 9,
      text: "CHECKPOINT SMOKE 00 - test-only VN entry is active.",
      variables: { route: "smoke-preview" },
      choices: []
    },
    pixi: {
      backgrounds: ["MainBackground"],
      characters: ["alice"],
      weather: ["rain"]
    },
    stableCheckpoint: {
      ui: {
        dialog: true,
        commandBar: true,
        toastLayer: true
      },
      media: {
        bgmByGroup: {
          music: { sourceRef: "bgm:game-a-main", volume: 0.35 }
        },
        loopingSfxByKey: {
          rain: { sourceRef: "sfx:gentle-rain-loop", group: "rain", volume: 0.2 }
        }
      }
    }
  });
  await page.screenshot({ path: "test-results/game-a-workbench-preview.png", fullPage: true });
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-frame", "resolved");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-dialog-background-opacity", "1");
  await expect(page.getByTestId("vn-command-bar")).toBeVisible();
  await expect(page.getByTestId("pixi-layer")).toBeVisible();
  await page.screenshot({ path: "test-results/game-a-vn-dialog.png", fullPage: true });

  const fidelityDialogGeometry = await readNormalizedElementGeometry(page, "vn-dialog-surface");
  expect(fidelityDialogGeometry.left).toBeCloseTo(0.117, 2);
  const storySessionBeforeViewportMode = await readDevtoolsStorySession(page);
  await page.getByTestId("game-a-dev-viewport-responsive").click();
  await expect(page.getByTestId("game-a-dev-viewport-responsive")).toHaveAttribute("aria-pressed", "true");
  const responsiveDialogGeometry = await readNormalizedElementGeometry(page, "vn-dialog-surface");
  expect(responsiveDialogGeometry.left).toBeCloseTo(0.117, 2);
  expect(responsiveDialogGeometry.width).toBeCloseTo(fidelityDialogGeometry.width, 2);
  expect(await readDevtoolsStorySession(page)).toBe(storySessionBeforeViewportMode);
  await page.screenshot({ path: "test-results/game-a-workbench-responsive.png", fullPage: true });
  await page.getByTestId("game-a-dev-viewport-fidelity").click();
  await expect(page.getByTestId("game-a-dev-viewport-fidelity")).toHaveAttribute("aria-pressed", "true");
  const restoredFidelityDialogGeometry = await readNormalizedElementGeometry(page, "vn-dialog-surface");
  expect(restoredFidelityDialogGeometry.left).toBeCloseTo(fidelityDialogGeometry.left, 3);
  expect(restoredFidelityDialogGeometry.width).toBeCloseTo(fidelityDialogGeometry.width, 3);

  await exerciseNaniSourceSaveFlow(page, workbench);
  await exerciseWorkbenchDecisionFlow(page, workbench, firstStableLine);
  const persistedWorkbenchSession = await page.evaluate(() => {
    const raw = sessionStorage.getItem("v-ronpa:game-a:nani-devtools:v3");
    return raw ? JSON.parse(raw) as {
      version?: number;
      layout?: { bottomPanelOpen?: boolean; activePanel?: string; bottomPanelHeight?: number };
      decisions?: unknown[];
    } : undefined;
  });
  expect(persistedWorkbenchSession).toMatchObject({
    version: 3,
    layout: { bottomPanelOpen: true, activePanel: "state", bottomPanelHeight: 360 }
  });
  expect(persistedWorkbenchSession?.decisions).toHaveLength(2);
  await page.reload();
  await expect(page.getByTestId("game-a-mode")).toHaveText("视觉小说", { timeout: 15_000 });
  await expect(page.getByTestId("vn-dialog-text")).toContainText(smokePreviewText);
  await expect(page.getByTestId("vn-devtools-bottom-panel")).toHaveAttribute("data-active-panel", "state");
  await expect(page.getByTestId("vn-devtools-panel-resizer")).toHaveAttribute("aria-valuenow", "360");

  await advanceUntilChoices(page, 4);
  await expect(page.getByTestId("vn-choice-0")).toHaveText("交互与存档");
  await expectChoiceButtonCentered(page, "vn-choice-0");
  await page.screenshot({ path: "test-results/game-a-vn-choice.png", fullPage: true });
  await clickByTestId(page, "vn-choice-0");

  await advanceUiWaitsUntilText(page, "CHECKPOINT SMOKE UI", 10);
  await expect(page.getByTestId("vn-command-bar")).toHaveAttribute("data-ui-phase", "shown");
  await expect(page.getByTestId("vn-command-save")).toBeEnabled();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-surface")).toBeVisible();
  await expect(page.getByTestId("pause-surface")).toHaveAttribute("data-active-tab", "backlog");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveCount(0);
  await expect(page.getByTestId("vn-choice-overlay")).toHaveCount(0);
  await expect(page.getByTestId("vn-command-bar")).toHaveCount(0);
  await expectPauseToCoverPlayfield(page);
  await page.screenshot({ path: "test-results/game-a-pause.png", fullPage: true });
  await clickByTestId(page, "pause-tab-save");
  await expect(page.getByTestId("pause-surface")).toHaveAttribute("data-active-tab", "save");
  await clickByTestId(page, "pause-tab-load");
  await expect(page.getByTestId("pause-surface")).toHaveAttribute("data-active-tab", "load");
  await clickByTestId(page, "pause-surface-close");
  await expect(page.getByTestId("pause-surface")).toHaveCount(0);
  await expect(page.getByTestId("game-a-mode")).toHaveText("视觉小说");
  await expect(page.getByTestId("vn-dialog-surface")).toBeVisible();
  await expect(page.getByTestId("vn-command-bar")).toBeVisible();

  await expect(page.getByTestId("vn-command-quick-save")).toBeEnabled();
  await clickByTestId(page, "vn-command-quick-save");
  await expect(page.getByTestId("vn-command-quick-load")).toBeEnabled();
  await clickByTestId(page, "vn-command-quick-load");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT SMOKE UI");
  await page.waitForTimeout(500);
  await expect(page.getByTestId("vn-command-save")).toBeEnabled();

  await clickByTestId(page, "vn-command-save");
  await expect(page.getByTestId("pause-surface")).toHaveAttribute("data-active-tab", "save");
  await expect(page.getByTestId("save-slot-1")).toBeEnabled();
  await clickByTestId(page, "save-slot-1");
  await expect(page.getByTestId("save-slot-1")).toContainText("CHECKPOINT SMOKE UI");
  await expect(page.getByTestId("save-slot-1-thumbnail")).toHaveAttribute("src", /^blob:/);
  await expect(page.getByTestId("save-slot-1-thumbnail")).toHaveJSProperty("draggable", false);
  await page.screenshot({ path: "test-results/game-a-save.png", fullPage: true });
  await clickByTestId(page, "pause-surface-close");
  await clickByTestId(page, "vn-command-load");
  await expect(page.getByTestId("pause-surface")).toHaveAttribute("data-active-tab", "load");
  await expect(page.getByTestId("save-slot-1")).toBeEnabled();
  await clickByTestId(page, "save-slot-1");
  await expect(page.getByTestId("load-confirmation")).toBeVisible();
  await page.screenshot({ path: "test-results/game-a-save-load.png", fullPage: true });
  const workbenchSearch = page.getByTestId("vn-devtools-search");
  await page.keyboard.press("Control+f");
  await expect(workbenchSearch).toBeFocused();
  await workbenchSearch.fill("CHECKPOINT");
  await page.keyboard.press("Escape");
  await expect(workbenchSearch).toHaveValue("");
  await expect(page.getByTestId("load-confirmation")).toBeVisible();
  await page.getByTestId("load-cancel").focus();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("load-confirmation")).toHaveCount(0);
  await expect(page.getByTestId("pause-surface")).toHaveAttribute("data-active-tab", "load");
  await clickByTestId(page, "save-slot-1");
  await expect(page.getByTestId("load-confirmation")).toBeVisible();
  await clickByTestId(page, "load-confirm");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT SMOKE UI");

  await advanceUntilInputPrompt(page);
  await expect(page.getByTestId("runtime-input-prompt")).toBeVisible();
  const runtimeInput = page.getByTestId("runtime-input-field");
  await expect(runtimeInput).toHaveAttribute("autocomplete", "off");
  await expect(runtimeInput).toHaveAttribute("spellcheck", "false");
  await page.screenshot({ path: "test-results/game-a-runtime-input.png", fullPage: true });
  await runtimeInput.fill("Codex");
  await runtimeInput.selectText();
  await expect.poll(() => runtimeInput.evaluate((input) => [input.selectionStart, input.selectionEnd])).toEqual([0, 5]);
  await clickByTestId(page, "runtime-input-submit");
  await advanceUntilText(page, "CHECKPOINT SMOKE INPUT", 4);
  await advanceUntilText(page, "CHECKPOINT SMOKE PAUSE", 6);
  await advanceUntilChoices(page, 5);
  await clickByTestId(page, "vn-choice-0");

  await advanceUntilChoices(page, 10);
  await expect(page.getByTestId("vn-choice-0")).toHaveText("继续媒体测试");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-active-tasks", "empty");
  await page.screenshot({ path: "test-results/game-a-pixi.png", fullPage: true });
  await clickByTestId(page, "vn-choice-0");
  await advanceUntilText(page, "CHECKPOINT SMOKE VOICE", 4);
  await advanceUntilMovie(page, 5);
  await expect(page.getByTestId("runtime-movie-video")).toHaveJSProperty("playsInline", true);
  await expect(page.getByTestId("runtime-movie-video")).toHaveJSProperty("disablePictureInPicture", true);
  await expect(page.getByTestId("runtime-movie-video")).toHaveJSProperty("disableRemotePlayback", true);
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/game-a-movie.png", fullPage: true });
  await clickByTestId(page, "runtime-movie-skip");
  await expect(page.getByTestId("runtime-movie-overlay")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT SMOKE MOVIE", { timeout: 15_000 });

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("backlog-overlay")).toBeVisible();
  await clickByTestId(page, "pause-return-title");
  await expect(page.getByTestId("game-a-mode")).toHaveText("标题");
  await expect(page.getByTestId("title-surface")).toBeVisible();
  await expect(workbench.getByLabel("Current runtime position")).toHaveCount(0);

  expect(consoleErrors).toEqual([]);
});

async function advanceUntilText(page: Page, text: string, maxSteps: number) {
  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    const currentText = (await page.getByTestId("vn-dialog-text").textContent({ timeout: 250 }).catch(() => null)) ?? "";
    if (currentText.includes(text)) return;
    await advanceVn(page);
    await page.waitForTimeout(160);
  }
  await expect(page.getByTestId("vn-dialog-text")).toContainText(text);
}

async function advanceUiWaitsUntilText(page: Page, text: string, maxSteps: number) {
  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    const status = await page.evaluate((expectedText) => {
      const render = (window as Window & { render_game_to_text?: () => string }).render_game_to_text;
      if (!render) return "snapshot-unavailable";
      const snapshot = JSON.parse(render()) as {
        story: { text: string | null };
        stableCheckpoint: { rejection?: string };
      };
      if (snapshot.story.text?.includes(expectedText)) return "found";
      if (snapshot.stableCheckpoint.rejection !== "ui-wait") return "waiting";
      const hitPlane = document.querySelector<HTMLElement>('[data-testid="vn-advance-hit-plane"]');
      hitPlane?.click();
      return hitPlane ? "advanced-ui-wait" : "hit-plane-unavailable";
    }, text);
    if (status === "found") return;
    expect(status).not.toBe("snapshot-unavailable");
    expect(status).not.toBe("hit-plane-unavailable");
    await page.waitForTimeout(120);
  }
  await expect(page.getByTestId("vn-dialog-text")).toContainText(text);
}

async function expectPauseToCoverPlayfield(page: Page) {
  const [pauseBox, playfieldBox] = await Promise.all([
    page.getByTestId("pause-surface").boundingBox(),
    page.getByTestId("game-a-playfield").boundingBox()
  ]);
  expect(pauseBox).not.toBeNull();
  expect(playfieldBox).not.toBeNull();
  expect(Math.abs((pauseBox?.x ?? 0) - (playfieldBox?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((pauseBox?.y ?? 0) - (playfieldBox?.y ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((pauseBox?.width ?? 0) - (playfieldBox?.width ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((pauseBox?.height ?? 0) - (playfieldBox?.height ?? 0))).toBeLessThanOrEqual(1);
}

async function advanceVn(page: Page) {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.click(viewport.width / 2, viewport.height / 2);
}

async function clickByTestId(page: Page, testId: string) {
  const clicked = await page.evaluate((id) => {
    const element = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    element?.click();
    return Boolean(element);
  }, testId);
  expect(clicked).toBe(true);
}

async function expectChoiceButtonCentered(page: Page, testId: string) {
  const geometry = await page.evaluate((id) => {
    const element = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const playfield = document.querySelector<HTMLElement>('[data-testid="game-a-playfield"]');
    if (!element || !playfield) return null;
    const rect = element.getBoundingClientRect();
    const playfieldRect = playfield.getBoundingClientRect();
    return {
      deltaX: Math.abs(rect.left + rect.width / 2 - (playfieldRect.left + playfieldRect.width / 2)),
      deltaY: Math.abs(rect.top + rect.height / 2 - (playfieldRect.top + playfieldRect.height / 2))
    };
  }, testId);
  expect(geometry).not.toBeNull();
  expect(geometry?.deltaX).toBeLessThanOrEqual(4);
  expect(geometry?.deltaY).toBeLessThanOrEqual(48);
}

async function advanceUntilChoices(page: Page, maxSteps: number) {
  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    if ((await page.getByTestId("vn-choice-overlay").count()) > 0) return;
    await advanceVn(page);
    await page.waitForTimeout(160);
  }
  await expect(page.getByTestId("vn-choice-overlay")).toBeVisible();
}

async function advanceUntilMovie(page: Page, maxSteps: number) {
  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    if ((await page.getByTestId("runtime-movie-overlay").count()) > 0) return;
    await advanceVn(page);
    await page.waitForTimeout(160);
  }
  await expect(page.getByTestId("runtime-movie-overlay")).toBeVisible();
}

async function advanceUntilInputPrompt(page: Page) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await page.getByTestId("runtime-input-prompt").count()) > 0) return;
    await advanceVn(page);
    await page.waitForTimeout(120);
  }
  await expect(page.getByTestId("runtime-input-prompt")).toBeVisible();
}

async function readDevtoolsStorySession(page: Page): Promise<number> {
  const snapshot = await readGameSnapshot(page).catch(() => undefined);
  return snapshot?.story.storySession ?? -1;
}

interface DevViewportGeometry {
  mode: string;
  logicalWidth: number;
  logicalHeight: number;
  scale: number;
  cellWidth: number;
  cellHeight: number;
  stageWidth: number;
  stageHeight: number;
  playfieldOffsetWidth: number;
  playfieldOffsetHeight: number;
  pixiLayerOffsetWidth: number;
  pixiLayerOffsetHeight: number;
}

async function readDevViewportGeometry(page: Page): Promise<DevViewportGeometry> {
  return page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('[data-testid="game-a-dev-viewport"]');
    const stage = document.querySelector<HTMLElement>('[data-testid="game-a-dev-viewport-stage"]');
    const playfield = document.querySelector<HTMLElement>('[data-testid="game-a-playfield"]');
    const pixiLayer = document.querySelector<HTMLElement>('[data-testid="pixi-layer"]');
    if (!viewport || !stage || !playfield || !pixiLayer) {
      throw new Error("Game A DEV viewport geometry is unavailable.");
    }
    const stageRect = stage.getBoundingClientRect();
    return {
      mode: viewport.dataset.mode ?? "missing",
      logicalWidth: Number(viewport.dataset.logicalWidth),
      logicalHeight: Number(viewport.dataset.logicalHeight),
      scale: Number(viewport.dataset.displayScale),
      cellWidth: viewport.clientWidth,
      cellHeight: viewport.clientHeight,
      stageWidth: stageRect.width,
      stageHeight: stageRect.height,
      playfieldOffsetWidth: playfield.offsetWidth,
      playfieldOffsetHeight: playfield.offsetHeight,
      pixiLayerOffsetWidth: pixiLayer.offsetWidth,
      pixiLayerOffsetHeight: pixiLayer.offsetHeight
    };
  });
}

async function readNormalizedElementGeometry(page: Page, testId: string) {
  return page.evaluate((id) => {
    const element = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const playfield = document.querySelector<HTMLElement>('[data-testid="game-a-playfield"]');
    if (!element || !playfield) throw new Error(`Cannot normalize missing geometry for ${id}.`);
    const rect = element.getBoundingClientRect();
    const playfieldRect = playfield.getBoundingClientRect();
    return {
      left: (rect.left - playfieldRect.left) / playfieldRect.width,
      top: (rect.top - playfieldRect.top) / playfieldRect.height,
      width: rect.width / playfieldRect.width,
      height: rect.height / playfieldRect.height
    };
  }, testId);
}

interface GameATextSnapshot {
  mode: string;
  workbench: {
    phase: string;
    message: string | null;
    updateId: number | null;
    pinned: boolean;
    revision: string | null;
  };
  story: {
    storySession: number;
    instructionPointer: number;
    text: string | null;
    variables: Record<string, unknown>;
    choices: string[];
  };
  pixi: {
    revision: number;
    backgrounds: string[];
    characters: string[];
    weather: string[];
  };
  [key: string]: unknown;
}

async function readGameSnapshot(page: Page): Promise<GameATextSnapshot> {
  return page.evaluate(() => {
    const render = (window as Window & { render_game_to_text?: () => string }).render_game_to_text;
    if (!render) throw new Error("Game A text snapshot is unavailable.");
    return JSON.parse(render()) as GameATextSnapshot;
  });
}

async function exerciseNaniSourceSaveFlow(page: Page, workbench: ReturnType<Page["getByTestId"]>) {
  const originalSource = await readFile(smokeSourceFile, "utf8");
  const semanticNoOpSource = `${originalSource.trimEnd()}\n; Playwright same-revision HMR probe\n`;
  const hmrPreviewText = "CHECKPOINT SMOKE HMR - test-only VN entry is active.";
  const semanticUpdateSource = semanticNoOpSource.replace(smokePreviewText, hmrPreviewText);
  const beforeNoOp = await readGameSnapshot(page);
  await page.evaluate(() => {
    const debugWindow = window as Window & {
      __naniPixiCanvas?: Element | null;
      __naniPixiLayer?: Element | null;
    };
    debugWindow.__naniPixiLayer = document.querySelector('[data-testid="pixi-layer"]');
    debugWindow.__naniPixiCanvas = document.querySelector('[data-testid="pixi-canvas"]');
  });

  try {
    await writeFile(smokeSourceFile, semanticNoOpSource, "utf8");
    await expect.poll(async () => (await readGameSnapshot(page)).workbench.message, { timeout: 15_000 })
      .toContain("Source mapping updated");
    const afterNoOp = await readGameSnapshot(page);
    expect(afterNoOp.story.storySession).toBe(beforeNoOp.story.storySession);
    expect(afterNoOp.pixi.revision).toBe(beforeNoOp.pixi.revision);
    expect(await page.evaluate(() =>
      (window as Window & { __naniPixiLayer?: Element | null }).__naniPixiLayer
        === document.querySelector('[data-testid="pixi-layer"]')
    )).toBe(true);
    expect(await page.evaluate(() =>
      (window as Window & { __naniPixiCanvas?: Element | null }).__naniPixiCanvas
        === document.querySelector('[data-testid="pixi-canvas"]')
    )).toBe(true);

    const beforeSemanticUpdate = afterNoOp.story.storySession;
    await writeFile(smokeSourceFile, semanticUpdateSource, "utf8");
    await expect(page.getByTestId("vn-dialog-text")).toContainText(hmrPreviewText, { timeout: 15_000 });
    await expect.poll(() => readDevtoolsStorySession(page)).toBe(beforeSemanticUpdate + 1);
    await expect.poll(async () => (await readGameSnapshot(page)).workbench.message)
      .toContain("Stable checkpoint installed");
    const lastKnownGood = await readGameSnapshot(page);

    const invalidCompilerSource = `${semanticUpdateSource.trimEnd()}\n@back bg:main time:fast\n`;
    await writeFile(smokeSourceFile, invalidCompilerSource, "utf8");
    await expect.poll(async () => (await readGameSnapshot(page)).workbench.phase, { timeout: 15_000 }).toBe("error");
    await expect(page.getByTestId("vn-devtools-bottom-panel")).toHaveAttribute("data-active-panel", "problems");
    await expect.poll(async () => (await readGameSnapshot(page)).workbench.message)
      .toContain("last-known-good");
    const rejected = await readGameSnapshot(page);
    expect(rejected.story.storySession).toBe(lastKnownGood.story.storySession);
    expect(rejected.story.text).toBe(hmrPreviewText);
    const compilerDiagnostic = workbench.getByRole("button", { name: /invalid-command-param/ });
    await expect(compilerDiagnostic).toBeEnabled();
    await compilerDiagnostic.click();
    await expect(
      page.locator(".vn-devtools-source-line.is-selected").filter({ hasText: "time:fast" })
    ).toBeInViewport();
    await captureExactProblemsEvidence(page, workbench);
    await expect(workbench.locator(".vn-devtools-preview-button:enabled")).toHaveCount(0);
    await workbench.getByRole("button", { name: "Pin current" }).click();
    await expect.poll(async () => (await readGameSnapshot(page)).workbench.message)
      .toContain("not the installed runtime mapping");
    expect((await readGameSnapshot(page)).story.storySession).toBe(lastKnownGood.story.storySession);
  } finally {
    await writeFile(smokeSourceFile, originalSource, "utf8");
  }

  await expect(page.getByTestId("vn-dialog-text")).toContainText(smokePreviewText, { timeout: 15_000 });
  await expect.poll(async () => (await readGameSnapshot(page)).workbench.phase, { timeout: 15_000 }).toBe("ready");

  const persistedWidth = (await workbench.boundingBox())?.width ?? 0;
  await workbench.getByRole("tab", { name: /^State$/ }).click();
  await expect(page.getByTestId("vn-devtools-bottom-panel")).toHaveAttribute("data-active-panel", "state");
  await page.getByTestId("vn-devtools-panel-resizer").focus();
  await page.keyboard.press("End");
  await expect(page.getByTestId("vn-devtools-panel-resizer")).toHaveAttribute("aria-valuenow", "360");
  await workbench.getByRole("button", { name: "Collapse Nani Workbench" }).click();
  await expect(page.getByTestId("vn-devtools-collapsed-button")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("vn-devtools-collapsed-button")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("vn-devtools-collapsed-button").click();
  await expect(workbench).toBeVisible();
  await expect.poll(async () => Math.abs(((await workbench.boundingBox())?.width ?? 0) - persistedWidth))
    .toBeLessThanOrEqual(1);
  await expect(page.getByTestId("game-a-mode")).toHaveText("视觉小说", { timeout: 15_000 });
  await expect(page.getByTestId("vn-dialog-text")).toContainText(smokePreviewText);
  await expect(workbench).toContainText("Stable checkpoint installed");
  await expect(page.getByTestId("vn-devtools-bottom-panel")).toHaveAttribute("data-active-panel", "state");
  await expect(page.getByTestId("vn-devtools-panel-resizer")).toHaveAttribute("aria-valuenow", "360");
  await expect(
    page.locator('[data-testid^="vn-devtools-line-"]').filter({ hasText: "CHECKPOINT SMOKE 00" }).first()
      .getByLabel("Pinned preview target")
  ).toBeVisible();
}

async function captureExactProblemsEvidence(
  page: Page,
  workbench: ReturnType<Page["getByTestId"]>
) {
  const selectedLine = page.locator(".vn-devtools-source-line.is-selected");
  const diagnosticToken = selectedLine.locator('[data-diagnostic-severity="error"]');
  await expect(diagnosticToken).toHaveText("fast");

  await page.keyboard.press("Control+f");
  const sourceFind = page.getByTestId("vn-devtools-search");
  await expect(sourceFind).toBeFocused();
  await sourceFind.fill("fast");
  await expect(selectedLine.locator('mark[data-diagnostic-severity="error"]')).toHaveText("fast");

  await page.setViewportSize({ width: 1672, height: 941 });
  const resizer = page.getByTestId("vn-devtools-resizer");
  await resizer.focus();
  await page.keyboard.press("End");
  await expect.poll(async () => Math.round((await workbench.boundingBox())?.width ?? 0)).toBe(720);
  await page.screenshot({ path: "test-results/game-a-workbench-problems-720.png", fullPage: true });

  await page.keyboard.press("Home");
  await expect.poll(async () => Math.round((await workbench.boundingBox())?.width ?? 0)).toBe(320);
  await page.screenshot({ path: "test-results/game-a-workbench-problems-320.png", fullPage: true });

  const minWidthResizer = await resizer.boundingBox();
  if (!minWidthResizer) throw new Error("Workbench resizer is unavailable in Problems state.");
  await page.mouse.move(minWidthResizer.x + minWidthResizer.width / 2, minWidthResizer.y + 24);
  await page.mouse.down();
  await page.mouse.move(minWidthResizer.x + minWidthResizer.width / 2 - 100, minWidthResizer.y + 24);
  await page.mouse.up();
  await expect.poll(async () => Math.round((await workbench.boundingBox())?.width ?? 0)).toBe(420);
  await page.screenshot({ path: "test-results/game-a-workbench-problems-420.png", fullPage: true });

  await page.setViewportSize({ width: 820, height: 720 });
  await expect.poll(async () => page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>('[data-testid="vn-devtools-dock"]');
    return dock ? getComputedStyle(dock).position : "missing";
  })).toBe("fixed");
  await page.screenshot({ path: "test-results/game-a-workbench-problems-overlay.png", fullPage: true });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.keyboard.press("Escape");
  await expect(sourceFind).toHaveValue("");
}

async function exerciseWorkbenchDecisionFlow(
  page: Page,
  workbench: ReturnType<Page["getByTestId"]>,
  initialTarget: ReturnType<Page["locator"]>
) {
  const inputTarget = page.locator('[data-testid^="vn-devtools-line-"]')
    .filter({ hasText: "CHECKPOINT SMOKE INPUT" })
    .first();
  await inputTarget.hover();
  await inputTarget.locator(".vn-devtools-preview-button").click();

  const decision = page.getByTestId("vn-devtools-decision");
  await expect(page.getByTestId("vn-devtools-bottom-panel")).toHaveAttribute("data-active-panel", "branch");
  await expect(page.getByTestId("vn-devtools-primary-action")).toContainText("Resolve decision");
  await expect(decision).toContainText("Choose a branch");
  await decision.getByLabel("交互与存档").check();
  await page.screenshot({ path: "test-results/game-a-workbench-decision-controls.png", fullPage: true });
  await decision.getByRole("button", { name: "Continue preview" }).click();
  await expect(decision).toContainText("playerName");
  await decision.locator('input[name="value"]').fill("Workbench");
  await decision.getByRole("button", { name: "Continue preview" }).click();

  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT SMOKE INPUT");
  await expect(workbench).toContainText("Decision path materialized and installed");
  expect((await readGameSnapshot(page)).story.variables).toMatchObject({
    route: "smoke-interaction",
    playerName: "Workbench"
  });

  await initialTarget.hover();
  await initialTarget.locator(".vn-devtools-preview-button").click();
  await expect(page.getByTestId("vn-dialog-text")).toContainText(smokePreviewText);
  await expect(initialTarget.getByLabel("Pinned preview target")).toBeVisible();
}
