import type { AudioHandle } from "@v-ronpa/media-save";
import type { StoryPlayAdvanceSource } from "@v-ronpa/story-play";

export const VN_POST_VOICE_AUTO_ADVANCE_DELAY_MS = 500;

export type VnVoiceAutoAdvanceSource = Extract<StoryPlayAdvanceSource, "auto" | "auto-next">;

export interface VnVoiceAutoAdvanceGateController {
  clear(options?: { stopVoice?: boolean }): void;
  install(handle: AudioHandle): void;
  request(source: VnVoiceAutoAdvanceSource | "skip"): boolean;
}

export interface CreateVnVoiceAutoAdvanceGateControllerInput {
  advance: (source: VnVoiceAutoAdvanceSource) => void;
  clearTimeoutFn: (timeout: ReturnType<typeof setTimeout>) => void;
  postDelayMs?: number;
  setTimeoutFn: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  stopVoice: () => void;
}

export function createVnVoiceAutoAdvanceGateController({
  advance,
  clearTimeoutFn,
  postDelayMs = VN_POST_VOICE_AUTO_ADVANCE_DELAY_MS,
  setTimeoutFn,
  stopVoice
}: CreateVnVoiceAutoAdvanceGateControllerInput): VnVoiceAutoAdvanceGateController {
  let nextToken = 0;
  let gate:
    | {
        pendingSource?: VnVoiceAutoAdvanceSource;
        postDelayTimeout?: ReturnType<typeof setTimeout>;
        ready: boolean;
        token: number;
      }
    | undefined;

  function clear({ stopVoice: shouldStopVoice = false }: { stopVoice?: boolean } = {}) {
    nextToken += 1;
    if (gate?.postDelayTimeout) clearTimeoutFn(gate.postDelayTimeout);
    gate = undefined;
    if (shouldStopVoice) stopVoice();
  }

  function releaseReadyGate(token: number) {
    const current = gate;
    if (!current || current.token !== token) return;
    current.ready = true;
    const pendingSource = current.pendingSource;
    if (!pendingSource) return;
    clear();
    advance(pendingSource);
  }

  function releaseFailedGate(token: number) {
    const current = gate;
    if (!current || current.token !== token) return;
    const pendingSource = current.pendingSource;
    clear();
    if (pendingSource) advance(pendingSource);
  }

  return {
    clear,
    install(handle) {
      clear();
      const token = ++nextToken;
      gate = { ready: false, token };
      void handle.finished.then(({ reason }) => {
        const current = gate;
        if (!current || current.token !== token) return;
        switch (reason) {
          case "ended":
            current.postDelayTimeout = setTimeoutFn(() => releaseReadyGate(token), postDelayMs);
            return;
          case "failed":
            releaseFailedGate(token);
            return;
          case "stopped":
            clear();
            return;
        }
      });
    },
    request(source) {
      if (source === "skip") {
        clear({ stopVoice: true });
        return true;
      }
      const current = gate;
      if (!current) return true;
      if (current.ready) {
        clear();
        return true;
      }
      current.pendingSource = source;
      return false;
    }
  };
}

