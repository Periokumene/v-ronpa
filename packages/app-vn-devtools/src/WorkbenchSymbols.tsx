import { CaretRight, Hash, MagnifyingGlass } from "@phosphor-icons/react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { findNearestVnDevtoolsLabel } from "./sourceViewModel";
import type { VnDevtoolsController, VnDevtoolsSourceLine } from "./types";

export function WorkbenchSymbols({ controller }: { controller: VnDevtoolsController }) {
  const selectedLine = controller.lines.find((line) => line.id === controller.selectedLineId);
  const nearestLabel = findNearestVnDevtoolsLabel(controller.lines, selectedLine?.lineNumber);
  const labels = controller.lines.filter((line) => line.label !== undefined);

  return (
    <nav className="vn-devtools-symbols" aria-label="Source symbols">
      <details data-testid="vn-devtools-symbols">
        <summary aria-label="Open source symbols" title="Go to symbol (Cmd/Ctrl+Shift+O)">
          <span>Source</span>
          <CaretRight size={11} weight="bold" aria-hidden="true" />
          <Hash size={12} weight="bold" aria-hidden="true" />
          <strong>{nearestLabel?.label ?? "No label"}</strong>
          <CaretRight size={11} weight="bold" aria-hidden="true" />
          <span>Ln {selectedLine?.lineNumber ?? "–"}</span>
        </summary>
        <div className="vn-devtools-symbol-popover" role="dialog" aria-label="Go to symbol">
          <label>
            <MagnifyingGlass size={14} aria-hidden="true" />
            <span className="vn-devtools-visually-hidden">Filter source symbols</span>
            <input
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              type="search"
              placeholder="Filter symbols…"
              data-testid="vn-devtools-symbol-search"
              enterKeyHint="search"
              onChange={filterSymbols}
              onKeyDown={handleSymbolKeyboard}
              spellCheck={false}
            />
          </label>
          <div className="vn-devtools-symbol-list" role="listbox" aria-label="Nani labels">
            {labels.map((line) => (
              <button
                key={line.id}
                type="button"
                role="option"
                data-symbol-option="true"
                data-label-search={(line.label ?? "").toLocaleLowerCase()}
                onKeyDown={handleSymbolOptionKeyboard}
                onClick={(event) => {
                  controller.actions.selectLine(line.id);
                  revealLine(line.id);
                  const details = event.currentTarget.closest("details");
                  if (details) details.open = false;
                }}
              >
                <Hash size={13} weight="bold" aria-hidden="true" />
                <span>{line.label}</span>
                <small>Ln {line.lineNumber}</small>
              </button>
            ))}
          </div>
          {labels.length === 0 && <p className="vn-devtools-empty is-compact">No labels in this source.</p>}
        </div>
      </details>
    </nav>
  );
}

function filterSymbols(event: ChangeEvent<HTMLInputElement>) {
  const query = event.currentTarget.value.trim().toLocaleLowerCase();
  const root = event.currentTarget.closest(".vn-devtools-symbol-popover");
  root?.querySelectorAll<HTMLButtonElement>("[data-symbol-option]").forEach((option) => {
    option.hidden = query.length > 0 && !option.dataset.labelSearch?.includes(query);
  });
}

function handleSymbolKeyboard(event: KeyboardEvent<HTMLInputElement>) {
  const root = event.currentTarget.closest(".vn-devtools-symbol-popover");
  const options = root
    ? [...root.querySelectorAll<HTMLButtonElement>("[data-symbol-option]:not([hidden])")]
    : [];
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    const details = event.currentTarget.closest("details");
    if (details) details.open = false;
    details?.querySelector<HTMLElement>("summary")?.focus();
    return;
  }
  let target: HTMLButtonElement | undefined;
  if (event.key === "ArrowDown" || event.key === "Home") target = options[0];
  if (event.key === "ArrowUp" || event.key === "End") target = options.at(-1);
  if (event.key === "Enter" && options.length === 1) target = options[0];
  if (!target) return;
  event.preventDefault();
  if (event.key === "Enter") target.click();
  else target.focus();
}

export function handleSymbolOptionKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
  if (!event.key.startsWith("Arrow") && event.key !== "Home" && event.key !== "End" && event.key !== "Escape") {
    return;
  }
  const popover = event.currentTarget.closest(".vn-devtools-symbol-popover");
  const options = popover
    ? [...popover.querySelectorAll<HTMLButtonElement>("[data-symbol-option]:not([hidden])")]
    : [];
  if (event.key === "Escape") {
    event.preventDefault();
    const details = event.currentTarget.closest("details");
    if (details) details.open = false;
    details?.querySelector<HTMLElement>("summary")?.focus();
    return;
  }
  const currentIndex = options.indexOf(event.currentTarget);
  let nextIndex = currentIndex;
  if (event.key === "ArrowDown") nextIndex = Math.min(options.length - 1, currentIndex + 1);
  if (event.key === "ArrowUp") nextIndex = Math.max(0, currentIndex - 1);
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = options.length - 1;
  if (nextIndex === currentIndex || !options[nextIndex]) return;
  event.preventDefault();
  options[nextIndex]?.focus();
}

function revealLine(lineId: string) {
  if (typeof document === "undefined") return;
  const schedule = typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (callback: FrameRequestCallback) => window.setTimeout(callback, 0);
  schedule(() => document.querySelector<HTMLElement>(`[data-line-id="${CSS.escape(lineId)}"]`)
    ?.scrollIntoView({ block: "center" }));
}
