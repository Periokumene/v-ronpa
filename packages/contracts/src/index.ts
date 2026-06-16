import { z } from "zod";

export const IdSchema = z.string().min(1).regex(/^[a-zA-Z0-9:_./-]+$/);

export const GameModeSchema = z.enum(["loading", "navi", "trial", "paused", "saving"]);
export type GameMode = z.infer<typeof GameModeSchema>;

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
  facing: Vector3Schema.optional(),
  suggestedInteractableId: IdSchema.optional()
});
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
  facing: Vector3Schema.optional(),
  candidateId: IdSchema.optional()
});
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

export const AssetRefSchema = z.object({
  id: IdSchema,
  kind: z.enum(["portrait", "background", "bgm", "sfx", "voice", "video", "glb", "texture", "fx"]),
  uri: z.string(),
  tags: z.array(z.string()).default([])
});
export type AssetRef = z.infer<typeof AssetRefSchema>;

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

export const PresentationCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("set-background"),
    backgroundId: IdSchema,
    effect: z.string().optional()
  }),
  z.object({
    type: z.literal("char-enter"),
    characterId: IdSchema,
    portraitId: IdSchema.optional(),
    slot: z.enum(["left", "center", "right"]).default("center"),
    effect: z.string().default("fadeIn")
  }),
  z.object({
    type: z.literal("shake"),
    target: z.string(),
    intensity: z.number().min(0).max(1).default(0.35),
    durationMs: z.number().int().positive().default(280)
  }),
  z.object({
    type: z.literal("flash"),
    color: z.string().default("#ffffff"),
    durationMs: z.number().int().positive().default(160)
  }),
  z.object({
    type: z.literal("focus"),
    target: z.string(),
    durationMs: z.number().int().positive().default(500)
  }),
  z.object({
    type: z.literal("camera-focus"),
    targetId: IdSchema,
    framing: z.enum(["close", "medium", "wide"]).default("medium"),
    durationMs: z.number().int().positive().default(500)
  }),
  z.object({
    type: z.literal("stage-actor"),
    action: z.enum(["enter", "exit", "pose", "focus"]),
    characterId: IdSchema,
    standeeId: IdSchema.optional(),
    position: Vector3Schema.optional(),
    durationMs: z.number().int().positive().optional()
  }),
  z.object({
    type: z.literal("trial-keyword"),
    keywordId: IdSchema,
    text: z.string(),
    evidenceId: IdSchema.optional(),
    speakerId: IdSchema.optional()
  }),
  z.object({
    type: z.literal("trial-subtitle"),
    subtitleId: IdSchema,
    text: z.string(),
    style: z.enum(["dialog", "barrage", "keyword"]).default("dialog"),
    speakerId: IdSchema.optional(),
    keywordId: IdSchema.optional(),
    evidenceId: IdSchema.optional()
  }),
  z.object({
    type: z.literal("print"),
    speaker: z.string().optional(),
    text: z.string(),
    autoNext: z.boolean().default(false)
  })
]);
export type PresentationCommand = z.infer<typeof PresentationCommandSchema>;

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
  goto: z.string().optional()
});
export type StoryChoiceOption = z.infer<typeof StoryChoiceOptionSchema>;

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
  ended: z.boolean().default(false)
});
export type StoryRuntimeSnapshot = z.infer<typeof StoryRuntimeSnapshotSchema>;

export const StoryEffectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("presentation"), command: PresentationCommandSchema }),
  z.object({ type: z.literal("navi-event"), eventType: z.string().min(1), payload: z.unknown().optional() }),
  z.object({ type: z.literal("trial-event"), eventType: z.string().min(1), payload: z.unknown().optional() }),
  z.object({ type: z.literal("gameplay-event"), event: GameplayEventSchema }),
  z.object({
    type: z.literal("media-event"),
    eventType: z.enum(["play-bgm", "play-sfx", "play-video", "stop-media"]),
    assetId: IdSchema.optional(),
    payload: z.unknown().optional()
  })
]);
export type StoryEffect = z.infer<typeof StoryEffectSchema>;

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
  version: z.literal(1),
  savedAt: z.string(),
  mode: GameModeSchema,
  navi: NaviRuntimeStateSchema.optional(),
  story: StoryRuntimeSnapshotSchema,
  inventory: InventoryStateSchema,
  evidence: EvidenceStateSchema,
  characters: z.record(IdSchema, CharacterStateSchema),
  trial: TrialRuntimeStateSchema.optional()
});
export type SaveData = z.infer<typeof SaveDataSchema>;

export const ContentManifestSchema = z.object({
  version: z.literal(1),
  assets: z.array(AssetRefSchema),
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
