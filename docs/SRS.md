# 需求说明书(Software Requirements Specification)

| 项 | 值 |
|---|---|
| 项目代号 | `hackathon-agent` |
| 文档版本 | v1.0(Draft for review) |
| 编写日期 | 2026-10-27 |
| 文档状态 | 待评审 —— 第 2.2 节的 3 个待确认项必须先关闭 |
| 目标读者 | 全体开发成员、评审、答辩准备 |
| 有效期 | 4 天开发周期内为唯一功能基线,变更走本文件第 14.3 节 |

### 本文档的来源与合并关系

本文档**不是**凭空新写的,而是把四份已有材料收敛成单一基线:

| 来源 | 提供什么 | 本文档如何采纳 |
|---|---|---|
| `docs/reference/claude-code-architecture.md` | Claude Code 分层架构、七个核心机制、三个候选选题 | 第 7 章架构分层的直接依据 |
| `docs/PLAN.md` | 四天里程碑与验收标准、风险预案 | 第 11 章里程碑、第 13 章风险 |
| `docs/wyh/仓库分析与开发建议.md` | A-core 范围定义、技术选型、时间检查点、9 条仓库问题 | 第 3 章范围、第 9 章技术选型、第 11 章检查点 |
| `docs/wyh/需求可行性与开发计划.md` | 知识库/工具库/技能库三层沉淀、PDF 底座、页码锚点 | 第 5 章 FR-10、第 8.1 节数据模型 |
| `docs/wyh/代码开发规范.md` | 编码规范、工具模板 | 本文档不重复,规定实现必须同时满足该规范 |

**冲突处理原则**:当来源之间冲突时,以「4 天内端到端可跑」为最高优先级裁决,并在第 2 章显式记录裁决结果与理由。

---

## 1. 背景与目标

### 1.1 项目背景

团队参加为期 **4 天**的黑客松,团队定位**偏工程**,参赛目标包含两层:

1. **交付层**:做出一个能现场演示的 Agent 应用。
2. **学习层**:通过亲手实现,系统理解 Agent 架构的核心机制(工具抽象、主循环、子 Agent、记忆、上下文管理),而不是调用现成 SDK 拼装。

这两层目标共同决定了:本项目**不使用现成的 Agent 框架**(LangChain / AutoGen / Coze 等),核心机制全部自研,以 Claude Code 的公开架构分析作为参考蓝本。

### 1.2 目标(Goals)

| 编号 | 目标 | 可验证的达成标准 |
|---|---|---|
| G1 | 打通一条端到端链路 | 一条命令从输入产出最终交付物,连续 3 次成功 |
| G2 | 自研核心机制 | 工具抽象、主循环、子 Agent、记忆四者均由本仓库代码实现 |
| G3 | 可现场演示且不怕断网 | 录制回放模式(`DEMO_MODE=replay`)可离线跑完整链路 |
| G4 | 沉淀可复用资产 | 一次运行的知识/工具有持久化产物,第二次运行能复用 |
| G5 | 讲得清「学了什么」 | README 能用架构图说明借鉴了 Claude Code 的哪些机制 |

### 1.3 非目标(Non-Goals)

明确写出**不追求**的东西,防止范围蔓延:

- 不做多用户、不做鉴权、不做 SaaS 化
- 不做 Web 前端(CLI 优先;如 D3 有余力再考虑)
- 不做模型训练、微调、本地推理
- 不追求抽取质量的「学术级」准确率,只要求**可验证、可追溯、可量化**

### 1.4 硬约束

| 约束 | 内容 | 影响 |
|---|---|---|
| C1 | 工期 4 天,人力约 2–3 人 | 一切设计以「可并行、可裁剪」为前提 |
| C2 | 必须能用真实 LLM API | D1 10:00 前必须调通,这是最致命的外部依赖 |
| C3 | 现场演示环境不确定 | 必须有离线回放兜底 |
| C4 | 团队网络环境存在代理限制 | git/API 需显式配代理,见第 9.4 节 |
| C5 | 项目路径含空格(`C:\Users\ASUS\Desktop\hacthon pro`) | 所有脚本避免依赖未加引号的路径 |

---

## 2. 关键决策与待确认项

### 2.1 已决策(本文件生效即视为冻结)

| 编号 | 决策 | 理由 | 推翻成本 |
|---|---|---|---|
| D-01 | 主链路采用 **A-core**(论文检索 → 筛选 → 精读 → 综述产出),不采用 LabNotebook | A-core 覆盖的工具抽象、并行子 Agent、长文档上下文三项学习点最密集;综述产出是确定性输出,适合演示 | 高(全部工具要重写) |
| D-02 | **不实现**代码骨架生成、LaTeX 排版、引用图谱、多语言输出 | 均属质量不可控或演示无感,失败即毁现场 | 低(可后续追加) |
| D-03 | 语言 **TypeScript**,运行时 **Node 24** 直接执行 TS(类型剥离,免构建) | 类型系统对 tool_use 结构化解析收益最大;免构建省半天;形态与 Claude Code 一致 | 中 |
| D-04 | **不用** Ink/React 做终端 UI,用 `chalk` + 原生 stdout | 4 天周期里 UI 框架是纯负债 | 低 |
| D-05 | 知识存储层做成**可插拔接口**(`KnowledgeStore`),默认本地 Markdown 实现 | 见 2.3,这是化解 D-待确认 的关键设计 | 低 |
| D-06 | 每个抽取结果**必须带页码锚点**(`page`),无锚点信息不入库 | 无锚点的文本无法验证是否幻觉,整条链路失去可信度 | 高(数据要重跑) |
| D-07 | 演示兜底从 D1 就设计进工具层(`DEMO_MODE`),不是 D4 补录屏 | 网络与 API 额度是黑客松最常见的翻车点 | 低 |

