import { Filter, GlProgram } from "pixi.js";
import {
  internalRainSeed,
  resolveRainBaseColor,
  resolveGlobalRainState,
  resolveRainTrack,
  type MidRainBandSettings,
  type MidRainBandState,
  type RainSettings,
} from "./settings";
import { buildGuides, guideCount, guidesToUniforms } from "./guides";
import { createRainTrackSelectionRuntime, resolveRainTrackActiveMask } from "./rainTrackSelection";
import { resolveRainViewportCover } from "./viewport";

export const midRainRenderScale = 0.6;

type PixelRainLayer = 'mid' | 'near';

type PixelRainFilterOptions = {
  layer: PixelRainLayer;
  opaqueBackground?: boolean;
  resolution?: number;
};

const vertexShader = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vFilterCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void)
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
    vFilterCoord = aPosition;
}
`;

function indexedUniformDeclarations(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => `uniform vec4 ${prefix}${index};`).join('\n');
}

function indexedAccessor(functionName: string, prefix: string, count: number) {
  const checks = Array.from({ length: count - 1 }, (_, index) => `    if (index == ${index}) return ${prefix}${index};`).join('\n');
  return `vec4 ${functionName}(int index) {\n${checks}\n    return ${prefix}${count - 1};\n}`;
}

const fragmentShader = /* glsl */ `#version 300 es
precision highp float;

in vec2 vTextureCoord;
in vec2 vFilterCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform vec2 uRainFrameMin;
uniform vec2 uRainFrameSize;
uniform vec2 uGuideResolution;
uniform float uDesignAspect;
uniform float uTime;
uniform float uFrame;
uniform float uDensity;
uniform float uSpeed;
uniform float uDropLength;
uniform float uDropWidth;
uniform float uOverallBrightness;
uniform float uJitter;
uniform float uSeed;
uniform float uEnergyMin;
uniform float uEnergyMax;
uniform vec2 uMeanWind;
uniform float uGustAmplitude;
uniform float uGustCoherenceTime;
uniform vec2 uGustAdvectionVelocity;
uniform float uSpatialWindScale;
uniform vec3 uMidDensity;
uniform vec3 uMidStrength;
uniform float uMidSpeedPerSecond;
uniform vec3 uMidLength;
uniform vec3 uMidWidth;
uniform float uMidDirectionSpread;
uniform vec3 uMidBandEnabled;
uniform vec3 uRainBaseColor;
uniform float uShowRain;
uniform float uShowMidRain;
${indexedUniformDeclarations('uGuideA', guideCount)}
${indexedUniformDeclarations('uGuideB', guideCount)}
${indexedUniformDeclarations('uTrackA', guideCount)}
${indexedUniformDeclarations('uTrackB', guideCount)}
${indexedUniformDeclarations('uTrackC', guideCount)}
${indexedUniformDeclarations('uTrackD', guideCount)}

const int GUIDE_COUNT = ${guideCount};
const int GUIDE_STEPS = 32;
const int MID_BAND_COUNT = 3;
const int MID_GUIDE_COUNT = 5;
const float PI = 3.141592653589793;
const float MID_GUIDE_CURVE_BLEND = 0.18;
const float MID_WINDOW_LENGTH_MIN = 0.30;
const float MID_WINDOW_LENGTH_MAX = 0.70;
const float MID_EXISTENCE_CHANCE_CAP = 0.88;
const float MID_LANE_WEIGHT_MIN = 0.42;
const float MID_LANE_WEIGHT_MAX = 1.20;
const float MID_CLUSTER_STRENGTH = 0.5;
const float MID_CLUSTER_SCALE = 0.5;
const float NEAR_SIZE_SPEED_INFLUENCE = 0.25;
const float NEAR_SIZE_WIDTH_INFLUENCE = 0.5;
const float NEAR_INTENSITY_CEILING = 1.24;

${indexedAccessor('guideA', 'uGuideA', guideCount)}
${indexedAccessor('guideB', 'uGuideB', guideCount)}
${indexedAccessor('trackA', 'uTrackA', guideCount)}
${indexedAccessor('trackB', 'uTrackB', guideCount)}
${indexedAccessor('trackC', 'uTrackC', guideCount)}
${indexedAccessor('trackD', 'uTrackD', guideCount)}

vec2 bezierPoint(int index, float t) {
    vec4 a = guideA(index);
    vec4 b = guideB(index);
    vec2 p0 = a.xy;
    vec2 p1 = a.zw;
    vec2 p2 = b.xy;
    vec2 p3 = b.zw;
    float omt = 1.0 - t;
    return omt * omt * omt * p0 + 3.0 * omt * omt * t * p1 + 3.0 * omt * t * t * p2 + t * t * t * p3;
}

vec2 bezierTangent(int index, float t) {
    vec4 a = guideA(index);
    vec4 b = guideB(index);
    vec2 p0 = a.xy;
    vec2 p1 = a.zw;
    vec2 p2 = b.xy;
    vec2 p3 = b.zw;
    float omt = 1.0 - t;
    return 3.0 * omt * omt * (p1 - p0) + 6.0 * omt * t * (p2 - p1) + 3.0 * t * t * (p3 - p2);
}

