# src/services/cache/ — fixtures 读写

| 项 | 值 |
|---|---|
| **负责人** | 你(骨架) |
| **对应 Issue** | #39 |
| **契约** | 实现 `Cache` 接口(`src/tools/types.ts` 里的 `Cache`) |

## 职责

给工具提供 `get/set` 两级能力:

- `mode === 'live'` + 开启录制 → 写进 `fixtures/`
- `mode === 'replay'` → **只读** `fixtures/`,不联网

## 要建的文件

`fixtures.ts` —— `Cache` 接口的实现。

## 约定

| 项 | 规定 |
|---|---|
| 目录 | `fixtures/`(必须入库,否则队友 clone 后无法 replay) |
| 命名 | `<工具名>_<场景>.json`,例 `arxiv_search_rag.json` |
| key | 用「工具名 + 参数哈希」,保证同一参数命中同一份录制 |
| 缺失行为 | replay 模式下一旦 `get` 返回 null,**必须报明确的错**("fixtures 里没有 X,请先用 --record 录制"),不要静默返回空 |

## 禁止

- ❌ 在 replay 模式下发起任何网络请求
- ❌ 把 fixtures 写进 `logs/` 或 `data/`(那两个都不入库)
- ❌ 用参数原文当 key(太长的 query 会让文件名超长,用哈希)
