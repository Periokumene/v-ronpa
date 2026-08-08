import {
  Filter,
  GlProgram,
  Texture,
  TexturePool,
  type FilterSystem,
  type RenderSurface
} from "pixi.js";

export type EffectLabShaderMode =
  | "waterVeil" | "pulse" | "staticFilter" | "vignette"
  | "impact" | "afterimage" | "shutter" | "flicker" | "signalMask";

const MODE: Record<EffectLabShaderMode, number> = {
  waterVeil: 0, pulse: 1, staticFilter: 2, vignette: 3,
  impact: 4, afterimage: 5, shutter: 6, flicker: 7, signalMask: 8
};

export interface EffectLabUniforms {
  uMode: number;
  uTime: number;
  uPhase: number;
  uProgress: number;
  uResolution: Float32Array;
  uHistoryClamp: Float32Array;
  uOrigin: Float32Array;
  uColor: Float32Array;
  uPower: number;
  uA: number;
  uB: number;
  uC: number;
  uD: number;
  uE: number;
  uF: number;
  uG: number;
  uH: number;
  uSeed: number;
}

export interface EffectLabFilter {
  resources: { effectLabUniforms: { uniforms: EffectLabUniforms } };
  padding?: number;
  requestHistoryCapture?(): void;
  destroy(destroyPrograms?: boolean): void;
}

export interface EffectLabShaderRecord { filter: EffectLabFilter; uniforms: EffectLabUniforms }

export function createEffectLabFilter(mode: EffectLabShaderMode, width: number, height: number): EffectLabShaderRecord {
  const uniforms: EffectLabUniforms = {
    uMode: MODE[mode], uTime: 0, uPhase: 0, uProgress: 0,
    uResolution: new Float32Array([width, height]), uHistoryClamp: new Float32Array([0, 0, 1, 1]),
    uOrigin: new Float32Array([0.5, 0.5]),
    uColor: new Float32Array([1, 1, 1]),
    uPower: 1, uA: 0, uB: 0, uC: 0, uD: 0, uE: 0, uF: 0, uG: 0, uH: 0, uSeed: 1
  };
  if (typeof document === "undefined") {
    return { filter: { resources: { effectLabUniforms: { uniforms } }, requestHistoryCapture: () => undefined, destroy: () => undefined }, uniforms };
  }
  const resources = {
    effectLabUniforms: {
      uMode: { value: uniforms.uMode, type: "f32" }, uTime: { value: uniforms.uTime, type: "f32" },
      uPhase: { value: uniforms.uPhase, type: "f32" },
      uProgress: { value: uniforms.uProgress, type: "f32" }, uResolution: { value: uniforms.uResolution, type: "vec2<f32>" },
      uHistoryClamp: { value: uniforms.uHistoryClamp, type: "vec4<f32>" },
      uOrigin: { value: uniforms.uOrigin, type: "vec2<f32>" }, uColor: { value: uniforms.uColor, type: "vec3<f32>" },
      uPower: { value: uniforms.uPower, type: "f32" },
      uA: { value: uniforms.uA, type: "f32" }, uB: { value: uniforms.uB, type: "f32" },
      uC: { value: uniforms.uC, type: "f32" }, uD: { value: uniforms.uD, type: "f32" },
      uE: { value: uniforms.uE, type: "f32" }, uF: { value: uniforms.uF, type: "f32" },
      uG: { value: uniforms.uG, type: "f32" }, uH: { value: uniforms.uH, type: "f32" },
      uSeed: { value: uniforms.uSeed, type: "f32" }
    },
    uHistoryTexture: Texture.EMPTY.source,
    uHistorySampler: Texture.EMPTY.source.style
  };
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: `v-ronpa-effect-lab-${mode}` }),
    resources
  });
  filter.padding = mode === "pulse" || mode === "afterimage" || mode === "impact" ? 32 : 0;
  if (mode === "pulse" || mode === "afterimage") installHistoryPass(filter, resources);
  return { filter: filter as unknown as EffectLabFilter, uniforms: filter.resources.effectLabUniforms.uniforms as EffectLabUniforms };
}

