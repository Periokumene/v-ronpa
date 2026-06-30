import { expect, test } from "@playwright/test";

test("game-a boots the VN-first framework path", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.addInitScript(() => {
    localStorage.removeItem("v-ronpa:game-a:settings:v1");
    localStorage.removeItem("v-ronpa:game-a:saves:v1");
  });
  await page.goto("/");

  await expect(page.getByTestId("game-a-playfield")).toBeVisible();
  await expect(page.getByTestId("game-a-app-id")).toHaveText("game-a");
  await expect(page.getByTestId("title-surface")).toBeVisible();
  await page.screenshot({ path: "test-results/game-a-title.png", fullPage: true });

  await page.getByTestId("title-settings").click();
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  await page.getByTestId("settings-display-text-size").selectOption("large");
  await page.getByTestId("settings-overlay-close").click();

  await page.getByTestId("title-new-game").click();
  await expect(page.getByTestId("game-a-mode")).toHaveText("vn");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("Game A VN framework smoke");
  await expect(page.getByTestId("vn-command-bar")).toBeVisible();
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-background", "bg:game-a-room");
  await page.screenshot({ path: "test-results/game-a-vn-dialog.png", fullPage: true });

  await page.getByTestId("vn-command-auto").click();
  await expect(page.getByTestId("vn-command-auto")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("vn-command-auto").click();
  await page.getByTestId("vn-command-skip").click();
  await expect(page.getByTestId("vn-command-skip")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("vn-command-skip").click();

  await page.getByTestId("vn-advance-hit-plane").click();
  await expect(page.getByTestId("vn-dialog-text")).toContainText("第一层验证");
  await expect(page.getByTestId("vn-choice-overlay")).toBeVisible();
  await page.getByTestId("vn-choice-0").click();
  await expect(page.getByTestId("vn-dialog-text")).toContainText("记录了房间里的异常光线");

  await page.getByTestId("vn-command-save").click();
  await expect(page.getByTestId("save-load-mode")).toHaveText("save");
  await page.getByTestId("save-slot-1").click();
  await page.getByTestId("save-load-overlay-close").click();
  await page.getByTestId("vn-command-load").click();
  await expect(page.getByTestId("save-load-mode")).toHaveText("load");
  await page.getByTestId("save-slot-1").click();
  await page.getByTestId("load-confirm").click();
  await expect(page.getByTestId("save-load-overlay")).toBeHidden();
  await expect(page.getByTestId("vn-dialog-text")).toContainText("记录了房间里的异常光线");
  await page.screenshot({ path: "test-results/game-a-save-load.png", fullPage: true });

  expect(consoleErrors).toEqual([]);
});
