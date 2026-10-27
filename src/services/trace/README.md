# src/services/trace/ — 运行追踪与离线回放

| 项 | 值 |
|---|---|
| **负责人** | 你(骨架) |
| **对应 Issue** | #39(离线回放) |
| **依据** | [`docs/SDD.md`](../../../docs/SDD.md) §8.4、SRS `FR-E1` / `A-11` |

## 要建的文件

| 文件 | 职责 |
|---|---|
| `writer.ts` | 每次运行写一个 `logs/<runId>.jsonl`,记录每轮请求、工具调用、耗时、token |
| `replay.ts` | `DEMO_MODE=replay` 时从 `fixtures/` 回放,**零网络请求** |

## 为什么这个模块重要

黑客松现场最常见的翻车点是**网络和 API 额度**。这是录屏之外的**第二道兜底**:

```
现场网络正常 → live 模式
现场网络挂了 → replay 模式,60 秒内跑完,评委看不出来
```

## 验收标准

- [ ] `DEMO_MODE=replay` 时**零网络请求**(断网实测)
- [ ] `--record` 能把 live 响应录进 `fixtures/`
- [ ] replay 与 live 的关键路径事件序列一致
- [ ] replay 端到端 ≤ 60 秒

## 禁止

- ❌ 把 trace 写成不可解析的自由文本(必须是 JSONL,一行一条)
- ❌ 在 trace 里记录 API Key 或完整请求头
- ❌ 让 `replay.ts` 有任何联网代码路径
