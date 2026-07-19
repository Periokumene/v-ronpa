import { expect, test } from "@playwright/test";

test("harness root boots the integrated showcase game", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByTestId("playfield")).toBeVisible();
  await expect(page.getByTestId("harness-scenario-id")).toHaveText("harness-showcase");
  await expect(page.getByTestId("title-surface")).toBeVisible();
  await expect(page.getByTestId("title-new-game")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-v-ronpa-web-game-document", "active");

  const browserPolicy = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    const staticTarget = document.querySelector<HTMLElement>('[data-testid="harness-scenario-id"]');
    if (!staticTarget) throw new Error("Harness browser policy target is unavailable.");
    const contextMenu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    const selectStart = new Event("selectstart", { bubbles: true, cancelable: true });
    staticTarget.dispatchEvent(contextMenu);
    staticTarget.dispatchEvent(selectStart);
    return {
      bodyOverscroll: bodyStyle.overscrollBehavior,
      colorScheme: rootStyle.colorScheme,
      contextMenuPrevented: contextMenu.defaultPrevented,
      forcedColorAdjust: rootStyle.forcedColorAdjust,
      rootOverscroll: rootStyle.overscrollBehavior,
      selectStartPrevented: selectStart.defaultPrevented,
      userSelect: rootStyle.userSelect
    };
  });
  expect(browserPolicy).toMatchObject({
    bodyOverscroll: "none",
    colorScheme: "dark only",
    contextMenuPrevented: true,
    forcedColorAdjust: "none",
    rootOverscroll: "none",
    selectStartPrevented: true,
    userSelect: "none"
  });

  const dropPolicy = await page.getByTestId("title-surface").evaluate((target) => {
    const hrefBefore = location.href;
    const fileTransfer = new DataTransfer();
    fileTransfer.items.add(new File(["smoke"], "smoke.txt", { type: "text/plain" }));
    const fileDrop = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: fileTransfer });
    target.dispatchEvent(fileDrop);

    const urlTransfer = new DataTransfer();
    urlTransfer.setData("text/uri-list", "https://example.com/");
    const urlDrop = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: urlTransfer });
    target.dispatchEvent(urlDrop);
    return {
      filePrevented: fileDrop.defaultPrevented,
      hrefAfter: location.href,
      hrefBefore,
      urlPrevented: urlDrop.defaultPrevented
    };
  });
  expect(dropPolicy).toMatchObject({ filePrevented: true, urlPrevented: true });
  expect(dropPolicy.hrefAfter).toBe(dropPolicy.hrefBefore);

  await page.getByTestId("title-settings").click();
  await expect(page.getByTestId("settings-overlay").locator('select, input[type="checkbox"], input[type="range"]')).toHaveCount(0);
  await expect(page.getByTestId("settings-groups")).toHaveCSS("overscroll-behavior", "contain");
  await page.screenshot({ path: "test-results/harness-browser-settings.png", fullPage: true });
  await page.getByTestId("settings-overlay-close").click();

  await page.screenshot({ path: "test-results/harness-root.png", fullPage: true });
  expect(consoleErrors).toEqual([]);
});

test("harness keeps authored visuals under system color and motion preferences", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByTestId("title-surface")).toBeVisible();
  await expect(page.locator("html")).toHaveCSS("forced-color-adjust", "none");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark only");
  await page.screenshot({ path: "test-results/harness-browser-forced-colors-reduced-motion.png", fullPage: true });
});
