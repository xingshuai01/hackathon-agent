# 代码编写规则(AI Agent 约束版)

| 项 | 值 |
|---|---|
| 适用对象 | 本项目**所有代码**,尤其是由 AI 编码工具(Cursor / Claude Code / Copilot 等)生成的代码 |
| 性质 | **强制性**。违反规则一的检查器会让 `npm run verify` 失败,PR 不能合 |
| 配套 | 编码风格细节见 [`wyh/代码开发规范.md`](./wyh/代码开发规范.md);本文只管**不许做什么** |
| 机械检查 | `scripts/check-rules.mjs`(5 组规则,见 §10 映射表) |
| 规则版本 | v1.0 · 2026-10-28 |

---

## 0. 为什么需要这份文件

用 AI 写代码,速度和风险是同一个东西。AI 会**很自信地**写出下面这些:

| 症状 | 真实后果 | 本项目里的具体例子 |
|---|---|---|
| **臆造 API** | 编译/运行直接崩 | 编造一个 `zod.toSchema()` 之类不存在的方法 |
| **顺手加依赖** | 依赖膨胀、版本冲突、多了个失败点 | 为了取时间装 `dayjs`,而 `Date.now()` 就够 |
| **引入框架** | 违反"自研 Agent 机制"的项目目标 | "我帮你用 LangChain 实现主循环" |
| **改契约而不是适配契约** | 全队并行开发立刻撞车 | 觉得 `Tool` 接口不好用,直接改签名 |
| **用 `any` 糊过去** | 类型保护失效,错误推到运行时 | `const resp: any = await fetch(...)` |
| **照抄参考对象的格式** | 对方是 Anthropic 格式,我们是 DeepSeek | 把 `tool_result` 塞进 user 消息 → API 400 |
| **在薄壳里写业务** | 违反架构约束,Web 崩了核心也崩 | 在 `web/server.ts` 里 import `services/knowledge` |
| **catch 后吞掉** | 现场出问题时查不到原因 | `try{...}catch{}` |
| **声称"测试通过"但没跑** | 交付时才发现炸 | — |

**AI 不是恶意的,它只是缺少上下文。** 这份文件就是把上下文补给它 —— 你可以在让 AI 动手前,把 §9 的协议和 [`AGENTS.md`](../AGENTS.md) 一起丢给它。

---

## 1. 三道防线

```
第一道:文档(本文)        ← 让 AI 知道边界
   ↓
第二道:机械检查(check-rules.mjs)  ← 让越界当场失败,而不是靠人记得
   ↓
第三道:冻结契约(6 个文件)      ← 改动必须 PR + 1 人 approve
```

> **只靠文档挡不住。** 所以本文的每一条「可机械检查」的规则都在 `scripts/check-rules.mjs` 里有一一对应的实现,跑 `npm run check:rules` 就能验证。

---

## 2. 十条铁律

> 「必须」= PR 会被打回;「禁止」= 检查器直接失败。

### 铁律 1 · 不许改冻结契约的签名
六个契约文件头部的 `★★★ 冻结契约 ★★★` 标记就是红线。

```
src/ui/events.ts                     src/services/knowledge/types.ts
src/tools/types.ts                   src/services/skills/types.ts
src/agent/types.ts                   src/services/paper/types.ts
```

**允许**:新增可选字段、新增导出函数、补充注释
**禁止**:改已有字段名/类型、删除字段、改函数签名、改判别字段的值

觉得契约不好用时的正确做法:在 Issue 里说明「我遇到什么场景、契约缺什么」,**等你确认后再改**,不要在 PR 里顺手改掉。

---

### 铁律 2 · 不许加依赖,除非先在决策台账记一条

允许清单(硬编码在检查器里):

| 类型 | 允许 |
|---|---|
| 生产依赖 | `zod`、`chalk`、`pdfjs-dist` |
| 开发依赖 | `typescript`、`@types/node` |

**明确禁止**的包(检查器会拦):`langchain`、`langgraph`、`autogen`、`ai`、`@ai-sdk/*`、`openai`、`@anthropic-ai/sdk`、`llamaindex`、`haystack`、`crewai`、`semantic-kernel`

理由:
- Agent 框架会让"系统学习 Agent 架构"这个目标作废(DEC-008)
- **DeepSeek 用原生 `fetch` 就够了,不需要任何 SDK**(DEC-028)

想加依赖的顺序:**先问「Node 原生能不能做」→ 能就不加 → 不能则在 `docs/DECISIONS.md` 记一条 → 再改白名单**。

---

### 铁律 3 · 不许 `any`

```ts
// ❌ 禁止
const resp: any = await fetch(url)
function handle(data: any) {}

// ✅ 正确
const resp: unknown = await fetch(url)
if (!isChatResponse(resp)) return toolFail('响应格式不符')
```

