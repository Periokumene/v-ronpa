import { z } from "zod";

export const IdSchema = z.string().min(1).regex(/^[a-zA-Z0-9:_./-]+$/);

export const GameModeSchema = z.enum(["loading", "title", "vn", "navi", "trial", "paused", "saving"]);
export type GameMode = z.infer<typeof GameModeSchema>;

export const GameOverlayKindSchema = z.enum([
  "title-load",
  "title-settings",
  "pause-menu",
  "vn-backlog",
  "vn-save",
  "vn-load",
  "vn-settings",
  "confirm-load",
  "confirm-return-title"
]);
export type GameOverlayKind = z.infer<typeof GameOverlayKindSchema>;

export const GameUiActionSchema = z.enum([
  "new-game",
  "open-load",
  "open-save",
  "open-settings",
  "open-backlog",
  "open-pause-menu",
  "close-overlay",
  "confirm-load",
  "return-title",
  "toggle-auto",
  "toggle-skip"
]);
export type GameUiAction = z.infer<typeof GameUiActionSchema>;

export const NaviSubstateSchema = z.enum(["walk", "interacting", "vn2d-overlay", "inventory", "event"]);
export type NaviSubstate = z.infer<typeof NaviSubstateSchema>;

export const TrialPresentationProfileSchema = z.enum(["vn2d", "vn3d", "debate3d", "minigame"]);
export type TrialPresentationProfile = z.infer<typeof TrialPresentationProfileSchema>;

export const InputLockStateSchema = z.enum(["none", "dialog", "inventory", "trial-targeting", "menu", "cutscene"]);
export type InputLockState = z.infer<typeof InputLockStateSchema>;

export const InputActionSchema = z.enum([
  "move-forward",
  "move-back",
  "move-left",
  "move-right",
  "look",
  "confirm",
  "cancel",
  "interact",
  "open-inventory",
  "pause",
  "select-truth-bullet",
  "fire-truth-bullet"
]);
export type InputAction = z.infer<typeof InputActionSchema>;

export const InputDeviceSchema = z.enum(["keyboard", "mouse", "gamepad", "touch"]);
export type InputDevice = z.infer<typeof InputDeviceSchema>;

export const InputContextSchema = z.enum(["global", "navi", "trial", "menu"]);
export type InputContext = z.infer<typeof InputContextSchema>;

export const InputBindingSchema = z.object({
  action: InputActionSchema,
  device: InputDeviceSchema,
  code: z.string().min(1),
  context: InputContextSchema.default("global")
});
export type InputBinding = z.infer<typeof InputBindingSchema>;

export const InputBindingMapSchema = z.object({
  version: z.literal(1),
  bindings: z.array(InputBindingSchema)
});
export type InputBindingMap = z.infer<typeof InputBindingMapSchema>;

export const InputActionEventPhaseSchema = z.enum(["pressed", "released"]);
export type InputActionEventPhase = z.infer<typeof InputActionEventPhaseSchema>;

export const InputActionEventSchema = z.object({
  action: InputActionSchema,
  phase: InputActionEventPhaseSchema,
  sequence: z.number().int().nonnegative()
}).strict();
export type InputActionEvent = z.infer<typeof InputActionEventSchema>;

export const InputActionStateSchema = z.object({
  version: z.literal(1),
  context: InputContextSchema.default("global"),
  down: z.array(InputActionSchema).default([]),
  events: z.array(InputActionEventSchema).default([]),
  sequence: z.number().int().nonnegative().default(0)
}).strict();
export type InputActionState = z.infer<typeof InputActionStateSchema>;

export const CameraControlModeSchema = z.enum([
  "first-person",
  "orbit-debug",
  "scripted-focus",
  "trial-targeting",
  "locked"
]);
export type CameraControlMode = z.infer<typeof CameraControlModeSchema>;

export const Vector3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vector3 = z.infer<typeof Vector3Schema>;

export const AabbBoundsSchema = z.object({
  min: Vector3Schema,
  max: Vector3Schema
});
export type AabbBounds = z.infer<typeof AabbBoundsSchema>;

export const CameraRigDefSchema = z.object({
  id: IdSchema,
  mode: CameraControlModeSchema,
  position: Vector3Schema.optional(),
  target: Vector3Schema.optional(),
  fov: z.number().positive().optional(),
  near: z.number().positive().optional(),
  far: z.number().positive().optional()
});
export type CameraRigDef = z.infer<typeof CameraRigDefSchema>;

export const PlayerPoseSchema = z.object({
  position: Vector3Schema,
  yaw: z.number().default(0),
  pitch: z.number().default(0)
});
export type PlayerPose = z.infer<typeof PlayerPoseSchema>;

export const InteractionBlockedReasonSchema = z.enum([
  "input-lock",
  "wrong-substate",
  "missing-pose",
  "no-target",
  "out-of-range",
  "not-facing"
]);
export type InteractionBlockedReason = z.infer<typeof InteractionBlockedReasonSchema>;

export const NaviInteractionSensorReportSchema = z.object({
  mapId: IdSchema,
  pose: PlayerPoseSchema,
  facing: Vector3Schema.optional()
}).strict();
export type NaviInteractionSensorReport = z.infer<typeof NaviInteractionSensorReportSchema>;

export const NaviInteractionViewSchema = z.object({
  activeInteractableId: IdSchema.optional(),
  canConfirm: z.boolean(),
  blockedReason: InteractionBlockedReasonSchema.optional()
});
export type NaviInteractionView = z.infer<typeof NaviInteractionViewSchema>;

export const NaviInteractionConfirmRequestSchema = z.object({
  mapId: IdSchema,
  pose: PlayerPoseSchema.optional(),
  facing: Vector3Schema.optional()
}).strict();
export type NaviInteractionConfirmRequest = z.infer<typeof NaviInteractionConfirmRequestSchema>;

export const SourceLocationSchema = z.object({
  scriptPath: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  raw: z.string()
});
export type SourceLocation = z.infer<typeof SourceLocationSchema>;

export const DiagnosticSchema = z.object({
  severity: z.enum(["info", "warning", "error"]),
  message: z.string(),
  loc: SourceLocationSchema.optional()
});
export type Diagnostic = z.infer<typeof DiagnosticSchema>;

export const NaniCommandCategorySchema = z.enum([
  "text",
  "choice",
  "flow",
  "state",
  "actor",
  "scene",
  "effect",
  "media",
  "ui"
]);
export type NaniCommandCategory = z.infer<typeof NaniCommandCategorySchema>;

export const NaniCommandStatusSchema = z.enum(["declared", "validated", "stubbed", "implemented"]);
export type NaniCommandStatus = z.infer<typeof NaniCommandStatusSchema>;

export const NaniCommandSourceSchema = z.enum(["naninovel", "v-ronpa"]);
export type NaniCommandSource = z.infer<typeof NaniCommandSourceSchema>;

export const NaniCommandExecutionSchema = z.enum([
  "story-control",
  "pixi-presentation",
  "media-output",
  "ui-output",
  "gameplay",
  "declared-only"
]);
export type NaniCommandExecution = z.infer<typeof NaniCommandExecutionSchema>;

export interface NaniCommandParamSpec {
  name: string;
  type: string;
  source?: NaniCommandSource;
  required?: boolean;
  repeatable?: boolean;
  aliases?: string[];
  description?: string;
}

export interface NaniCommandDefinition {
  id: string;
  canonicalName: string;
  category: NaniCommandCategory;
  source: NaniCommandSource;
  status: NaniCommandStatus;
  execution: NaniCommandExecution;
  supportsChildren: boolean;
  params: NaniCommandParamSpec[];
  aliases?: string[];
}

export const NaniCommandParamSpecSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1),
    source: NaniCommandSourceSchema.optional(),
    required: z.boolean().optional(),
    repeatable: z.boolean().optional(),
    aliases: z.array(z.string().min(1)).optional(),
    description: z.string().optional()
  })
  .strict();

export const NaniCommandDefinitionSchema = z
  .object({
    id: z.string().min(1).regex(/^[a-z0-9:_./<>-]+$/),
    canonicalName: z.string().min(1),
    category: NaniCommandCategorySchema,
    source: NaniCommandSourceSchema,
    status: NaniCommandStatusSchema,
    execution: NaniCommandExecutionSchema,
    supportsChildren: z.boolean(),
    params: z.array(NaniCommandParamSpecSchema),
    aliases: z.array(z.string().min(1).regex(/^[a-z0-9:_./<>-]+$/)).optional()
  })
  .strict();

