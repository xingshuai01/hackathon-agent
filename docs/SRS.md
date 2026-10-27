# 需求说明书(Software Requirements Specification)

| 项 | 值 |
|---|---|
| 项目代号 | `hackathon-agent` |
| 文档版本 | **v2.0**(方向修正版,替代 v1.0) |
| 编写日期 | 2026-10-27 |
| 文档状态 | 待评审 —— 第 2.2 节 3 个待确认项需关闭 |
| 目标读者 | 全体开发成员、评审、答辩准备 |
| 唯一功能基线 | 开发期间所有功能取舍以本文件为准 |

## ⚠️ v2.0 与 v1.0 的根本差异(请先读)

| 项 | v1.0(已作废) | **v2.0(当前)** |
|---|---|---|
| 产品定义 | 一个产出综述报告的论文 Agent(A-core) | **一个科研 Agent,它的创新点/卖点是三个科研领域模块** |
| 核心交付 | `report.md` + `evidence.csv` + `prisma.md` | **知识库 + 工具库 + 技能库** 三层沉淀资产 |
| 综述报告 | 是最终产物 | 降级为**演示手段之一** |
| 架构重心 | 单条检索→筛选→精读→综述流水线 | **「沉淀」与「消费」两个方向的闭环** |

**修正原因**:v1.0 误把「三个模块」当成了「一条流水线的三个步骤」,于是只保留最后一步的产物。实际需求是三个模块各自都是产品的卖点,必须都能被单独展示。

> **命名假设(需确认)**:第 2.2 节 Q0。本文件按「知识库 / 工具库 / 技能库」三分。若第三项的准确名称不同,只需重命名章节标题,不影响设计。

---

## 1. 背景与目标

### 1.1 项目背景

团队参加为期 **4 天**的黑客松,定位**偏工程**,目标包含两层:

1. **交付层**:做出一个**科研 Agent**,并把它区别于普通 Agent 的三个创新模块做出来、能演示。
2. **学习层**:通过亲手实现理解 Agent 架构核心机制(工具抽象、主循环、子 Agent、记忆、上下文管理),不使用现成 Agent 框架。

### 1.2 产品定位:一句话

> **一个会"长大"的科研 Agent。**
> 你给它一堆同领域论文,它不只是回答问题,而是把论文**沉淀成三类可复用资产**:记住了什么(知识库)、能做什么(工具库)、该怎么判断(技能库);下次遇到同类任务,它直接用这些资产干活,而不是从头读一遍。

### 1.3 创新点:三个科研领域模块

```
┌───────────────────────────────────────────────────────────────┐
│  科研 Agent(主产品:主循环 / 工具调度 / 子 Agent / 记忆)      │
└───────────────┬───────────────────────────────────────────────┘
                │  三个创新模块 = Agent 的「能力沉淀层」
     ┌──────────┼──────────────┬───────────────────┐
     ▼          ▼              ▼                   │
┌─────────┐ ┌─────────┐ ┌─────────────┐            │
│A 个人   │ │B 工具库 │ │C 技能库     │            │
│知识库   │ │         │ │             │            │
│「记什么」│ │「能做什么」│「该怎么判断」│            │
│         │ │         │ │             │            │
│原子知识页│ │方法→可执 │ │领域流程+判据│            │
│带页码锚点│ │行工具    │ │+失败模式    │            │
│可检索   │ │MCP 暴露  │ │按需加载     │            │
└─────────┘ └─────────┘ └─────────────┘            │
     │          │              │                   │
     └──────────┴──────────────┴───────────────────┘
                │
     ┌──────────▼──────────────────────────────────┐
     │  共享底座:文献/PDF → PaperDoc(带页码锚点)  │
     └─────────────────────────────────────────────┘
```

**三层用一句话区分**:

| 模块 | 沉淀什么 | 载体 | 一句话 |
|---|---|---|---|
| **A 知识库** | 事实与论断(可引用) | Markdown 知识页 + frontmatter | 记「**是什么**」 |
| **B 工具库** | 可执行动作(有契约) | TS 工具 + MCP server | 做「**怎么做**」 |
| **C 技能库** | 判断力(何时用哪个) | Skill 文件(Markdown + frontmatter) | 判「**该做什么**」 |

### 1.4 目标(Goals)

| 编号 | 目标 | 可验证的达成标准 |
|---|---|---|
| G1 | 三个模块都能被**单独演示** | 每个模块有独立的 demo 命令与产物 |
| G2 | 三个模块**串成一条闭环** | 一条命令:论文进 → 三类资产出 → 任务被完成 |
| G3 | Agent 内核自研 | 工具抽象/主循环/子 Agent/记忆均为本仓库代码 |
| G4 | 可现场演示且不怕断网 | `DEMO_MODE=replay` 离线跑完整链路 |
| G5 | 讲得清"创新点在哪" | README 能说明三个模块相对于普通 RAG / 普通 Agent 的增量 |

### 1.5 非目标

- 不做多用户 / 鉴权 / SaaS
- 不做模型训练 / 微调 / 本地推理
- 不做通用领域(只做科研领域,不追求跨领域泛化)
- 不追求抽取的"学术级"准确率,只要求**可验证、可追溯、可量化**

### 1.6 硬约束

| 编号 | 约束 | 影响 |
|---|---|---|
| C1 | 4 天工期,2–3 人 | 必须走**纵向薄切片**,不能三个模块各做深 |
| C2 | 必须有真实 LLM API | D1 10:00 前调通,最致命的外部依赖 |
| C3 | 现场网络不确定 | 必须离线回放兜底 |
| C4 | 团队网络有代理限制 | 见第 9.4 节 |
| C5 | 项目路径含空格 | 脚本路径一律加引号 |

---

## 2. 关键决策与待确认项

### 2.1 已决策(本文件生效即冻结)

