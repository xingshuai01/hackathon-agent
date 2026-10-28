# src/tools/generated/ — B 模块产出的工具

| 项 | 值 |
|---|---|
| **负责人** | 同学 2(模块 B) |
| **写入方** | `src/services/toolsynth/render.ts` 自动生成,**不要手写** |
| **对应 Issue** | #30 #35 |

## 这里放什么

每个从论文方法生成的工具,**一对文件**:

```
src/tools/generated/
├── compute_f1.ts            ← 工具本体(符合 Tool 接口)
├── compute_f1.test.ts       ← smoke test
├── extract_metric.ts
├── extract_metric.test.ts
└── registry.generated.ts    ← 自动生成的注册表(把 active 工具聚起来)
```

## 命名规则

`toolName` 会被当作 DeepSeek 的 function name,**只允许 `[a-zA-Z0-9_]`**(官方硬限制)。

```
✅ compute_f1、extract_metric、align_lowres_embed
❌ compute-f1、抽取指标、ExtractMetric
```

## 生成规则(重要)

**代码由模板填充,不是让 LLM 写。**
LLM 只负责抽 `MethodSpec`(方法名/参数/前提/证据页码),`render.ts` 用固定模板把结构填进去。

判据:即使 LLM 抽错参数,生成的工具也只是**参数不对**(被 zod 挡住),不会产生**任意可执行代码**。

## 状态约定

| 状态 | 含义 | 是否进 Agent 可调用池 |
|---|---|---|
| `active` | smoke test 通过 | ✅ |
| `draft` | 生成成功但 smoke 失败,或降级为参数模板 | ❌ |

**只有 `active` 的才注册。** 未通过的工具留在目录里供人工修补,不要删。

## 禁止

- ❌ 手写这个目录里的工具(手写工具放 `src/tools/` 下,不进 `generated/`)
- ❌ 把 `draft` 状态的工具注册进 registry
- ❌ 生成失败后静默删除文件(必须降级 + 记录原因到运行报告)

## 每个生成的工具必须做到

- [ ] `name` 只含 `[a-zA-Z0-9_]`
- [ ] `inputSchema` 用 `z.strictObject`
- [ ] `description` 里带来源(`来自论文 {paperId} p.{page}`),便于追溯
- [ ] `call()` 内部不 throw,失败返回 `toolFail(...)`
- [ ] 有对应的 `.test.ts` smoke test
