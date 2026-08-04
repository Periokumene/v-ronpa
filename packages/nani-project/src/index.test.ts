import { mkdtemp, mkdir, rename, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  NaniProjectDiscoveryError,
  analyzeNaniCatalog,
  discoverNaniProjectScripts,
  parseNaniProjectConfig,
  type NaniProjectConfig
} from "./index";

const baseConfig: NaniProjectConfig = {
  scopes: {
    production: { sourceRoot: "nani", scriptRoot: "game" },
    development: { sourceRoot: "nani-dev", scriptRoot: "game/dev" },
    test: { sourceRoot: "nani-test", scriptRoot: "game/test" }
  },
  mainEntry: {
    id: "vn:main",
    scope: "production",
    initialScriptPath: "game/opening.nani",
    startLabel: "Start"
  },
  testEntries: {
    smoke: {
      id: "vn:test",
      scope: "test",
      initialScriptPath: "game/test/smoke.nani",
      startLabel: "Start"
    }
  },
  voiceLocales: ["zh"]
};
const emptyAssetBindings = { appId: "game", assets: [], characterAssetIdByCharacterId: {} } as const;

describe("parseNaniProjectConfig", () => {
  it("accepts only the current hard-cut project shape", () => {
    expect(parseNaniProjectConfig(baseConfig)).toEqual(baseConfig);
    for (const legacy of [
      { ...baseConfig, scripts: [] },
      { ...baseConfig, testCatalogs: [] },
      { ...baseConfig, sourceFormat: "nani" },
      {
        ...baseConfig,
        scopes: {
          ...baseConfig.scopes,
          production: { ...baseConfig.scopes.production, outputPath: "generated.ts" }
        }
      }
    ]) {
      expect(() => parseNaniProjectConfig(legacy)).toThrow(/Unknown key/u);
    }
  });

  it("rejects invalid scopes and duplicate entry ids", () => {
    expect(() => parseNaniProjectConfig({
      ...baseConfig,
      mainEntry: { ...baseConfig.mainEntry, scope: "test" }
    })).toThrow("naniProject.mainEntry.scope must be 'production'");
    expect(() => parseNaniProjectConfig({
      ...baseConfig,
      testEntries: {
        smoke: { ...baseConfig.testEntries.smoke, id: baseConfig.mainEntry.id }
      }
    })).toThrow("entry ids must be unique");
  });
});

describe("discoverNaniProjectScripts", () => {
  it("recursively discovers only .nani files in stable logical-path order", async () => {
    const root = await projectRoot();
    await mkdir(join(root, "nani", "chapter"), { recursive: true });
    await writeFile(join(root, "nani", "z.txt"), "ignored");
    await writeFile(join(root, "nani", "opening.nani"), "# Start\nNarrator: Open");
    await writeFile(join(root, "nani", "chapter", "02.nani"), "Narrator: Two");

    const scripts = await discoverNaniProjectScripts(baseConfig, {
      projectRoot: root,
      scopes: ["production"]
    });

    expect(scripts.map((script) => script.scriptPath)).toEqual([
      "game/chapter/02.nani",
      "game/opening.nani"
    ]);
    expect(scripts.map((script) => script.sourceFile)).toEqual([
      "nani/chapter/02.nani",
      "nani/opening.nani"
    ]);
  });

  it("reflects additions and renames without a configuration change", async () => {
    const root = await projectRoot();
    await mkdir(join(root, "nani"), { recursive: true });
    await writeFile(join(root, "nani", "opening.nani"), "#Start");
    expect((await discoverNaniProjectScripts(baseConfig, {
      projectRoot: root,
      scopes: ["production"]
    })).map((script) => script.scriptPath)).toEqual(["game/opening.nani"]);

    await writeFile(join(root, "nani", "new.nani"), "Narrator: New");
    await rename(join(root, "nani", "opening.nani"), join(root, "nani", "renamed.nani"));
    expect((await discoverNaniProjectScripts(baseConfig, {
      projectRoot: root,
      scopes: ["production"]
    })).map((script) => script.scriptPath)).toEqual(["game/new.nani", "game/renamed.nani"]);
  });

  it("rejects missing roots, symlinks, and case-folded logical collisions", async () => {
    const missing = await projectRoot();
    await expect(discoverNaniProjectScripts(baseConfig, {
      projectRoot: missing,
      scopes: ["production"]
    })).rejects.toBeInstanceOf(NaniProjectDiscoveryError);

    const root = await projectRoot();
    await mkdir(join(root, "nani"), { recursive: true });
    await writeFile(join(root, "outside.nani"), "# Start");
    await symlink(join(root, "outside.nani"), join(root, "nani", "linked.nani"));
    await expect(discoverNaniProjectScripts(baseConfig, {
      projectRoot: root,
      scopes: ["production"]
    })).rejects.toMatchObject({ diagnostics: [expect.objectContaining({ code: "symlink-not-supported" })] });

    const collisionRoot = await projectRoot();
    await mkdir(join(collisionRoot, "nani"), { recursive: true });
    await mkdir(join(collisionRoot, "nani-dev"), { recursive: true });
    await writeFile(join(collisionRoot, "nani", "A.nani"), "# Start");
    await writeFile(join(collisionRoot, "nani-dev", "a.nani"), "# Start");
    await expect(discoverNaniProjectScripts({
      ...baseConfig,
      scopes: {
        ...baseConfig.scopes,
        production: { sourceRoot: "nani", scriptRoot: "game" },
        development: { sourceRoot: "nani-dev", scriptRoot: "Game" }
      }
    }, {
      projectRoot: collisionRoot,
      scopes: ["production", "development"]
    })).rejects.toMatchObject({ diagnostics: [expect.objectContaining({ code: "script-path-case-collision" })] });
  });

  it("rejects configured roots outside the project", async () => {
    const root = await projectRoot();
    await expect(discoverNaniProjectScripts({
      ...baseConfig,
      scopes: { production: { sourceRoot: "../outside", scriptRoot: "game" } }
    }, {
      projectRoot: root,
      scopes: ["production"]
    })).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "source-root-outside-project" })]
    });
  });
});

