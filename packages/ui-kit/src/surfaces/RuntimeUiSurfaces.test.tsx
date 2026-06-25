import { Children, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { RuntimeMovieOverlaySurface } from "./RuntimeUiSurfaces";

describe("RuntimeMovieOverlaySurface", () => {
  it("renders movie playback as a full playfield cutscene without native browser controls", () => {
    const element = RuntimeMovieOverlaySurface({
      blocking: true,
      sourceRef: "video:validation-intro",
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