vec2 guideNormalAspect(int index, float t, float aspect) {
    vec2 tangent = bezierTangent(index, t);
    tangent.x *= aspect;
    return normalize(vec2(-tangent.y, tangent.x) + vec2(0.00001, 0.0));
}

vec2 streakPointAspect(int index, float t, float aspect, float laneOffset, float bend, float phase) {
    vec2 point = bezierPoint(index, t);
    point.x *= aspect;
    vec2 normal = guideNormalAspect(index, t, aspect);
    float bendEnvelope = 4.0 * t * (1.0 - t);
    float microBend = sin(t * PI * 2.0 + phase) * bend * 0.28;
    return point + normal * (laneOffset + bend * bendEnvelope + microBend);
}

vec2 quadraticPoint(vec2 a, vec2 b, vec2 c, float t) {
    float omt = 1.0 - t;
    return omt * omt * a + 2.0 * omt * t * b + t * t * c;
}

float hash11(float p) {
    return fract(sin(p * 127.1 + uSeed * 19.19) * 43758.5453123);
}

float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 19.19) * 43758.5453123);
}

vec2 hash22(vec2 p) {
    return vec2(hash21(p + 17.17), hash21(p + 61.61));
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec2 rotate2d(vec2 v, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

float familyMask(float family, float target) {
    return 1.0 - step(0.5, abs(family - target));
}

float segmentDistance(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.00001), 0.0, 1.0);
    return length(pa - ba * h);
}

struct GuideHit {
    float dist;
    float t;
};

GuideHit nearestStreak(vec2 p, int index, float aspect, float laneOffset, float bend, float phase) {
    float bestDist = 999.0;
    float bestArc = 0.0;
    float totalArc = 0.0;
    vec2 prev = streakPointAspect(index, 0.0, aspect, laneOffset, bend, phase);

    for (int stepIndex = 1; stepIndex <= GUIDE_STEPS; stepIndex++) {
        float t = float(stepIndex) / float(GUIDE_STEPS);
        vec2 next = streakPointAspect(index, t, aspect, laneOffset, bend, phase);
        vec2 q = p;
        q.x *= aspect;
        vec2 segment = next - prev;
        float segmentLength = length(segment);
        vec2 pa = q - prev;
        float h = clamp(dot(pa, segment) / max(dot(segment, segment), 0.00001), 0.0, 1.0);
        float d = length(pa - segment * h);

        if (d < bestDist) {
            bestDist = d;
            bestArc = totalArc + segmentLength * h;
        }

        totalArc += segmentLength;
        prev = next;
    }

    GuideHit hit;
    hit.dist = bestDist;
    hit.t = bestArc / max(totalArc, 0.00001);
    return hit;
}

GuideHit nearestMotionStreak(vec2 p, vec2 tail, vec2 control, vec2 head, float aspect) {
    float bestDist = 999.0;
    float bestArc = 0.0;
    float totalArc = 0.0;
    vec2 q = p;
    q.x *= aspect;
    vec2 prev = tail;

    for (int stepIndex = 1; stepIndex <= 16; stepIndex++) {
        float t = float(stepIndex) / 16.0;
        vec2 next = quadraticPoint(tail, control, head, t);
        vec2 segment = next - prev;
        float segmentLength = length(segment);
        vec2 pa = q - prev;
        float h = clamp(dot(pa, segment) / max(dot(segment, segment), 0.00001), 0.0, 1.0);
        float d = length(pa - segment * h);

        if (d < bestDist) {
            bestDist = d;
            bestArc = totalArc + segmentLength * h;
        }

        totalArc += segmentLength;
        prev = next;
    }

    GuideHit hit;
    hit.dist = bestDist;
    hit.t = bestArc / max(totalArc, 0.00001);
    return hit;
}

GuideHit nearestLineStreak(vec2 p, vec2 tail, vec2 head) {
    vec2 segment = head - tail;
    float h = clamp(dot(p - tail, segment) / max(dot(segment, segment), 0.00001), 0.0, 1.0);

    GuideHit hit;
    hit.dist = length(p - (tail + segment * h));
    hit.t = h;
    return hit;
}

float midBandParallax(int bandIndex) {
    if (bandIndex == 0) return 0.42;
    if (bandIndex == 1) return 0.66;
    return 0.86;
}

float midBandLengthRatio(int bandIndex) {
    if (bandIndex == 0) return 0.33;
    if (bandIndex == 1) return 0.51;
    return 0.68;
}

float midBandWidthRatio(int bandIndex) {
    if (bandIndex == 0) return 0.7;
    if (bandIndex == 1) return 0.95;
    return 1.18;
}

float midBandDensityWeight(int bandIndex) {
    if (bandIndex == 0) return 0.82;
    if (bandIndex == 1) return 0.58;
    return 0.26;
}

float midBandCellSize(int bandIndex) {
    if (bandIndex == 0) return 0.054;
    if (bandIndex == 1) return 0.078;
    return 0.118;
}