const officialCommandStatuses: Partial<Record<string, NaniCommandStatus>> = {
  arrange: "implemented",
  append: "implemented",
  back: "implemented",
  blur: "implemented",
  bokeh: "implemented",
  char: "implemented",
  choice: "implemented",
  clearbacklog: "implemented",
  clearchoice: "implemented",
  input: "implemented",
  glitch: "implemented",
  glitchfilter: "implemented",
  goto: "implemented",
  hidechars: "implemented",
  hideui: "implemented",
  movie: "implemented",
  print: "implemented",
  rain: "implemented",
  resettext: "implemented",
  set: "implemented",
  shake: "implemented",
  showprinter: "implemented",
  showui: "implemented",
  bgm: "implemented",
  sfx: "implemented",
  sfxfast: "implemented",
  slide: "implemented",
  snow: "implemented",
  stopbgm: "implemented",
  stopsfx: "implemented",
  sun: "implemented",
  toast: "implemented"
};

const commandExecutions: Partial<Record<string, NaniCommandExecution>> = {
  arrange: "pixi-presentation",
  back: "pixi-presentation",
  blur: "pixi-presentation",
  bokeh: "pixi-presentation",
  char: "pixi-presentation",
  flash: "pixi-presentation",
  focus: "pixi-presentation",
  glitch: "pixi-presentation",
  glitchfilter: "pixi-presentation",
  hidechars: "pixi-presentation",
  rain: "pixi-presentation",
  shake: "pixi-presentation",
  slide: "pixi-presentation",
  snow: "pixi-presentation",
  sun: "pixi-presentation",
  choice: "story-control",
  append: "story-control",
  clearbacklog: "story-control",
  clearchoice: "story-control",
  end: "story-control",
  gameplay: "gameplay",
  goto: "story-control",
  hideui: "ui-output",
  input: "story-control",
  movie: "media-output",
  print: "story-control",
  resettext: "story-control",
  set: "story-control",
  showprinter: "story-control",
  wait: "story-control",
  showui: "ui-output",
  toast: "ui-output",
  bgm: "media-output",
  sfx: "media-output",
  sfxfast: "media-output",
  stopbgm: "media-output",
  stopsfx: "media-output",
  trialkeyword: "pixi-presentation",
  async: "declared-only",
  await: "declared-only",
  stop: "declared-only",
  sync: "declared-only"
};

function param(
  name: string,
  type: string,
  required = false,
  source: NaniCommandSource = "naninovel"
): NaniCommandParamSpec {
  return {
    name,
    type,
    ...(source !== "naninovel" ? { source } : {}),
    ...(required ? { required } : {})
  };
}

function official(
  canonicalName: string,
  category: NaniCommandCategory,
  params: NaniCommandParamSpec[] = [],
  supportsChildren = false
): NaniCommandDefinition {
  const id = normalizeNaniCommandId(canonicalName);
  const status = officialCommandStatuses[id] ?? "stubbed";
  return {
    id,
    canonicalName,
    category,
    source: "naninovel",
    status,
    execution: commandExecutions[id] ?? (status === "implemented" ? "story-control" : "declared-only"),
    supportsChildren,
    params
  };
}

function vRonpa(
  id: string,
  category: NaniCommandCategory,
  params: NaniCommandParamSpec[] = [],
  aliases: string[] = [],
  status: NaniCommandStatus = "implemented"
): NaniCommandDefinition {
  return {
    id,
    canonicalName: id,
    category,
    source: "v-ronpa",
    status,
    execution: commandExecutions[id] ?? (status === "implemented" ? "story-control" : "declared-only"),
    supportsChildren: false,
    params,
    ...(aliases.length > 0 ? { aliases } : {})
  };
}

export function normalizeNaniCommandId(id: string): string {
  return id.trim().toLowerCase();
}

const actorTransformParams = [
  param("id", "string"),
  param("appearance", "string"),
  param("pose", "string"),
  param("via", "string"),
  param("params", "decimal list"),
  param("dissolve", "string"),
  param("visible", "boolean"),
  param("position", "decimal list"),
  param("rotation", "decimal list"),
  param("scale", "decimal list"),
  param("tint", "string"),
  param("easing", "string"),
  param("time", "decimal"),
  param("lazy", "boolean"),
  param("wait", "boolean")
];

const particleParams = [
  param("power", "decimal"),
  param("time", "decimal"),
  param("pos", "decimal list"),
  param("position", "decimal list"),
  param("rotation", "decimal list"),
  param("scale", "decimal list"),
  param("wait", "boolean")
];

const rainShaderParams = [
  param("power", "decimal"),
  param("wind", "decimal"),
  param("hue", "decimal"),
  param("tint", "decimal"),
  param("time", "decimal"),
  param("easing", "string"),
  param("wait", "boolean")
];

const snowShaderParams = [
  param("power", "decimal"),
  param("time", "decimal"),
  param("xSpeed", "decimal"),
  param("ySpeed", "decimal"),
  param("density", "decimal"),
  param("flakeScale", "decimal"),
  param("sway", "decimal"),
  param("fog", "decimal"),
  param("noise", "decimal"),
  param("seed", "decimal"),
  param("pos", "decimal list"),
  param("position", "decimal list"),
  param("rotation", "decimal list"),
  param("scale", "decimal list"),
  param("wait", "boolean")
];

const glitchShaderParams = [
  param("time", "decimal"),
  param("power", "decimal"),
  param("blockJump", "decimal"),
  param("burstJump", "decimal"),
  param("pixelScatter", "decimal"),
  param("colorNoise", "decimal"),
  param("speed", "decimal"),
  param("seed", "decimal"),
  param("wait", "boolean")
];

const glitchFilterShaderParams = [
  param("time", "decimal"),
  param("easing", "string"),
  param("power", "decimal"),
  param("blockJump", "decimal"),
  param("burstJump", "decimal"),
  param("pixelScatter", "decimal"),
  param("colorNoise", "decimal"),
  param("speed", "decimal"),
  param("seed", "decimal"),
  param("wait", "boolean")
];

const audioParams = [
  param("volume", "decimal"),
  param("loop", "boolean"),
  param("fade", "decimal"),
  param("group", "string"),
  param("time", "decimal"),
  param("wait", "boolean")
];

const choiceParams = [
  param("choiceSummary", "string"),
  param("id", "string"),
  param("enabled", "boolean", false, "v-ronpa"),
  param("lock", "string"),
  param("button", "string"),
  param("pos", "decimal list"),
  param("handler", "string"),
  param("goto", "string"),
  param("gosub", "string"),
  param("set", "string"),
  param("show", "boolean"),
  param("time", "decimal")
];