### 2.2 待确认项(阻塞,需在 D1 12:00 前关闭)

| 编号 | 问题 | 为什么阻塞 | 未确认时的默认动作 |
|---|---|---|---|
| **Q1** | 比赛题目中的 **`kiwi` 是否指 [KiwiFS](https://github.com/kiwifs/kiwifs)**? | 若为硬性要求,知识存储必须直连 KiwiFS(Go 单二进制 + MCP);若是自主选型,则本地 Markdown 即可 | **默认按「自主选型」执行**,走 `LocalMarkdownStore`;`KiwiFSStore` 作为 P2 可选项 |
| **Q2** | LLM Provider 与额度(Anthropic / DeepSeek / 中转) | 决定 SDK、并发上限、单次运行预算 | 默认双 provider 可切换,`.env` 配置 |
| **Q3** | 演示形态:纯 CLI,还是需要网页 | 影响 D4 工时分配 | **默认纯 CLI** |

> **Q1 的处理方式是本文件最重要的设计取舍**:不把「是否用 KiwiFS」做成架构分支,而是做成**实现替换**(见 2.3)。这样 Q1 无论何时回答,主链路代码都不用改。

### 2.3 Q1 的化解设计:可插拔知识存储

```
                   ┌─────────────────────────┐
                   │   KnowledgeStore 接口    │  ← 全系统只依赖这一层
                   │  put / get / search / link │
                   └───────────┬─────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ↓                                     ↓
  ┌─────────────────────┐            ┌────────────────────────┐
  │ LocalMarkdownStore  │            │   KiwiFSStore (P2)     │
  │ · 输出 .md+frontmatter│           │ · 通过 MCP 调用         │
  │ · 本地全文检索         │           │ · 复用其 FTS5 / 图谱    │
  │ · 零外部依赖 ✅默认    │           │ · 需额外部署 Go 二进制   │
  └─────────────────────┘            └────────────────────────┘
        两者的产物格式保持兼容(同一套 frontmatter 字段),
        因此 LocalMarkdownStore 的产出可直接被 KiwiFS 导入。
```

**收益**:Q1 回答「是」→ 加一个 adapter 文件;回答「否」→ 什么都不用改。

---

## 3. 范围

### 3.1 v1.0 范围(必须交付)

```
输入:一个研究问题(例:"LLM 在低资源语言上的检索增强方法有哪些有效做法?")
  │
  ├─[1] 检索    ArxivSearchTool        → 20~30 篇候选(带本地缓存)
  ├─[2] 筛选    ScreeningTool          → 按纳入/排除标准留 8~12 篇,每篇记录理由
  ├─[3] 精读    PDFReadTool × N(子 Agent 并行)→ 每篇结构化为 PaperDoc
  ├─[4] 沉淀    KnowledgeStore.put     → 原子知识页(带页码锚点)
  └─[5] 汇总    SynthesisTool          → report.md + evidence.csv + prisma.md
  │
产出:out/report.md  out/evidence.csv  out/prisma.md  knowledge/*.md
```

### 3.2 明确不做(写进 README「未做范围」,主动交代优于被问出来)

| 不做 | 理由 |
|---|---|
| 代码骨架生成(`CodeScaffoldTool`) | 生成质量不可控,失败即毁 demo |
| LaTeX 排版 | 3 分钟内无人分辨 `.tex` 与 `.md` |
| 引用图谱(`CitationGraphTool`) | 增值低、API 成本高 |
| 多语言输出 | 锦上添花 |
| 完整 PDF 图表/表格精读 | 解析成功率方差太大(仅支持表格转 Markdown 的降级路径) |
| 网页界面 | CLI 优先;除非 Q3 明确要求 |
| 用户系统 / 鉴权 / 多租户 | 非目标 |

### 3.3 若工期超支的裁剪顺序(从上往下依次砍)

1. 砍知识沉淀层(FR-10)→ 退化为只产出报告
2. 砍子 Agent 并行(FR-8)→ 退化为单 agent 串行(精读将变慢)
3. 砍论文数量(30 → 10 篇)
4. **不砍**:工具抽象(FR-7)、主循环(FR-6)、离线回放(FR-11)

---

## 4. 用户与场景

### 4.1 角色

| 角色 | 描述 | 关心什么 |
|---|---|---|
| 研究者(主要用户) | 需要快速了解某领域现状的人 | 结论是否可信、能否追溯到原文页码 |
| 评委 / 观众 | 现场看演示的人 | 3 分钟内看懂「它在干什么」 |
| 开发者(团队成员) | 写代码的人 | 接口契约稳定、能并行、出错好查 |

### 4.2 核心用户故事

| 编号 | 故事 | 验收方式 |
|---|---|---|
| US-1 | 作为研究者,我输入一个问题,就能得到一份带证据表的综述初稿 | 运行 `node src/main.ts "问题"`,产出 3 个文件 |
| US-2 | 作为研究者,我看到的每条结论都能点回原文第几页 | 证据表每行有 `paperId + page` |
| US-3 | 作为观众,我能看到 agent 正在检索/筛选/精读哪一篇 | 终端实时打印每一步 |
| US-4 | 作为开发者,我新增一个工具只需要加一个文件 | 不改编排层即可注册生效 |
| US-5 | 作为演示者,网络断了我也能跑完整 demo | `DEMO_MODE=replay` 离线跑通 |

---

## 5. 功能需求

> 优先级:P0 = 不做则 demo 不成立;P1 = 里程碑内必须;P2 = 有余力再做。
> 每条需求都有验收标准,**未写验收标准的需求不允许进入开发**。

### FR-1 配置与环境 · P0

**描述**:从 `.env` 加载运行配置,启动时校验必填项,缺失立即失败并给出可操作的提示。

| 验收标准 | |
|---|---|
| AC-1.1 | 缺少必填项时报错信息包含「变量名 + 到哪填 + 示例」,而非堆栈 |
| AC-1.2 | 支持 provider 切换(anthropic / openai 兼容 / deepseek) |
| AC-1.3 | `.env` 不入库;`.env.example` 完整列出所有变量并标注必填 |

**依赖**:无

---

### FR-2 检索 `ArxivSearchTool` · P0

**描述**:按研究问题构造检索式,从 arXiv(优先官方 API/HTML,PDF 为降级)取回候选论文元数据。

| 验收标准 | |
|---|---|
| AC-2.1 | 输入 query,返回 20–30 条 `{paperId, title, authors, year, abstract}` |
| AC-2.2 | 响应本地缓存到 `fixtures/`,重复运行不重复请求(可被 `DEMO_MODE=replay` 命中) |
| AC-2.3 | 网络失败时指数退避重试 ≥ 2 次,最终失败返回结构化错误而非抛栈 |
| AC-2.4 | 单次调用耗时上限 30s,超时可控 |

---

### FR-3 筛选 `ScreeningTool` · P0

**描述**:按显式纳入/排除标准,把 20–30 篇压到 8–12 篇,并为每篇记录决策理由。

| 验收标准 | |
|---|---|
| AC-3.1 | 纳入/排除标准来自可配置参数,不硬编码 |
| AC-3.2 | 每篇产出 `{paperId, decision: include/reject, reason, matched_criteria}` |
| AC-3.3 | 决策理由进入 `out/evidence.csv`,可审计 |
| AC-3.4 | 筛选结果数落在 8–12 区间(超出则告警) |

**依赖**:FR-2

---

### FR-4 精读与抽取 `PDFReadTool` · P0

**描述**:把单篇论文解析为结构化 `PaperDoc`,并抽取原子知识页。

| 验收标准 | |
|---|---|
| AC-4.1 | 输出符合第 8.1 节 `PaperDoc` 类型定义 |
| AC-4.2 | **每个段落必须带 `page` 页码锚点**(硬要求,D-06) |
| AC-4.3 | 表格转为 Markdown 保留行列对应 |
| AC-4.4 | 输出 `parseQuality {pagesParsed, pagesTotal, hasOcr}`,解析率 < 0.7 的论文标记 `quarantined` 并不进入抽取队列 |
| AC-4.5 | `paperId` 稳定可推导:DOI / arXiv ID 优先,否则 `sha256(file)[:16]` |

**依赖**:FR-3

---

### FR-5 汇总与产出 `SynthesisTool` · P0

**描述**:聚合各篇抽取结果,产出三件交付物。

| 验收标准 | |
|---|---|
| AC-5.1 | `out/report.md`:分主题综述,每条论断带 `[paperId#p{N}]` 引用 |
| AC-5.2 | `out/evidence.csv`:列 `paperId,page,claim,method,dataset,metric,value,confidence` |
| AC-5.3 | `out/prisma.md`:含 Mermaid PRISMA 流程图,数字自洽(检索数-排除数=纳入数) |
| AC-5.4 | 报告结构与 CSV 内容一致,不出现表中没有的结论 |

**依赖**:FR-4

---

### FR-6 Agent 主循环 · P0

**描述**:仿 Claude Code `query.ts` 的实现:调 LLM → 解析 tool_use → 权限/校验 → 执行工具 → 结果回填 → 继续,直到模型不再请求工具。

| 验收标准 | |
|---|---|
| AC-6.1 | 支持流式输出,文本增量实时打印 |
| AC-6.2 | 单轮多个 tool_use 能被并发执行并正确回填 |
| AC-6.3 | 有 `MAX_TURNS` 上限,触顶时安全退出并保留已有产出 |
| AC-6.4 | 单个工具失败不中断主循环,错误结构化回填给模型,模型可自行换策略 |
| AC-6.5 | 全程 `AbortController` 可中断(Ctrl+C 立即停) |
| AC-6.6 | 每轮打印:轮次、模型思考摘要、调用的工具与参数摘要 |

---

### FR-7 工具抽象 · P0

**描述**:仿 Claude Code `Tool.ts`,统一的工具契约。

| 验收标准 | |
|---|---|
| AC-7.1 | 每个工具有 `name / description / inputSchema(JSON Schema) / call()` |
| AC-7.2 | `inputSchema` 由 `zod` 定义并自动转 JSON Schema,与运行时校验共用一份定义 |
| AC-7.3 | 新工具只需在 `src/tools/` 加一个文件 + 一行注册,不改编排层 |
| AC-7.4 | 每个工具可上报进度事件(供 UI 显示「正在处理第 3/12 篇」) |
| AC-7.5 | 工具返回统一 `ToolResult`,区分 `ok / recoverable_error / fatal_error` |

---

### FR-8 子 Agent 编排 · P1

**描述**:仿 `AgentTool/runAgent.ts`。子 agent 是「主循环的再实例化」,独立上下文 + 独立工具白名单。用于精读阶段的并行处理。

| 验收标准 | |
|---|---|
| AC-8.1 | 主 agent 可派发 N 个子任务,子 agent 拿到独立上下文,不污染主对话 |
| AC-8.2 | 子 agent 工具白名单可配置(精读 agent 不应能调检索工具) |
| AC-8.3 | 并发数可配置,默认 3,避免 API 限流 |
| AC-8.4 | 单个子 agent 失败不影响其余,失败项在最终报告中标注 |
| AC-8.5 | 子 agent 的 token 消耗汇总进运行报告 |

---

### FR-9 记忆 · P1

**描述**:仿 `memdir`。以文件形式持久化「已处理过什么」,跨运行复用,避免重复付费。

| 验收标准 | |
|---|---|
| AC-9.1 | 记忆为人类可读的 Markdown,含 frontmatter(paperId、处理时间、结论摘要) |
| AC-9.2 | 启动时加载并注入 system prompt |
| AC-9.3 | 已处理论文默认跳过,可用 `--force` 覆盖 |
| AC-9.4 | 可演示:第二次运行明显更快,且日志显示命中记忆 |

---

### FR-10 知识沉淀层 `KnowledgeStore` · P1

**描述**:把原子知识页写入可插拔存储(见 2.3)。**本需求与 Q1 解耦。**

| 验收标准 | |
|---|---|
| AC-10.1 | 定义 `KnowledgeStore` 接口:`put(note) / get(id) / search(query) / link(from,to,rel)` |
| AC-10.2 | `LocalMarkdownStore` 默认实现,产出 `knowledge/<paperId>/*.md`,带 frontmatter |
| AC-10.3 | frontmatter 字段与 KiwiFS 保持兼容(便于后续导入) |
| AC-10.4 | 支持按关键词检索已沉淀知识,并在汇总阶段被使用 |
| AC-10.5 | 切换存储实现只改一处配置,不动调用方 |
| AC-10.6 | `KiwiFSStore`(若 Q1 为「是」)通过 MCP 接入,列为 P2 |

---

### FR-11 可观测与回放 · P0

**描述**:让「出错可查、断网可演」。

| 验收标准 | |
|---|---|
| AC-11.1 | 每次运行产出 JSONL trace 到 `logs/`,记录每轮请求、工具调用、耗时、token |
| AC-11.2 | `DEMO_MODE=replay` 时所有外部调用从 `fixtures/` 回放,完全离线 |
| AC-11.3 | `DEMO_MODE=live` 时可选择性录制响应到 `fixtures/`(`--record`) |
| AC-11.4 | 运行结束打印汇总:总耗时、总 token、各工具调用次数、失败数 |

---

### FR-12 CLI 入口 · P0

**描述**:单命令入口。

| 验收标准 | |
|---|---|
| AC-12.1 | `node src/main.ts "<研究问题>"` 跑完整链路 |
| AC-12.2 | 参数:`--max-papers N`、`--force`、`--record`、`--dry-run` |
| AC-12.3 | 退出码语义:0 成功 / 1 失败 / 2 配置错误 |
| AC-12.4 | 提供 `scripts/demo.sh` 一键演示脚本 |

---

### FR-13 MCP 能力暴露 · P2

**描述**:把工具集以 MCP server 形态暴露,体现「开放生态」的学习点。仅在 D3 提前完成时启动。

| 验收标准 | |
|---|---|
| AC-13.1 | `stdio` 模式可被 MCP 客户端发现工具列表 |
| AC-13.2 | 至少 2 个工具可通过 MCP 被外部调用 |

---

### 需求依赖图

```
FR-1 配置 ─────────────┐
FR-6 主循环 ── FR-7 工具抽象 ──┬── FR-2 检索 ── FR-3 筛选 ── FR-4 精读 ── FR-5 汇总
                              │                              │
                              ├── FR-11 回放 ────────────────┤
                              ├── FR-8 子 Agent ─────────────┘
                              ├── FR-9 记忆
                              └── FR-10 知识沉淀 ── (FR-13 MCP)
FR-12 CLI 贯穿
```

---

## 6. 非功能需求

| 编号 | 类别 | 要求 | 验收方式 |
|---|---|---|---|
| NFR-1 | 可演示性 | 从冷启动到产出 ≤ 3 分钟;离线回放 ≤ 60 秒 | 计时实测 3 次 |
| NFR-2 | 成本 | 单次完整运行 token 成本有硬上限(`MAX_TOTAL_TOKENS`) | 运行结束打印实际消耗,超限即中止 |
| NFR-3 | 健壮性 | 任一外部依赖失败不导致进程崩溃 | 人为断网 / 改错 key 实测 |
| NFR-4 | 可复现性 | 同一输入 + `replay` 模式结果稳定 | 连跑 3 次 diff 一致 |
| NFR-5 | 可追溯性 | 结论可回指到 `paperId + page` 的比例 ≥ 95% | 抽样 20 条人工核对 |
| NFR-6 | 开发效率 | 免构建启动,改代码即生效;类型检查独立执行 | `node src/main.ts` 直接跑 |
| NFR-7 | 质量门禁 | CI 跑 `typecheck` + 单测 + 回放冒烟,总时长 < 90s | PR 上绿 ✔ |
| NFR-8 | 安全 | 仓库内无密钥;密钥仅存 `.env` | 提交前扫描 `gho_`/`sk-`/`api_key` |
| NFR-9 | 可理解性 | 终端输出能让非技术观众看懂当前在做什么 | 找一位非队员观看并复述 |

---

## 7. 系统架构

### 7.1 分层(与 Claude Code 的对应关系)

```
┌──────────────────────────────────────────────────────────────┐
│ ① 入口层   src/main.ts                                        │
│    CLI 参数解析 · 配置加载 · 启动编排                          │
│    ⇔ Claude Code: src/entrypoints/cli.tsx                     │
├──────────────────────────────────────────────────────────────┤
│ ② 交互层   src/ui/                                            │
│    流式输出 · 工具调用可视化 · 进度条(chalk + stdout)          │
│    ⇔ Claude Code: src/ink/ (我们用轻量实现,不上 React)        │
├──────────────────────────────────────────────────────────────┤
│ ③ 编排层 ★ src/agent/                                         │
│    loop.ts      主循环(调 LLM → 解析 → 执行 → 回填)          │
│    subagent.ts  子 Agent 派生                                  │
│    types.ts     冻结契约(全队只读)                            │
│    ⇔ Claude Code: src/query.ts + QueryEngine.ts + AgentTool/  │
├──────────────────────────────────────────────────────────────┤
│ ④ 工具层   src/tools/                                         │
│    registry.ts  工具注册表                                     │
│    search/ screening/ read/ synthesis/  ← 业务工具             │
│    ⇔ Claude Code: src/tools/*(40+ 工具的统一接口)             │
├──────────────────────────────────────────────────────────────┤
│ ⑤ 服务层   src/services/                                      │
│    llm/         provider 抽象 + 流式解析 + 重试               │
│    pdf/         PDF → PaperDoc                                │
│    knowledge/   KnowledgeStore 接口 + LocalMarkdown 实现 ★     │
│    trace/       JSONL 记录 + 回放                             │
│    cache/       fixtures 读写                                 │
│    ⇔ Claude Code: src/services/api, compact, extractMemories  │
├──────────────────────────────────────────────────────────────┤
│ ⑥ 状态与存储层                                                │
│    memory/      文件式记忆(memdir 风格)                       │
│    store/       知识页落盘                                    │
│    ⇔ Claude Code: src/memdir/                                 │
└──────────────────────────────────────────────────────────────┘
```

> ★ 标记的两处是全项目最需要先冻结的部分:③ 的 `types.ts` 与 ⑤ 的 `KnowledgeStore` 接口。

### 7.2 端到端数据流

```
用户问题
   │
   ▼
[FR-1 配置校验] ──失败──▶ 退出码 2
   │
   ▼
[FR-9 加载记忆] ──已处理过──▶ 跳过(可 --force 覆盖)
   │
   ▼
┌──────────────── FR-6 主循环 ────────────────┐
│  LLM 决策                                    │
│    │                                        │
│    ├─▶ FR-2 检索 ──→ 30 篇候选 ──▶ cache    │
│    ├─▶ FR-3 筛选 ──→ 10 篇 + 理由            │
│    ├─▶ FR-8 派发子 Agent(并发 3)          │
│    │      └─▶ FR-4 精读 ──▶ PaperDoc         │
│    │                   └─▶ FR-10 写入知识页   │
│    ├─▶ FR-5 汇总 ──→ 3 个交付物              │
│    └─▶ 无工具需求 ──▶ 结束                    │
└─────────────────────────────────────────────┘
   │
   ▼
[FR-11 打印汇总:耗时 / token / 工具调用数]
   │
   ▼
out/report.md · out/evidence.csv · out/prisma.md · knowledge/ · logs/
```

### 7.3 Agent 主循环(核心时序)

```
loop(messages):
  for turn in 1..MAX_TURNS:
    resp = llm.stream(messages, tools)        // 流式
    if resp.text: ui.print(resp.text)

    if resp.tool_calls is empty:
       return                                 // 正常收敛

    results = []
    for call in resp.tool_calls:              // 可并发
       tool = registry.get(call.name)
       if not tool: results += err("unknown tool")
       else:
         parsed = tool.inputSchema.validate(call.input)
         if not parsed.ok: results += err("invalid input")   // 回填给模型自纠
         else:
           results += await tool.call(parsed.data, ctx)      // 失败不抛,返回结构化错误

    messages += resp.tool_calls
    messages += results                        // 回填
  # 触顶
  ui.warn("达到 MAX_TURNS,输出已有结果")
```

**关键约束**:主循环**不允许** `throw` 到顶层。所有异常必须收敛成 `ToolResult.error` 或全局降级路径。

### 7.4 子 Agent 派生

```
主 agent ──派发(task, toolWhitelist)──▶ 子 agent
                                          │ 独立 messages / 独立 token 预算
                                          │ 只暴露白名单工具
                                          ▼
                          ◀──返回 {result, tokens, status}──
```

- 子 agent **不共享**主对话上下文(避免上下文污染)
- 子 agent 结果以**结构化摘要**回填主对话,不放全文
- 这是「主循环的再实例化」:复用同一 `loop()`,不同参数

### 7.5 借鉴点对照表(用于 README 与答辩)

| Claude Code 机制 | 我们的实现 | 验收位置 |
|---|---|---|
| `Tool.ts` 统一工具接口 | `src/tools/types.ts` + zod→JSON Schema | AC-7.1~7.5 |
| `query.ts` 主循环 | `src/agent/loop.ts` | AC-6.1~6.6 |
| `AgentTool/runAgent.ts` 子 Agent | `src/agent/subagent.ts` | AC-8.1~8.5 |
| `services/compact/` 上下文压缩 | 分段精读 + 摘要(降级为分段,见 8.5) | AC-6.3 |
| `memdir/` 文件式记忆 | `src/state/memory/` | AC-9.1~9.4 |
| `services/mcp/` 动态工具发现 | `src/tools/registry.ts` + FR-13 | AC-13.1~13.2 |

---

## 8. 核心设计

### 8.1 数据模型

```ts
// ---------- 论文底座(全系统最基础的契约)----------
type PaperDoc = {
  paperId: string              // 稳定 ID:DOI / arXiv ID,否则 sha256(file)[:16]
  title: string
  authors: string[]
  year: number
  venue?: string
  abstract: string
  sections: Array<{
    heading: string
    level: number
    paragraphs: Array<{ text: string; page: number }>   // ★ page 必填
    tables: Array<{ caption: string; markdown: string; page: number }>
    figures: Array<{ caption: string; page: number }>
  }>
  references: Array<{ raw: string; doi?: string; arxivId?: string }>
  parseQuality: { pagesParsed: number; pagesTotal: number; hasOcr: boolean }
}

// ---------- 原子知识页(沉淀层的基本单位)----------
type AtomicNote = {
  noteId: string               // `${paperId}#p${page}#${hash(claim).slice(0,6)}`
  paperId: string
  page: number                 // ★ 页码锚点,不可为空
  kind: 'claim' | 'method' | 'result' | 'limitation' | 'definition'
  text: string                 // 一个论断,不跨主题
  method?: string
  dataset?: string
  metrics?: Array<{ name: string; value: string }>
  confidence: 'high' | 'medium' | 'low'
  evidence: { quote: string; page: number }
}

