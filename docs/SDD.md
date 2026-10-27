# 软件设计开发文档(Software Design & Development Document)

| 项 | 值 |
|---|---|
| 项目 | `hackathon-agent` —— 科研领域 Agent |
| 文档版本 | v1.0 |
| 编写日期 | 2026-10-28 |
| 设计依据 | **Claude Code 公开源码快照**(1884 文件 / 29MB,逐模块实读,引用处标注 `文件:行号`) |
| 配套文档 | [`docs/SRS.md`](./SRS.md) = 需求基线(本文引用其 `FR-x` 编号);[`docs/wyh/代码开发规范.md`](./wyh/代码开发规范.md) = 编码细节 |
| 本文定位 | **回答「怎么设计、怎么实现」**;「做什么、验收标准」见 SRS |

---

## 0. 文档定位与三条纪律

### 0.1 本文与 SRS 的分工

```
SRS.md   ──▶  做什么(FR-A/B/C/D/E + 验收标准 + 里程碑)
   │
SDD.md   ──▶  怎么做(架构 / 契约 / 数据模型 / 流程 / 目录 / 开发顺序)   ← 本文
```

本文不重复 SRS 的验收标准,只在每个设计章节标注**对应的需求编号**,便于交叉核对。

### 0.2 三条纪律(必须遵守)

| # | 纪律 | 原因 |
|---|---|---|
| **1** | `claude-code-main/` **绝不入库** | 该目录是 Claude Code 经 npm source map 暴露的源码镜像(1903 文件 / 29MB)。已在 `.gitignore:50` 排除。仓库若转公开,必须确认其不在其中 |
| **2** | **不复制对方实现代码** | 学**架构模式与接口思想**,代码自己写。答辩时讲"参考了其分层设计",不讲"用了它的代码" |
| **3** | 引用其设计时标注 `文件:行号` | 便于复核,也证明团队真的读懂了源码而非道听途说 |

> 本文出现的所有 `src/xxx.ts:行号` 均指 `claude-code-main/claude-code-main/src/` 下的真实源码。所有 `我们` 指本项目须自行实现的部分。

---

## 1. 设计依据:Claude Code 源码解剖

以下是四个模块的实读结论,构成后续所有设计的输入。

### 1.1 Tool 系统(`src/Tool.ts`, 792 行)

**核心类型**(`Tool.ts:362-393`,摘签名):

```ts
export type Tool<Input extends AnyObject, Output, P extends ToolProgressData> = {
  aliases?: string[]
  searchHint?: string
  call(args, context, canUseTool, parentMessage, onProgress?): Promise<ToolResult<Output>>
  description(input, options): Promise<string>          // ★ 是函数,不是静态字符串
  readonly inputSchema: Input                            // zod schema
  readonly inputJSONSchema?: ToolInputJSONSchema
  prompt(options): Promise<string>                       // 给模型的详细说明
}
```

**能力位与校验**(`Tool.ts:402-516`):

```ts
isConcurrencySafe(input)      // 能否与他人并发
isEnabled()                   // 运行期开关
isReadOnly(input)             // 只读?
isDestructive?()              // 破坏性?
interruptBehavior?(): 'cancel' | 'block'
validateInput?(input, ctx): Promise<ValidationResult>   // ★ 零 I/O 语义校验
checkPermissions(input, ctx): Promise<PermissionResult>
maxResultSizeChars: number
readonly shouldDefer?: boolean
readonly alwaysLoad?: boolean
```

**关键事实**:

| 事实 | 出处 | 我们的取舍 |
|---|---|---|
| 所有能力位由 `buildTool` 给 **fail-closed 默认值**(`isEnabled:true`, `isConcurrencySafe:false`, `isReadOnly:false`, `isDestructive:false`) | `Tool.ts:757-769` | ✅ **全盘采纳** |
| `inputSchema` 用 **zod v4 + `lazySchema`**,`z.strictObject` 拒绝多余字段 | `FileReadTool.ts:227-240` | ✅ 采纳 |
| 一份 schema 三处复用:运行时校验 / 模型 JSON Schema / prompt cache 字节稳定 | `utils/zodToJsonSchema.ts:12-22` | ✅ 采纳 |
| 调用是固定四段管线 `safeParse → validateInput → checkPermissions → call` | `toolExecution.ts:615, 683, 1207` | ✅ 采纳(去掉权限段,见下) |
| **没有"可恢复错误"概念**。失败 = 回填 `is_error: true`,模型自行决定重试 | `toolExecution.ts:469-489` | ✅ **采纳(修正我方早期设计)** |
| 工具注册表是 ~40 个静态 import 的扁平数组,用 `feature()` 做死代码消除 | `tools.ts:193-251` | ⚠️ 我们用简单 map,不需要 feature flag |
| 按需发现:`shouldDefer` + `ToolSearchTool` 打分 + `tool_reference` 回填,替代全量 schema 注入 | `ToolSearchTool/prompt.ts:62-108`, `:266-291` | ❌ 我们工具数 <10,不需要 |
| 结果有三套投影:模型序列化 / 人读渲染 / 安全分类器输入 | `Tool.ts` + `UI.tsx` | ❌ 只做前两者,且人读用 log 不做组件 |

### 1.2 Agent 主循环(`src/query.ts` 1725 行 + `QueryEngine.ts` 1292 行)

**结构**:`query()`(`query.ts:219`)→ `queryLoop`(`:241`)→ `while(true)`(`:307`)。

**每轮 11 步**(简化):

```
1  解构 state, yield stream_request_start
2  messagesForQuery = getMessagesAfterCompactBoundary(messages)
3  压缩前置链: snip → microcompact → contextCollapse → autocompact
4  硬阻塞上限检查
5  for await msg of callModel({...signal})        ← 流式;tool_use 块立即入执行器
6  post-sampling hooks + abort 检查
7  若无 tool_use → 停止条件/预算/hooks → return
8  否则执行工具(或取流式执行器剩余结果)
9  abort 检查 + 注入 attachments/队列/memory/skill + refreshTools
10 maxTurns 检查
11 state.messages = [...messagesForQuery, ...assistantMessages, ...toolResults]
```

**关键事实**:

| 事实 | 出处 | 我们的取舍 |
|---|---|---|
| **不依赖 `stop_reason`**,遍历 content 找 `type==='tool_use'` | `query.ts:553-556, 829` | ✅ **必须采纳**,否则跨 provider 会漏调工具 |
| `tool_result` 必须包在 **user 消息**内,且不与普通 user 文本交错 | `query.ts:1535-1536` | ✅ **必须采纳**,违反 API 直接报错 |
| 消息**只追加不重写** | `query.ts:1716` | ✅ 采纳 |
| 并发靠 `partitionToolCalls`:把**连续** `isConcurrencySafe` 的调用合批,默认上限 10 | `toolOrchestration.ts:91, 158-176` | ✅ 采纳(上限调为 3) |
| 模型还在流式输出时,已完成工具的结果就已可 yield(**执行与生成重叠**) | `query.ts:851-862` | ❌ v1.0 不做,复杂度收益比不划算 |
| 定义了 **10 种终止 reason** | `query.ts` 各处 | ⚠️ 我们收为 **5 种**(够调试用) |
| 压缩在**每轮 LLM 调用之前**,阈值 = 有效窗口 − 13000 | `autoCompact.ts:72,160,225` | ⚠️ 我们只做一级「分段摘要」,但位置必须对 |
| abort 父子**单向传播**,子控制器用 WeakRef | `abortController.ts:68` | ✅ 采纳观念,实现简化 |

**10 种终止 reason**(供我们裁剪参考):
`blocking_limit / model_error / image_error / aborted_streaming / aborted_tools / hook_stopped / max_turns / stop_hook_prevented / prompt_too_long / completed`

### 1.3 记忆系统(`src/memdir/`,8 文件 80.8KB)

