import { describe, expect, it } from "vitest";
import type { NaniCommandCategory, RuntimeCommand, RuntimeValue } from "@v-ronpa/contracts";
import {
  createInitialMediaRuntimeState,
  reduceMediaRuntimeCommand,
  reduceMediaRuntimeCommands,
  type MediaRuntimeState
} from "./mediaRuntime";

describe("media runtime", () => {
  it("tracks BGM by group and replaces only the matching group", () => {
    const first = reduceMediaRuntimeCommands(createInitialMediaRuntimeState(), [
      runtimeCommand("bgm", "media", { bgmPath: "bgm:main", group: "music", volume: 0.45 }),
      runtimeCommand("bgm", "media", { bgmPath: "bgm:layer", group: "ambient", volume: 0.25 }),
      runtimeCommand("bgm", "media", { bgmPath: "bgm:alt", group: "music", fadeMs: 500 })
    ]);

    expect(first.state.bgmByGroup).toEqual({
      music: { key: "music", group: "music", sourceRef: "bgm:alt" },
      ambient: { key: "ambient", group: "ambient", sourceRef: "bgm:layer" }
    });
    expect(first.effects).toEqual([
      { type: "play-bgm", key: "music", group: "music", sourceRef: "bgm:main", volume: 0.45 },
      { type: "play-bgm", key: "ambient", group: "ambient", sourceRef: "bgm:layer", volume: 0.25 },
      { type: "stop-bgm", key: "music", group: "music", fadeMs: 500 },
      { type: "play-bgm", key: "music", group: "music", sourceRef: "bgm:alt", fadeMs: 500 }
    ]);
  });

  it("stops only the targeted BGM group and reports missing groups as no-op diagnostics", () => {
    const seeded: MediaRuntimeState = {
      ...createInitialMediaRuntimeState(),
      bgmByGroup: {
        music: { key: "music", group: "music", sourceRef: "bgm:main" },
        ambient: { key: "ambient", group: "ambient", sourceRef: "bgm:layer" }
      }
    };

    const stopped = reduceMediaRuntimeCommand(seeded, runtimeCommand("stopbgm", "media", { group: "music", fadeMs: 250 }));
    expect(stopped.state.bgmByGroup).toEqual({
      ambient: { key: "ambient", group: "ambient", sourceRef: "bgm:layer" }
    });
    expect(stopped.effects).toEqual([{ type: "stop-bgm", key: "music", group: "music", fadeMs: 250 }]);

    const missing = reduceMediaRuntimeCommand(stopped.state, runtimeCommand("stopbgm", "media", { group: "music" }));
    expect(missing.state).toBe(stopped.state);
    expect(missing.effects).toEqual([]);
    expect(missing.diagnostics).toEqual([
      {
        code: "media-handle-missing",
        commandId: "stopbgm",
        severity: "info",
        message: "@stopbgm did not find active BGM group music."
      }
    ]);
  });

  it("tracks only looping SFX and clears them through stopSfx", () => {
    const started = reduceMediaRuntimeCommands(createInitialMediaRuntimeState(), [
      runtimeCommand("sfx", "media", { sfxPath: "sfx:rain", group: "rain", loop: true, volume: 0.35 }),
      runtimeCommand("sfx", "media", { sfxPath: "sfx:door", volume: 0.9 }),
      runtimeCommand("sfxfast", "media", { sfxPath: "sfx:shock", volume: 0.75 })
    ]);

    expect(started.state.loopingSfxByKey).toEqual({
      rain: { key: "rain", group: "rain", sourceRef: "sfx:rain" }
    });
    expect(started.effects).toEqual([
      { type: "play-sfx", sourceRef: "sfx:rain", loop: true, fast: false, key: "rain", group: "rain", volume: 0.35 },
      { type: "play-sfx", sourceRef: "sfx:door", loop: false, fast: false, volume: 0.9 },
      { type: "play-sfx", sourceRef: "sfx:shock", loop: false, fast: true, volume: 0.75 }
    ]);

    const stopped = reduceMediaRuntimeCommand(started.state, runtimeCommand("stopsfx", "media", { group: "rain", fadeMs: 200 }));
    expect(stopped.state.loopingSfxByKey).toEqual({});
    expect(stopped.effects).toEqual([{ type: "stop-sfx", key: "rain", group: "rain", fadeMs: 200 }]);
  });

  it("uses sfxPath as the loop key when group is absent and diagnoses missing stop keys", () => {
    const started = reduceMediaRuntimeCommand(
      createInitialMediaRuntimeState(),
      runtimeCommand("sfx", "media", { sfxPath: "sfx:hum", loop: true })
    );
    expect(started.state.loopingSfxByKey).toEqual({
      "sfx:hum": { key: "sfx:hum", sourceRef: "sfx:hum" }
    });

    const missing = reduceMediaRuntimeCommand(started.state, runtimeCommand("stopsfx", "media", {}));
    expect(missing.effects).toEqual([]);
    expect(missing.diagnostics).toEqual([
      {
        code: "media-handle-missing",
        commandId: "stopsfx",
        severity: "info",
        message: "@stopsfx requires group or sfxPath to stop a looping SFX."
      }
    ]);

    const stopped = reduceMediaRuntimeCommand(started.state, runtimeCommand("stopsfx", "media", { sfxPath: "sfx:hum" }));
    expect(stopped.state.loopingSfxByKey).toEqual({});
  });

  it("emits movie playback descriptors without storing movie handles", () => {
    const result = reduceMediaRuntimeCommand(
      createInitialMediaRuntimeState(),
      runtimeCommand("movie", "media", { moviePath: "video:validation-intro", block: true, durationMs: 1200 })
    );

    expect(result.state).toEqual(createInitialMediaRuntimeState());
    expect(result.effects).toEqual([
      { type: "play-movie", sourceRef: "video:validation-intro", block: true, durationMs: 1200 }
    ]);
    expect(result.diagnostics).toEqual([]);
  });
});

function runtimeCommand(commandId: string, category: NaniCommandCategory, params: Record<string, RuntimeValue>): RuntimeCommand {
  return {
    commandId,
    canonicalName: commandId,
    category,
    source: "v-ronpa",
    status: "implemented",
    params,
    loc: { scriptPath: "media-runtime-test.nani", line: 1, column: 1, raw: `@${commandId}` }
  };
}