export const naniCommandCatalog: NaniCommandDefinition[] = [
  official("addChoice", "choice", choiceParams),
  official("append", "text", [param("text", "string"), param("printer", "string"), param("author", "string")]),
  official("arrange", "actor", [
    param("characterPositions", "named decimal list"),
    param("look", "boolean"),
    param("time", "decimal"),
    param("wait", "boolean")
  ]),
  official("async", "flow", [param("trackId", "string"), param("loop", "boolean")], true),
  official("await", "flow", [param("trackId", "string"), param("complete", "boolean")]),
  official("back", "scene", [
    param("appearanceAndTransition", "named string"),
    param("pos", "decimal list"),
    ...actorTransformParams,
    param("effect", "string", false, "v-ronpa")
  ]),
  official("bgm", "media", [param("bgmPath", "string"), param("intro", "string"), ...audioParams]),
  official("blur", "effect", [
    param("actorId", "string"),
    param("power", "decimal"),
    param("time", "decimal"),
    param("wait", "boolean")
  ]),
  official("bokeh", "effect", [
    param("focus", "string"),
    param("dist", "decimal"),
    param("power", "decimal"),
    param("time", "decimal"),
    param("wait", "boolean")
  ]),
  official("camera", "scene", [
    param("offset", "decimal list"),
    param("roll", "decimal"),
    param("rotation", "decimal list"),
    param("zoom", "decimal"),
    param("ortho", "boolean"),
    param("toggle", "string list"),
    param("set", "named boolean list"),
    param("easing", "string"),
    param("time", "decimal"),
    param("lazy", "boolean"),
    param("wait", "boolean")
  ]),
  official("char", "actor", [
    param("idAndAppearance", "named string"),
    param("look", "string"),
    param("avatar", "string"),
    param("pos", "decimal list"),
    ...actorTransformParams
  ]),
  official("choice", "choice", choiceParams),
  official("choiceHandler", "choice", [
    param("handlerId", "string"),
    param("default", "boolean"),
    ...actorTransformParams
  ]),
  official("clearBacklog", "text"),
  official("clearChoice", "choice", [param("handlerId", "string"), param("id", "string"), param("hide", "boolean")]),
  official("despawn", "actor", [param("path", "string"), param("params", "string list"), param("wait", "boolean")]),
  official("despawnAll", "actor", [param("wait", "boolean")]),
  official("else", "flow", [], true),
  official("endIf", "flow"),
  official("enterDialogue", "text"),
  official("exitDialogue", "text", [param("destroy", "boolean")]),
  official("format", "text", [param("templates", "named string list"), param("printer", "string")]),
  official("glitch", "effect", glitchShaderParams),
  official("glitchFilter", "effect", glitchFilterShaderParams),
  official("gosub", "flow", [param("path", "string")]),
  official("goto", "flow", [
    param("path", "string"),
    param("reset", "string list"),
    param("hold", "boolean"),
    param("release", "boolean")
  ]),
  official("group", "flow", [], true),
  official("hide", "actor", [param("actorIds", "string list"), param("time", "decimal"), param("lazy", "boolean"), param("wait", "boolean")]),
  official("hideAll", "actor", [param("time", "decimal"), param("lazy", "boolean"), param("wait", "boolean")]),
  official("hideChars", "actor", [param("time", "decimal"), param("lazy", "boolean"), param("wait", "boolean")]),
  official("hidePrinter", "text", [param("printerId", "string"), param("time", "decimal"), param("wait", "boolean")]),
  official("hideUI", "ui", [
    param("uINames", "string list"),
    param("allowToggle", "boolean"),
    param("time", "decimal"),
    param("wait", "boolean"),
    param("target", "string", false, "v-ronpa")
  ]),
  official("if", "flow", [param("expression", "string")], true),
  official("input", "ui", [
    param("variableName", "string"),
    param("type", "string"),
    param("summary", "string"),
    param("value", "string"),
    param("nostop", "boolean")
  ]),
  official("lipSync", "actor", [param("charIdAndAllow", "named boolean")]),
  official("loadScene", "scene", [param("sceneName", "string"), param("additive", "boolean")]),
  official("lock", "state", [param("id", "string")]),
  official("look", "actor", [
    param("enable", "boolean"),
    param("zone", "decimal list"),
    param("speed", "decimal list"),
    param("gravity", "boolean")
  ]),
  official("movie", "media", [param("moviePath", "string"), param("time", "decimal"), param("block", "boolean")]),
  official("openURL", "ui", [param("uRL", "string"), param("target", "string")]),
  official("print", "text", [
    param("text", "string"),
    param("printer", "string"),
    param("author", "string"),
    param("as", "string"),
    param("speed", "decimal"),
    param("reset", "boolean"),
    param("default", "boolean"),
    param("waitInput", "boolean"),
    param("append", "boolean"),
    param("fadeTime", "decimal"),
    param("wait", "boolean")
  ]),
  official("printer", "text", [
    param("idAndAppearance", "named string"),
    param("default", "boolean"),
    param("hideOther", "boolean"),
    param("anchor", "boolean"),
    param("pos", "decimal list"),
    ...actorTransformParams
  ]),
  official("processInput", "ui", [param("inputEnabled", "boolean"), param("set", "named boolean list")]),
  official("purgeRollback", "state"),
  official("rain", "effect", rainShaderParams),
  official("random", "flow", [param("weight", "decimal list")], true),
  official("remove", "actor", [param("actorIds", "string list")]),
  official("resetState", "state", [param("exclude", "string list"), param("only", "string list")]),
  official("resetText", "text", [param("printerId", "string")]),
  official("return", "flow", [param("reset", "string list")]),
  official("save", "ui", [param("at", "string")]),
  official("set", "state", [param("expression", "string")]),
  official("sfx", "media", [param("sfxPath", "string"), ...audioParams]),
  official("sfxFast", "media", [
    param("sfxPath", "string"),
    param("volume", "decimal"),
    param("restart", "boolean"),
    param("additive", "boolean"),
    param("group", "string"),
    param("wait", "boolean")
  ]),
  official("shake", "effect", [
    param("actorId", "string"),
    param("count", "integer"),
    param("loop", "boolean"),
    param("time", "decimal"),
    param("deltaTime", "decimal"),
    param("power", "decimal"),
    param("deltaPower", "decimal"),
    param("hor", "boolean"),
    param("ver", "boolean"),
    param("wait", "boolean"),
    param("target", "string", false, "v-ronpa"),
    param("intensity", "decimal", false, "v-ronpa"),
    param("duration", "decimal", false, "v-ronpa")
  ]),
  official("show", "actor", [param("actorIds", "string list"), param("time", "decimal"), param("lazy", "boolean"), param("wait", "boolean")]),
  official("showPrinter", "text", [param("printerId", "string"), param("time", "decimal"), param("wait", "boolean")]),
  official("showUI", "ui", [
    param("uINames", "string list"),
    param("time", "decimal"),
    param("wait", "boolean"),
    param("target", "string", false, "v-ronpa"),
    param("visible", "boolean", false, "v-ronpa")
  ]),
  official("skip", "ui", [param("enable", "boolean")]),
  official("slide", "actor", [
    param("idAndAppearance", "named string"),
    param("from", "decimal list"),
    param("to", "decimal list"),
    param("visible", "boolean"),
    param("easing", "string"),
    param("time", "decimal"),
    param("lazy", "boolean"),
    param("wait", "boolean")
  ]),
  official("snow", "effect", snowShaderParams),
  official("spawn", "actor", [
    param("path", "string"),
    param("params", "string list"),
    param("pos", "decimal list"),
    param("position", "decimal list"),
    param("rotation", "decimal list"),
    param("scale", "decimal list"),
    param("wait", "boolean")
  ]),
  official("stop", "flow", [param("trackId", "string")]),
  official("stopBgm", "media", [
    param("bgmPath", "string"),
    param("fade", "decimal"),
    param("wait", "boolean"),
    param("group", "string", false, "v-ronpa")
  ]),
  official("stopSfx", "media", [
    param("sfxPath", "string"),
    param("fade", "decimal"),
    param("wait", "boolean"),
    param("group", "string", false, "v-ronpa")
  ]),
  official("stopVoice", "media"),
  official("sun", "effect", particleParams),
  official("sync", "flow", [param("trackId", "string")]),
  official("timeline", "media", [
    param("name", "string"),
    param("stop", "boolean"),
    param("pause", "boolean"),
    param("resume", "boolean"),
    param("wait", "boolean")
  ]),
  official("title", "ui"),
  official("toast", "ui", [param("text", "string"), param("appearance", "string"), param("time", "decimal")]),
  official("trans", "scene", [
    param("transition", "string"),
    param("params", "decimal list"),
    param("dissolve", "string"),
    param("easing", "string"),
    param("time", "decimal")
  ]),
  official("unless", "flow", [param("expression", "string")], true),
  official("unloadScene", "scene", [param("sceneName", "string")]),
  official("unlock", "state", [param("id", "string")]),
  official("voice", "media", [
    param("voicePath", "string"),
    param("volume", "decimal"),
    param("group", "string"),
    param("authorId", "string")
  ]),
  official("wait", "flow", [param("waitMode", "string")]),
  official("while", "flow", [param("expression", "string")], true),
  vRonpa("end", "flow"),
  vRonpa(
    "gameplay",
    "state",
    [
      param("type", "string"),
      param("id", "string"),
      param("quantity", "integer"),
      param("item", "string"),
      param("itemId", "string"),
      param("evidence", "string"),
      param("evidenceId", "string"),
      param("character", "string"),
      param("characterId", "string"),
      param("status", "string"),
      param("skill", "string"),
      param("skillId", "string"),
      param("delta", "integer"),
      param("affinityDelta", "integer")
    ],
    ["gameplay-event"]
  ),
  vRonpa(
    "charenter",
    "actor",
    [param("character", "string"), param("appearanceExpression", "string"), param("effect", "string")],
    ["char-enter"],
    "stubbed"
  ),
  vRonpa("flash", "effect", [param("color", "string"), param("duration", "decimal"), param("wait", "boolean")]),
  vRonpa("focus", "effect", [param("target", "string"), param("duration", "decimal")]),
  vRonpa("trialkeyword", "ui", [param("id", "string"), param("text", "string"), param("speaker", "string"), param("evidence", "string")], [
    "trial-keyword"
  ])
];

export const commandCatalog = naniCommandCatalog;

const naniCommandCatalogById = new Map<string, NaniCommandDefinition>();
for (const definition of naniCommandCatalog) {
  naniCommandCatalogById.set(definition.id, definition);
  for (const alias of definition.aliases ?? []) naniCommandCatalogById.set(alias, definition);
}

export function getNaniCommandDefinition(id: string): NaniCommandDefinition | undefined {
  return naniCommandCatalogById.get(normalizeNaniCommandId(id));
}

