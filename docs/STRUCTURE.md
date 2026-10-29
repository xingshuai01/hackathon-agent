# 项目结构与分工

> 本文回答一个问题:**四个人各自能改哪些文件,以及谁要等谁。**
> 变更契约见 [`SDD.md`](./SDD.md) §4;规则见 [`CODE-RULES.md`](./CODE-RULES.md);为什么这样分见 [`DECISIONS.md`](./DECISIONS.md)。

| 项 | 值 |
|---|---|
| 团队 | 4 人:1 人骨架 + 3 人各一个模块 |
| 版本 | v1.0 · 2026-10-28 |
| 核心原则 | **文件级所有权** —— 一个文件只能有一个人改 |

---

## 1. 四个人怎么分

| 角色 | 负责范围 | 对应 Issue |
|---|---|---|
| **你(骨架)** | Agent 内核 + 共享底座 + Web 外壳 + 工程门禁 | #22 #23 #24 #31 #32 #36 #37 #40 |
| **同学 1 · 模块 A** | 个人知识库:论文 → 原子知识页 → 检索 | #25 #26 #27 #28 |
| **同学 2 · 模块 B** | 工具库:方法 → 可执行工具 → 体检 | #29 #30 #35 |
| **同学 3 · 模块 C** | 技能库:七节结构 → 匹配 → 注入 | #33 #34 |

> Q4(团队分工)到这一步已经实质解决了。把上面四行填上真实姓名即可关闭。

### 为什么这样分能并行

三个模块的**输入输出类型全部已经冻结**(`PaperDoc`、`AtomicNote`、`Tool`、`Skill`),所以:

```
同学1 可以立刻开始:PaperDoc → AtomicNote     (契约已给,自己造 mock PaperDoc 即可)
同学2 可以立刻开始:PaperDoc → MethodSpec     (同上)
同学3 可以立刻开始:Skill 的存储/匹配/注入     (契约已给,自己造 mock Skill 即可)

你  可以立刻开始:loop + llm + registry       (三个模块都还没实现,用 FakeLLM 和 mock 工具测)
```

**没有人需要等别人。** 这是契约先行的价值 —— 如果先写实现再定接口,三个人会花两天互相等。

---

## 2. 目录总览

标注含义:`[骨架]` = 你负责 · `[A]` `[B]` `[C]` = 三位同学 · `★` = 冻结契约(改动需 PR + 1 approve)

