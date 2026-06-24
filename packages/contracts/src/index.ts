import { z } from "zod";

export const IdSchema = z.string().min(1).regex(/^[a-zA-Z0-9:_./-]+$/);

export const GameModeSchema = z.enum(["loading", "title", "navi", "trial", "paused", "saving"]);
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
  format: "implemented",
  input: "implemented",
  glitch: "implemented",
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
  format: "story-control",
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
  official("glitch", "effect", [param("time", "decimal"), param("power", "decimal"), param("wait", "boolean")]),
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
  official("rain", "effect", [
    param("power", "decimal"),
    param("time", "decimal"),
    param("xSpeed", "decimal"),
    param("ySpeed", "decimal"),
    param("pos", "decimal list"),
    param("position", "decimal list"),
    param("rotation", "decimal list"),
    param("scale", "decimal list"),
    param("wait", "boolean")
  ]),
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
  official("snow", "effect", particleParams),
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
    [param("character", "string"), param("portrait", "string"), param("slot", "string"), param("effect", "string")],
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

export const AssetRefSchema = z.object({
  id: IdSchema,
  kind: z.enum(["portrait", "background", "bgm", "sfx", "voice", "video", "glb", "texture", "fx"]),
  uri: z.string(),
  tags: z.array(z.string()).default([])
});
export type AssetRef = z.infer<typeof AssetRefSchema>;

export const RuntimeExpressionSchema = z.object({ type: z.literal("expression"), source: z.string() }).strict();
export type RuntimeExpression = z.infer<typeof RuntimeExpressionSchema>;

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
    loc: SourceLocationSchema,
    sourceCommand: RuntimeSourceCommandSchema.optional()
  })
  .strict();
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

export const UiAssetRefSchema = z.object({
  id: IdSchema,
  role: UiAssetRoleSchema,
  assetId: IdSchema.optional(),
  uri: z.string().optional(),
  slice: z.enum(["stretch", "nine-slice", "tile"]).default("stretch"),
  tags: z.array(z.string()).default([])
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

export const RuntimeAssetKindSchema = z.enum([
  "portrait",
  "background",
  "bgm",
  "sfx",
  "voice",
  "video",
  "glb",
  "texture",
  "fx"
]);
export type RuntimeAssetKind = z.infer<typeof RuntimeAssetKindSchema>;

export const RuntimeAssetFormatSchema = z.enum([
  "glb",
  "gltf",
  "png",
  "webp",
  "avif",
  "ktx2",
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
  uri: z.string().optional(),
  size: Vector3Schema.optional(),
  radius: z.number().positive().optional(),
  height: z.number().positive().optional()
});
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
});
export type RuntimeAsset = z.infer<typeof RuntimeAssetSchema>;

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

export const PixiStageSlotIdSchema = z.enum(["left", "center", "right"]);
export type PixiStageSlotId = z.infer<typeof PixiStageSlotIdSchema>;

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
});
export type PixiActorSnapshot = z.infer<typeof PixiActorSnapshotSchema>;

export const PixiWeatherKindSchema = z.enum(["rain", "snow", "sun"]);
export type PixiWeatherKind = z.infer<typeof PixiWeatherKindSchema>;

export const PixiWeatherSnapshotSchema = z.object({
  kind: PixiWeatherKindSchema,
  power: z.number().nonnegative().default(0),
  xSpeed: z.number().optional(),
  ySpeed: z.number().optional(),
  pos: PixiVector2Schema.optional(),
  position: PixiVector3Schema.optional(),
  rotation: PixiVector3Schema.optional(),
  scale: PixiVector3Schema.optional(),
  transition: PixiActorTransitionSnapshotSchema
});
export type PixiWeatherSnapshot = z.infer<typeof PixiWeatherSnapshotSchema>;

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
        transition: PixiActorTransitionSnapshotSchema
      })
      .optional()
  })
  .default({});
export type PixiScreenFiltersSnapshot = z.infer<typeof PixiScreenFiltersSnapshotSchema>;

export const PixiStageBackgroundSnapshotSchema = z.object({
  backgroundId: IdSchema
});
export type PixiStageBackgroundSnapshot = z.infer<typeof PixiStageBackgroundSnapshotSchema>;