describe("analyzeNaniCatalog", () => {
  it("binds compiled resource commands and voice TextIds through the shared asset contract", async () => {
    const root = await projectRoot();
    await mkdir(join(root, "nani"), { recursive: true });
    await writeFile(join(root, "nani", "opening.nani"), [
      "#Start",
      "@back bg/home",
      "@pinp ui/frame",
      "@bgm bgm/main",
      "@sfx sfx/hit",
      "@sfxFast sfx/shock",
      "@movie video/intro",
      "@char Ema",
      "@slide Ema from:0,0 to:50,0",
      "Narrator: Voice.|#game_voice_0001|",
      "@end"
    ].join("\n"));
    const assets = [
      ["bg/home", "image/png"],
      ["ui/frame", "image/png"],
      ["bgm/main", "audio/ogg"],
      ["sfx/hit", "audio/ogg"],
      ["sfx/shock", "audio/ogg"],
      ["video/intro", "video/mp4"],
      ["char/ema", "application/json"],
      ["voice/zh/voice-0001", "audio/ogg"]
    ].map(([id, mimeType]) => ({ id: id!, uri: `assets/${id}.bin`, mimeType: mimeType! }));

    const result = await analyzeNaniCatalog(baseConfig, {
      projectRoot: root,
      scopes: ["production"],
      entries: [baseConfig.mainEntry],
      assetBindings: {
        appId: "game",
        assets,
        characterAssetIdByCharacterId: { Ema: "char/ema" }
      },
      sourceDiagnosticPolicy: "strict"
    });

    expect(result.hasFatalDiagnostics).toBe(false);
    expect(result.scripts[0]?.metadata.requirements).toEqual([
      { id: "bg/home", capability: "image" },
      { id: "bgm/main", capability: "audio" },
      { id: "char/ema", capability: "json" },
      { id: "sfx/hit", capability: "audio" },
      { id: "sfx/shock", capability: "audio" },
      { id: "ui/frame", capability: "image" },
      { id: "video/intro", capability: "video" },
      { id: "voice/zh/voice-0001", capability: "audio" }
    ]);
    expect(result.voiceIndex).toEqual({ zh: { game_voice_0001: "voice/zh/voice-0001" } });
  });

  it("analyzes multiple entries in one isolated catalog", async () => {
    const root = await projectRoot();
    await mkdir(join(root, "nani-test"), { recursive: true });
    await writeFile(join(root, "nani-test", "smoke.nani"), "#Start\n@end");
    await writeFile(join(root, "nani-test", "character.nani"), "#Start\n@end");
    const character = {
      id: "vn:test-character",
      scope: "test" as const,
      initialScriptPath: "game/test/character.nani",
      startLabel: "Start"
    };

    const result = await analyzeNaniCatalog(baseConfig, {
      projectRoot: root,
      assetBindings: emptyAssetBindings,
      scopes: ["test"],
      entries: [baseConfig.testEntries.smoke!, character],
      sourceDiagnosticPolicy: "allow-recoverable-command-errors"
    });

    expect(result.entries.map((entry) => entry.id)).toEqual(["vn:test", "vn:test-character"]);
    expect(result.hasFatalDiagnostics).toBe(false);
    expect(result.catalog.map((source) => source.scriptPath)).toEqual([
      "game/test/character.nani",
      "game/test/smoke.nani"
    ]);
  });

  it("uses injected unsaved source text and emits exact catalog spans", async () => {
    const root = await projectRoot();
    await mkdir(join(root, "nani"), { recursive: true });
    await writeFile(join(root, "nani", "opening.nani"), "#Start\n@goto game/missing.nani#Now");
    const unsaved = "#Start\n@goto game/other.nani#Missing";
    await writeFile(join(root, "nani", "other.nani"), "#Other\n@end");

    const result = await analyzeNaniCatalog(baseConfig, {
      projectRoot: root,
      assetBindings: emptyAssetBindings,
      scopes: ["production"],
      entries: [baseConfig.mainEntry],
      sourceDiagnosticPolicy: "allow-recoverable-command-errors",
      loadSourceText: async (script) => script.scriptPath === "game/opening.nani"
        ? unsaved
        : "#Other\n@end"
    });
    const diagnostic = result.diagnostics.find((candidate) => candidate.code === "endpoint-label-missing");

    expect(diagnostic?.span && unsaved.slice(diagnostic.span.start, diagnostic.span.end))
      .toBe("game/other.nani#Missing");
    expect(result.scripts.find((script) => script.scriptPath === "game/opening.nani")?.sourceText)
      .toBe(unsaved);
    expect(result.scripts.find((script) => script.scriptPath === "game/opening.nani")?.diagnostics)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "endpoint-label-missing", span: diagnostic?.span })
      ]));
  });

  it("keeps a missing configured entry fatal and out of the runnable catalog", async () => {
    const root = await projectRoot();
    await mkdir(join(root, "nani"), { recursive: true });
    await writeFile(join(root, "nani", "other.nani"), "#Start\nNarrator: Other");

    const result = await analyzeNaniCatalog(baseConfig, {
      projectRoot: root,
      assetBindings: emptyAssetBindings,
      scopes: ["production"],
      entries: [baseConfig.mainEntry],
      sourceDiagnosticPolicy: "strict"
    });

    expect(result.hasFatalDiagnostics).toBe(true);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "entry-script-missing", disposition: "fatal" })
    ]));
  });

  it("keeps valid commands runnable around a recoverable unknown command", async () => {
    const root = await projectRoot();
    await mkdir(join(root, "nani"), { recursive: true });
    await writeFile(join(root, "nani", "opening.nani"), [
      "# Start",
      "Narrator: Before.|#before|",
      "@notACommand",
      "Narrator: After.|#after|"
    ].join("\n"));

    const result = await analyzeNaniCatalog(baseConfig, {
      projectRoot: root,
      assetBindings: emptyAssetBindings,
      scopes: ["production"],
      entries: [baseConfig.mainEntry],
      sourceDiagnosticPolicy: "allow-recoverable-command-errors"
    });

    expect(result.hasFatalDiagnostics).toBe(false);
    expect(result.hasRecoverableDiagnostics).toBe(true);
    expect(result.catalog).toHaveLength(1);
    expect(result.scripts[0]?.runtimeScript.commands.map((command) => command.commandId)).toEqual([
      "print",
      "print"
    ]);
  });

  it("keeps parser errors and invalid cross-file targets fatal", async () => {
    const root = await projectRoot();
    await mkdir(join(root, "nani"), { recursive: true });
    await writeFile(join(root, "nani", "opening.nani"), [
      "# Start",
      "# Start",
      "@goto game/missing.nani#Now"
    ].join("\n"));

    const result = await analyzeNaniCatalog(baseConfig, {
      projectRoot: root,
      assetBindings: emptyAssetBindings,
      scopes: ["production"],
      entries: [baseConfig.mainEntry],
      sourceDiagnosticPolicy: "allow-recoverable-command-errors"
    });

    expect(result.hasFatalDiagnostics).toBe(true);
    expect(result.scripts[0]?.executionDisposition).toBe("fatal");
    expect(result.catalog).toEqual([]);
  });

  it("warns for production-to-development navigation in the union and rejects it in production", async () => {
    const root = await projectRoot();
    await mkdir(join(root, "nani"), { recursive: true });
    await mkdir(join(root, "nani-dev"), { recursive: true });
    await writeFile(join(root, "nani", "opening.nani"), [
      "#Start",
      "@goto game/dev/draft.nani#Draft"
    ].join("\n"));
    await writeFile(join(root, "nani-dev", "draft.nani"), "#Draft\nNarrator: Draft");

    const development = await analyzeNaniCatalog(baseConfig, {
      projectRoot: root,
      assetBindings: emptyAssetBindings,
      scopes: ["production", "development"],
      entries: [baseConfig.mainEntry],
      sourceDiagnosticPolicy: "allow-recoverable-command-errors"
    });
    expect(development.hasFatalDiagnostics).toBe(false);
    expect(development.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "development-only-target",
        severity: "warning",
        disposition: "advisory"
      })
    ]));

    const production = await analyzeNaniCatalog(baseConfig, {
      projectRoot: root,
      assetBindings: emptyAssetBindings,
      scopes: ["production"],
      entries: [baseConfig.mainEntry],
      sourceDiagnosticPolicy: "strict"
    });
    expect(production.hasFatalDiagnostics).toBe(true);
    expect(production.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "endpoint-script-missing", disposition: "fatal" })
    ]));
  });
});

async function projectRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "v-ronpa-nani-project-"));
}
