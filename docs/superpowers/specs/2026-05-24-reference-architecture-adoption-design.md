# Reference Architecture Adoption And Collaboration Workroom Design

## Summary

本项目继续以“多个 Agent 在同一个房间中平等协作，减少用户来回复制对话”为核心目标。

新的执行原则是：优先采用本地参考实现中已经验证过的架构能力，不为了“重新做一遍”而大改造。真正需要改的是产品语义、默认体验、开发主线优先级和长期可维护边界。

项目仍然保持独立的公开身份。公开文档应描述本项目自己的目标、模块、术语和验收标准；本地参考实现只作为工程学习与迁移依据。

## Product Direction

第一阶段交付本机运行的 Web 协作工作台。用户在一个房间中和多个智能协作成员对话，成员之间可以被点名、互相挑战、执行任务、进行 review，并把结果回写到同一条时间线。

默认协作成员保持：

- `architect`: 方案、边界、取舍、收敛路线
- `reviewer`: 质疑、风险、测试缺口、架构漂移
- `implementer`: 实现、验证、修复、落地

这些是默认席位，不是固定人格系统。后续应支持自定义成员，并允许修改成员背后的 runtime binding，例如把某个席位从 Claude Code 切换为 Codex CLI。

## Reference Architecture First

优先采用参考实现中已经验证过的架构能力，尤其是：

- runtime agent catalog / roster
- CLI subprocess invocation
- provider-aware agent service abstraction
- streaming event normalization
- invocation lifecycle
- mention routing
- invocation queue and per-agent slot control
- cancellation, retry, timeout, and failure isolation
- WebSocket streaming back to the console
- connector gateway as a client surface rather than state owner
- runtime configuration and account binding

不做过度裁剪。对长期可能需要的模块，优先使用 feature flag、隐藏入口、低优先级排期或配置关闭，而不是删除后未来再补回来。

## What To Reshape

需要重塑的是产品语义和默认体验：

- 从宠物主题和宠物主人隐喻改为“协作工作台/协作舱/任务房间”
- UI 中尽量直接称呼用户为“你”，避免冷冰冰的 `Operator` 或 `Owner`
- 底层权限模型可以使用 `user`、`human`、`controller` 等代码术语，但 UI 不直接暴露
- 保留温馨的“工作空间像家”的氛围，但视觉语言更偏科技、清晰、专业、可控
- 默认头像应偏向智能伙伴、协作核心、几何徽章、工作舱身份，而不是宠物隐喻

不应让宠物主题成为本项目的公开产品身份。

## Governance And Harness

参考实现中的 bootstrap/governance guard 短期可以被开发环境绕过，用于先验证多 Agent 主链路。

但 governance 不能被永久删除。长期它应演进成本项目的 Harness/governance 层，负责：

- 开发前目标与边界确认
- 高风险操作确认
- agent 权限与远程入口安全
- invocation 可追踪
- 结果可验收
- 失败后可恢复
- 证据与上下文沉淀

短期绕过必须满足：

- 只允许在本地开发环境启用
- 通过显式配置命名，例如 `DEV_BYPASS_GOVERNANCE_BOOTSTRAP`
- 代码注释或变更说明必须写清楚恢复路径
- 不允许把绕过路径当成正式架构

## Runtime Strategy

Phase 1 首选 Codex CLI，因为用户当前已有 Codex 订阅，成本和可用性最好。

但架构不能硬编码成 Codex-only。核心模型应是：

```text
Agent Seat
  -> Runtime Binding
     -> Codex CLI
     -> Claude Code
     -> OpenCode
     -> Gemini CLI
```

第一阶段实现 Codex CLI binding。Claude Code、OpenCode、Gemini CLI 可以先保留接口、配置位和扩展点，不需要第一阶段全部落地。

避免把项目做成复杂的模型市场或 provider 平台。需要的是简单、可扩展、可替换的 CLI runtime abstraction。

## Features To Keep Available

以下能力不是第一阶段主线，但不应默认删除：

- Feishu connector: 第二阶段远程入口
- IM connector architecture: 长期保留为低信任客户端接入方式
- Claude Code / OpenCode / Gemini CLI binding: 长期 runtime 扩展目标
- Werewolf / game mode: 后续可作为多 Agent 推理、投票、协作机制实验场
- Governance / bootstrap: 长期 Harness 层

这些模块可以先隐藏、冻结、降优先级或 feature-flag，但不要因为第一阶段不用就彻底移除。

## First Executable Spine

第一条可运行主链路仍然是：

```text
Web Console
  -> Host API
  -> Room Hub
  -> Persistence
  -> Invocation
  -> Event Bus / Queue
  -> Agent Runtime
  -> Codex CLI Adapter
  -> Event Bus
  -> WebSocket
  -> Web Console
```

验收标准：

- 可以创建一个 room/thread
- 默认存在 `architect`、`reviewer`、`implementer`
- 三个成员可以绑定到 Codex CLI
- 用户消息通过 Room Hub 进入
- 点名会创建对应 invocation
- invocation 状态可见
- agent 输出流式回前端
- 消息和 invocation 持久化
- 单个 agent 失败不影响整个房间

## UI Direction

UI 第一原则是工作效率，而不是品牌展示。

推荐方向：

- 名称候选：协作舱、任务房间、智能工坊、中枢工作台
- 成员称呼：协作成员、智能成员、席位
- 用户称呼：界面直接用“你”
- 风格：科技、清晰、专业、温馨但不幼稚
- 信息密度：高于营销页，低于纯日志控制台

第一阶段 UI 不需要追求最终视觉完成度，但必须避免把旧产品设定带进本项目。

## Migration And Adoption Order

1. 验证参考实现真实多 Codex 调用链路，必要时短期绕过 bootstrap guard。
2. 梳理参考架构模块和本项目目标模块的映射。
3. 优先采用 invocation、routing、queue、streaming、runtime binding 等核心链路。
4. 保留多 CLI runtime 扩展点，但先落 Codex。
5. 重塑 UI 术语和默认成员设定。
6. 再接 Feishu。
7. 最后评估狼人杀等实验性协作模式。

## Non-Goals For The First Implementation

- 不做模型市场。
- 不做完整多 provider 商业平台。
- 不先做所有 IM connector。
- 不把游戏、语音、信号等模块放在主线之前。
- 不把 governance 永久删除。
- 不把 UI 做成冷冰冰的运维控制台。

## Verification

当前阶段的验证目标：

- 本地参考实现可启动
- Web/API health 可用
- 可以创建多个 Codex-bound agent
- 可以创建 thread 并配置多个 preferred agents
- mention routing 能创建 invocation
- 明确真实调用阻塞点，例如 `GOVERNANCE_BOOTSTRAP_REQUIRED`

进入代码改造后，需要增加：

- unit tests for runtime binding resolution
- contract tests for Codex event parsing
- integration tests for message -> invocation -> stream -> persistence
- manual local run notes for multiple Codex agents
- UI screenshot checks after visual redesign starts

## Open Decisions

- 最终产品名和空间名。
- 用户在 UI 中是否只称“你”，还是需要一个更温暖的身份名。
- 默认成员头像风格。
- governance bypass 的精确配置名。
- 参考实现中哪些模块直接迁移，哪些只保留接口。
- 第一阶段是否使用参考实现的 Web/API 结构作为底座，还是仅迁移后端 runtime 链路。