// ---------- 方法 → 工具(预留,对应队友方案的 B 层)----------
type MethodTool = {
  methodId: string
  paperId: string
  name: string
  params: Array<{ name: string; type: string; required: boolean }>
  preconditions: string[]
  evidencePage: number
}

// ---------- 运行追踪 ----------
type RunTrace = {
  runId: string
  question: string
  startedAt: string
  turns: number
  tokens: { input: number; output: number }
  toolCalls: Array<{ name: string; ms: number; status: 'ok' | 'error' }>
  failures: Array<{ stage: string; paperId?: string; message: string }>
}
```

**三条数据铁律**:
1. 无 `page` 锚点的信息不得进入沉淀层。
2. 无 `paperId` 的产出不得进入交付物。
3. `parseQuality.pagesParsed / pagesTotal < 0.7` 的论文标记 `quarantined`,不参与抽取。

### 8.2 接口契约(两个冻结文件)

```ts
// ===== src/tools/types.ts ===== 全队只读,改它要过评审
export type ToolResult =
  | { kind: 'ok'; data: unknown; summary: string }
  | { kind: 'recoverable_error'; message: string; hint?: string }
  | { kind: 'fatal_error'; message: string }

export interface Tool<In = unknown> {
  name: string                                  // 唯一, snake_case
  description: string                           // 给模型看的,决定它会不会用
  inputSchema: JsonSchema                       // 由 zod 转出
  call(input: In, ctx: ToolContext): Promise<ToolResult>
}

