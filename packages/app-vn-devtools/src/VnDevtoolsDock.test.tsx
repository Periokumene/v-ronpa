import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { VnDevtoolsDock } from "./VnDevtoolsDock";
import type {
  VnDevtoolsActions,
  VnDevtoolsController,
  VnDevtoolsDecisionSubmission,
  VnDevtoolsSourceLocation
} from "./types";

type TestElement = ReactElement<Record<string, unknown>>;

describe("VnDevtoolsDock", () => {
  it("renders the six-region IDE shell, full source, Phosphor controls, state tree, and both accessible resizers", () => {
    const actions = createActions();
    const element = VnDevtoolsDock({ controller: createController(actions) });

    expect(findByTestId(element, "vn-devtools-dock")).toBeDefined();
    expect(findByTestId(element, "vn-devtools-file-bar")).toBeDefined();
    expect(findByTestId(element, "vn-devtools-command-strip")).toBeDefined();
    expect(findByTestId(element, "vn-devtools-symbols")).toBeDefined();
    expect(findByTestId(element, "vn-devtools-source-editor")).toBeDefined();
    expect(findByTestId(element, "vn-devtools-bottom-panel")?.props["data-active-panel"]).toBe("state");
    expect(findByTestId(element, "vn-devtools-status-bar")).toBeDefined();
    expect(findByTestId(element, "vn-devtools-resizer")?.props).toMatchObject({
      role: "separator",
      "aria-orientation": "vertical",
      "aria-valuemin": 320,
      "aria-valuemax": 720,
      "aria-valuenow": 420,
      tabIndex: 0
    });
    expect(findByTestId(element, "vn-devtools-panel-resizer")?.props).toMatchObject({
      role: "separator",
      "aria-orientation": "horizontal",
      "aria-valuemin": 120,
      "aria-valuemax": 360,
      "aria-valuenow": 180,
      tabIndex: 0
    });
    expect(findAllByDataAttribute(element, "data-line-id")).toHaveLength(3);
    expect(findByAriaLabel(element, "Current runtime position")).toBeDefined();
    expect(findByAriaLabel(element, "Pinned preview target")).toBeDefined();
    expect(collectText(findByTestId(element, "vn-devtools-panel-state")).join(" ")).toContain("background");

    const runToLine = findButtonByAriaLabel(
      findByTestId(element, "vn-devtools-line-line:dialog"),
      "Run to line 2"
    );
    (runToLine?.props as { onClick: () => void }).onClick();
    expect(actions.previewLine).toHaveBeenCalledWith("line:dialog");
    expect(collectText(runToLine).join("")).toBe("");
    expect(findButtonByAriaLabel(element, "Run to line 3")?.props.disabled).toBe(true);
  });

  it("keeps complete source during IDE Find and exposes exact match navigation instead of filtering lines", () => {
    const actions = createActions();
    const element = VnDevtoolsDock({
      controller: createController(actions, { searchQuery: "hello" })
    });

    expect(findAllByDataAttribute(element, "data-line-id")).toHaveLength(3);
    expect(findByTestId(element, "vn-devtools-find-count") && collectText(findByTestId(element, "vn-devtools-find-count")).join("")).toBe("1 / 1");
    expect(findByTestId(element, "vn-devtools-line-line:dialog")?.props["data-find-current"]).toBe("true");
    const marks = findAll(element, (node) => node.type === "mark");
    expect(marks.map((node) => collectText(node).join(""))).toEqual(["Hello"]);
    expect(marks[0]?.props["data-diagnostic-severity"]).toBe("error");

    const search = findByTestId(element, "vn-devtools-search");
    (search?.props as { onChange: (event: { currentTarget: { value: string } }) => void }).onChange({
      currentTarget: { value: "rain" }
    });
    expect(actions.search).toHaveBeenCalledWith("rain");
  });

  it("runs previewable source lines on double-click and ignores lines without a stable result", () => {
    const actions = createActions();
    const element = VnDevtoolsDock({ controller: createController(actions) });
    const previewableLine = findButtonByAriaLabel(element, "Select line 2");
    const unavailableLine = findButtonByAriaLabel(element, "Select line 3");

    expect(previewableLine?.props.title).toBe("Double-click to execute through this line and show the stable result");
    (previewableLine?.props as { onDoubleClick: () => void }).onDoubleClick();
    (unavailableLine?.props as { onDoubleClick: () => void }).onDoubleClick();

    expect(actions.previewLine).toHaveBeenCalledOnce();
    expect(actions.previewLine).toHaveBeenCalledWith("line:dialog");
  });

  it("wires Symbols, copy, collapse, panel tabs, and the default Preview primary action", () => {
    const actions = createActions();
    const element = VnDevtoolsDock({ controller: createController(actions) });

    const symbol = findButtonContaining(element, "StartLn 1");
    (symbol?.props as { onClick: (event: { currentTarget: { closest: () => null } }) => void }).onClick({
      currentTarget: { closest: () => null }
    });
    expect(actions.selectLine).toHaveBeenCalledWith("line:start");

    (findButtonByAriaLabel(element, "Copy location")?.props as { onClick: () => void }).onClick();
    expect(actions.copyLocation).toHaveBeenCalledWith({ scriptPath: "game-a/opening.nani", lineNumber: 2 });

    (findButtonByAriaLabel(element, "Collapse Nani Workbench")?.props as { onClick: () => void }).onClick();
    expect(actions.setCollapsed).toHaveBeenCalledWith(true);

    (findButtonContaining(element, "Problems1")?.props as { onClick: () => void }).onClick();
    expect(actions.updateLayout).toHaveBeenCalledWith({ activePanel: "problems", bottomPanelOpen: true });

    (findByTestId(element, "vn-devtools-primary-action")?.props as { onClick: () => void }).onClick();
    expect(actions.previewLine).toHaveBeenCalledWith("line:dialog");
  });

  it("exposes a keyboard-operated multi-script listbox without changing runtime state", async () => {
    const actions = createActions();
    const element = VnDevtoolsDock({
      controller: createController(actions, {
        scripts: [
          {
            scriptPath: "game-a/opening.nani",
            revision: "sha256:opening",
            viewed: true,
            runtime: true
          },
          {
            scriptPath: "game-a/chapter-02.nani",
            revision: "sha256:chapter-02",
            viewed: false,
            runtime: false,
            hasUpdateBadge: true
          }
        ]
      })
    });
    const listbox = findByAriaLabel(element, "VN scripts");
    expect(listbox?.props.role).toBe("listbox");
    const options = findAll(listbox, (node) => node.props.role === "option");
    expect(options).toHaveLength(2);
    expect(options.map((option) => option.props["aria-selected"])).toEqual([true, false]);
    expect(collectText(options[1]).join(" ")).toContain("Updated");

    const focus = vi.fn();
    const summaryFocus = vi.fn();
    const details = {
      open: true,
      querySelector: (selector: string) => selector.includes('data-script-index="1"')
        ? { focus }
        : selector === "summary"
          ? { focus: summaryFocus }
          : null
    };
    (options[0]?.props as { onKeyDown: (event: unknown) => void }).onKeyDown({
      key: "ArrowDown",
      preventDefault: vi.fn(),
      currentTarget: { closest: () => details }
    });
    await Promise.resolve();
    expect(focus).toHaveBeenCalledOnce();

    (options[1]?.props as { onClick: (event: unknown) => void }).onClick({
      currentTarget: { closest: () => details }
    });
    await Promise.resolve();
    expect(actions.selectScript).toHaveBeenCalledWith("game-a/chapter-02.nani");
    expect(details.open).toBe(false);
  });

  it("renders Problems and transient Branch panels with skinned semantic decision inputs", () => {
    const actions = createActions();
    const problems = VnDevtoolsDock({
      controller: createController(actions, {
        layout: { bottomPanelOpen: true, activePanel: "problems", bottomPanelHeight: 200 },
        status: { phase: "error", message: "Compiler rejected the candidate." }
      })
    });
    const problemText = collectText(findByTestId(problems, "vn-devtools-panel-problems")).join(" ");
    expect(problemText).toContain("Compiler rejected the candidate.");
    expect(problemText).toContain("Missing portrait asset");
    expect(problemText).toContain("Ln 2, Col 6");

    const decision = VnDevtoolsDock({
      controller: createController(actions, {
        decision: {
          kind: "choice",
          id: "choice:route",
          prompt: "Choose a route",
          options: [
            { id: "left", label: "Left", enabled: true },
            { id: "right", label: "Right", enabled: false, detail: "Condition failed" }
          ]
        }
      })
    });
    expect(findByTestId(decision, "vn-devtools-bottom-panel")?.props["data-active-panel"]).toBe("branch");
    expect(findByTestId(decision, "vn-devtools-decision")).toBeDefined();
    expect(findAll(decision, (node) => node.type === "input" && node.props.type === "radio")).toHaveLength(2);
    expect(findByTestId(decision, "vn-devtools-primary-action") && collectText(findByTestId(decision, "vn-devtools-primary-action")).join(" ")).toContain("Resolve decision");
  });

  it("switches the primary action between Cancel and disabled Finishing based on true cancellability", () => {
    const actions = createActions();
    const cancellable = VnDevtoolsDock({
      controller: createController(actions, {
        status: { phase: "materializing", cancellable: true }
      })
    });
    const cancel = findByTestId(cancellable, "vn-devtools-primary-action");
    expect(collectText(cancel).join(" ")).toContain("Cancel");
    (cancel?.props as { onClick: () => void }).onClick();
    expect(actions.cancelCandidate).toHaveBeenCalledOnce();

    const finishing = findByTestId(VnDevtoolsDock({
      controller: createController(actions, {
        status: { phase: "materializing", cancellable: false }
      })
    }), "vn-devtools-primary-action");
    expect(collectText(finishing).join(" ")).toContain("Finishing…");
    expect(finishing?.props.disabled).toBe(true);
  });

  it("supports IDE shortcuts and isolates Escape in decision, Symbols, Find, and cancellable busy priority", () => {
    const actions = createActions();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const focus = vi.fn();
    const closeDetails = { open: true, querySelector: () => ({ focus }) };
    const createEvent = (overrides: Record<string, unknown> = {}) => ({
      key: "Escape",
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      target: null,
      currentTarget: { querySelector: () => null, focus },
      preventDefault,
      stopPropagation,
      ...overrides
    });

    const decisionDock = findByTestId(VnDevtoolsDock({
      controller: createController(actions, {
        decision: { kind: "choice", id: "choice", prompt: "Pick", options: [] }
      })
    }), "vn-devtools-dock");
    (decisionDock?.props as { onKeyDownCapture: (value: unknown) => void }).onKeyDownCapture(createEvent());
    expect(actions.cancelDecision).toHaveBeenCalledOnce();

    const symbolDock = findByTestId(VnDevtoolsDock({ controller: createController(actions) }), "vn-devtools-dock");
    (symbolDock?.props as { onKeyDownCapture: (value: unknown) => void }).onKeyDownCapture(createEvent({
      currentTarget: {
        querySelector: (selector: string) => selector.includes("[open]") ? closeDetails : null,
        focus
      }
    }));
    expect(closeDetails.open).toBe(false);

    const searchDock = findByTestId(VnDevtoolsDock({
      controller: createController(actions, { searchQuery: "hello" })
    }), "vn-devtools-dock");
    (searchDock?.props as { onKeyDownCapture: (value: unknown) => void }).onKeyDownCapture(createEvent());
    expect(actions.search).toHaveBeenCalledWith("");

    const busyDock = findByTestId(VnDevtoolsDock({
      controller: createController(actions, { status: { phase: "updating", cancellable: true } })
    }), "vn-devtools-dock");
    (busyDock?.props as { onKeyDownCapture: (value: unknown) => void }).onKeyDownCapture(createEvent());
    expect(actions.cancelCandidate).toHaveBeenCalled();

    const previewDock = findByTestId(VnDevtoolsDock({ controller: createController(actions) }), "vn-devtools-dock");
    (previewDock?.props as { onKeyDownCapture: (value: unknown) => void }).onKeyDownCapture(createEvent({
      key: "Enter",
      metaKey: true
    }));
    expect(actions.previewLine).toHaveBeenCalledWith("line:dialog");

    (previewDock?.props as { onKeyDownCapture: (value: unknown) => void }).onKeyDownCapture(createEvent({
      key: "j",
      ctrlKey: true
    }));
    expect(actions.updateLayout).toHaveBeenCalledWith({ bottomPanelOpen: false });
  });

  it("collapses to an icon control with status and update badges", () => {
    const actions = createActions();
    const element = VnDevtoolsDock({
      controller: createController(actions, { collapsed: true, hasUpdateBadge: true })
    });
    const button = findByTestId(element, "vn-devtools-collapsed-button");
    expect(button?.props).toMatchObject({ "data-status": "ready" });
    expect(String(button?.props["aria-label"])).toContain("1 errors");
    (button?.props as { onClick: () => void }).onClick();
    expect(actions.setCollapsed).toHaveBeenCalledWith(false);
  });
});

