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

  it("reserves contextual line space and reveals low-frequency controls without layout shift", () => {
    expect(css).toMatch(/\.vn-devtools-line-explanation \{[\s\S]*min-height: 19px;[\s\S]*visibility: hidden;/u);
    expect(css).toMatch(/\.vn-devtools-source-line\.is-selected \.vn-devtools-line-explanation,[\s\S]*visibility: visible;/u);
    expect(css).toMatch(/\.vn-devtools-collapsed-button \{[\s\S]*opacity: 0;/u);
    expect(css).toMatch(/\.vn-devtools-collapsed-button:hover,[\s\S]*opacity: 1;/u);
  });

  it("gives labels their own syntax color and keeps line execution icon-only at every width", () => {
    expect(css).toMatch(/\.vn-devtools-line-select \.syntax-label \{[\s\S]*var\(--vn-devtools-label\);/u);
    expect(css).toMatch(/\.vn-devtools-line-select \.syntax-comment \{[\s\S]*var\(--vn-devtools-comment\);/u);
    expect(css).toMatch(/\.vn-devtools-dock \.vn-devtools-preview-button \{[\s\S]*min-height: 24px;[\s\S]*max-height: 24px;/u);
    expect(css).toMatch(/\.vn-devtools-dock \.vn-devtools-find-trigger \{[\s\S]*min-height: 28px;[\s\S]*max-height: 28px;/u);
    expect(componentSources).not.toContain("<span>Run to line</span>");
    expect(componentSources).not.toContain('className="vn-devtools-tool-label">Find</span>');
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