`tsconfig.json` 已开 `strict`,但 `any` 能绕过它,所以必须单独拦。

**确实无法避免时**:在该行末尾加 `// rule-ignore no-any 理由`,并在 PR 描述里说明。检查器认这个豁免,但**人要看理由**。

---

### 铁律 4 · 不许 `enum` / `namespace`

不是风格问题 —— **Node 的类型剥离模式跑不了这两种语法**,写了运行时就崩。

```ts
// ❌ 禁止
enum Kind { Claim, Method }

// ✅ 正确
export const NOTE_KIND = { claim: 'claim', method: 'method' } as const
export type NoteKind = (typeof NOTE_KIND)[keyof typeof NOTE_KIND]
```

`tsconfig.json` 的 `erasableSyntaxOnly: true` 会先帮你挡一层。

---

### 铁律 5 · 不许改数据铁律

四条数据铁律(见 [`SDD.md`](./SDD.md) §5)是产品的可信度基础,**任何"优化"都不能绕过**:

| # | 铁律 |
|---|---|
| 1 | 无 `paperId` + `page` 锚点的信息不得进入 A 知识库 |
| 2 | 无 `evidencePage` 的方法不得进入 B 工具库 |
| 3 | `parseQuality.pagesParsed/pagesTotal < 0.7` → 标 `quarantined`,不进抽取队列 |
| 4 | 技能未经人工审核不得转 `active` |

典型违规写法:`page: 0` 占位(检查器会拦)、把 `pagesParsed` 直接等于 `pagesTotal` 蒙过门控。

---

### 铁律 6 · 消息格式必须按 DeepSeek/OpenAI,不许按 Anthropic

这是本项目最容易踩的坑,因为我们的参考对象用的是 Anthropic 格式。

| 环节 | ❌ Anthropic(不要抄) | ✅ DeepSeek(本项目) |
|---|---|---|
| 工具请求 | `content[]` 里的 `tool_use` 块 | `message.tool_calls[]` |
| 参数形态 | `input` 对象 | `arguments` **JSON 字符串**,要 `parseToolArguments()` |
| 结果回填 | user 消息内嵌 `tool_result` | **独立** `{ role:'tool', tool_call_id, content }` |
| 失败标志 | `is_error: true` | 无此字段,错误文本进 `content` |
| 判断有无工具调用 | 遍历 content 块 | 看 `tool_calls` 数组存在且非空 |

**禁止**自己写 `JSON.parse(call.function.arguments)`,**必须**用 `parseToolArguments()` —— 它把解析失败转成结构化结果,让主循环能回填错误重试。

---

### 铁律 7 · 不许在 Web 层写业务逻辑(薄壳约束)

`web/` 目录**只能** import:

```ts
import { createServer } from 'node:http'        // ✅ Node 内置
import { bus } from '../src/ui/events.ts'       // ✅ 事件总线
import { something } from './local-helper.ts'   // ✅ 自己的文件
```

**禁止**:

```ts
import { LocalMarkdownStore } from '../src/services/knowledge/localMarkdown.ts'  // ❌
import { loop } from '../src/agent/loop.ts'                                      // ❌
```

理由(NFR-12):Web 是薄壳。一旦 Web 能直接调业务,就会出现"两套逻辑",且 Web 出 bug 会连带核心不可用。

**Web 需要数据怎么办**:核心层发事件 → Web 订阅;或访问 `GET /api/*` → 服务端读文件系统。两条都只碰数据,不碰逻辑。

---

### 铁律 8 · 不许吞异常

```ts
// ❌ 禁止
try { await doSomething() } catch {}

// ✅ 正确:转成结构化结果,由主循环回填给模型
try {
  return await tool.call(input, ctx)
} catch (err) {
  return toolFail(`工具内部异常:${err instanceof Error ? err.message : String(err)}`)
}
```

**本项目的总原则:进程永不崩。** 任何失败都必须变成「部分结果 + 失败说明」。

唯一的例外是 `EventBus.emit` —— 它故意吞掉渲染器的异常(见 `src/ui/events.ts` 的注释),因为一个渲染器写错不该带崩主循环。

---

### 铁律 9 · 不许留 TODO 当实现

```ts
// ❌ 禁止
async call() { throw new Error('Not implemented') }

// ✅ 正确
async call() { return toolFail('PDFReadTool 尚未实现(Issue #23)') }
```

检查器会拦 `throw new Error('TODO' | 'Not implemented')`。

---

### 铁律 10 · 不许声称"测试通过"而不跑

在 PR 描述里写"已完成,测试通过"之前,**必须真的跑过**:

