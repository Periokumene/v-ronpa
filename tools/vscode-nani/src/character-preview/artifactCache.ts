import { stat, mkdir, readdir, unlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CharacterPreviewArtifactRenderer, PreviewArtifact, ResolvedCharacterPreview } from "./types";

export interface CharacterPreviewArtifactCacheOptions {
  maxArtifacts?: number;
  maxBytes?: number;
}

export class CharacterPreviewArtifactCache {
  private readonly pending = new Map<string, Promise<PreviewArtifact>>();
  private readonly maxArtifacts: number;
  private readonly maxBytes: number;

  constructor(
    readonly directory: string,
    options: CharacterPreviewArtifactCacheOptions = {}
  ) {
    this.maxArtifacts = options.maxArtifacts ?? 64;
    this.maxBytes = options.maxBytes ?? 48 * 1024 * 1024;
  }

  async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await this.cleanup();
  }

  getOrCreate(
    preview: ResolvedCharacterPreview,
    renderer: CharacterPreviewArtifactRenderer
  ): Promise<PreviewArtifact> {
    const existing = this.pending.get(preview.fingerprint);
    if (existing) return existing;
    const pending = this.create(preview, renderer).finally(() => {
      if (this.pending.get(preview.fingerprint) === pending) this.pending.delete(preview.fingerprint);
    });
    this.pending.set(preview.fingerprint, pending);
    return pending;
  }

  clearMemory(): void {
    this.pending.clear();
  }

  private async create(
    preview: ResolvedCharacterPreview,
    renderer: CharacterPreviewArtifactRenderer
  ): Promise<PreviewArtifact> {
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, `${preview.fingerprint}.svg`);
    try {
      await stat(path);
      const now = new Date();
      await utimes(path, now, now);
    } catch (error) {
      if (!isMissing(error)) throw error;
      const svg = renderer.render(preview);
      try {
        await writeFile(path, svg, { encoding: "utf8", flag: "wx" });
      } catch (writeError) {
        if (!isAlreadyExists(writeError)) throw writeError;
      }
      await this.cleanup(path);
    }
    return { fingerprint: preview.fingerprint, path, layerCount: preview.layers.length };
  }

  private async cleanup(protectedPath?: string): Promise<void> {
    const entries = await readdir(this.directory, { withFileTypes: true });
    const files = (await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".svg"))
      .map(async (entry) => {
        const path = join(this.directory, entry.name);
        const info = await stat(path);
        return { path, size: info.size, mtimeMs: info.mtimeMs };
      })))
      .sort((left, right) => right.mtimeMs - left.mtimeMs);
    let bytes = files.reduce((sum, file) => sum + file.size, 0);
    let count = files.length;
    for (const file of [...files].reverse()) {
      if (count <= this.maxArtifacts && bytes <= this.maxBytes) break;
      if (file.path === protectedPath) continue;
      await unlink(file.path);
      bytes -= file.size;
      count -= 1;
    }
  }
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function isAlreadyExists(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "EEXIST");
}