export const RuntimeAssetKindSchema = z.enum([
  "character-pack",
  "background",
  "bgm",
  "sfx",
  "bleep",
  "voice",
  "video",
  "font",
  "glb",
  "texture",
  "fx"
]);
export type RuntimeAssetKind = z.infer<typeof RuntimeAssetKindSchema>;

export const AssetRefSchema = z.object({
  id: IdSchema,
  kind: RuntimeAssetKindSchema,
  tags: z.array(z.string()).default([])
}).strict();
export type AssetRef = z.infer<typeof AssetRefSchema>;

export const RuntimeExpressionSchema = z.object({ type: z.literal("expression"), source: z.string() }).strict();
export type RuntimeExpression = z.infer<typeof RuntimeExpressionSchema>;

export const RichTextVerticalAlignSchema = z.enum(["sub", "sup"]);
export type RichTextVerticalAlign = z.infer<typeof RichTextVerticalAlignSchema>;

export const RichTextRunStyleSchema = z
  .object({
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    strike: z.boolean().optional(),
    color: z.string().optional(),
    markColor: z.string().optional(),
    sizeScale: z.number().positive().optional(),
    fontId: IdSchema.optional(),
    verticalAlign: RichTextVerticalAlignSchema.optional()
  })
  .strict();
export type RichTextRunStyle = z.infer<typeof RichTextRunStyleSchema>;

export const RichTextRunSchema = z
  .object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    style: RichTextRunStyleSchema
  })
  .strict()
  .superRefine((run, ctx) => {
    if (run.end <= run.start) {
      ctx.addIssue({
        code: "custom",
        path: ["end"],
        message: "Rich text run end must be greater than start."
      });
    }
    if (Object.keys(run.style).length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["style"],
        message: "Rich text run style must contain at least one property."
      });
    }
  });
export type RichTextRun = z.infer<typeof RichTextRunSchema>;

export const RichTextDocumentSchema = z
  .object({
    text: z.string(),
    runs: z.array(RichTextRunSchema).default([])
  })
  .strict()
  .superRefine((document, ctx) => {
    const textLength = Array.from(document.text).length;
    for (const [index, run] of document.runs.entries()) {
      if (run.end > textLength) {
        ctx.addIssue({
          code: "custom",
          path: ["runs", index, "end"],
          message: "Rich text run end must not exceed document text length."
        });
      }
    }
  });
export type RichTextDocument = z.infer<typeof RichTextDocumentSchema>;

function addRichTextPlainTextConsistencyIssue(
  ctx: z.RefinementCtx,
  richText: { text: string } | undefined,
  plainText: unknown,
  path: (string | number)[]
): void {
  if (!richText) return;
  if (typeof plainText !== "string") {
    ctx.addIssue({
      code: "custom",
      path,
      message: "Rich text requires a matching plain text string."
    });
    return;
  }
  if (richText.text !== plainText) {
    ctx.addIssue({
      code: "custom",
      path,
      message: "Rich text text must match plain text."
    });
  }
}

export const RuntimeValueSchema: z.ZodType<string | number | boolean | RuntimeValue[] | RuntimeExpression> =
  z.lazy(() =>
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(RuntimeValueSchema),
      RuntimeExpressionSchema
    ])
  );
export type RuntimeValue = string | number | boolean | RuntimeValue[] | RuntimeExpression;

export const RuntimeSourceCommandSchema = z
  .object({
    rawCommandId: z.string().min(1),
    rawPrimary: z.unknown().optional(),
    rawParams: z.record(z.string(), z.unknown()).optional(),
    rawFlags: z.record(z.string(), z.boolean()).optional()
  })
  .strict();
export type RuntimeSourceCommand = z.infer<typeof RuntimeSourceCommandSchema>;

export const RuntimeCommandSchema = z
  .object({
    commandId: z.string().min(1),
    canonicalName: z.string().min(1),
    category: NaniCommandCategorySchema,
    source: NaniCommandSourceSchema,
    status: NaniCommandStatusSchema,
    params: z.record(z.string(), RuntimeValueSchema).default({}),
    condition: RuntimeExpressionSchema.optional(),
    unless: RuntimeExpressionSchema.optional(),
    richText: RichTextDocumentSchema.optional(),
    loc: SourceLocationSchema,
    sourceCommand: RuntimeSourceCommandSchema.optional()
  })
  .strict()
  .superRefine((command, ctx) => {
    addRichTextPlainTextConsistencyIssue(ctx, command.richText, command.params.text, ["richText", "text"]);
  });
export type RuntimeCommand = z.infer<typeof RuntimeCommandSchema>;

export const ScriptDependencySchema = z
  .object({
    endpoint: z.string().min(1)
  })
  .strict();
export type ScriptDependency = z.infer<typeof ScriptDependencySchema>;

export const RuntimeScriptSchema = z
  .object({
    scriptPath: z.string(),
    commands: z.array(RuntimeCommandSchema),
    labels: z.record(z.string(), z.number().int().nonnegative()).default({}),
    assets: z.array(AssetRefSchema).default([]),
    dependencies: z.array(ScriptDependencySchema).default([])
  })
  .strict();
export type RuntimeScript = z.infer<typeof RuntimeScriptSchema>;

export const UiAssetRoleSchema = z.enum([
  "title-background",
  "panel-background",
  "dialog-frame",
  "button-frame",
  "button-icon",
  "toolbar-icon",
  "overlay-backdrop",
  "motion-sprite"
]);
export type UiAssetRole = z.infer<typeof UiAssetRoleSchema>;

export const UiAssetRefSchema = z
  .object({
    id: IdSchema,
    role: UiAssetRoleSchema,
    assetId: IdSchema,
    slice: z.enum(["stretch", "nine-slice", "tile"]).default("stretch"),
    sliceInsets: z
      .object({
        top: z.number().nonnegative(),
        right: z.number().nonnegative(),
        bottom: z.number().nonnegative(),
        left: z.number().nonnegative()
      })
      .strict()
      .optional(),
    tags: z.array(z.string()).default([])
  })
  .strict()
  .superRefine((asset, ctx) => {
    if (asset.sliceInsets && asset.slice !== "nine-slice") {
      ctx.addIssue({
        code: "custom",
        path: ["sliceInsets"],
        message: "sliceInsets can only be used when slice is 'nine-slice'."
      });
    }
  });
export type UiAssetRef = z.infer<typeof UiAssetRefSchema>;

export const InteractionStyleProfileSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  assets: z.array(UiAssetRefSchema).default([]),
  tokens: z
    .object({
      accentColor: z.string().optional(),
      textColor: z.string().optional(),
      panelOpacity: z.number().min(0).max(1).optional(),
      motionScale: z.number().nonnegative().optional()
    })
    .default({})
});
export type InteractionStyleProfile = z.infer<typeof InteractionStyleProfileSchema>;

export const RuntimeAssetFormatSchema = z.enum([
  "glb",
  "gltf",
  "png",
  "json",
  "webp",
  "avif",
  "ktx2",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "mp3",
  "ogg",
  "mp4",
  "webm"
]);
export type RuntimeAssetFormat = z.infer<typeof RuntimeAssetFormatSchema>;

export const AssetCompressionSchema = z.enum(["none", "meshopt", "draco", "ktx2", "basisu", "webp", "avif"]);
export type AssetCompression = z.infer<typeof AssetCompressionSchema>;

export const TextureBudgetSchema = z.object({
  maxSizePx: z.number().int().positive(),
  maxBytes: z.number().int().positive().optional()
});
export type TextureBudget = z.infer<typeof TextureBudgetSchema>;

export const LodRefSchema = z.object({
  level: z.number().int().nonnegative(),
  uri: z.string().min(1),
  maxDistance: z.number().positive()
});
export type LodRef = z.infer<typeof LodRefSchema>;

export const CollisionProxySchema = z.object({
  id: IdSchema,
  kind: z.enum(["box", "sphere", "capsule", "convex-mesh", "trimesh", "navmesh"]),
  assetId: IdSchema.optional(),
  size: Vector3Schema.optional(),
  radius: z.number().positive().optional(),
  height: z.number().positive().optional()
}).strict();
export type CollisionProxy = z.infer<typeof CollisionProxySchema>;

export const RuntimeAssetSchema = z.object({
  id: IdSchema,
  kind: RuntimeAssetKindSchema,
  sourceUri: z.string().optional(),
  optimizedUri: z.string().min(1),
  format: RuntimeAssetFormatSchema,
  compression: z.array(AssetCompressionSchema).default([]),
  textureBudget: TextureBudgetSchema.optional(),
  lods: z.array(LodRefSchema).default([]),
  collisionProxyIds: z.array(IdSchema).default([]),
  tags: z.array(z.string()).default([])
}).strict();
export type RuntimeAsset = z.infer<typeof RuntimeAssetSchema>;