```bash
npm run verify
```

它会依次跑 `typecheck` → `check:rules` → `test`。把输出贴到 PR 里。

> 这条是给人看的,也是给 AI 看的。**AI 最常见的谎是"我已经验证过了"**,而它其实没跑。

---

## 3. 模块边界

依据 [`SDD.md`](./SDD.md) §3.2 的 R1–R5。检查器会拦越界 import。

| 目录 | 可以 import | 不可以 import | 理由 |
|---|---|---|---|
| `web/` | `node:*`、`../src/ui/events.ts`、`./*` | 其余一切 | 薄壳约束(NFR-12) |
| `src/tools/` | `node:*`、`zod`、`../`、`./` | `services/llm` | 工具不直接依赖 LLM(R2) |
| `src/agent/` | 契约文件、`src/tools/types.ts` | 具体工具实现 | 编排层只认接口(R1) |
| `src/services/` | 同层服务、契约 | `src/agent/` | 底层不反向依赖上层(R5) |
| `src/ui/` | `node:*`、契约 | `services/`、`tools/` 实现 | 渲染层只消费事件与类型 |

**三个模块之间**(knowledge / skills / toolsynth)**只能通过契约交互**,不得互相 import 实现(R3)。

---

## 4. 类型与语法约束

| 约束 | 手段 | 谁在管 |
|---|---|---|
| `strict` 全开 | tsconfig | tsc |
| 禁止 `enum`/`namespace`/参数属性 | `erasableSyntaxOnly` | tsc + 检查器 |
| import 必须带 `.ts` 扩展名 | `allowImportingTsExtensions` | tsc |
| 数组下标访问要判空 | `noUncheckedIndexedAccess` | tsc |
| 可选属性不能赋 `undefined` | `exactOptionalPropertyTypes` | tsc |
| 禁止 `any` | 静态扫描 | 检查器 |

`exactOptionalPropertyTypes` 的常见坑:

```ts
// ❌ 报错
const r: ToolResult = { ok:false, error:'x', hint: undefined }

// ✅ 正确
const r: ToolResult = hint ? { ok:false, error:'x', hint } : { ok:false, error:'x' }
```

---

## 5. 错误处理

| 场景 | 做法 |
|---|---|
| 工具内部异常 | catch → `toolFail(...)`,**不 throw** |
| schema 校验失败 | 让 `invokeTool()` 处理,不要自己手写 if 判断 |
| `arguments` 非法 JSON | 用 `parseToolArguments()`,它返回结构化错误 |
| 外部 API 失败 | 指数退避重试 2–3 次,仍失败则返回失败结果 |
| 单篇论文解析失败 | 标记 `quarantined` 并跳过,**不中断批量** |
| 渲染器抛错 | 由 `EventBus.emit` 吞掉,不影响其他渲染器 |
| 配置缺失 | 启动时立即失败,报错信息含「变量名 + 到哪填 + 示例」 |

**统一原则**:任何失败都要能被"回填给模型"或"写进运行报告",而不是让进程崩掉。

---

## 6. 测试要求

| 改了什么 | 必须补什么 |
|---|---|
| 新增工具 | 该工具的 smoke test(给定输入断言输出) |
| 改契约 | `test/contracts.test.ts` 必须仍然通过;**不许改测试来迁就实现** |
| 新增纯函数(校验/分区/解析) | 单测,含**失败路径** |
| 新增外部调用 | `replay` 模式的回放用例 |
| 修 bug | 一个能复现该 bug 的测试(否则下次还会坏) |

**测试禁忌**:
- ❌ 为了让它过而删除断言
- ❌ 只测 happy path
- ❌ 用 `any` 绕过类型检查来写测试
- ❌ 提交前没真跑(见铁律 10)

---

## 7. 命名与文件组织

| 对象 | 规范 | 例 |
|---|---|---|
| 目录 | kebab-case 或单词 | `src/services/toolsynth/` |
| 文件 | 小驼峰或 kebab | `localMarkdown.ts`、`check-rules.mjs` |
| 类型 / 接口 | PascalCase | `AtomicNote`、`KnowledgeStore` |
| 函数 / 变量 | camelCase | `validateNote()` |
| 常量 | UPPER_SNAKE | `TOOL_DEFAULTS`、`SKILL_MANIFEST_LIMITS` |
| 工具名 | snake_case,只含 `[a-zA-Z0-9_]` | `knowledge_search`(DeepSeek 硬限制) |
| 类型文件 | `types.ts` | 每个模块一个 |

**一个文件一个职责**。`types.ts` 只放类型与契约级工具函数,不放业务流程。

---

## 8. 提交前自检清单

复制这段到 PR 描述里,逐项打勾:

