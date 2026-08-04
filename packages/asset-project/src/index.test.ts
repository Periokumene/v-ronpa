import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { defineAssetProject, scanAssetProject } from "./index";
import { createAssetProjectVitePlugin } from "./vite";

describe("asset project scanner", () => {
  it("derives deterministic App-relative IDs, MIME and explicit CharacterId bindings", async () => {
    const root = await fixture();
    await file(root, "assets/bg/home.png");
    await file(root, "assets/voice/zh/voice-0001.ogg");
    await file(root, "assets/char/ema/character.json", '{"id":"Ema"}');
    await file(root, "assets/char/ema/compositions.json", "{}");
    const scan = await scanAssetProject(config(root));

    expect(scan.assets).toEqual([
      { id: "bg/home", uri: "assets/bg/home.png", mimeType: "image/png" },
      { id: "char/ema", uri: "assets/char/ema/character.json", mimeType: "application/json" },
      { id: "voice/zh/voice-0001", uri: "assets/voice/zh/voice-0001.ogg", mimeType: "audio/ogg" }
    ]);
    expect(scan.characterAssetIdByCharacterId).toEqual({ Ema: "char/ema" });
  });

  it("rejects duplicate stems, uppercase paths and unsupported extensions", async () => {
    const duplicate = await fixture();
    await file(duplicate, "assets/bg/home.png");
    await file(duplicate, "assets/bg/home.webp");
    await expect(scanAssetProject(config(duplicate))).rejects.toThrow("Duplicate AssetId 'bg/home'");

    const uppercase = await fixture();
    await file(uppercase, "assets/bg/Home.png");
    await expect(scanAssetProject(config(uppercase))).rejects.toThrow();

    const unsupported = await fixture();
    await file(unsupported, "assets/bg/home.psd");
    await expect(scanAssetProject(config(unsupported))).rejects.toThrow("Unsupported asset extension");
  });

  it("allows the same AssetId in independent App projects", async () => {
    const left = await fixture();
    const right = await fixture();
    await file(left, "assets/bg/home.png");
    await file(right, "assets/bg/home.png");
    expect((await scanAssetProject(config(left))).assets[0]?.id).toBe("bg/home");
    expect((await scanAssetProject(config(right))).assets[0]?.id).toBe("bg/home");
  });

  it("emits stable un-hashed files below the configured assets mount", async () => {
    const root = await fixture();
    await file(root, "assets/bg/home.png", "png");
    await file(root, "assets/sfx/door.ogg", "ogg");
    const plugin = createAssetProjectVitePlugin(config(root));
    const emitted: Array<{ fileName?: string; source?: string | Uint8Array }> = [];
    const generateBundle = plugin.generateBundle;
    if (typeof generateBundle !== "function") throw new Error("Asset project plugin must provide generateBundle.");

    await (generateBundle as unknown as (this: { emitFile(file: typeof emitted[number]): string }) => Promise<void>)
      .call({
        emitFile(asset) {
          emitted.push(asset);
          return String(emitted.length);
        }
      });

    expect(emitted.map((asset) => asset.fileName)).toEqual(["assets/bg/home.png", "assets/sfx/door.ogg"]);
    expect(emitted.every((asset) => !asset.fileName?.includes("-"))).toBe(true);
  });
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "v-ronpa-assets-"));
  await mkdir(join(root, "assets", "char"), { recursive: true });
  return root;
}

async function file(root: string, relativePath: string, contents = "x"): Promise<void> {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

function config(root: string) {
  return defineAssetProject(pathToFileURL(join(root, "asset.config.mjs")).href, {
    appId: "test",
    root: "assets",
    generatedModule: "src/generatedAssets.ts",
    bundleRoots: [{ path: "char", entry: "character.json" }]
  });
}