| 事实 | 出处 | 我们的取舍 |
|---|---|---|
| 记忆按 **git root** 隔离,不是按 user/project | `paths.ts:203` | ⚠️ 我们按「知识库根目录」隔离 |
| `MEMORY.md` 是**索引**(每行 `- [Title](file.md) — hook`),**总是**注入 system prompt | `memdir.ts:306` | ✅ **核心采纳** |
| 索引截断:200 行 / 25000 字节 | `memdir.ts:35-38, 57-103` | ✅ 采纳(调小) |
| 条目 frontmatter **只有 3 个字段**:`name / description / type` | `memoryTypes.ts:261-271` | ✅ 采纳 |
| `type` 四值:`user / feedback / project / reference` | `memoryTypes.ts:14` | ⚠️ 我们改为知识页类型 |
| **相关性检索用 LLM 选,不用关键词、不用向量**:清单交给 Sonnet `sideQuery`,json_schema 强制返回 `{selected_memories: string[]}`,限 ≤5 条 | `findRelevantMemories.ts:39-45, 97-130` | ✅ **核心采纳** —— 这条直接让我们省掉向量库 |
| 扫描上限 200 个文件,按 mtime 倒序,只读前 30 行解析 frontmatter | `memoryScan.ts:21-22, 35-77` | ✅ 采纳 |
| 后台有 `extractMemories` agent 兜底 + `/dream` 夜间蒸馏 | `paths.ts:57-77`, `memdir.ts:319-326` | ❌ 不做 |

### 1.4 技能系统(`src/skills/`,20 文件 146.7KB)

| 事实 | 出处 | 我们的取舍 |
|---|---|---|
| 磁盘格式**只支持目录**:`<skills>/<name>/SKILL.md` | `loadSkillsDir.ts:407-431` | ✅ 采纳 |
| frontmatter 真实字段(部分):`name / description / when_to_use / allowed-tools / argument-hint / arguments / model / disable-model-invocation / user-invocable / context: fork\|inline / agent / effort / shell / paths / hooks / version` | `loadSkillsDir.ts:185-265` | ⚠️ 我们取 6 个 |
| **启动只扫元数据,正文懒加载**;`estimateSkillFrontmatterTokens` 只统计 `name+description+whenToUse` | `loadSkillsDir.ts:100-105` | ✅ **核心采纳(渐进式披露)** |
| 技能清单以 system-reminder 注入,格式 `- name: description - whenToUse`,单项截断 250 字符,总预算 = **上下文窗口的 1%**(约 8000 字符),超预算时次要技能压缩为纯名字 | `SkillTool/prompt.ts:21-40, 70-171` | ✅ **核心采纳** |
| 条件技能:声明 `paths` 后,只有触碰匹配文件才激活 | `loadSkillsDir.ts:997-1058` | ❌ 不做 |
| 调用入参 `{skill: string, args?: string}`,支持 `ns:name` 全限定 | `SkillTool.ts:293-296` | ✅ 采纳 |
| 参数替换:`$ARGUMENTS` / `$0` / 命名 `$name` | `utils/argumentSubstitution.ts:5-7, 117-141` | ⚠️ 简化:只做 `$ARGUMENTS` |
| 正文推荐结构:`# 标题` → `## Inputs` → `## Goal` → `## Steps`(**每步必须 `**Success criteria**`**) | `skillify.ts:96-146` | ⚠️ 我们改用科研领域七节结构 |
| 已有「会话 → 技能」沉淀机制 `skillify`:读会话记忆 + 4 轮访谈 + 强制 `when_to_use` 带触发短语 + `allowed-tools` 最小权限 + 必须用户显式调用 | `bundled/skillify.ts:22-156, 177` | ✅ **思路采纳**,这是我们 C 模块的路径依据 |
| `remember` 只**提案不落盘**,检测重复/过期/冲突 | `bundled/remember.ts:9-62` | ✅ 观念采纳 |

**设计哲学原话**:记忆存「不可从代码推导的上下文」,技能存「可重复的流程」。

### 1.5 子 Agent(`src/tools/AgentTool/`)

`BaseAgentDefinition`(`loadAgentsDir.ts:106`,摘):

```ts
export type BaseAgentDefinition = {
  agentType: string; whenToUse: string
  tools?: string[]; disallowedTools?: string[]; skills?: string[]
  mcpServers?: AgentMcpServerSpec[]; hooks?: HooksSettings
  model?: string; effort?: EffortValue; permissionMode?: PermissionMode
  maxTurns?: number; background?: boolean; memory?: AgentMemoryScope
  isolation?: 'worktree' | 'remote'
}
```

| 事实 | 出处 | 我们的取舍 |
|---|---|---|
| 每个 agent 独立 `agentId` / `agentSystemPrompt` / `agentOptions.tools`,再 `createSubagentContext()` | `runAgent.ts:248, 347, 508, 700` | ✅ 采纳 |
| 工具白名单:`resolveAgentTools` → `filterToolsForAgent`,`tools:['*']` 表示全量 | `agentToolUtils.ts:122, 70, 163` | ✅ 采纳 |
| **结果只回传最后一条 assistant 的 text 块**(纯 tool_use 时回溯上一条),**不回传全文** | `agentToolUtils.ts:276` | ✅ **关键采纳** —— 这是省 token 的核心 |
| fork 与 spawn 的实质差异:fork 继承父完整历史与已渲染 systemPrompt(为 prompt cache 字节一致),spawn 从零开始 | `forkSubagent.ts:60, 107` | ⚠️ **只做 spawn**,fork 复杂度不值 |
| `isInForkChild()` 扫 `<FORK>` 标签防递归 | `forkSubagent.ts:78` | ✅ 采纳观念:防子 agent 再生子 agent |

### 1.6 任务与服务层

| 事实 | 出处 | 我们的取舍 |
|---|---|---|
| `TaskType` 7 种:`local_bash / local_agent / remote_agent / in_process_teammate / local_workflow / monitor_mcp / dream` | `Task.ts:6` | ⚠️ 只做 `local_agent`(子 agent 本身) |
| `TaskStatus` 5 态:`pending / running / completed / failed / killed` | `Task.ts:6` | ✅ 采纳 |
| MCP:`tools/list` 动态发现 → 映射为内部 Tool → `assembleToolPool` 去重合并 | `client.ts:1743, 1773`, `tools.ts:345` | ⚠️ 我们只做 **MCP server 暴露**(把工具给外部),不做 client 接入 |
| compact 是**摘要式**非滑窗,固定顺序重建消息,回补最近 5 个文件 | `compact.ts:330, 387` | ⚠️ 只做「单篇论文分段摘要」一级 |
| microcompact 只清空旧 tool_result 正文(`'[Old tool result content cleared]'`),不改历史 | `microCompact.ts:253` | ❌ 不做 |
| API 手写 SSE 状态机;重试 `DEFAULT_MAX_RETRIES=10`、指数退避 + 25% 抖动、`retry-after` 头优先 | `claude.ts:752`, `withRetry.ts:170, 530` | ✅ 采纳(重试次数降为 2–3) |
| 错误分类:429/529 只在前台重试,后台摘要类直接放弃 | `withRetry.ts:62, 610` | ✅ 采纳观念 |
| `max_tokens` 溢出 → 下调输出上限重试 | `withRetry.ts:400-425` | ✅ 采纳 |

---

## 2. 架构映射:借鉴 / 裁剪 / 我们的增量

### 2.1 三栏对照表(本文最重要的一张表)

| 维度 | Claude Code 做法 | 我们的做法 | 类别 |
|---|---|---|---|
| 工具契约 | 丰富能力位 + 四段管线 + fail-closed | **保留**:能力位(fail-closed)+ 三段管线(去权限段) | 借鉴 |
| 工具来源 | **全部人手编写** | **从论文自动生成**(B 模块) | ★**增量** |
| 主循环 | 11 步 / 10 终止 / 流式重叠执行 | 7 步 / 5 终止 / 不做重叠执行 | 裁剪 |
| 记忆 | 按 git root / 索引 + LLM 检索 / 4 类 | 按知识库根 / 索引 + LLM 检索 / 5 类 | 借鉴 |
| 记忆单位 | 一段上下文 | **原子知识页(带页码锚点)** | ★**增量** |
| 技能 | 目录 + frontmatter + 懒加载 + 1% 预算 | **全盘采纳机制** | 借鉴 |
| 技能内容 | 通用开发流程 | **科研领域七节结构(含失败模式)** | ★**增量** |
| 技能来源 | 手写 + skillify 固化 | **从知识库聚合生成 + 人工审核** | ★**增量** |
| 子 Agent | 5 种内置 + fork/spawn | **只做 spawn,做精读并行** | 裁剪 |
| 子 Agent 结果 | 只回传最后一条 assistant 文本 | 采纳 | 借鉴 |
| 任务系统 | 7 类 | 只做 `local_agent` | 裁剪 |
| MCP | client + server 双向 | **只做 server 暴露** | 裁剪 |
| 上下文压缩 | 四级瀑布 | 只做「单篇分段摘要」 | 裁剪 |
| 权限 | allow/ask/deny + 自动分类器 | 只做**工具白名单** | 裁剪 |
| UI | Ink/React(REPL.tsx 875KB) | `chalk` + stdout | 裁剪 |
| 工具发现 | `ToolSearch` 按需发现 | 不做(工具 <10) | 裁剪 |