float midBandContrast(int bandIndex) {
    if (bandIndex == 0) return 0.13;
    if (bandIndex == 1) return 0.28;
    return 0.24;
}

float midBandGuideInfluence(int bandIndex) {
    if (bandIndex == 0) return 0.30;
    if (bandIndex == 1) return 0.45;
    return 0.58;
}

float midBandValue(vec3 values, int bandIndex) {
    if (bandIndex == 0) return values.x;
    if (bandIndex == 1) return values.y;
    return values.z;
}

float midBandEnabled(int bandIndex) {
    if (bandIndex == 0) return uMidBandEnabled.x;
    if (bandIndex == 1) return uMidBandEnabled.y;
    return uMidBandEnabled.z;
}

int midGuideIndex(int slot) {
    if (slot <= 0) return 1;
    if (slot == 1) return 3;
    if (slot == 2) return 5;
    if (slot == 3) return 7;
    return 9;
}

int midGuideSlot(vec2 slotPoint, vec2 cell, float bandSeed) {
    float column = clamp(slotPoint.x / uDesignAspect, 0.0, 0.999);
    int slot = int(floor(column * float(MID_GUIDE_COUNT)));
    float shiftRoll = hash21(cell + bandSeed + 31.0);

    if (shiftRoll < 0.18) {
        slot -= 1;
    } else if (shiftRoll > 0.82) {
        slot += 1;
    }

    if (slot < 0) return 0;
    if (slot > MID_GUIDE_COUNT - 1) return MID_GUIDE_COUNT - 1;
    return slot;
}

float midGuideFixedOffset(int slot) {
    if (slot == 0) return -0.014;
    if (slot == 1) return 0.011;
    if (slot == 2) return -0.006;
    if (slot == 3) return 0.013;
    return -0.010;
}

float softLineMask(float dist, float width, float feather) {
    return 1.0 - smoothstep(width, width + feather, dist);
}

float wrapIntoRange(float value, float minValue, float maxValue) {
    float span = max(maxValue - minValue, 0.00001);
    return mod(mod(value - minValue, span) + span, span) + minValue;
}

float trackSegmentMask(float t, float start, float length) {
    return step(start, t) * step(t, start + length);
}

float trackSegmentCoord(float t, float start, float length) {
    return clamp((t - start) / max(length, 0.00001), 0.0, 1.0);
}

float endpointEnvelope(float s) {
    float head = smoothstep(0.0, 0.12, s);
    float tail = 1.0 - smoothstep(0.88, 1.0, s);
    return head * tail;
}

float centeredInfluence(float value, float influence) {
    return max(0.05, 1.0 + (value - 0.5) * 2.0 * influence);
}

float midClusterWeight(vec2 qCenter, int bandIndex) {
    float bandSeed = float(bandIndex) * 19.73;
    vec2 clusterFlow = vec2(uMeanWind.x * 0.08, 0.16) * uTime + uGustAdvectionVelocity * uTime * 0.12;
    float noise = valueNoise(qCenter / MID_CLUSTER_SCALE - clusterFlow + bandSeed);
    return mix(1.0 - MID_CLUSTER_STRENGTH, 1.0 + MID_CLUSTER_STRENGTH, noise);
}