```markdown
- [ ] `npm run verify` 通过(typecheck + 规则检查 + 测试),输出已贴在本 PR
- [ ] 没有改动「★★★ 冻结契约」文件的既有签名
- [ ] 没有新增依赖(或已在 DECISIONS.md 记了决策)
- [ ] 没有 `any`、没有 `enum` / `namespace`
- [ ] 没有空 catch,所有失败都能被回填或写进报告
- [ ] 我改的文件没有和队友正在改的冲突(CONTRIBUTING §1)
- [ ] 涉及数据模型的:四条数据铁律都还成立
- [ ] 涉及消息格式的:按 DeepSeek 格式,不是 Anthropic
- [ ] 涉及 web/ 的:只 import 了 node 内置与事件总线
- [ ] PR 描述写了「这个 PR 不做什么」
```

---

## 9. 给 AI Agent 的作业协议

> 让 AI 动手前,把这一节(或 [`AGENTS.md`](../AGENTS.md))贴给它。

```
【项目硬约束 · 必须遵守】

1. 动手前先读这三个文件,不要凭印象:
   - AGENTS.md                       硬约束速查
   - docs/DECISIONS.md               为什么是这样
   - docs/SDD.md §4 契约 + §6.3 红线

2. 冻结契约文件(★★★ 标记)只读:
   src/ui/events.ts, src/tools/types.ts, src/agent/types.ts,
   src/services/knowledge/types.ts, src/services/skills/types.ts,
   src/services/paper/types.ts
   如果契约不够用,不要改它 —— 告诉我缺什么。

3. 不许新增依赖。允许清单:zod, chalk, pdfjs-dist。
   需要别的能力时,先问「Node 原生能不能做」。

4. 不许用 any、enum、namespace。不存在的 API 不要编 —— 不确定就查
   node_modules 里的实际类型声明,或直接问我。

5. 消息格式是 DeepSeek/OpenAI 兼容格式,不是 Anthropic:
   工具结果回填用独立的 { role:'tool', tool_call_id, content } 消息,
   不是塞进 user 消息。arguments 是 JSON 字符串,用 parseToolArguments() 解析。

6. 工具内部不许 throw,失败要返回 toolFail(...)。
   任何情况都不能让进程崩。

7. 一次只改一件事。改动超过 5 个文件时先停一下,拆成多个 PR。
   不要顺手重构我没让你改的代码。

8. 改完必须真跑 npm run verify 并把输出贴出来。
   不许说「应该能过」或「已完成,测试通过」而没有输出。

9. 不确定的地方停下来问我,不要猜。猜错的代价比问一句高得多。
```

---

## 10. 规则 ↔ 检查器映射表

| 检查器规则名 | 等级 | 检查什么 | 对应铁律 |
|---|---|---|---|
| `dep-whitelist` | ❌ 失败 | `package.json` 依赖是否在白名单 | 铁律 2 |
| `banned-package` | ❌ 失败 | 是否 import 了被禁的 Agent 框架 | 铁律 2 |
| `no-any` | ❌ 失败 | 是否使用 `any` | 铁律 3 |
| `no-enum` | ❌ 失败 | 是否使用 `enum` | 铁律 4 |
| `no-namespace` | ❌ 失败 | 是否使用 `namespace` | 铁律 4 |
| `no-todo-throw` | ❌ 失败 | 是否用 throw 表示未实现 | 铁律 9 |
| `import-boundary` | ❌ 失败 | 是否越界 import | 铁律 7、§3 |
| `contract-missing` | ❌ 失败 | 契约文件是否存在 | 铁律 1 |
| `contract-marker` | ❌ 失败 | 契约文件是否带 ★ 标记 | 铁律 1 |
| `anchor-placeholder` | ❌ 失败 | 是否用 `page: 0` 占位 | 铁律 5 |

**豁免机制**:违规行末尾加 `// rule-ignore <规则名> 理由`。
豁免必须能被 review 看见并认可 —— 它不是"关掉检查",而是"声明这一处是例外,并由人确认"。

---

## 11. 违规怎么处理

| 情况 | 处理 |
|---|---|
| 检查器失败 | PR 不能合。自己修,别去改检查器 |
| 改了冻结契约签名 | 打回,恢复后再讨论 |
| 新增了依赖 | 打回,先在 DECISIONS.md 记决策 |
| 绕过检查(如批量加 `rule-ignore`) | 视为破坏协作,在群里说明并回滚 |
| 声称测过但没跑 | 记录在案;第二次发生则该 PR 全部重测 |

> 这份规则的目的不是限制你,是让三个人在 4 天里不会互相踩。**宁可流程重一点,不要 D3 晚上合并冲突。**
