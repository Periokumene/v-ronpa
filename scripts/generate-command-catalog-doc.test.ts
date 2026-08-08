import { commandCatalog } from "../packages/contracts/src/index";
import { renderEffectReference } from "./generate-command-catalog-doc.mjs";

describe("generated Pixi effect command reference", () => {
  it("renders every implemented effect through the same catalog-owned format", () => {
    const effects = commandCatalog.filter((definition) =>
      definition.category === "effect" && definition.status === "implemented"
    );
    const reference = renderEffectReference(commandCatalog);

    for (const effect of effects) {
      expect(reference.split(`#### \`@${effect.canonicalName}\``)).toHaveLength(2);
    }
    expect(reference.match(/^#### `@/gmu)).toHaveLength(effects.length);
    expect(reference).toContain("| `target` | string | 是 | — | — | — | 必填的当前角色 ID");
    expect(reference).toContain("| `shape` | string | 否 | `eyelid` | — | `eyelid`, `iris`, `slice`");
    expect(reference).toContain("故障噪声与块跳变随时间刷新的速度倍率");
    expect(reference).not.toContain("| `speed` | decimal | 否 | — | 0..2；0 表示立即显示");
    expect(reference).not.toContain("Pixi Effect Lab");
  });
});
