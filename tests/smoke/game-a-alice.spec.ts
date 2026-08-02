import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const characterSourceFile = fileURLToPath(
  new URL("../../apps/game-a/src/nani-test/character-smoke.nani", import.meta.url)
);

test.setTimeout(120_000);

test("game-a test character entry stays on title until planned textures are uploaded", async ({ page }) => {
  const delayedRequests: string[] = [];
  await page.route("**/game-a/characters/alice/assets/layers/**/*.png", async (route) => {
    delayedRequests.push(route.request().url());
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    await route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("title-surface")).toBeVisible();
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-character-preparation", "preparing");
  await page.getByTestId("title-new-game").click();

  await expect(page.getByTestId("game-a-mode")).toHaveText("标题");
  await expect(page.getByTestId("title-new-game")).toBeDisabled();
  await expect(page.getByTestId("title-new-game")).toContainText("开始故事");
  await expect(page.getByTestId("title-new-game")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByTestId("title-new-game")).toHaveAttribute("aria-label", "开始故事（角色资源准备中）");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-character-preparation", "preparing");

  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-character-preparation", "ready", { timeout: 15_000 });
  await expect(page.getByTestId("game-a-mode")).toHaveText("视觉小说");
  expect(delayedRequests.length).toBeGreaterThan(0);
  await expect(page.locator("main.game-a-shell")).toHaveAttribute("data-game-a-asset-diagnostics-count", "0");
  await expect(page.locator("main.game-a-shell")).not.toContainText("presentation-wait-timeout");
});

test("game-a character smoke renders the imported Alice layered states", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByTestId("title-surface")).toBeVisible();
  await page.getByTestId("title-new-game").click();
  await expect(page.getByTestId("game-a-mode")).toHaveText("视觉小说");

  await advanceUntilText(page, "CHECKPOINT CHARACTER 00", 8);
  await expectAliceState(page, "default");
  const steadyInterior = await captureCharacterInterior(page, "test-results/game-a-alice-outline-default.png");

  await advanceVn(page);
  await page.waitForTimeout(16);
  expectCharacterInteriorToMatch(steadyInterior, await captureCharacterInterior(
    page,
    "test-results/game-a-alice-transition-first-frame.png"
  ));
  await page.waitForTimeout(80);
  expectCharacterInteriorToMatch(steadyInterior, await captureCharacterInterior(
    page,
    "test-results/game-a-alice-transition-mid-frame.png"
  ));
  await page.waitForTimeout(160);
  expectCharacterInteriorToMatch(steadyInterior, await captureCharacterInterior(
    page,
    "test-results/game-a-alice-transition-end-frame.png"
  ));
  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT CHARACTER 01");
  await expectAliceState(page, "body0,eye1,mouth1");

  const states = [
    {
      text: "CHECKPOINT CHARACTER 02",
      expression: "eye3,mouth3,armR3"
    },
    {
      text: "CHECKPOINT CHARACTER 03",
      expression: "eye4,mouth4,armR2,armL4"
    },
    {
      text: "CHECKPOINT CHARACTER 04",
      expression: "eye2,mouth2,armR0,armL0"
    }
  ] as const;

  for (const state of states) {
    await advanceUntilText(page, state.text, 4);
    await expectAliceState(page, state.expression);
    if (state.expression === "eye2,mouth2,armR0,armL0") {
      await page.screenshot({ path: "test-results/game-a-alice-outline-multilayer.png", fullPage: true });
    }
  }

  await advanceUntilChoices(page, 4);
  await expect(page.getByTestId("vn-choice-0")).toHaveText("完成角色测试");
  await expect(page.locator("main.game-a-shell")).toHaveAttribute("data-game-a-asset-diagnostics-count", "0");
  expect(consoleErrors).toEqual([]);
});

