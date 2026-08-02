import { mkdtemp, mkdir, rename, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  NaniProjectDiscoveryError,
  analyzeNaniCatalog,
  discoverNaniProjectScripts,
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
  it("keeps a missing configured entry fatal and out of the runnable catalog", async () => {
    const root = await projectRoot();
    await mkdir(join(root, "nani"), { recursive: true });
    await writeFile(join(root, "nani", "other.nani"), "#Start\nNarrator: Other");

    const result = await analyzeNaniCatalog(baseConfig, {
      projectRoot: root,
      scopes: ["production"],
      entry: baseConfig.mainEntry,
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
      scopes: ["production"],
      entry: baseConfig.mainEntry,
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
      scopes: ["production"],
      entry: baseConfig.mainEntry,
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
      scopes: ["production", "development"],
      entry: baseConfig.mainEntry,
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
      scopes: ["production"],
      entry: baseConfig.mainEntry,
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