float midStreakSample(vec2 p, vec2 transportedP, vec2 neighborCell, int bandIndex, vec2 baseDir, vec2 guideResolution) {
    float bandSeed = float(bandIndex) * 131.31;
    float cellSize = midBandCellSize(bandIndex);
    vec2 cell = floor(transportedP / cellSize) + neighborCell;
    float parallax = midBandParallax(bandIndex);
    vec2 velocity = baseDir * uMidSpeedPerSecond * 0.42 * parallax;
    vec2 jitter = 0.08 + hash22(cell + bandSeed + 2.0) * 0.84;
    vec2 qCenter = (cell + jitter) * cellSize;
    vec2 baseCenter = qCenter + velocity * uTime;
    float trackT = clamp(baseCenter.y, 0.0, 1.0);
    float windowLength = mix(MID_WINDOW_LENGTH_MIN, MID_WINDOW_LENGTH_MAX, hash21(cell + bandSeed + 41.0));
    float windowStart = hash21(cell + bandSeed + 43.0);
    float windowCoord = fract(trackT - windowStart + 1.0);
    float windowFade = min(windowLength * 0.16, 0.065);
    float windowMask = smoothstep(0.0, windowFade, windowCoord) * (1.0 - smoothstep(windowLength - windowFade, windowLength, windowCoord));
    if (windowMask <= 0.001) {
        return 0.0;
    }

    int guideSlot = midGuideSlot(baseCenter, cell, bandSeed);
    int guideIndex = midGuideIndex(guideSlot);
    vec2 curvePoint = bezierPoint(guideIndex, trackT);
    vec4 guideStart = guideA(guideIndex);
    vec4 guideEnd = guideB(guideIndex);
    vec2 chordStart = guideStart.xy;
    vec2 chordEnd = guideEnd.zw;
    curvePoint.x *= uDesignAspect;
    chordStart.x *= uDesignAspect;
    chordEnd.x *= uDesignAspect;
    vec2 chordPoint = mix(chordStart, chordEnd, trackT);
    vec2 guidePoint = mix(curvePoint, chordPoint, MID_GUIDE_CURVE_BLEND);
    vec2 curveTangent = bezierTangent(guideIndex, trackT);
    curveTangent.x *= uDesignAspect;
    vec2 guideTangent = normalize(mix(curveTangent, chordEnd - chordStart, MID_GUIDE_CURVE_BLEND) + vec2(0.00001, 0.00001));
    if (dot(guideTangent, baseDir) < 0.0) {
        guideTangent *= -1.0;
    }
    vec2 guideNormal = normalize(vec2(-guideTangent.y, guideTangent.x) + vec2(0.00001, 0.0));
    guidePoint += guideNormal * midGuideFixedOffset(guideSlot);
    float lateralDistance = abs(dot(baseCenter - guidePoint, guideNormal));
    float laneSpread = mix(0.092, 0.168, parallax);
    float laneCore = exp(-pow(lateralDistance / max(laneSpread, 0.001), 2.0));
    float laneHalo = exp(-pow(lateralDistance / max(laneSpread * 2.35, 0.001), 2.0)) * 0.34;
    float laneProfile = clamp(laneCore + laneHalo, 0.0, 1.0);
    float laneWeight = mix(MID_LANE_WEIGHT_MIN, MID_LANE_WEIGHT_MAX, laneProfile);
    float laneOffset = mix(-laneSpread * 0.82, laneSpread * 0.82, hash21(cell + bandSeed + 37.0));
    vec2 guidedCenter = guidePoint + guideNormal * laneOffset;
    float guidePull = midBandGuideInfluence(bandIndex) * (1.0 - smoothstep(laneSpread * 1.05, laneSpread * 2.45, lateralDistance)) * 0.72;
    vec2 center = mix(baseCenter, guidedCenter, clamp(guidePull, 0.0, 0.62));
    float cluster = midClusterWeight(qCenter, bandIndex);
    float sizeRank = pow(hash21(cell + bandSeed + 7.0), 1.35);
    float speedRank = mix(0.92, 1.12, sizeRank);
    float midLength = max(midBandValue(uMidLength, bandIndex), 0.001);
    float bandLengthBase = midLength * midBandLengthRatio(bandIndex);
    float lengthDensityCompensation = clamp(0.065 / max(bandLengthBase, 0.004), 0.55, 1.25);
    float windowDensityCompensation = clamp(0.48 / max(windowLength, 0.001), 0.72, 1.35);
    float chance = clamp(
        midBandDensityWeight(bandIndex) * midBandValue(uMidDensity, bandIndex) * cluster * laneWeight * lengthDensityCompensation * windowDensityCompensation,
        0.0,
        MID_EXISTENCE_CHANCE_CAP
    );
    float existenceRoll = hash21(cell + bandSeed + 5.0);
    float exists = smoothstep(existenceRoll - 0.035, existenceRoll + 0.035, chance);
    float lengthJitter = mix(0.9, 1.13, hash21(cell + bandSeed + 11.0));
    float length = clamp(bandLengthBase * speedRank * lengthJitter, 0.0035, max(0.008, midLength * 0.82));
    float widthPx = midBandValue(uMidWidth, bandIndex) * midBandWidthRatio(bandIndex) * mix(0.82, 1.18, sizeRank);
    float width = max(0.45 / max(guideResolution.y, 1.0), widthPx / max(guideResolution.y, 1.0));
    float feather = max(0.35 / max(guideResolution.y, 1.0), width * 0.46);
    vec2 windNoiseUv = qCenter / max(uSpatialWindScale, 0.05) + uGustAdvectionVelocity * uTime / max(uGustCoherenceTime, 0.05);
    float gustAngle = (valueNoise(windNoiseUv + bandSeed * 0.23) - 0.5) * uGustAmplitude * 1.2;
    float individualAngle = (hash21(cell + bandSeed + 13.0) - 0.5) * 2.0 * uMidDirectionSpread * mix(0.65, 1.1, parallax);
    vec2 guidedDir = normalize(mix(baseDir, guideTangent, midBandGuideInfluence(bandIndex) * mix(0.65, 1.0, laneProfile)) + vec2(0.00001, 0.00001));
    vec2 dir = normalize(rotate2d(guidedDir, gustAngle + individualAngle));
    vec2 tail = center - dir * length * 0.5;
    vec2 head = center + dir * length * 0.5;
    GuideHit hit = nearestLineStreak(p, tail, head);
    float core = softLineMask(hit.dist, width, feather);
    float outer = softLineMask(hit.dist, width + feather * 1.55, feather) * 0.16;
    float envelope = endpointEnvelope(hit.t);
    float family = hash21(cell + bandSeed + 17.0);
    float phase = hash21(cell + bandSeed + 19.0);
    float broken = mix(1.0, 0.64 + 0.36 * step(0.34, fract(hit.t * 4.0 + phase)), step(0.88, family) * (1.0 - step(0.97, family)));
    float headBias = mix(1.0, 0.88 + 0.2 * hit.t, step(0.97, family));
    float brightRank = mix(0.56, 1.0, hash21(cell + bandSeed + 23.0)) + step(0.94, hash21(cell + bandSeed + 29.0)) * 0.18;
    float alpha = midBandValue(uMidStrength, bandIndex) * midBandContrast(bandIndex) * brightRank * headBias;
    return (core + outer) * envelope * broken * alpha * exists * windowMask;
}

