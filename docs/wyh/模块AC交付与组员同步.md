# 模块 A / C 交付与组员同步清单

| 项 | 值 |
|---|---|
| 版本 | v1.1(新增 C 模块接线) |
| 日期 | 2026-10-29 |
| 范围 | `src/services/knowledge/**`、`src/services/skills/**`、`test/knowledge/**`、`test/skills/**`,以及为接入而改动的 `src/main.ts`、`src/agent/prompt.ts`、`src/services/paper/parse.ts` |
| 门禁现状 | `typecheck` ✅ · `check:rules` ✅(57 文件 / 6 组)· `test` **298 用例全绿** |

> 本文只写**别人需要知道、或需要别人动手**的事。实现细节在
> `src/services/knowledge/README.md`、`src/services/skills/README.md` 与各文件头部注释里。

---

## 0. 结论先行

- **A 模块完成**:AC-A1.1 ~ A4.3 落地,A5.2(C 按 noteId 查回知识页)本轮已闭环。
- **C 模块完成**:不只是「代码写完」,而是**真的插上电了**——技能清单进 system prompt,任务命中时正文注入,`skill_load` 事件能在 CLI 上看到。
- **需要组员动手的仍是 2 件**(N1 契约 approve、N2 review 我的 9 行改动)。
- **其余 7 件是知情项**,其中 N3(main.ts)冲突风险最高,合并时请按文末建议取舍。

---

## 1. 交付清单

### 1.1 模块 A(知识库)

| 文件 | 行数 | 职责 | 测试 |
|---|---:|---|---:|
| `knowledge/types.ts`(已有) | 186 | 冻结契约 #4-A | — |
| `knowledge/anchor.ts` | 305 | quote → 真页码反查(三级退化匹配) | 23 |
| `knowledge/extract.ts` | 625 | `PaperDoc → AtomicNote[]`,噪声过滤 + 章节配额 | 35 |
| `knowledge/localMarkdown.ts` | 573 | `KnowledgeStore` 唯一实现(纯 Markdown) | 44 |
| `knowledge/select.ts` | 259 | 两段式检索(粗筛 → LLM 精筛,失败降级) | 27 |
| `knowledge/indexFile.ts` | 77 | 落 `knowledge/INDEX.md` | — |
| `knowledge/ingest.ts` | 161 | 门控 → 判重 → 抽取 → 落盘 → 重建索引 | 13 |
| `knowledge/tool.ts` | 169 | `knowledge_search` 工具工厂 | 10 |
| `scripts/knowledge-probe.ts` | 约 220 | 真实 PDF 验收探针 | — |

### 1.2 模块 C(技能库)本轮新增

| 文件 | 行数 | 职责 | 测试 |
|---|---:|---|---:|
| `skills/inject.ts` | 163 | 技能正文 → prompt 片段(七节渲染 + 预算截断) | 13 |
| `skills/draft.ts` | 151 | 草案落盘 / 列出 / 读回 / 晋升(`promoteDraft`) | 10 |
| `main.ts` 新增 `cmdSkills` | 约 110 | `skills list / check / promote` | — |

C 模块合计 **1295 行**;`test/agent/prompt.test.ts` 新增 8 例,覆盖 `skillManifest` / `skillBody` 两种注入。

全项目测试 **298 通过**(本轮 267 → +31)。

### 1.3 验收对照(可复现)

实测对象:`fixtures/papers/react-2210.03629.pdf`(33 页,需自行从 arXiv 下载,PDF 不入库)

| 验收 | 结果 |
|---|---|
| AC-A1.1 5–20 条 | **20 条**(445 段落 / 380 候选) |
| AC-A1.2 缺锚点拒收 | `validateNote()` 在 `put()` 内强制,0 条校验失败 |
| AC-A1.3 kind 五分类 | claim 9 / method 5 / result 6 |
| AC-A1.4 evidence.quote + page | locateRate **99.7%**、exactRate 97.1%、confidence 全 high |
| AC-A1.5 双向链接 | `note.paperId` ↔ `listByPaper()`;另有 `backlinks()` |
| AC-A2.x 落盘 | `knowledge/arxiv-2210.03629/notes.md`,单篇约 14.9KB,可 git diff |
| AC-A3.1 检索带锚点 | `scan()` 返回 `NoteHit{noteId,page,kind,description,score}` |
| AC-A3.2 工具化 | `knowledge_search` 已注册(见 N3) |
| AC-A3.3 <1s | 粗筛 **8ms**、工具调用 **3ms** |
| AC-A4.2/A4.3 去重 | 二次 ingest 输出「命中已有,跳过」 |
| AC-A5.1 三种关系 | `link()` supports / contradicts / extends |
| AC-A5.2 C 能查回知识页 | 本轮闭环:证据索引存 `noteId`,`store.get(noteId)` 可校验 |
| AC-C1~C4 | 七节校验 / 落盘 / 匹配 / 清单注入 **全部接通**,见 §3 N7 |

