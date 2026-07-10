import { expect, test, type Page } from "@playwright/test";

test.setTimeout(420_000);

test("harness showcase connects Navi exploration, gameplay state, VN dialog, and branch outcomes", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isExpectedPointerLockError(message.text())) {
      consoleErrors.push(`${message.text()} @ ${message.location().url || "unknown"}`);
    }
  });

  await page.addInitScript(() => {
    localStorage.removeItem("v-ronpa:settings:v1");
    indexedDB.deleteDatabase("v-ronpa-harness-showcase-v8");
  });
  await page.goto("/");

  await expect(page.getByTestId("playfield")).toBeVisible();
  await expect(page.getByTestId("harness-scenario-id")).toHaveText("harness-showcase");
  await expect(page.getByTestId("harness-showcase-shell")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(2);
  await expect(page.getByTestId("harness-showcase-debug-sidebar")).toBeVisible();
  await expect(page.getByTestId("harness-showcase-debug-panel-runtime")).toBeVisible();
  await expect(page.getByTestId("playfield").getByTestId("harness-commands")).toHaveCount(0);
  await expect(page.getByTestId("harness-showcase-debug-panel-runtime").getByTestId("harness-showcase-runtime-controls")).toBeVisible();
  await expectNoRuntimeAssetDiagnostics(page);
  await expect(page.getByTestId("title-surface")).toBeVisible();
  await expect(page.getByTestId("title-new-game")).toBeEnabled();
  await expect(page.getByTestId("title-load")).toBeEnabled();
  await expect(page.getByTestId("title-settings")).toBeEnabled();
  await page.screenshot({ path: "test-results/harness-showcase-title.png", fullPage: true });
  await page.getByTestId("title-settings").click();
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  await expect(page.getByTestId("settings-group-system")).toBeVisible();
  await expect(page.getByTestId("settings-group-display")).toBeVisible();
  await expect(page.getByTestId("settings-group-sound")).toBeVisible();
  await expect(page.getByTestId("settings-overlay").getByTestId("vn-dialog-text")).toHaveCount(0);
  await page.getByTestId("settings-display-text-size").selectOption("large");
  await page.getByTestId("settings-display-textbox-opacity").fill("50");
  await page.getByTestId("settings-overlay-close").click();
  await expect(page.getByTestId("settings-overlay")).toBeHidden();
  await page.getByTestId("title-settings").click();
  await expect(page.getByTestId("settings-display-text-size")).toHaveValue("large");
  await expect(page.getByTestId("settings-display-textbox-opacity")).toHaveValue("50");
  await expect(page.getByTestId("settings-display-textbox-opacity-value")).toHaveText("50%");
  await page.getByTestId("settings-overlay-close").click();
  await expect(page.getByTestId("settings-overlay")).toBeHidden();
  await page.getByTestId("title-load").click();
  await expect(page.getByTestId("save-load-overlay")).toBeVisible();
  await expect(page.getByTestId("save-load-mode")).toHaveText("load");
  await page.getByTestId("save-load-overlay-close").click();
  await expect(page.getByTestId("save-load-overlay")).toBeHidden();
  await page.getByTestId("title-new-game").click();
  await expect(page.getByTestId("title-surface")).toBeHidden();
  await expect(page.getByTestId("harness-status")).toHaveText("Navi 探索");
  await expect(page.getByTestId("harness-showcase-move-spawn")).toHaveText("移至：出生点");
  await expect(page.getByTestId("harness-showcase-confirm")).toHaveText("确认交互");
  await expect(page.getByTestId("harness-showcase-debug-tab-runtime")).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("harness-showcase-debug-tab-inspector").click();
  await expect(page.getByTestId("inspector-lite")).toBeVisible();
  await expect(page.getByTestId("harness-commands")).toHaveCount(0);
  await expect(page.getByTestId("harness-showcase-debug-tab-inspector")).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("harness-showcase-debug-tab-runtime").click();
  await expect(page.getByTestId("harness-showcase-debug-tab-runtime")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("harness-showcase-debug-panel-runtime").getByTestId("harness-showcase-runtime-controls")).toBeVisible();
  await expect(page.getByTestId("harness-showcase-map")).toHaveText("map:academy-hall");
  await expect(page.getByTestId("harness-showcase-pointer-lock-status")).toHaveText("idle");
  await expectNoRuntimeAssetDiagnostics(page);
  await expectNoDocumentScroll(page);
  await page.screenshot({ path: "test-results/harness-showcase-navi.png", fullPage: true });

  await requestPointerLockAndRelease(page, "harness-showcase-pointer-lock", "harness-showcase-pointer-lock-status");
  await expect(page.getByTestId("harness-showcase-active-interactable")).toHaveText("none");
  await blurActiveElement(page);
  await expectKeyNeverFocuses(page, "KeyW", "harness-showcase-active-interactable");
  await page.keyboard.press("KeyE");
  await expect(page.getByTestId("harness-showcase-map")).toHaveText("map:academy-hall");
  await expect(page.getByTestId("harness-showcase-last-outcome")).toHaveText("reset");

  await walkForwardUntilActive(page, "interactable:classroom-door");
  await expect(page.getByTestId("harness-showcase-can-confirm")).toHaveText("true");
  await page.keyboard.press("KeyE");
  await expect(page.getByTestId("harness-showcase-map")).toHaveText("map:academy-hall");
  await expect(page.getByTestId("harness-showcase-last-outcome")).toHaveText("reset");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("harness-showcase-map")).toHaveText("map:classroom");
  await expect(page.getByTestId("harness-showcase-last-outcome")).toHaveText("change-map:map:classroom");
  await page.getByTestId("harness-showcase-move-hall-door").click();
  await page.getByTestId("harness-showcase-confirm").click();
  await expect(page.getByTestId("harness-showcase-map")).toHaveText("map:academy-hall");

  await page.getByTestId("harness-showcase-move-empty").click();
  await expect(page.getByTestId("harness-showcase-active-interactable")).toHaveText("none");
  await expect(page.getByTestId("harness-showcase-can-confirm")).toHaveText("false");
  await expect(page.getByTestId("harness-showcase-blocked-reason")).toHaveText("no-target");
  await page.getByTestId("harness-showcase-confirm").click();
  await expect(page.getByTestId("harness-showcase-last-outcome")).toHaveText("none");

  await page.getByTestId("harness-showcase-move-notebook").click();
  await expect(page.getByTestId("harness-showcase-active-interactable")).toHaveText("interactable:notebook");
  await expect(page.getByTestId("harness-showcase-can-confirm")).toHaveText("true");
  await page.getByTestId("harness-showcase-confirm").click();
  await expect(page.getByTestId("harness-showcase-inventory")).toContainText("tool:notebook:1");

  await page.getByTestId("harness-showcase-move-keycard").click();
  await expect(page.getByTestId("harness-showcase-active-interactable")).toHaveText("interactable:keycard");
  await page.getByTestId("harness-showcase-confirm").click();
  await expect(page.getByTestId("harness-showcase-evidence")).toContainText("evidence:keycard");

  await page.getByTestId("harness-showcase-move-trial-stand").click();
  await expect(page.getByTestId("harness-showcase-active-interactable")).toHaveText("interactable:trial-stand");
  await page.getByTestId("harness-showcase-confirm").click();
  await expect(page.getByTestId("harness-status")).toHaveText("Trial 模式");
  await expect(page.getByTestId("harness-showcase-mode")).toHaveText("trial");
  await expect(page.getByTestId("harness-showcase-last-outcome")).toHaveText("start-trial:trial:door-lock");
  await expect(page.getByTestId("harness-showcase-trial-segment")).toHaveText("debate:door-lock");
  await expect(page.getByTestId("harness-showcase-trial-presentation")).toHaveText("debate3d");
  await expect(page.getByTestId("harness-showcase-trial-input-lock")).toHaveText("trial-targeting");
  await expect(page.getByTestId("trial-r3f-canvas")).toBeVisible();
  await expect(page.getByTestId("vn-command-bar")).toBeHidden();
  await page.getByTestId("harness-showcase-trial-correct").click();
  await expect(page.getByTestId("harness-showcase-trial-keywords")).toContainText("kw:door-lock:broken");
  await expect(page.getByTestId("harness-showcase-trial-segment")).toHaveText("discussion:trial-close");
  await expect(page.getByTestId("harness-showcase-trial-outcome")).toHaveText("correct:discussion:trial-close");
  await page.screenshot({ path: "test-results/harness-showcase-trial-entry.png", fullPage: true });
  await page.getByTestId("harness-showcase-trial-exit").click();
  await expect(page.getByTestId("harness-status")).toHaveText("Navi 探索");
  await expect(page.getByTestId("harness-showcase-mode")).toHaveText("navi");
  await expect(page.getByTestId("harness-showcase-trial-segment")).toHaveText("none");

  await page.getByTestId("harness-showcase-move-door").click();
  await expect(page.getByTestId("harness-showcase-active-interactable")).toHaveText("interactable:classroom-door");
  await page.getByTestId("harness-showcase-confirm").click();
  await expect(page.getByTestId("harness-showcase-map")).toHaveText("map:classroom");
  await expect(page.getByTestId("harness-showcase-last-outcome")).toHaveText("change-map:map:classroom");
  await page.screenshot({ path: "test-results/harness-showcase-map-change.png", fullPage: true });

  await page.getByTestId("harness-showcase-move-hall-door").click();
  await page.getByTestId("harness-showcase-confirm").click();
  await expect(page.getByTestId("harness-showcase-map")).toHaveText("map:academy-hall");

  await page.getByTestId("harness-showcase-move-witness").click();
  await expect(page.getByTestId("harness-showcase-active-interactable")).toHaveText("interactable:witness");
  await page.getByTestId("harness-showcase-confirm").click();
  await expect(page.getByTestId("harness-showcase-substate")).toHaveText("vn2d-overlay");
  await expect(page.getByTestId("vn-dialog-surface")).toBeVisible();
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-text-size", "large");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-textbox-opacity", "0.5");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-ui-phase", "shown");
  await expect(page.getByTestId("pixi-layer")).toBeVisible();
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("aria-hidden", "false");
  await expect(page.getByTestId("vn-dialog-speaker")).toHaveText("旁白");
  await expect(page.getByTestId("vn-dialog-state")).toHaveText("阅读中");
  await expect(page.getByTestId("vn-dialog-advance")).toHaveCount(0);
  await expect(page.getByTestId("vn-dialog-cancel")).toHaveCount(0);
  await advanceUntilText(page, "请选择测试路径");
  await advanceUntilChoices(page);
  await expect(page.getByTestId("vn-dialog-state")).toHaveText("等待选择");
  await expect(page.getByTestId("harness-showcase-pixi-background")).toHaveText("bg:harness");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-inner-background", "bg:inner-academy-hall");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText("Ema/default@0.50,0.00");
  await expect(page.getByTestId("harness-showcase-pixi-tasks")).toBeVisible();
  await expect(page.getByTestId("vn-command-bar")).toBeVisible();
  await expect(page.getByTestId("vn-command-bar")).toHaveAttribute("data-ui-phase", "shown");
  await expect(page.getByTestId("vn-command-backlog")).toBeEnabled();
  await expect(page.getByTestId("vn-command-save")).toBeEnabled();
  await expect(page.getByTestId("vn-command-quick-save")).toBeEnabled();
  await expect(page.getByTestId("vn-command-load")).toBeEnabled();
  await expect(page.getByTestId("vn-command-quick-load")).toBeDisabled();
  await expect(page.getByTestId("vn-command-settings")).toBeEnabled();
  const dialogTextBeforeCommandOverlay = await currentDialogText(page);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-menu-overlay")).toBeVisible();
  await page.getByTestId("pause-menu-overlay-close").click();
  await expect(page.getByTestId("pause-menu-overlay")).toBeHidden();
  await expect(page.getByTestId("vn-dialog-text")).toHaveText(dialogTextBeforeCommandOverlay);
  await page.getByTestId("vn-command-settings").click();
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  await expect(page.getByTestId("vn-dialog-text")).toHaveText(dialogTextBeforeCommandOverlay);
  await page.getByTestId("settings-display-text-size").selectOption("small");
  await page.getByTestId("settings-display-textbox-opacity").fill("40");
  await expect(page.getByTestId("settings-display-textbox-opacity-value")).toHaveText("40%");
  await expect(page.getByTestId("settings-overlay").getByTestId("vn-dialog-text")).toHaveCount(0);
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-text-size", "small");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-textbox-opacity", "0.4");
  await page.getByTestId("settings-overlay-close").click();
  await expect(page.getByTestId("settings-overlay")).toBeHidden();
  await page.screenshot({ path: "test-results/harness-showcase-vn-toolbar.png", fullPage: true });
  await page.getByTestId("vn-command-backlog").click();
  await expect(page.getByTestId("backlog-overlay")).toBeVisible();
  await expect(page.getByTestId("backlog-entry-0")).toContainText("视觉小说联调剧本");
  await page.screenshot({ path: "test-results/harness-showcase-backlog.png", fullPage: true });
  await page.getByTestId("backlog-overlay-close").click();
  await expect(page.getByTestId("backlog-overlay")).toBeHidden();
  const savedDialogText = (await page.getByTestId("vn-dialog-text").textContent()) ?? "";
  expect(savedDialogText.length).toBeGreaterThan(0);
  const savedDialogExcerpt = savedDialogText.slice(0, 12);
  await page.getByTestId("vn-command-quick-save").click();
  await expect(page.getByTestId("vn-command-quick-load")).toBeEnabled();
  await page.getByTestId("vn-command-quick-load").click();
  await expect(page.getByTestId("load-confirmation")).toHaveCount(0);
  await expect(page.getByTestId("vn-dialog-text")).toContainText(savedDialogExcerpt);
  await page.getByTestId("vn-command-save").click();
  await expect(page.getByTestId("save-load-overlay")).toBeVisible();
  await expect(page.getByTestId("save-load-mode")).toHaveText("save");
  await page.getByTestId("save-slot-1").click();
  await expect(page.getByTestId("save-slot-1")).toContainText(savedDialogExcerpt);
  await expect(page.getByTestId("save-slot-1-thumbnail")).toHaveAttribute("src", /^blob:/);
  await page.screenshot({ path: "test-results/harness-showcase-save-load.png", fullPage: true });
  await page.getByTestId("save-load-overlay-close").click();
  await expect(page.getByTestId("save-load-overlay")).toBeHidden();
  await page.getByTestId("vn-command-load").click();
  await expect(page.getByTestId("save-load-overlay")).toBeVisible();
  await expect(page.getByTestId("save-load-mode")).toHaveText("load");
  await page.getByTestId("save-slot-1").click();
  await expect(page.getByTestId("load-confirmation")).toBeVisible();
  await page.getByTestId("load-confirm").click();
  await expect(page.getByTestId("save-load-overlay")).toBeHidden();
  await expect(page.getByTestId("vn-dialog-surface")).toBeVisible();
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-text-size", "small");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-textbox-opacity", "0.4");
  await blurActiveElement(page);
  await page.keyboard.press("Space");
  await movementPulse(page, "ArrowUp");
  await expect(page.getByTestId("harness-showcase-substate")).toHaveText("vn2d-overlay");
  await expect(page.getByTestId("vn-dialog-text")).toContainText(savedDialogExcerpt);
  await expect(page.getByTestId("harness-showcase-pixi-background")).toHaveText("bg:harness");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-inner-background", "bg:inner-academy-hall");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText("Ema/default@0.50,0.00");
  await expect(page.getByTestId("harness-showcase-pixi-tasks")).toHaveText("empty");
  await expectNoDocumentScroll(page);
  await page.screenshot({ path: "test-results/harness-showcase-vn-choice.png", fullPage: true });

  await expect(page.getByTestId("vn-choice-overlay")).toBeVisible();
  await expect(page.getByTestId("vn-dialog-surface").getByTestId("vn-choice-overlay")).toHaveCount(0);
  await expect(page.getByTestId("vn-dialog-state")).toHaveText("等待选择");
  await expect(page.getByTestId("vn-choice-0")).toHaveText("分支1：主交互流程验证入口");
  await expect(page.getByTestId("vn-choice-1")).toHaveText("分支2：完整 Pixi 命令视觉验收");
  await expect(page.getByTestId("vn-advance-hit-plane")).toHaveCount(0);
  await page.getByTestId("vn-choice-0").click();
  await expect(page.getByTestId("harness-showcase-route")).toHaveText("return");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveCount(0);
  await expect(page.getByTestId("vn-command-bar")).toBeHidden();
  await expect(page.getByTestId("harness-showcase-debug-sidebar")).toBeVisible();
  await expect(page.getByTestId("harness-showcase-debug-panel-runtime")).toBeVisible();
  await expect(page.getByTestId("playfield").getByTestId("harness-status")).toBeVisible();
  await advanceMainInteractionShowcase(page);
  await expect(page.getByTestId("harness-showcase-substate")).toHaveText("walk");
  await expectNoRuntimeAssetDiagnostics(page);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-menu-overlay")).toBeVisible();
  await expect(page.getByTestId("pause-save")).toBeEnabled();
  await expect(page.getByTestId("pause-load")).toBeEnabled();
  await expect(page.getByTestId("pause-settings")).toBeEnabled();
  await page.screenshot({ path: "test-results/harness-showcase-pause-menu.png", fullPage: true });
  await page.getByTestId("pause-menu-overlay-close").click();
  await expect(page.getByTestId("pause-menu-overlay")).toBeHidden();

  await page.getByTestId("harness-showcase-reset").click();
  await page.getByTestId("harness-showcase-move-witness").click();
  await page.getByTestId("harness-showcase-confirm").click();
  await advanceUntilChoices(page);
  await page.getByTestId("vn-choice-1").click();
  await expect(page.getByTestId("harness-showcase-route")).toHaveText("classroom");
  await expect(page.getByTestId("harness-showcase-evidence")).toContainText("evidence:keycard");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("分支 2 开始");
  await page.screenshot({ path: "test-results/harness-showcase-branch-b.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 01A-L1");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-rain-half-left.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 01A-L2");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-rain-neutral-cyan.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 01A-L3");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-rain-full-right-magenta.png", fullPage: true });
  const rainMotionBefore = await page.getByTestId("pixi-layer").screenshot();
  await page.waitForTimeout(350);
  const rainMotionAfter = await page.getByTestId("pixi-layer").screenshot();
  expect(rainMotionBefore.length).toBeGreaterThan(0);
  expect(changedByteCount(rainMotionBefore, rainMotionAfter)).toBeGreaterThan(100);
  await advanceUntilText(page, "CHECKPOINT 01A-OFF");
  await page.waitForTimeout(150);
  await page.screenshot({ path: "test-results/harness-showcase-rain-cleanup.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 01B-L1");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText("Ema/Pensive1,ArmR3@0.50,0.00");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-snow-light.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 01B-L2");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-snow-medium.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 01B-L3");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-snow-heavy.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 01B-L4");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-snow-storm.png", fullPage: true });
  await page.screenshot({ path: "test-results/harness-showcase-snow-shader.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 01C");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-inner-background", "bg:inner-academy-hall");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-sun-blur-inner-covered.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 01D");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-inner-background", "bg:inner-snow-outskirts");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-inback-switch-real-image.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 02A");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText("Ema/default@0.50,0.00");
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/harness-showcase-char-default-composition.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 02B");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText("Ema/Pensive1@0.50,0.00");
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/harness-showcase-char-pensive-composite.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 02C");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText("Ema/Pensive1,ArmR3@0.50,0.00");
  await advanceUntilText(page, "CHECKPOINT 02D");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText("Ema/Pensive1,ArmR3,ArmR4@0.50,0.00");
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/harness-showcase-char-arm-override.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 02E");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText(
    "Ema/Pensive1,ArmR4,Angle01/Head01/Facial01/Mouth01>Mouth01_Smile_Open@0.50,0.00"
  );
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/harness-showcase-char-atom-mouth-override.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 02F");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText(
    "Ema/Pensive1,ArmR4,Angle01/Head01/Facial01/Sweat01+Sweat01_01@0.50,0.00"
  );
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/harness-showcase-char-atom-sweat-add.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 02G");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText(
    "Ema/Pensive1,ArmR4,Angle01/Head01/Facial01/Sweat01+Sweat01_01,Angle01/Head01/Facial01/Sweat01-@0.50,0.00"
  );
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/harness-showcase-char-prefix-remove.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 02H");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText("Ema/Pensive1,ArmR3@0.50,0.00");
  await advanceUntilText(page, "CHECKPOINT 07B-L1");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-glitch-light.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 07B-L2");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-glitch-medium.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 07B-L3");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-glitch-heavy.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 07B-L4");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-glitch-stress.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 08");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-glitch-wait-cleanup.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 08A");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-glitch-filter-on.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 08B");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-glitch-filter-persistent.png", fullPage: true });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "test-results/harness-showcase-glitch-filter-persistent-later.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 08C");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-glitch-filter-plus-pulse.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 08D");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-glitch-filter-off-cleanup.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 09");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-rain-snow-coexist.png", fullPage: true });
  await advanceUntilTextOrOverlayClosed(page, "CHECKPOINT 11");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-showcase-weather-cleanup.png", fullPage: true });
  await expectNoRuntimeAssetDiagnostics(page);

  expect(consoleErrors).toEqual([]);
});

