import { describe, expect, it } from "vitest";
import { createVnDevtoolsScriptAuthorityCoordinator } from "./scriptAuthorityCoordinator";

describe("VN devtools per-script authority", () => {
  it("keeps preview authorization and diagnostics isolated while viewing another script", () => {
    const authority = createVnDevtoolsScriptAuthorityCoordinator("opening.nani");
    authority.authorizePreview("opening.nani");
    authority.cache("chapter-02.nani", {
      display: { access: "read-only", inspection: {} as never },
      diagnostics: [{ id: "broken", severity: "error", code: "broken", message: "Broken chapter." }],
      status: { phase: "error" }
    });
    authority.view("chapter-02.nani");

    expect(authority.canPreview("chapter-02.nani")).toBe(false);
    expect(authority.canPreview("opening.nani")).toBe(true);
    expect(authority.cached("chapter-02.nani")?.status.phase).toBe("error");
    expect(authority.cached("opening.nani")).toBeUndefined();
  });

  it("tracks installed and expected host identities by script without fixed-point input", () => {
    const authority = createVnDevtoolsScriptAuthorityCoordinator("opening.nani");
    authority.install("opening.nani", "opening:1");
    authority.expectHost("chapter:2");
    expect(authority.observeHost("chapter-02.nani", "chapter:2")).toBe(true);
    expect(authority.installedIdentity("opening.nani")).toBe("opening:1");
    expect(authority.installedIdentity("chapter-02.nani")).toBe("chapter:2");
    expect(authority.observeHost("chapter-02.nani", "chapter:2")).toBe(false);
  });

  it("keeps update badges scoped to the updated catalog record", () => {
    const authority = createVnDevtoolsScriptAuthorityCoordinator("opening.nani");
    authority.markUpdated("chapter-02.nani");
    expect([...authority.updatedScriptPaths()]).toEqual(["chapter-02.nani"]);
    authority.clearUpdated("opening.nani");
    expect([...authority.updatedScriptPaths()]).toEqual(["chapter-02.nani"]);
    authority.clearUpdated("chapter-02.nani");
    expect(authority.updatedScriptPaths().size).toBe(0);
  });

  it("supersedes source work only within the same script", () => {
    const authority = createVnDevtoolsScriptAuthorityCoordinator("opening.nani");
    const opening = authority.beginTask("opening.nani");
    const chapter = authority.beginTask("chapter-02.nani");
    const newerChapter = authority.beginTask("chapter-02.nani");
    expect(opening.isCurrent()).toBe(true);
    expect(chapter.isCurrent()).toBe(false);
    expect(chapter.signal.aborted).toBe(true);
    expect(newerChapter.isCurrent()).toBe(true);
    authority.cancelTasks();
    expect(opening.isCurrent()).toBe(false);
    expect(newerChapter.isCurrent()).toBe(false);
  });
});
