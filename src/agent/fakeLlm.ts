/**
 * 假 LLM(剧本化)。
 *
 * 两个用途:
 *  1. 单测:让主循环的每个分支都能在不花 API 额度的前提下被测到
 *  2. `--fake` 演示模式:没有 API key 时也能让同学看到骨架在跑
 *
 * 剧本用完后再被调用会抛错 —— 这能测出「循环比预期多跑了一轮」这类 bug。
 */

import type { LlmClient, LlmRequest, LlmTurn } from '../services/llm/types.ts'
import type { TokenUsage, ToolCall } from './types.ts'

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
  readonly turnCount: number
  readonly requests: readonly LlmRequest[]
}

export function createFakeLlm(specs: readonly FakeTurnSpec[]): FakeLlm {
  const requests: LlmRequest[] = []
  let index = 0

  return {
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
}

/** 总在失败的 LLM,用于测 model_error */
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

/**
 * `--fake` 演示剧本:先调一次工具,再给出答案。
 * 目的只是让「主循环 + 工具 + 事件渲染」这条链路能被看见地跑一遍。
 */
export function demoScript(): readonly FakeTurnSpec[] {
  return [
    {
      text: '我先算一下,不心算。',
      toolCalls: [fakeToolCall('call_demo_1', 'calc', { a: 1234, b: 5678, op: 'mul' })],
      usage: { input: 120, output: 30 },
    },
    {
      text: '1234 × 5678 = 7006652。\n\n这是通过 calc 工具算出来的,不是心算 —— 演示结束。',
      usage: { input: 180, output: 45 },
    },
  ]
}