```
hackathon-agent/
│
├── src/
│   ├── main.ts                              ✅ CLI 入口:ask / tools doctor / ingest / web
│   │
│   ├── ui/                                  [骨架] 渲染层(只消费事件,不含业务)
│   │   ├── events.ts                        ★ 9 种事件 + EventBus
│   │   ├── renderCli.ts                     ✅ CLI 渲染器(ANSI 上色,零依赖)
│   │   └── renderProgress.ts                进度输出                                  [待写]
│   │
│   ├── agent/                               [骨架] 编排层(全项目心脏)
│   │   ├── types.ts                         ★ Message / LoopEndReason / partitionToolCalls
│   │   ├── loop.ts                          ✅ 主循环(约 230 行,含四条红线)
│   │   ├── subagent.ts                      子 Agent 派生(独立上下文 + 工具白名单)  [待写 #22]
│   │   ├── registry.ts                      ✅ 工具注册表(含 B 模块生成的工具)
│   │   ├── prompt.ts                        ✅ system prompt 组装(注入知识索引 + 技能清单)
│   │   ├── fakeLlm.ts                       ✅ 剧本化假 LLM(--fake 演示与单测)
│   │   └── budget.ts                        token 预算与分段压缩                      [待写]
│   │
│   ├── tools/                               [骨架] 工具层
│   │   ├── types.ts                         ★ Tool / fail-closed 能力位 / 三段式管线
│   │   ├── infra.ts                         ✅ echo / now / calc(演示与自检)
│   │   ├── sciencepal.ts                    ✅ SciencePal 工具节点(DEC-032)
│   │   └── generated/                       [B] B 模块产出的工具落这里(见该目录 README)
│   │
│   ├── config/
│   │   └── env.ts                           ✅ 极简 .env 加载器(零依赖,不引入 dotenv)
│   │
│   └── services/
│       ├── llm/                             [骨架] DeepSeek 客户端 ✅(types/stream/retry/deepseek)
│       │   ├── deepseek.ts                  原生 fetch 直连(零 SDK)
│       │   ├── stream.ts                    SSE 解析 + tool_calls 按 index 拼装
│       │   ├── retry.ts                     指数退避 + retry-after
│       │   └── sideQuery.ts                 便宜模型 + json_object(给 A/B/C 用于"选/抽")
│       │
│       ├── paper/                           [骨架] 共享底座(A/B/C 的唯一共同上游)
│       │   ├── types.ts                     ★ PaperDoc / gateByParseQuality
│       │   ├── parse.ts                     ✅ PDF → PaperDoc(pdfjs 按页取文本,页码 100%)
│       │   └── fetch.ts                     arXiv 元数据/HTML 优先                      [待写]
│       │
│       ├── trace/                           [骨架] 运行追踪
│       │   ├── writer.ts                    JSONL 写入
│       │   └── replay.ts                    离线回放
│       │
│       ├── cache/                           [骨架] fixtures 读写
│       │   └── fixtures.ts
│       │
│       ├── knowledge/                       [A] 模块 A · 个人知识库
│       │   ├── types.ts                     ★ AtomicNote / KnowledgeStore / validateNote
│       │   ├── extract.ts                   PaperDoc → AtomicNote[](一论断一页)
│       │   ├── localMarkdown.ts             KnowledgeStore 唯一实现
│       │   ├── index.ts                     INDEX.md 生成(截断 120 行 / 15KB)
│       │   └── select.ts                    两段式检索:关键词粗筛 + LLM 精筛
│       │
│       ├── toolsynth/                       [B] 模块 B · 工具库(全项目风险最高)
│       │   ├── extract.ts                   PaperDoc → MethodSpec(证据页码必填)
│       │   ├── render.ts                    MethodSpec → Tool 代码(模板填充,非 LLM 写代码)
│       │   ├── smoke.ts                     生成的工具跑 smoke test
│       │   └── doctor.ts                    tools doctor 体检 + 通过率
│       │
│       └── skills/                          [C] 模块 C · 技能库
│           ├── types.ts                     ★ Skill 七节 / SkillStore / validateSkillStructure
│           ├── store.ts                     SkillStore 实现(读写 skills/<id>/SKILL.md)
│           ├── match.ts                     when_to_use 匹配
│           ├── manifest.ts                  清单注入(1% 预算 + 超预算压成名字)
│           └── generate.ts                  知识页聚合 → 技能草案(needs_review)
│
├── web/                                     [骨架] Web 薄壳(不得 import services/)
│   ├── server.ts                            ✅ node:http + SSE + 静态文件 + 端口顺延
│   └── public/
│       ├── index.html                       ✅ 单页,零构建零框架
│       ├── app.js                           ✅ EventSource + DOM 渲染
│       └── style.css                        ✅ 深色主题,无 CDN
│
├── scripts/
│   ├── check-rules.mjs                      规则检查器(含模块隔离检查)
│   └── demo.sh                              [骨架] 一键演示
│
├── test/
│   ├── contracts.test.ts                    [骨架] 契约自检 38 项(谁改契约都要它绿)
│   ├── knowledge/                           [A]
│   ├── toolsynth/                           [B]
│   └── skills/                              [C]
│
├── knowledge/                               [A] 产物:知识页
├── skills/                                  [C] 产物:技能文件
├── fixtures/                                [骨架] 回放数据(入库)
├── data/                                    原始论文(不入库,仅 README)
├── out/  logs/                              运行产物(不入库)
│
├── docs/  ·  AGENTS.md  ·  README.md  ·  package.json  ·  tsconfig.json
└── claude-code-main/                        ⛔ 第三方参考源码,已 gitignore,绝不入库
```

---

## 3. 所有权表(最重要的一张表)

**规则:一个文件只有一个人改。** 想改别人的文件,先在群里说,由那个人改。

### 你能改的

```
src/main.ts
src/ui/**            (除 events.ts 的签名)
src/agent/**         (除 types.ts 的签名)
src/tools/**         (除 types.ts 的签名、除 generated/)
src/services/llm/**
src/services/paper/**   (除 types.ts 的签名)
src/services/trace/**
src/services/cache/**
web/**
scripts/**
test/contracts.test.ts
```

### 同学 1(模块 A)能改的

```
src/services/knowledge/**    ← 除 types.ts 的签名
test/knowledge/**
knowledge/**                 ← 产物目录
```

### 同学 2(模块 B)能改的

```
src/services/toolsynth/**
src/tools/generated/**
test/toolsynth/**
```

