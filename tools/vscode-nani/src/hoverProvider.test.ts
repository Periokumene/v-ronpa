import { describe, expect, it } from "vitest";
import { getNaniHover } from "./hoverProvider";

describe("hover provider logic", () => {
  it("returns command docs on command names", () => {
    const hover = getNaniHover("@bgm bgm:main volume:0.6", { line: 0, character: 2 });

    expect(hover?.contents).toContain("bgm · media · implemented");
    expect(hover?.contents).toContain("播放循环背景音乐");
    expect(hover?.range).toEqual({
      start: { line: 0, character: 1 },
      end: { line: 0, character: 4 }
    });
  });

  it("returns parameter docs on command params and boolean flags", () => {
    const volume = getNaniHover("@bgm bgm:main volume:0.6 wait!", { line: 0, character: "@bgm bgm:main vol".length });
    const wait = getNaniHover("@bgm bgm:main volume:0.6 wait!", { line: 0, character: "@bgm bgm:main volume:0.6 wai".length });
    const uiWait = getNaniHover("@hideUI commandBar wait!", { line: 0, character: "@hideUI commandBar wai".length });

    expect(volume?.contents).toContain("播放音量倍率");
    expect(volume?.contents).toContain("Recommended: 0..1");
    expect(wait?.contents).toContain("是否等待表现层或播放流程完成");
    expect(wait?.contents).toContain("Runtime support: declared-not-consumed");
    expect(uiWait?.contents).toContain("是否等待表现层或播放流程完成");
    expect(uiWait?.contents).toContain("Runtime support: consumed");
  });

  it("returns stateful Pixi effect transition docs from the shared catalog", () => {
    const rain = getNaniHover("@rain power:0.5 time:0.3", { line: 0, character: 2 });
    const glitchFilter = getNaniHover("@glitchFilter power:0 time:0.3", { line: 0, character: 4 });

    expect(rain?.contents).toContain("插值");
    expect(rain?.contents).toContain("power:0 time:x");
    expect(glitchFilter?.contents).toContain("seed");
    expect(glitchFilter?.contents).toContain("淡出移除");
  });

  it("documents character tone amount as an unbounded recommended multiplier", () => {
    const command = getNaniHover("@charTone rain amount:1", { line: 0, character: 4 });
    const amount = getNaniHover("@charTone rain amount:1", {
      line: 0,
      character: "@charTone rain amou".length
    });
    const primary = getNaniHover("@charTone rain amount:1", {
      line: 0,
      character: "@charTone ra".length
    });

    expect(command?.contents).toContain("全部角色");
    expect(command?.contents).toContain("内部固定缓动");
    expect(primary?.contents).toContain("preset parameter · string · primary");
    expect(primary?.contents).toContain("Allowed: rain, fog, sunset, night, alert, fluorescent, none");
    expect(amount?.contents).toContain("Default: 1");
    expect(amount?.contents).toContain("Recommended: 0..2 multiplier");
    expect(amount?.contents).toContain("不设硬上限");
  });

  it("documents that named char commands show the character by default", () => {
    const visible = getNaniHover("@char Ema visible:true", {
      line: 0,
      character: "@char Ema visib".length
    });

    expect(visible?.contents).toContain("Default: true");
    expect(visible?.contents).toContain("省略时显示具名角色");
  });

  it("returns inline command and inline speed docs", () => {
    const command = getNaniHover("Felix: Hello [< speed:0.8]", { line: 0, character: "Felix: Hello [<".length });
    const speed = getNaniHover("Felix: Hello [< speed:0.8]", { line: 0, character: "Felix: Hello [< spe".length });

    expect(command?.contents).toContain("Inline print control command");
    expect(speed?.contents).toContain("Inline print speed parameter");
    expect(speed?.contents).toContain("设置当前文本行的显示速度倍率");
  });

  it("returns staged marker docs in dialogue and explicit story text", () => {
    const compact = getNaniHover("Felix: A[-]B", { line: 0, character: 9 });
    const long = getNaniHover('@cue "A[wait i]B"', { line: 0, character: 12 });
    const escaped = getNaniHover(String.raw`Felix: A\[-]B`, { line: 0, character: 10 });

    expect(compact?.contents).toContain("staged-text input stop");
    expect(long?.contents).toContain("与 `[-]` 等价");
    expect(escaped).toBeUndefined();
  });

  it("derives Cue and HideCue command, primary, and boolean docs from the catalog", () => {
    const cue = getNaniHover('@cue "Hello" autoNext!', { line: 0, character: 2 });
    const primary = getNaniHover('@cue "Hello" autoNext!', { line: 0, character: 8 });
    const flag = getNaniHover('@cue "Hello" autoNext!', { line: 0, character: 18 });
    const hide = getNaniHover("@hideCue time:0.4 wait!", { line: 0, character: 4 });

    expect(cue?.contents).toContain("画面中央");
    expect(primary?.contents).toContain("text parameter · string · primary");
    expect(flag?.contents).toContain("boolean");
    expect(hide?.contents).toContain("隐藏中央演出文本 Surface");
  });
});
