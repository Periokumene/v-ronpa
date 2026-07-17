import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);

test("game-a test character entry stays on title until planned textures are uploaded", async ({ page }) => {
  const delayedRequests: string[] = [];
  await page.route("**/game-a/characters/alice/assets/layers/**/*.png", async (route) => {
    delayedRequests.push(route.request().url());
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    await route.continue();
  });

  await page.goto("/?vnEntry=character", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("title-surface")).toBeVisible();
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-character-preparation", "preparing");
  await page.getByTestId("title-new-game").click();

  await expect(page.getByTestId("game-a-mode")).toHaveText("标题");
  await expect(page.getByTestId("title-new-game")).toBeDisabled();
  await expect(page.getByTestId("title-new-game")).toHaveText("角色资源准备中…");
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

  await page.goto("/?vnEntry=character&vnStart=Start");
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
  await expectAliceState(page, "EYE0,MOUTH0");

  const states = [
    {
      text: "CHECKPOINT CHARACTER 02",
      expression: "EYE1,MOUTH3,ArmL2"
    },
    {
      text: "CHECKPOINT CHARACTER 03",
      expression: "EYE4,MOUTH5,ArmL4,ArmR2,EFFECT0"
    },
    {
      text: "CHECKPOINT CHARACTER 04",
      expression: "EYE2,MOUTH2,ArmL0,ArmR0,EFFECT2"
    }
  ] as const;

  for (const state of states) {
    await advanceUntilText(page, state.text, 4);
    await expectAliceState(page, state.expression);
    if (state.expression === "EYE2,MOUTH2,ArmL0,ArmR0,EFFECT2") {
      await page.screenshot({ path: "test-results/game-a-alice-outline-multilayer.png", fullPage: true });
    }
  }

  await advanceUntilChoices(page, 4);
  await expect(page.getByTestId("vn-choice-0")).toHaveText("完成角色测试");
  await expect(page.locator("main.game-a-shell")).toHaveAttribute("data-game-a-asset-diagnostics-count", "0");
  expect(consoleErrors).toEqual([]);
});

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

const characterInteriorPoints = [
  [640, 200],
  [620, 250],
  [640, 280],
  [610, 300],
  [660, 300]
] as const;

type CharacterInteriorSample = readonly [red: number, green: number, blue: number, alpha: number];

async function captureCharacterInterior(page: Page, path: string): Promise<CharacterInteriorSample[]> {
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
  }, { base64: screenshot.toString("base64"), points: characterInteriorPoints });

  const [skin] = samples;
  expect(skin).toBeDefined();
  expect(skin?.[3]).toBe(255);
  expect(skin?.[0]).toBeGreaterThan(150);
  expect(skin?.[0]).toBeLessThan(245);
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