复现命令:

```bash
node scripts/knowledge-probe.ts --store logs/a-store --query reasoning
```

**未在真实 key 下验证的一项**:`select.ts` 的 LLM 精筛(需要 `DEEPSEEK_API_KEY`)。
无 key 时**自动退化为纯关键词检索**,功能不崩、测试用 stub 覆盖。

---

## 2. 需要组员动手的两件事

### N1|契约变更(需 1 人 approve):`AtomicNote` 增加 `section?`

- **PR 稿**:`docs/wyh/PR-知识页section字段.md`
- **现状**:抽取时已经知道每条论断属于哪一节(方法/实验/结论),但 `AtomicNote` 没有字段可存,只能丢弃。
- **影响**:C 模块的「证据索引」需要按章节组织引用;Web 的知识面板也想按章节分组。越晚加,返工面越大。
- **改法**:只加一个可选字段 `readonly section?: string`,不改任何已有签名,`validateNote()` 不新增必填项。

> 这是**全项目唯一**需要别人签字的改动。其余都在 A/C 自己的目录里。

### N2|我改了 `src/services/paper/parse.ts`(+9 行)

```ts
export interface AssembleResult {
  readonly doc: PaperDoc
  readonly warnings: readonly string[]
  readonly pageLines: readonly PageLine[]   // ← 新增
}
// parsePdfBytes 内部原本就构造了 lines,只是没透传
```

- **为什么必须**:A 的页码反查必须拿到原文分页行;不透传就只能把 PDF 再解析一遍,单篇多花近 1s。
- **安全性**:`paper/parse.ts` **不在** 6 个冻结契约内;纯新增只读字段,现有调用方无感;298 个测试全绿。
- **请谁看**:`parse.ts` 的作者。如果你已经在本地改了 `AssembleResult`,以你为准,把我这 9 行合进去即可。

---

## 3. 需要组员知情的七件事

### N3|`src/main.ts` 改动最多,**合并冲突风险最高**

| # | 改动 | 目的 |
|---|---|---|
| 1 | `buildRegistry()` → `buildRegistry(options: { store?, refineLlm? })` | `ask` 与 `tools doctor` 共用同一个 store 实例 |
| 2 | 注册 `knowledge_search` | `refineLlm` 只在 live 且非 `--fake` 时传入;`replay`/`fake` 下只做关键词粗筛,**零网络请求** |
| 3 | 新增 `cmdIngest` + `--force` / `--index-only` / `--no-skill-draft` | PDF → 知识页 → 索引 → 技能草案 |
| 4 | `buildSystemPrompt({ knowledgeIndex, availableTools, notes })` | 只注入索引,正文走工具;库为空时不注入 |
| 5 | **新增 `cmdSkills`**(list / check / promote)+ `skills` 子命令分发 | 技能库运维 |
| 6 | `buildSystemPrompt({ skillManifest, skillBody })` + `createSkillStore(SKILLS_DIR, { events: bus })` | 技能清单常驻,命中后注入正文 |
| 7 | **渲染器订阅提前到 Agent 启动之前** | 技能匹配会立刻发 `skill_load`,订阅晚一步事件就白发 |

> 合并建议:保留 `cmdIngest`、`cmdSkills`、`buildRegistry` 的 options 签名、渲染器提前订阅。
> 如果同学 2(B)也要注册工具,继续在 `buildRegistry()` 同一位置加,不要另起一套注册逻辑。

### N4|三处与文档不一致(我按更安全的方式实现了)

| 文档写的 | 实际实现 | 原因 |
|---|---|---|
| `knowledge/<paperId>/notes.md` | 目录名 sanitize,`arxiv:2210.03629` → `arxiv-2210.03629` | 冒号在 Windows 是非法文件名字符,照字面写直接 `EINVAL`。原始 `paperId` 完整存在 frontmatter 与每条 note 里,可追溯性不受影响 |
| D5:`notes.md` + `_index.json` | **只落 `notes.md`** | `_index.json` 是纯派生数据,双写必然出现「改了 md 忘了 json」。数据永远以 md 为准;`scan` 超过 1s 再加 |
| `index.ts` | `indexFile.ts` | 目录里叫 `index.ts` 的文件通常被当 barrel,容易误 import |

> 若组内坚持要 `_index.json`,我加,但会多一个必须同步的失败点。

### N5|模块隔离带来的硬限制

检查器按**路径前缀**拦:`src/services/skills/*` 不得 import `src/services/knowledge/` 下的**任何文件**,包括 `types.ts`;反过来同理。