export const PixiStagePortraitSlotSnapshotSchema = z.object({
  slot: PixiStageSlotIdSchema,
  characterId: IdSchema,
  portraitId: IdSchema.optional()
});
export type PixiStagePortraitSlotSnapshot = z.infer<typeof PixiStagePortraitSlotSnapshotSchema>;

export const PixiStageSlotsSnapshotSchema = z
  .object({
    left: PixiStagePortraitSlotSnapshotSchema.optional(),
    center: PixiStagePortraitSlotSnapshotSchema.optional(),
    right: PixiStagePortraitSlotSnapshotSchema.optional()
  })
  .default({})
  .superRefine((slots, ctx) => {
    for (const slot of PixiStageSlotIdSchema.options) {
      if (slots[slot] && slots[slot].slot !== slot) {
        ctx.addIssue({
          code: "custom",
          path: [slot, "slot"],
          message: `Pixi stage slot key '${slot}' must match the portrait slot value.`
        });
      }
    }
  });
export type PixiStageSlotsSnapshot = z.infer<typeof PixiStageSlotsSnapshotSchema>;

export const PixiStageSnapshotSchema = z.object({
  version: z.literal(2),
  revision: z.number().int().nonnegative().default(0),
  backgroundsById: z.record(IdSchema, PixiActorSnapshotSchema).default({}),
  charactersById: z.record(IdSchema, PixiActorSnapshotSchema).default({}),
  actorOrder: z.array(IdSchema).default([]),
  weather: z.partialRecord(PixiWeatherKindSchema, PixiWeatherSnapshotSchema).default({}),
  screenFilters: PixiScreenFiltersSnapshotSchema,
  background: PixiStageBackgroundSnapshotSchema.optional(),
  slots: PixiStageSlotsSnapshotSchema
});
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
  text: z.string()
});
export type StoryBacklogEntry = z.infer<typeof StoryBacklogEntrySchema>;

export const StoryChoiceOptionSchema = z.object({
  text: z.string(),
  goto: z.string().optional(),
  id: z.string().optional(),
  enabled: z.boolean().default(true),
  setExpression: z.string().optional()
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

export const StoryTextStateSchema = z.object({
  printerId: z.string().default("default"),
  visible: z.boolean().default(true),
  current: z
    .object({
      speaker: z.string().optional(),
      text: z.string(),
      formatId: z.string().optional()
    })
    .optional(),
  formats: z.record(z.string(), z.string()).default({})
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

export const SettingsVoiceInterruptionSchema = z.enum(["interrupt", "continue"]);
export type SettingsVoiceInterruption = z.infer<typeof SettingsVoiceInterruptionSchema>;

const NormalizedSettingSchema = z.number().min(0).max(1);

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
    voiceVolume: NormalizedSettingSchema.default(1),
    uiVolume: NormalizedSettingSchema.default(0.5),
    muted: z.boolean().default(false),
    voiceInterruption: SettingsVoiceInterruptionSchema.default("continue")
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
  voiceVolume: 1,
  uiVolume: 0.5,
  muted: false,
  voiceInterruption: "continue"
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

export const SaveDataSchema = z.object({
  version: z.literal(2),
  savedAt: z.string(),
  mode: GameModeSchema,
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
  version: z.literal(1),
  assets: z.array(AssetRefSchema),
  uiAssets: z.array(UiAssetRefSchema).default([]),
  interactionStyles: z.array(InteractionStyleProfileSchema).default([]),
  runtimeAssets: z.array(RuntimeAssetSchema).default([]),
  collisionProxies: z.array(CollisionProxySchema).default([]),
  input: InputBindingMapSchema.optional(),
  maps: z.array(WorldMapDefSchema),
  items: z.array(ItemDefSchema),
  evidence: z.array(EvidenceDefSchema).default([]),
  trials: z.array(TrialDefinitionSchema)
});
export type ContentManifest = z.infer<typeof ContentManifestSchema>;

export function parseContract<T>(schema: z.ZodType<T>, value: unknown): T {
  return schema.parse(value);
}
