import {
  ArrowRight,
  Diamond,
  GitBranch,
  Info,
  Play,
  Prohibit,
  WarningCircle
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import {
  highlightVnDevtoolsSource,
  type VnDevtoolsFindMatch,
  type VnDevtoolsSourceRange,
  type VnDevtoolsSyntaxTokenKind
} from "./sourceViewModel";
import {
  canPreviewVnDevtoolsLine,
  type VnDevtoolsController,
  type VnDevtoolsSourceLine
} from "./types";

export interface WorkbenchSourceViewProps {
  controller: VnDevtoolsController;
  matchesByLineId: ReadonlyMap<string, VnDevtoolsFindMatch>;
  currentMatchLineId?: string;
}

export function WorkbenchSourceView({
  controller,
  matchesByLineId,
  currentMatchLineId
}: WorkbenchSourceViewProps) {
  return (
    <section
      className="vn-devtools-source-editor"
      aria-label="Nani source"
      data-testid="vn-devtools-source-editor"
    >
      {controller.lines.length === 0 ? (
        <p className="vn-devtools-empty">Source is not available yet.</p>
      ) : (
        <ol className="vn-devtools-source-list" data-testid="vn-devtools-source-list">
          {controller.lines.map((line) => (
            <SourceLine
              key={line.id}
              line={line}
              {...(matchesByLineId.get(line.id) ? { match: matchesByLineId.get(line.id)! } : {})}
              currentFindMatch={line.id === currentMatchLineId}
              selected={line.id === controller.selectedLineId}
              onSelect={controller.actions.selectLine}
              onPreview={controller.actions.previewLine}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

interface SourceLineProps {
  line: VnDevtoolsSourceLine;
  match?: VnDevtoolsFindMatch;
  currentFindMatch: boolean;
  selected: boolean;
  onSelect: (lineId: string) => void;
  onPreview: (lineId: string) => void;
}

function SourceLine({ line, match, currentFindMatch, selected, onSelect, onPreview }: SourceLineProps) {
  const previewable = canPreviewVnDevtoolsLine(line);
  const classes = [
    "vn-devtools-source-line",
    selected && "is-selected",
    line.current && "is-current",
    line.pinned && "is-pinned",
    match && "has-find-match",
    currentFindMatch && "is-current-find-match"
  ].filter(Boolean).join(" ");
  const previewDescription = describePreviewability(line);

  return (
    <li
      className={classes}
      data-line-id={line.id}
      data-previewability={line.previewability}
      data-testid={`vn-devtools-line-${line.id}`}
      data-find-current={currentFindMatch ? "true" : undefined}
      aria-current={line.current ? "step" : undefined}
    >
      <button
        type="button"
        className="vn-devtools-line-select"
        aria-label={`Select line ${line.lineNumber}${line.label ? `, label ${line.label}` : ""}`}
        onClick={() => onSelect(line.id)}
      >
        <span className="vn-devtools-line-gutter">
          <span className="vn-devtools-line-number">{line.lineNumber}</span>
          <span className="vn-devtools-line-markers">
            {line.current && <ArrowRight size={12} weight="bold" aria-label="Current runtime position" />}
            {line.pinned && <Diamond size={10} weight="fill" aria-label="Pinned preview target" />}
            <LineSignal line={line} />
          </span>
        </span>
        <code>{renderSourceText(line.sourceText, match?.sourceRanges ?? [])}</code>
      </button>
      <button
        type="button"
        className="vn-devtools-preview-button"
        disabled={!previewable}
        aria-label={`Run to line ${line.lineNumber}`}
        title={previewable ? "Execute through this line and show the stable result" : previewDescription}
        onClick={() => onPreview(line.id)}
      >
        <Play size={13} weight="fill" aria-hidden="true" />
        <span>Run to line</span>
      </button>
      {previewDescription && line.previewability !== "previewable" && (
        <span className="vn-devtools-line-explanation" role="note">
          {previewDescription}
        </span>
      )}
    </li>
  );
}

function LineSignal({ line }: { line: VnDevtoolsSourceLine }) {
  const diagnostic = line.diagnostics?.find((item) => item.severity === "error")
    ?? line.diagnostics?.find((item) => item.severity === "warning")
    ?? line.diagnostics?.[0];
  if (diagnostic?.severity === "error") {
    return <Prohibit size={11} weight="fill" aria-label="Error" />;
  }
  if (diagnostic?.severity === "warning") {
    return <WarningCircle size={11} weight="fill" aria-label="Warning" />;
  }
  if (diagnostic) return <Info size={11} weight="fill" aria-label="Information" />;
  if (line.previewability === "decision-required") {
    return <GitBranch size={11} weight="bold" aria-label="Decision required" />;
  }
  if (line.previewability === "degraded") {
    return <WarningCircle size={11} weight="fill" aria-label="Degraded preview" />;
  }
  if (line.previewability === "blocked" || line.previewability === "no-stable-result") {
    return <Prohibit size={11} weight="fill" aria-label={describePreviewability(line)} />;
  }
  return null;
}

function renderSourceText(sourceText: string, ranges: readonly VnDevtoolsSourceRange[]): ReactNode {
  if (sourceText.length === 0) return "\u00a0";
  const syntaxTokens = highlightVnDevtoolsSource(sourceText);
  const boundaries = new Set<number>([0, sourceText.length]);
  let tokenOffset = 0;
  for (const token of syntaxTokens) {
    boundaries.add(tokenOffset);
    tokenOffset += token.text.length;
    boundaries.add(tokenOffset);
  }
  for (const range of ranges) {
    boundaries.add(range.start);
    boundaries.add(range.end);
  }
  const ordered = [...boundaries].sort((left, right) => left - right);
  return ordered.slice(0, -1).map((start, index) => {
    const end = ordered[index + 1]!;
    const kind = syntaxKindAt(syntaxTokens, start);
    const matched = ranges.some((range) => start >= range.start && end <= range.end);
    const text = sourceText.slice(start, end);
    return matched
      ? <mark key={`${start}:${end}`} className={`syntax-${kind}`}>{text}</mark>
      : <span key={`${start}:${end}`} className={`syntax-${kind}`}>{text}</span>;
  });
}

function syntaxKindAt(
  tokens: ReturnType<typeof highlightVnDevtoolsSource>,
  offset: number
): VnDevtoolsSyntaxTokenKind {
  let cursor = 0;
  for (const token of tokens) {
    if (offset >= cursor && offset < cursor + token.text.length) return token.kind;
    cursor += token.text.length;
  }
  return "plain";
}

function describePreviewability(line: VnDevtoolsSourceLine): string {
  if (line.previewability === "decision-required") return "Preview pauses for a branch decision";
  if (line.previewability === "degraded") return "Preview is available with degraded behavior";
  if (line.previewability === "blocked") return "This target is blocked";
  if (line.previewability === "no-stable-result") return "This line has no stable result";
  return "";
}
