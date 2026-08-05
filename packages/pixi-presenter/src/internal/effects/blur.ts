import type { PixiActorSnapshot } from "@v-ronpa/contracts";
import { BlurFilter, Container, Filter, Rectangle } from "pixi.js";
import type { PixiPresenterSystemsOptions } from "../systemTypes";

interface ActorBlurFilter {
  strength: number;
  destroy(destroyPrograms?: boolean): void;
}

export class ActorBlurController {
  private readonly filters = new WeakMap<Container, ActorBlurFilter>();

  constructor(private readonly options: PixiPresenterSystemsOptions) {}

  apply(container: Container, actor: PixiActorSnapshot, liveFilters: Partial<Record<string, number>> = actor.filters): void {
    const power = Math.max(0, liveFilters.blur ?? actor.filters.blur ?? 0);
    const blur = this.reconcile(container, power);
    container.filters = blur ? [blur as unknown as Filter] : null;
    if (blur) container.filterArea = new Rectangle(0, 0, this.options.width(), this.options.height());
    else (container as unknown as { filterArea: Rectangle | undefined }).filterArea = undefined;
  }

  release(container: Container): void {
    this.destroyFilter(container);
    container.filters = null;
    (container as unknown as { filterArea: Rectangle | undefined }).filterArea = undefined;
  }

  relayout(container: Container): void {
    if (container.filters?.length) container.filterArea = new Rectangle(0, 0, this.options.width(), this.options.height());
  }

  private reconcile(container: Container, power: number): ActorBlurFilter | undefined {
    if (power <= 0.001) {
      this.destroyFilter(container);
      return undefined;
    }
    let filter = this.filters.get(container);
    if (!filter) {
      filter = createFilter(power);
      this.filters.set(container, filter);
    } else filter.strength = power * 6;
    return filter;
  }

  private destroyFilter(container: Container): void {
    const filter = this.filters.get(container);
    if (!filter) return;
    filter.destroy();
    this.filters.delete(container);
  }
}

function createFilter(power: number): ActorBlurFilter {
  if (typeof document === "undefined") return { strength: power * 6, destroy: () => undefined };
  return new BlurFilter({ strength: power * 6, quality: 3 });
}