function createController(
  actions: VnDevtoolsActions,
  overrides: Partial<VnDevtoolsController> = {}
): VnDevtoolsController {
  return {
    entryId: "opening",
    viewedScriptPath: "game-a/opening.nani",
    runtimeScriptPath: "game-a/opening.nani",
    scripts: [{
      scriptPath: "game-a/opening.nani",
      revision: "sha256:1234567890abcdef",
      viewed: true,
      runtime: true
    }],
    lines: [
      { id: "line:start", lineNumber: 1, sourceText: "#Start", label: "Start", previewability: "previewable" },
      {
        id: "line:dialog",
        lineNumber: 2,
        sourceText: "nar: Hello",
        command: "print",
        previewability: "previewable",
        current: true,
        pinned: true,
        diagnostics: [{
          id: "missing-portrait",
          severity: "error",
          message: "Missing portrait asset",
          lineId: "line:dialog",
          lineNumber: 2,
          sourceRange: { start: 5, end: 10 }
        }]
      },
      { id: "line:end", lineNumber: 3, sourceText: "@end", command: "end", previewability: "no-stable-result" }
    ],
    selectedLineId: "line:dialog",
    searchQuery: "",
    collapsed: false,
    width: 420,
    layout: { bottomPanelOpen: true, activePanel: "state", bottomPanelHeight: 180 },
    status: { phase: "ready", message: "Pinned target is stable." },
    diagnostics: [
      {
        id: "missing-portrait",
        severity: "error",
        message: "Missing portrait asset",
        lineId: "line:dialog",
        lineNumber: 2,
        columnNumber: 6,
        span: { start: 12, end: 17 }
      }
    ],
    summaries: {
      story: [{ label: "pointer", value: 1, tone: "accent" }],
      pixi: [{ label: "background", value: "bg:rain" }],
      ui: [{ label: "dialog", value: true }],
      media: []
    },
    actions,
    ...overrides
  };
}

