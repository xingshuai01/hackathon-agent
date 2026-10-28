# 黑客松选题与 Claude Code 技术框架参考

> 团队定位：偏工程，目标是通过比赛系统学习 Agent 架构开发
> 参考资料：Claude Code 源码（`/Users/xingshuai/Desktop/claude-code-main`）

---

## 第一部分：Claude Code 技术框架

### 1. 整体分层架构

```
┌──────────────────────────────────────────────────────┐
│  入口层 (src/entrypoints/)                           │
│   cli.tsx   终端交互入口                              │
│   mcp.ts    作为 MCP Server 暴露能力                  │
│   sdk/      Agent SDK（供外部程序调用）                │
├──────────────────────────────────────────────────────┤
│  UI 层 (src/ink/, src/screens/, src/components/)     │
│   基于 Ink (React for CLI) 的终端 TUI                 │
│   vim 模式、输入框、spinner、diff 渲染                │
├──────────────────────────────────────────────────────┤
│  编排层 (src/query.ts + src/QueryEngine.ts)          │
│   ★ Agent 主循环：调用 LLM → 解析 tool_use →         │
│     权限检查 → 执行工具 → 结果回填 → 继续生成         │
├──────────────────────────────────────────────────────┤
│  工具层 (src/tools/*, 40+ 工具)                      │
│   每个工具一个目录，实现统一的 Tool 接口               │
│   Bash / FileEdit / FileRead / FileWrite / Grep /    │
│   Glob / AgentTool / MCPTool / WebFetch / WebSearch /│
│   Task* / Team* / Skill / NotebookEdit / REPL ...    │
├──────────────────────────────────────────────────────┤
│  任务层 (src/tasks/*)                                │
│   后台 / 远程执行单元                                  │
│   LocalShellTask / LocalAgentTask /                  │
│   RemoteAgentTask / InProcessTeammateTask / DreamTask│
├──────────────────────────────────────────────────────┤
│  服务层 (src/services/)                              │
│   api/claude.js     Anthropic API 调用 + 流式解析    │
│   mcp/              MCP 客户端 + 连接管理 + OAuth     │
│   plugins/          内置 + 第三方插件                  │
│   compact/          上下文压缩（长对话摘要）           │
│   extractMemories/  自动记忆抽取                      │
│   SessionMemory/    会话记忆                          │
│   oauth/            认证流程                          │
├──────────────────────────────────────────────────────┤
│  状态 / 上下文层                                      │
│   src/memdir/       记忆目录（USER / PROJECT 范围）   │
│   src/context/      React Context（UI 状态）          │
│   src/hooks/        100+ React hooks                  │
│   src/state/        AppState                          │
└──────────────────────────────────────────────────────┘
```

### 2. 核心机制详解

#### 2.1 Tool 抽象 (`src/Tool.ts`)

所有工具实现统一接口：

```ts
type Tool = {
  name: string;
  description: string;
  inputSchema: ToolInputJSONSchema;   // JSON Schema 描述参数
  call(input, context): Promise<ToolResult>;
  // 权限、进度回报、中断支持...
}
```

- **JSON Schema 驱动**：LLM 根据 schema 生成参数，框架负责校验
- **统一权限检查**：`useCanUseTool` hook 在执行前拦截
- **进度流**：每个工具可回报 `ToolProgressData`（BashProgress / AgentToolProgress 等）

#### 2.2 Agent 主循环 (`src/query.ts`)

```
User Message
    ↓
[调用 Claude API] ← streaming
    ↓
解析响应 → 文本？ → 输出给用户
         → tool_use？
              ↓
         [权限检查] → 拒绝 → 回报用户
              ↓ 通过
         [执行工具 call()]
              ↓
         [工具结果回填为 user message]
              ↓
         [继续调用 Claude API] ← 循环
```

关键设计：
- **流式解析**：边接收边处理
- **中断支持**：`AbortController` 贯穿全链路
- **上下文压缩**：`services/compact/` 在接近 context limit 时自动摘要历史