### 2.2 我们的真实差异点(答辩主打)

```
Claude Code:  工具是人写的  →  Agent 用工具
我们:         工具从论文长出来  →  Agent 用自己长出来的工具
```

配合 A(知识)和 C(技能),形成完整叙事:

> **普通 Agent 的工具和知识是人预先给的;我们的 Agent 让论文自己长出「知识与工具」,再把跨论文的共识固化成「技能」,最终用这些自产资产完成新的科研任务。**

---

## 3. 总体架构

### 3.1 六层 + 三模块插入位置

```
┌──────────────────────────────────────────────────────────────────┐
│ ① 入口层  src/main.ts                                            │
│    ingest(沉淀) / ask(消费) / tools doctor(体检)                  │
├──────────────────────────────────────────────────────────────────┤
│ ② 交互层  src/ui/                                                │
│    流式输出 · 工具调用可视化 · 进度(chalk + stdout,无框架)        │
├──────────────────────────────────────────────────────────────────┤
│ ③ 编排层 ★ src/agent/                                            │
│    types.ts(冻结契约)  loop.ts(主循环)  subagent.ts(派生)        │
├──────────────────────────────────────────────────────────────────┤
│ ④ 工具层 ★ src/tools/                                            │
│    types.ts(冻结契约)  registry.ts                               │
│    ├─ knowledge/    → A 模块的检索工具                            │
│    └─ generated/    → B 模块生成与体检                            │
├──────────────────────────────────────────────────────────────────┤
│ ⑤ 服务层  src/services/                                          │
│    llm/        provider 抽象 · 流式解析 · 退避重试                │
│    paper/      共享底座:文献 → PaperDoc(页码锚点)              │
│    knowledge/  ★A  KnowledgeStore 接口 + 索引 + LLM 相关性筛选    │
│    toolsynth/  ★B  方法抽取 → 工具生成 → smoke test              │
│    skills/     ★C  SkillStore 接口 + 生成 + when_to_use 匹配      │
│    trace/      JSONL 记录 + replay                               │
│    cache/      fixtures 读写                                     │
├──────────────────────────────────────────────────────────────────┤
│ ⑥ 状态与存储层  src/state/                                       │
│    memory/(论文处理记录)  store/(知识页/工具/技能落盘)            │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 模块边界(硬规则,违反即返工)

| 规则 | 说明 |
|---|---|
| R1 | `agent/` **不 import** 任何具体工具实现,只认 `tools/types.ts` |
| R2 | `tools/` **不 import** LLM,只认 `ToolContext` |
| R3 | **三个模块之间只能通过冻结契约交互**,不得互相 import 实现 |
| R4 | 冻结契约三个文件改动需 PR + 1 人 approve |
| R5 | `services/` **不 import** `agent/`,保持底层可单测 |

### 3.3 数据流总图

```
【沉淀 ingest】
论文 ──▶ ⑤paper(解析,页码锚点,质量门控)
          │
          ├──▶ ★A knowledge: 原子知识页 → 索引 → KnowledgeStore
          │                                └──▶ ★C skills: 聚合 → 技能草案 → 人工审核
          └──▶ ★B toolsynth: MethodSpec → 工具 → smoke test ──▶ registry

【消费 ask】
任务 ──▶ ★C skills: when_to_use 匹配 → 加载技能(流程/判据/失败模式)
          │
          ▼
     ③loop.ts ── 依技能流程决策
          ├──▶ ★A knowledge.search   取得依据(paperId + page)
          ├──▶ ★B registry.get(call)  执行工具
          └──▶ ★子 Agent              并行精读
          ▼
     交付物 + 反哺新知识页
```

### 3.4 Web 交互层(薄壳设计)

对应需求:`FR-F1 ~ FR-F4`;决策:`D-11 ~ D-14`

#### 3.4.1 为什么是"薄壳"

科研 Agent 的目标用户是**研究者**,不是工程师 —— 纯 CLI 等于把用户群砍掉一半。但 Web 不该重写核心,否则 4 天内必然分裂出两套逻辑,且 Web 一崩就全崩。

**薄壳的定义(可静态检查)**:

```
web/ 目录的 import 白名单 = { node 内置模块, ../../agent/events.js }
web/ 不得 import 任何 services/ · tools/ 实现
```

`NFR-12` 就是用来卡这条的。

#### 3.4.2 核心思路:一条事件流,两个渲染器

```
                    ┌──────────────────────────┐
   核心层(loop.ts) │  emit(event)             │
   ★不知道谁在消费  │  EventBus                │
                    └───────────┬──────────────┘
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
      ┌──────────────────┐          ┌────────────────────┐
      │ 渲染器 A:stdout  │          │ 渲染器 B:SSE → 浏览器│
      │ chalk 上色       │          │ EventSource        │
      └──────────────────┘          └────────────────────┘
              ↑ 兜底                         ↑ 主交付
```

**关键收益**:Web 层的全部工作只是"把事件翻译成 DOM 操作"。核心一旦跑通,Web 就是纯增量,而且永远不会拖累核心。

#### 3.4.3 事件协议(唯一需要冻结的 Web 契约)

```ts
// src/agent/events.ts —— CLI 与 Web 共用
export type AgentEvent =
  | { type: 'text_delta';      text: string }
  | { type: 'tool_start';      id: string; name: string; input: unknown }
  | { type: 'tool_end';        id: string; ok: boolean; ms: number; summary: string }
  | { type: 'skill_load';      skillId: string; name: string; reason: string }
  | { type: 'knowledge_hit';   noteId: string; paperId: string; page: number; description: string }
  | { type: 'tool_generated';  toolName: string; sourcePaper: string; status: 'active' | 'draft' }
  | { type: 'progress';        step: string; done: number; total: number }
  | { type: 'error';           stage: string; message: string }
  | { type: 'run_end';         reason: string; ms: number; tokens: { input: number; output: number }; toolCalls: number }
```

**9 种事件覆盖全部需要展示的语义。** 新增一种展示需求 = 加一种事件,而不是改核心。

#### 3.4.4 后端(零依赖,约 120 行)

```ts
// web/server.ts
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { bus } from '../agent/events.js'

