import { Filter, Rectangle } from "pixi.js";
import type { PixiPresenterSystemsOptions } from "../systemTypes";

export class RootFilterStack {
  private screenFilters: Filter[] = [];
  private transientFilters: Filter[] = [];

  constructor(private readonly options: PixiPresenterSystemsOptions) {}

  setScreenFilters(filters: Filter[]): void {
    this.screenFilters = [...filters];
    this.apply();
  }

  removeScreenFilter(filter: Filter): void {
    this.screenFilters = this.screenFilters.filter((candidate) => candidate !== filter);
    this.apply();
  }

  addTransientFilter(filter: Filter): void {
    this.transientFilters.push(filter);
    this.apply();
  }

  removeTransientFilter(filter: Filter): void {
    this.transientFilters = this.transientFilters.filter((candidate) => candidate !== filter);
    this.apply();
  }

  clear(): void {
    this.screenFilters = [];
    this.transientFilters = [];
    this.apply();
  }

  relayoutViewport(): void {
    if ([...this.screenFilters, ...this.transientFilters].length > 0) {
      this.options.root.filterArea = new Rectangle(0, 0, this.options.width(), this.options.height());
    }
  }

  private apply(): void {
    const filters = [...this.screenFilters, ...this.transientFilters];
    this.options.root.filters = filters.length > 0 ? filters : null;
    if (filters.length > 0) {
      this.options.root.filterArea = new Rectangle(0, 0, this.options.width(), this.options.height());
    } else {
      (this.options.root as unknown as { filterArea: Rectangle | undefined }).filterArea = undefined;
    }
  }
}
