import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);

test("game-a opening renders the imported Alice layered states", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/?vnStart=PartRain2");
  await expect(page.getByTestId("game-a-mode")).toHaveText("视觉小说");

  await advanceUntilText(page, "雨幕里，一个熟悉的人影停在了街角。", 24);
  await expectAliceState(page, "default");

  const states = [
    { text: "你真的在这里淋了这么久？", expression: "EYE0,MOUTH0" },
    {
      text: "妈妈让我来找你。她说牛奶再不买，店就要关门了。",
      expression: "EYE1,MOUTH3,ArmL2"
    },
    {
      text: "还有，伞往这边一点。你半边肩膀都湿透了。",
      expression: "EYE4,MOUTH5,ArmL4,ArmR2,EFFECT0"
    },
    {
      text: "她把伞沿朝我这边压低了一点，像是不打算再给我逃跑的机会。",
      expression: "EYE2,MOUTH2,ArmL0,ArmR0,EFFECT2"
    }
  ] as const;

  for (const state of states) {
    await advanceUntilText(page, state.text, 4);
    await expectAliceState(page, state.expression);
  }

  await advanceUntilChoices(page, 4);
  await expect(page.getByTestId("vn-choice-0")).toHaveText("陪我去买牛奶吧");
  expect(consoleErrors).toEqual([]);
});

async function expectAliceState(page: Page, expression: string) {
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute(
    "data-pixi-characters",
    `alice/${expression}@0.50,0.00`
  );
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-active-tasks", "empty");
  await page.waitForTimeout(500);
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