| 编号 | 决策 | 理由 | 推翻成本 |
|---|---|---|---|
| **D-01** | 产品是**科研 Agent + 三个创新模块**,不是"综述报告生成器" | 客户需求原文 | — |
| **D-02** | 三个模块必须**各自可独立演示**,同时能串成闭环 | 三个都是"卖点",缺一不可 | 高 |
| **D-03** | 走**纵向薄切片**:每层只做最小可用,优先保证三层贯通 | 4 天做不完三个完整模块 | 中 |
| **D-04** | **B 工具库分级**:只承诺 L1(方法选型+参数填充),L2(多步 DSL)带人工确认做,L3(自动生成分析代码)**不做** | 论文方法描述 → 可执行代码存在语义鸿沟,成功率不可控 | 低 |
| **D-05** | **C 技能库必须人工审核**后才入库 | 技能是长期资产,错误的技能会持续污染 agent 判断 | 低 |
| **D-06** | 知识库存储做成**可插拔接口**(`KnowledgeStore`),默认本地 Markdown | 化解 Q1 不确定性 | 低 |
| **D-07** | 所有抽取信息**必须带页码锚点** `paperId + page`,无锚点不入库 | 无锚点 = 无法验证幻觉 = 全链路失去可信度 | 高 |
| **D-08** | 语言 **TypeScript** + Node 24 直接跑 TS(免构建) | 类型系统对 tool_use 解析收益最大;省半天 | 中 |
| **D-09** | 终端用 `chalk` + 原生 stdout,**不用** Ink/React | 4 天内 UI 框架是负债 | 低 |
| **D-10** | 演示兜底从 D1 就设计(`DEMO_MODE`),不是 D4 补录屏 | 网络/额度是黑客松最常见翻车点 | 低 |
| **D-11** | **交付形态为 Web(可视化界面)**,CLI 保留为备用与调试入口 | 科研 Agent 的目标用户是研究者而非工程师,纯 CLI 等于砍掉一半用户群;且三模块的「资产增长」必须看得见,这是创新点的呈现方式 | 中 |
| **D-12** | **Web 必须是薄壳**:Web 层不得实现任何业务逻辑,只消费核心层事件流 | 否则 4 天内必然出现两套逻辑,且 Web 出 bug 会连带核心不可用。薄壳保证 CLI 永远是可用兜底 | 高 |
| **D-13** | CLI 与 Web **共用同一事件总线**,仅渲染器不同 | 一处定义事件,两种展示;新增渲染器=加文件而非改逻辑 | 中 |
| **D-14** | Web 层**零构建、零前端框架**:单页 HTML + 原生 JS + SSE | 4 天内 Vite/React 是纯负债;不引入构建链就没有构建失败风险 | 低 |

### 2.2 待确认项

| 编号 | 问题 | 阻塞什么 | 期限 | 未确认时的默认 |
|---|---|---|---|---|
| **Q0** | 三个模块的准确名称是否为「个人知识库 / 工具库 / 技能库」? | 文档措辞、Issue 标题 | D1 10:00 | 按本文件命名执行 |
| **Q1** | 知识库底层 `kiwi` 类产品是否指 **KiwiFS**,还是只要求"RAG 式私有知识库"的自研实现? | 决定是否引入 Go 二进制 + MCP | D1 12:00 | **自研 `LocalMarkdownStore`**;`KiwiFSStore` 列 P2 |
| **Q2** | LLM Provider 与额度 | SDK 选型、并发上限、成本 | D1 10:00 | 双 provider 可切换 |

### 2.3 Q1 的化解设计:可插拔知识存储

```
                  ┌──────────────────────────────┐
                  │   KnowledgeStore 接口        │ ← 全系统只依赖这层
                  │   put / get / search / link  │
                  └──────────────┬───────────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              ▼                                     ▼
   ┌────────────────────────┐        ┌──────────────────────────┐
   │ LocalMarkdownStore     │        │ KiwiFSStore (P2)         │
   │ · .md + frontmatter    │        │ · MCP 调用 KiwiFS        │
   │ · 关键词/FTS 检索       │        │ · 复用其 FTS5 + 图谱     │
   │ · 零外部依赖 ✅ 默认    │        │ · 需部署 Go 单二进制     │
   └────────────────────────┘        └──────────────────────────┘
        产物格式(frontmatter 字段)保持兼容 → 本地产出可直接导入 KiwiFS
```

**收益**:Q1 答"是" → 加一个 adapter 文件;答"否" → 零改动。

---

## 3. 范围

### 3.1 v1.0 范围:三个模块的"最小可用" + 一条闭环

**核心演示叙事**:

> 「10 篇同领域论文进来 → 自动长出 知识的页 / 3 个工具 / 1 个技能 → 然后提一个科研任务,Agent 加载技能、调用工具、引用知识页完成它。」

| 模块 | v1.0 最小范围 | 明确不做 |
|---|---|---|
| **A 个人知识库** | 单库;10 篇论文;原子知识页(带页码);关键词检索;backlink 关联 | 向量检索(可选)、知识图谱可视化、多库/多空间 |
| **B 工具库** | L1 级:从论文抽出方法 → 生成**参数化工具**,至少 3 个可执行并跑通 smoke test;MCP 暴露 2 个 | L2 多步 DSL(带人工确认可选)、L3 自动生成分析代码 |
| **C 技能库** | 1 个完整技能(七节结构),从知识页聚合 + 人工审核,按需加载 | 多技能自动选择、技能自动迭代优化 |
| **共享底座** | arXiv 元数据优先 / PDF 降级;`PaperDoc` 带页码锚点;解析质量门控 | OCR、公式转写、图表深度解析 |
| **Agent 内核** | 主循环 + 工具抽象 + 子 Agent(并发 3)+ 文件式记忆 + 回放 | 权限交互确认、远程 agent、多租户 |

### 3.2 两个方向的闭环(本产品的核心设计)

```
【沉淀方向】论文 → 资产
  论文 PDF/元数据
      ↓ 共享底座(FR-D)
   PaperDoc(带页码锚点)
      ├──▶ A 知识库:原子知识页(一个论断一页)
      │        └──▶ 聚合成 C 技能库的「领域地图 / 证据索引」
      └──▶ B 工具库:方法 → 参数化工具(带证据页码)

【消费方向】任务 → 复用资产
  科研任务
      ↓ Agent 判断(加载哪个技能)
  C 技能库:拿到「标准流程 + 判据 + 失败模式 + 工具映射」
      ↓ 按流程执行
  B 工具库:调用具体工具
      ↓ 需要依据时
  A 知识库:检索知识页 → 引用 paperId + page
      ↓
  交付物 + 新沉淀(反哺)
```

**这个双向闭环就是创新点的技术表达**,答辩时用这张图讲。

### 3.3 工期超支时的裁剪顺序(从上往下砍)

> ⚠️ **因为新增了 Web(D-11),裁剪顺序已调整。Web 与三个模块不可砍,它们就是卖点。**

1. 砍 **子 Agent 并行**(FR-D4)→ 精读改串行(增加耗时,但功能不缺)
2. 砍 **技能自动生成**(FR-C2)→ 手工编写 1 个技能(技能库仍可完整演示)
3. 砍 **工具库到 2 个工具**(FR-B2)→ 1 个真实 + 1 个 mock
4. 砍 **论文数量 10 → 5 篇**
5. 砍 **Web 的 B 模块面板**交互细节(保留只读展示)
6. **不可砍**:共享底座的页码锚点、A 知识库检索、Agent 主循环、离线回放、**Web 三面板**

---

## 4. 用户与场景

### 4.1 角色

| 角色 | 关心什么 |
|---|---|
| 研究生 / 研究者(主要用户) | 我的领域知识能不能沉淀下来、下次不用重读 |
| 评委 / 观众 | 3 分钟内看懂"它和普通 Agent 差在哪" |
| 开发者(团队) | 契约稳定、能并行、出错好查 |

### 4.2 核心用户故事