### 同学 3(模块 C)能改的

```
src/services/skills/**       ← 除 types.ts 的签名
test/skills/**
skills/**                    ← 产物目录
```

### 六份冻结契约(谁都不能改签名)

```
src/ui/events.ts
src/tools/types.ts
src/agent/types.ts
src/services/knowledge/types.ts
src/services/skills/types.ts
src/services/paper/types.ts
```

**允许**在原文件里新增导出函数/注释;
**禁止**改已有字段名、类型、函数签名、判别字段的值。

不够用时:开 Issue 说明「什么场景、缺什么」,**不要自己改**。

---

## 4. 每个模块的 import 边界

检查器(`scripts/check-rules.mjs`)会**机械拦截**越界 import。三个模块之间**只能通过契约交互**,不得互相 import 实现。

| 目录 | 可以 import | **不能** import |
|---|---|---|
| `src/services/knowledge/` | `node:*`、`zod`、`./*`、`../paper/*`、`../llm/*`、`../cache/*`、`../trace/*`、契约 | `../skills/*`、`../toolsynth/*` |
| `src/services/toolsynth/` | `node:*`、`zod`、`./*`、`../paper/*`、`../llm/*`、`../cache/*`、`../../tools/types.ts`、契约 | `../knowledge/*`、`../skills/*` |
| `src/services/skills/` | `node:*`、`zod`、`./*`、`../llm/*`、`../cache/*`、契约 | `../knowledge/*`、`../toolsynth/*` |
| `web/` | `node:*`、`../src/ui/events.ts`、`./*` | **其余一切** |
| `src/tools/` | `node:*`、`zod`、`../`、`./` | `services/llm` |

### 需要别人的数据怎么办

```
❌ 同学3 想读知识页 → import knowledge/localMarkdown.ts
✅ 同学3 想读知识页 → 通过 KnowledgeStore 接口(把一个实现当参数传进来)
                       或者在 match.ts 里接收 `notes: readonly AtomicNote[]`
```

同理,同学 2 需要知识页 → 接收 `AtomicNote[]` 作为参数,不要 import 同学 1 的实现。

**判据:如果你的模块需要一个别人产出的数据,把它做成函数参数,而不是 import 对方的实现。** 这样单测时你可以直接传 mock。

---

## 5. 并行开发顺序

### 第一天(D1)各自动手,不用等

| 角色 | 立即开始 | 完成标志 |
|---|---|---|
| 你 | `llm/deepseek.ts` → `agent/loop.ts`(用 FakeLLM 测) | 主循环能跑通一轮 tool_call,不花 API |
| 同学 1 | `knowledge/extract.ts`(接收 mock `PaperDoc`) | 能从一个假 PaperDoc 产出 ≥5 条合格 AtomicNote |
| 同学 2 | `toolsynth/extract.ts`(接收 mock `PaperDoc`,用 `sideQuery`) | 能抽出 ≥3 个 MethodSpec,带证据页码 |
| 同学 3 | `skills/store.ts` + `skills/match.ts`(自己造 mock Skill) | 能存/读/匹配一个七节技能,校验拦得住缺节 |

### 谁卡谁(以及怎么破)

```
你(paper/)  ──▶ 同学1  ──▶ 同学3
   │              │
   └──▶ 同学2 ◀───┘

关键路径:
1. 你 的 registry.ts 卡 同学2 的 doctor.ts(工具注册后才能体检)
   破法:同学2 先做 extract + render(纯函数,不依赖 registry),doctor 后补

2. 同学1 的知识页 卡 同学3 的 generate.ts(技能草案从知识页聚合)
   破法:同学3 先用 mock AtomicNote[] 开发,最后接真数据

3. 你 的 prompt.ts 卡 同学3 的 manifest.ts(清单要注入 system prompt)
   破法:manifest() 只负责产出**字符串**,怎么拼进 prompt 是你的事。
        同学3 只要保证 manifest() 返回格式正确即可
```

**一句话:所有跨模块依赖都做成函数参数 + 接口,就没有真正的阻塞。**

---

## 6. 冲突预防规则

| 规则 | 原因 |
|---|---|
| 一个文件只有一个人改 | 根本性的冲突预防 |
| 每个 PR ≤ 5 个文件、≤ 400 行 | 大了 review 不动,也更容易撞车 |
| 每天收工前 push | 别攒着 |
| 改公共代码(契约/检查器/package.json)前先群里说 | 影响面最大 |
| 合并前先 `git pull --rebase` | 保持历史线性,方便 squash |
| **不重构别人正在改的文件** | 即使你觉得它写得丑 |

