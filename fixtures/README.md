# fixtures/

demo 固定样例与录制响应。

- 回放入口:`--replay`(或 `.env` 里 `DEMO_MODE=replay`);录制入口:`--record`(配合 live)
- 回放时从这里读,**绝不联网**;录制时写到这里
- 所有文件**必须入库**,否则队友 clone 后无法复现

## 三类文件

| 前缀 | 谁写的 | 内容 |
|---|---|---|
| `llm:<model>:turn:<hash>:<n>_*.json` | `src/services/llm/replay.ts` | 主循环每一轮 LLM 响应(turn) |
| `llm:<model>:sidequery:<hash>:<n>_*.json` | 同上 | 精筛/抽取的结构化 LLM 响应(sideQuery) |
| `papers/`、`reading/`、其余 | 工具各自录制 | SciencePal 查询等外部响应 |

`<hash>` 是「任务文本」的 sha256 前 16 位,`<n>` 是同一任务内的序号 —— 所以**同一个任务
在 record 与 replay 两次运行里必然命中同一批文件**。

## 录制一次,离线复现

```bash
# 1) 联网录一次(需要 DEEPSEEK_API_KEY)
node src/main.ts ask "总结这篇论文的方法" --record

# 2) 断网回放(零网络请求,可临时拔网线验证)
node src/main.ts ask "总结这篇论文的方法" --replay
```
