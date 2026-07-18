export interface VnDevtoolsFixedPointState<TTarget, TCheckpoint> {
  target?: TTarget;
  checkpoint?: TCheckpoint;
}

export interface VnDevtoolsAcceptedFixedPoint<TTarget, TCheckpoint> {
  readonly epoch: number;
  readonly target: TTarget;
  readonly previous: VnDevtoolsFixedPointState<TTarget, TCheckpoint>;
}

export interface VnDevtoolsFixedPointCoordinator<TTarget, TCheckpoint> {
  current(): VnDevtoolsFixedPointState<TTarget, TCheckpoint>;
  replace(target: TTarget | undefined, checkpoint: TCheckpoint | undefined): void;
  accept(target: TTarget): VnDevtoolsAcceptedFixedPoint<TTarget, TCheckpoint>;
  complete(accepted: VnDevtoolsAcceptedFixedPoint<TTarget, TCheckpoint>, checkpoint: TCheckpoint): boolean;
  rollback(accepted: VnDevtoolsAcceptedFixedPoint<TTarget, TCheckpoint>): boolean;
}

/** Linearizes accepted host commits while allowing a later explicit unpin to win. */
export function createVnDevtoolsFixedPointCoordinator<TTarget, TCheckpoint>(
  initial: VnDevtoolsFixedPointState<TTarget, TCheckpoint>,
  onChange: (state: VnDevtoolsFixedPointState<TTarget, TCheckpoint>) => void
): VnDevtoolsFixedPointCoordinator<TTarget, TCheckpoint> {
  let epoch = 0;
  let state = initial;

  const publish = (next: VnDevtoolsFixedPointState<TTarget, TCheckpoint>) => {
    state = next;
    onChange(next);
  };

  return {
    current: () => state,
    replace(target, checkpoint) {
      epoch += 1;
      publish({ ...(target !== undefined ? { target } : {}), ...(checkpoint !== undefined ? { checkpoint } : {}) });
    },
    accept(target) {
      const accepted = { epoch: ++epoch, target, previous: state };
      publish({ target });
      return accepted;
    },
    complete(accepted, checkpoint) {
      if (accepted.epoch !== epoch) return false;
      publish({ target: accepted.target, checkpoint });
      return true;
    },
    rollback(accepted) {
      if (accepted.epoch !== epoch) return false;
      epoch += 1;
      publish(accepted.previous);
      return true;
    }
  };
}
