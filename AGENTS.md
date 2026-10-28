# AGENTS.md

> **给 AI 编码工具(Cursor / Claude Code / Copilot 等)的硬约束。**
> 你在这个仓库里写代码前,必须读完本文件。详细规则见 [`docs/CODE-RULES.md`](docs/CODE-RULES.md)。
> 这份文件同时适用于人类:人也要守同样的规则。

---

## 0. 项目是什么

一个**科研领域 Agent**,创新点是三个模块。别把它做成通用聊天机器人。

| 模块 | 做什么 | 一句话 |
|---|---|---|
| **A 个人知识库** | 论文 → 原子知识页(带页码锚点) | 记「是什么」 |
| **B 工具库** | 从论文抽出方法 → 可执行工具 | 做「怎么做」 |
| **C 技能库** | 跨论文共识 → 技能文件(七节) | 判「该做什么」 |

Docs 阅读顺序:`docs/DECISIONS.md`(为什么)→ `docs/SRS.md`(做什么)→ `docs/SDD.md`(怎么做)。

---

## 1. 六条硬约束(违反会被机械检查拦下)

### ① 冻结契约文件只读

头部有 `★★★ 冻结契约 ★★★` 的六个文件,**不许改既有签名**:

```
src/ui/events.ts
src/tools/types.ts
src/agent/types.ts
src/services/knowledge/types.ts
src/services/skills/types.ts
src/services/paper/types.ts
```

**契约不够用时,停下来告诉人类缺什么,不要自己改。** 改了会让另外两个人的并行工作立刻撞车。

### ② 不许新增依赖

白名单:`zod`、`chalk`、`pdfjs-dist`(生产);`typescript`、`@types/node`(开发)。

被明确禁止:`langchain`、`langgraph`、`autogen`、`ai`、`@ai-sdk/*`、`openai`、`@anthropic-ai/sdk`、`llamaindex`、`haystack`、`crewai`。

> **LLM 是 DeepSeek,用 Node 原生 `fetch` 直调。不需要任何 SDK。**

### ③ 不许 `any` / `enum` / `namespace`

- `any` → 用 `unknown` + 收窄
- `enum` → 用 `as const` 对象 + 联合类型(**Node 的类型剥离跑不了 enum**)
- `namespace` → 用 ES module

### ④ 消息格式是 DeepSeek/OpenAI,**不是 Anthropic**

参考对象 Claude Code 用 Anthropic 格式,照抄会 API 400。

| 环节 | 必须这么写 |
|---|---|
| 判断有无工具调用 | 看 `message.tool_calls` 数组,不看 `finish_reason` |
| 解析参数 | 用 `parseToolArguments(call)`,**不要**直接 `JSON.parse` |
| 回填结果 | 独立的 `{ role:'tool', tool_call_id, content }` 消息 |
| 工具失败 | 错误文本写进 `content`,没有 `is_error` 字段 |
| 思考模式 | `thinking: {type:'disabled'}` —— 开启后不支持 `tool_choice:required` |

### ⑤ 工具内部不许 `throw`

```ts
// ✅
async call(input, ctx) {
  try { return toolOk(data, '已完成') }
  catch (err) { return toolFail(`失败:${msg(err)}`) }
}
```

**进程永不崩。** 所有失败都要变成「部分结果 + 失败说明」,回填给模型重试。

### ⑥ `web/` 是薄壳,不许写业务逻辑

`web/` 只能 import:`node:*`、`../src/ui/events.ts`、`./*`。

**禁止** import `src/services/`、`src/agent/`、`src/tools/` 的实现。需要数据就读文件系统或订阅事件。

---

## 2. 四条数据铁律(产品可信度的基础,任何"优化"都不能绕过)

1. 无 `paperId` + `page` 锚点的信息**不得**进入知识库
2. 无 `evidencePage` 的方法**不得**进入工具库
3. `parseQuality.pagesParsed/pagesTotal < 0.7` → 标 `quarantined`,不参与抽取
4. 技能未经人工审核**不得**转 `active`

用 `validateNote()` / `validateSkillStructure()` / `gateByParseQuality()` 来保证,不要自己实现判断。

---

## 3. 作业流程

```
1. 读 AGENTS.md(本文)+ docs/DECISIONS.md 里与你任务相关的条目
2. 找到对应的 GitHub Issue,读它的「验收标准」
3. 读你要改的那个契约文件 —— 你的实现必须符合它
4. 只改这一件事。改动超过 5 个文件时先停,拆成多个 PR
5. 跑 npm run verify,把输出贴出来
6. 提交:Conventional Commits,PR 标题带 Closes #<issue号>
```

### 不确定就问,不要猜

- 不确定某个 API 是否存在 → 去 `node_modules/*/dist/*.d.ts` 里查,或问人类
- 不确定契约够不够用 → 问人类
- 不确定要不要加依赖 → 问人类
- **不许编造不存在的函数、字段、行为**

---

## 4. 提交前必须真跑

```bash
npm run verify
```

依次执行 `typecheck` → `check:rules` → `test`。三项全绿才能提交。

> **不要写「已完成,测试通过」而没有实际输出。** 这是 AI 最常见的错误,也是最容易被发现的。

---

## 5. 常用命令

```bash
npm install            # 首次(若 npm 缓存报权限错误,加 --cache ./.tools/npm-cache)
npm run verify         # 提交前必跑
npm run typecheck      # 只做类型检查
npm run check:rules    # 只跑规则检查
npm test               # 只跑测试
```

**环境注意**:
- 项目路径含空格,脚本里的路径必须加引号
- git/gh 需显式配代理 `http://127.0.0.1:7892`(命令行工具不读系统代理)
- `claude-code-main/` 是第三方参考源码,**已 gitignore,绝不入库,也不要复制其实现代码**

---

## 6. 豁免

确实无法避免某条规则时,在违规行末尾加:

```ts
const RE_ANY = /any/  // rule-ignore no-any 这是检测规则本身的正则字面量
```

**并在 PR 描述里说明理由。** 豁免不是"关掉检查",而是"声明这一处是例外,并由人确认"。批量加豁免视为绕过检查。