const NormalizedSettingSchema = z.number().min(0).max(1);

export const DialogueBleepSoundSchema = z.object({
  sourceRef: IdSchema,
  gain: NormalizedSettingSchema.default(1)
}).strict();
export type DialogueBleepSoundInput = z.input<typeof DialogueBleepSoundSchema>;
export type DialogueBleepSound = z.infer<typeof DialogueBleepSoundSchema>;

export const DialogueBleepSoundRefSchema = z.union([DialogueBleepSoundSchema, z.null()]);
export type DialogueBleepSoundRefInput = z.input<typeof DialogueBleepSoundRefSchema>;
export type DialogueBleepSoundRef = z.infer<typeof DialogueBleepSoundRefSchema>;

export const DialogueBleepConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultSound: DialogueBleepSoundRefSchema.optional(),
  speakerOverrides: z.record(z.string().min(1), DialogueBleepSoundRefSchema).default({})
}).strict();
export type DialogueBleepConfigInput = z.input<typeof DialogueBleepConfigSchema>;
export type DialogueBleepConfig = z.infer<typeof DialogueBleepConfigSchema>;

export const ContentAudioConfigSchema = z.object({
  dialogueBleep: DialogueBleepConfigSchema.optional()
}).strict();
export type ContentAudioConfigInput = z.input<typeof ContentAudioConfigSchema>;
export type ContentAudioConfig = z.infer<typeof ContentAudioConfigSchema>;

export const FontFaceDefinitionSchema = z
  .object({
    id: IdSchema,
    family: z.string().min(1),
    sourceRef: IdSchema,
    weight: z.string().min(1).default("400"),
    style: z.enum(["normal", "italic", "oblique"]).default("normal")
  })
  .strict();
export type FontFaceDefinitionInput = z.input<typeof FontFaceDefinitionSchema>;
export type FontFaceDefinition = z.infer<typeof FontFaceDefinitionSchema>;

export const LayeredCharacterObjectVector2Schema = z.object({
  x: z.number(),
  y: z.number()
}).strict();
export type LayeredCharacterObjectVector2 = z.infer<typeof LayeredCharacterObjectVector2Schema>;

export const LayeredCharacterObjectVector3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
}).strict();
export type LayeredCharacterObjectVector3 = z.infer<typeof LayeredCharacterObjectVector3Schema>;

export const LayeredCharacterVector2Schema = z.tuple([z.number(), z.number()]);
export type LayeredCharacterVector2 = z.infer<typeof LayeredCharacterVector2Schema>;

export const LayeredCharacterBoundsSchema = z.object({
  min: LayeredCharacterVector2Schema,
  max: LayeredCharacterVector2Schema
}).strict().superRefine((bounds, ctx) => {
  if (bounds.max[0] <= bounds.min[0]) {
    ctx.addIssue({
      code: "custom",
      path: ["max", 0],
      message: "Layered character bounds max.x must be greater than min.x."
    });
  }
  if (bounds.max[1] <= bounds.min[1]) {
    ctx.addIssue({
      code: "custom",
      path: ["max", 1],
      message: "Layered character bounds max.y must be greater than min.y."
    });
  }
});
export type LayeredCharacterBounds = z.infer<typeof LayeredCharacterBoundsSchema>;

export const LayeredCharacterRenderSpaceSchema = z.object({
  stageScale: z.number().positive(),
  defaultBounds: LayeredCharacterBoundsSchema
}).strict();
export type LayeredCharacterRenderSpace = z.infer<typeof LayeredCharacterRenderSpaceSchema>;

export const LayeredCharacterDefinitionSchema = z.object({
  id: IdSchema,
  defaultComposition: z.array(z.string().min(1)).default([]),
  renderSpace: LayeredCharacterRenderSpaceSchema
}).strict();
export type LayeredCharacterDefinition = z.infer<typeof LayeredCharacterDefinitionSchema>;

const PackRelativePathSchema = z.string().min(1).refine((value) => isPackRelativePath(value), {
  message: "Layered character layer paths must be pack-relative and may not use absolute URLs or parent directories."
});

export const LayeredCharacterLayerRefSchema = z.object({
  src: PackRelativePathSchema,
  metadata: PackRelativePathSchema
}).strict();
export type LayeredCharacterLayerRef = z.infer<typeof LayeredCharacterLayerRefSchema>;

export const LayeredCharacterGroupSchema = z.object({
  layers: z.record(z.string().min(1), LayeredCharacterLayerRefSchema)
}).strict();
export type LayeredCharacterGroup = z.infer<typeof LayeredCharacterGroupSchema>;

export const LayeredCharacterLayersSchema = z.object({
  groups: z.record(z.string().min(1), LayeredCharacterGroupSchema)
}).strict();
export type LayeredCharacterLayers = z.infer<typeof LayeredCharacterLayersSchema>;

export const LayeredCharacterCompositionsSchema = z.object({
  tokens: z.record(z.string().min(1), z.array(z.string().min(1)))
}).strict();
export type LayeredCharacterCompositions = z.infer<typeof LayeredCharacterCompositionsSchema>;

export const LayeredCharacterTextureSizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive()
}).strict();
export type LayeredCharacterTextureSize = z.infer<typeof LayeredCharacterTextureSizeSchema>;

export const LayeredCharacterTextureSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  size: LayeredCharacterTextureSizeSchema
}).strict();
export type LayeredCharacterTexture = z.infer<typeof LayeredCharacterTextureSchema>;

export const LayeredCharacterRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive()
}).strict();
export type LayeredCharacterRect = z.infer<typeof LayeredCharacterRectSchema>;

export const LayeredCharacterSpriteSchema = z.object({
  rect: LayeredCharacterRectSchema,
  pivot: LayeredCharacterObjectVector2Schema,
  pixelsPerUnit: z.number().positive()
}).strict();
export type LayeredCharacterSprite = z.infer<typeof LayeredCharacterSpriteSchema>;

export const LayeredCharacterTransformSchema = z.object({
  position: LayeredCharacterObjectVector3Schema,
  scale: LayeredCharacterObjectVector3Schema,
  rotation: LayeredCharacterObjectVector3Schema
}).strict();
export type LayeredCharacterTransform = z.infer<typeof LayeredCharacterTransformSchema>;

export const LayeredCharacterRendererSchema = z.object({
  color: z.object({
    r: z.number().min(0).max(1),
    g: z.number().min(0).max(1),
    b: z.number().min(0).max(1),
    a: z.number().min(0).max(1)
  }).strict(),
  flipX: z.boolean(),
  flipY: z.boolean(),
  size: LayeredCharacterObjectVector2Schema.optional()
}).strict();
export type LayeredCharacterRenderer = z.infer<typeof LayeredCharacterRendererSchema>;

export const LayeredCharacterLayerMetadataSchema = z.object({
  sourcePath: z.string().min(1),
  drawOrder: z.number(),
  texture: LayeredCharacterTextureSchema,
  sprite: LayeredCharacterSpriteSchema,
  localTransform: LayeredCharacterTransformSchema,
  renderer: LayeredCharacterRendererSchema
}).strict();
export type LayeredCharacterLayerMetadata = z.infer<typeof LayeredCharacterLayerMetadataSchema>;

function isPackRelativePath(value: string): boolean {
  return (
    !/^[a-zA-Z][a-zA-Z\d+.-]*:/u.test(value) &&
    !value.startsWith("/") &&
    !value.startsWith("\\") &&
    !value.split(/[\\/]/u).includes("..")
  );
}

export const ItemCategorySchema = z.enum(["gift", "tool"]);
export type ItemCategory = z.infer<typeof ItemCategorySchema>;

export const ItemDefSchema = z.object({
  id: IdSchema,
  name: z.string(),
  category: ItemCategorySchema,
  description: z.string(),
  chapterScope: z.string().optional(),
  tags: z.array(z.string()).default([])
});
export type ItemDef = z.infer<typeof ItemDefSchema>;

export const EvidenceDetailSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1)
});
export type EvidenceDetail = z.infer<typeof EvidenceDetailSchema>;

export const EvidenceVisualSchema = z.object({
  iconAssetId: IdSchema.optional(),
  thumbnailAssetId: IdSchema.optional(),
  accentColor: z.string().optional()
});
export type EvidenceVisual = z.infer<typeof EvidenceVisualSchema>;