- 所以 C 消费知识页时,**不能** `import { AtomicNote } from '../knowledge/types.ts'`
- 现有 `skills/generate.ts` 里的 `DraftNote` 就是这个做法:本地定义最小结构,靠**结构兼容**传值
- 同理,`knowledge/ingest.ts` **不能**调 `generateSkillDraft()`——**接线必须发生在 `main.ts`**(唯一能同时 import 两边的文件)。这也是本轮接线的落点

### N6|`knowledge/` 生成物没有进 `.gitignore`

跑一次 `ingest` 会在仓库根生成 `knowledge/`(含 `INDEX.md` 与各论文 `notes.md`)。

- **建议提交**:演示前不必重新解析 PDF,评委也能直接看到「资产长什么样」
- 若不想提交,加一行 `.gitignore` 即可,但演示脚本要能现场重建

> 这条需要组内定一下,我不擅改 `.gitignore`。

### N7|C 模块「插电」具体改了什么(这是本轮的主要工作)

**之前的状态**:C 的 `store / match / generate / manifest` 全部有实现、有测试,但 `main.ts` 里 `skill` 出现 **0 次**——没有任何一处 `createSkillStore()`。于是:

- `PromptParts.skillManifest` 字段早就留好、`buildSystemPrompt` 的渲染分支也写了,但没人传值 → system prompt 里根本没有「可用技能」这一段
- `match()` 从未被调用 → `skill_load` 事件从未发出
- `generateSkillDraft()` 只在测试里调用 → 「论文 → 技能」链路断在中间

**现在**:三处接线全部完成。

1. **`ask`**:`createSkillStore(skillsRoot(), { events: bus })` → `manifest()` 注入 prompt(清单)→ `match(task)` 命中后 `renderSkillForPrompt()` 注入正文(懒加载)
2. **`ingest`**:`ingestPaper()` 成功 → `generateSkillDraft()` → 写进 `skills/_drafts/<skillId>.md`
3. **`skills` 子命令**:`list` 看现状 / `check` 查七节 / `promote` 晋升

**为什么草案必须在 `_drafts/` 而不能直接 `save()`**:`store.save()` 会硬拦 `validateSkillStructure()` 不通过的技能,而草案**按设计**就是不合格的——它推不出「判据」「失败模式」「工具映射」。`_drafts` 是 `skills/` 的子目录但没有 `SKILL.md`,`listSkillIds()` 会跳过它,技能库既不被污染、人又能在固定位置找到待办。

**实测(ReAct 一篇论文)**:

```
· 技能草案:skills/_drafts/paper-arxiv-2210.03629.md(待补 4 项)
    - 第 3 节「三、方法→工具映射」为空:需要 B 模块的真实工具名清单,生成器不猜工具名
    - 第 4 节「四、常见失败模式」为空:知识页里没有对应内容,需人工补写
    - 第 5 节「五、术语消歧」为空:知识页里没有对应内容,需人工补写
    - 第 7 节「七、负向约束」为空:知识页里没有对应内容,需人工补写
```

命中已有技能时:

```
📋 加载技能 外部 AI 生成代码的机械审查门禁 (按任务匹配,命中:ai 生成、审查、合入)
· 命中技能「外部 AI 生成代码的机械审查门禁」(ai-code-review-gate),正文已注入
```

三种降级都验证过:空技能库不注入任何块;有库但未命中只注入清单;命中才注入正文。

### N8|`skills/_drafts/` 要不要提交

和 N6 同理:草案是生成物,但它是"人工审核待办清单"的载体,提交上来组员能直接看到还差什么。

- **建议提交**(体积小,一份几 KB)
- 若不想提交,加 `skills/_drafts/` 到 `.gitignore`,但演示时得现场 `ingest` 才有

### N9|`agent/prompt.ts` 加了一个可选字段

`PromptParts` 新增 `skillBody?: string`,`PROMPT_LIMITS` 新增 `skillBody: 4_000`。

- **为什么和 `skillManifest` 分开**:清单预算 8k(元数据),正文预算 4k(单技能)。合成一个字段会让两者互相挤占
- **安全性**:`prompt.ts` 不在 6 个冻结契约内;纯新增可选字段,不传就不渲染,旧调用零影响
- 上一轮我给它加过 `availableTools`,这次是同一个文件,合并时注意别丢

---

## 4. 给 B / C / Web 的对接点

### 4.1 `knowledge_search` 工具(已注册)

| 项 | 值 |
|---|---|
| 名称 | `knowledge_search` |
| 只读 / 可并发 | 是 / 是 |
| 入参 | `{ query: string(1..300), limit?: 1..20 }`(strictObject,多余字段拒绝) |
| 返回 | `{ hits: [{ noteId, paperId, page, kind, description, quote, score }], stage, coarseCount, coarseMs, note }` |
| `summary` | `命中 3 条:arxiv:2210.03629#p1#eef101(p1)、…` |
| 未命中 | 仍是成功结果,summary 明确写「不要凭空引用」 |

