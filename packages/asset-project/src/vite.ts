import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import type { Plugin } from "vite";
import { assetProjectRoot, mimeTypeForPath, scanAssetProject, type AssetProjectConfig } from "@v-ronpa/asset-project";

export function createAssetProjectVitePlugin(config: AssetProjectConfig): Plugin {
  const root = assetProjectRoot(config);
  const routePrefix = `/${config.mount}/`;
  return {
    name: `v-ronpa-asset-project:${config.appId}`,
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split("?", 1)[0];
        if (!pathname?.startsWith(routePrefix)) return next();
        const relativePath = decodeURIComponent(pathname.slice(routePrefix.length));
        if (!relativePath || relativePath.split("/").some((part) => part === ".." || !part)) return next();
        let mimeType: string;
        try {
          mimeType = mimeTypeForPath(relativePath);
        } catch {
          return next();
        }
        response.setHeader("Content-Type", mimeType);
        const stream = createReadStream(resolve(root, relativePath));
        stream.on("error", () => next());
        stream.pipe(response);
      });
    },
    async buildStart() {
      const scan = await scanAssetProject(config);
      for (const file of scan.files) this.addWatchFile(file.absolutePath);
    },
    async generateBundle() {
      const scan = await scanAssetProject(config);
      for (const file of scan.files) {
        this.emitFile({
          type: "asset",
          fileName: `${config.mount}/${file.relativePath}`,
          source: await readFile(file.absolutePath)
        });
      }
    }
  };
}