function installHistoryPass(
  filter: Filter,
  resources: { uHistoryTexture: Texture["source"]; uHistorySampler: Texture["source"]["style"] }
): void {
  const copyFilter = new Filter({
    glProgram: GlProgram.from({ vertex: VERTEX, fragment: COPY_FRAGMENT, name: "v-ronpa-effect-lab-history-copy" }),
    resources: {}
  });
  let history: Texture | undefined;
  let capturedWidth = 0;
  let capturedHeight = 0;
  let capturedResolution = 0;
  let captureRequested = true;
  const originalApply = filter.apply.bind(filter);
  const originalDestroy = filter.destroy.bind(filter);
  filter.apply = (filterManager: FilterSystem, input: Texture, output: RenderSurface, clearMode: boolean) => {
    const historyResolution = Math.max(0.5, input.source.resolution * 0.5);
    if (
      captureRequested || !history || capturedWidth !== input.width || capturedHeight !== input.height ||
      capturedResolution !== historyResolution
    ) {
      if (history) TexturePool.returnTexture(history);
      history = TexturePool.getOptimalTexture(input.width, input.height, historyResolution, false);
      filterManager.applyFilter(copyFilter, input, history, true);
      resources.uHistoryTexture = history.source;
      resources.uHistorySampler = history.source.style;
      (filter.resources as typeof resources).uHistoryTexture = history.source;
      (filter.resources as typeof resources).uHistorySampler = history.source.style;
      const halfPixelX = 0.5 / Math.max(1, history.source.pixelWidth);
      const halfPixelY = 0.5 / Math.max(1, history.source.pixelHeight);
      const historyClamp = filter.resources.effectLabUniforms.uniforms.uHistoryClamp;
      historyClamp[0] = halfPixelX;
      historyClamp[1] = halfPixelY;
      historyClamp[2] = history.frame.width / history.source.width - halfPixelX;
      historyClamp[3] = history.frame.height / history.source.height - halfPixelY;
      capturedWidth = input.width;
      capturedHeight = input.height;
      capturedResolution = historyResolution;
      captureRequested = false;
    }
    originalApply(filterManager, input, output, clearMode);
  };
  (filter as Filter & { requestHistoryCapture(): void }).requestHistoryCapture = () => { captureRequested = true; };
  filter.destroy = (destroyPrograms?: boolean) => {
    if (history) {
      TexturePool.returnTexture(history);
      history = undefined;
    }
    copyFilter.destroy(destroyPrograms);
    originalDestroy(destroyPrograms);
  };
}

export function setEffectLabResolution(record: EffectLabShaderRecord, width: number, height: number): void {
  record.uniforms.uResolution[0] = Math.max(1, width);
  record.uniforms.uResolution[1] = Math.max(1, height);
}

export function setEffectLabColor(target: Float32Array, value: string): void {
  const normalized = value.trim().replace(/^#/, "");
  const hex = normalized.length === 3
    ? normalized.split("").map((part) => part + part).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  const parsed = Number.parseInt(hex, 16);
  target[0] = ((parsed >> 16) & 255) / 255;
  target[1] = ((parsed >> 8) & 255) / 255;
  target[2] = (parsed & 255) / 255;
}

const VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vLocalCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) { return aPosition * (uOutputFrame.zw * uInputSize.zw); }
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
  vLocalCoord = aPosition;
}
`;

const FRAGMENT = `
precision highp float;
in vec2 vTextureCoord;
in vec2 vLocalCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uHistoryTexture;
uniform vec4 uInputClamp;
uniform vec4 uHistoryClamp;
uniform float uMode; uniform float uTime; uniform float uPhase; uniform float uProgress; uniform vec2 uResolution; uniform vec2 uOrigin;
uniform vec3 uColor; uniform float uPower; uniform float uA; uniform float uB; uniform float uC;
uniform float uD; uniform float uE; uniform float uF; uniform float uG; uniform float uH; uniform float uSeed;

