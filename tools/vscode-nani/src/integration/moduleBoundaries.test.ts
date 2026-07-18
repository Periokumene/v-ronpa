import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("VS Code adapter module boundaries", () => {
  it("keeps language services independent from character preview", () => {
    for (const file of sourceFiles("language")) {
      expect(read(file), file).not.toMatch(/character-preview/u);
    }
  });

  it("keeps preview failures out of language diagnostics and Pixi/webviews", () => {
    for (const file of sourceFiles("character-preview")) {
      const source = read(file);
      expect(source, file).not.toMatch(/from\s+["'][^"']*diagnostics["']/u);
      expect(source, file).not.toMatch(/pixi|createWebviewPanel|registerWebview/iu);
    }
  });

  it("keeps the extension entrypoint as a composition root", () => {
    const source = read(join(sourceRoot, "extension.ts"));
    expect(source).not.toMatch(/computeNaniDiagnostics|resolveLayeredCharacter|parseScenario/u);
    expect(source).toContain("registerLanguageFeatures");
    expect(source).toContain("registerHoverCoordinator");
  });
});

function sourceFiles(directory: string): string[] {
  const root = join(sourceRoot, directory);
  return readdirSync(root)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => join(root, name));
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}
