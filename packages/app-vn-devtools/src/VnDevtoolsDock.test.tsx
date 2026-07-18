import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { VnDevtoolsDock } from "./VnDevtoolsDock";
import type { VnDevtoolsActions, VnDevtoolsController, VnDevtoolsDecisionSubmission, VnDevtoolsSourceLocation } from "./types";

type TestElement = ReactElement<Record<string, unknown>>;

describe("VnDevtoolsDock", () => {
  it("renders source navigation, explicit preview controls, markers, diagnostics, state, and an accessible resizer", () => {
    const actions = createActions();
    const element = VnDevtoolsDock({ controller: createController(actions) });

    expect(findByTestId(element, "vn-devtools-dock")).toBeDefined();
    expect(findByTestId(element, "vn-devtools-resizer")?.props).toMatchObject({
      role: "separator",
      "aria-orientation": "vertical",
      "aria-valuemin": 320,
      "aria-valuemax": 720,
      "aria-valuenow": 420,
      tabIndex: 0
    });
    expect(findByTestId(element, "vn-devtools-line-line:dialog")?.props).toMatchObject({
      "data-previewability": "previewable"
    });
    expect(findByAriaLabel(element, "Current runtime position")).toBeDefined();
    expect(findByAriaLabel(element, "Pinned preview target")).toBeDefined();
    expect(collectText(element).join(" ")).toContain("Missing portrait asset");
    expect(collectText(element).join(" ")).toContain("Stable state");
    expect(collectText(element).join(" ")).toContain("background");

    const preview = findButtonWithin(findByTestId(element, "vn-devtools-line-line:dialog"), "Preview");
    expect(preview).toBeDefined();
    (preview?.props as { onClick: () => void }).onClick();
    expect(actions.previewLine).toHaveBeenCalledWith("line:dialog");

    const endPreview = findButtonWithin(findByTestId(element, "vn-devtools-line-line:end"), "Preview");
    expect(endPreview?.props.disabled).toBe(true);
  });

  it("renders branch decisions and wires label selection, search, collapse, and copy actions", () => {
    const actions = createActions();
    const element = VnDevtoolsDock({
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

    expect(findByTestId(element, "vn-devtools-decision")).toBeDefined();
    const labelButton = findButtonContaining(element, "Start1");
    (labelButton?.props as { onClick: () => void }).onClick();
    expect(actions.selectLine).toHaveBeenCalledWith("line:start");

    const search = findByTestId(element, "vn-devtools-search");
    (search?.props as { onChange: (event: { currentTarget: { value: string } }) => void }).onChange({ currentTarget: { value: "rain" } });
    expect(actions.search).toHaveBeenCalledWith("rain");

    const copy = findButton(element, "Copy path:line");
    (copy?.props as { onClick: () => void }).onClick();
    expect(actions.copyLocation).toHaveBeenCalledWith({ scriptPath: "game-a/opening.nani", lineNumber: 2 });

    const collapse = findButtonByAriaLabel(element, "Collapse Nani Workbench");
    (collapse?.props as { onClick: () => void }).onClick();
    expect(actions.setCollapsed).toHaveBeenCalledWith(true);
  });

  it("collapses to a small status-bearing button that restores the Dock", () => {
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

  it("supports keyboard preview and focuses search without leaking shortcuts to the game shell", () => {
    const actions = createActions();
    const dock = findByTestId(VnDevtoolsDock({ controller: createController(actions) }), "vn-devtools-dock");
    const onKeyDown = (dock?.props as { onKeyDownCapture: (event: unknown) => void }).onKeyDownCapture;
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const focus = vi.fn();

    onKeyDown({
      key: "Enter",
      metaKey: true,
      ctrlKey: false,
      target: null,
      currentTarget: { querySelector: () => ({ focus }) },
      preventDefault,
      stopPropagation
    });
    expect(actions.previewLine).toHaveBeenCalledWith("line:dialog");

    onKeyDown({
      key: "/",
      metaKey: false,
      ctrlKey: false,
      target: null,
      currentTarget: { querySelector: () => ({ focus }) },
      preventDefault,
      stopPropagation
    });
    expect(focus).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(stopPropagation).toHaveBeenCalledTimes(2);
  });

  it("gives Escape priority to a decision, then search, before cancelling candidate work", () => {
    const actions = createActions();
    const choice = {
      kind: "choice" as const,
      id: "choice:route",
      prompt: "Choose a route",
      options: [{ id: "left", label: "Left", enabled: true }]
    };
    const decisionDock = findByTestId(VnDevtoolsDock({
      controller: createController(actions, {
        decision: choice,
        searchQuery: "rain",
        status: { phase: "materializing" }
      })
    }), "vn-devtools-dock");
    const event = {
      key: "Escape",
      metaKey: false,
      ctrlKey: false,
      target: null,
      currentTarget: { querySelector: () => null },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    };
    (decisionDock?.props as { onKeyDownCapture: (value: unknown) => void }).onKeyDownCapture(event);
    expect(actions.cancelDecision).toHaveBeenCalledOnce();
    expect(actions.search).not.toHaveBeenCalled();
    expect(actions.cancelCandidate).not.toHaveBeenCalled();

    const searchDock = findByTestId(VnDevtoolsDock({
      controller: createController(actions, {
        searchQuery: "rain",
        status: { phase: "materializing" }
      })
    }), "vn-devtools-dock");
    (searchDock?.props as { onKeyDownCapture: (value: unknown) => void }).onKeyDownCapture(event);
    expect(actions.search).toHaveBeenCalledWith("");
    expect(actions.cancelCandidate).not.toHaveBeenCalled();
  });

  it("isolates Escape and cancels an in-flight candidate task", () => {
    const actions = createActions();
    const element = VnDevtoolsDock({
      controller: createController(actions, { status: { phase: "materializing" } })
    });
    const dock = findByTestId(element, "vn-devtools-dock");
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    (dock?.props as { onKeyDownCapture: (event: unknown) => void }).onKeyDownCapture({
      key: "Escape",
      metaKey: false,
      ctrlKey: false,
      target: null,
      currentTarget: { querySelector: () => null },
      preventDefault,
      stopPropagation
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(actions.cancelCandidate).toHaveBeenCalledOnce();
  });
});

function createController(
  actions: VnDevtoolsActions,
  overrides: Partial<VnDevtoolsController> = {}
): VnDevtoolsController {
  return {
    entryId: "opening",
    scriptPath: "game-a/opening.nani",
    scriptRevision: "sha256:1234567890abcdef",
    lines: [
      {
        id: "line:start",
        lineNumber: 1,
        sourceText: "#Start",
        label: "Start",
        previewability: "previewable"
      },
      {
        id: "line:dialog",
        lineNumber: 2,
        sourceText: "nar: Hello",
        command: "print",
        previewability: "previewable",
        current: true,
        pinned: true
      },
      {
        id: "line:end",
        lineNumber: 3,
        sourceText: "@end",
        command: "end",
        previewability: "no-stable-result"
      }
    ],
    selectedLineId: "line:dialog",
    searchQuery: "",
    collapsed: false,
    width: 420,
    status: { phase: "ready", message: "Pinned target is stable." },
    diagnostics: [
      { id: "missing-portrait", severity: "error", message: "Missing portrait asset", lineId: "line:dialog", lineNumber: 2 }
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

function createActions() {
  return {
    selectLine: vi.fn<(lineId: string) => void>(),
    previewLine: vi.fn<(lineId: string) => void>(),
    pinCurrent: vi.fn<() => void>(),
    unpin: vi.fn<() => void>(),
    setCollapsed: vi.fn<(collapsed: boolean) => void>(),
    resize: vi.fn<(width: number) => void>(),
    search: vi.fn<(query: string) => void>(),
    submitDecision: vi.fn<(submission: VnDevtoolsDecisionSubmission) => void>(),
    cancelDecision: vi.fn<() => void>(),
    cancelCandidate: vi.fn<() => void>(),
    copyLocation: vi.fn<(location: VnDevtoolsSourceLocation) => void>()
  } satisfies VnDevtoolsActions;
}

function findByTestId(node: ReactNode, testId: string): TestElement | undefined {
  return find(node, (element) => element.props["data-testid"] === testId);
}

function findButton(node: ReactNode, text: string, predicate: (button: TestElement) => boolean = () => true): TestElement | undefined {
  return find(node, (element) => element.type === "button" && collectText(element).join("") === text && predicate(element));
}

function findButtonContaining(node: ReactNode, text: string): TestElement | undefined {
  return find(node, (element) => element.type === "button" && collectText(element).join("").includes(text));
}

function findButtonWithin(node: ReactNode, text: string): TestElement | undefined {
  return findButton(node, text);
}

function findButtonByAriaLabel(node: ReactNode, label: string): TestElement | undefined {
  return find(node, (element) => element.type === "button" && element.props["aria-label"] === label);
}

function findByAriaLabel(node: ReactNode, label: string): TestElement | undefined {
  return find(node, (element) => element.props["aria-label"] === label);
}

function find(node: ReactNode, predicate: (element: TestElement) => boolean): TestElement | undefined {
  let match: TestElement | undefined;
  visit(node, (current) => {
    if (match || !isValidElement<Record<string, unknown>>(current)) return;
    if (predicate(current)) match = current;
  });
  return match;
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
