# AGENTS.md

## 项目目标

本项目构建一个运行在用户主力电脑上的 Multi-Agent Equal-Room Host。

它不是 subagent 调度器，也不是简单打开多个 CLI 窗口的 UI。它的目标是让多个独立的 agent runtime 在同一个房间中以平等协作者身份工作，同时保留上下文隔离，并支持互相质疑、review、风险发现，以及最终由用户控制收敛。

第一阶段优先使用多个 Codex CLI 进程，因为 Codex 是用户当前已订阅且最方便使用的 runtime。后续阶段必须能够接入 Claude Code、OpenCode、Gemini CLI、飞书以及其他远程入口，但远程客户端不得拥有核心状态。

## 核心原则

### 1. 第一性原理

做设计选择时，必须回到原始问题：

- 是否提升了 agent 之间互相质疑和纠错的能力？
- 是否减少了用户手动复制粘贴信息的成本？
- 是否保留了 agent 上下文隔离？
- 是否保持用户对最终决策的控制权？
- 是否支持未来飞书/移动端入口复用同一套核心 runtime？

如果某个改动无法回答这些问题，不要推进它。

### 2. 平等协作，不是主从 Agent 层级

runtime 应把 agent 建模为平等协作者，而不是隐藏在单个 parent agent 下面的工具。

- `architect` 负责方案、边界和取舍。
- `reviewer` 负责质疑、风险发现和测试缺口。
- `implementer` 负责具体实现。
- 任意 agent 都可以挑战另一个 agent 的结论。
- 用户拥有最终决策权。

### 3. 不做绕开主架构的 MVP

可以小步交付，但不能为了快速演示绕开主架构。

所有实现都必须遵守：

- 所有用户输入都进入 Room Hub。
- 所有 agent 执行都创建 Invocation。
- 所有实时输出都进入 Event Bus。
- 所有持久事实都进入 Persistence。
- Web、飞书和未来移动端都是 client/connector，不是核心状态所有者。
- 临时实现不得创建第二套消息通道、路由系统或状态源。

### 4. Redis 与 SQLite 职责

Redis 是运行时协调层。SQLite 是持久事实源。

- Redis：event streams、pub/sub、invocation queue、agent heartbeat、round runtime state、idempotency keys。
- SQLite：rooms、threads、messages、agents、sessions、invocations、rounds、audit logs。
- 不得只把持久事实存在 Redis。
- 不得用前端状态替代 Room Hub 或 Persistence。

### 5. 先守住模块边界，再决定目录形态

逻辑边界是强约束，物理目录结构可以演进。

保持这些逻辑模块清晰：

- Web Console
- Host Runtime
- Shared Protocol
- Room Hub
- Event Bus
- Persistence
- Agent Runtime
- Codex Adapter
- Orchestration
- Connector Interface

不要因为目录结构方便，就混合不同模块职责。

### 6. Why-First

重要提案、重构和架构选择必须说明：

- 要改什么
- 为什么选择这条路线
- 放弃了哪些替代方案
- 还剩哪些风险
- 如何验证这个改动

不要用“业界通常如此”或“看起来更简单”作为理由。

### 7. 关键上下文缺失时必须提问

如果目标、权限、安全、数据流或模块边界不清楚，暂停并提出具体问题。

不要靠猜测补全关键上下文。

### 8. Review 必须找问题

Review 不是配合式同意。

reviewer 必须优先关注：

- 行为缺陷
- 架构边界破坏
- 状态一致性问题
- 并发、取消和超时问题
- 安全与权限问题
- 测试缺口
- 偏离项目目标的风险

### 9. 开发时有意识地使用 Subagents

开发 agent 可以在确实提升质量时使用 subagent 或并行 agent 工作。

- 将 subagent 用于独立、有边界、可并行的工作，例如代码 review、反向分析、测试扩展或模块级实现。
- 不要把最关键的阻塞性架构决策外包给 subagent；主 agent 负责集成和最终判断。
- 多个 worker 编辑代码时，保持写入范围隔离。
- 在把 subagent 输出视为事实之前，必须先 review。
- 使用 subagent 是为了发现盲点或并行推进真实工作，不是为了制造表演式多 agent 活动。

### 10. 为可追溯性提交