async function walkForwardUntilActive(page: Page, interactableId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await movementPulse(page, "ArrowUp");
    if ((await page.getByTestId("harness-showcase-active-interactable").textContent()) === interactableId) return;
  }

  await expect(page.getByTestId("harness-showcase-active-interactable")).toHaveText(interactableId);
}

async function expectNoDocumentScroll(page: Page) {
  const hasDocumentScroll = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);
  expect(hasDocumentScroll).toBe(false);
}

async function expectNoRuntimeAssetDiagnostics(page: Page) {
  await expect(page.getByTestId("harness-showcase-asset-diagnostics-count")).toHaveText("0");
  await expect(page.getByTestId("harness-showcase-latest-diagnostic")).not.toContainText(":asset:");
}

async function advanceUntilChoices(page: Page) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((await page.getByTestId("vn-choice-overlay").count()) > 0) return;
    await advanceVn(page);
  }

  await expect(page.getByTestId("vn-choice-overlay")).toBeVisible();
}

async function advanceUntilOverlayClosed(page: Page) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((await page.getByTestId("harness-showcase-substate").textContent()) === "walk") return;
    await advanceVn(page);
  }

  await expect(page.getByTestId("harness-showcase-substate")).toHaveText("walk");
}

async function advanceMainInteractionShowcase(page: Page) {
  await advanceVn(page);
  await advanceUntilText(page, "CHECKPOINT MAIN 01B");
  await expect(page.getByTestId("vn-command-bar")).toBeVisible();
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-ui-phase", "shown");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveCSS("opacity", "1");
  await expect(page.getByTestId("vn-command-bar")).toHaveAttribute("data-ui-phase", "shown");
  await expect(page.getByTestId("vn-command-bar")).toHaveCSS("opacity", "1");
  await advanceUntilText(page, "附加文本验证");
  await advanceUntilInputPrompt(page);
  await expect(page.getByTestId("runtime-input-prompt")).toBeVisible();
  await expect(page.getByTestId("vn-advance-hit-plane")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-menu-overlay")).toHaveCount(0);
  const dialogTextBeforeInputPromptSubmit = await currentDialogText(page);
  await page.getByTestId("runtime-input-field").fill("Smoke");
  await expect(page.getByTestId("vn-dialog-text")).toHaveText(dialogTextBeforeInputPromptSubmit);
  await page.getByTestId("runtime-input-submit").click();
  await advanceUntilText(page, "CHECKPOINT MAIN 02");
  await advanceUntilText(page, "CHECKPOINT MAIN 03");
  await advanceUntilText(page, "CHECKPOINT MAIN 03B");
  await advanceUntilText(page, "CHECKPOINT MAIN 03C");
  await advanceUntilText(page, "CHECKPOINT MAIN 04");
  await advanceVn(page);
  await expect(page.getByTestId("runtime-movie-overlay")).toBeVisible();
  await expect(page.getByTestId("vn-advance-hit-plane")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-menu-overlay")).toHaveCount(0);
  await page.getByTestId("runtime-movie-skip").click();
  await advanceUntilText(page, "CHECKPOINT MAIN 05");
  await advanceUntilText(page, "CHECKPOINT MAIN 06");
  await advanceUntilOverlayClosed(page);
}

async function advanceUntilText(page: Page, text: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const dialogText = page.getByTestId("vn-dialog-text");
    if ((await dialogText.count()) === 0) {
      const substate = await page.getByTestId("harness-showcase-substate").textContent();
      const lastAction = await page.getByTestId("harness-showcase-last-action").textContent();
      throw new Error(`VN overlay closed before '${text}' was reached. substate=${substate ?? "unknown"} lastAction=${lastAction ?? "unknown"}`);
    }
    if (((await dialogText.textContent()) ?? "").includes(text)) {
      await waitForDialogTextToSettle(page);
      return;
    }
    await advanceVn(page);
    await page.waitForTimeout(120);
  }

  await expect(page.getByTestId("vn-dialog-text")).toContainText(text);
  await waitForDialogTextToSettle(page);
}

async function advanceUntilInputPrompt(page: Page) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await page.getByTestId("runtime-input-prompt").count()) > 0) return;
    await advanceVn(page);
    await page.waitForTimeout(120);
  }

  await expect(page.getByTestId("runtime-input-prompt")).toBeVisible();
}