void main(void) {
    vec2 uv = vFilterCoord;
    vec2 guideUv = (uv - uRainFrameMin) / uRainFrameSize;
    vec2 guideResolution = max(vec2(1.0), uGuideResolution);
    vec2 rainUv = clamp(guideUv, 0.0, 1.0);

    vec3 bg = vec3(0.0);
    vec3 rainColor = uRainBaseColor;
    float midRainAlpha = 0.0;
    float rainAlpha = 0.0;

    float screenPixelWorld = 1.0 / max(guideResolution.y, 1.0);

    if (uShowMidRain > 0.5) {
        vec2 midP = rainUv;
        midP.x *= uDesignAspect;
        vec2 baseDir = normalize(vec2(uMeanWind.x * 0.34, 1.0));

        for (int bandIndex = 0; bandIndex < MID_BAND_COUNT; bandIndex++) {
            if (midBandEnabled(bandIndex) < 0.5) {
                continue;
            }

            vec2 velocity = baseDir * uMidSpeedPerSecond * 0.42 * midBandParallax(bandIndex);
            vec2 transportedP = midP - velocity * uTime;

            for (int cellY = -1; cellY <= 1; cellY++) {
                for (int cellX = -1; cellX <= 1; cellX++) {
                    float sampleAlpha = midStreakSample(
                        midP,
                        transportedP,
                        vec2(float(cellX), float(cellY)),
                        bandIndex,
                        baseDir,
                        guideResolution
                    );
                    midRainAlpha = min(0.68, midRainAlpha + sampleAlpha * (1.0 - midRainAlpha * 0.48));
                }
            }
        }
    }

    if (uShowRain > 0.5) {
        for (int guideIndex = 0; guideIndex < GUIDE_COUNT; guideIndex++) {
            vec4 motion = trackA(guideIndex);

            if (motion.x < 0.5) {
                continue;
            }

            vec4 style = trackB(guideIndex);
            vec4 identityA = trackC(guideIndex);
            vec4 identityB = trackD(guideIndex);
            float shapeFamily = identityA.x;
            float brightnessRank = identityA.y;
            float phase = identityA.z;
            float laneOffset = identityA.w;
            float bend = identityB.x;
            float sizeRank = clamp(style.z, 0.0, 1.0);
            float softFamily = familyMask(shapeFamily, 1.0);
            float spotFamily = familyMask(shapeFamily, 2.0);
            float defocusFamily = familyMask(shapeFamily, 3.0);
            float arcFamily = familyMask(shapeFamily, 4.0);
            float sizeSpeedScale = centeredInfluence(sizeRank, NEAR_SIZE_SPEED_INFLUENCE);
            float speedScale = sizeSpeedScale;
            float shapeLengthScale = mix(1.0, 1.2, arcFamily);
            float length = clamp(motion.w * speedScale * shapeLengthScale, 0.001, 0.95);
            float tailT = wrapIntoRange(motion.y + length * 2.0 + motion.z * speedScale * uFrame, -length, 1.0);
            float headT = tailT + length;
            float visibleTailT = clamp(tailT, 0.0, 1.0);
            float visibleHeadT = clamp(headT, 0.0, 1.0);
            float visibleSpan = visibleHeadT - visibleTailT;
            float visible = step(tailT, 1.0) * step(0.0, headT) * step(0.0005, visibleSpan);
            vec2 tailPoint = streakPointAspect(guideIndex, visibleTailT, uDesignAspect, laneOffset, bend, phase);
            vec2 headPoint = streakPointAspect(guideIndex, visibleHeadT, uDesignAspect, laneOffset, bend, phase);
            vec2 tailNormal = guideNormalAspect(guideIndex, visibleTailT, uDesignAspect);
            vec2 headNormal = guideNormalAspect(guideIndex, visibleHeadT, uDesignAspect);
            float endpointShake = screenPixelWorld * mix(0.3, 0.55, sizeRank) * mix(1.0, 1.3, arcFamily);
            float headWave = 0.64 * sin(uFrame * 0.92 + phase) + 0.36 * sin(uFrame * 1.67 + phase * 1.37);
            float tailWave = 0.58 * sin(uFrame * 0.78 + phase + 1.73) + 0.31 * sin(uFrame * 1.43 + phase * 0.71);
            tailPoint += tailNormal * endpointShake * tailWave * 0.72;
            headPoint += headNormal * endpointShake * headWave;
            vec2 motionVector = headPoint - tailPoint;
            vec2 motionNormal = normalize(vec2(-motionVector.y, motionVector.x) + vec2(0.00001, 0.0));
            float controlSwing = sin(uFrame * 1.18 + phase * 2.11) * endpointShake * 0.65;
            vec2 controlPoint = (tailPoint + headPoint) * 0.5 + motionNormal * (bend * 0.32 + controlSwing);
            GuideHit rainHit = nearestMotionStreak(rainUv, tailPoint, controlPoint, headPoint, uDesignAspect);
            float along = visible;
            float s = rainHit.t;
            float baseEnvelope = endpointEnvelope(s);
            float softEnvelope = smoothstep(0.0, 0.18, s) * (1.0 - smoothstep(0.82, 1.0, s));
            float envelope = mix(baseEnvelope, softEnvelope, clamp(softFamily + defocusFamily, 0.0, 1.0));
            float id = float(guideIndex * 31);
            float sizeWidthScale = centeredInfluence(sizeRank, NEAR_SIZE_WIDTH_INFLUENCE);
            float widthScale = sizeWidthScale;
            float defocusScale = 1.0 + defocusFamily * 0.78;
            float rainWidth = max(0.0008, style.x * widthScale * defocusScale / max(guideResolution.y, 1.0));
            float rainFeather = max(0.55 / max(guideResolution.y, 1.0), rainWidth * mix(0.28, 0.62, defocusFamily));
            float core = softLineMask(rainHit.dist, rainWidth, rainFeather) * mix(1.0, 0.68, defocusFamily);
            float edge = softLineMask(rainHit.dist, rainWidth + rainFeather * 1.8, rainFeather) * mix(0.14, 0.28, defocusFamily);
            float spotCenter = 0.28 + hash11(id + phase * 3.7) * 0.42;
            float spotWidth = mix(0.15, 0.075, sizeRank);
            float lightSpot = exp(-pow((s - spotCenter) / spotWidth, 2.0)) * mix(0.04, 0.24, spotFamily);
            lightSpot += exp(-pow((s - fract(spotCenter + 0.38)) / 0.09, 2.0)) * spotFamily * 0.1;
            float stableBreak = mix(1.0, 0.78 + 0.22 * step(0.32, fract(s * 5.0 + phase)), spotFamily);
            float headBias = mix(1.0, 0.82 + 0.28 * s, clamp(spotFamily + arcFamily, 0.0, 1.0));
            float energy = clamp(1.0, uEnergyMin, uEnergyMax);
            float windLift = clamp(0.94 + abs(uMeanWind.x) * 0.22, 0.84, 1.16);
            float nearStrength = style.y;
            float intensity = clamp((0.82 * brightnessRank + lightSpot) * energy * windLift * mix(1.0, 0.66, defocusFamily), 0.0, NEAR_INTENSITY_CEILING);
            float streak = (core + edge) * along * envelope * stableBreak * headBias * nearStrength * intensity;
            rainAlpha = max(rainAlpha, streak);
        }
    }

    midRainAlpha = clamp(midRainAlpha * uOverallBrightness * uShowMidRain, 0.0, 0.68);
    rainAlpha = clamp(rainAlpha * uOverallBrightness * uShowRain, 0.0, 1.0);

#if OPAQUE_BACKGROUND
    vec3 color = bg;
#else
    vec3 color = vec3(0.0);
#endif
    vec3 midRainColor = uRainBaseColor;
    color += midRainColor * midRainAlpha;
    color += rainColor * rainAlpha;
    color = clamp(color, 0.0, 1.0);

#if OPAQUE_BACKGROUND
    finalColor = vec4(color, 1.0);
#else
    float outputAlpha = clamp(max(midRainAlpha, rainAlpha), 0.0, 1.0);
    finalColor = vec4(color, outputAlpha);
#endif
}
`;

type FilterUniforms = {
  uResolution: [number, number];
  uRainFrameMin: [number, number];
  uRainFrameSize: [number, number];
  uGuideResolution: [number, number];
  uDesignAspect: number;
  uTime: number;
  uFrame: number;
  uDensity: number;
  uSpeed: number;
  uDropLength: number;
  uDropWidth: number;
  uOverallBrightness: number;
  uJitter: number;
  uSeed: number;
  uEnergyMin: number;
  uEnergyMax: number;
  uMeanWind: [number, number];
  uGustAmplitude: number;
  uGustCoherenceTime: number;
  uGustAdvectionVelocity: [number, number];
  uSpatialWindScale: number;
  uMidDensity: [number, number, number];
  uMidStrength: [number, number, number];
  uMidSpeedPerSecond: number;
  uMidLength: [number, number, number];
  uMidWidth: [number, number, number];
  uMidDirectionSpread: number;
  uMidBandEnabled: [number, number, number];
  uRainBaseColor: [number, number, number];
  uShowRain: number;
  uShowMidRain: number;
  [key: `uGuideA${number}`]: number[];
  [key: `uGuideB${number}`]: number[];
  [key: `uTrackA${number}`]: number[];
  [key: `uTrackB${number}`]: number[];
  [key: `uTrackC${number}`]: number[];
  [key: `uTrackD${number}`]: number[];
};

function uniformDefinition(value: number | number[], type: string) {
  return { value, type };
}

function uniformType(value: number | number[]) {
  if (!Array.isArray(value)) return 'f32';
  if (value.length === 2) return 'vec2<f32>';
  if (value.length === 3) return 'vec3<f32>';
  return 'vec4<f32>';
}

function tracksToUniforms(settings: RainSettings, activeMask: boolean[]) {
  const values: Record<string, number[]> = {};

  Array.from({ length: guideCount }, (_, index) => index).forEach((index) => {
    const effectiveTrack = resolveRainTrack(settings, index);
    values[`uTrackA${index}`] = [
      activeMask[index] ? 1 : 0,
      effectiveTrack.startPosition,
      effectiveTrack.speedPerFrame,
      effectiveTrack.length,
    ];
    values[`uTrackB${index}`] = [
      effectiveTrack.width,
      effectiveTrack.strength,
      effectiveTrack.identity.sizeRank,
      0,
    ];
    values[`uTrackC${index}`] = [
      effectiveTrack.identity.shapeFamily,
      effectiveTrack.identity.brightnessRank,
      effectiveTrack.identity.phase,
      effectiveTrack.identity.laneOffset,
    ];
    values[`uTrackD${index}`] = [
      effectiveTrack.identity.bend,
      effectiveTrack.identity.diameter,
      effectiveTrack.identity.identitySeed,
      0,
    ];
  });

  return values;
}

function midBandValues(bands: MidRainBandSettings, key: keyof MidRainBandState): [number, number, number] {
  return [bands[0][key], bands[1][key], bands[2][key]];
}

function rainStateToUniforms(settings: RainSettings, width: number, height: number) {
  const globalRain = resolveGlobalRainState(settings, [width, height]);
  const midSpeedPerSecond = globalRain.midRain.speedPerFrame / Math.max(globalRain.time.frameDelta, 0.0001);
  const midRainBands = globalRain.midRain.bands;

  return {
    uEnergyMin: globalRain.nearStreaks.energyMin,
    uEnergyMax: globalRain.nearStreaks.energyMax,
    uMeanWind: globalRain.dynamics.meanWind,
    uGustAmplitude: globalRain.dynamics.gustAmplitude,
    uGustCoherenceTime: globalRain.dynamics.gustCoherenceTime,
    uGustAdvectionVelocity: globalRain.dynamics.gustAdvectionVelocity,
    uSpatialWindScale: globalRain.dynamics.spatialWindScale,
    uMidDensity: midBandValues(midRainBands, 'density'),
    uMidStrength: midBandValues(midRainBands, 'strength'),
    uMidSpeedPerSecond: midSpeedPerSecond,
    uMidLength: midBandValues(midRainBands, 'length'),
    uMidWidth: midBandValues(midRainBands, 'width'),
    uMidDirectionSpread: globalRain.midRain.directionSpread,
    uMidBandEnabled: [
      settings.midRainBands[0] ? 1 : 0,
      settings.midRainBands[1] ? 1 : 0,
      settings.midRainBands[2] ? 1 : 0,
    ] as [number, number, number],
    uRainBaseColor: resolveRainBaseColor(globalRain.rainColor),
  };
}

function rainViewportToUniforms(width: number, height: number) {
  const viewport = resolveRainViewportCover(width, height);
  return {
    uRainFrameMin: viewport.frameMin,
    uRainFrameSize: viewport.frameSize,
    uGuideResolution: viewport.guideResolution,
    uDesignAspect: viewport.designAspect,
  };
}

function frameToSeconds(settings: RainSettings, frame: number) {
  return Math.max(0, frame) / Math.max(1, settings.previewFps);
}

function createFragmentShader(opaqueBackground = false) {
  return fragmentShader.replace(
    '#version 300 es',
    `#version 300 es\n#define OPAQUE_BACKGROUND ${opaqueBackground ? 1 : 0}`,
  );
}

