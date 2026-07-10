import type { RefCallback } from "react";

/** Captures Escape for a nested modal before the outer shell closes its overlay. */
export function createEscapeCaptureRef(onEscape: (() => void) | undefined): RefCallback<HTMLElement> | undefined {
  if (!onEscape) return undefined;
  return (element) => {
    const view = element?.ownerDocument.defaultView;
    if (!view) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onEscape?.();
    }
    view.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => view.removeEventListener("keydown", handleKeyDown, { capture: true });
  };
}
