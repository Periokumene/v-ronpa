import { expect, test } from "@playwright/test";
import {
  advanceUntilChoices,
  advanceUntilStoryText,
  capturePlayfield,
  frameFingerprint,
  prepareEffectsPage,
  readEffectsSnapshot,
  selectDevelopmentScript,
  triggerAndObserveTask,
  waitForStoryText
} from "./game-a-effects-helpers";

test.setTimeout(180_000);

test("Game A demonstrates every individual Pixi effect without persistent overlap", async ({ page }) => {
  const consoleErrors: string[] = []; const pageErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await prepareEffectsPage(page);
  await selectDevelopmentScript(page, "pixi-effect-lab.nani", "本脚本包含高频闪烁");
  await advanceUntilChoices(page); await page.getByTestId("vn-choice-0").click();
  await advanceUntilStoryText(page, "CHECKPOINT LAB 01 IMPACT LOW");

  const transientCases = [
    { checkpoint: "CHECKPOINT LAB 03 IMPACT HIGH", next: "CHECKPOINT LAB 04 AFTERIMAGE LOW", kind: "impact", target: "screen", shot: "impact" },
    { checkpoint: "CHECKPOINT LAB 06 AFTERIMAGE HIGH", next: "CHECKPOINT LAB 07 SHUTTER EYELID", kind: "afterimage", target: "alice", shot: "afterimage" },
    { checkpoint: "CHECKPOINT LAB 09 SHUTTER SLICE", next: "CHECKPOINT LAB 10 FLICKER LOW", kind: "shutter", target: "screen", shot: "shutter" },
    { checkpoint: "CHECKPOINT LAB 12 FLICKER HIGH", next: "CHECKPOINT LAB 13 VIGNETTE", kind: "flicker", target: "screen", shot: "flicker" }
  ] as const;
  for (const effect of transientCases) {
    await advanceUntilStoryText(page, effect.checkpoint);
    const before = await frameFingerprint(page);
    const active = await triggerAndObserveTask(page, effect.checkpoint, effect.kind, effect.target);
    expect(active.pixi.hints).toEqual([expect.objectContaining({ type: effect.kind })]);
    expect(active.pixi.snapshot.screenFilters).toEqual({});
    expect(active.pixi.snapshot.weather).toEqual({});
    expect(active.pixi.snapshot.charactersById.alice?.filters ?? {}).toEqual({});
    await page.waitForTimeout(effect.kind === "flicker" ? 28 : 90);
    expect(await frameFingerprint(page)).not.toBe(before);
    await capturePlayfield(page, `game-a-effects-individual-${effect.shot}.png`);
    await advanceUntilStoryText(page, effect.next, 20);
  }

  const persistentCases = [
    { checkpoint: "CHECKPOINT LAB 13 VIGNETTE", active: "VIGNETTE ACTIVE", next: "CHECKPOINT LAB 14 STATIC FILTER", task: "screen-filter-transition", target: "vignette", key: "vignette", family: "screen" },
    { checkpoint: "CHECKPOINT LAB 14 STATIC FILTER", active: "STATIC FILTER ACTIVE", next: "CHECKPOINT LAB 15 WATER VEIL", task: "screen-filter-transition", target: "staticFilter", key: "staticFilter", family: "screen" },
    { checkpoint: "CHECKPOINT LAB 15 WATER VEIL", active: "WATER VEIL ACTIVE", next: "CHECKPOINT LAB 16 SIGNAL MASK", task: "screen-filter-transition", target: "waterVeil", key: "waterVeil", family: "screen" },
    { checkpoint: "CHECKPOINT LAB 16 SIGNAL MASK", active: "SIGNAL MASK ACTIVE", next: "CHECKPOINT LAB 17 PULSE", task: "actor-transition", target: "alice", key: "signalMask", family: "actor" },
    { checkpoint: "CHECKPOINT LAB 17 PULSE", active: "PULSE ACTIVE", next: "CHECKPOINT LAB INDIVIDUAL COMPLETE", task: "screen-filter-transition", target: "pulse", key: "pulse", family: "screen" }
  ] as const;
  for (const effect of persistentCases) {
    await waitForStoryText(page, effect.checkpoint);
    const before = await frameFingerprint(page);
    await triggerAndObserveTask(page, effect.checkpoint, effect.task, effect.target);
    await waitForStoryText(page, effect.active);
    const active = await readEffectsSnapshot(page);
    expect(Object.keys(active.pixi.snapshot.screenFilters)).toEqual(effect.family === "screen" ? [effect.key] : []);
    const actorFilters = active.pixi.snapshot.charactersById.alice?.filters ?? {};
    expect(Object.keys(actorFilters)).toEqual(effect.family === "actor" ? [effect.key] : []);
    await page.waitForTimeout(45);
    expect(await frameFingerprint(page)).not.toBe(before);
    await capturePlayfield(page, `game-a-effects-individual-${effect.key}.png`);
    await advanceUntilStoryText(page, effect.next, 20);
  }

  await expect.poll(async () => (await readEffectsSnapshot(page)).pixi.presentationTasks).toEqual([]);
  const cleaned = await readEffectsSnapshot(page);
  expect(cleaned.pixi.snapshot.screenFilters).toEqual({});
  expect(cleaned.pixi.snapshot.weather).toEqual({});
  expect(cleaned.pixi.snapshot.charactersById.alice?.filters ?? {}).toEqual({});
  expect(cleaned.pixi.hints).toEqual([]);
  expect(consoleErrors).toEqual([]); expect(pageErrors).toEqual([]);
});