function layerVisibility(settings: RainSettings, layer: PixelRainLayer) {
  return {
    showRain: layer === 'near' && settings.showRain,
    showMidRain: layer === 'mid' && settings.showMidRain,
  };
}

export class PixelRainFilter {
  readonly filter: Filter;
  private readonly uniforms: FilterUniforms;
  private readonly selectionRuntime = createRainTrackSelectionRuntime(guideCount);
  private readonly layer: PixelRainLayer;
  private startTime = performance.now();
  private settings: RainSettings;
  private width: number;
  private height: number;

  constructor(settings: RainSettings, width: number, height: number, options: PixelRainFilterOptions) {
    this.layer = options.layer;
    const guideUniforms = guidesToUniforms(buildGuides(settings));
    const activeMask = resolveRainTrackActiveMask(settings, settings.currentFrame, this.selectionRuntime, guideCount);
    const trackUniforms = tracksToUniforms(settings, activeMask);
    const rainStateUniforms = rainStateToUniforms(settings, width, height);
    const rainViewportUniforms = rainViewportToUniforms(width, height);
    const visibility = layerVisibility(settings, this.layer);
    const uniforms: FilterUniforms = {
      uResolution: [width, height],
      ...rainViewportUniforms,
      uTime: settings.playbackMode === 'manual' ? frameToSeconds(settings, settings.currentFrame) : 0,
      uFrame: settings.currentFrame,
      uDensity: 0,
      uSpeed: 0,
      uDropLength: 0,
      uDropWidth: 1,
      uOverallBrightness: settings.overallBrightness,
      uJitter: 0,
      uSeed: internalRainSeed,
      ...rainStateUniforms,
      uShowRain: visibility.showRain ? 1 : 0,
      uShowMidRain: visibility.showMidRain ? 1 : 0,
      ...guideUniforms,
      ...trackUniforms,
    } as FilterUniforms;

    this.width = width;
    this.height = height;
    this.settings = settings;
    if (typeof document === "undefined") {
      this.uniforms = uniforms;
      this.filter = {
        resources: { rainUniforms: { uniforms } },
        destroy: () => undefined,
      } as unknown as Filter;
      return;
    }

    this.filter = new Filter({
      glProgram: GlProgram.from({
        vertex: vertexShader,
        fragment: createFragmentShader(Boolean(options.opaqueBackground)),
        name: `v-ronpa-rain-${options.layer}-shader`,
      }),
      blendMode: options.opaqueBackground ? "normal" : "add",
      resolution: options.resolution ?? 1,
      resources: {
        rainUniforms: Object.fromEntries(
          Object.entries(uniforms).map(([key, value]) => [
            key,
            uniformDefinition(value, uniformType(value)),
          ]),
        ),
      },
    });
    this.uniforms = this.filter.resources.rainUniforms.uniforms as FilterUniforms;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.uniforms.uResolution = [width, height];
    Object.assign(this.uniforms, rainViewportToUniforms(width, height));
    this.sync('uResolution');
    this.sync('uRainFrameMin');
    this.sync('uRainFrameSize');
    this.sync('uGuideResolution');
    this.sync('uDesignAspect');
  }

