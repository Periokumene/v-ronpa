import { readFileSync } from "node:fs";
import { Children, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { RuntimeMovieOverlaySurface, RuntimePinpFrame } from "./RuntimeUiSurfaces";

const source = readFileSync(new URL("./RuntimeUiSurfaces.tsx", import.meta.url), "utf8");

describe("RuntimeMovieOverlaySurface", () => {
  it("renders movie playback as a full playfield cutscene without native browser controls", () => {
    const element = RuntimeMovieOverlaySurface({
      blocking: true,
      assetId: "video/validation-intro",
      uri: "/harness/media/movie.mp4"
    });

    const overlay = findElementByTestId(element, "runtime-movie-overlay");
    const video = findElementByTestId(element, "runtime-movie-video");
    const skip = findElementByTestId(element, "runtime-movie-skip");

    expect(overlay).toBeDefined();
    expect(styleOf(overlay)).toMatchObject({
      position: "absolute",
      zIndex: 30,
      inset: 0,
      background: "#000"
    });
    expect(video).toBeDefined();
    expect((video?.props as { controls?: boolean }).controls).toBeUndefined();
    expect(video?.props).toMatchObject({
      disablePictureInPicture: true,
      disableRemotePlayback: true,
      playsInline: true
    });
    expect(styleOf(video)).toMatchObject({
      display: "block",
      width: "100%",
      height: "100%",
      background: "#000",
      objectFit: "contain"
    });
    expect(skip).toBeDefined();
  });
});

describe("RuntimeInputPromptSurface", () => {
  it("keeps text editing semantics while disabling browser-managed writing affordances", () => {
    const inputMarkup = source.match(/<input[\s\S]*?data-testid="runtime-input-field"[\s\S]*?\/>/u)?.[0];

    expect(inputMarkup).toBeDefined();
    expect(inputMarkup).toContain('autoCapitalize="none"');
    expect(inputMarkup).toContain('autoComplete="off"');
    expect(inputMarkup).toContain('autoCorrect="off"');
    expect(inputMarkup).toContain('enterKeyHint="done"');
    expect(inputMarkup).toContain('inputMode={valueType === "number" ? "decimal" : "text"}');
    expect(inputMarkup).toContain("spellCheck={false}");
    expect(inputMarkup).toContain('type={valueType === "number" ? "number" : "text"}');
  });
});

describe("RuntimePinpSurface", () => {
  const presentation = { targetVisible: true, mounted: true, opacity: 0.5, phase: "showing" as const };

  it("renders a centered contain image with inert weak-frame semantics", () => {
    const element = RuntimePinpFrame({
      alt: "门禁卡",
      aspectRatio: [16, 9],
      heightPercent: 20,
      onImageError: () => undefined,
      positionPercent: [50, 50],
      presentation,
      revision: 1,
      assetId: "texture/evidence/keycard-thumbnail",
      unavailable: false,
      uri: "/assets/keycard.png"
    });
    const root = findElementByTestId(element, "runtime-pinp-surface");
    const image = findElementByTestId(element, "runtime-pinp-image");

    expect(styleOf(root)).toMatchObject({
      left: "50%",
      top: "50%",
      height: "20%",
      aspectRatio: "16 / 9",
      pointerEvents: "none"
    });
    expect(image?.props).toMatchObject({ alt: "门禁卡", src: "/assets/keycard.png", draggable: false });
    expect(typeof (image?.props as { onError?: unknown } | undefined)?.onError).toBe("function");
    expect(styleOf(image)).toMatchObject({ objectFit: "contain", pointerEvents: "none" });
  });

  it("shows a stable assetId placeholder when the URI is unavailable", () => {
    const element = RuntimePinpFrame({
      alt: "",
      aspectRatio: [4, 3],
      heightPercent: 30,
      onImageError: () => undefined,
      positionPercent: [25, 75],
      presentation: { ...presentation, opacity: 1, phase: "shown" },
      revision: 2,
      assetId: "props:missing",
      unavailable: true
    });
    const missing = findElementByTestId(element, "runtime-pinp-missing");

    expect(missing).toBeDefined();
    expect(JSON.stringify(missing?.props)).toContain("props:missing");
  });
});

function findElementByTestId(node: ReactNode, testId: string): ReactElement | undefined {
  let match: ReactElement | undefined;
  visit(node, (current) => {
    if (match || !isValidElement(current)) return;
    const props = current.props as Record<string, unknown>;
    if (props["data-testid"] === testId) match = current;
  });
  return match;
}

function styleOf(element: ReactElement | undefined): CSSProperties | undefined {
  return (element?.props as { style?: CSSProperties } | undefined)?.style;
}

function visit(node: ReactNode, visitor: (node: ReactNode) => void) {
  visitor(node);
  if (!isValidElement(node)) return;
  Children.forEach((node.props as { children?: ReactNode }).children, (child) => visit(child, visitor));
}