float hash11(float p) { return fract(sin(p * 127.1 + uSeed * 311.7) * 43758.5453123); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)) + uSeed * 73.13) * 43758.5453123); }
float noise21(vec2 p) { vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1)),f.x),f.y); }
float luminance(vec3 c) { return dot(c, vec3(0.2126,0.7152,0.0722)); }
vec2 inputUv(vec2 localUv) {
  vec2 frameScale=uInputClamp.xy+uInputClamp.zw;
  return clamp(localUv*frameScale,uInputClamp.xy,uInputClamp.zw);
}
vec3 currentAt(vec2 localUv) { return texture(uTexture,inputUv(localUv)).rgb; }
vec4 currentSampleAt(vec2 localUv) { return texture(uTexture,inputUv(localUv)); }
vec3 straightRgb(vec4 sampleColor) { return sampleColor.a > 0.00001 ? sampleColor.rgb / sampleColor.a : vec3(0.0); }
vec3 currentStraightAt(vec2 localUv) { return straightRgb(currentSampleAt(localUv)); }
vec3 historyAt(vec2 localUv) {
  vec2 frameScale=uHistoryClamp.xy+uHistoryClamp.zw;
  return texture(uHistoryTexture,clamp(localUv*frameScale,uHistoryClamp.xy,uHistoryClamp.zw)).rgb;
}
vec4 historySampleAt(vec2 localUv) {
  vec2 frameScale=uHistoryClamp.xy+uHistoryClamp.zw;
  return texture(uHistoryTexture,clamp(localUv*frameScale,uHistoryClamp.xy,uHistoryClamp.zw));
}
float edgeAt(vec2 uv, float radius) {
  vec2 px = max(vec2(1.0), uResolution); vec2 d = vec2(radius) / px;
  float l = luminance(currentAt(uv));
  float gx = luminance(currentAt(uv+vec2(d.x,0)))-luminance(currentAt(uv-vec2(d.x,0)));
  float gy = luminance(currentAt(uv+vec2(0,d.y)))-luminance(currentAt(uv-vec2(0,d.y)));
  return clamp(length(vec2(gx,gy))*4.2 + max(0.0,l-0.72)*1.8,0.0,1.0);
}
vec3 palette(vec3 c, float id) {
  float l=luminance(c);
  if (id < 0.5) return mix(vec3(l)*vec3(0.72,0.9,1.08), c*vec3(0.84,0.94,1.08), 0.55);
  if (id < 1.5) return vec3(l)*vec3(1.08,0.87,0.62)+c*0.18;
  if (id < 2.5) return vec3(l*0.48,l*1.02,l*0.58)+c*0.12;
  return vec3(l);
}
float doubleBeat(float phase) {
  float t=fract(phase);
  float main=exp(-max(0.0,t-0.054)*9.13)*smoothstep(0.0,0.054,t);
  float secondary=0.35*exp(-max(0.0,t-0.391)*11.74)*smoothstep(0.330,0.391,t);
  return clamp(main+secondary,0.0,1.0);
}
void main(void) {
  vec2 uv=vLocalCoord; float power=clamp(uPower,0.0,1.0); vec4 source=texture(uTexture,vTextureCoord);
  if (uMode < 0.5) {
    float flow=noise21(vec2(uv.x*5.0+uPhase,uv.y*3.0-uTime*0.08))+0.5*noise21(vec2(uv.x*17.0-uTime*0.03,uv.y*11.0+uPhase));
    vec2 dropCells=vec2(uv.x*14.0,uv.y*4.0); vec2 dropId=floor(dropCells); vec2 dropUv=fract(dropCells);
    float dropRnd=hash21(dropId+vec2(17.0,31.0)); float dropY=fract(uTime*mix(0.08,0.19,dropRnd)+dropRnd);
    float dropX=dropUv.x-0.5+sin(uTime*0.31+dropRnd*9.0)*0.06; float dropDelta=dropUv.y-dropY;
    float head=1.0-smoothstep(0.035,0.095,length(vec2(dropX*0.72,dropDelta)));
    float trail=(1.0-smoothstep(0.012,0.038,abs(dropX)))*smoothstep(0.0,0.06,dropDelta)*(1.0-smoothstep(0.08,0.72,dropDelta));
    float track=(head+trail*0.72)*step(1.0-uF,dropRnd);
    vec2 displacement=vec2((flow-0.75)*uB+track*0.28,(noise21(uv*13.0+uTime)-0.5)*uB*0.28+head*0.12)*0.018*power;
    vec2 wetUv=clamp(uv+displacement,0.0,1.0); vec3 wet=currentAt(wetUv);
    vec2 blurStep=vec2(displacement.x*0.45, (0.8+track*2.0)/max(1.0,uResolution.y))*uC*power;
    vec3 directional=(currentAt(wetUv+blurStep)+currentAt(wetUv-blurStep*0.65))*0.5;
    wet=mix(wet,directional,clamp(uC*power,0.0,0.72));
    wet=mix(wet,wet*uColor+vec3(track*0.26),power*(0.16+uA*0.22));
    finalColor=vec4(wet,source.a); return;
  }
  if (uMode < 1.5) {
    float beat=doubleBeat(uPhase)*power;
    // The live scene is deliberately left spatially invariant. Compression is
    // perceived through the extracted history shells, never by periodically
    // zooming the base image.
    vec3 result=source.rgb;
    for(int i=1;i<=4;i++){ float fi=float(i); if(fi>uB) break; float shell=pow(beat,0.72)*uC*fi*(0.52+0.28*fi); vec2 radial=uv-uOrigin; vec2 tangent=normalize(vec2(-radial.y,radial.x)+vec2(0.0001)); float angularWarp=sin(atan(radial.y,radial.x)*7.0+fi*2.1+uPhase*6.28318)*uD*beat*0.004*fi; vec2 echoUv=uOrigin+radial*(1.0-shell)+tangent*angularWarp; vec2 px=vec2(1.0+fi)/max(vec2(1.0),uResolution); vec3 h0=historyAt(echoUv+px); vec3 h1=historyAt(echoUv-px); vec3 h2=historyAt(echoUv+vec2(px.x,-px.y)); vec3 h3=historyAt(echoUv+vec2(-px.x,px.y)); vec3 hc=(h0+h1+h2+h3)*0.25; float hx=luminance(h0)-luminance(h1); float hy=luminance(h2)-luminance(h3); float e=clamp(length(vec2(hx,hy))*4.5+max(0.0,luminance(hc)-0.7)*1.7,0.0,1.0)*pow(max(0.0,beat),0.55)*pow(max(0.01,uF),fi-1.0); vec3 shifted=mix(hc,historyAt(echoUv+vec2(uE*0.003*fi,0)),uE); result+=mix(uColor,shifted,0.34)*e*uG; }
    finalColor=vec4(clamp(result,0.0,1.4),source.a); return;
  }
  if (uMode < 2.5) {
    float line=floor(uv.y*uResolution.y/max(0.5,uF)); float lineRand=hash11(line+floor(uPhase*mix(8.0,28.0,uC)));
    float phase=sin(uv.y*uResolution.y*3.14159+lineRand*6.28); float active=smoothstep(0.15,0.92,abs(phase))*uB;
    float snow=hash21(floor(uv*uResolution/max(0.5,uF))+floor(uPhase*47.0));
    float tear=(lineRand-0.5)*uD*0.035*power*(0.18+active*(0.35+uC)); vec2 warped=clamp(uv+vec2(tear,0),0.0,1.0);
    vec3 c=currentAt(warped); c.r=currentAt(warped+vec2(tear*0.16,0)).r;
    c.b=currentAt(warped-vec2(tear*0.22,0)).b;
    c=palette(c,uG); c+=vec3((snow-0.5)*uA*0.52-active*0.12)*power;
    float vig=smoothstep(0.35,0.92,length((uv-0.5)*vec2(1.0,0.74)))*uH;
    finalColor=vec4(mix(source.rgb,c*(1.0-vig*0.42),power),source.a); return;
  }
  if (uMode < 3.5) {
    vec2 p=(uv-0.5)*vec2(uResolution.x/max(1.0,uResolution.y),1.0);
    float organic=(noise21(p*3.0+vec2(uSeed*0.17))-0.5)*uC; float breathe=sin(uTime*0.43+uSeed)*uC*0.28;
    float v=smoothstep(uA+organic+breathe,max(uA+0.001,uA+uB),length(p));
    float grain=(hash21(uv*uResolution+floor(uTime*12.0))-0.5)*2.0*uD;
    vec3 graded=mix(source.rgb,source.rgb*uColor,v*power);
    graded*=1.0+grain*power*(0.22+v*0.78); float l=luminance(graded); graded=mix(graded,graded*(0.92+0.08*l),v*power*0.35);
    finalColor=vec4(graded,source.a); return;
  }
  if (uMode < 4.5) {
    float attack=1.0-exp(-uProgress*45.0); float tail=1.0-smoothstep(0.30,1.0,uProgress); float envelope=attack*tail*power;
    float rebound=uProgress<0.38?0.0:sin((uProgress-0.38)*18.0)*exp(-(uProgress-0.38)*7.0)*0.16*power;
    float aspect=uResolution.x/max(1.0,uResolution.y); vec2 dir=normalize(vec2(cos(radians(uA))/aspect,sin(radians(uA)))+vec2(0.0001)); vec2 radial=uv-uOrigin;
    vec2 warped=clamp(uv-radial*(envelope*0.045-rebound*0.012)-dir*envelope*uB*0.018,0.0,1.0); float e=edgeAt(warped,1.2);
    vec2 streak=(dir*uB+normalize(radial+vec2(0.0001))*uB*0.7)*envelope*0.009;
    vec3 c=(currentAt(warped)+currentAt(warped-streak)+currentAt(warped-streak*2.2))*0.3333;
    c.r=currentAt(warped+dir*uC*envelope*0.012).r; c.b=currentAt(warped-dir*uC*envelope*0.014).b;
    c+=vec3(e*envelope*0.72); finalColor=vec4(c,source.a); return;
  }
  if (uMode < 5.5) {
    vec3 c=source.rgb; float outAlpha=source.a;
    for(int i=1;i<=6;i++){float fi=float(i);if(fi>uA) break;float spacing=fi*(0.75+0.22*fi);vec2 off=vec2(uB,uC)*spacing*uProgress;vec2 euv=clamp(uv-off,0.0,1.0);vec2 px=vec2(1.0+fi*0.4)/max(vec2(1.0),uResolution);vec4 s0=historySampleAt(euv+px);vec4 s1=historySampleAt(euv-px);vec4 s2=historySampleAt(euv+vec2(px.x,-px.y));vec4 s3=historySampleAt(euv+vec2(-px.x,px.y));vec4 hc=(s0+s1+s2+s3)*0.25;float gx=luminance(s0.rgb)-luminance(s1.rgb);float gy=luminance(s2.rgb)-luminance(s3.rgb);float e=clamp(length(vec2(gx,gy))*4.2+max(0.0,luminance(hc.rgb)-0.7*hc.a),0.0,1.0)*pow(max(0.01,uD),fi-1.0)*(1.0-uProgress);float echoWeight=e*uE*power;c+=mix(uColor*hc.a,hc.rgb,0.25)*echoWeight;outAlpha=max(outAlpha,hc.a*echoWeight);}
    outAlpha=clamp(outAlpha,0.0,1.0); finalColor=vec4(min(clamp(c,0.0,1.0),vec3(outAlpha)),outAlpha); return;
  }
  if (uMode < 6.5) {
    float total=max(0.001,uH); float motion=max(0.001,total-min(uA,total*0.8)); float closeDuration=motion*0.44; float openStart=closeDuration+min(uA,total*0.8);
    float close=pow(clamp(uTime/closeDuration,0.0,1.0),3.0); float openT=clamp((uTime-openStart)/max(0.001,total-openStart),0.0,1.0); float open=1.0-pow(1.0-openT,5.0);
    float amount=clamp(close-open,0.0,1.0)*power; vec2 p=uv-0.5; float shapeDistance=0.0;
    if(uB<0.5) shapeDistance=abs(p.y)-0.5+amount*0.52-sin(uv.x*9.0+uTime*7.0)*uC*0.012;
    else if(uB<1.5) shapeDistance=length(p*vec2(1.0,1.55))-0.92*(1.0-amount);
    else shapeDistance=abs(p.x+p.y*uC)-(0.5+uC*0.5)+amount*(0.55+uC*0.5);
    float aa=1.5/max(1.0,min(uResolution.x,uResolution.y)); float mask=smoothstep(-aa,aa,shapeDistance);
    vec2 pinched=0.5+p*(1.0-amount*0.025); vec3 lens=currentAt(pinched); float l=luminance(lens); lens=mix(lens,vec3(l)*vec3(0.86,0.9,0.96),amount*0.62);
    finalColor=vec4(mix(lens,uColor,mask),source.a); return;
  }
  if (uMode < 7.5) {
    float burstCount=max(1.0,uA); float scaled=min(uProgress,0.999999)*burstCount; float event=floor(scaled); float local=fract(scaled);
    float center=mix(0.34,0.66,hash11(event*5.17+2.0)); float width=mix(0.10,0.34,hash11(event*9.31+7.0))*(1.0+uB*0.42);
    float pulse=1.0-smoothstep(width,width+0.055,abs(local-center)); float band=floor(uv.y*(9.0+uD*31.0));
    float tear=(hash11(band+event)-0.5)*uD*0.12*pulse*power; vec2 tuv=clamp(uv+vec2(tear,0),0.0,1.0);
    float afterburn=smoothstep(0.76,0.82,uProgress)*(1.0-smoothstep(0.82,1.0,uProgress)); float chromaPulse=max(pulse,afterburn);
    vec3 c=currentAt(tuv); vec3 shifted=c; shifted.r=currentAt(tuv+vec2(uF*0.018*chromaPulse,0)).r; shifted.b=currentAt(tuv-vec2(uF*0.015*chromaPulse,0)).b; c=mix(c,shifted,uF*chromaPulse);
    float opClass=mod(event+floor(abs(uSeed)),4.0);
    if(opClass<0.5) c*=1.0-pulse*0.94;
    else if(opClass<1.5) c=mix(c,vec3(1.0)-c,pulse*uC);
    else if(opClass<2.5) c=mix(c,vec3(1.0),pulse*uE);
    else c=mix(c,abs(c*2.0-1.0),pulse*mix(0.45,0.9,uD));
    float levels=mix(14.0,3.0,uD); vec3 posterized=floor(c*levels+0.5)/levels; c=mix(c,posterized,pulse*uD);
    finalColor=vec4(mix(source.rgb,c,power),source.a); return;
  }
  if (uMode < 8.5) {
    vec2 headPoint=(uv-vec2(0.5,0.21))*vec2(0.82,1.0); float region=uA<0.5?1.0-smoothstep(0.22,0.39,length(headPoint)):1.0; float band=floor(uv.y*(18.0+uB*70.0)); float gate=step(uF,hash11(band+floor(uPhase*18.0)));
    float dx=(hash11(band+uPhase)-0.5)*uB*0.07*gate*power*region; vec2 suv=clamp(uv+vec2(dx,0),0.0,1.0); vec3 c=currentStraightAt(suv);
    float n=hash21(floor(uv*uResolution*0.7)+floor(uPhase*31.0)); c=mix(c,vec3(n),uC*gate*region*power);
    float mosaic=mix(96.0,28.0,uC*gate); c=mix(c,currentStraightAt(floor(suv*mosaic)/mosaic),gate*uC*0.42); c=floor(c*mix(20.0,5.0,uC*gate)+0.5)/mix(20.0,5.0,uC*gate);
    c.r=currentStraightAt(suv+vec2(uE*0.012,0)).r; c.b=currentStraightAt(suv-vec2(uE*0.009,0)).b;
    vec3 sourceStraight=straightRgb(source); vec3 outputStraight=mix(sourceStraight,c,region*power);
    finalColor=vec4(outputStraight*source.a,source.a); return;
  }
  finalColor=source;
}
`;

const COPY_FRAGMENT = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
void main(void) { finalColor = texture(uTexture, vTextureCoord); }
`;