async function advanceUntilTextOrOverlayClosed(page: Page, text: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if ((await page.getByTestId("vn-dialog-text").count()) === 0) {
      if ((await page.getByTestId("harness-showcase-substate").textContent()) === "walk") return;
      await page.waitForTimeout(120);
      continue;
    }
    if (((await page.getByTestId("vn-dialog-text").textContent()) ?? "").includes(text)) {
      await waitForDialogTextToSettle(page);
      return;
    }
    await advanceVn(page);
    await page.waitForTimeout(120);
  }

  await expect(page.getByTestId("harness-showcase-substate")).toHaveText("walk");
}

async function advanceVn(page: Page) {
  const hitPlane = page.getByTestId("vn-advance-hit-plane");
  await expect(hitPlane).toBeVisible({ timeout: 5_000 });
  await hitPlane.click();
}

async function currentDialogText(page: Page) {
  await waitForDialogTextToSettle(page);
  return (await page.getByTestId("vn-dialog-text").textContent()) ?? "";
}

async function waitForDialogTextToSettle(page: Page) {
  let previous = (await page.getByTestId("vn-dialog-text").textContent()) ?? "";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.waitForTimeout(120);
    if ((await page.getByTestId("vn-dialog-text").count()) === 0) return;
    const current = (await page.getByTestId("vn-dialog-text").textContent()) ?? "";
    if (current === previous) return;
    previous = current;
  }
}