| 编号 | 故事 | 验收 |
|---|---|---|
| US-1 | 我丢 10 篇论文进去,它自动建出可检索的知识库 | `bun/npm run ingest` → `knowledge/` 有产物,能检索 |
| US-2 | 我看到的每一条知识都能点回原文第几页 | 知识页每条带 `paperId + page` |
| US-3 | 它把论文里的方法变成了我能直接调用的工具 | 工具库有 ≥3 个工具,`--smoke` 全绿 |
| US-4 | 它知道这类任务该按什么流程做、容易在哪翻车 | 技能文件含「标准流程 / 失败模式 / 判据」三节 |
| US-5 | 我提一个任务,它自己选技能、调工具、引用知识完成 | 一条命令产出交付物,并被引用到知识页 |
| US-6 | 网络断了我也能演示 | `DEMO_MODE=replay` 离线跑通 |

---

## 5. 功能需求

> 优先级:P0 = 不做则 demo 不成立;P1 = 里程碑内必须;P2 = 有余力再做。
> 每条必须有可测验收标准;无验收标准的需求不允许开发。

---

### FR-A 个人知识库 · 三个创新模块之一

#### FR-A1 原子知识页生成 · P0

**描述**:把一篇论文拆成「一个论断一页」的原子知识页,而不是按 token 机械切片。

> **为什么强调原子化**:按固定 token 切会把一篇论文炸成上百个碎片,单页失去主语、引用断链。原子页以「一个可独立引用的论断」为单位。

| 验收标准 | |
|---|---|
| AC-A1.1 | 单篇论文产出 5–20 个原子知识页,每页只含一个论断 |
| AC-A1.2 | 每页必带 `paperId` 与 `page`,缺任一则拒绝入库 |
| AC-A1.3 | 每页标注 `kind`:`claim / method / result / limitation / definition` |
| AC-A1.4 | 每页含 `evidence.quote`(原文摘句)+ `evidence.page` |
| AC-A1.5 | 建立与来源论文的双向链接(backlink) |

#### FR-A2 知识页存储与格式 · P0

| 验收标准 | |
|---|---|
| AC-A2.1 | 落盘为 `knowledge/<paperId>/notes.md`,含 YAML frontmatter |
| AC-A2.2 | frontmatter 字段:`noteId / paperId / page / kind / confidence / created_at` |
| AC-A2.3 | 产物为纯 Markdown,人类可直接阅读、可 git diff |
| AC-A2.4 | 与 KiwiFS 的 frontmatter 约定兼容(便于后续导入) |

#### FR-A3 知识检索 · P0

| 验收标准 | |
|---|---|
| AC-A3.1 | 支持关键词检索,返回 `noteId + 摘要 + 锚点` |
| AC-A3.2 | 检索结果可被 Agent 作为工具调用获取(不是只能人看) |
| AC-A3.3 | 检索响应 < 1s(本地 Markdown,不需索引服务) |
| AC-A3.4 | 向量检索列为 P2,不阻塞 v1.0 |

#### FR-A4 增量与去重 · P1

| 验收标准 | |
|---|---|
| AC-A4.1 | `paperId` 稳定可推导:DOI / arXiv ID 优先,否则 `sha256(file)[:16]` |
| AC-A4.2 | 同一论文重复入库默认跳过(可 `--force`) |
| AC-A4.3 | 已入库论文在日志中明确提示「命中已有,跳过」 |

#### FR-A5 知识关联 · P2

| 验收标准 | |
|---|---|
| AC-A5.1 | 支持 `supports / contradicts / extends` 三种关系链接 |
| AC-A5.2 | 能被 C 技能库的「证据索引」引用 |

---

### FR-B 工具库 · 三个创新模块之一

#### FR-B1 方法抽取 · P0

**描述**:从论文中抽取「可参数化的方法」——方法名、参数、前提条件、证据页码。

| 验收标准 | |
|---|---|
| AC-B1.1 | 输出 `MethodSpec {name, params[], preconditions[], evidencePage}` |
| AC-B1.2 | `params` 每项含 `{name, type, required, default?, description}` |
| AC-B1.3 | 方法必须来自论文正文,**必须带证据页码** |
| AC-B1.4 | 无法确定参数类型的方法标记 `unsupported`,不进入工具生成 |

#### FR-B2 工具生成(L1 级)· P0

**描述**:按 D-04 只做 L1 —— **方法选型 + 参数填充**,不自动写分析算法。

| 验收标准 | |
|---|---|
| AC-B2.1 | 从 `MethodSpec` 生成符合 `Tool` 接口的 TS 工具(见 FR-D2) |
| AC-B2.2 | 生成的工具必须通过 `inputSchema` 校验(非法参数被拒绝) |
| AC-B2.3 | 每个生成工具**必须通过 smoke test**(至少一次合法调用的预期输出) |
| AC-B2.4 | smoke test 未通过的工具标记 `draft`,不注册到 Agent 可调用池 |
| AC-B2.5 | 生成失败时降级为「参数模板 + 人工填写」,不静默丢弃 |

#### FR-B3 工具注册与发现 · P0

| 验收标准 | |
|---|---|
| AC-B3.1 | 工具注册表可在运行时列出全部可用工具(name + description) |
| AC-B3.2 | Agent 通过 `description` 判断该用哪个工具(描述质量影响命中率) |
| AC-B3.3 | 新增工具只需加一个文件 + 一行注册,不改编排层 |

#### FR-B4 MCP 暴露 · P2

| 验收标准 | |
|---|---|
| AC-B4.1 | `stdio` 模式下可被 MCP 客户端发现工具列表 |
| AC-B4.2 | 至少 2 个工具可通过 MCP 被外部调用成功 |

#### FR-B5 工具体检 · P1

| 验收标准 | |
|---|---|
| AC-B5.1 | 提供 `tools doctor` 命令,批量跑 smoke test 并输出通过率 |
| AC-B5.2 | 通过率作为 B 模块的核心验收指标(见第 12 章) |

---

### FR-C 技能库 · 三个创新模块之一

#### FR-C1 技能文件结构 · P0

**描述**:技能不是"综述",是**判断力**。固定七节结构,缺节视为不合格。

| 节 | 内容 | 作用 |
|---|---|---|
| 1. 领域地图 | 10–20 个关键概念节点(≤20) | 建立术语边界 |
| 2. 标准流程 | 每阶段:输入 → 动作 → 判据 | 告诉 agent 先做什么 |
| 3. 方法→工具映射 | 指向 B 工具库的具体工具 | 把判断落到动作 |
| 4. **常见失败模式** ★ | 这个领域最容易踩的坑 | **最有价值的一节** |
| 5. 术语消歧 | 同名不同义的概念 | 防止误用 |
| 6. 证据索引 | 指向 A 知识库的知识页 | 可追溯 |
| 7. 负向约束 | 明确"不要做什么" | 防止过度发挥 |

| 验收标准 | |
|---|---|
| AC-C1.1 | 技能文件为 Markdown + YAML frontmatter(`name / domain / version / load_when`) |
| AC-C1.2 | 七节齐全,任一缺失则标记 `incomplete` |
| AC-C1.3 | 第 4 节「失败模式」至少 3 条具体条目 |
| AC-C1.4 | 第 3 节的每个工具引用都必须真实存在于 B 工具库 |

