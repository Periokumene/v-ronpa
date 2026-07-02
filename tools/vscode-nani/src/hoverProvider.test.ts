import { describe, expect, it } from "vitest";
import { getNaniHover } from "./hoverProvider";

describe("hover provider logic", () => {
  it("returns command docs on command names", () => {
    const hover = getNaniHover("@bgm bgm:main volume:0.6", { line: 0, character: 2 });

    expect(hover?.contents).toContain("bgm · media · implemented");
    expect(hover?.contents).toContain("播放背景音乐");
    expect(hover?.range).toEqual({
      start: { line: 0, character: 1 },
      end: { line: 0, character: 4 }
    });
  });

  it("returns parameter docs on command params and boolean flags", () => {
    const volume = getNaniHover("@bgm bgm:main volume:0.6 wait!", { line: 0, character: "@bgm bgm:main vol".length });
    const wait = getNaniHover("@bgm bgm:main volume:0.6 wait!", { line: 0, character: "@bgm bgm:main volume:0.6 wai".length });

    expect(volume?.contents).toContain("播放音量倍率");
    expect(volume?.contents).toContain("Recommended: 0..1");
    expect(wait?.contents).toContain("是否等待表现层或播放流程完成");
  });

  it("returns inline command and inline speed docs", () => {
    const command = getNaniHover("Felix: Hello [< speed:0.8]", { line: 0, character: "Felix: Hello [<".length });
    const speed = getNaniHover("Felix: Hello [< speed:0.8]", { line: 0, character: "Felix: Hello [< spe".length });

    expect(command?.contents).toContain("Inline print control command");
    expect(speed?.contents).toContain("Inline print speed parameter");
    expect(speed?.contents).toContain("设置当前文本行的显示速度倍率");
  });
});