function changedByteCount(left: Buffer, right: Buffer, threshold = 0): number {
  const byteCount = Math.min(left.length, right.length);
  let changed = 0;
  for (let index = 0; index < byteCount; index += 1) {
    const delta = Math.abs(left[index] - right[index]);
    if (delta > threshold) changed += 1;
  }
  return changed;
}

async function expectKeyNeverFocuses(page: Page, key: string, activeTestId: string) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await movementPulse(page, key);
    await expect(page.getByTestId(activeTestId)).toHaveText("none");
  }
}

async function movementPulse(page: Page, key: string) {
  await page.keyboard.down(key);
  await page.waitForTimeout(90);
  await page.keyboard.up(key);
  await page.waitForTimeout(25);
}

async function blurActiveElement(page: Page) {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
}

async function requestPointerLockAndRelease(page: Page, triggerTestId: string, statusTestId: string) {
  await page.getByTestId(triggerTestId).click();
  await expect(page.getByTestId(statusTestId)).toHaveText(/requested|locked|unlocked|denied/);
  await page.waitForTimeout(650);

  const status = (await page.getByTestId(statusTestId).textContent()) ?? "";
  expect(status).toMatch(/locked|unlocked|denied/);
  if (!status.includes("locked")) return;

  await page.keyboard.press("Escape");
  await expect(page.getByTestId(statusTestId)).toHaveText("unlocked");
}

function isExpectedPointerLockError(text: string): boolean {
  return text.includes("PointerLockControls: Unable to use Pointer Lock API");
}
