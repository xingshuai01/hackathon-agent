/**
 * 假 LLM —— 让主循环的每一个分支都能在不花 API 额度的前提下被测到。
 *
 * 用法:给一串「剧本」,每次 `turn()` 按顺序吐一条。
 * 剧本用完之后再被调用会抛错,这样能测出「循环多跑了一轮」这类 bug。
 */

import type { LlmTurn, LlmClient, LlmRequest } from '../../src/services/llm/types.ts'
import type { TokenUsage, ToolCall } from '../../src/agent/types.ts'

export interface FakeTurnSpec {
  readonly text?: string
  readonly toolCalls?: readonly ToolCall[]
  readonly usage?: TokenUsage
  readonly finishReason?: string | null
}

/** 便捷构造一个工具调用 */
export function fakeToolCall(id: string, name: string, args: unknown): ToolCall {
  return {
    id,
    type: 'function',
    function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
  }
}

export interface FakeLlm extends LlmClient {
  /** 已被调用的轮数 */
  readonly turnCount: number
  /** 每次调用收到的请求,便于断言「回填格式对不对」 */
  readonly requests: readonly LlmRequest[]
}

export function createFakeLlm(specs: readonly FakeTurnSpec[]): FakeLlm {
  const requests: LlmRequest[] = []
  let index = 0

  const llm: FakeLlm = {
    get turnCount() {
      return requests.length
    },
    get requests() {
      return requests
    },

    async turn(request, onText) {
      requests.push(request)
      const spec = specs[index]
      index += 1
      if (spec === undefined) {
        throw new Error(`FakeLlm 剧本已用完(第 ${index} 次调用)—— 说明循环多跑了一轮`)
      }
      const text = spec.text ?? ''
      if (text !== '' && onText) onText(text)
      return {
        text,
        toolCalls: spec.toolCalls ?? [],
        usage: spec.usage ?? { input: 0, output: 0 },
        finishReason: spec.finishReason ?? null,
      } satisfies LlmTurn
    },

    async sideQuery() {
      return '{}'
    },
  }

  return llm
}

/** 一个总在重试耗尽的 LLM,用于测 model_error */
export function createFailingLlm(message = '模拟不可恢复错误'): LlmClient {
  return {
    async turn() {
      throw new Error(message)
    },
    async sideQuery() {
      throw new Error(message)
    },
  }
}
