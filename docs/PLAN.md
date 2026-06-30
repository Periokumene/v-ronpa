# VN Runtime 基建重构计划

## Summary
本次重构一次性建立 `packages/app-vn-runtime`，并让 `game-harness` 与 `game-a` 都接入同一套 VN runtime loop。`game-harness` 以完整游戏特性为设计源头，`game-a` 作为 VN framework 验证骨架同步调整依赖、资源和接线。目标是删除旧 VN 双实现，避免兼容层、多权威和接口漂移。

## Key Changes
- 新增 `packages/app-vn-runtime`，同包分层提供 core + React hook：
  - 基于 `app-vn-session` 作为 VN boot/advance/choice/input/wait 唯一入口。
  - 直接依赖 `media-save`，使用真实 `AudioPort` / `VideoPort` / `AudioHandle` 语义。
  - 管理 dialog reveal timer、AUTO/SKIP schedule、voice auto gate、media handles、movie overlay、Pixi `wait!` task observation、runtime wait host、restore/reset cleanup。
  - 暴露一个 shell-compatible runtime adapter，供 `GameInteractionShell` 和 `VnRuntimeDispatcher` 消费。
- `app-vn-dispatch` 保持纯 planner/reducer：route table、presentation transaction、dialog reveal/audio/media/UI planning，不接浏览器 timers、ports、React state。
- `app-vn-session` 保持 headless session，但把含 `StoryPlayState` 的 `SaveableVnSessionSnapshot` 硬改名为 session-local restore 语义，删除旧别名。
- `app-vn-shell` 不吸收 runtime，只继续承载 DOM shell、settings adapter、overlay action helpers。
- `game-harness` 的 `useHarnessShowcaseRuntimeAdapter` 变为薄组装层：只负责 Navi/Trial/R3F/showcase/debug glue，VN story runtime 全部委托 `app-vn-runtime`。
- `game-a` 的 `useGameAVnRuntime` 保留为薄组装层：只传入 VN entry/source/settings/asset resolver，内部调用共享 runtime。

## Cleanup And Drift Prevention
- 从 `apps/game-harness/src/interaction/useHarnessShowcaseRuntimeAdapter.ts` 移除通用 VN 实现与导出：
  - 删除/迁移 `createVoiceAutoAdvanceGateController`、`applyMediaRuntimeEffects`、`resolveDialogueVoiceAssetAvailability`、`createHarnessShowcaseRuntimeRestorePlan`、`createHarnessShowcasePresentationTransaction`。
  - 删除/迁移 `MediaHandleStore`、`ApplyMediaRuntimeEffectsInput/Result`、`VoiceAutoAdvanceGateController`、`DialogRevealRuntime` 等通用 runtime 类型。
  - 删除 harness 本地 storyPlay timer、dialog reveal timer、voice gate refs、media handle refs、movie playback refs、Pixi wait observer refs。
- 从 `apps/game-a/src/useGameAVnRuntime.ts` 移除本地 VN loop：
  - 不再直接 import `app-vn-session`、`app-vn-dispatch`、`story-play`、`pixi-presenter` runtime helper。
  - `dialogRevealRuntime`、movie、toast、Pixi wait 不再是 no-op 或半接线，统一走共享 runtime。
- 严格收口 app 直接低层 VN 依赖：
  - app 源码不再直接 import parser/compiler/story-play/app-vn-dispatch/app-vn-session，除非是非 runtime 的测试或内容验证且无法由 runtime API 替代。
  - 更新 `scripts/validate-boundaries.mjs`、package manifests、tsconfig references。
- 增加本次重构专用硬守卫：
  - 临时检查旧 helper 名称、harness 私有 VN loop 关键词、app 直接低层 VN import。
  - 该守卫用于本次验收；验收通过后可单独清理或降级。
- 更新活跃文档：`docs/architecture/*`、subsystem fanout、harness gates、worktree flow；历史 CCR/archive 保持历史记录，不全库改写。

## Game A And Harness Validation
- `game-harness` 继续作为完整特性验证源：
  - Navi overlay 启动 VN、Trial entry 清理 VN transient、R3F/Pixi/media/save/load/settings/smoke 都必须保持现有行为。
  - Harness runtime tests 中 voice/media/reveal/wait/restore 通用用例搬到 `app-vn-runtime`；harness tests 只保留 Navi/Trial/R3F/showcase glue。
- `game-a` 升级为完整 VN framework 验证：
  - 在 game-a manifest/public 下添加独立最小 bgm/sfx/bleep/voice/video 资源。
  - 脚本覆盖 reveal、AUTO/SKIP、voice textId、bleep fallback、movie、Pixi `wait!`、media command、save/load restore cleanup。
  - 不复用 harness public 资源，避免 app 内容边界耦合。
- 保持 runtime 宿主无关：
  - `app-vn-runtime` 不理解 Navi/Trial 状态。
  - Harness 通过薄组装层处理 Navi overlay、Trial entry/exit、gameplay event application。

## Tests And Acceptance
- 新增 `packages/app-vn-runtime` 单测：
  - boot/advance/choice/input/runtime wait/presentation wait。
  - dialog reveal pacing、manual complete、hidden dialog instant reveal。
  - voice gate ended/failed/stopped、500ms post voice delay、skip/manual clear。
  - BGM/SFX/voice/bleep/movie media execution和缺失资产 diagnostics。
  - save/restore 清 runtimeWait、reveal、voice、bleep、movie、Pixi tasks。
- 迁移现有 harness helper tests 到新包，旧 harness 不保留重复测试。
- 更新 game-a 和 harness smoke，保留现有截图/交互覆盖并加入 game-a 完整 VN runtime 验证。
- 最终验收必须跑完整 baseline：`pnpm validate:baseline`，并补跑本次临时 cleanup guard。

## Assumptions And Contract Policy
- 只新增一个包：`packages/app-vn-runtime`，不拆 `runtime-core` / `runtime-react`。
- 默认不改 `packages/contracts` 或 `.nani` IR；但如果实现理想 runtime 基建必须改公共合同，可以在同一任务内添加 CCR、更新合同测试和 smoke，并明确列出影响。
- 不保留兼容别名、旧 re-export、旧 helper 副本；薄 app wrapper 只允许做 app-specific wiring，不允许重新实现 VN loop。