export async function startWebServer(port = 7777) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`)

    // ① SSE 事件流
    if (url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      })
      const send = (e: AgentEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`)
      bus.on('event', send)
      req.on('close', () => bus.off('event', send))
      return
    }

    // ② 任务提交(触发一次 ask,事件仍走 SSE)
    if (url.pathname === '/api/ask' && req.method === 'POST') {
      const { question } = JSON.parse(await readBody(req))
      res.writeHead(202).end('accepted')
      void runAsk(question)          // 异步执行,事件推进 SSE
      return
    }

    // ③ 三个模块面板的数据(直接读文件系统)
    if (url.pathname === '/api/knowledge') return json(res, await loadNotes())
    if (url.pathname === '/api/tools')     return json(res, await loadTools())
    if (url.pathname === '/api/skills')    return json(res, await loadSkills())

    // ④ 静态文件(单页 HTML,无构建)
    return serveStatic(res, url.pathname)
  })

  // 端口占用自动顺延(AC-F4.3)
  for (let p = port; p < port + 20; p++) {
    try { await listen(server, p); return p }
    catch (e: any) { if (e.code !== 'EADDRINUSE') throw e }
  }
  throw new Error('no free port')
}
```

> **注意 `/api/ask` 立刻返回 202,不阻塞** —— 事件继续走 SSE 通道。这样即使一次运行要 3 分钟,浏览器也不会卡在 loading。

#### 3.4.5 前端(单页 HTML,约 500 行)

**布局设计** —— 重点是把"三模块资产"放在显眼位置,而不是做成一个聊天框:

```
┌──────────────────────────────────────────────────────────────────────┐
│  hackathon-agent · 科研 Agent        [ 沉淀 ingest ]  [ 提问 ask ]     │
├────────────────────┬─────────────────────────────────────────────────┤
│  📚 知识库  12 条   │  ◀ 过程流(SSE 实时)                            │
│  🔧 工具库   5 个   │  ┌─────────────────────────────────────────────┐│
│  📋 技能库   1 个   │  │ > 低资源 RAG 有哪些方法?                    ││
│                    │  │ ⚙ knowledge.search  "低资源 RAG"  120ms  ✓  ││
│  ── 点击展开 ──     │  │ ⚙ compute_f1        {p:0.82,r:0.77} 8ms ✓  ││
│                    │  │ 📋 加载技能 低资源语言RAG研究(匹配关键词)  ││
│  ┌──────────────┐  │  │ 📚 引用 p3f8a2c1#p7#a91f3e (p.7)            ││
│  │ 跨语言对齐    │  │  │                                             ││
│  │ 提升 4.2 点   │  │  │ 答:主要方法有三类……(流式)                  ││
│  │ p3f8a2c1 p.7 │  │  └─────────────────────────────────────────────┘│
│  └──────────────┘  │  ┌── 产物 ──────────────────────────────────────┐│
│                    │  │ out/report.md   out/run-xxx.json            ││
└────────────────────┴──┴─────────────────────────────────────────────┘
```

**三个面板的实现要点**:

| 面板 | 渲染什么 | 数据来源 |
|---|---|---|
| A 知识库 | 知识页卡片(描述 + 锚点),点开看全文与证据摘句 | `GET /api/knowledge` → 读 `knowledge/` |
| B 工具库 | 工具卡片(名称 + active/draft 徽章 + 来源论文 + smoke 状态) | `GET /api/tools` → 读 `src/tools/generated/` |
| C 技能库 | 技能卡片,七节折叠,失败模式一节默认展开且高亮 | `GET /api/skills` → 读 `skills/` |

**实时更新**:`run_end` 事件到达时,三个面板各自重新 `fetch` 一次 —— 于是用户能**眼看着**知识页从 0 变成 12、工具从 0 变成 5。这就是"资产在增长"的可视化。

#### 3.4.6 降级策略(必须实现)

| 情况 | 行为 |
|---|---|
| 端口全被占 | 打印「Web 启动失败,请用 CLI」,**进程不退出** |
| 前端 JS 报错 | 页面仍可显示静态内容;CLI 不受影响 |
| 无 CDN / 断网 | 所有资源本地内联,页面正常打开(AC-F4.5) |
| 演示现场 Web 崩了 | 立刻切 CLI,同一套逻辑(AC-F4.4) |

**核心原则**:Web 是增强,不是依赖。`D-12` 的薄壳约束就是为了保证这一点。

---

## 4. 核心契约设计

三个冻结契约文件。签名**基于真实源码简化而来**,已标注取舍。

### 4.1 `src/tools/types.ts`

```ts
import type { z } from 'zod'

/** 工具执行结果 —— 采纳 Claude Code 的简化模型(toolExecution.ts:469):
 *  没有 recoverable/fatal 之分,失败一律 is_error,由模型自行决定重试 */
export type ToolResult<T = unknown> =
  | { ok: true;  data: T; summary: string }
  | { ok: false; error: string; hint?: string }

export interface ToolContext {
  signal: AbortSignal                       // 贯穿全链路中断
  onProgress?: (e: { step: string; done: number; total: number }) => void
  trace: TraceWriter
  cache: Cache                              // fixtures 读写
  mode: 'live' | 'replay'
}

export interface Tool<In = unknown> {
  /** 唯一名,snake_case */
  name: string

  /** 给模型看的动态描述 —— 采纳 Tool.ts:362 的 description(input) 设计:
   *  描述可根据入参变化,提升模型调用准确率 */
  description(input: In): Promise<string> | string

  /** 单源 schema:zod v4.z.strictObject(拒绝多余字段)
   *  自动派生出 (a) JSON Schema  (b) 运行时校验 */
  inputSchema: z.ZodType<In>

  /** 真正执行 */
  call(input: In, ctx: ToolContext): Promise<ToolResult>

  // ===== 能力位:默认值 fail-closed,见下方 DEFAULTS =====
  isReadOnly?(input: In): boolean           // 默认 false
  isConcurrencySafe?(input: In): boolean    // 默认 false
  isDestructive?(input: In): boolean        // 默认 false
  maxResultSizeChars?: number               // 默认 20000

  /** 零 I/O 语义校验(采纳 Tool.ts:validateInput,必须在 call 之前) */
  validateInput?(input: In): { ok: true } | { ok: false; message: string }
}

/** 采纳 Tool.ts:757-769 的 fail-closed 策略:
 *  漏写能力位 = 按"不可写、不可并发、非只读"处理 */
export const TOOL_DEFAULTS = {
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  isDestructive: () => false,
  maxResultSizeChars: 20000,
} as const
```

**三段式调用管线**(采纳 `toolExecution.ts:615, 683, 1207`,去掉权限段):

```
1. inputSchema.safeParse(input)   → 失败:InputValidationError,is_error 回填
2. tool.validateInput(input)      → 失败:语义错误,is_error 回填
3. tool.call(input, ctx)          → 异常:catch → <tool_error>{msg}</tool_error>,is_error 回填
```

### 4.2 `src/agent/types.ts`

```ts
export type Role = 'user' | 'assistant'

export interface Message {
  role: Role
  content: ContentBlock[]
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

/** 终止 reason —— 从 Claude Code 的 10 种裁剪为 5 种,够调试用 */
export type LoopEndReason =
  | 'completed'        // 模型不再请求工具,正常结束
  | 'max_turns'        // 触顶安全退出(保留已有产出)
  | 'aborted'          // 用户 Ctrl+C
  | 'budget_exceeded'  // token 预算耗尽
  | 'model_error'      // API 不可恢复错误

export interface LoopResult {
  messages: Message[]
  reason: LoopEndReason
  turns: number
  usage: { input: number; output: number }
}

export interface RunTrace {
  runId: string
  mode: 'ingest' | 'ask'
  startedAt: string
  turns: number
  tokens: { input: number; output: number }
  toolCalls: Array<{ name: string; ms: number; status: 'ok' | 'error' }>
  failures: Array<{ stage: string; ref?: string; message: string }>
}
```

### 4.3 `src/services/knowledge/types.ts`(A 模块)

```ts
export interface KnowledgeStore {
  put(note: AtomicNote): Promise<void>
  get(noteId: string): Promise<AtomicNote | null>
  /** 关键词粗筛 —— 采纳 memoryScan 的思路,本地 Markdown 不需要索引服务 */
  scan(query: string, limit?: number): Promise<AtomicNote[]>
  /** LLM 精筛 —— 采纳 findRelevantMemories.ts 的做法:把清单交给 LLM 选 */
  select(query: string, candidates: AtomicNote[]): Promise<AtomicNote[]>
  link(from: string, to: string, rel: 'supports' | 'contradicts' | 'extends'): Promise<void>
  /** 索引(MEMORY.md 等价物),总是注入 system prompt */
  index(): Promise<string>
}
```

### 4.4 `src/services/skills/types.ts`(C 模块)

```ts
export interface SkillStore {
  list(): Promise<Array<Pick<Skill, 'skillId' | 'name' | 'whenToUse' | 'status'>>>
  load(skillId: string): Promise<Skill | null>
  /** 按 when_to_use 匹配 —— 采纳 SkillTool 的清单注入 + 模型选择思路 */
  match(task: string): Promise<Skill | null>
  save(skill: Skill): Promise<void>
  /** 生成技能清单的上下文注入文本,预算 = 窗口 1%,见 §9.3 */
  manifest(): Promise<string>
}
```

---

## 5. 数据模型

```ts
// ══════════ 共享底座 ══════════
export interface PaperDoc {
  paperId: string          // DOI / arXiv ID 优先,否则 sha256(file)[:16] —— 必须稳定可推导
  title: string
  authors: string[]
  year: number
  venue?: string
  abstract: string
  sections: Array<{
    heading: string
    level: number
    paragraphs: Array<{ text: string; page: number }>   // ★ page 必填,全系统最重要
    tables: Array<{ caption: string; markdown: string; page: number }>
  }>
  references: Array<{ raw: string; doi?: string; arxivId?: string }>
  parseQuality: { pagesParsed: number; pagesTotal: number; hasOcr: boolean }
}

// ══════════ ★A 知识库 ══════════
export type NoteKind = 'claim' | 'method' | 'result' | 'limitation' | 'definition'

export interface AtomicNote {
  noteId: string           // `${paperId}#p${page}#${hash(text).slice(0,6)}`
  paperId: string
  page: number             // ★ 锚点,不可为空
  kind: NoteKind
  /** 一句话论断 —— 对齐 Claude Code 记忆的 description 字段:
   *  这条描述本身就是召回用的,必须写得具体(memoryTypes.ts:261) */
  description: string
  text: string             // 完整论述
  evidence: { quote: string; page: number }
  confidence: 'high' | 'medium' | 'low'
  links?: Array<{ to: string; rel: 'supports' | 'contradicts' | 'extends' }>
  createdAt: string
}

// ══════════ ★B 工具库 ══════════
export interface MethodSpec {
  methodId: string
  paperId: string
  name: string
  params: Array<{
    name: string; type: 'string' | 'number' | 'boolean' | 'enum' | 'object'
    required: boolean; default?: unknown; description: string
  }>
  preconditions: string[]
  evidencePage: number     // ★ 方法出自第几页
  supportLevel: 'unsupported' | 'L1' | 'L2'   // L3 明确不做
}

export interface GeneratedTool {
  toolName: string
  fromMethod: string
  sourcePaper: string
  status: 'draft' | 'active'                   // smoke 通过才 active
  smokeTest: { input: unknown; expect: string; passed: boolean; lastRun?: string }
}

// ══════════ ★C 技能库 ══════════
export type SkillStatus = 'draft' | 'needs_review' | 'active' | 'incomplete'

export interface Skill {
  skillId: string
  name: string
  domain: string
  version: string
  /** 自动触发条件 —— 对齐 Claude Code 的 when_to_use,必须含触发短语 */
  whenToUse: string
  loadWhen: { keywords: string[]; taskTypes: string[] }
  /** 工具白名单 —— 对齐 allowed-tools,取最小权限 */
  allowedTools: string[]
  sections: {
    domainMap: Array<{ concept: string; note?: string }>            // 1 领域地图(≤20)
    workflow: Array<{ stage: string; input: string; action: string; criteria: string }>  // 2 标准流程
    toolMapping: Array<{ method: string; tool: string }>            // 3 方法→工具
    failureModes: string[]                                          // 4 失败模式(≥3)★
    terminology: Array<{ term: string; disambiguation: string }>    // 5 术语消歧
    evidenceIndex: Array<{ claim: string; noteId: string }>         // 6 证据索引
    negativeConstraints: string[]                                   // 7 不要做什么
  }
  status: SkillStatus
  reviewBy?: string        // 人工审核人
}
```

**四条数据铁律**:

| # | 铁律 | 违反后果 |
|---|---|---|
| 1 | 无 `page` 锚点的信息不得进入 A | 无法验证幻觉 |
| 2 | 无 `evidencePage` 的方法不得进入 B | 工具来源不可考 |
| 3 | `parseQuality.pagesParsed/pagesTotal < 0.7` → `quarantined` | 脏数据污染整个知识库 |
| 4 | 技能未经人工审核不得转 `active` | 错误判断力持续污染 agent |

---

## 6. 主循环设计

### 6.1 设计目标

| 目标 | 依据 |
|---|---|
| 150–250 行(对照 Claude Code 的 1725 行) | 只保留骨架,作为"读懂架构"的证据 |
| 不崩 | 任何异常不 throw 到顶层 |
| 可中断 | Ctrl+C 立即停 |
| 可诊断 | 5 种终止 reason 明确区分 |

### 6.2 流程图

```
loop(messages, opts):
  for turn in 1..opts.maxTurns:
    ── ① 预算检查 ──────────────────────────
    if usage.total > budget: return { reason:'budget_exceeded' }