#### 2.3 子 Agent 机制 (`src/tools/AgentTool/`)

Claude Code 内置 5 种子 agent（`built-in/`）：

| Agent | 用途 |
|---|---|
| `exploreAgent` | 只读代码搜索 |
| `planAgent` | 架构设计、实现规划 |
| `generalPurposeAgent` | 通用多步骤任务 |
| `claudeCodeGuideAgent` | 使用指南 |
| `verificationAgent` | 结果验证 |

核心文件：
- `runAgent.ts`：启动子 agent，独立上下文 + 独立工具集
- `forkSubagent.ts`：fork 出独立会话
- `loadAgentsDir.ts`：加载自定义 agent 定义（支持用户扩展）
- `agentMemory.ts`：子 agent 记忆管理

**关键学习点**：子 agent 是"主循环的再实例化"，拥有独立的 tool 白名单和 abort 控制。

#### 2.4 MCP 集成 (`src/services/mcp/`)

- `MCPConnectionManager`：管理多个 MCP server 连接（stdio / SSE / HTTP）
- `client.ts`：MCP 客户端协议实现
- `auth.ts` + `oauthPort.ts`：OAuth 认证
- `officialRegistry.ts`：官方 marketplace
- 工具动态发现：运行时从 MCP server 拉取工具列表，注入到 tool 池

#### 2.5 记忆系统 (`src/memdir/`)

- 双层目录：USER 范围（跨项目）+ PROJECT 范围
- `MEMORY.md` 作为索引，指向具体 `.md` 文件
- `extractMemories/` 服务：从对话中自动抽取值得长期保留的信息
- 注入方式：启动时加载 → 拼接到 system prompt

#### 2.6 任务与协作 (`src/tasks/`)

- `LocalShellTask`：后台跑 shell 命令
- `LocalAgentTask`：后台跑 agent
- `RemoteAgentTask`：远程 agent（云端）
- `InProcessTeammateTask`：进程内"队友"（多 agent 协作）
- `DreamTask`：空闲时的后台思考任务

#### 2.7 插件与 Skill (`src/plugins/`, `SkillTool`)

- **Plugin**：扩展 MCP server、内置工具、钩子
- **Skill**：斜杠命令式技能包（`/skill-name`），带参数和专用 prompt
- 都通过 `builtinPlugins.ts` 注册

### 3. 值得学习的工程设计

| 设计点 | Claude Code 的做法 | 学习价值 |
|---|---|---|
| 工具扩展 | JSON Schema + 统一接口 | 解耦、易测试 |
| 多 Agent | 主循环实例化 + 独立上下文 | 可组合的 agent 树 |
| 权限 | 模式切换（default/yolo/plan）+ 拒绝追踪 | 安全可控 |
| 上下文管理 | 自动 compact + 文件状态缓存 | 长任务不崩 |
| 记忆 | 文件式持久化 + 自动抽取 | 跨会话连续性 |
| MCP | 动态工具发现 + OAuth | 开放生态 |
| 流式 UI | Ink (React) + 进度类型 | 终端 UX 标杆 |

---

## 第二部分：三个偏工程的选题

### 选题 A：PaperAgent — 科研论文全流程 Agent

#### 产品定位
给定一个研究问题，自动完成：**文献检索 → 精读 → 提炼 → 复现代码骨架 → 写作草稿**

#### 技术架构（借鉴 Claude Code）

```
┌─────────────────────────────────────────────┐
│            PaperAgent 主循环                 │
│   (仿 query.ts 的 tool_use 循环)            │
└──────────────┬──────────────────────────────┘
               │ 调度
   ┌───────────┼───────────┬──────────────┐
   ↓           ↓           ↓              ↓
[SearchAgent] [ReadAgent] [CodeAgent]  [WriteAgent]
  arXiv API    PDF 精读     代码生成      LaTeX 写作
  Semantic     方法/实验/    骨架          Related Work
  Scholar      局限抽取                   章节
```

#### 工具设计（仿 Tool.ts 接口）