export const EvidenceDefSchema = z.object({
  id: IdSchema,
  name: z.string(),
  shortLabel: z.string().min(1),
  description: z.string(),
  details: z.array(EvidenceDetailSchema).default([]),
  chapterScope: z.string().optional(),
  visual: EvidenceVisualSchema.default({}),
  tags: z.array(z.string()).default([])
});
export type EvidenceDef = z.infer<typeof EvidenceDefSchema>;

export const InventoryStateSchema = z.object({
  items: z.record(IdSchema, z.number().int().nonnegative()).default({})
});
export type InventoryState = z.infer<typeof InventoryStateSchema>;

export const EvidenceStateSchema = z.object({
  ownedEvidenceIds: z.array(IdSchema).default([]),
  submittedEvidenceIds: z.array(IdSchema).default([])
});
export type EvidenceState = z.infer<typeof EvidenceStateSchema>;

export const CharacterStateSchema = z.object({
  characterId: IdSchema,
  affinity: z.number().int().min(0).max(100).default(0),
  statuses: z.array(z.string()).default([]),
  unlockedSkills: z.array(IdSchema).default([])
});
export type CharacterState = z.infer<typeof CharacterStateSchema>;

export const InteractableDefSchema = z.object({
  id: IdSchema,
  label: z.string(),
  position: Vector3Schema,
  radius: z.number().positive().default(1),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("start-script"), script: z.string(), label: z.string().optional() }),
    z.object({ type: z.literal("start-trial"), trialId: IdSchema, segmentId: IdSchema.optional() }),
    z.object({ type: z.literal("change-map"), mapId: IdSchema, spawnId: IdSchema.optional(), pose: PlayerPoseSchema.optional() }),
    z.object({ type: z.literal("grant-item"), itemId: IdSchema, quantity: z.number().int().positive().default(1) }),
    z.object({ type: z.literal("grant-evidence"), evidenceId: IdSchema }),
    z.object({ type: z.literal("set-character-state"), characterId: IdSchema, affinityDelta: z.number().int().default(0) })
  ])
});
export type InteractableDef = z.infer<typeof InteractableDefSchema>;

export const WorldMapDefSchema = z.object({
  id: IdSchema,
  name: z.string(),
  spawn: Vector3Schema,
  walkBounds: AabbBoundsSchema.optional(),
  cameraRig: CameraRigDefSchema.optional(),
  collisionProxyIds: z.array(IdSchema).default([]),
  interactables: z.array(InteractableDefSchema).default([]),
  assetRefs: z.array(AssetRefSchema).default([])
});
export type WorldMapDef = z.infer<typeof WorldMapDefSchema>;

export const PixiActorKindSchema = z.enum(["background", "character"]);
export type PixiActorKind = z.infer<typeof PixiActorKindSchema>;

export const PixiVector2Schema = z.tuple([z.number(), z.number()]);
export type PixiVector2 = z.infer<typeof PixiVector2Schema>;

export const PixiVector3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type PixiVector3 = z.infer<typeof PixiVector3Schema>;

export const PixiActorFilterSnapshotSchema = z
  .object({
    blur: z.number().nonnegative().optional(),
    bokeh: z.number().nonnegative().optional()
  })
  .default({});
export type PixiActorFilterSnapshot = z.infer<typeof PixiActorFilterSnapshotSchema>;

export const PixiActorTransitionSnapshotSchema = z
  .object({
    name: z.string().optional(),
    durationMs: z.number().int().nonnegative().default(0),
    easing: z.string().optional(),
    lazy: z.boolean().default(false),
    wait: z.boolean().default(false),
    from: PixiVector2Schema.optional(),
    to: PixiVector2Schema.optional()
  })
  .default({ durationMs: 0, lazy: false, wait: false });
export type PixiActorTransitionSnapshot = z.infer<typeof PixiActorTransitionSnapshotSchema>;

export const PixiActorSnapshotSchema = z.object({
  id: IdSchema,
  kind: PixiActorKindSchema,
  appearance: IdSchema.optional(),
  appearanceExpression: z.string().default(""),
  pose: z.string().optional(),
  visible: z.boolean().default(true),
  pos: PixiVector2Schema.optional(),
  position: PixiVector3Schema.optional(),
  rotation: PixiVector3Schema.optional(),
  scale: PixiVector3Schema.optional(),
  tint: z.string().optional(),
  alpha: z.number().min(0).max(1).default(1),
  z: z.number().default(0),
  filters: PixiActorFilterSnapshotSchema,
  look: z.string().optional(),
  transition: PixiActorTransitionSnapshotSchema
}).superRefine((actor, ctx) => {
  if (actor.kind === "character" && actor.appearance !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["appearance"],
      message: "Character actors use appearanceExpression, not appearance."
    });
  }
  if (actor.kind === "background" && actor.appearanceExpression) {
    ctx.addIssue({
      code: "custom",
      path: ["appearanceExpression"],
      message: "Background actors use appearance, not appearanceExpression."
    });
  }
});
export type PixiActorSnapshot = z.infer<typeof PixiActorSnapshotSchema>;

export const PixiWeatherKindSchema = z.enum(["rain", "snow", "sun"]);
export type PixiWeatherKind = z.infer<typeof PixiWeatherKindSchema>;

export const PixiRainCommandParamsSchema = z.object({
  power: z.number().min(0).max(1).default(1),
  wind: z.number().min(-1).max(1).default(-1),
  hue: z.number().min(0).max(360).default(215),
  tint: z.number().min(0).max(2).default(0.55)
}).strict();
export type PixiRainCommandParams = z.infer<typeof PixiRainCommandParamsSchema>;

export const PixiRainWeatherSnapshotSchema = z.object({
  kind: z.literal("rain"),
  commandParams: PixiRainCommandParamsSchema,
  transition: PixiActorTransitionSnapshotSchema
}).strict();
export type PixiRainWeatherSnapshot = z.infer<typeof PixiRainWeatherSnapshotSchema>;

export const PixiSnowWeatherSnapshotSchema = z.object({
  kind: z.literal("snow"),
  power: z.number().nonnegative().default(0),
  xSpeed: z.number().optional(),
  ySpeed: z.number().optional(),
  density: z.number().nonnegative().optional(),
  flakeScale: z.number().nonnegative().optional(),
  sway: z.number().nonnegative().optional(),
  fog: z.number().nonnegative().optional(),
  noise: z.number().nonnegative().optional(),
  seed: z.number().optional(),
  pos: PixiVector2Schema.optional(),
  position: PixiVector3Schema.optional(),
  rotation: PixiVector3Schema.optional(),
  scale: PixiVector3Schema.optional(),
  transition: PixiActorTransitionSnapshotSchema
}).strict();
export type PixiSnowWeatherSnapshot = z.infer<typeof PixiSnowWeatherSnapshotSchema>;

export const PixiSunWeatherSnapshotSchema = z.object({
  kind: z.literal("sun"),
  power: z.number().nonnegative().default(0),
  pos: PixiVector2Schema.optional(),
  position: PixiVector3Schema.optional(),
  rotation: PixiVector3Schema.optional(),
  scale: PixiVector3Schema.optional(),
  transition: PixiActorTransitionSnapshotSchema
}).strict();
export type PixiSunWeatherSnapshot = z.infer<typeof PixiSunWeatherSnapshotSchema>;

export const PixiWeatherSnapshotSchema = z.discriminatedUnion("kind", [
  PixiRainWeatherSnapshotSchema,
  PixiSnowWeatherSnapshotSchema,
  PixiSunWeatherSnapshotSchema
]);
export type PixiWeatherSnapshot = z.infer<typeof PixiWeatherSnapshotSchema>;

export const PixiWeatherSnapshotMapSchema = z
  .object({
    rain: PixiRainWeatherSnapshotSchema.optional(),
    snow: PixiSnowWeatherSnapshotSchema.optional(),
    sun: PixiSunWeatherSnapshotSchema.optional()
  })
  .strict()
  .default({});
export type PixiWeatherSnapshotMap = z.infer<typeof PixiWeatherSnapshotMapSchema>;

export const PixiScreenFiltersSnapshotSchema = z
  .object({
    bokeh: z
      .object({
        focus: z.string().optional(),
        dist: z.number().optional(),
        power: z.number().nonnegative().default(0),
        transition: PixiActorTransitionSnapshotSchema
      })
      .optional(),
    glitch: z
      .object({
        power: z.number().nonnegative().default(0),
        blockJump: z.number().nonnegative().optional(),
        burstJump: z.number().nonnegative().optional(),
        pixelScatter: z.number().nonnegative().optional(),
        colorNoise: z.number().nonnegative().optional(),
        speed: z.number().nonnegative().optional(),
        seed: z.number().optional(),
        transition: PixiActorTransitionSnapshotSchema
      })
      .optional()
  })
  .default({});
