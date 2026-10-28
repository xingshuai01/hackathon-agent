# src/services/toolsynth/ — 模块 B · 工具库

| 项 | 值 |
|---|---|
| **负责人** | 同学 2 |
| **对应 Issue** | #29 #30 #35 |
| **契约** | [`../../tools/types.ts`](../../tools/types.ts) —— ★ 冻结 |
| **上级说明** | [`docs/STRUCTURE.md`](../../../docs/STRUCTURE.md) §3 |

> ⚠️ **这是全项目风险最高的模块**(风险登记册 R-1)。请先读懂下面的分级再动手。

## 你要做什么

把论文里的**方法**变成**能跑的工具**。

```
PaperDoc ──extract.ts──▶ MethodSpec ──render.ts──▶ tools/generated/<name>.ts
                                                       │
                                          smoke.ts ────┤
                                                       ▼
                                          doctor.ts   通过 → active(注册进 registry)
                                                      失败 → draft(降级为参数模板)
```

## 风险分级(必须先读懂)

| 级别 | 内容 | 做不做 |
|---|---|---|
| **L1** | 方法选型 + 参数填充 → **参数化工具** | ✅ **只承诺这个** |
| L2 | 多步流程 DSL,带人工确认 | ⚠️ 有余力再做 |
| L3 | 让 LLM 自动生成分析代码 | ❌ **明确不做** |

**为什么**:「论文里的一段方法描述」到「可执行代码」之间有巨大语义鸿沟。L3 的质量完全不可控,失败即毁 demo。

## 核心设计:**LLM 抽结构,不写代码**

```ts
MethodSpec → renderTool(spec) 用【固定模板】填进去 → 生成 .ts 文件
```

**LLM 只负责抽取 `MethodSpec`(结构),代码由模板产出。**
这样即使 LLM 抽错参数,生成的工具也只是**参数不对**(被 zod 挡住),不会产生**任意可执行代码**。这是 L1 与 L3 的本质区别。

## 要建的文件

| 文件 | 职责 |
|---|---|
| `extract.ts` | `PaperDoc → MethodSpec`,用 `response_format: json_object` 强约束;`evidencePage` 必填 |
| `render.ts` | `MethodSpec → Tool` 代码文本(模板填充,纯函数) |
| `smoke.ts` | 跑单工具的 smoke test,返回 passed/failed |
| `doctor.ts` | 批量跑 smoke,输出通过率(**依赖 `registry.ts`,可后做**) |

## 禁止

- ❌ 让 LLM 直接生成可执行代码(L3)
- ❌ 把未通过 smoke 的工具注册进可调用池
- ❌ `import '../knowledge/*'` 或 `'../skills/*'`
- ❌ 生成失败就静默丢弃(必须降级为模板 + 记录原因)

## 完成判据

- [ ] 至少 3 个 `MethodSpec` 带 `evidencePage`
- [ ] 生成的工具符合 `Tool` 接口
- [ ] 每个工具独立 smoke test
- [ ] `tools doctor` 输出通过率,**≥60%**
- [ ] 未过 smoke 标 `draft`,不进可调用池

## 开发顺序建议(避免被 registry 卡住)

```
1. extract.ts   ← 立刻能做,只需 PaperDoc 类型
2. render.ts    ← 立刻能做,纯函数,输出字符串
3. smoke.ts     ← 立刻能做,拿 render 出来的工具跑
4. doctor.ts    ← 等骨架的 registry.ts
```
