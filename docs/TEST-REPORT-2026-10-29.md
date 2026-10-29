# 论文实测报告 · 2026-10-29

| 项 | 内容 |
|---|---|
| 测试人 | 骨架负责人 |
| 测试方式 | 真实 arXiv 论文 × 3,全链路 `ingest` + 直接检索 |
| 基线提交 | `7cfb65d` |
| 测试命令 | `node src/main.ts ingest <pdf> --force`(纯本地,不调 LLM) |
| 结论 | **链路可用,locateRate 100%,但有一个 P0 崩溃缺陷必须修** |

---

## 一、测试结果

### 1.1 三篇论文的 ingest 结果

| 论文 | 页数 | 段落 | 候选 | 入库 | 锚点定位率 | 结果 |
|---|---|---|---|---|---|---|
| Attention Is All You Need (arXiv 1706.03762) | 15 | 123 | 98 | **20** | **100%** | ✅ 0.6s |
| RAG · Lewis 2020 (arXiv 2005.11401) | 12 | 189 | 120 | **20** | **100%** | ✅ 0.6s |
| BERT (arXiv 1810.04805) | 16 | 242 | 206 | — | — | ❌ **进程崩溃** |

### 1.2 检索实测(直接调 `LocalMarkdownStore.scan`)

| 查询 | 命中 | 耗时 |
|---|---|---|
| `attention mechanism` | 5 | 11ms |
| `retrieval augmented generation` | 5 | 1ms |
| `pre-training` | 5 | 0ms |

- 跨论文检索正常(查询可命中不同论文)
- kind 分类正常:`result / claim / definition / method / limitation` 均有产出
- 索引:`knowledge/INDEX.md` 46 行 / 6.3KB,格式正确

### 1.3 运行正确的地方(值得肯定)

| 项 | 证据 |
|---|---|
| **锚点定位率 100%** | 两篇成功论文全部 quote 可在原文精确定位 —— 抽取没有编造 |
| 技能草案**诚实标注缺口** | 「第 3/4/7 节为空,需人工补」,生成器不瞎填、不猜工具名 |
| 幂等 | `--force` 覆盖;无 force 时已入库论文跳过 |
| 空结果保护 | 0 条时不写空文件,避免把论文误标为「已处理」 |

---

## 二、缺陷清单(按严重度)

### 🔴 P0-1 · 一篇论文的脏数据杀掉整个批次

**现象**:

```
Error: 知识页 arxiv:1810.04805#p1#cedcb4 校验失败:description 太短…
    at LocalMarkdownStore.putAll (localMarkdown.ts:379)
    at ingestPaper (ingest.ts:144)
进程 exit 1 —— BERT 之后的论文一篇都不会跑
```

**分析**:

- `putAll` 抛错是**设计如此**(「无锚点不入库」的最后一道闸),不该改
- 真正的问题:`ingestPaper` 没有 try/catch → 单篇失败直接向上抛 → `cmdIngest` 不兜底 → 进程死
- **违反铁律 8「进程永不崩」**:单篇论文解析/校验失败,必须记 `status:'failed'` 并继续下一篇

**复现**:`node src/main.ts ingest data/papers --force`(目录里有 3 篇,跑到 BERT 必崩)

### 🟠 P1-1 · `extract.ts` 不给自己产出的知识页做契约校验

`extractNotes()` 有 `rejected` 机制(有原因分类),但从不调 `validateNote()`。
脏数据(描述过短)一路流到 store 才被拦下 —— 而 store 一拦就是抛错(见 P0-1)。

**应该**:emit 前过 `validateNote`,不合格的转 `rejected`(reason 补一类)。

### 🟠 P1-2 · `buildDescription` 取首句,会产出句子碎片

```ts
const first = splitSentences(text)[0] ?? text
```

PDF 文本里 chunk 可能从句子中间开始(断词换行导致),首句就成了碎片:

| 实际产出 | 来源 |
|---|---|
| `"els."` | `"models"` 被断行拆成 `"mod-"` + `"els."` |
| `"2018)."` | 从引用标记 `(Devlin et al., 2018)` 之后开始 |

BERT 篇 **2/20** 条中招。这类描述**无法用于召回** —— 这正是 `validateNote` 要拦的东西。

### 🟡 P2-1 · 版权/许可样板文字未过滤,混进知识页

第一条知识页:

> `[claim] p1: Provided proper attribution is provided, Google hereby grants permission to reproduce the tables and figures…`

`NOISE_PATTERNS` 没覆盖版权/许可样板,且这条还漏进了技能草案的「领域地图」。

### 🟡 P2-2 · 论文标题被当成知识页

> `[claim] arxiv:2005.11401 p1: Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks †‡ ?`

### 🟡 P2-3 · 技能草案「领域地图」渲染成裸 JSON(模块 C)

```markdown
## 一、领域地图
- {"concept":"…","note":"…"}     ← 不是可读 Markdown
```

### 🟢 P3-1 · `knowledge-probe.ts` 默认路径指向不入库的 PDF

`fixtures/papers/react-2210.03629.pdf` 被 gitignore,脚本直接报错退出。

---

## 三、修复顺序(按风险倒序)

| 序 | 修什么 | 文件 | 影响面 | 回滚风险 |
|---|---|---|---|---|
| 1 | P0-1 按篇隔离失败 | `knowledge/ingest.ts` | 加 try/catch,返回 `failed` 状态 | **低**(只包一层) |
| 2 | P1-1 extract 自检 | `knowledge/extract.ts` | emit 前 validateNote,不合格转 rejected | **低** |
| 3 | P1-2 首句碎片过滤 | `knowledge/extract.ts` | buildDescription 内部逻辑 | **中**(涉及描述生成) |
| 4 | P2-1 版权样板过滤 | `knowledge/extract.ts` | NOISE_PATTERNS 增补 | **低** |
| 5 | P2-2 标题跳过 | `knowledge/extract.ts` | 标题行过滤 | **低** |
| 6 | P2-3 领域地图渲染 | 模块 C,待确认 | — | — |

修复方式:每修一处跑一次 `npm run verify` + 三篇论文重跑,坏了随时 `git revert`。