#### FR-C2 技能生成 · P1

| 验收标准 | |
|---|---|
| AC-C2.1 | 从 A 知识库的知识页聚合生成技能草案 |
| AC-C2.2 | 草案标注 `needs_review: true`,**必须人工审核**后才转 `active`(D-05) |
| AC-C2.3 | 生成失败时允许手工编写技能,技能库功能不受影响 |

#### FR-C3 技能按需加载 · P0

| 验收标准 | |
|---|---|
| AC-C3.1 | 技能声明 `load_when` 条件(关键词 / 任务类型) |
| AC-C3.2 | Agent 按任务匹配加载技能,不一次性全塞进 system prompt |
| AC-C3.3 | 加载行为在日志中可见:「加载技能 X,原因 Y」 |
| AC-C3.4 | 无匹配技能时正常降级,不报错 |

---

### FR-D 共享底座与 Agent 内核

#### FR-D1 文献底座 · P0

| 验收标准 | |
|---|---|
| AC-D1.1 | arXiv 优先走官方元数据/HTML,PDF 解析作降级 |
| AC-D1.2 | 输出符合第 8.1 节 `PaperDoc`,**每个段落带 `page`** |
| AC-D1.3 | 表格转 Markdown 保留行列对应 |
| AC-D1.4 | `parseQuality.pagesParsed / pagesTotal < 0.7` 标记 `quarantined`,不进入抽取队列 |
| AC-D1.5 | 解析失败不中断批量流程,失败清单进运行报告 |

#### FR-D2 工具抽象 · P0

**描述**:仿 Claude Code `Tool.ts`,统一工具契约。**B 生成的工具也遵守同一契约。**

| 验收标准 | |
|---|---|
| AC-D2.1 | 每个工具:`name / description / inputSchema / call()` |
| AC-D2.2 | `inputSchema` 由 `zod` 定义并自动转 JSON Schema,与运行时校验共用一份 |
| AC-D2.3 | 返回统一 `ToolResult`,区分 `ok / recoverable_error / fatal_error` |
| AC-D2.4 | 支持进度上报(供 UI 显示「第 3/10 篇」) |

#### FR-D3 Agent 主循环 · P0

**描述**:仿 `query.ts`:调 LLM → 解析 tool_use → 校验 → 执行 → 回填 → 继续。

| 验收标准 | |
|---|---|
| AC-D3.1 | 流式输出,文本增量实时打印 |
| AC-D3.2 | 单轮多 tool_use 并发执行并正确回填 |
| AC-D3.3 | `MAX_TURNS` 上限,触顶安全退出并保留已有产出 |
| AC-D3.4 | 单工具失败不中断主循环,错误结构化回填,模型可换策略 |
| AC-D3.5 | `AbortController` 全程可中断(Ctrl+C 立即停) |
| AC-D3.6 | **主循环不允许 throw 到顶层**,异常必须收敛 |

#### FR-D4 子 Agent · P1

| 验收标准 | |
|---|---|
| AC-D4.1 | 主 agent 派发 N 个子任务,子 agent 独立上下文 |
| AC-D4.2 | 工具白名单可配置(精读 agent 不应能调检索) |
| AC-D4.3 | 并发默认 3,可配置 |
| AC-D4.4 | 单个子 agent 失败不影响其余,失败项在报告中标注 |
| AC-D4.5 | 子 agent token 消耗汇总进运行报告 |

#### FR-D5 记忆 · P1

| 验收标准 | |
|---|---|
| AC-D5.1 | 文件式持久化,人类可读 Markdown |
| AC-D5.2 | 启动时加载并注入 system prompt |
| AC-D5.3 | 已处理论文默认跳过(`--force` 覆盖) |
| AC-D5.4 | 可演示:第二次运行明显更快,日志显示命中记忆 |

---

### FR-E 交付、可观测与演示

#### FR-E1 运行追踪与回放 · P0

| 验收标准 | |
|---|---|
| AC-E1.1 | 每次运行产出 JSONL trace 到 `logs/`(轮次/工具/耗时/token) |
| AC-E1.2 | `DEMO_MODE=replay` 时全部外部调用从 `fixtures/` 回放,完全离线 |
| AC-E1.3 | `DEMO_MODE=live --record` 可录制响应到 `fixtures/` |
| AC-E1.4 | 运行结束打印汇总:耗时 / token / 工具调用数 / 失败数 |

#### FR-E2 CLI · P0

| 验收标准 | |
|---|---|
| AC-E2.1 | `node src/main.ts ingest <论文>` — 沉淀(跑 A/B/C) |
| AC-E2.2 | `node src/main.ts ask "<任务>"` — 消费(加载技能→调工具→引用知识) |
| AC-E2.3 | `node src/main.ts tools doctor` — 工具体检 |
| AC-E2.4 | 退出码:0 成功 / 1 失败 / 2 配置错误 |
| AC-E2.5 | `scripts/demo.sh` 一键演示 |

> **三个命令对应三个模块的独立演示能力(满足 D-02)。**

---

### FR-F Web 交互层 · P0(决策 D-11)

**描述**:提供可视化界面。**必须薄壳**(D-12):不实现业务逻辑,只订阅核心事件流并渲染(D-13)。

#### FR-F1 统一事件总线 · P0

| 验收标准 | |
|---|---|
| AC-F1.1 | 核心层只发出事件,不知道谁在消费(CLI 与 Web 无感知) |
| AC-F1.2 | 事件类型固定为:`text_delta / tool_start / tool_end / skill_load / knowledge_hit / tool_generated / progress / error / run_end` |
| AC-F1.3 | CLI 渲染器与 Web 渲染器消费**同一份事件序列**,顺序一致 |
| AC-F1.4 | 新增渲染器不需要改动核心代码 |

#### FR-F2 三个模块的可视化面板 · P0

> **这是 Web 相对 CLI 的核心增量** —— 让"资产在增长"这件事看得见。

| 验收标准 | |
|---|---|
| AC-F2.1 | **A 知识库面板**:列出知识页(描述 + `paperId` + `page`),点击展开全文与证据摘句 |
| AC-F2.2 | **B 工具库面板**:工具卡片显示 `active / draft`、来源论文、smoke 结果,可点击查看 schema |
| AC-F2.3 | **C 技能库面板**:技能卡片按七节结构展示,失败模式一节高亮 |
| AC-F2.4 | 三个面板的数据来自文件系统实时读取,不是从运行日志拼凑 |
| AC-F2.5 | 运行过程中,新产生的知识页/工具/技能**实时出现在面板上** |

#### FR-F3 过程可视化 · P0

| 验收标准 | |
|---|---|
| AC-F3.1 | Agent 输出以流式呈现(逐字/逐块) |
| AC-F3.2 | 每次工具调用显示:工具名 + 参数摘要 + 耗时 + 成功/失败 |
| AC-F3.3 | 技能加载时显示「加载技能 X,原因 Y」 |
| AC-F3.4 | 知识命中时显示被引用的知识页锚点(可点击定位) |
| AC-F3.5 | 运行结束显示汇总:耗时 / token / 工具调用数 / 失败数 |