export type PixiScreenFiltersSnapshot = z.infer<typeof PixiScreenFiltersSnapshotSchema>;

export const PixiStageSnapshotSchema = z.object({
  version: z.literal(4),
  revision: z.number().int().nonnegative().default(0),
  backgroundsById: z.record(IdSchema, PixiActorSnapshotSchema).default({}),
  charactersById: z.record(IdSchema, PixiActorSnapshotSchema).default({}),
  actorOrder: z.array(IdSchema).default([]),
  weather: PixiWeatherSnapshotMapSchema,
  screenFilters: PixiScreenFiltersSnapshotSchema
}).strict();
export type PixiStageSnapshot = z.infer<typeof PixiStageSnapshotSchema>;

export const TrialKeywordSchema = z.object({
  id: IdSchema,
  text: z.string(),
  correctEvidenceId: IdSchema,
  speakerId: IdSchema.optional()
});
export type TrialKeyword = z.infer<typeof TrialKeywordSchema>;

export const TruthBulletSchema = z.object({
  evidenceId: IdSchema,
  label: z.string()
});
export type TruthBullet = z.infer<typeof TruthBulletSchema>;

export const TrialSegmentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("discussion"),
    id: IdSchema,
    presentation: TrialPresentationProfileSchema.optional(),
    script: z.string(),
    nextSegmentId: IdSchema.optional()
  }),
  z.object({
    kind: z.literal("debate"),
    id: IdSchema,
    presentation: TrialPresentationProfileSchema.optional(),
    script: z.string(),
    timeLimitMs: z.number().int().positive().optional(),
    truthBullets: z.array(TruthBulletSchema),
    keywords: z.array(TrialKeywordSchema),
    onCorrect: IdSchema.optional(),
    onTimeout: IdSchema.optional(),
    onMiss: IdSchema.optional()
  }),
  z.object({
    kind: z.literal("minigame"),
    id: IdSchema,
    presentation: TrialPresentationProfileSchema.optional(),
    gameId: IdSchema,
    onSuccess: IdSchema,
    onFailure: IdSchema.optional()
  }),
  z.object({
    kind: z.literal("evidence-submit"),
    id: IdSchema,
    presentation: TrialPresentationProfileSchema.optional(),
    prompt: z.string(),
    acceptedEvidenceIds: z.array(IdSchema),
    onAccepted: IdSchema,
    onRejected: IdSchema.optional()
  })
]);
export type TrialSegment = z.infer<typeof TrialSegmentSchema>;

export const TrialDefinitionSchema = z.object({
  id: IdSchema,
  title: z.string(),
  initialSegmentId: IdSchema,
  segments: z.array(TrialSegmentSchema)
});
export type TrialDefinition = z.infer<typeof TrialDefinitionSchema>;

export const StoryScalarSchema = z.union([z.string(), z.number(), z.boolean()]);
export type StoryScalar = z.infer<typeof StoryScalarSchema>;

export const StoryBacklogEntrySchema = z.object({
  speaker: z.string().optional(),
  text: z.string(),
  richText: RichTextDocumentSchema.optional()
}).superRefine((entry, ctx) => {
  addRichTextPlainTextConsistencyIssue(ctx, entry.richText, entry.text, ["richText", "text"]);
});
export type StoryBacklogEntry = z.infer<typeof StoryBacklogEntrySchema>;

export const StoryChoiceOptionSchema = z.object({
  text: z.string(),
  richText: RichTextDocumentSchema.optional(),
  goto: z.string().optional(),
  id: z.string().optional(),
  enabled: z.boolean().default(true),
  setExpression: z.string().optional()
}).superRefine((choice, ctx) => {
  addRichTextPlainTextConsistencyIssue(ctx, choice.richText, choice.text, ["richText", "text"]);
});
export type StoryChoiceOption = z.infer<typeof StoryChoiceOptionSchema>;

export const StoryRuntimeWaitSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pause"),
    commandId: z.literal("wait"),
    commandIndex: z.number().int().nonnegative(),
    mode: z.enum(["timer", "confirm", "timer-or-confirm"]),
    durationMs: z.number().int().nonnegative().optional()
  }),
  z.object({
    kind: z.literal("input"),
    commandId: z.literal("input"),
    commandIndex: z.number().int().nonnegative(),
    variableName: z.string().min(1),
    valueType: z.enum(["string", "number", "boolean"]).default("string"),
    summary: z.string().optional(),
    defaultValue: StoryScalarSchema.optional()
  }),
  z.object({
    kind: z.literal("movie"),
    commandId: z.literal("movie"),
    commandIndex: z.number().int().nonnegative(),
    moviePath: z.string().min(1),
    allowSkip: z.boolean().default(true)
  })
]);
export type StoryRuntimeWait = z.infer<typeof StoryRuntimeWaitSchema>;

const StoryTextCurrentSchema = z.object({
  speaker: z.string().optional(),
  text: z.string(),
  richText: RichTextDocumentSchema.optional()
}).superRefine((line, ctx) => {
  addRichTextPlainTextConsistencyIssue(ctx, line.richText, line.text, ["richText", "text"]);
});

export const StoryTextStateSchema = z.object({
  printerId: z.string().default("default"),
  visible: z.boolean().default(true),
  current: StoryTextCurrentSchema.optional()
});
export type StoryTextState = z.infer<typeof StoryTextStateSchema>;

export const PixiPresentationTaskKindSchema = z.enum([
  "actor-transition",
  "screen-filter-transition",
  "weather-transition",
  "flash",
  "shake",
  "glitch"
]);
export type PixiPresentationTaskKind = z.infer<typeof PixiPresentationTaskKindSchema>;

export const StoryPresentationWaitTaskSchema = z.object({
  kind: PixiPresentationTaskKindSchema,
  target: z.string().min(1),
  revision: z.number().int().nonnegative()
});
export type StoryPresentationWaitTask = z.infer<typeof StoryPresentationWaitTaskSchema>;

export const StoryPresentationWaitSchema = z.object({
  commandId: z.string().min(1),
  commandIndex: z.number().int().nonnegative().optional(),
  durationMs: z.number().int().nonnegative(),
  target: z.string().min(1).optional(),
  stageRevision: z.number().int().nonnegative().optional(),
  expectedTasks: z.array(StoryPresentationWaitTaskSchema).default([])
});
export type StoryPresentationWait = z.infer<typeof StoryPresentationWaitSchema>;

export const GameplayEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("grant-item"), itemId: IdSchema, quantity: z.number().int().positive().default(1) }),
  z.object({ type: z.literal("remove-item"), itemId: IdSchema, quantity: z.number().int().positive().default(1) }),
  z.object({ type: z.literal("consume-item"), itemId: IdSchema, quantity: z.number().int().positive().default(1) }),
  z.object({ type: z.literal("grant-evidence"), evidenceId: IdSchema }),
  z.object({ type: z.literal("remove-evidence"), evidenceId: IdSchema }),
  z.object({ type: z.literal("change-character-affinity"), characterId: IdSchema, affinityDelta: z.number().int() }),
  z.object({ type: z.literal("add-character-status"), characterId: IdSchema, status: z.string().min(1) }),
  z.object({ type: z.literal("remove-character-status"), characterId: IdSchema, status: z.string().min(1) }),
  z.object({ type: z.literal("unlock-character-skill"), characterId: IdSchema, skillId: IdSchema })
]);
export type GameplayEvent = z.infer<typeof GameplayEventSchema>;

export const StoryRuntimeSnapshotSchema = z.object({
  currentScriptPath: z.string(),
  instructionPointer: z.number().int().nonnegative(),
  variables: z.record(z.string(), StoryScalarSchema).default({}),
  backlog: z.array(StoryBacklogEntrySchema).default([]),
  pendingChoices: z.array(StoryChoiceOptionSchema).default([]),
  presentationWait: StoryPresentationWaitSchema.optional(),
  runtimeWait: StoryRuntimeWaitSchema.optional(),
  text: StoryTextStateSchema.optional(),
  ended: z.boolean().default(false)
});
export type StoryRuntimeSnapshot = z.infer<typeof StoryRuntimeSnapshotSchema>;

export const GameInteractionContextSchema = z.object({
  mode: GameModeSchema,
  overlayStack: z.array(GameOverlayKindSchema).default([]),
  naviSubstate: NaviSubstateSchema.optional(),
  trialPresentation: TrialPresentationProfileSchema.optional(),
  inputLock: InputLockStateSchema.default("none"),
  hasActiveStory: z.boolean().default(false),
  storyHasChoices: z.boolean().default(false),
  storyEnded: z.boolean().default(false),
  isAtStableStop: z.boolean().default(false)
});
export type GameInteractionContext = z.infer<typeof GameInteractionContextSchema>;