  updateTime(now = performance.now()) {
    if (this.settings.playbackMode === 'manual') return;

    const elapsedSeconds = Math.max(0, (now - this.startTime) / 1000);
    const frame = Math.floor(elapsedSeconds * Math.max(1, this.settings.previewFps));
    this.uniforms.uTime = elapsedSeconds;
    this.uniforms.uFrame = frame;
    this.sync('uTime');
    this.sync('uFrame');
    this.syncTrackActiveMask(frame);
  }

  updateFrame(frame: number) {
    this.uniforms.uFrame = frame;
    this.sync('uFrame');
    if (this.settings.playbackMode === 'manual') {
      this.uniforms.uTime = frameToSeconds(this.settings, frame);
      this.sync('uTime');
    }
    this.syncTrackActiveMask(frame);
  }

  updateSettings(settings: RainSettings) {
    const guideUniforms = guidesToUniforms(buildGuides(settings));
    const frame = settings.playbackMode === 'manual' ? settings.currentFrame : this.uniforms.uFrame;
    const activeMask = resolveRainTrackActiveMask(settings, frame, this.selectionRuntime, guideCount);
    const trackUniforms = tracksToUniforms(settings, activeMask);
    const rainStateUniforms = rainStateToUniforms(settings, this.width, this.height);
    const visibility = layerVisibility(settings, this.layer);
    this.settings = settings;

    Object.assign(this.uniforms, {
      uTime: settings.playbackMode === 'manual' ? frameToSeconds(settings, frame) : this.uniforms.uTime,
      uFrame: frame,
      uDensity: 0,
      uSpeed: 0,
      uDropLength: 0,
      uDropWidth: 1,
      uOverallBrightness: settings.overallBrightness,
      uJitter: 0,
      uSeed: internalRainSeed,
      ...rainStateUniforms,
      uShowRain: visibility.showRain ? 1 : 0,
      uShowMidRain: visibility.showMidRain ? 1 : 0,
      ...guideUniforms,
      ...trackUniforms,
    });

    Object.keys(this.uniforms).forEach((key) => this.sync(key as keyof FilterUniforms));
  }

  private syncTrackActiveMask(frame: number) {
    if (this.layer === 'mid') return;

    const activeMask = resolveRainTrackActiveMask(this.settings, frame, this.selectionRuntime, guideCount);

    activeMask.forEach((enabled, index) => {
      const key = `uTrackA${index}` as `uTrackA${number}`;
      const current = this.uniforms[key];
      if (!current) return;

      const nextEnabled = enabled ? 1 : 0;
      if (current[0] === nextEnabled) return;

      this.uniforms[key] = [nextEnabled, current[1] ?? 0, current[2] ?? 0, current[3] ?? 0];
      this.sync(key);
    });
  }

  private sync(key: keyof FilterUniforms) {
    const resource = (this.filter.resources as any).rainUniforms;
    if (resource?.uniforms && key in resource.uniforms) {
      resource.uniforms[key] = this.uniforms[key];
    }
  }
}

export function getGuideCount() {
  return guideCount;
}