```ts
// 自定义工具示例
ArxivSearchTool      // 输入：query, max_results → 输出：论文列表
PDFReadTool          // 输入：pdf_path → 输出：结构化内容（sections, figures, tables）
CitationGraphTool    // 输入：paper_id → 输出：引用/被引论文
CodeScaffoldTool     // 输入：method_description → 输出：PyTorch/JAX 代码框架
LatexWriteTool       // 输入：section, content → 输出：.tex 文件
```

#### 关键技术点
1. **Multi-Agent 编排**：主 agent 作为 orchestrator，按需 fork 子 agent（仿 `AgentTool/forkSubagent.ts`）
2. **长文档处理**：PDF 精读时用 `compact` 机制分段摘要（仿 `services/compact/`）
3. **记忆**：用 memdir 模式记录"已读论文"、"关键发现"，避免重复工作
4. **MCP 扩展**：把 arXiv、Semantic Scholar、OpenReview 封装成 MCP server

#### 学习收获
- Multi-agent 编排模式
- 长文档上下文管理
- MCP server 开发
- 工具抽象设计

#### 工作量评估
- 核心功能：2-3 天
- 完整 demo：4-5 天

---

### 选题 B：LabNotebook Agent — 实验记录与复现 Agent

#### 产品定位
科研实验的"自动化实验员"：**监控实验 → 结构化记录 → 支持复现指令 → 自动回滚重跑**

#### 技术架构

```
┌──────────────────────────────────────────────┐
│           LabNotebook Agent                  │
│                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────┐ │
│  │ Watch Task │  │ Extract    │  │ Memory │ │
│  │ (后台监控  │→ │ (解析日志/ │→ │ (写入   │ │
│  │  实验输出) │  │  CSV/图表) │  │  记录)  │ │
│  └────────────┘  └────────────┘  └────────┘ │
│                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────┐ │
│  │ Snapshot   │  │ Replay     │  │ Report │ │
│  │ (代码/环境 │  │ (回滚+重跑 │  │ (生成   │ │
│  │  快照)     │  │  指定实验) │  │  报告)  │ │
│  └────────────┘  └────────────┘  └────────┘ │
└──────────────────────────────────────────────┘
```

#### 工具设计

```ts
WatchExperimentTool    // 启动后台任务监控训练日志（仿 LocalShellTask）
ParseMetricsTool       // 从日志/CSV 抽取指标曲线
SnapshotTool           // git commit + conda env dump + 数据 hash（仿 fileHistory）
ReplayExperimentTool   // 根据 experiment_id 回滚代码 + 重建环境 + 重跑
GenerateReportTool     // 输出 Markdown / PDF 实验报告
```

#### 关键技术点
1. **后台任务**：仿 `LocalShellTask` 实现长时间实验监控
2. **代码快照**：仿 `utils/fileHistory.ts` 做实验级版本控制
3. **记忆系统**：仿 `memdir` 记录"实验配置 → 结果"映射，支持"上次 X 实验结果如何"查询
4. **环境复现**：结合 conda/Docker 自动重建环境

#### 学习收获
- 后台任务编排
- 持久化记忆设计
- 代码版本联动的 agent
- 长时间运行任务的健壮性

#### 工作量评估
- 核心功能：2 天
- 完整 demo：3-4 天

---

### 选题 C：LiteratureSurvey Agent — 系统性综述 Agent

#### 产品定位
把科研方法论（**PRISMA 系统性综述**）编码成 agent workflow：检索 → 筛选 → 纳入 → 抽取 → 综述生成

#### 技术架构

```
┌─────────────────────────────────────────────┐
│       LiteratureSurvey Agent                │
│                                             │
│  Phase 1: Protocol                          │
│   └─ 解析研究问题 → 生成检索式              │
│                                             │
│  Phase 2: Search (并行多数据源)             │
│   ├─ ArXivAgent                            │
│   ├─ SemanticScholarAgent                  │
│   └─ IEEEAgent / PubMedAgent               │
│                                             │
│  Phase 3: Screening (两轮筛选)              │
│   ├─ Title/Abstract Agent (快速过滤)        │
│   └─ Full-text Agent (精读判定)             │
│                                             │
│  Phase 4: Extraction                        │
│   └─ 结构化抽取（method, dataset, result）  │
│                                             │
│  Phase 5: Synthesis                         │
│   └─ 分类汇总 + 综述稿 + 证据表             │
└─────────────────────────────────────────────┘
```

