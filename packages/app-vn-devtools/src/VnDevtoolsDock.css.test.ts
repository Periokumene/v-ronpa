import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./VnDevtoolsDock.css", import.meta.url), "utf8");
const componentSources = [
  "./VnDevtoolsDock.tsx",
  "./WorkbenchChrome.tsx",
  "./WorkbenchSourceView.tsx",
  "./WorkbenchSymbols.tsx",
  "./WorkbenchToolPanel.tsx"
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");

describe("Nani Workbench IDE styling contract", () => {
  it("uses the six-row non-scrolling IDE grid and independent source/panel scroll regions", () => {
    expect(css).toContain("grid-template-rows: 40px 38px 32px minmax(0, 1fr) auto 24px");
    expect(css).toMatch(/\.vn-devtools-dock \{[\s\S]*overflow: hidden;/u);
    expect(css).toMatch(/\.vn-devtools-source-editor \{[\s\S]*overflow: auto;/u);
    expect(css).toMatch(/\.vn-devtools-panel-content \{[\s\S]*overflow: auto;/u);
    expect(css).toContain("content-visibility: auto");
  });

  it("keeps the 320–720px / 45vw boundary and explicit 420/320 density breakpoints", () => {
    expect(css).toContain("45vw");
    expect(css).toContain("@container vn-devtools (max-width: 519px)");
    expect(css).toContain("@container vn-devtools (max-width: 399px)");
    expect(css).toContain("@media (max-width: 899px)");
  });

  it("removes the old decorative/card vocabulary and uses library icons instead of glyph controls", () => {
    expect(css).not.toContain("radial-gradient");
    expect(css).not.toContain("linear-gradient");
    expect(css).not.toContain("vn-devtools-summary-grid");
    expect(componentSources).toContain("@phosphor-icons/react");
    for (const legacyGlyph of ["▶", "◆", "⌕", "→"]) {
      expect(componentSources).not.toContain(legacyGlyph);
    }
  });
});
