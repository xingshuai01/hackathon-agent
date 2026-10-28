# src/services/llm/ — DeepSeek 客户端

| 项 | 值 |
|---|---|
| **负责人** | 你(骨架) |
| **对应 Issue** | #24 |
| **依据** | [`docs/SDD.md`](../../../docs/SDD.md) §12.4(DeepSeek 接入细则)、DEC-028 / DEC-029 / DEC-030 |

## 铁律:零 SDK

**不引入任何 npm 依赖**,用 Node 24 原生 `fetch` 直调 `https://api.deepseek.com/chat/completions`。

## 要建的文件

| 文件 | 职责 | 关键点 |
|---|---|---|
| `deepseek.ts` | 客户端封装 | 模型分工:`deepseek-v4-pro` 主 / `deepseek-flash` 便宜活 |
| `stream.ts` | SSE 解析 | **`tool_calls` 必须按 `index` 累积拼装 `arguments`** |
| `retry.ts` | 退避重试 | 指数退避 + 抖动,读 `retry-after`;次数 3(不是源码的 10) |
| `sideQuery.ts` | 结构化输出 | `response_format: {type:'json_object'}`,给 A/B/C 做「选/抽」 |

## 四个必踩的坑(已在 SDD §12.4 记录)

| 坑 | 后果 | 做法 |
|---|---|---|
| **思考模式默认开启** | `tool_choice:'required'` / 指定工具会 **400 报错** | 统一 `thinking: {type:'disabled'}` |
| **`arguments` 是 JSON 字符串** | 当成对象用会崩 | 交给 `parseToolArguments()`(`src/agent/types.ts`) |
| **流式 tool_calls 分片** | 只读第一个 chunk 会拿到残缺 JSON | 按 `index` 累积 `function.arguments` 字符串 |
| **`json_object` 模式不强制要求 JSON** | 模型可能一直输出空白直到触顶 | prompt 里必须明确写「只输出 JSON」 |

## 验收标准

- [ ] 每人用自己的 key(各自 `.env` 的 `DEEPSEEK_API_KEY`)调通一次
- [ ] 流式文本增量可实时推送(通过 `bus.emit({type:'text_delta'})`)
- [ ] `tool_calls` 按 index 正确拼装成完整 `arguments`
- [ ] 429 / 超时自动重试,`retry-after` 优先
- [ ] 错误可分类:可重试 / 不可重试
- [ ] `sideQuery()` 支持 json_object 强约束返回
- [ ] **零 npm 依赖**(检查器会拦新增依赖)

## 禁止

- ❌ `import` 任何 LLM SDK
- ❌ 在 `retry.ts` 里无上限重试
- ❌ 把 API Key 写进代码或日志(从 `process.env` 读)