    ── ② 压缩(单篇分段摘要)──────────────
    if estimateTokens(messages) > threshold:
        messages = compactSegments(messages)      // 位置:调 LLM 之前

    ── ③ 调 LLM(流式)────────────────────
    stream = await llm.stream(messages, toolSchemas, { signal })
    assistantMsg, toolUses = await collect(stream)   // ★ 遍历 content 找 tool_use
                                                     //   不看 stop_reason
    ── ④ 无工具 → 结束 ────────────────────
    if toolUses.length === 0:
        ui.flush(); return { reason:'completed' }

    ── ⑤ 分区并发执行 ─────────────────────
    batches = partition(toolUses)        // 连续 isConcurrencySafe 的合成一批
    results = []
    for batch in batches:
        if signal.aborted: return { reason:'aborted' }
        r = await runBatch(batch)        // 批内并发,批间串行
        results.push(...r)

    ── ⑥ 回填 ─────────────────────────────
    // ★ tool_result 必须全包在一条 user 消息内,不与普通文本交错
    messages.push(assistantMsg)
    messages.push({ role:'user', content: results.map(toToolResult) })

    ── ⑦ 循环 ─────────────────────────────
  return { reason:'max_turns', messages }   // 保留已有产出
```

### 6.3 三条实现红线

| 红线 | 说明 | 出处 |
|---|---|---|
| **不读 `stop_reason`** | 遍历 `content` 块找 `type==='tool_use'`。`stop_reason` 在跨 provider 时不可靠 | `query.ts:553-556` |
| **`tool_result` 全包在一条 user 消息** | 且**不能**和普通 user 文本交错,否则 API 报错 | `query.ts:1535-1536` |
| **工具异常不抛** | `catch` → `<tool_error>{msg}</tool_error>` + `is_error:true` 回填,由模型决定下一步 | `toolExecution.ts:469` |

### 6.4 并发分区

```ts
/** 采纳 partitionToolCalls(toolOrchestration.ts:91) 的语义:
 *  把"连续"的 isConcurrencySafe 调用合成一批并发,遇到不安全的就断开 */
function partition(calls: ToolUse[]): ToolUse[][] {
  const batches: ToolUse[][] = []
  let cur: ToolUse[] = []
  for (const c of calls) {
    const tool = registry.get(c.name)
    const safe = tool?.isConcurrencySafe?.(c.input) ?? false
    if (safe) {
      cur.push(c)
      if (cur.length >= MAX_CONCURRENCY) { batches.push(cur); cur = [] }  // 默认 3
    } else {
      if (cur.length) { batches.push(cur); cur = [] }
      batches.push([c])            // 不安全工具单独成批(串行)
    }
  }
  if (cur.length) batches.push(cur)
  return batches
}
```

> Claude Code 默认上限 10;我们收到 **3**,因为要照顾 API 限流与现场网络。

---

## 7. 模块 A:个人知识库 设计

对应需求:`FR-A1 ~ FR-A5`

### 7.1 借鉴与增量

| 环节 | Claude Code 做法 | 我们 |
|---|---|---|
| 存储单位 | 一段自由文本记忆 | **原子知识页**(一论断一页) |
| 索引 | `MEMORY.md`,每行 `- [Title](file.md) — hook` | 同构:`knowledge/INDEX.md` |
| 索引注入 | 总是进 system prompt,截断 200 行 / 25000 字节 | 同,截断 **120 行 / 15000 字节** |
| 相关性检索 | 清单交 LLM 选 ≤5 条(**无向量**) | 同,选 ≤**8** 条 |
| 元数据 | `name / description / type` | `description / kind / paperId / page` |
| **锚点** | 无 | ★ **强制 `paperId + page`** |

### 7.2 文件布局

```
knowledge/
├── INDEX.md                     # 索引(总是注入),每行:
│                                #   - [p{a}#p{n}] 一句话描述 — {kind}
├── papers/
│   └── <paperId>/
│       ├── meta.md              # frontmatter: title/authors/year/parseQuality
│       └── notes.md             # 原子知识页,每条一个 ## 小节
└── _index.json                  # 机器可读索引(paperId → noteIds)
```

### 7.3 原子知识页格式

```markdown
## p3f8a2c1#p7#a91f3e

---
noteId: p3f8a2c1#p7#a91f3e
paperId: p3f8a2c1
page: 7
kind: result
confidence: high
---

低资源语言的 RAG 在检索阶段引入语言对齐嵌入,
在 XNLI 上比基线提升 4.2 个点。

**证据**:> "our approach improves XNLI accuracy by 4.2 points (Table 3, p.7)"
**出处**:@p3f8a2c1 p.7 §5.2
```

> **为什么 `description` 单独一行且放最前**:采纳 `memoryTypes.ts:261` 的设计 —— 这条描述本身就是召回依据,必须写得具体,而不是标题。

### 7.4 检索两段式(关键设计)

```ts
// 段 1:关键词粗筛(本地,<1s)
const candidates = await store.scan(query, 50)

// 段 2:LLM 精筛(采纳 findRelevantMemories.ts:97-130)
//   把清单交给便宜的模型,用 json_schema 强制返回 {selected: string[]}
const manifest = candidates.map(n => `[${n.kind}] ${n.noteId}: ${n.description}`).join('\n')
const { selected } = await llm.sideQuery({
  prompt: `从下列知识清单中选出与查询最相关的条目(最多 8 条):\n查询:${query}\n\n${manifest}`,
  schema: { selected: 'string[]' },
  model: CHEAP_MODEL,
  maxItems: 8,
})
return candidates.filter(n => selected.includes(n.noteId))
```

**为什么不用向量**:Claude Code 用 LLM 选择而不是向量检索(`findRelevantMemories.ts` 全文件无 embedding 调用)。这省掉了 embedding 成本、向量库依赖和索引一致性维护 —— 对一个 4 天项目是巨大简化,而且对科研文本(术语密集)反而更准。

### 7.5 质量门控

```
解析 → parseQuality 计算 → pagesParsed/pagesTotal < 0.7 ?
                              ├ 是 → 标记 quarantined,写报告,不进抽取队列
                              └ 否 → 进入原子化
```

**宁可少 20 篇,不要脏 1 篇** —— 脏数据会污染 C 模块的领域共识,而 C 是长期资产。

---

## 8. 模块 B:工具库 设计(我们的核心创新)

对应需求:`FR-B1 ~ FR-B5`

### 8.1 为什么这是真创新

> Claude Code 的 40+ 工具全部由开发者手写(`tools.ts:193-251` 全是静态 import)。
> 我们要让它**从论文里长出来** —— 这是相对的纯增量。

### 8.2 分级策略(必须遵守,否则一定翻车)

| 级别 | 内容 | 做不做 | 理由 |
|---|---|---|---|
| **L1** | 方法选型 + 参数填充:从论文抽出方法名/参数/前提,生成**参数化工具**,内部实现是确定性的数值计算或 API 调用 | ✅ **做** | 语义鸿沟小,成功率高 |
| **L2** | 多步流程 DSL:把论文的多步骤 pipeline 表达成 DSL,带人工确认执行 | ⚠️ 有余力做 | 需要人工兜底 |
| **L3** | 自动生成分析代码(让 LLM 写 Python 分析脚本) | ❌ **不做** | 质量完全不可控,失败即毁 demo |

### 8.3 生成流水线

```
PaperDoc
   │  ① 方法抽取(prompt 工程 + json_schema 强约束)
   ▼
MethodSpec { name, params[], preconditions[], evidencePage, supportLevel }
   │  ② 分级判定:supportLevel === 'unsupported' → 丢弃并记录原因
   ▼
   │  ③ 代码生成(模板填充,不是让 LLM 自由写代码)
   ▼
tools/generated/<toolName>.ts        ← 符合 Tool 接口
tools/generated/<toolName>.test.ts   ← smoke test
   │  ④ smoke test 执行
   ▼
   ├ 通过 → status='active',注册进 registry
   └ 失败 → status='draft',降级为"参数模板 + 人工填写"
```

### 8.4 关键设计:代码用模板填充,不让 LLM 自由生成

```ts
/** 生成器只用固定模板把 MethodSpec 填进去。
 *  LLM 只负责"抽取结构"(MethodSpec),不负责"写代码" —— 这是 L1 与 L3 的本质区别 */
function renderTool(spec: MethodSpec): string {
  return `
import { z } from 'zod'
import type { Tool, ToolResult } from '../../tools/types.js'

const inputSchema = z.strictObject({
${spec.params.map(p => `  ${p.name}: z.${zodType(p.type)}()${p.required ? '' : '.optional()'}.describe('${p.description}'),`).join('\n')}
})

export const tool: Tool<z.infer<typeof inputSchema>> = {
  name: '${spec.name}',
  description: (i) => \`${spec.name} —— 来自论文 ${spec.paperId} p.${spec.evidencePage}\`,
  inputSchema,
  isReadOnly: () => true,            // 纯计算,默认安全
  isConcurrencySafe: () => true,
  async call(input, ctx): Promise<ToolResult> {
    // ⚠️ L1 实现:确定性计算,由 <methodId> 的 L1 模板提供
    return l1Impl['${spec.methodId}'](input)
  },
}
`
}
```

> **这样做的保险**:即使 LLM 抽取错了参数,生成的工具也只是参数不对(可被 zod 挡住),不会产生任意执行代码。

### 8.5 工具体检

```bash
node src/main.ts tools doctor
```
输出:
```
工具总数 5  active 3  draft 2  通过率 60%

✗ normalize_citation   smoke 失败: 输入 {text:"..."} 期望含 "et al." 实际 ""
✓ extract_metric       smoke 通过
✓ compute_f1           smoke 通过
✓ align_lowres_embed   smoke 通过
✗ build_prisma_flow    smoke 失败: 超时 5000ms
```

**这个通过率就是 B 模块的验收指标**(SRS `A-7`,阈值 ≥60%)。

---

## 9. 模块 C:技能库 设计

对应需求:`FR-C1 ~ FR-C3`

### 9.1 借鉴 Claude Code 的四个机制(全盘采纳)

| 机制 | 出处 | 我们怎么做 |
|---|---|---|
| **目录格式** `<skills>/<name>/SKILL.md` | `loadSkillsDir.ts:407-431` | 同构:`skills/<skillId>/SKILL.md` |
| **元数据常驻 + 正文懒加载** | `loadSkillsDir.ts:100-105` | 常驻只有 `name + whenToUse + 一句话 description` |
| **清单预算 1% 上下文** | `SkillTool/prompt.ts:21-40` | 约 8000 字符,超预算把次要技能压成纯名字 |
| **when_to_use 驱动匹配** | `loadSkillsDir.ts:185-265` | 同构,且**必须含触发短语** |

### 9.2 我们的技能文件格式

```markdown
---
name: 低资源语言 RAG 研究
domain: NLP / Retrieval-Augmented Generation
version: 1.0
when_to_use: 当用户询问低资源语言的检索增强、跨语言检索、或 XX 数据集的实验复现时使用
allowed-tools: [arxiv_search, knowledge_search, extract_metric, compute_f1]
load_when:
  keywords: [低资源, low-resource, 跨语言, XNLI]
  task_types: [literature_review, experiment_plan]
status: active
reviewed_by: wyh
---

# 一、领域地图(≤20 个节点)

- 检索增强生成(RAG)
- 稠密检索 / 稀疏检索
- 跨语言嵌入对齐
- 低资源迁移
...

# 二、标准流程

## 阶段 1:明确任务边界
- 输入:用户的问题
- 动作:确认语种范围、目标任务(分类/生成/检索)
- **判据**:若未给出语种,必须先问,不得假设

## 阶段 2:确认基线
- 输入:任务边界
- 动作:从知识库检索该任务的主流 baseline 与其指标
- **判据**:至少找到 2 个 baseline 的 paperId,否则提示"该领域知识不足"

# 三、方法 → 工具映射

| 方法 | 工具 | 说明 |
|---|---|---|
| 指标抽取 | `extract_metric` | 从论文正文抽 metric 数值 |
| F1 计算 | `compute_f1` | 需要 precision/recall |

# 四、常见失败模式 ★ 最有价值的一节

1. **把跨语言检索和跨语言生成混为一谈** —— 两者评测指标完全不同,混淆会导致选错 baseline
2. **忽略低资源数据集的数据泄漏** —— 部分数据集测试集与训练集有重叠,直接引用其数字会高估效果
3. **XNLI 的 zero-shot 与 translate-train 不可直接比较** —— 设置不同,数字不可比
4. **把 BLEU 提升当成任务解决** —— 生成质量和事实正确性是两件事

# 五、术语消歧

- "alignment":在嵌入语境指空间对齐,在 RLHF 语境指偏好对齐
- "low-resource":可能指语种稀有,也可能指标注数据少

# 六、证据索引

- 跨语言对齐提升 4.2 点 → `p3f8a2c1#p7#a91f3e`
- 数据泄漏风险 → `p9b21d4e#p3#c7a2f1`

# 七、不要做什么

- 不要在没有确认语种的情况下给出结论
- 不要引用未标注页码的实验数字
- 不要在缺少 baseline 时强行给"提升幅度"
```

### 9.3 上下文预算控制(关键)

```ts
/** 采纳 SkillTool/prompt.ts 的预算策略:
 *  清单总预算 = 上下文窗口的 1%(约 8000 字符)
 *  超预算时:核心技能保全文,其余压成纯名字 */
const BUDGET = 8000   // 字符

function buildManifest(skills: Skill[]): string {
  const lines = skills.map(s => `- ${s.skillId}: ${s.description} — ${s.whenToUse}`)
  if (totalLength(lines) <= BUDGET) return lines.join('\n')
  // 超预算:保前 N 个完整,其余只留名字
  return [...lines.slice(0, 5), ...skills.slice(5).map(s => s.skillId)].join('\n')
}
```

### 9.4 七节结构是"判断力"而非"综述"的保证

| 节 | 如果是综述会写成 | 我们要求写成 |
|---|---|---|
| 二、标准流程 | "该领域主要有三种方法……" | **每个阶段:输入 → 动作 → 判据** |
| 四、失败模式 | (通常没有) | **≥3 条具体的坑,每条能判断"我是不是踩了"** |
| 五、术语消歧 | (通常没有) | 同名不同义,防止误用 |
| 七、不要做什么 | (通常没有) | 负向约束,防止模型过度发挥 |

**评审时只问一句**:「这份技能里,哪句话是只有踩过坑的人才知道的?」——答不出来就是综述,打回重写。

---

## 10. 子 Agent 与记忆

### 10.1 子 Agent(只做 spawn)

```ts
export interface SubAgentSpec {
  agentType: string            // 如 'paper_reader'
  systemPrompt: string
  tools: string[]              // 工具白名单,如 ['pdf_segment_read']
  maxTurns: number             // 默认 8
  task: string
}

export async function runSubAgent(spec: SubAgentSpec, ctx: ParentCtx): Promise<SubAgentResult> {
  const childCtx = createChildContext(ctx)          // ★ 独立 messages / 独立 abort
  const messages: Message[] = [{ role: 'user', content: [{ type: 'text', text: spec.task }] }]
  const result = await loop(messages, { tools: spec.tools, maxTurns: spec.maxTurns, ctx: childCtx })

  // ★ 采纳 agentToolUtils.ts:276:只回传最后一条 assistant 的 text,不回传全文
  return {
    agentType: spec.agentType,
    content: lastAssistantText(result.messages),
    toolUseCount: result.toolCallsCount,
    tokens: result.usage,
  }
}
```

**三条约束**:

| 约束 | 理由 |
|---|---|
| 独立 messages,不共享父对话 | 避免上下文污染(`runAgent.ts:700`) |
| 独立 AbortController,父子单向传播 | 父中止则子中止,反之不成立(`abortController.ts:68`) |
| **只回传最后一条 assistant 的 text** | 省 token 的关键(`agentToolUtils.ts:276`) |
| 子 agent 内禁用 `spawn_subagent` 工具 | 防递归(`forkSubagent.ts:78` 的 `<FORK>` 检查思路) |

### 10.2 记忆(论文处理记录)

```markdown
<!-- memory/PROCESSED.md -->
| paperId | title | 处理时间 | 知识页数 | 工具数 | 状态 |
|---|---|---|---|---|---|
| p3f8a2c1 | Low-resource RAG | 2026-10-28 | 12 | 2 | done |
| p9b21d4e | Cross-lingual NLI | 2026-10-28 | 8 | 1 | quarantined |
```

启动时加载 → 已处理论文默认跳过(`--force` 覆盖)→ 日志打印「命中记忆,跳过 p3f8a2c1」。

---

## 11. 存储与目录结构

```
hackathon-agent/
├── src/
│   ├── main.ts                        # 入口:ingest / ask / tools doctor
│   ├── ui/                            # 渲染器(消费事件流)
│   │   ├── events.ts                  # ★ 事件总线契约(CLI/Web 共用)
│   │   ├── renderCli.ts               #   CLI 渲染器(chalk)
│   │   └── progress.ts                #   进度条
├── web/                               # Web 薄壳(不得 import services/)
│   ├── server.ts                      #   node:http + SSE(约 120 行)
│   └── public/
│       ├── index.html                 #   单页,零构建零框架
│       ├── app.js                     #   EventSource + DOM 渲染(约 500 行)
│       └── style.css                  #   手写 CSS,无 CDN
│   ├── agent/
│   │   ├── types.ts                   # ★ 冻结契约
│   │   ├── loop.ts                    # 主循环(目标 150-250 行)
│   │   └── subagent.ts
│   ├── tools/
│   │   ├── types.ts                   # ★ 冻结契约
│   │   ├── registry.ts
│   │   ├── knowledge/search.ts        # A:知识检索
│   │   └── generated/                 # B:生成工具 + smoke test
│   ├── services/
│   │   ├── llm/{provider.ts,stream.ts,retry.ts}
│   │   ├── paper/{fetch.ts,parse.ts,quality.ts}       # 共享底座
│   │   ├── knowledge/{types.ts,localMarkdown.ts,select.ts,index.ts}   # ★A
│   │   ├── toolsynth/{extract.ts,render.ts,smoke.ts,doctor.ts}        # ★B
│   │   ├── skills/{types.ts,load.ts,generate.ts,match.ts}             # ★C
│   │   ├── trace/{writer.ts,replay.ts}
│   │   └── cache/fixtures.ts
│   └── state/
│       ├── memory/index.ts
│       └── store/paths.ts
├── knowledge/                         # A 产物(入库)
│   ├── INDEX.md
│   ├── papers/<paperId>/{meta.md,notes.md}
│   └── _index.json
├── skills/                            # C 产物(入库)
│   └── <skillId>/SKILL.md
├── tools/generated/                   # B 产物(实际在 src/tools/generated)
├── fixtures/                          # 回放(入库)
├── data/                              # 大文件(不入库)
├── out/                               # 交付物
├── logs/                              # trace(不入库)
├── scripts/demo.sh
├── docs/{SRS.md,SDD.md,PLAN.md,wyh/,reference/}
├── .github/
└── .env.example
```

---

## 12. 技术选型与工程规范

### 12.1 选型

| 项 | 选择 | 依据 |
|---|---|---|
| 语言 | TypeScript | 对照 Claude Code 同为 TS,学习成本最低 |
| 运行时 | Node 24 **直接跑 .ts**(类型剥离) | 免构建省半天;限制:不用 `enum`/`namespace`,import 带扩展名 |
| 包管理 | npm | 团队最熟,不混用 pnpm |
| Schema | **zod v4** + 原生 `z.toJSONSchema` | 采纳 Claude Code 单源 schema 设计(`FileReadTool.ts:227`) |
| LLM | `@anthropic-ai/sdk` 主 + OpenAI 兼容备 | `sideQuery` 用于便宜模型做相关性筛选 |
| PDF | `pdfjs-dist` / `unpdf`;arXiv 官方 API 优先 | PDF 只作降级 |
| 终端 | `chalk` | 不上 Ink/React |
| **Web 后端** | **Node 内置 `http` + SSE** | 零依赖;事件是单向的,SSE 比 WebSocket 简单一个量级 |
| **Web 前端** | **单页 HTML + 原生 JS + 手写 CSS** | 零构建、零框架、零 CDN。不引入构建链 = 没有构建失败风险 |
| 测试 | `node:test` | 零配置 |
| 日志 | 自写 JSONL | 便于回放 |

### 12.2 明确不引入

❌ Agent 框架(LangChain/AutoGen)· 向量库 · 数据库 · ORM/DI · UI 框架 · 格式化门禁
❌ **Web 侧的**:React/Vue/Vite/Next · Express/Koa/Fastify · Tailwind 构建版 · 任何 CDN 依赖

### 12.3 环境约束(实测)

| 约束 | 现象 | 处理 |
|---|---|---|
| 代理 | 命令行工具不读系统代理,`github.com:443` 直连超时 21s | 显式配 `http.proxy` / `HTTPS_PROXY` |
| 路径含空格 | `credential.helper` 路径被截断 | 凭据写 remote URL;脚本加引号 |
| 换行符 | 跨平台满屏 diff | `.gitattributes` 已配 |
| glob 工具 | 在含空格路径下返回空 | 用 `Get-ChildItem` 列目录 |

---

## 13. 开发计划(4 天)

### 13.1 纵向薄切片总策略

```
不追求「一个模块做得很深」,追求「三个模块都立起来 + 串成闭环」
```

### 13.2 每日任务与产出

| 天 | 主线 | 交付物 | 完成判据 |
|---|---|---|---|
| **D1** | 契约 + 底座 + 循环 + **事件总线** | `tools/types.ts`、`agent/types.ts`、`knowledge/types.ts`、`ui/events.ts`、`loop.ts`、`paper/parse.ts` | 主循环跑通一轮;1 篇论文能出 `PaperDoc`;事件流能在 stdout 打印 |
| **D2** | A 闭环 + B 首个工具 + **Web 骨架** | `knowledge/*`、`toolsynth/extract.ts`、`render.ts`、`smoke.ts`、`web/server.ts`、`index.html` | `ingest` 产出 ≥5 条知识页且可检索;≥1 个工具 active;**浏览器能看到流式输出** |
| **D3** | C 技能 + 三层贯通 + **三面板** | `skills/*`、`registry` 接生成工具、`/api/{knowledge,tools,skills}`、`app.js` 完整渲染 | 一条命令跑通「沉淀 → 消费」;**三个面板实时显示资产增长** |
| **D4** | 打磨与交付 | 降级策略、录屏、README/幻灯片、仓库清理 | Web 与三模块各自可独立演示;Web 崩了能秒切 CLI |

### 13.3 四个硬检查点

| 时点 | 检查 | 未通过则 |
|---|---|---|
| D1 10:00 | 每人 key 调通一次 LLM | 换 provider |
| D1 12:00 | 四问关闭 + 三契约入 main | 按默认值执行,不再讨论 |
| D2 17:00 | A 闭环跑通 | 砍 B 至 1 个工具,C 改手工编写 |
| D3 17:00 | `demo.sh` 通 | 冻结功能,全员转 demo 稳定性 |

### 13.4 并行分工建议(3 人)

| 角色 | 负责 | 文件范围 |
|---|---|---|
| **基础设施** | 契约 + 主循环 + 事件总线 + LLM 层 + 底座 | `agent/`、`ui/events.ts`、`services/paper/`、`services/llm/` |
| **A + C** | 知识库 + 技能库 | `services/knowledge/`、`services/skills/`、`tools/knowledge/` |
| **B + Web + 演示** | 工具库 + Web 薄壳 + demo 脚本 | `services/toolsynth/`、`tools/generated/`、`web/`、`scripts/` |

**文件级隔离,不交叉改同一文件。** 三契约 + 事件总线由「基础设施」一人独写后冻结。

> ⚠️ Web 工作量约 1–1.5 天,落在第三人身上偏重。若 D2 17:00 检查点未过,按 SRS §3.3 的裁剪顺序砍**子 Agent 并行**与**技能自动生成**,把工时让给 Web —— 因为 Web 是卖点的呈现方式。

### 13.5 D1 第一小时 checklist

```
0) 环境自检     node -v ≥ 22.18 / git 代理 / API key 连通
1) 关四问       Q0 模块命名 / Q1 kiwi / Q2 provider / Q3 CLI或Web
2) 写三契约     tools/types.ts → agent/types.ts → knowledge/types.ts → PR 合入
3) 写循环       loop.ts + FakeLLM 单测(不花 API 额度)
4) 真实调一次    打印 tool_use,确认解析正确
5) 写底座       paper/parse.ts 解析 1 篇出 PaperDoc
```

---

## 14. 验收与演示

### 14.1 三个模块的独立演示(对应 SRS `A-1`)

```bash
# A:知识库
node src/main.ts ingest papers/xxx.pdf
cat knowledge/INDEX.md              # 看索引长出来
node src/main.ts ask "低资源 RAG 有哪些方法?"   # 看它引用知识页

# B:工具库
node src/main.ts tools doctor       # 看生成工具的通过率
ls src/tools/generated/             # 看工具从哪来

# C:技能库
cat skills/low-resource-rag/SKILL.md   # 看七节结构
node src/main.ts ask "帮我规划一个低资源 RAG 实验"  # 看技能被加载
```

### 14.2 演示叙事(3 分钟脚本)

| 时间 | 讲什么 | 屏幕上是什么 |
|---|---|---|
| 0:00–0:30 | 问题:科研人员读论文,读完就忘,方法用不上 | 一屏论文列表 |
| 0:30–1:20 | **沉淀**:丢论文进去,它长出知识页 | `ingest` 滚动输出,`knowledge/` 文件增长 |
| 1:20–2:00 | **工具**:论文里的方法变成了能调的函数 | `tools doctor` 通过率 |
| 2:00–2:40 | **技能**:跨论文的共识变成了判断力 | `SKILL.md` 的七节,重点讲失败模式 |
| 2:40–3:00 | **闭环**:提个新问题,它用自产资产完成 | `ask` 输出 + 引用的知识页锚点 |

### 14.3 一句话总结(答辩收尾)

> **别的 Agent 的工具和知识是人预先给的;我们的 Agent 让论文自己长出知识与工具,再把跨论文的共识固化成技能 —— 它是一个会积累的科研助手,不是一个每次从零开始的问答机器人。**

---

## 15. 附录

### 15.1 Claude Code 源码索引(供复核)

| 主题 | 文件 | 关键行 |
|---|---|---|
| Tool 类型 | `src/Tool.ts` | 362-393(类型)、402-516(能力位)、757-769(fail-closed 默认) |
| 工具管线 | `src/tools/*/toolExecution.ts` | 615(safeParse)、683(validateInput)、1207(call)、469(错误回填) |
| 工具注册 | `src/tools.ts` | 193-251(静态数组)、345-367(合并与缓存) |
| zod → JSON Schema | `src/utils/zodToJsonSchema.ts` | 12-22 |
| 主循环 | `src/query.ts` | 219/241(入口)、307(while)、553-556(stop_reason 不可靠)、829(tool_use 解析)、1535(tool_result 约束)、1716(消息累积) |
| 并发分区 | `src/tools/.../toolOrchestration.ts` | 91、158-176 |
| 终止 reason | `src/query.ts` | 646/996/1051/1515/1711 等 10 处 |
| 压缩 | `src/services/compact/autoCompact.ts` | 33-91(阈值)、160(触发) |
| 记忆类型 | `src/memdir/memoryTypes.ts` | 14-31(四类)、261-271(frontmatter) |
| 记忆检索 | `src/memdir/findRelevantMemories.ts` | 39-45、97-130(LLM 筛选) |
| 记忆索引 | `src/memdir/memdir.ts` | 306(注入)、35-38(截断上限) |
| 技能加载 | `src/skills/loadSkillsDir.ts` | 100-105(元数据预算)、185-265(frontmatter)、407-431(目录格式) |
| 技能清单 | `src/tools/SkillTool/prompt.ts` | 21-40(1% 预算)、70-171(注入格式) |
| 会话→技能 | `src/skills/bundled/skillify.ts` | 22-156(访谈流程)、96-146(正文模板) |
| 子 Agent 定义 | `src/tools/AgentTool/loadAgentsDir.ts` | 106 |
| 子 Agent 派生 | `src/tools/AgentTool/runAgent.ts` | 248/347/508/700 |
| 子 Agent 结果 | `src/tools/AgentTool/agentToolUtils.ts` | 276(只回最后一条 text) |
| fork | `src/tools/AgentTool/forkSubagent.ts` | 60、78、107 |
| Task | `src/Task.ts` | 6(7 类 + 5 态) |
| MCP 发现 | `src/services/mcp/client.ts` | 1743(tools/list)、1773(命名映射) |
| API 流式 | `src/services/api/claude.ts` | 752、1980-2295(状态机) |
| 重试 | `src/utils/withRetry.ts` | 170、530、400-425 |

### 15.2 术语表

| 术语 | 含义 |
|---|---|
| PaperDoc | 论文结构化产物,带页码锚点,全系统基础契约 |
| AtomicNote | 原子知识页:一个论断一页,必带 `paperId + page` |
| MethodSpec | 从论文抽出的方法规格(参数/前提/证据页码) |
| GeneratedTool | 由 MethodSpec 按 L1 模板生成的可执行工具 |
| Skill | 七节结构的领域判断力文件 |
| 锚点 locator | `paperId + page`,可回指坐标 |
| quarantined | 解析质量不合格的论文,被隔离 |
| replay | 从 `fixtures/` 回放,完全离线 |
| 纵向薄切片 | 每模块只做最小可用,优先三层贯通 |
| fail-closed | 能力位漏写时按最保守值处理 |

### 15.3 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-10-28 | 首次成文。基于 Claude Code 源码四模块实读结论,产出架构映射、四份核心契约、数据模型、主循环设计、三模块详细设计、目录结构、4 天开发计划 |
| **v1.1** | 2026-10-28 | **新增 §3.4 Web 交互层(薄壳设计)**:一条事件流两个渲染器、9 种事件协议、零依赖后端、单页前端、三模块可视化面板布局、四项降级策略;目录结构新增 `web/`;技术选型补充 http+SSE 与零构建前端;开发计划与分工相应调整 |

**变更规则**:设计变更必须同步更新第 1 章「设计依据」中对应的源码引用,保持可追溯。
