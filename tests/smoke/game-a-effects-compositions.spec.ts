import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  advanceUntilChoices,
  advanceUntilStoryText,
  capturePlayfield,
  measureFrameProfile,
  prepareEffectsPage,
  readEffectsSnapshot,
  readRendererProfile,
  selectDevelopmentScript
} from "./game-a-effects-helpers";

test.setTimeout(180_000);
const enforcePerformanceBudget = process.env.PIXI_EFFECT_PERF_ASSERT === "1";

test("Game A composes independent Pixi effects and removes each family in isolation", async ({ page }, testInfo) => {
  const consoleErrors: string[] = []; const pageErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await prepareEffectsPage(page);
  await selectDevelopmentScript(page, "pixi-effect-compositions.nani", "复合效果脚本包含高频闪烁");
  await advanceUntilChoices(page); await page.getByTestId("vn-choice-0").click();
  await advanceUntilStoryText(page, "CHECKPOINT COMPOSITION 01 DOMESTIC PRESSURE");

  await advanceUntilStoryText(page, "你能不能不要再问了。");
  let state = await readEffectsSnapshot(page);
  expect(Object.keys(state.pixi.snapshot.screenFilters).sort()).toEqual(["pulse", "vignette"]);
  expect(state.pixi.snapshot.weather).toEqual({});
  await capturePlayfield(page, "game-a-effects-composition-domestic-pressure.png");
  const domestic = await measureFrameProfile(page, 60, 15);

  await advanceUntilStoryText(page, "CHECKPOINT COMPOSITION 02 BROKEN TELEVISION", 20);
  await advanceUntilStoryText(page, "在身边的人变成都市怪谈里的电波头之前。");
  await expect.poll(async () => Object.keys((await readEffectsSnapshot(page)).pixi.snapshot.screenFilters))
    .toEqual(["staticFilter"]);
  state = await readEffectsSnapshot(page);
  expect(Object.keys(state.pixi.snapshot.screenFilters)).toEqual(["staticFilter"]);
  expect(Object.keys(state.pixi.snapshot.charactersById.alice?.filters ?? {})).toEqual(["signalMask"]);

  await advanceUntilStoryText(page, "CHECKPOINT COMPOSITION 03 DROWNING", 20);
  await advanceUntilStoryText(page, "我只是很想在雨声里寻找一场可以把自己淹没的好梦。");
  await expect.poll(async () => Object.keys((await readEffectsSnapshot(page)).pixi.snapshot.screenFilters))
    .toEqual(["waterVeil"]);
  state = await readEffectsSnapshot(page);
  expect(Object.keys(state.pixi.snapshot.screenFilters)).toEqual(["waterVeil"]);
  expect(Object.keys(state.pixi.snapshot.weather)).toEqual(["rain"]);
  expect(state.pixi.snapshot.charactersById.alice?.filters ?? {}).toEqual({});

  await advanceUntilStoryText(page, "CHECKPOINT COMPOSITION 04 STRESS AND ISOLATION", 20);
  await advanceUntilStoryText(page, "所有屏幕效果同时存在；下面逐项移除，其他效果必须保留。");
  await expect.poll(async () => Object.keys((await readEffectsSnapshot(page)).pixi.snapshot.screenFilters))
    .toEqual(["bokeh", "waterVeil", "pulse", "staticFilter", "glitch", "vignette"]);
  state = await readEffectsSnapshot(page);
  expect(Object.keys(state.pixi.snapshot.screenFilters)).toEqual([
    "bokeh", "waterVeil", "pulse", "staticFilter", "glitch", "vignette"
  ]);
  const stress = await measureFrameProfile(page, 60, 15);
  const renderer = await readRendererProfile(page);
  const performance = { renderer, profiles: { domestic, stress } };
  await writeFile("test-results/game-a-effects-performance.json", JSON.stringify(performance, null, 2));
  await testInfo.attach("pixi-effects-performance", { body: JSON.stringify(performance, null, 2), contentType: "application/json" });
  if (enforcePerformanceBudget) {
    expect(renderer.hardwareAccelerated).toBe(true);
    expect(domestic.medianMs).toBeLessThanOrEqual(22.2);
    expect(stress.medianMs).toBeLessThanOrEqual(33.3);
    expect(stress.over33_3Ratio).toBeLessThanOrEqual(0.1);
  }

  await advanceUntilStoryText(page, "CHECKPOINT COMPOSITION COMPLETE", 20);
  await expect.poll(async () => (await readEffectsSnapshot(page)).pixi.presentationTasks).toEqual([]);
  const cleaned = await readEffectsSnapshot(page);
  expect(cleaned.pixi.snapshot.screenFilters).toEqual({});
  expect(cleaned.pixi.snapshot.weather).toEqual({});
  expect(cleaned.pixi.snapshot.charactersById.alice?.filters ?? {}).toEqual({});
  expect(cleaned.pixi.hints).toEqual([]);
  expect(consoleErrors).toEqual([]); expect(pageErrors).toEqual([]);
});
