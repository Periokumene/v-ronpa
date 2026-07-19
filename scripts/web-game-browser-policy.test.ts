import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

describe("web game browser policy drift guard", () => {
  it("keeps authored motion free from app and Workbench system preference branches", () => {
    const files = collectFiles([
      "apps/game-a/src",
      "apps/game-harness/src",
      "packages/app-vn-devtools/src",
      "packages/app-vn-shell/src",
      "packages/ui-kit/src"
    ], new Set([".css", ".ts", ".tsx"]));

    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toContain("prefers-reduced-motion");
    }
  });

  it("keeps browser zoom available and avoids a global touch-action lock", () => {
    for (const indexHtml of ["apps/game-a/index.html", "apps/game-harness/index.html"]) {
      const source = read(indexHtml);
      expect(source, indexHtml).not.toMatch(/user-scalable\s*=\s*no/iu);
      expect(source, indexHtml).not.toMatch(/(?:maximum|minimum)-scale/iu);
    }

    const policyCss = read("packages/app-vn-shell/src/webGameDocumentPolicy.css");
    expect(policyCss).not.toMatch(/touch-action\s*:\s*none/iu);
    expect(policyCss).not.toMatch(/body \* \{[^}]*overscroll-behavior/iu);
  });

  it("does not expand the document policy into lifecycle, navigation, or fullscreen ownership", () => {
    const source = read("packages/app-vn-shell/src/webGameDocumentPolicy.ts");
    for (const excludedBehavior of ["beforeunload", "visibilitychange", "popstate", "requestFullscreen"]) {
      expect(source).not.toContain(excludedBehavior);
    }
  });
});

function collectFiles(relativeDirectories: string[], extensions: Set<string>): string[] {
  const files: string[] = [];
  for (const relativeDirectory of relativeDirectories) {
    visit(join(repositoryRoot, relativeDirectory));
  }
  return files;

  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (extensions.has(extname(entry.name)) && !entry.name.includes(".test.")) {
        files.push(path);
      }
    }
  }
}

function read(relativePath: string): string {
  return readFileSync(join(repositoryRoot, relativePath), "utf8");
}
