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
    indexedDB.deleteDatabase("v-ronpa-game-a-saves-v9");
  });
  await page.goto("/");

  await expect(page.getByTestId("game-a-playfield")).toBeVisible();
  await expect(page.getByTestId("game-a-app-id")).toHaveText("game-a");
  await expect(page.getByTestId("title-surface")).toHaveClass(/game-a-title-surface/);
  const workbench = page.getByTestId("vn-devtools-dock");
  await expect(workbench).toBeVisible();
  await expect(workbench).toContainText("Nani Workbench");
  await expect(workbench).toContainText("game-a/test/smoke.nani");
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
  await page.screenshot({ path: "test-results/game-a-workbench-expanded.png", fullPage: true });
  await workbench.getByRole("button", { name: "Collapse Nani Workbench" }).click();
  await expect(page.getByTestId("vn-devtools-collapsed-button")).toBeVisible();
  await expect.poll(async () => (await page.getByTestId("game-a-playfield").boundingBox())?.width ?? 0).toBeGreaterThan(initialPlayfieldWidth);
  await page.screenshot({ path: "test-results/game-a-workbench-collapsed.png", fullPage: true });
  await page.getByTestId("vn-devtools-collapsed-button").click();
  await expect(workbench).toBeVisible();
  const widthBeforeKeyboardResize = (await workbench.boundingBox())?.width ?? 0;
  await page.getByTestId("vn-devtools-resizer").focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await workbench.boundingBox())?.width ?? 0).toBeGreaterThan(widthBeforeKeyboardResize);
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
  await firstStableLine.hover();
  await firstStableLine.locator(".vn-devtools-preview-button").click();
  await expect(workbench).toContainText("Stable checkpoint installed");
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

  await exerciseNaniSourceSaveFlow(page, workbench);
  await exerciseWorkbenchDecisionFlow(page, workbench, firstStableLine);

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
  await page.screenshot({ path: "test-results/game-a-save.png", fullPage: true });
  await clickByTestId(page, "pause-surface-close");
  await clickByTestId(page, "vn-command-load");
  await expect(page.getByTestId("pause-surface")).toHaveAttribute("data-active-tab", "load");
  await expect(page.getByTestId("save-slot-1")).toBeEnabled();
  await clickByTestId(page, "save-slot-1");
  await expect(page.getByTestId("load-confirmation")).toBeVisible();
  await page.screenshot({ path: "test-results/game-a-save-load.png", fullPage: true });
  const workbenchSearch = page.getByTestId("vn-devtools-search");
  await workbenchSearch.fill("CHECKPOINT");
  await workbenchSearch.focus();
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
  await page.getByTestId("runtime-input-field").fill("Codex");
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
  await expect(
    page.locator('[data-testid^="vn-devtools-line-"]').filter({ hasText: "CHECKPOINT SMOKE 00" }).first()
      .getByLabel("Pinned preview target")
  ).toBeVisible();
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
  await expect(decision).toContainText("Choose a branch");
  await decision.getByLabel("交互与存档").check();
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