#### FR-F4 服务与降级 · P0

| 验收标准 | |
|---|---|
| AC-F4.1 | 后端用 Node 内置 `http` + SSE,不引入 Express |
| AC-F4.2 | 前端单页 HTML,零构建、零框架(D-14) |
| AC-F4.3 | 端口占用时自动尝试下一个端口并打印实际地址 |
| AC-F4.4 | **Web 启动失败不影响 CLI**;CLI 始终可用 |
| AC-F4.5 | 不依赖任何 CDN 资源(现场断网也能打开) |

---

### 需求依赖图

```
FR-D1 文献底座 ──┬──▶ FR-A1 知识页 ──▶ FR-A2 存储 ──▶ FR-A3 检索
                 │         │
                 │         └──▶ FR-C2 技能生成 ──▶ FR-C1 技能结构 ──▶ FR-C3 加载
                 │                                            │
                 └──▶ FR-B1 方法抽取 ──▶ FR-B2 工具生成 ──▶ FR-B3 注册 ◀┘
                                              │
                                              └──▶ FR-B5 体检 ──▶ FR-B4 MCP(P2)

FR-D2 工具抽象 ◀── 被 FR-B2 依赖
FR-D3 主循环   ◀── 消费 FR-A3 / FR-B3 / FR-C3
FR-D4 子 Agent / FR-D5 记忆 / FR-E1 回放 / FR-E2 CLI 贯穿
```

---

## 6. 非功能需求

| 编号 | 类别 | 要求 | 验收 |
|---|---|---|---|
| NFR-1 | 可演示性 | live 端到端 ≤ 3 分钟;replay ≤ 60 秒 | 计时 3 次 |
| NFR-2 | **模块独立性** | 三个模块各自有独立命令与产物,可单独演示 | 逐个跑一遍 |
| NFR-3 | 成本 | 单次运行 token 有硬上限(`MAX_TOTAL_TOKENS`) | 运行汇总打印 |
| NFR-4 | 健壮性 | 任一外部依赖失败不导致进程崩溃 | 人为断网实测 |
| NFR-5 | 可复现性 | 同输入 + replay 结果稳定 | 连跑 3 次 diff 一致 |
| NFR-6 | **可追溯性** | 知识页锚点可验证率 ≥ 95% | 抽 20 条核对页码 |
| NFR-7 | 开发效率 | 免构建;`node src/main.ts` 直接跑 | 实测 |
| NFR-8 | 质量门禁 | CI:`typecheck` + 单测 + replay 冒烟,< 90s | Actions 绿 |
| NFR-9 | 安全 | 仓库内无密钥;密钥只存 `.env` | 提交前扫描 |
| NFR-10 | 可理解性 | 非技术观众看终端能说出"它在干什么" | 找外人观看复述 |
| NFR-11 | **界面友好度** | 非计算机专业的人能在**不看文档**的情况下完成一次 ingest 与一次提问 | 找 1 位非 CS 同学独立操作,观察是否需要指导 |
| NFR-12 | **薄壳约束** | Web 层代码不 import 任何 `services/` 业务模块,只消费事件流 | 静态检查 `web/` 的 import 白名单 |

---

## 7. 系统架构

### 7.1 六层架构(与 Claude Code 的对应)

```
┌────────────────────────────────────────────────────────────────┐
│ ① 入口层  src/main.ts                                          │
│    CLI 子命令:ingest / ask / tools doctor                      │
│    ⇔ Claude Code: src/entrypoints/cli.tsx                      │
├────────────────────────────────────────────────────────────────┤
│ ② 交互层  src/ui/                                              │
│    流式输出 · 工具调用可视化 · 进度(chalk + stdout)             │
│    ⇔ Claude Code: src/ink/(我们轻量化,不上 React)             │
├────────────────────────────────────────────────────────────────┤
│ ③ 编排层 ★ src/agent/                                          │
│    types.ts     ★冻结契约                                       │
│    loop.ts      主循环                                          │
│    subagent.ts  子 Agent 派生                                   │
│    ⇔ Claude Code: src/query.ts + AgentTool/                    │
├────────────────────────────────────────────────────────────────┤
│ ④ 工具层  src/tools/                                           │
│    types.ts(★契约) registry.ts                                 │
│    knowledge/    ← A 模块的检索工具                             │
│    methodtools/  ← B 模块生成/加载的工具                        │
│    ⇔ Claude Code: src/tools/*                                  │
├────────────────────────────────────────────────────────────────┤
│ ⑤ 服务层  src/services/                                        │
│    llm/         provider + 流式 + 重试                          │
│    paper/       PDF/arXiv → PaperDoc(共享底座)                │
│    knowledge/   KnowledgeStore 接口 + LocalMarkdown(★契约)     │
│    toolsynth/   方法抽取 + 工具生成 + smoke test(B 模块)        │
│    skills/      技能生成 + 加载(C 模块)                        │
│    trace/       JSONL + replay                                  │
│    cache/       fixtures                                        │
│    ⇔ Claude Code: services/api, compact, extractMemories       │
├────────────────────────────────────────────────────────────────┤
│ ⑥ 状态与存储层                                                  │
│    memory/      文件式记忆(memdir 风格)                        │
│    store/       知识页 / 工具 / 技能落盘                        │
└────────────────────────────────────────────────────────────────┘
```

### 7.2 「沉淀」流程时序

```
ingest <论文集合>
   │
   ├─▶ [共享底座] 解析 → PaperDoc(page 锚点)     ← 质量门控,<0.7 隔离
   │
   ├─▶ [A 知识库] 原子知识页生成 → KnowledgeStore.put
   │
   ├─▶ [B 工具库] 方法抽取 MethodSpec → 工具生成 → smoke test
   │                                  ├ 通过 → 注册
   │                                  └ 失败 → 标 draft
   │
   ├─▶ [C 技能库] 知识页聚合 → 技能草案 → needs_review(人工审核)
   │
   └─▶ 汇总报告:知识页 N 条 / 工具 M 个(通过 K 个)/ 技能草案 1 个
```

### 7.3 「消费」流程时序

```
ask "<科研任务>"
   │
   ├─▶ [FR-C3] 匹配 load_when → 加载技能(拿到流程/判据/失败模式/工具映射)
   │
   ├─▶ [FR-D3] 主循环:LLM 依技能流程决策
   │      ├─▶ [FR-A3] 检索知识页(需要依据时)→ 引用 paperId+page
   │      ├─▶ [FR-B3] 调用工具(需要计算/分析时)
   │      └─▶ [FR-D4] 需要并行时派发子 Agent
   │
   └─▶ 产出交付物 + 反哺沉淀(新的知识页)
```

### 7.4 子 Agent 派生

与 v1.0 相同:子 agent 是主循环的**再实例化**,独立上下文 + 工具白名单,结果以结构化摘要回填。

### 7.5 借鉴点对照表(用于 README 与答辩)