function createActions(): VnDevtoolsActions {
  return {
    selectScript: vi.fn<(scriptPath: string) => void>(),
    selectLine: vi.fn<(lineId: string) => void>(),
    previewLine: vi.fn<(lineId: string) => void>(),
    pinCurrent: vi.fn<() => void>(),
    unpin: vi.fn<() => void>(),
    setCollapsed: vi.fn<(collapsed: boolean) => void>(),
    resize: vi.fn<(width: number) => void>(),
    updateLayout: vi.fn<VnDevtoolsActions["updateLayout"]>(),
    search: vi.fn<(query: string) => void>(),
    submitDecision: vi.fn<(submission: VnDevtoolsDecisionSubmission) => void>(),
    cancelDecision: vi.fn<() => void>(),
    cancelCandidate: vi.fn<() => void>(),
    copyLocation: vi.fn<(location: VnDevtoolsSourceLocation) => void>()
  };
}

function findByTestId(node: ReactNode, testId: string): TestElement | undefined {
  return find(node, (element) => element.props["data-testid"] === testId);
}

function findButtonContaining(node: ReactNode, text: string): TestElement | undefined {
  return find(node, (element) => element.type === "button" && collectText(element).join("").includes(text));
}

function findButtonByAriaLabel(node: ReactNode, label: string): TestElement | undefined {
  return find(node, (element) => element.type === "button" && element.props["aria-label"] === label);
}

