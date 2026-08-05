import { Container, Graphics, Text } from "pixi.js";
import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import type { PixiPresenterSystemsOptions } from "../systemTypes";

type TrialHint = Extract<PixiStageRenderHint, { type: "trial-keyword" | "trial-subtitle" }>;

export class TrialOverlaySystem {
  private readonly layer = new Container({ label: "trial-overlay" });

  constructor(private readonly options: PixiPresenterSystemsOptions) {
    this.layer.zIndex = 31;
    options.root.sortableChildren = true;
    options.root.addChild(this.layer);
  }

  run(hints: PixiStageRenderHint[]): void {
    for (const hint of hints) {
      if (hint.type === "trial-keyword" || hint.type === "trial-subtitle") this.add(hint);
    }
  }

  clear(): void {
    this.layer.removeChildren().forEach((child) => child.destroy());
  }

  relayoutViewport(): void {
    this.layer.children.forEach((child, index) => {
      child.x = Math.max(24, this.options.width() - 360);
      child.y = 100 + index * 42;
    });
  }

  destroy(): void {
    this.clear();
    this.layer.removeFromParent();
    this.layer.destroy();
  }

  private add(hint: TrialHint): void {
    const group = new Container();
    const pill = new Graphics()
      .roundRect(0, 0, Math.max(180, hint.text.length * 14), 34, 17)
      .fill({ color: 0x1f2937, alpha: 0.82 })
      .stroke({ color: 0xff4f8f, width: 2, alpha: 0.9 });
    const label = new Text({ text: hint.text, style: { fill: 0xffffff, fontSize: 18, fontWeight: "700" } });
    label.x = 18;
    label.y = 6;
    group.x = Math.max(24, this.options.width() - 360);
    group.y = 100 + this.layer.children.length * 42;
    group.addChild(pill, label);
    this.layer.addChild(group);
  }
}
