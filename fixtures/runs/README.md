# Run manifests — 数据出处的最小可自证集

本目录只收录 **`manifest.json`**，不收录 `stream.ndjson`(SSE 原始帧，单份数百 KB)。
`logs/runs/` 整目录被 `.gitignore` 排除，因此在这里单独固化"谁跑的、跑了多久、花了多少 token、结果是什么状态"。

评委可据此核对 `submission/04-originality` 中关于 SciencePal 的每一条陈述。

## 四份 run 的对照

| runId | Agent（`agentId`） | 预算 | 实际消耗 | 时长 | 状态 | 产出 |
|---|---|---|---|---|---|---|
| [`452938f7…`](452938f7-cd8e-4532-80f7-4311c227ea58/manifest.json) | Research Distiller（`9e70403e-…`） | 400,000 | **421,904** | 151.9 s | `asked` | **20 条论断 + 20 条逐字 quote**（`reading.md`、`anchors.json`） |
| [`f229dde2…`](f229dde2-e529-4015-864b-53eee2337297/manifest.json) | Research Distiller（`9e70403e-…`） | 400,000 | **44,292** | 101.9 s | **`completed`** | **18 条论断**（`reading.md`、`anchors.json`、`anchor-verify.json`） |
| [`1eaab751…`](1eaab751-a3ac-4fd7-87db-5f6d8b18f9ca/manifest.json) | Paper Close Reader（`ae5aaadf-…`） | 20,000 | **25,185** | 18.8 s | `asked` | 无（未产出 `reading.md`） |
| [`db8c2424…`](db8c2424-7af7-46a1-9066-a5f227ead1e8/manifest.json) | 平台内置默认 Agent（`10000000-…0001`） | 8,000 | **31,089** | 22.3 s | `asked` | 无（预算探底实验，未产出） |

前两份是同一 Agent 对**两篇不同论文**的两次独立精读：`452938f7` 读 ReAct（33 页），`f229dde2` 读
Transformer（16 页）。后两份只用于标定预算下限，不产出数据。

## 这四份一起说明了什么

**关于预算。** `status: "asked"` 不是失败，是"预算耗尽、暂停等你续跑"。四份里有三份以此结束，其中
`1eaab751` 与 `db8c2424` 在 18–22 秒内就撞墙，消耗量分别是自设预算的 **3.0 倍**和 **3.9 倍**。
原因不是模型能力，而是这条关系：

```
平台固定开销(系统提示 + 工具集) ≈ 2.4–3.1 万 prompt tokens
```

它**先于**任何实质工作发生。因此设 8,000 或 20,000 的预算必然在第 1–2 步就 `token_budget_exhausted`，
与 Agent 是谁、跑什么任务无关。这是**跨账号、跨 Agent、跨预算**的重复观察（三个 Agent 分属两名成员
账号与平台内置），而不是单次偶然。

**但预算不是越省越好，也不是给够就必然完成。** `f229dde2` 是四份中唯一 `status: "completed"` 的
一份：同为 400,000 预算，读 16 页的 Transformer 只用 **44,292**（11%）就完成，而读 33 页 ReAct 的
`452938f7` 消耗 421,904 仍越界。两次消耗相差近 10 倍，说明单篇的 token 需求波动很大，一个固定预算
不能保证完成——这正是调用方必须把 `asked` 当作可续跑状态、而不是失败来处理的原因。

**关于 `terminatedByDone`。** 四份全部为 `false`，包括状态已经是 `completed` 的那份。平台不会以
「done」事件收尾，因此**流关闭不等于完成**，必须轮询 `GET /agent-run/{id}` 读 `status`。

## 完整性说明

- `452938f7…` 与 `db8c2424…` 的 `request.json` / `run.json` / `stream.ndjson` 在本仓库工作树的
  `logs/runs/` 下（未入库），`452938f7…` 另有 `reading.md` / `anchors.json` / `anchor-verify.json`，
  其中后两者的内容已以 `fixtures/reading/react-2210.03629.*` 形式入库。
- `f229dde2…` 的 `reading.md` 与 `anchor-verify.json` 已以
  `fixtures/reading/transformer-1706.03762.*` 形式入库；`request.json` / `run.json` /
  `stream.ndjson` 同样只留在工作树。该 run 的 `status` 为 `completed`，是唯一完整跑完的一次。
- `1eaab751…` 由 WANG Xingshuai 的账号执行，完整证据目录在其本机；本仓库仅收录其 `manifest.json`
  （由创建者导出后提供）。
- `inputSha256` / `outputSha256` 为平台产物与输入的摘要，可用于核对未入库文件是否被改动。
- 本目录全部文件已确认不含任何 API key 明文。