test("a Nani HMR candidate prepares a newly authored Alice expression before preview commit", async ({ page }) => {
  const originalSource = await readFile(characterSourceFile, "utf8");
  const expression = "eye5,mouth6,armR5,armL5";
  const hmrText = "CHECKPOINT CHARACTER HMR - candidate expression prepared.";
  const updatedSource = originalSource.replace(
    '@choice "完成角色测试" goto:#Complete',
    [
      `@char alice.${expression} pos:50 wait!`,
      `Narrator: ${hmrText}|#character_hmr|`,
      '@choice "完成角色测试" goto:#Complete'
    ].join("\n")
  );
  expect(updatedSource).not.toBe(originalSource);

  const candidateLayerRequests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/\/alice\/assets\/layers\/root\/(?:eye\/5|mouth\/6|armR\/5|armL\/5)\.png$/u.test(pathname)) {
      candidateLayerRequests.push(pathname);
    }
  });

  try {
    await page.goto("/");
    await page.getByTestId("title-new-game").click();
    await expect(page.getByTestId("game-a-mode")).toHaveText("视觉小说");
    await advanceUntilText(page, "CHECKPOINT CHARACTER 00", 8);

    const initialTarget = page.locator('[data-testid^="vn-devtools-line-"]')
      .filter({ hasText: "CHECKPOINT CHARACTER 00" })
      .first();
    await initialTarget.hover();
    await initialTarget.locator(".vn-devtools-preview-button").click();
    await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT CHARACTER 00");
    const initialRevision = await readWorkbenchRevision(page);

    await writeFile(characterSourceFile, updatedSource, "utf8");
    await expect.poll(() => readWorkbenchRevision(page), { timeout: 15_000 }).not.toBe(initialRevision);
    await expect.poll(() => new Set(candidateLayerRequests).size, { timeout: 15_000 }).toBe(4);
    await expect(page.getByTestId("pixi-layer")).toHaveAttribute(
      "data-pixi-character-preparation",
      "ready",
      { timeout: 15_000 }
    );

    const hmrTarget = page.locator('[data-testid^="vn-devtools-line-"]')
      .filter({ hasText: hmrText })
      .first();
    await hmrTarget.hover();
    await hmrTarget.locator(".vn-devtools-preview-button").click();
    await expect(page.getByTestId("vn-dialog-text")).toContainText(hmrText);
    await expectAliceState(page, expression);
    await expect(page.locator("main.game-a-shell")).toHaveAttribute("data-game-a-asset-diagnostics-count", "0");
  } finally {
    await writeFile(characterSourceFile, originalSource, "utf8");
  }
});

async function readWorkbenchRevision(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const render = (window as Window & { render_game_to_text?: () => string }).render_game_to_text;
    if (!render) return null;
    return (JSON.parse(render()) as { workbench: { revision: string | null } }).workbench.revision;
  });
}

async function expectAliceState(page: Page, expression: string) {
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute(
    "data-pixi-characters",
    `alice/${expression}@0.50,0.00`
  );
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-character-outline", "enabled");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-character-preparation", "ready");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-active-tasks", "empty");
  await waitForAnimationFrames(page, 2);
}

async function waitForAnimationFrames(page: Page, count: number) {
  await page.evaluate(async (frameCount) => {
    for (let frame = 0; frame < frameCount; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }, count);
}

async function advanceUntilText(page: Page, text: string, maxSteps: number) {
  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    const currentText = (await page.getByTestId("vn-dialog-text").textContent({ timeout: 250 }).catch(() => null)) ?? "";
    if (currentText.includes(text)) return;
    await advanceVn(page);
    await page.waitForTimeout(160);
  }
  await expect(page.getByTestId("vn-dialog-text")).toContainText(text);
}

async function advanceUntilChoices(page: Page, maxSteps: number) {
  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    if ((await page.getByTestId("vn-choice-overlay").count()) > 0) return;
    await advanceVn(page);
    await page.waitForTimeout(160);
  }
  await expect(page.getByTestId("vn-choice-overlay")).toBeVisible();
}

async function advanceVn(page: Page) {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.click(viewport.width / 2, viewport.height / 2);
}

const characterInteriorOffsets = [
  [0, 65],
  [-30, 137],
  [0, 162],
  [-40, 232],
  [20, 282]
] as const;

type CharacterInteriorSample = readonly [red: number, green: number, blue: number, alpha: number];

async function captureCharacterInterior(page: Page, path: string): Promise<CharacterInteriorSample[]> {
  const playfield = await page.getByTestId("game-a-playfield").boundingBox();
  expect(playfield).not.toBeNull();
  const points = characterInteriorOffsets.map(([offsetX, offsetY]) => [
    Math.round((playfield?.x ?? 0) + (playfield?.width ?? 0) / 2 + offsetX),
    Math.round((playfield?.y ?? 0) + offsetY)
  ] as const);
  const screenshot = await page.screenshot({ path });
  const samples = await page.evaluate(async ({ base64, points }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D screenshot sampling context is unavailable");
    context.drawImage(image, 0, 0);
    return points.map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
  }, { base64: screenshot.toString("base64"), points });

  const [skin] = samples;
  expect(skin).toBeDefined();
  expect(skin?.[3]).toBe(255);
  expect(skin?.[0]).toBeGreaterThan(200);
  expect(skin?.[0]).toBeLessThan(252);
  expect((skin?.[0] ?? 0) - (skin?.[1] ?? 0)).toBeGreaterThan(5);
  expect((skin?.[1] ?? 0) - (skin?.[2] ?? 0)).toBeGreaterThan(5);
  return samples as CharacterInteriorSample[];
}

function expectCharacterInteriorToMatch(
  steady: readonly CharacterInteriorSample[],
  transition: readonly CharacterInteriorSample[]
) {
  expect(transition).toHaveLength(steady.length);
  for (let sampleIndex = 0; sampleIndex < steady.length; sampleIndex += 1) {
    const expected = steady[sampleIndex];
    const actual = transition[sampleIndex];
    expect(actual).toBeDefined();
    for (let channel = 0; channel < 4; channel += 1) {
      expect(Math.abs((actual?.[channel] ?? 0) - (expected?.[channel] ?? 0))).toBeLessThanOrEqual(8);
    }
  }
}