export const InteractionCapabilitySnapshotSchema = z.object({
  canStartNewGame: z.boolean().default(false),
  canSave: z.boolean().default(false),
  canLoad: z.boolean().default(false),
  canOpenSettings: z.boolean().default(true),
  canOpenBacklog: z.boolean().default(false),
  canOpenPauseMenu: z.boolean().default(false),
  canAuto: z.boolean().default(false),
  canSkip: z.boolean().default(false),
  canReturnTitle: z.boolean().default(false)
});
export type InteractionCapabilitySnapshot = z.infer<typeof InteractionCapabilitySnapshotSchema>;

export const SettingsLanguageSchema = z.enum(["zh-CN", "zh-TW", "en", "ja", "ko"]);
export type SettingsLanguage = z.infer<typeof SettingsLanguageSchema>;

export const SettingsTextSizeSchema = z.enum(["small", "medium", "large"]);
export type SettingsTextSize = z.infer<typeof SettingsTextSizeSchema>;

export const SettingsSystemSnapshotSchema = z
  .object({
    language: SettingsLanguageSchema.default("zh-CN"),
    skipAll: z.boolean().default(false),
    preferFullscreen: z.boolean().default(false)
  })
  .strict();
export type SettingsSystemSnapshot = z.infer<typeof SettingsSystemSnapshotSchema>;

export const SettingsDisplaySnapshotSchema = z
  .object({
    textSpeed: NormalizedSettingSchema.default(0.5),
    textSize: SettingsTextSizeSchema.default("medium"),
    textboxOpacity: NormalizedSettingSchema.default(0.75),
    fontFamilyId: IdSchema.default("font:default")
  })
  .strict();
export type SettingsDisplaySnapshot = z.infer<typeof SettingsDisplaySnapshotSchema>;

export const SettingsSoundSnapshotSchema = z
  .object({
    masterVolume: NormalizedSettingSchema.default(1),
    bgmVolume: NormalizedSettingSchema.default(0.25),
    sfxVolume: NormalizedSettingSchema.default(1),
    bleepVolume: NormalizedSettingSchema.default(1),
    voiceVolume: NormalizedSettingSchema.default(1),
    uiVolume: NormalizedSettingSchema.default(0.5),
    muted: z.boolean().default(false)
  })
  .strict();
export type SettingsSoundSnapshot = z.infer<typeof SettingsSoundSnapshotSchema>;

export const SettingsAutomationSnapshotSchema = z
  .object({
    autoSpeed: NormalizedSettingSchema.default(0.5),
    skipSpeed: NormalizedSettingSchema.default(0.5)
  })
  .strict();
export type SettingsAutomationSnapshot = z.infer<typeof SettingsAutomationSnapshotSchema>;

const DEFAULT_SETTINGS_SYSTEM_SNAPSHOT = {
  language: "zh-CN",
  skipAll: false,
  preferFullscreen: false
} as const;

const DEFAULT_SETTINGS_DISPLAY_SNAPSHOT = {
  textSpeed: 0.5,
  textSize: "medium",
  textboxOpacity: 0.75,
  fontFamilyId: "font:default"
} as const;

const DEFAULT_SETTINGS_SOUND_SNAPSHOT = {
  masterVolume: 1,
  bgmVolume: 0.25,
  sfxVolume: 1,
  bleepVolume: 1,
  voiceVolume: 1,
  uiVolume: 0.5,
  muted: false
} as const;

const DEFAULT_SETTINGS_AUTOMATION_SNAPSHOT = {
  autoSpeed: 0.5,
  skipSpeed: 0.5
} as const;

export const SettingsSnapshotSchema = z
  .object({
    version: z.literal(1),
    system: SettingsSystemSnapshotSchema.default(DEFAULT_SETTINGS_SYSTEM_SNAPSHOT),
    display: SettingsDisplaySnapshotSchema.default(DEFAULT_SETTINGS_DISPLAY_SNAPSHOT),
    sound: SettingsSoundSnapshotSchema.default(DEFAULT_SETTINGS_SOUND_SNAPSHOT),
    automation: SettingsAutomationSnapshotSchema.default(DEFAULT_SETTINGS_AUTOMATION_SNAPSHOT)
  })
  .strict();
export type SettingsSnapshot = z.infer<typeof SettingsSnapshotSchema>;

export interface SettingsPatch {
  system?: Partial<SettingsSystemSnapshot>;
  display?: Partial<SettingsDisplaySnapshot>;
  sound?: Partial<SettingsSoundSnapshot>;
  automation?: Partial<SettingsAutomationSnapshot>;
}

export function createDefaultSettingsSnapshot(): SettingsSnapshot {
  return SettingsSnapshotSchema.parse({ version: 1 });
}

export const SaveSlotSummarySchema = z.object({
  id: IdSchema,
  label: z.string().min(1),
  savedAt: z.string(),
  mode: GameModeSchema,
  speaker: z.string().optional(),
  text: z.string().optional()
});
export type SaveSlotSummary = z.infer<typeof SaveSlotSummarySchema>;

export const NaviRuntimeStateSchema = z.object({
  substate: NaviSubstateSchema,
  activeMapId: IdSchema.optional(),
  activeInteractableId: IdSchema.optional(),
  overlayScript: z.string().optional(),
  playerPose: PlayerPoseSchema.optional(),
  inputLock: InputLockStateSchema.default("none")
});
export type NaviRuntimeState = z.infer<typeof NaviRuntimeStateSchema>;

export const TrialRuntimeStateSchema = z.object({
  trialId: IdSchema,
  currentSegmentId: IdSchema,
  presentation: TrialPresentationProfileSchema,
  inputLock: InputLockStateSchema.default("none"),
  selectedEvidenceId: IdSchema.optional(),
  timerRemainingMs: z.number().int().nonnegative().optional(),
  keywordStates: z.record(IdSchema, z.enum(["pending", "broken", "missed"])).default({})
});
export type TrialRuntimeState = z.infer<typeof TrialRuntimeStateSchema>;

export const VnPresentationProfileSchema = z.enum(["vn2d", "vn3d"]);
export type VnPresentationProfile = z.infer<typeof VnPresentationProfileSchema>;

export const VnEntryDefSchema = z
  .object({
    id: IdSchema,
    title: z.string().min(1),
    scriptPath: z.string().min(1),
    startLabel: z.string().min(1).optional(),
    profile: VnPresentationProfileSchema.default("vn2d"),
    assetRefs: z.array(AssetRefSchema).default([])
  })
  .strict();
export type VnEntryDef = z.infer<typeof VnEntryDefSchema>;

export const SaveableVnStateSchema = z
  .object({
    entryId: IdSchema.optional(),
    story: StoryRuntimeSnapshotSchema,
    pixiStage: PixiStageSnapshotSchema
  })
  .strict();
export type SaveableVnState = z.infer<typeof SaveableVnStateSchema>;

export const SaveDataSchema = z.object({
  version: z.literal(3),
  savedAt: z.string(),
  mode: GameModeSchema,
  vn: SaveableVnStateSchema.optional(),
  navi: NaviRuntimeStateSchema.optional(),
  story: StoryRuntimeSnapshotSchema,
  pixiStage: PixiStageSnapshotSchema,
  inventory: InventoryStateSchema,
  evidence: EvidenceStateSchema,
  characters: z.record(IdSchema, CharacterStateSchema),
  trial: TrialRuntimeStateSchema.optional()
});
export type SaveData = z.infer<typeof SaveDataSchema>;

export const ContentManifestSchema = z.object({
  version: z.literal(2),
  assets: z.array(AssetRefSchema).default([]),
  audio: ContentAudioConfigSchema.optional(),
  fonts: z.array(FontFaceDefinitionSchema).default([]),
  uiAssets: z.array(UiAssetRefSchema).default([]),
  interactionStyles: z.array(InteractionStyleProfileSchema).default([]),
  runtimeAssets: z.array(RuntimeAssetSchema).default([]),
  collisionProxies: z.array(CollisionProxySchema).default([]),
  input: InputBindingMapSchema.optional(),
  vnEntries: z.array(VnEntryDefSchema).default([]),
  maps: z.array(WorldMapDefSchema),
  items: z.array(ItemDefSchema),
  evidence: z.array(EvidenceDefSchema).default([]),
  trials: z.array(TrialDefinitionSchema)
}).strict();
export type ContentManifestInput = z.input<typeof ContentManifestSchema>;
export type ContentManifest = z.infer<typeof ContentManifestSchema>;

export function parseContract<T>(schema: z.ZodType<T>, value: unknown): T {
  return schema.parse(value);
}