| Claude Code 机制 | 我们的实现 | 我方增量(创新点) |
|---|---|---|
| `Tool.ts` 统一工具接口 | `src/tools/types.ts` | **工具是论文里长出来的**,不是人手写的 |
| `query.ts` 主循环 | `src/agent/loop.ts` | 循环里注入**技能**作为判断依据 |
| `AgentTool/runAgent.ts` | `src/agent/subagent.ts` | 精读阶段并行 |
| `memdir/` 记忆 | `src/state/memory/` | 记忆升级为**结构化知识库**(可检索、带锚点) |
| MCP 动态工具发现 | `registry.ts` + FR-B4 | 工具由 B 模块**自动生成** |
| — (Claude Code 无对应) | **C 技能库** | **纯增量:把领域判断力固化为可加载资产** |

> 答辩要点:**「会自己长工具、长技能的 Agent」是相对通用 Agent 的核心差异。**

---

## 8. 核心设计

### 8.1 数据模型

```ts
// ===== 共享底座 =====
type PaperDoc = {
  paperId: string              // DOI / arXiv ID,否则 sha256(file)[:16]
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

// ===== A 知识库 =====
type AtomicNote = {
  noteId: string               // `${paperId}#p${page}#${hash(claim).slice(0,6)}`
  paperId: string
  page: number                 // ★ 锚点,不可为空
  kind: 'claim' | 'method' | 'result' | 'limitation' | 'definition'
  text: string                 // 一个论断,不跨主题
  evidence: { quote: string; page: number }
  confidence: 'high' | 'medium' | 'low'
  links?: Array<{ to: string; rel: 'supports' | 'contradicts' | 'extends' }>
}

// ===== B 工具库 =====
type MethodSpec = {
  methodId: string
  paperId: string
  name: string
  params: Array<{ name: string; type: string; required: boolean; default?: unknown; description: string }>
  preconditions: string[]
  evidencePage: number         // ★ 方法出自第几页
  supportLevel: 'unsupported' | 'L1' | 'L2'
}

type GeneratedTool = {
  toolName: string             // 注册到 registry 的名字
  fromMethod: string           // methodId
  sourcePaper: string
  status: 'draft' | 'active'   // smoke test 通过才 active
  smokeTest: { input: unknown; expect: string; passed: boolean; lastRun?: string }
}

// ===== C 技能库 =====
type Skill = {
  skillId: string
  name: string
  domain: string
  version: string
  loadWhen: { keywords: string[]; taskTypes: string[] }
  sections: {
    domainMap: string[]              // 1. 领域地图(≤20 节点)
    workflow: Array<{ stage: string; input: string; action: string; criteria: string }>  // 2. 标准流程
    toolMapping: Array<{ method: string; tool: string }>   // 3. 方法→工具
    failureModes: string[]           // 4. 常见失败模式(≥3)
    terminology: Array<{ term: string; disambiguation: string }>  // 5. 术语消歧
    evidenceIndex: Array<{ claim: string; noteId: string }>       // 6. 证据索引
    negativeConstraints: string[]    // 7. 不要做什么
  }
  status: 'draft' | 'needs_review' | 'active' | 'incomplete'   // D-05:人工审核后才 active
}

// ===== 运行追踪 =====
type RunTrace = {
  runId: string
  mode: 'ingest' | 'ask'
  startedAt: string
  turns: number
  tokens: { input: number; output: number }
  toolCalls: Array<{ name: string; ms: number; status: 'ok' | 'error' }>
  failures: Array<{ stage: string; ref?: string; message: string }>
}
```

**四条数据铁律**:
1. 无 `page` 锚点的信息不得进入 A 知识库。
2. 无 `evidencePage` 的方法不得进入 B 工具库。
3. `parseQuality < 0.7` 的论文标记 `quarantined`,不参与抽取。
4. 技能未经人工审核不得转 `active`。

### 8.2 三个冻结契约

```ts
// ===== ① src/tools/types.ts — 全队只读 =====
export type ToolResult =
  | { kind: 'ok'; data: unknown; summary: string }
  | { kind: 'recoverable_error'; message: string; hint?: string }
  | { kind: 'fatal_error'; message: string }

export interface Tool<In = unknown> {
  name: string
  description: string              // 决定模型会不会调用它,写好
  inputSchema: JsonSchema
  call(input: In, ctx: ToolContext): Promise<ToolResult>
}

export interface ToolContext {
  signal: AbortSignal
  onProgress?: (e: { step: string; done: number; total: number }) => void
  trace: TraceWriter
  cache: Cache
  mode: 'live' | 'replay'
}

// ===== ② src/services/knowledge/types.ts — 可插拔存储 =====
export interface KnowledgeStore {
  put(note: AtomicNote): Promise<void>
  get(noteId: string): Promise<AtomicNote | null>
  search(query: string, limit?: number): Promise<AtomicNote[]>
  link(from: string, to: string, rel: AtomicNote['links'][number]['rel']): Promise<void>
}

// ===== ③ src/services/skills/types.ts — 技能加载 =====
export interface SkillStore {
  list(): Promise<Array<Pick<Skill, 'skillId' | 'name' | 'domain' | 'loadWhen' | 'status'>>>
  load(skillId: string): Promise<Skill | null>
  match(task: string): Promise<Skill | null>     // 按 loadWhen 匹配
  save(skill: Skill): Promise<void>
}
```

### 8.3 存储布局

```
data/                    # 原始论文与大文件(不入库,README 豁免)
  papers/<paperId>.pdf

knowledge/               # A 知识库(入库)
  <paperId>/
    meta.md              # frontmatter + 论文级摘要
    notes.md             # 原子知识页
    _index.json

tools/generated/         # B 工具库(入库)
  <toolName>.ts          # 生成的工具
  <toolName>.test.ts     # smoke test
  registry.generated.ts  # 自动生成的注册表

skills/                  # C 技能库(入库)
  <skillId>.md           # 七节结构
  _index.json

out/                     # 交付物
  run-<runId>.json
  <task>-report.md

