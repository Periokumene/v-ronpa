import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadProjectScriptConfig } from "./projectScripts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("project script catalogs", () => {
  it("loads isolated production and test catalogs with logical paths", async () => {
    const fixture = createFixture({
      entry: { initialScriptPath: "game/opening.nani", startLabel: "Start" },
      scripts: [
        { sourceFile: "app/nani/opening.nani", scriptPath: "game/opening.nani" },
        { sourceFile: "app/nani/chapter.nani", scriptPath: "game/chapter.nani" }
      ],
      testCatalogs: {
        smoke: {
          entry: { initialScriptPath: "game/test/smoke.nani" },
          scripts: [
            { sourceFile: "app/test/smoke.nani", scriptPath: "game/test/smoke.nani" }
          ]
        }
      }
    });

    const loaded = await loadProjectScriptConfig(fixture.configPath, fixture.root);

    expect(loaded.errors).toEqual([]);
    expect(loaded.catalogs.map((catalog) => catalog.catalogId)).toEqual([
      "production",
      "test:smoke"
    ]);
    expect(loaded.catalogs[0]?.scripts.map((script) => script.scriptPath)).toEqual([
      "game/opening.nani",
      "game/chapter.nani"
    ]);
    expect(loaded.catalogs[1]?.scripts.map((script) => script.scriptPath)).toEqual([
      "game/test/smoke.nani"
    ]);
  });

  it("rejects duplicate physical registration across production and test catalogs", async () => {
    const fixture = createFixture({
      entry: { initialScriptPath: "game/opening.nani" },
      scripts: [
        { sourceFile: "app/nani/opening.nani", scriptPath: "game/opening.nani" }
      ],
      testCatalogs: {
        smoke: {
          entry: { initialScriptPath: "game/test/opening.nani" },
          scripts: [
            { sourceFile: "app/nani/opening.nani", scriptPath: "game/test/opening.nani" }
          ]
        }
      }
    });

    const loaded = await loadProjectScriptConfig(fixture.configPath, fixture.root);

    expect(loaded.catalogs).toEqual([]);
    expect(loaded.errors).toEqual([
      expect.stringContaining("registered more than once")
    ]);
  });

  it("keeps a valid production catalog when an unrelated test catalog is invalid", async () => {
    const fixture = createFixture({
      entry: { initialScriptPath: "game/opening.nani" },
      scripts: [
        { sourceFile: "app/nani/opening.nani", scriptPath: "game/opening.nani" }
      ],
      testCatalogs: {
        broken: {
          entry: { initialScriptPath: "game/test/missing.nani" },
          scripts: [
            { sourceFile: "app/test/missing.nani", scriptPath: "game/test/missing.nani" }
          ]
        }
      }
    });

    const loaded = await loadProjectScriptConfig(fixture.configPath, fixture.root);

    expect(loaded.errors).toEqual([expect.stringContaining("does not exist")]);
    expect(loaded.catalogs.map((catalog) => catalog.catalogId)).toEqual(["production"]);
  });

  it("rejects duplicate logical paths and an unregistered entry path", async () => {
    const duplicate = createFixture({
      entry: { initialScriptPath: "game/opening.nani" },
      scripts: [
        { sourceFile: "app/nani/opening.nani", scriptPath: "game/opening.nani" },
        { sourceFile: "app/nani/chapter.nani", scriptPath: "game/opening.nani" }
      ]
    });
    const invalidEntry = createFixture({
      entry: { initialScriptPath: "game/missing-entry.nani" },
      scripts: [
        { sourceFile: "app/nani/opening.nani", scriptPath: "game/opening.nani" }
      ]
    });

    const duplicateResult = await loadProjectScriptConfig(
      duplicate.configPath,
      duplicate.root
    );
    const invalidEntryResult = await loadProjectScriptConfig(
      invalidEntry.configPath,
      invalidEntry.root
    );

    expect(duplicateResult.catalogs).toEqual([]);
    expect(duplicateResult.errors).toEqual([
      expect.stringContaining("logical script path")
    ]);
    expect(invalidEntryResult.catalogs).toEqual([]);
    expect(invalidEntryResult.errors).toEqual([
      expect.stringContaining("is not registered")
    ]);
  });

  it("excludes typescript-template catalogs without copying generator rules", async () => {
    const fixture = createFixture({
      entry: { initialScriptPath: "harness/showcase.nani" },
      scripts: [
        {
          sourceFile: "app/showcase.ts",
          sourceFormat: "typescript-template",
          scriptPath: "harness/showcase.nani"
        }
      ]
    });
    writeFileSync(join(fixture.root, "app/showcase.ts"), "export const source = `#Start\\n@end`;\n");

    const loaded = await loadProjectScriptConfig(fixture.configPath, fixture.root);

    expect(loaded.errors).toEqual([]);
    expect(loaded.catalogs).toEqual([]);
    expect(loaded.warnings[0]).toContain("sourceFormat-backed");
  });

  it("rejects missing and workspace-escaping source files", async () => {
    const fixture = createFixture({
      entry: { initialScriptPath: "game/missing.nani" },
      scripts: [
        { sourceFile: "app/nani/missing.nani", scriptPath: "game/missing.nani" },
        { sourceFile: "../outside.nani", scriptPath: "game/outside.nani" }
      ]
    });

    const loaded = await loadProjectScriptConfig(fixture.configPath, fixture.root);

    expect(loaded.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("does not exist"),
      expect.stringContaining("outside the trusted workspace")
    ]));
  });

  it("indexes the real Game A production and test catalogs", async () => {
    const root = resolve(process.cwd(), "../..");
    const loaded = await loadProjectScriptConfig(
      join(root, "apps/game-a/asset.config.mjs"),
      root
    );

    expect(loaded.errors).toEqual([]);
    expect(loaded.catalogs.map((catalog) => catalog.catalogId)).toEqual([
      "production",
      "test:characterSmoke",
      "test:smoke"
    ]);
    expect(loaded.catalogs[0]?.scripts.map((script) => script.scriptPath)).toEqual([
      "game-a/opening.nani",
      "game-a/chapter-02.nani"
    ]);
  });
});

function createFixture(config: Record<string, unknown>): { root: string; configPath: string } {
  const root = mkdtempSync(join(tmpdir(), "vscode-nani-scripts-"));
  roots.push(root);
  mkdirSync(join(root, "app/nani"), { recursive: true });
  mkdirSync(join(root, "app/test"), { recursive: true });
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
  writeFileSync(join(root, "app/nani/opening.nani"), "#Start\n@end\n");
  writeFileSync(join(root, "app/nani/chapter.nani"), "#Start\n@end\n");
  writeFileSync(join(root, "app/test/smoke.nani"), "#Start\n@end\n");
  const configPath = join(root, "app/asset.config.mjs");
  writeFileSync(configPath, `export default ${JSON.stringify(config, null, 2)};\n`);
  return { root, configPath };
}
