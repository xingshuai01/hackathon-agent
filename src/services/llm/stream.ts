/**
 * DeepSeek / OpenAI 兼容的 SSE 流解析。
 *
 * ── 这里藏着一个最容易写错的坑 ──
 * 流式返回的 tool_calls 是**分片**的:
 *   第一个 chunk 带 { index, id, type, function: { name, arguments: "{\"a\"" } }
 *   后续 chunk 只带 { index, function: { arguments: ":1}" } }
 * 必须**按 index 累积**拼出完整的 arguments 字符串。
 * 只读第一个 chunk 会拿到残缺 JSON。
 *
 * 依据:docs/SDD.md §12.4「流式响应处理要点」
 */

import type { TokenUsage, ToolCall } from '../../agent/types.ts'

/** 解析过程中累积的一个工具调用 */
interface ToolCallAccumulator {
  id: string
  name: string
  /** arguments 是逐片拼接的字符串 */
  arguments: string
}

export interface StreamAccumulator {
  /** 追加一段原始 SSE 文本,返回本次解析出的文本增量(可能为空) */
  push(chunk: string): string
  /** 流结束后取最终结果 */
  finish(): {
    text: string
    toolCalls: readonly ToolCall[]
    usage: TokenUsage
    finishReason: string | null
  }
}

/** DeepSeek 流式 chunk 里我们关心的部分 */
interface StreamDelta {
  choices?: Array<{
    delta?: {
      content?: string | null
      tool_calls?: Array<{
        index?: number
        id?: string
        type?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
  } | null
}

/**
 * 创建流累加器。
 *
 * 用法:
 *   const acc = createStreamAccumulator()
 *   for await (const chunk of body) onText(acc.push(chunk))
 *   const result = acc.finish()
 */
export function createStreamAccumulator(): StreamAccumulator {
  let buffer = ''
  let text = ''
  const usage: TokenUsage = { input: 0, output: 0 }
  let finishReason: string | null = null

  /** index → 累积器。用 Map 而不是数组,防止模型给出稀疏 index */
  const toolCalls = new Map<number, ToolCallAccumulator>()

  function handleEvent(payload: string): void {
    // SSE 终止标记
    if (payload === '[DONE]') return

    let parsed: StreamDelta
    try {
      parsed = JSON.parse(payload) as StreamDelta
    } catch {
      // 单个坏帧不应该毁掉整个流 —— 跳过继续
      return
    }

    // usage 通常附在最后一个 chunk(需请求时带 stream_options.include_usage)
    if (parsed.usage) {
      usage.input = parsed.usage.prompt_tokens ?? usage.input
      usage.output = parsed.usage.completion_tokens ?? usage.output
    }

    const choice = parsed.choices?.[0]
    if (!choice) return

    if (choice.finish_reason) finishReason = choice.finish_reason

    const delta = choice.delta
    if (!delta) return

    if (typeof delta.content === 'string' && delta.content !== '') {
      text += delta.content
    }

    for (const piece of delta.tool_calls ?? []) {
      const index = piece.index ?? 0
      let acc = toolCalls.get(index)
      if (!acc) {
        acc = { id: '', name: '', arguments: '' }
        toolCalls.set(index, acc)
      }
      // 只有第一个分片带 id / name / type
      if (piece.id) acc.id = piece.id
      if (piece.function?.name) acc.name = piece.function.name
      // ★ 关键:arguments 是逐片拼接的
      if (typeof piece.function?.arguments === 'string') {
        acc.arguments += piece.function.arguments
      }
    }
  }

  return {
    push(chunk) {
      buffer += chunk
      let emitted = ''
      let idx = buffer.indexOf('\n\n')
      while (idx !== -1) {
        const frame = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)

        for (const line of frame.split('\n')) {
          const trimmed = line.trimStart()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice('data:'.length).trim()
          if (payload === '') continue
          const before = text.length
          handleEvent(payload)
          if (text.length > before) emitted += text.slice(before)
        }

        idx = buffer.indexOf('\n\n')
      }
      return emitted
    },

    finish() {
      // 按 index 排序,保证工具调用顺序与模型意图一致(虽然理论上并行)
      const sorted = [...toolCalls.entries()].sort((a, b) => a[0] - b[0])
      const calls: ToolCall[] = sorted.map(([index, acc]) => {
        // id 缺失时兜底,避免下游拿到空 id 导致回填对不上
        const id = acc.id !== '' ? acc.id : `call_${index}`
        return {
          id,
          type: 'function',
          function: { name: acc.name, arguments: acc.arguments },
        }
      })

      return { text, toolCalls: calls, usage, finishReason }
    },
  }
}
