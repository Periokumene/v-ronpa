import { describe, expect, it } from "vitest";
import type { NaniCommandCategory, RuntimeCommand, RuntimeValue } from "@v-ronpa/contracts";
import {
  createInitialMediaRuntimeState,
  createVnMediaCheckpoint,
  createVnMediaRestoreEffects,
  reduceMediaRuntimeCommand,
  reduceMediaRuntimeCommands,
  type MediaRuntimeState
} from "./mediaRuntime";

describe("media runtime", () => {
  it("tracks BGM by group and crossfades only the matching group", () => {
    const first = reduceMediaRuntimeCommands(createInitialMediaRuntimeState(), [
      runtimeCommand("bgm", "media", { bgmPath: "bgm:main", group: "music", volume: 0.45, fadeMs: 300 }),
      runtimeCommand("bgm", "media", { bgmPath: "bgm:layer", group: "ambient", volume: 0.25 }),
      runtimeCommand("bgm", "media", { bgmPath: "bgm:alt", group: "music", fadeMs: 500 })
    ]);

    expect(first.state.bgmByGroup).toEqual({
      music: { sourceRef: "bgm:alt", volume: 0.7 },
      ambient: { sourceRef: "bgm:layer", volume: 0.25 }
    });
    expect(first.effects).toEqual([
      { type: "play-bgm", key: "music", group: "music", sourceRef: "bgm:main", volume: 0.45, fadeInMs: 300 },
      { type: "play-bgm", key: "ambient", group: "ambient", sourceRef: "bgm:layer", volume: 0.25 },
      { type: "stop-bgm", key: "music", group: "music", fadeMs: 500 },
      { type: "play-bgm", key: "music", group: "music", sourceRef: "bgm:alt", volume: 0.7, fadeInMs: 500 }
    ]);
  });

  it("adjusts active BGM volume by group without restarting playback", () => {
    const seeded: MediaRuntimeState = {
      ...createInitialMediaRuntimeState(),
      bgmByGroup: {
        music: { sourceRef: "bgm:main", volume: 0.7 }
      }
    };

    const byGroup = reduceMediaRuntimeCommand(seeded, runtimeCommand("bgm", "media", { group: "music", volume: 0.4, durationMs: 1500 }));
    expect(byGroup.state.bgmByGroup.music).toEqual({ sourceRef: "bgm:main", volume: 0.4 });
    expect(byGroup.effects).toEqual([{ type: "set-bgm-volume", key: "music", group: "music", volume: 0.4, durationMs: 1500 }]);

    const sameTrack = reduceMediaRuntimeCommand(
      seeded,
      runtimeCommand("bgm", "media", { bgmPath: "bgm:main", group: "music", volume: 0.2, durationMs: 500 })
    );
    expect(sameTrack.state.bgmByGroup.music).toEqual({ sourceRef: "bgm:main", volume: 0.2 });
    expect(sameTrack.effects).toEqual([{ type: "set-bgm-volume", key: "music", group: "music", volume: 0.2, durationMs: 500 }]);
  });

  it("diagnoses untargeted BGM volume changes as no-ops", () => {
    const result = reduceMediaRuntimeCommand(
      createInitialMediaRuntimeState(),
      runtimeCommand("bgm", "media", { volume: 0.4, durationMs: 1000 })
    );

    expect(result.state).toEqual(createInitialMediaRuntimeState());
    expect(result.effects).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        code: "media-handle-missing",
        commandId: "bgm",
        severity: "info",
        message: "@bgm requires group or bgmPath to modify BGM volume."
      }
    ]);
  });

  it("stops only the targeted BGM group and reports missing groups as no-op diagnostics", () => {
    const seeded: MediaRuntimeState = {
      ...createInitialMediaRuntimeState(),
      bgmByGroup: {
        music: { sourceRef: "bgm:main", volume: 0.7 },
        ambient: { sourceRef: "bgm:layer", volume: 0.25 }
      }
    };

    const stopped = reduceMediaRuntimeCommand(seeded, runtimeCommand("stopbgm", "media", { group: "music", fadeMs: 250 }));
    expect(stopped.state.bgmByGroup).toEqual({
      ambient: { sourceRef: "bgm:layer", volume: 0.25 }
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
      runtimeCommand("sfx", "media", { sfxPath: "sfx:rain", group: "rain", loop: true, volume: 0.35, fadeMs: 500 }),
      runtimeCommand("sfx", "media", { sfxPath: "sfx:door", volume: 0.9, fadeMs: 250 }),
      runtimeCommand("sfxfast", "media", { sfxPath: "sfx:shock", volume: 0.75 })
    ]);

    expect(started.state.loopingSfxByKey).toEqual({
      rain: { group: "rain", sourceRef: "sfx:rain", volume: 0.35 }
    });
    expect(started.effects).toEqual([
      { type: "play-sfx", sourceRef: "sfx:rain", loop: true, fast: false, key: "rain", group: "rain", volume: 0.35, fadeInMs: 500 },
      { type: "play-sfx", sourceRef: "sfx:door", loop: false, fast: false, volume: 0.9, fadeInMs: 250 },
      { type: "play-sfx", sourceRef: "sfx:shock", loop: false, fast: true, volume: 0.75 }
    ]);

    const stopped = reduceMediaRuntimeCommand(started.state, runtimeCommand("stopsfx", "media", { group: "rain", fadeMs: 200 }));
    expect(stopped.state.loopingSfxByKey).toEqual({});
    expect(stopped.effects).toEqual([{ type: "stop-sfx", key: "rain", group: "rain", fadeMs: 200 }]);
  });

  it("adjusts active loop SFX volume by key without restarting playback", () => {
    const seeded: MediaRuntimeState = {
      ...createInitialMediaRuntimeState(),
      loopingSfxByKey: {
        rain: { group: "rain", sourceRef: "sfx:rain", volume: 0.35 }
      }
    };

    const byGroup = reduceMediaRuntimeCommand(seeded, runtimeCommand("sfx", "media", { group: "rain", volume: 0.15, durationMs: 2000 }));
    expect(byGroup.state.loopingSfxByKey.rain).toEqual({ group: "rain", sourceRef: "sfx:rain", volume: 0.15 });
    expect(byGroup.effects).toEqual([{ type: "set-sfx-volume", key: "rain", group: "rain", volume: 0.15, durationMs: 2000 }]);

    const sameLoop = reduceMediaRuntimeCommand(
      seeded,
      runtimeCommand("sfx", "media", { sfxPath: "sfx:rain", group: "rain", loop: true, volume: 0.2, durationMs: 500 })
    );
    expect(sameLoop.state.loopingSfxByKey.rain).toEqual({ group: "rain", sourceRef: "sfx:rain", volume: 0.2 });
    expect(sameLoop.effects).toEqual([{ type: "set-sfx-volume", key: "rain", group: "rain", volume: 0.2, durationMs: 500 }]);
  });

  it("diagnoses untargeted SFX volume changes as no-ops", () => {
    const result = reduceMediaRuntimeCommand(
      createInitialMediaRuntimeState(),
      runtimeCommand("sfx", "media", { volume: 0.4, durationMs: 1000 })
    );

    expect(result.state).toEqual(createInitialMediaRuntimeState());
    expect(result.effects).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        code: "media-handle-missing",
        commandId: "sfx",
        severity: "info",
        message: "@sfx requires group or sfxPath to modify looped SFX volume."
      }
    ]);
  });

  it("uses sfxPath as the loop key when group is absent and diagnoses missing stop keys", () => {
    const started = reduceMediaRuntimeCommand(
      createInitialMediaRuntimeState(),
      runtimeCommand("sfx", "media", { sfxPath: "sfx:hum", loop: true })
    );
    expect(started.state.loopingSfxByKey).toEqual({
      "sfx:hum": { sourceRef: "sfx:hum", volume: 1 }
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

  it("round-trips canonical persistent media and materializes deterministic restore effects", () => {
    const state: MediaRuntimeState = {
      bgmByGroup: {
        music: { sourceRef: "bgm:main", volume: 0.4 },
        ambient: { sourceRef: "bgm:layer", volume: 0.2 }
      },
      loopingSfxByKey: {
        rain: { sourceRef: "sfx:rain", volume: 0.3, group: "rain" },
        "sfx:hum": { sourceRef: "sfx:hum", volume: 0.8 }
      }
    };

    const checkpoint = createVnMediaCheckpoint(state);

    expect(checkpoint).toEqual(state);
    expect(checkpoint).not.toBe(state);
    expect(createVnMediaRestoreEffects(checkpoint)).toEqual([
      { type: "play-bgm", key: "ambient", group: "ambient", sourceRef: "bgm:layer", volume: 0.2 },
      { type: "play-bgm", key: "music", group: "music", sourceRef: "bgm:main", volume: 0.4 },
      { type: "play-sfx", key: "rain", group: "rain", sourceRef: "sfx:rain", loop: true, fast: false, volume: 0.3 },
      { type: "play-sfx", key: "sfx:hum", sourceRef: "sfx:hum", loop: true, fast: false, volume: 0.8 }
    ]);
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