#### 工具设计

```ts
QueryConstructorTool   // 布尔检索式构造（AND/OR/NOT）
MultiSourceSearchTool  // 并行查询多个学术 API
ScreeningTool          // 基于纳入/排除标准筛选
DataExtractionTool     // 结构化抽取到预定义 schema
EvidenceTableTool      // 生成证据表（CSV/Markdown）
SynthesisWriteTool     // 按主题/时间线/方法分类综述
PRISMAFlowTool         // 生成 PRISMA 流程图（Mermaid）
```

#### 关键技术点
1. **工作流编排**：5 阶段 pipeline，每阶段可并行（仿 `AgentTool` 多 agent 并发）
2. **结构化输出**：抽取结果用 JSON Schema 约束（仿 `ToolInputJSONSchema`）
3. **人机协作**：筛选阶段支持人工复核（仿 `AskUserQuestionTool`）
4. **上下文管理**：大量论文的摘要用 compact 机制压缩（仿 `services/compact/`）
5. **可追溯**：每篇论文的纳入/排除决策都有理由记录

#### 学习收获
- 复杂工作流编排（pipeline + 并行 + 人机协作）
- 结构化输出约束
- 大规模文档的上下文管理
- 科研方法论的工程化

#### 工作量评估
- 核心功能：3 天
- 完整 demo：5 天

---

## 第三部分：三个选题对比

| 维度 | A. PaperAgent | B. LabNotebook | C. LiteratureSurvey |
|---|---|---|---|
| **核心挑战** | 多 agent 协作 + 长文档 | 后台任务 + 持久化 | 工作流编排 + 结构化输出 |
| **借鉴 Claude Code 重点** | AgentTool + compact | tasks/ + memdir + fileHistory | AgentTool + AskUser + Schema |
| **demo 直观度** | ★★★★☆ | ★★★☆☆ | ★★★★★ |
| **工程深度** | ★★★★★ | ★★★★☆ | ★★★★☆ |
| **科研实用性** | ★★★★★ | ★★★★★ | ★★★★☆ |
| **开发难度** | 中高 | 中 | 中高 |
| **建议** | **最推荐** — 覆盖 Agent 核心机制最全 | 适合对"agent + 系统"感兴趣 | 适合想展示"方法论工程化" |

---

## 第四部分：推荐学习路径

1. **先读 `src/Tool.ts`**：理解工具抽象（1-2 小时）
2. **再读 `src/query.ts`**：理解主循环（2-3 小时）
3. **然后 `src/tools/AgentTool/runAgent.ts`**：理解子 agent（2 小时）
4. **看 `src/services/mcp/client.ts`**：理解 MCP 协议（2 小时）
5. **翻 `src/memdir/`**：理解记忆设计（1 小时）
6. **动手**：基于以上理解，搭建自己选题的最小可用版本

---

## 附：Claude Code 关键源码地图

| 主题 | 文件 / 目录 |
|---|---|
| 工具接口 | `src/Tool.ts` |
| 主循环 | `src/query.ts`, `src/QueryEngine.ts` |
| 子 Agent | `src/tools/AgentTool/` |
| MCP 客户端 | `src/services/mcp/` |
| 记忆 | `src/memdir/`, `src/services/extractMemories/` |
| 后台任务 | `src/tasks/` |
| 权限 | `src/hooks/useCanUseTool.tsx`, `src/types/permissions.ts` |
| 上下文压缩 | `src/services/compact/` |
| 插件 | `src/plugins/` |
| 入口 | `src/entrypoints/cli.tsx`, `mcp.ts`, `sdk/` |
| UI | `src/ink/`, `src/screens/`, `src/components/` |
