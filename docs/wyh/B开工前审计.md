# B 开工前审计:骨架 / A / C 还有什么要补

| 项 | 值 |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-10-29 |
| 审计范围 | `src/agent/**`、`src/tools/**`、`src/services/knowledge/**`、`src/services/skills/**`、`src/main.ts` |
| 审计时门禁 | `typecheck` ✅ · `check:rules` ✅(60 文件)· `test` **311 用例**(审计前 298) |

> 结论:**可以开工**。本轮修掉 6 个问题,其中 2 个会让 B 的工作直接白做。
> 剩余 3 件需要组内拍板,都不是技术问题。

---

## 0. 结论先行

1. **B 的接入点已就绪**:生成目录、注册入口、smoke 测试扫描、能力位探测全部可用,且不需要改 `main.ts`。
2. **修掉的 6 个问题里有 2 个是「静默失效」**:不修的话 B 写完代码也看不出错,只会觉得"怎么没生效"。
3. **3 件待拍板**:改冻结契约 #2、提交生成物、加 `section?` 字段。
   → **后续结论见 `三项待拍板决策.md`**：三项均不属模块 B；第 1 项已用工厂注入消解（无需改契约），
   第 3 项建议撤回，只剩「生成物提交策略」需要提交负责人一句话。

---

## 1. 本轮修掉的 6 个问题

### ① 门禁盲区:`src/**/*.test.ts` 从来没被执行过

`package.json` 的 test 脚本只扫 `test/**/*.test.ts`,而 `src/tools/generated/README.md` 明确让 B 把 smoke test 写成 `compute_f1.test.ts` **放在工具旁边**。

实测证据:往 `src/tools/generated/` 放一个必然通过的探针,用例数 **298 不变**——说明它根本没跑。

```
放入前: # tests 298
放入后: # tests 298   ← 探针没被执行
```

修复:`"test": "node --test ... \"test/**/*.test.ts\" \"src/**/*.test.ts\""`,复测 299。

**影响**:不修的话 B 的 smoke test 全部白写,`tools doctor` 的通过率也没法进 CI。

### ② `registry.describe()` 用 undefined 探测,任何读入参的描述都会崩

每次 `npm run demo` 都在打这行:

```
[registry] 工具 sciencepal_query 的 description 无参探测抛错,已退化为工具名
```

**后果比它看起来严重**:description 直接决定模型会不会调用这个工具。退化后模型看到的是 `sciencepal_query` 六个字,等于这个工具被注册了个寂寞。

修复:新增 `probeInput()`,三级探测——空对象 → 从 JSON Schema 合成占位值(字符串 `'x'`、数字 `1`、枚举取首项、有 default 用 default)→ 都不行才 undefined。

现在 warning 消失,5 个工具的 description 都能正常渲染。

**对 B 的意义**:生成的工具几乎都有必填参数,不修就是「注册了但模型不知道它干什么」。

### ③ `tools doctor` 的能力位用 `undefined as never` 调用

```ts
const readonly = tool.isReadOnly?.(undefined as never) ?? false   // 有参工具直接抛错
```

修复:复用 `probeInput()`,探不出来时显示 `?(取决于入参)`,而不是给出一个错的「否」。
另外补上了**破坏性**一列——`isDestructive` 在契约里一直有,但 doctor 从来没显示过。

### ④ `ToolContext.onProgress` 从来没接线

`main.ts` 构造 ctx 时只给了 `{ mode, trace, cache }`,`onProgress` 一直是 `undefined`。

**后果**:工具调用它静默丢弃,`events.ts` 里定义的 `progress` 事件从未发出过一次。
B 的精读 / 沙箱这类长任务在 UI 上会是一段黑屏——而这恰恰是三面板想展示的东西。

修复:接上 `(p) => bus.emit({ type: 'progress', ...p })`,并在 `loop.test.ts` 加了一条透传用例守住它。

### ⑤ B 没有注册入口,只能改 `main.ts`

原来 `main.ts` 只有一行注释 `// registry.register(...generated tools from 同学2)`——B 要实现就必须动这个文件,而它已经改了 8 处,是冲突最密的地方。

修复:新建 `src/tools/generated/registry.generated.ts` 导出 `generatedTools`,`main.ts` 循环注册。
**约定:B 只改这个文件,不动 `main.ts`。** 当前是空数组,行为不变。

### ⑥ C 的 `match()` 命中率验收从来没做过

`docs/STRUCTURE.md` 对 C 的要求是「抽 5 个任务,≥4 次匹配正确」,但此前只验证过单个命中。

补 `test/skills/match.test.ts`:4 个合成技能 × 5 个任务,**实测 5/5 命中**。
顺带覆盖两个反例:无关任务返回 `null`(不硬挑)、命中时 `skill_load` 事件带理由。

---

## 2. B 开工的接口现状

### 已就绪,不需要你再准备