使用适度小的 commit，让回归和架构转向可以被定位。

- 在完成一个连贯、可验证的工作单元后提交。
- 避免把架构、实现和无关清理混在一个巨大 commit 中。
- 提交实质性工作前，使用 development-continuity skill 保留为什么这么改、放弃了什么、验证了什么，以及下一个 agent 需要知道什么。
- 当 diff 本身不足以表达背景时，commit message 或 commit body 应记录必要上下文。

### 11. 功能开发必须经过 Harness

开发工作必须遵从本项目的 Harness 流程。

- 在非平凡功能、行为变更、重构、架构变更或多文件编辑前，运行相关 Harness entry/start gate。
- 当历史 spec、plan、decision 或 evidence 可能影响当前工作时，使用 Harness retrieval。
- 在向本文件新增规则前，必须使用 Harness project-rules promotion gate。
- 在声称工作完成、准备 review、准备 commit 或可安全交接前，必须使用 Harness knowledge capture。
- 不要把 Harness 当作文档形式主义；它用于保持目标、边界、证据、回滚和恢复上下文清晰。

### 12. 有证据才算完成

没有证据，不要声称完成。

完成声明必须至少由以下一种证据支撑：

- 自动化测试
- 手动验证记录
- 运行日志
- 截图或可复现步骤
- 明确记录的未验证项

### 13. 远程入口是低信任入口

飞书、移动端和其他 IM 入口的信任级别低于明确的本地操作。

高风险动作必须确认，包括：

- 写文件
- 运行 shell 命令
- Git commit 或 push
- 删除数据
- 修改配置
- 暴露本地文件内容

远程入口不得变成无限制远程 shell。

### 14. 优先采用参考架构，同时保持独立产品身份

本项目必须保持自己的公开身份、历史、术语和用户体验。

当本地参考实现已经解决了相关架构问题时，优先采用或迁移其已验证结构，而不是为了重新发明而重写。不要仅仅因为某些模块第一条可运行链路暂时用不上，就过度裁剪长期方向中可能需要的模块。

优先采用或重新实现这些架构能力：

- CLI subprocess invocation
- Agent service streaming abstraction
- Codex、Claude Code、OpenCode、Gemini CLI runtime bindings
- CLI event parsing
- Mention routing
- Invocation lifecycle
- Session continuity
- Invocation queue and per-agent slot control
- Connectors that do not own core state
- Room-oriented UI information architecture

公开项目文档必须使用本项目自己的表达。不要复制其他产品的品牌、宠物主人隐喻、persona system 或视觉身份。

### 15. Runtime 可扩展，但不做平台膨胀

Codex CLI 是第一个 runtime，不是唯一 runtime。

- Agent seat 必须通过清晰的 runtime binding abstraction 绑定到具体 runtime。
- 不要把 core room、invocation、persistence 或 UI model 硬编码成 Codex-only 假设。
- 保留接入 Claude Code、OpenCode 和 Gemini CLI 的扩展路径。
- 在协作主链路真正需要之前，避免建设模型市场、宽泛 provider 平台或复杂账号生态。

### 16. Governance 只能临时绕过，不能永久删除

governance、bootstrap 和 Harness-like checks 是长期架构，不是一次性摩擦。

- 开发阶段可以引入显式的 local-only bypass，用于验证多 agent 主执行链路。
- 任何 bypass 都必须标记为临时、受配置保护，并记录恢复路径。
- 不要因为 governance/bootstrap 流程拖慢早期验证，就永久删除它们。
- 不要让 governance 无限期阻塞第一条可运行主链路；只允许绕过到足以证明主链路，然后恢复。

### 17. 产品语言：温暖的技术协作工作台

UI 应该像一个温暖的技术协作工作台，而不是宠物主题角色扮演产品，也不是冰冷的运维控制台。

- 默认角色可以保留 `architect`、`reviewer` 和 `implementer`。
- UI 文案优先使用“你”“房间”“线程”“成员”“席位”“任务”“review”等概念。
- 避免把“宠物主人”之类隐喻作为项目身份。
- 头像和命名系统应支持专业、技术、温暖的身份表达。

每个被采用或重新实现的模式，都必须重新对照本项目目标验证，并匹配本项目模块边界。
