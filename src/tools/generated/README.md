# src/tools/generated/ — B 模块产出的工具

| 项 | 值 |
|---|---|
| **负责人** | 同学 2(模块 B) |
| **写入方** | `src/services/toolsynth/render.ts` 自动生成,**不要手写** |
| **对应 Issue** | #30 #35 |

## 这里放什么

每个从论文方法生成的工具,工具本体 + (active 才有的)smoke test:

```
src/tools/generated/
├── majority_vote.ts            ← 工具本体(符合 Tool 接口)
├── majority_vote.test.ts       ← smoke test(active 才有)
├── should_backoff_to_react.ts
├── step_backoff_to_cotsc.ts
├── webshop_score.ts
├── success_rate.ts
├── normalize_answer.ts         ← draft:参数模板,无 .test.ts(见下)
├── registry.generated.ts       ← 自动生成的注册表(只列 active)
└── report.json                 ← 生成报告:通过率 + 每个工具的降级原因
```

## 命名规则

`toolName` 会被当作 DeepSeek 的 function name,**只允许 `[a-zA-Z0-9_]`**(官方硬限制)。

```
✅ majority_vote、step_backoff_to_cotsc
❌ majority-vote、多数投票、MajorityVote
```

## 生成规则(重要)

**代码由模板填充,不是让 LLM 写。**
LLM 只负责抽 `MethodSpec`(方法名/参数/前提/证据页码),`render.ts` 用固定模板把结构填进去;计算逻辑来自 `impls.ts` 的确定性 L1 目录。

判据:即使 LLM 抽错参数,生成的工具也只是**参数不对**(被 zod 挡住),不会产生**任意可执行代码**。

## 状态约定

| 状态 | 含义 | 是否进 Agent 可调用池 |
|---|---|---|
| `active` | smoke test 通过 | ✅ |
| `draft` | 无 L1 实现(参数模板)或 smoke 失败 | ❌ |

**只有 `active` 的才注册。** 未通过的工具留在目录里供人工修补,不要删。

**draft 为什么没有 .test.ts**:参数模板的 smoke 注定失败,放进 `src/` 会把
`npm test` 带崩;`tools doctor` 把「缺少 .test.ts」按 smoke 失败计,工具保持 draft,
降级原因从 `report.json` 读。

## 改一个工具的正确姿势

1. 改计算逻辑 → `src/services/toolsynth/impls.ts`(登记 / 修正 methodId 的实现)
2. 改参数与描述 → `src/services/toolsynth/specs/*.methods.json`
3. 重跑:`node src/services/toolsynth/generate.ts`
4. 体检:`node src/main.ts tools doctor`

## 禁止

- ❌ 手写这个目录里的工具(手写工具放 `src/tools/` 下,不进 `generated/`)
- ❌ 把 `draft` 状态的工具注册进 registry
- ❌ 生成失败后静默删除文件(必须降级 + 记录原因到 report.json)

## 每个生成的工具必须做到

- [ ] `name` 只含 `[a-zA-Z0-9_]`
- [ ] `inputSchema` 用 `z.strictObject`
- [ ] `description` 里带来源(`来自论文 {paperId} p.{page}`),便于追溯
- [ ] `call()` 内部不 throw,失败返回 `toolFail(...)`
- [ ] active 工具有对应的 `.test.ts` smoke test
