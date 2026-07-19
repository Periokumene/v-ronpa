import { describe, expect, it } from "vitest";
import {
  dragEventHasFiles,
  dragEventHasNonPlainText,
  eventTargetsEditable,
  installWebGameDocumentPolicy
} from "./webGameDocumentPolicy";

describe("web game document policy", () => {
  it("installs one shared listener set and restores the document after the final release", () => {
    const document = new FakeDocument("previous");

    const releaseFirst = installWebGameDocumentPolicy(document as unknown as Document);
    const releaseSecond = installWebGameDocumentPolicy(document as unknown as Document);

    expect(document.rootAttribute).toBe("active");
    expect(document.listenerCount()).toBe(5);

    releaseFirst();
    expect(document.rootAttribute).toBe("active");
    expect(document.listenerCount()).toBe(5);

    releaseSecond();
    releaseSecond();
    expect(document.rootAttribute).toBe("previous");
    expect(document.listenerCount()).toBe(0);
  });

  it("blocks selection, context menus, and native drags outside editable controls", () => {
    const document = new FakeDocument();
    const release = installWebGameDocumentPolicy(document as unknown as Document);
    const staticTarget = fakeElement("div");
    const inputTarget = fakeElement("input", "text");

    for (const type of ["contextmenu", "selectstart", "dragstart"]) {
      const blocked = document.dispatch(type, fakeEvent([staticTarget]));
      const editable = document.dispatch(type, fakeEvent([inputTarget]));
      expect(blocked.defaultPrevented, type).toBe(true);
      expect(editable.defaultPrevented, type).toBe(false);
    }

    release();
  });

  it("blocks file drops everywhere and non-file drops outside editable controls", () => {
    const document = new FakeDocument();
    const release = installWebGameDocumentPolicy(document as unknown as Document);
    const staticTarget = fakeElement("div");
    const inputTarget = fakeElement("input", "search");

    expect(document.dispatch("dragover", fakeEvent([inputTarget], ["Files"])).defaultPrevented).toBe(true);
    expect(document.dispatch("drop", fakeEvent([inputTarget], ["text/plain"])).defaultPrevented).toBe(false);
    expect(document.dispatch("drop", fakeEvent([inputTarget], ["text/plain", "text/uri-list"])).defaultPrevented).toBe(true);
    expect(document.dispatch("drop", fakeEvent([inputTarget], ["text/html"])).defaultPrevented).toBe(true);
    expect(document.dispatch("drop", fakeEvent([staticTarget], ["text/plain"])).defaultPrevented).toBe(true);
    expect(document.dispatch("drop", fakeEvent([staticTarget])).defaultPrevented).toBe(true);

    release();
  });

  it("recognizes only text-editable input types and treats missing drag data as file-free", () => {
    expect(eventTargetsEditable(fakeEvent([fakeElement("input", "number")]))).toBe(true);
    expect(eventTargetsEditable(fakeEvent([fakeElement("textarea")]))).toBe(true);
    expect(eventTargetsEditable(fakeEvent([fakeElement("input", "radio")]))).toBe(false);
    expect(eventTargetsEditable(fakeEvent([fakeElement("button")]))).toBe(false);
    expect(dragEventHasFiles(fakeEvent([fakeElement("div")]) as unknown as Event)).toBe(false);
    expect(dragEventHasNonPlainText(fakeEvent([fakeElement("div")]) as unknown as Event)).toBe(false);
  });
});

class FakeDocument {
  readonly listeners = new Map<string, Set<EventListener>>();
  rootAttribute: string | null;
  readonly documentElement = {
    getAttribute: (_name: string) => this.rootAttribute,
    removeAttribute: (_name: string) => {
      this.rootAttribute = null;
    },
    setAttribute: (_name: string, value: string) => {
      this.rootAttribute = value;
    }
  };

  constructor(rootAttribute: string | null = null) {
    this.rootAttribute = rootAttribute;
  }

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0);
  }

  dispatch(type: string, event: FakeEvent): FakeEvent {
    for (const listener of this.listeners.get(type) ?? []) listener(event as unknown as Event);
    return event;
  }
}

interface FakeEvent extends Pick<Event, "composedPath" | "target"> {
  dataTransfer?: { types: string[] };
  defaultPrevented: boolean;
  preventDefault(): void;
}

function fakeEvent(path: EventTarget[], types?: string[]): FakeEvent {
  return {
    composedPath: () => path,
    ...(types ? { dataTransfer: { types } } : {}),
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    target: path[0] ?? null
  };
}

function fakeElement(tagName: string, type?: string): EventTarget {
  return {
    tagName: tagName.toUpperCase(),
    ...(type ? { type } : {}),
    getAttribute(name: string) {
      return name === "contenteditable" ? null : null;
    }
  } as unknown as EventTarget;
}