### 冲突高发区预警

| 文件 | 风险 | 处置 |
|---|---|---|
| `package.json` | 有人加依赖 | 只有你能改;别人要加依赖先找你 |
| `scripts/check-rules.mjs` | 有人想关掉检查 | 只有你能改 |
| 六份契约 | 有人觉得不好用就改 | PR + 1 approve,见 §3 |
| `README.md` | 大家都想加自己的东西 | 由你统一维护,别人提建议 |

---

## 7. 每天的合并节奏

```
早上    git pull --rebase → 看 Issues 认领 → 开工
中午    至少 push 一次(哪怕没做完),让别人看到你在改什么
17:00   硬检查点(见下),过不了就按 SRS §3.3 裁剪
18:00   收工前:分支已 push、Issue 状态更新、main 能跑
```

### 四个硬检查点

| 时点 | 检查 | 未通过则 |
|---|---|---|
| D1 10:00 | 每人用自己的 key 调通一次 DeepSeek | 立刻换 key / 换人负责 |
| D1 12:00 | 四份契约在 main 上 + 分工确认 | 按本文默认分工执行 |
| D2 17:00 | A 知识库闭环跑通(1 篇论文 → ≥5 知识页 → 可检索) | 砍 B 到 1 个工具,C 改手写 |
| D3 17:00 | `ingest` + `ask` 两条命令贯通 | 冻结新功能,全员转 demo 稳定性 |

---

## 8. 每个模块的完成判据

自检用,也是 PR 的验收标准。

### 你(骨架)

- [ ] `loop.ts` 用 FakeLLM 单测覆盖:多工具、失败回填、MAX_TURNS、中断、预算
- [ ] `llm/deepseek.ts` 真实调通一次,流式文本可见
- [ ] `registry.ts` 能注册手写工具 + 生成工具,只有 active 的进可调用池
- [ ] `paper/parse.ts` 1 篇真实论文出 `PaperDoc`,`page` 全非空
- [ ] `web/server.ts` SSE 能推送全部 9 种事件,Web 崩了 CLI 可用

### 同学 1(模块 A)

- [ ] 单篇论文产出 5–20 条原子知识页,每条 `page` 非空
- [ ] `validateNote()` 拦得住无锚点/描述过短
- [ ] 落盘为 `knowledge/<paperId>/{meta.md,notes.md}` + `INDEX.md`
- [ ] 两段式检索:粗筛 <1s,精筛 ≤8 条且做过白名单过滤
- [ ] 同一论文重复入库默认跳过

### 同学 2(模块 B)

- [ ] 至少 3 个 `MethodSpec` 带 `evidencePage`
- [ ] 生成的工具符合 `Tool` 接口,代码由**模板填充**而非 LLM 自由生成
- [ ] 每个工具独立 smoke test,`tools doctor` 输出通过率
- [ ] 未过 smoke 的工具标 `draft`,**不进**可调用池
- [ ] 通过率 ≥60%

### 同学 3(模块 C)

- [ ] 手写 1 个真实科研技能通过 `validateSkillStructure()`
- [ ] 缺节 / 失败模式<3 条 → `incomplete`,**拒绝加载**
- [ ] `manifest()` 在超预算时能把次要技能压成纯名字
- [ ] `match()` 抽 5 个任务,≥4 次匹配正确
- [ ] `generate.ts` 产出标 `needs_review`,人工审核后才 `active`

---

## 9. 目录还没建全的部分

以下目录由各自负责人**在动手时创建**,不要提前建空文件:

```
src/agent/{loop,subagent,registry,prompt,budget}.ts     ← 你
src/services/llm/{deepseek,stream,retry,sideQuery}.ts   ← 你
src/services/paper/{fetch,parse}.ts                     ← 你
src/services/trace/{writer,replay}.ts                   ← 你
src/services/cache/fixtures.ts                          ← 你
src/ui/{renderCli,renderProgress}.ts                    ← 你
web/{server.ts,public/*}                                ← 你

src/services/knowledge/{extract,localMarkdown,index,select}.ts   ← 同学1
src/services/toolsynth/{extract,render,smoke,doctor}.ts          ← 同学2
src/services/skills/{store,match,manifest,generate}.ts           ← 同学3
```

> 为什么留空:空文件会让人误以为"已完成"。目录已经建好、README 已经写明职责,足够开工了。