export interface ToolContext {
  signal: AbortSignal                           // 中断
  onProgress?: (e: { step: string; done: number; total: number }) => void
  trace: TraceWriter                            // 写 JSONL
  cache: Cache                                  // fixtures 读写
  mode: 'live' | 'replay'
}

// ===== src/services/knowledge/types.ts ===== 可插拔存储契约
export interface KnowledgeStore {
  put(note: AtomicNote): Promise<void>
  get(noteId: string): Promise<AtomicNote | null>
  search(query: string, limit?: number): Promise<AtomicNote[]>
  link(from: string, to: string, rel: 'supports' | 'contradicts' | 'extends'): Promise<void>
}
```

### 8.3 存储布局

```
out/                          # 交付物(入库可,便于回看)
  report.md
  evidence.csv
  prisma.md
  run-<runId>.json            # RunTrace 摘要

knowledge/                    # 知识沉淀(入库)
  <paperId>/
    meta.md                   # frontmatter + 论文级摘要
    notes.md                  # 原子知识页,锚点引用
    _index.json

fixtures/                     # 回放数据(必须入库)
  arxiv_<query-hash>.json
  pdf_<paperId>.txt

logs/                         # 运行 trace(不入库)
  <runId>.jsonl

data/                         # 大文件/真实数据集(不入库,仅 README 与 fixtures 例外)
```

### 8.4 错误与降级策略

| 故障 | 处理 | 用户可见行为 |
|---|---|---|
| LLM 429 / 超时 | 指数退避重试 2 次 → 切换备用 provider → 失败则中止并保留产出 | 打印「已重试 2 次,切换 provider」 |
| 单篇 PDF 解析失败 | 标记 `quarantined`,跳过,计入失败清单 | 终态报告标注「3 篇解析失败,未纳入」 |
| 单个工具抛异常 | 收敛为 `recoverable_error` 回填模型 | 模型可自行换策略 |
| 检索无结果 | 提示放宽检索式,中止链路 | 明确的下一步建议 |
| 子 agent 超时 | 该篇跳过,不阻塞其他 | 并发进行,最后汇总失败项 |
| 触顶 `MAX_TURNS` | 安全退出,输出当前已有结果 | 「已达轮次上限,以下为部分结果」 |

**总原则**:任何情况下进程**不得崩溃**,必须产出一个「部分结果 + 失败说明」。

### 8.5 上下文与成本控制

不实现完整的 `compact`(自动摘要历史),采用更简单可靠的三条策略:

1. **单篇精读隔离**:每篇 PDF 在子 agent 的独立上下文里处理,主上下文只收结构化摘要(这是最有效的省 token 手段)。
2. **分段 + 局部摘要**:单篇超长时按章节分段抽取,再合并,不把全文塞进一次请求。
3. **预算硬闸**:`MAX_TOTAL_TOKENS` 触发时中止并输出已有结果。

### 8.6 权限与安全

本项目**不实现** Claude Code 那套交互式权限确认(单人本地运行,无需)。但保留三点:

- 工具白名单机制(子 agent 只能调授权工具)—— 这是权限模型的雏形
- 文件写入限定在 `out/`、`knowledge/`、`logs/`、`fixtures/` 四个目录
- 密钥只从环境变量读取,不落盘、不入库、不进 trace 日志

---

## 9. 技术选型

### 9.1 依赖清单

| 类别 | 选型 | 理由 |
|---|---|---|
| 语言 | TypeScript | tool_use 结构化解析与 JSON Schema 的类型安全收益最大 |
| 运行时 | Node 24(直接跑 `.ts`) | 免构建,省半天;限制:不能用 `enum`/`namespace`,import 需带扩展名 |
| 包管理 | npm(**不混用 pnpm**) | 团队最熟,少一个争论点 |
| LLM | `@anthropic-ai/sdk`(主)+ OpenAI 兼容(备) | 只用作 API 客户端,agent 逻辑全自研 |
| 校验 | `zod` + `zod-to-json-schema` | 一处定义,同时产出 JSON Schema 与运行时校验 |
| PDF | `pdfjs-dist` 或 `unpdf`;arXiv 优先官方 HTML/元数据 API | PDF 解析只作降级路径,质量方差太大 |
| 终端 | `chalk` | 最小化;不上 Ink/React |
| 测试 | `node:test` | 零配置,`node --test` |
| 日志 | 自写 JSONL | 比日志库更适合回放与演示 |

### 9.2 明确不引入

- ❌ 任何 Agent 框架(LangChain / AutoGen / Vercel AI SDK 的 agent 层)
- ❌ 数据库 / 向量库(4 天内本地 Markdown + 关键词检索足够)
- ❌ ORM、DI 容器、状态管理库
- ❌ UI 框架(Ink / React / TUI 库)
- ❌ 格式化门禁(eslint 可装但不作为 CI 阻塞项)

### 9.3 环境变量约定

见 `.env.example`。核心变量:`LLM_PROVIDER`、`*_API_KEY`、`*_MODEL`、`MAX_TURNS`、`MAX_TOTAL_TOKENS`、`REQUEST_TIMEOUT_MS`、`DEMO_MODE`、`FIXTURES_DIR`、`TRACE_DIR`。

### 9.4 已知环境约束(实测)

| 约束 | 现象 | 处理 |
|---|---|---|
| 代理 | 命令行工具不读 Windows 系统代理,直连 `github.com:443` 超时 21s | 显式 `git config http.proxy` / 设 `HTTPS_PROXY` |
| 路径含空格 | `credential.helper` 的路径参数被截断 | 凭据写在 remote URL;脚本路径加引号 |
| 换行符 | Windows/macOS 混用导致满屏 diff | 已配 `.gitattributes`(`* text=auto eol=lf`) |

---

## 10. 目录结构

```
hackathon-agent/
├── src/
│   ├── main.ts                    # ① 入口
│   ├── ui/
│   │   ├── stream.ts              #   流式输出
│   │   └── progress.ts            #   工具调用可视化
│   ├── agent/                     # ③ 编排层(★契约在此)
│   │   ├── types.ts               #   ★ 冻结契约:Message / ToolCall / RunTrace
│   │   ├── loop.ts                #   主循环
│   │   └── subagent.ts            #   子 Agent 派生
│   ├── tools/                     # ④ 工具层
│   │   ├── types.ts               #   ★ 冻结契约:Tool / ToolContext / ToolResult
│   │   ├── registry.ts            #   注册表
│   │   ├── search/arxiv.ts        #   FR-2
│   │   ├── screening/index.ts     #   FR-3
│   │   ├── read/pdf.ts            #   FR-4
│   │   └── synthesis/index.ts     #   FR-5
│   ├── services/                  # ⑤ 服务层
│   │   ├── llm/{provider.ts,stream.ts,retry.ts}
│   │   ├── pdf/{parse.ts,quality.ts}
│   │   ├── knowledge/{types.ts,localMarkdown.ts,kiwifs.ts(可选)}
│   │   ├── trace/{writer.ts,replay.ts}
│   │   └── cache/fixtures.ts
│   └── state/
│       └── memory/index.ts        # ⑥ 文件式记忆
├── scripts/
│   └── demo.sh                    # FR-12 一键演示
├── fixtures/                      # 回放数据(入库)
├── knowledge/                     # 知识沉淀(入库)
├── out/                           # 交付物
├── data/                          # 大文件(仅 README 与 fixtures 入库)
├── logs/                          # 运行 trace(不入库)
├── docs/
│   ├── SRS.md                     # 本文件
│   ├── PLAN.md                    # 四天计划
│   ├── DECISIONS.md               # 决策日志(待建)
│   ├── wyh/                       # 队友方案文档
│   └── reference/
│       └── claude-code-architecture.md
├── .github/                       # Issue / PR 模板 + CI
├── .env.example
└── package.json / tsconfig.json
```

**边界规则**:
- `agent/` 不知道具体工具实现,只认 `tools/types.ts` 接口
- `tools/` 不知道 LLM 存在,只认 `ToolContext`
- `services/` 不 import `agent/`,保持底层可单测
- 冻结契约文件(`agent/types.ts`、`tools/types.ts`、`knowledge/types.ts`)改动需 PR + 1 人 approve

---

## 11. 里程碑与交付

### 11.1 时间盒(四个硬检查点,过不了就降级)

| 时点 | 检查项 | 未通过的动作 |
|---|---|---|
| **D1 10:00** | 每人用自己的 key 成功调通一次 LLM API | 立刻换 provider(最致命的外部依赖) |
| **D1 12:00** | 选题与范围确认(本文档第 2、3 章签字)+ 契约文件合入 main | **默认按 D-01/2.2 默认值执行**,不再讨论 |
| **D2 17:00** | 3 个工具中至少 2 个能对真实数据返回结果 | 砍子 Agent(FR-8),退化为单 agent 串行 |
| **D3 17:00** | `scripts/demo.sh` 一条命令产出终稿 | 冻结新功能,全部人力转 demo 稳定性 |

### 11.2 里程碑与交付物

| 里程碑 | 目标 | 交付物 | 对应需求 |
|---|---|---|---|
| **M1 · 骨架**(D1) | 主循环跑通一轮 | `main.ts` + `loop.ts` + `types.ts` + 一个 demo 工具 + CLI 可见过程 | FR-1/6/7/12 |
| **M2 · 核心能力**(D2) | 真实工具可用 | 检索/筛选/精读三工具 + 子 Agent + 记忆 + 回放模式 | FR-2/3/4/8/9/11 |
| **M3 · 端到端**(D3) | 链路贯通 | 汇总产出三件套 + 知识沉淀 + 固定样例 + 代码冻结 | FR-5/10 |
| **M4 · 交付**(D4) | 可演示 | demo 脚本 + 3 分钟录屏 + README/幻灯片 + 仓库清理 | 全部 |

### 11.3 D1 第一小时 checklist

```
0) 环境自检      node -v(需 ≥22.18) / git 代理 / API key 连通性
1) 修仓库        .gitignore 已修(F3 ✅)/ .env.example 已建(F7 ✅)
2) 写契约        tools/types.ts → agent/types.ts → knowledge/types.ts
3) 写循环        loop.ts + FakeLLM 单测
4) 验证一轮      真实 API 调用一次,打印 tool_use
```

---

## 12. 验收标准(量化)

| 编号 | 指标 | 阈值 | 测量方法 |
|---|---|---|---|
| A-1 | 端到端成功率 | 连续 3 次全成功 | 直接跑 3 次 |
| A-2 | 端到端耗时(live) | ≤ 3 分钟 | 计时 |
| A-3 | 端到端耗时(replay) | ≤ 60 秒 | 计时 |
| A-4 | 引用可追溯率 | ≥ 95% | 抽 20 条论断人工核对页码 |
| A-5 | 证据表行数 | ≥ 30 行 | 统计 CSV |
| A-6 | 解析合格率 | `pagesParsed/pagesTotal ≥ 0.7` 的论文 ≥ 80% | 运行报告 |
| A-7 | 单次运行 token 成本 | ≤ `MAX_TOTAL_TOKENS` | 运行汇总打印 |
| A-8 | 断网可用性 | `replay` 模式全程无网络请求 | 断网实测 |
| A-9 | 新工具接入成本 | 新增 1 个工具 ≤ 30 分钟且不改编排层 | 实测计时 |
| A-10 | CI 时长 | < 90s | Actions 页面 |

**答辩时最该报的两个数**:`引用可追溯率`(A-4)与 `单次成本`(A-7)——前者证明不是幻觉,后者证明工程可控。

---

## 13. 风险登记册

| ID | 风险 | 概率 | 影响 | 触发信号 | 应对 |
|---|---|---|---|---|---|
| R-1 | 选题/范围反复摇摆 | 中 | 高 | D1 12:00 仍未定 | 按 2.2 默认值自动执行,不再开会 |
| R-2 | LLM API 不稳 / 额度不足 | 中 | 高 | D1 10:00 调不通或频繁 429 | 双 provider;`replay` 兜底 |
| R-3 | PDF 解析质量不可控 | **高** | 中 | `parseQuality < 0.7` 比例高 | arXiv HTML 优先;`quarantined` 隔离 |
| R-4 | 抽取幻觉 | **高** | 高 | 抽查发现无锚点结论 | D-06 硬约束 + A-4 量化抽查 |
| R-5 | 长文档撑爆上下文 | 中 | 中 | 单篇即超限 | 8.5 的三条策略 |
| R-6 | 并行开发撞车 | 中 | 中 | 频繁 merge 冲突 | 文件级分工 + 契约先冻结 |
| R-7 | 现场网络故障 | 中 | 高 | — | `DEMO_MODE=replay` + 录屏 |
| R-8 | 范围蔓延(想加功能) | **高** | 中 | D3 还想加东西 | 第 3.2 节「明确不做」+ 代码冻结线 |
| R-9 | 队友环境配置耗时 | 中 | 低 | 有人 D2 还跑不起来 | 用 `replay` 模式让新人零配置参与 |

---

## 14. 附录

### 14.1 术语表

| 术语 | 含义 |
|---|---|
| **A-core** | 本项目的范围定义:检索→筛选→精读→汇总,砍掉代码生成与排版 |
| **PaperDoc** | 论文的结构化产物,带页码锚点,是全系统基础契约 |
| **AtomicNote** | 原子知识页:一个论断一页,必须带 `page` |
| **锚点(locator)** | `paperId + page` 组成的可回指坐标 |
| **quarantined** | 解析质量不合格的论文,被隔离不参与抽取 |
| **replay** | 从 `fixtures/` 回放外部响应,完全离线 |
| **冻结契约** | 全队只读的接口文件,改动需评审 |
| **子 Agent** | 主循环的再实例化,独立上下文 + 工具白名单 |

### 14.2 待确认问题清单(Q1 关闭后本文件转 v1.1)

| 编号 | 问题 | 谁回答 | 期限 |
|---|---|---|---|
| Q1 | `kiwi` 是否指 KiwiFS? | 项目负责人 | D1 12:00 |
| Q2 | LLM provider 与额度 | 项目负责人 | D1 10:00 |
| Q3 | 演示形态:CLI 还是网页 | 项目负责人 | D1 12:00 |
| Q4 | 团队分工(谁负责哪块) | 项目负责人 | D1 12:00 |
| Q5 | `B1eberz` 是否参与开发 | 项目负责人 | D1 |

### 14.3 变更记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| v1.0 | 2026-10-27 | 首次综合成文:合并参考文档、PLAN.md 与 wyh 三份文档;以可插拔 KnowledgeStore 化解 A-core / KiwiFS 路线冲突 | — |

**变更规则**:新增需求必须回答「砍掉哪个同等工作量的需求作为交换」。不接受纯增量。
