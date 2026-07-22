export interface VnRuntimeOperation<Catalog> {
  readonly id: number;
  readonly catalog: Catalog;
  readonly controller: AbortController;
}

export interface VnRuntimeOperationCoordinator<Catalog> {
  begin(catalog: Catalog): VnRuntimeOperation<Catalog>;
  current(): VnRuntimeOperation<Catalog> | undefined;
  invalidate(): void;
  isCurrent(operation: VnRuntimeOperation<Catalog>): boolean;
}

export function createVnRuntimeOperationCoordinator<Catalog>(): VnRuntimeOperationCoordinator<Catalog> {
  let active: VnRuntimeOperation<Catalog> | undefined;
  let sequence = 0;
  return {
    begin(catalog) {
      active?.controller.abort();
      active = { id: ++sequence, catalog, controller: new AbortController() };
      return active;
    },
    current: () => active,
    invalidate() {
      active?.controller.abort();
      active = undefined;
    },
    isCurrent(operation) {
      return active === operation && !operation.controller.signal.aborted;
    }
  };
}