| 项 | 位置 | 说明 |
|---|---|---|
| 生成目录 | `src/tools/generated/` | 空目录 + README(命名规则、命名限制) |
| 注册入口 | `src/tools/generated/registry.generated.ts` | 导出 `generatedTools`,main 自动注册 |
| 工具契约 | `src/tools/types.ts` | `buildTool` 补 fail-closed 默认值;`invokeTool` 永不 throw |
| smoke 测试 | `npm test` | 现在同时扫 `test/**` 与 `src/**` |
| 能力位探测 | `probeInput()` (from `agent/registry.ts`) | B 的 `doctor.ts` 可直接复用,不必自己写 |
| 文档读取 | `paper/parse.ts` | `parsePdfFile()` 同时返回 `doc` 与 `pageLines` |

### B 要自己定的(我们不该替他定)

- `MethodSpec` 的结构——`toolsynth/types.ts` **不是**冻结契约
- `render.ts` 用模板填充而不是让 LLM 自由写代码(`STRUCTURE.md` 的硬要求)

### 一个必须告知的边界

`src/tools/**` 的 import 白名单只有:`src/tools/`、`src/ui/`、`src/agent/types`、`node:*`、`zod`。

**所以生成的工具不能 import `src/services/toolsynth/*` 的类型。** 两条路:

1. 在 `tools/generated/` 里本地声明一个最小结构,靠结构兼容传值(推荐,C 的 `DraftNote` 就是这么做的)
2. 改 `scripts/check-rules.mjs` 的白名单(要 PR,且会让生成物与 B 的实现耦合)

---

## 3. 需要拍板的 3 件

### P1|`ToolContext` 要不要加 `emit`(冻结契约 #2)

现在有三个事件「只定义、无发出点」:

| 事件 | 谁能发 | 现状 |
|---|---|---|
| `progress` | 工具 | ✅ 本轮已接上 |
| `tool_generated` | 编排层(B 的 render 由 main 调) | 可以在 main 里发,**不用改契约** |
| `knowledge_hit` | **只有工具自己知道** | ❌ 绕不开,`ToolContext` 没有 `emit` |

`knowledge_hit` 是 Web 知识面板「高亮被引用的那一页」的唯一数据源。不改契约,这个面板做不实。

选项:
1. 给 `ToolContext` 加可选 `emit`(PR + 1 人 approve,新增可选字段,向后兼容)
2. 主循环在 `tool_end` 里附加 `data`(要动 `loop.ts`,不动契约)
3. Web 解析 `summary` 字符串(不改任何东西,但脆弱)

### P2|`knowledge/` 与 `skills/_drafts/` 提交不提交

建议都提交(体积小,演示时不必现场重建,评委能直接看到资产长什么样)。要是不提交,得加 `.gitignore` 并保证演示脚本能重建。

### P3|`AtomicNote` 加不加 `section?`

PR 稿在 `docs/wyh/PR-知识页section字段.md`。不加上,C 的证据索引只能按页码组织。

---

## 4. 明确不修(附理由)

| 项 | 为什么不修 |
|---|---|
| `loop.turns` 的 off-by-one | `loop.test.ts:111` 已显式断言 `turns===4`,是骨架同学的固化预期;改了会红,且不影响行为 |
| LLM 层没有回放 | 需要真实 key 才能录 fixtures,现在写等于写未验证代码。AC-E1.2 目前只覆盖 sciencepal |
| `paper/parse.ts` 的 `tables`/`figures` 恒空 | 文献底座,改动面大且不属于 A/C;AC-D1.3 因此不达标 |
| `deepseek.ts` 重试时已发出的 `text_delta` 无法撤回 | 屏幕会重复一小段文字,不影响正确性,只影响观感 |
| `web/` 零代码 | 是 D3 验收的硬缺口,但不属于「B 开工前」,且工程量大 |

---

## 5. 整体验收风险(按影响排序)

| 验收 | 现状 | 卡在哪 |
|---|---|---|
| D1「一条命令跑通沉淀」 | 🟡 `ingest` 已跑通,但只到知识页 + 技能草案 | B 的 `render` 未做,工具这一环缺 |
| D2「消费方向」 | 🟡 `ask` 能调 `knowledge_search` / 技能 | 生成的工具还进不来 |
| D3「三面板」 | ❌ `web/` 零代码 | 面板本身没写 + `knowledge_hit` 无通道 |
| AC-D1.3「表格转 Markdown」 | ❌ `tables` 恒空 | 文献底座 |
| AC-E1.2「全部外部调用可回放」 | 🟡 只有 sciencepal | LLM 层无回放 |
| AC-B5.1「`tools doctor` 有 smoke」 | 🟡 doctor 只列注册表 | B 的 `doctor.ts` 未做(本轮已把探测修好) |

---

## 6. 给组员的一句话

> B 的接入点已经铺好了:把工具写进 `src/tools/generated/`,在 `registry.generated.ts` 里加一行,不用动 `main.ts`。
> 但**先从 `probeInput()` 看一眼你的 description 能不能在示例入参下渲染出来**——这一步没过,模型根本不会调用你的工具。