`stage` 三态,供 UI 区分可信度:`coarse`(关键词)/ `refined`(模型精筛)/ `refined_fallback`(精筛失败已降级)。

### 4.2 可直接用的 store 方法

知识库(契约 8 个):`put / get / scan / select / link / index / listPaperIds`。
非契约但已实现且有测试:`putAll(notes, {title})`、`listByPaper(paperId)`、`backlinks(noteId)`、`rootDir`。

技能库(契约 5 个):`list / load / match / save / manifest`。
非契约:`createSkillStore(dir, { events, logger })` 的 `events` 现在是**真实接入的**(传 `bus` 就能收到 `skill_load`)。

### 4.3 给 B 的三条约定

1. **技能第 3 节「方法→工具映射」需要你的真实工具名清单**。生成器**不猜**工具名,不给就整节留空——本轮实测草案正是因此缺这一节。
2. `validateSkillStructure(skill, { knownTools })` 支持校验工具名是否存在,你的 registry 直接传进去即可。
3. 草案里第 3 节的长相是 `- ${method} → \`${tool}\``,你给 `toolMapping` 就能填上。

### 4.4 给 Web 的一个已知缺口(需要组内定)

`src/ui/events.ts` 定义了 `knowledge_hit`,但**当前没有任何地方能发出它**:
`ToolContext` 只有 `onProgress`,没有 `emit`;`tool_end` 事件里只有 `summary: string`,不含结构化命中数据。

三条路,建议第 2 条:

1. 改冻结契约 #2,给 `ToolContext` 加 `emit`(要 PR + approve)
2. 主循环在 `tool_end` 里附加 `data`(少量改动,但要动 `loop.ts`)
3. Web 解析 `summary` 字符串(不用改契约,但脆弱)

> `skill_load` **没有这个问题**——它由 `SkillStore` 通过 `events` 直接发出,已经能在 CLI 上看到。

---

## 5. 命令速查

```bash
# 沉淀:PDF → 知识页 → 索引 → 技能草案
node src/main.ts ingest fixtures/papers
node src/main.ts ingest fixtures/papers --force      # 覆盖已入库
node src/main.ts ingest --index-only                 # 只重建 INDEX.md
node src/main.ts ingest fixtures/papers --no-skill-draft   # 跳过技能草案

# 技能库运维
node src/main.ts skills list                         # 正式技能 + 待审草案
node src/main.ts skills check <id>                   # 查七节是否达标
node src/main.ts skills promote <草案id>              # 校验通过才写入技能库

# 换目录(演示/测试隔离)
KNOWLEDGE_DIR=logs/k SKILLS_DIR=logs/s node src/main.ts ingest fixtures/papers

# 消费
npm run demo                                         # 假 LLM,零额度
node src/main.ts ask "帮我审查这段 AI 生成的代码"      # 会命中示例技能并注入正文
node src/main.ts tools doctor                        # 应看到 5 个工具

# 验收
npm run verify                                       # 298 用例
node scripts/knowledge-probe.ts --store logs/a-store --query reasoning
```

---

## 6. 已知缺口(不在 A/C 范围内,但会影响整体验收)

| 缺口 | 影响 | 归属 |
|---|---|---|
| `paper/parse.ts` 的 `tables` / `figures` 恒为空数组 | AC-D1.3「表格转 Markdown」不达标;论文核心结果 80% 在表里 | 文献底座(骨架) |
| 段落自报页码仅 70.4% 正确 | 已由 A 的 quote 反查兜住(99.7%),但**其他模块不要直接信任 `paragraph.page`** | 文献底座 |
| PDF 标题清洗不干净 | 实测抽出 `REAC T : SYNERGIZING…`(多空格),技能名会带上 | 文献底座 |
| 真实 PDF 路径零单测覆盖 | `parse.test.ts` 全用合成文本,版式问题只能靠探针发现 | 文献底座 |
| `sciencepal_query` 的 replay 已做,**LLM 无回放** | AC-E1.2「全部外部调用可回放」只覆盖一半 | 骨架 |
| `tools doctor` 只列注册表,无 smoke test | AC-B5.1 未达标 | B |
| 子 Agent(FR-D4)零实现 | P1,可砍 | 骨架 |
| `web/` 只有 README | AC-F1~F4 全部未做 | 骨架 |

---

## 7. 需要组内拍板的 3 个问题

1. **`section?` 字段加不加**(N1)—— 不加,C 的证据索引只能按页码组织。
2. **`knowledge/` 与 `skills/_drafts/` 提交不提交**(N6 / N8)—— 影响演示脚本能否现场重建。
3. **`knowledge_hit` 事件怎么发**(4.4)—— 影响 Web 三面板能否实时高亮被引用的知识页。

> 拍板 1 之后 C 才能开始真实填写证据索引;拍板 3 之后 Web 的知识面板才能做实。
