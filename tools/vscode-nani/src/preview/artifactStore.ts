import { mkdir, readdir, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface SvgPreviewArtifactStoreOptions {
  maxArtifacts?: number;
  maxBytes?: number;
}

export interface SvgPreviewArtifact {
  fingerprint: string;
  path: string;
}

export class SvgPreviewArtifactStore {
  private readonly pending = new Map<string, Promise<SvgPreviewArtifact>>();
  private readonly maxArtifacts: number;
  private readonly maxBytes: number;
  private cleanupQueue: Promise<void> = Promise.resolve();

  constructor(
    readonly directory: string,
    options: SvgPreviewArtifactStoreOptions = {}
  ) {
    this.maxArtifacts = options.maxArtifacts ?? 64;
    this.maxBytes = options.maxBytes ?? 48 * 1024 * 1024;
  }

  async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await this.enqueueCleanup();
  }

  getOrCreate(fingerprint: string, render: () => string): Promise<SvgPreviewArtifact> {
    const existing = this.pending.get(fingerprint);
    if (existing) return existing;
    const pending = this.create(fingerprint, render).finally(() => {
      if (this.pending.get(fingerprint) === pending) this.pending.delete(fingerprint);
    });
    this.pending.set(fingerprint, pending);
    return pending;
  }

  clearMemory(): void {
    this.pending.clear();
  }

  private async create(fingerprint: string, render: () => string): Promise<SvgPreviewArtifact> {
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, `${fingerprint}.svg`);
    try {
      await stat(path);
      const now = new Date();
      await utimes(path, now, now);
    } catch (error) {
      if (!isMissing(error)) throw error;
      const svg = render();
      try {
        await writeFile(path, svg, { encoding: "utf8", flag: "wx" });
      } catch (writeError) {
        if (!isAlreadyExists(writeError)) throw writeError;
      }
      await this.enqueueCleanup(path);
    }
    return { fingerprint, path };
  }

  private enqueueCleanup(protectedPath?: string): Promise<void> {
    const cleanup = this.cleanupQueue.then(() => this.cleanup(protectedPath));
    this.cleanupQueue = cleanup.catch(() => undefined);
    return cleanup;
  }

  private async cleanup(protectedPath?: string): Promise<void> {
    const entries = await readdir(this.directory, { withFileTypes: true });
    const discoveredFiles = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".svg"))
      .map(async (entry) => {
        const path = join(this.directory, entry.name);
        try {
          const info = await stat(path);
          return { path, size: info.size, mtimeMs: info.mtimeMs };
        } catch (error) {
          if (isMissing(error)) return undefined;
          throw error;
        }
      }));
    const files = discoveredFiles
      .filter((file): file is NonNullable<typeof file> => file !== undefined)
      .sort((left, right) => right.mtimeMs - left.mtimeMs);
    let bytes = files.reduce((sum, file) => sum + file.size, 0);
    let count = files.length;
    for (const file of [...files].reverse()) {
      if (count <= this.maxArtifacts && bytes <= this.maxBytes) break;
      if (file.path === protectedPath) continue;
      try {
        await unlink(file.path);
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
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
