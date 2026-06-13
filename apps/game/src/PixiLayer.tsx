import { useEffect, useRef } from "react";
import type { PresentationCommand } from "@v-ronpa/contracts";
import { createPixiPresenter, type PixiPresenterPort } from "@v-ronpa/pixi-presenter";

export function PixiLayer({ commands, visible }: { commands: PresentationCommand[]; visible: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const presenterRef = useRef<PixiPresenterPort | null>(null);
  const appliedCountRef = useRef(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const presenter = createPixiPresenter({ host });
    presenterRef.current = presenter;
    void presenter.mount();
    return () => {
      presenter.destroy();
      presenterRef.current = null;
      appliedCountRef.current = 0;
    };
  }, []);

  useEffect(() => {
    const presenter = presenterRef.current;
    if (!presenter) return;
    for (const command of commands.slice(appliedCountRef.current)) {
      void presenter.apply(command);
    }
    appliedCountRef.current = commands.length;
  }, [commands]);

  return (
    <div
      ref={hostRef}
      data-testid="pixi-layer"
      className={visible ? "pixi-layer" : "pixi-layer pixi-layer-hidden"}
      aria-hidden={!visible}
    />
  );
}
