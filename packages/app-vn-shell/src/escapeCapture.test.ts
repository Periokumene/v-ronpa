import { describe, expect, it, vi } from "vitest";
import { createEscapeCaptureRef } from "./escapeCapture";

describe("nested shell Escape capture", () => {
  it("yields to a focused external input boundary before consuming Escape", () => {
    const onEscape = vi.fn();
    const listener = mountEscapeCapture(onEscape);
    const event = keyboardEvent({ insideBoundary: true });

    listener(event);

    expect(onEscape).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
  });

  it("keeps modal Escape exclusive for ordinary game targets", () => {
    const onEscape = vi.fn();
    const listener = mountEscapeCapture(onEscape);
    const event = keyboardEvent({ insideBoundary: false });

    listener(event);

    expect(onEscape).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
  });
});

function mountEscapeCapture(onEscape: () => void): (event: KeyboardEvent) => void {
  let listener: ((event: KeyboardEvent) => void) | undefined;
  const ref = createEscapeCaptureRef(onEscape);
  ref?.({
    ownerDocument: {
      defaultView: {
        addEventListener: vi.fn((_type: string, next: (event: KeyboardEvent) => void) => {
          listener = next;
        }),
        removeEventListener: vi.fn()
      }
    }
  } as unknown as HTMLElement);
  if (!listener) throw new Error("Expected Escape capture listener to mount.");
  return listener;
}

function keyboardEvent({ insideBoundary }: { insideBoundary: boolean }) {
  return {
    key: "Escape",
    target: {
      closest: vi.fn(() => insideBoundary ? ({} as Element) : null)
    },
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    stopPropagation: vi.fn()
  } as unknown as KeyboardEvent & {
    preventDefault: ReturnType<typeof vi.fn>;
    stopImmediatePropagation: ReturnType<typeof vi.fn>;
    stopPropagation: ReturnType<typeof vi.fn>;
  };
}
