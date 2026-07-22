import { useCallback, useRef, useState } from "react";
import type { PixiStageHandle } from "./PixiLayer";

export interface PixiStageReadiness {
  handle: PixiStageHandle | undefined;
  pending: boolean;
  onStageHandleChanged(handle: PixiStageHandle | undefined): void;
  waitUntilReady(): Promise<boolean>;
}

export function usePixiStageReadiness(): PixiStageReadiness {
  const handleRef = useRef<PixiStageHandle | undefined>(undefined);
  const waitPromiseRef = useRef<Promise<boolean> | undefined>(undefined);
  const [handle, setHandle] = useState<PixiStageHandle | undefined>(undefined);
  const [pending, setPending] = useState(false);

  const onStageHandleChanged = useCallback((next: PixiStageHandle | undefined) => {
    handleRef.current = next;
    setHandle(next);
  }, []);

  const waitUntilReady = useCallback(() => {
    if (waitPromiseRef.current) return waitPromiseRef.current;
    const promise = (async () => {
      setPending(true);
      try {
        let current = handleRef.current;
        if (!current) return false;
        await current.ready;
        while (handleRef.current && handleRef.current !== current) {
          current = handleRef.current;
          await current.ready;
        }
        return handleRef.current === current;
      } finally {
        waitPromiseRef.current = undefined;
        setPending(false);
      }
    })();
    waitPromiseRef.current = promise;
    return promise;
  }, []);

  return { handle, pending, onStageHandleChanged, waitUntilReady };
}
