import { describe, expect, it } from "vitest";
import {
  applyGlitchLiveUniforms,
  applyGlitchUniforms,
  createGlitchShaderFilter,
  glitchLiveParams,
  setGlitchResolution
} from "./glitchShader";

describe("shared glitch shader mechanics", () => {
  it("maps and clamps public controls for persistent and transient owners", () => {
    const shader = createGlitchShaderFilter(960, 540);
    applyGlitchUniforms(shader.uniforms, {
      power: 1.4,
      blockJump: -1,
      burstJump: 0.7,
      pixelScatter: 1.2,
      colorNoise: -0.5,
      speed: 1.5,
      seed: 21
    }, { progress: 0.25 });
    expect(shader.uniforms).toMatchObject({
      uPower: 1,
      uBlockJump: 0,
      uBurstJump: 0.7,
      uPixelScatter: 1.2,
      uColorNoise: 0,
      uSpeed: 1.5,
      uSeed: 21,
      uProgress: 0.25
    });

    const live = glitchLiveParams({ power: 0.4, speed: 0.6 });
    live.power = 0.8;
    applyGlitchLiveUniforms(shader.uniforms, live);
    expect(shader.uniforms.uPower).toBe(0.8);
    expect(shader.uniforms.uSpeed).toBe(0.6);
  });

  it("updates viewport resolution without replacing the shader record", () => {
    const shader = createGlitchShaderFilter(960, 540);
    setGlitchResolution(shader.uniforms, 1280, 720);
    expect(Array.from(shader.uniforms.uResolution)).toEqual([1280, 720]);
  });
});
