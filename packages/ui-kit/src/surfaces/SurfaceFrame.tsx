import { createElement, type CSSProperties, type ElementType, type HTMLAttributes, type ReactNode } from "react";

export type SurfaceFrameInteraction = "passthrough" | "interactive";

export interface SurfaceFrameProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  children?: ReactNode;
  interaction?: SurfaceFrameInteraction;
  pointerEvents?: CSSProperties["pointerEvents"];
}

export function SurfaceFrame({
  as = "section",
  children,
  interaction = "passthrough",
  pointerEvents,
  style,
  ...props
}: SurfaceFrameProps) {
  const resolvedPointerEvents = pointerEvents ?? (interaction === "interactive" ? "auto" : "none");
  return createElement(
    as,
    {
      ...props,
      style: {
        ...style,
        pointerEvents: resolvedPointerEvents
      }
    },
    children
  );
}