fixtures/                # 回放数据(必须入库)
logs/                    # trace(不入库)
```

### 8.4 错误与降级

| 故障 | 处理 | 可见行为 |
|---|---|---|
| LLM 429 / 超时 | 退避重试 2 次 → 切备用 provider → 中止并保留产出 | 「已重试 2 次,切换 provider」 |
| 单篇解析失败 | `quarantined` 跳过,计入失败清单 | 「3 篇解析失败,未纳入」 |
| **工具生成失败** | 降级为参数模板 + 人工填写,标 `draft` | 「工具 T 生成失败,已降级为模板」 |
| **技能生成失败** | 允许手工编写技能,功能不受影响 | 「技能草案生成失败,请手工编写」 |
| 技能 `incomplete` | 拒绝加载,提示缺哪一节 | 「技能缺第 4 节失败模式,拒绝加载」 |
| 工具抛异常 | 收敛为 `recoverable_error` 回填模型 | 模型可换策略 |
| 子 agent 超时 | 该篇跳过,不阻塞其他 | 汇总失败项 |
| 触顶 `MAX_TURNS` | 安全退出,输出已有结果 | 「已达轮次上限,部分结果」 |

**总原则**:任何情况下进程不崩溃,必须产出「部分结果 + 失败说明」。

### 8.5 上下文与成本控制

1. **单篇隔离**:每篇论文在子 agent 独立上下文处理,主上下文只收结构化摘要(最有效省 token 手段)。
2. **分段 + 局部摘要**:超长论文按章节分段抽取再合并。
3. **预算硬闸**:`MAX_TOTAL_TOKENS` 触发即中止并输出已有结果。
4. **技能按需加载**:不把全部技能塞进 system prompt(AC-C3.2),这既省 token 又提升准确率。

### 8.6 权限模型(轻量)

不实现交互式权限确认(单人本地运行)。保留三点:
- **工具白名单**(子 agent 只能调授权工具)—— 权限模型雏形
- **文件写入限定**在 `knowledge/`、`tools/generated/`、`skills/`、`out/`、`logs/`、`fixtures/`
- 密钥只从环境变量读,不落盘、不入 trace

---

## 9. 技术选型

### 9.1 依赖

| 类别 | 选型 | 理由 |
|---|---|---|
| 语言 | TypeScript | tool_use 解析与 JSON Schema 类型安全收益最大 |
| 运行时 | Node 24(直接跑 `.ts`) | 免构建省半天;限制:不用 `enum`/`namespace`,import 带扩展名 |
| 包管理 | npm(不混用 pnpm) | 少一个争论点 |
| LLM | `@anthropic-ai/sdk`(主)+ OpenAI 兼容(备) | 只作 API 客户端,agent 逻辑自研 |
| 校验 | `zod` + `zod-to-json-schema` | 一处定义,同时产出 JSON Schema 与运行时校验 |
| PDF | `pdfjs-dist` 或 `unpdf`;arXiv 优先官方 API | PDF 只作降级 |
| 终端 | `chalk` | 最小化 |
| 测试 | `node:test` | 零配置 |
| 日志 | 自写 JSONL | 便于回放与演示 |

### 9.2 明确不引入

- ❌ Agent 框架(LangChain / AutoGen / Vercel AI SDK agent 层)
- ❌ 数据库 / 向量库(v1.0 用本地 Markdown + 关键词检索)
- ❌ ORM / DI 容器 / 状态管理库
- ❌ UI 框架(Ink / React / TUI 库)
- ❌ 格式化门禁(eslint 可装但不阻塞 CI)

### 9.3 环境变量

见 `.env.example`:provider key / model / `MAX_TURNS` / `MAX_TOTAL_TOKENS` / `REQUEST_TIMEOUT_MS` / `DEMO_MODE` / `FIXTURES_DIR` / `TRACE_DIR`。

### 9.4 已知环境约束(实测)

| 约束 | 现象 | 处理 |
|---|---|---|
| 代理 | 命令行工具不读 Windows 系统代理,直连 `github.com:443` 超时 21s | 显式 `git config http.proxy` / `HTTPS_PROXY` |
| 路径含空格 | `credential.helper` 路径被截断 | 凭据写 remote URL;脚本加引号 |
| 换行符 | 跨平台满屏 diff | 已配 `.gitattributes` |

---

## 10. 目录结构

```
hackathon-agent/
├── src/
│   ├── main.ts                      # ① CLI 入口(ingest / ask / tools doctor)
│   ├── ui/{stream.ts,progress.ts}   # ② 交互层
│   ├── agent/                       # ③ 编排层
│   │   ├── types.ts                 #    ★ 冻结契约
│   │   ├── loop.ts                  #    主循环
│   │   └── subagent.ts              #    子 Agent
│   ├── tools/                       # ④ 工具层
│   │   ├── types.ts                 #    ★ 冻结契约
│   │   ├── registry.ts              #    注册表
│   │   ├── knowledge/search.ts      #    A:知识检索工具
│   │   └── generated/               #    B:生成工具 + smoke test
│   ├── services/                    # ⑤ 服务层
│   │   ├── llm/{provider.ts,stream.ts,retry.ts}
│   │   ├── paper/{fetch.ts,parse.ts,quality.ts}      # 共享底座
│   │   ├── knowledge/{types.ts,localMarkdown.ts,kiwifs.ts?}   # ★A
│   │   ├── toolsynth/{extract.ts,generate.ts,smoke.ts}        # ★B
│   │   ├── skills/{types.ts,generate.ts,load.ts}             # ★C
│   │   ├── trace/{writer.ts,replay.ts}
│   │   └── cache/fixtures.ts
│   └── state/memory/index.ts        # ⑥ 文件式记忆
├── scripts/demo.sh
├── knowledge/                       # A 产物(入库)
├── skills/                          # C 产物(入库)
├── tools/generated/                 # B 产物 → 实际在 src/tools/generated
├── fixtures/                        # 回放(入库)
├── data/                            # 大文件(仅 README 入库)
├── out/  logs/
├── docs/
│   ├── SRS.md                       # 本文件
│   ├── PLAN.md                      # 四天计划
│   ├── DECISIONS.md                 # 决策日志(待建)
│   ├── wyh/                         # 队友方案
│   └── reference/claude-code-architecture.md
├── .github/
├── .env.example
└── package.json / tsconfig.json
```

**模块边界规则**:
- `agent/` 不 import 具体工具实现,只认 `tools/types.ts`
- `tools/` 不 import LLM,只认 `ToolContext`
- 三个模块之间**只能通过 8.2 的三个冻结契约交互**,不得直接互相 import 实现
- 冻结契约改动需 PR + 1 人 approve

---

## 11. 里程碑与交付

### 11.1 四个硬检查点

| 时点 | 检查项 | 未通过则 |
|---|---|---|
| **D1 10:00** | 每人用自己的 key 调通一次 LLM API | 立刻换 provider |
| **D1 12:00** | Q0/Q1/Q2 关闭 + 三个冻结契约合入 main | 按本文件默认值执行,不再讨论 |
| **D2 17:00** | A 知识库闭环跑通(1 篇论文 → ≥5 条知识页 → 可检索) | 砍 B 到 1 个工具,C 改手工编写 |
| **D3 17:00** | `demo.sh` 一条命令跑通「沉淀 + 消费」闭环 | 冻结新功能,全员转 demo 稳定性 |

### 11.2 里程碑(纵向薄切片)

| 里程碑 | 目标 | 三个模块的状态 | 交付物 |
|---|---|---|---|
| **M1 · 骨架**(D1) | Agent 内核 + 底座 | A 未开始 / B 未开始 / C 未开始 | 主循环跑通一轮;PaperDoc 能解析 1 篇;三个契约文件在 main |
| **M2 · 模块立起来**(D2) | A 闭环 + B 首个工具 | **A 可用**(知识页+检索)/ **B L1** 1–2 个工具 / C 未开始 | `ingest` 能产出知识页并可检索 |
| **M3 · 三层贯通**(D3) | 闭环 + C 技能 | A 完整 / B ≥3 个工具 / **C 1 个技能** | `demo.sh` 跑通沉淀→消费 |
| **M4 · 交付**(D4) | 可演示 | 三模块均可独立演示 | demo 脚本 + 3 分钟录屏 + README/幻灯片 + 仓库清理 |

### 11.3 D1 第一小时 checklist

```
0) 环境自检     node -v(≥22.18)/ git 代理 / API key 连通性
1) 仓库已就绪   .gitignore 已修(F3 ✅)/ .env.example 已建(F7 ✅)
2) 关 Q0~Q2     三个待确认项,10 分钟拍板(Q3 已定为 Web)
3) 写契约       tools/types.ts → knowledge/types.ts → skills/types.ts
4) 写循环       loop.ts + FakeLLM 单测 → 真实 API 调通一次
5) 写底座       paper/parse.ts 解析 1 篇论文出 PaperDoc
```

---

## 12. 验收标准(量化)

| 编号 | 指标 | 阈值 | 测量 |
|---|---|---|---|
| A-1 | 三模块独立可演示 | 3/3 | 逐个跑独立命令 |
| A-2 | 端到端闭环成功率 | 连续 3 次 | 跑 3 次 |
| A-3 | live 耗时 | ≤ 3 分钟 | 计时 |
| A-4 | replay 耗时 | ≤ 60 秒 | 计时 |
| **A-5** | **知识页锚点可验证率** | **≥ 95%** | 抽 20 条人工核对 |
| A-6 | 单篇论文知识页数 | 5–20 条 | 统计 |
| **A-7** | **生成工具 smoke 通过率** | **≥ 60%**(≥3 个 active) | `tools doctor` |
| A-8 | 技能七节完整度 | 100%(7/7) | 校验脚本 |
| A-9 | 技能加载准确率 | 抽 5 个任务,≥4 次加载正确技能 | 人工核对 |
| A-10 | 解析合格率 | `pagesParsed/pagesTotal ≥ 0.7` 的论文 ≥ 80% | 运行报告 |
| A-11 | replay 断网可用 | 0 次网络请求 | 断网实测 |
| A-12 | 单次 token 成本 | ≤ `MAX_TOTAL_TOKENS` | 运行汇总 |
| A-13 | CI 时长 | < 90s | Actions |

**答辩最该报的三个数**:
- **A-5 锚点可验证率** → 证明不是幻觉
- **A-7 工具生成通过率** → 证明 B 模块是真能产出,不是摆设
- **A-9 技能加载准确率** → 证明 C 模块的判断力是真的

---

## 13. 风险登记册

| ID | 风险 | 概率 | 影响 | 触发信号 | 应对 |
|---|---|---|---|---|---|
| **R-1** | **B 工具库跑不通**(方法→可执行代码语义鸿沟) | **高** | 高 | D2 结束 smoke 通过率 0 | D-04 只承诺 L1;失败降级为「参数模板 + 人工填写」,仍可演示 |
| **R-2** | **C 技能库写成"综述"而非"判断力"** | **高** | 高 | 技能文件像论文摘要 | 七节结构强制 + 人工审核 + 第 4 节失败模式 ≥3 条 |
| R-3 | 三个模块都做但没一个能用 | 中 | 高 | D2 结束无可用模块 | D-03 纵向薄切片;D2 17:00 检查点强制降级 |
| R-4 | PDF 解析质量不可控 | 高 | 中 | `parseQuality < 0.7` 比例高 | arXiv HTML 优先;`quarantined` 隔离 |
| R-5 | 抽取幻觉 | 高 | 高 | 抽查发现无锚点结论 | D-07 硬约束 + A-5 量化抽查 |
| R-6 | LLM API 不稳/额度不足 | 中 | 高 | 频繁 429 | 双 provider;replay 兜底 |
| R-7 | 现场网络故障 | 中 | 高 | — | `DEMO_MODE=replay` + 录屏 |
| R-8 | 范围蔓延 | 高 | 中 | D3 还想加功能 | 第 3.1「不做」清单 + 代码冻结线 |
| R-9 | 并行开发撞车 | 中 | 中 | 频繁 merge 冲突 | 三契约先冻结 + 文件级分工 |
| R-10 | 队友环境配置耗时 | 中 | 低 | D2 还跑不起来 | replay 模式让新人零配置参与 |

---

## 14. 附录

### 14.1 术语表

| 术语 | 含义 |
|---|---|
| **PaperDoc** | 论文结构化产物,带页码锚点,全系统基础契约 |
| **AtomicNote** | 原子知识页:一个论断一页,必带 `page` |
| **MethodSpec** | 从论文抽出的方法规格(参数/前提/证据页码) |
| **GeneratedTool** | 由 MethodSpec 生成的可执行工具,smoke 通过才 `active` |
| **Skill** | 七节结构的领域判断力文件 |
| **锚点(locator)** | `paperId + page` 组成的可回指坐标 |
| **quarantined** | 解析质量不合格的论文,被隔离不参与抽取 |
| **replay** | 从 `fixtures/` 回放,完全离线 |
| **纵向薄切片** | 每个模块只做最小可用,优先保证三层贯通 |
| **冻结契约** | 三个接口文件,全队只读,改动需评审 |

### 14.2 待确认问题

| 编号 | 问题 | 谁回答 | 期限 |
|---|---|---|---|
| Q0 | 三个模块准确名称是否「个人知识库 / 工具库 / 技能库」 | 项目负责人 | D1 10:00 |
| Q1 | `kiwi` 是否指 KiwiFS,还是只要求自研 RAG 式私有知识库 | 项目负责人 | D1 12:00 |
| Q2 | LLM provider 与额度 | 项目负责人 | D1 10:00 |
| Q3 | ~~演示形态 CLI / Web / 两者~~ **已关闭:选 Web(D-11)** | 项目负责人 | ✅ |
| Q4 | 团队分工 | 项目负责人 | D1 12:00 |

### 14.3 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-10-27 | 首次综合成文(A-core 综述方向) |
| **v2.0** | 2026-10-27 | **方向修正**:产品改为「科研 Agent + 三个创新模块(知识库/工具库/技能库)」;新增 FR-A/FR-B/FR-C 三组需求;新增「沉淀/消费」双向闭环;B 模块明确分级(L1/L2/L3);C 模块强制七节 + 人工审核;里程碑改为纵向薄切片 |
| **v2.1** | 2026-10-28 | **交付形态定为 Web**(Q3 关闭,D-11~D-14):新增 FR-F Web 交互层(统一事件总线 + 三模块可视化面板 + 过程可视化 + 零构建降级);CLI 降级为备用与调试入口;裁剪顺序调整(Web 与三模块不可砍,改砍子 Agent 并行与技能自动生成);新增 NFR-11 界面友好度、NFR-12 薄壳约束 |

**变更规则**:新增需求必须回答「砍掉哪个同等工作量的需求作为交换」。不接受纯增量。