function findByAriaLabel(node: ReactNode, label: string): TestElement | undefined {
  return find(node, (element) => element.props["aria-label"] === label);
}

function findAllByDataAttribute(node: ReactNode, attribute: string): TestElement[] {
  return findAll(node, (element) => element.props[attribute] !== undefined);
}

function find(node: ReactNode, predicate: (element: TestElement) => boolean): TestElement | undefined {
  return findAll(node, predicate)[0];
}

function findAll(node: ReactNode, predicate: (element: TestElement) => boolean): TestElement[] {
  const matches: TestElement[] = [];
  visit(node, (current) => {
    if (!isValidElement<Record<string, unknown>>(current)) return;
    if (predicate(current)) matches.push(current);
  });
  return matches;
}

function collectText(node: ReactNode): string[] {
  const values: string[] = [];
  visit(node, (current) => {
    if (typeof current === "string" || typeof current === "number") values.push(String(current));
  });
  return values;
}

function visit(node: ReactNode, visitor: (node: ReactNode) => void) {
  visitor(node);
  if (!isValidElement<Record<string, unknown>>(node)) return;
  if (typeof node.type === "function") {
    const renderFunctionComponent = node.type as (props: Record<string, unknown>) => ReactNode;
    visit(renderFunctionComponent(node.props), visitor);
    return;
  }
  Children.forEach((node.props as { children?: ReactNode }).children, (child) => visit(child, visitor));
}
