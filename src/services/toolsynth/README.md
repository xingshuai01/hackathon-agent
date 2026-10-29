# src/services/toolsynth/ — 模块 B · 工具库(已实现)

| 项 | 值 |
|---|---|
| **负责人** | 同学 2 |
| **对应 Issue** | #29 #30 #35 |
| **契约** | [`../../tools/types.ts`](../../tools/types.ts) —— ★ 冻结 |
| **状态** | ✅ 全流水线可跑:抽取(需 API key)→ 生成 → smoke → doctor |

## 流水线

```
PaperDoc ──extract.ts──▶ MethodSpec ──render.ts──▶ src/tools/generated/<toolName>.ts
                 ▲                                        │
                 │                              smoke.ts ─┤ 子进程 node --test
                 │                                        ▼
  specs/*.methods.json(已提交规格)              generate.ts 通过 → active(进 registry)
                 ▲                                       失败 → draft(参数模板)
                 │                                        ▼
              doctor.ts ◀──────────────────────────  report.json(降级原因)
```

## 文件职责

| 文件 | 职责 |
|---|---|
| `types.ts` | `MethodSpec` 结构 + `validateSpec` + `sanitizeToolName`(本模块自有类型,非冻结契约) |
| `extract.ts` | LLM 抽取:`PaperDoc → MethodSpec`,sideQuery + json_object 强约束;**引文逐字回指校验**(不信模型自报页码),不可追溯 → 丢弃并记录;LLM 坏 → degraded 不 throw |
| `impls.ts` | L1 实现目录:`methodId → zodFields + 确定性计算 + smoke 期望`。新方法在此登记 |
| `render.ts` | 模板填充:`MethodSpec → 工具源码 / smoke test 源码 / registry.generated.ts`(纯函数) |
| `smoke.ts` | 子进程 `node --test` 跑单工具 smoke(与 npm test 同一条路径) |
| `generate.ts` | 编排:specs → 渲染 → 落盘 → smoke → 注册表 + report.json;无实现 → 参数模板(draft) |
| `doctor.ts` | 批量体检:`runDoctor()` 输出通过率(SRS AC-B5.1);`tools doctor` 已接入 main.ts |
| `specs/` | 已提交的 MethodSpec 产物(无 API key 环境直接用它生成;每份都带逐字校验过的 evidenceQuote) |

## 运行方式(仓库根)

```bash
node src/services/toolsynth/generate.ts        # 生成全部工具 + 跑 smoke + 写注册表
node src/main.ts tools doctor                  # 体检:通过率 + 每个工具的状态与降级原因
node src/services/toolsynth/doctor.ts          # 独立跑 doctor(不经过 main.ts)
```

## 关键设计决策

1. **LLM 只抽结构,代码由模板产出**(DEC-019)。生成的工具只能来自 `impls.ts` 的确定性计算 —— 即使 LLM 抽错参数,也只是参数不对(zod 挡住),不会产生任意可执行代码。
2. **draft 不生成 .test.ts**。参数模板的 smoke「注定失败」,放进 `src/` 会把 `npm test` 带崩;体检时「缺少 .test.ts」按 smoke 失败计,工具保持 draft。
3. **引文回指是硬门槛**(数据铁律 #2):`evidenceQuote` 在声称页找不到 → 全文反查改判;全文找不到 → 丢弃并写进 `dropped`。
4. **没有 API key 也能交付**:`specs/*.methods.json` 是人工审校的等价产物,引文逐字校验在 `test/toolsynth/quotes.test.ts`(有本地 PDF 时全绿)。

## 禁止

- ❌ 让 LLM 直接生成可执行代码(L3)
- ❌ 把未通过 smoke 的工具注册进可调用池
- ❌ `import '../knowledge/*'` 或 `'../skills/*'`(module-isolation,检查器强制)
- ❌ 生成失败就静默丢弃(必须降级为模板 + 记录原因到 report.json)

## 完成判据(全部满足)

- [x] 至少 3 个 `MethodSpec` 带 `evidencePage`(实际 6 个,全部带逐字校验的引文)
- [x] 生成的工具符合 `Tool` 接口(`buildTool` + `z.strictObject`)
- [x] 每个 active 工具独立 smoke test
- [x] `tools doctor` 输出通过率(当前 83%,阈值 ≥60%)
- [x] 未过 smoke 标 `draft`,不进可调用池(`normalize_answer` 演示降级路径)
