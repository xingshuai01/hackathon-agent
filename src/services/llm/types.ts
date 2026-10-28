/**
 * LLM 客户端接口。
 *
 * 为什么单独定义接口(而不是直接用 DeepSeek 实现):
 * 主循环必须能在**不花一分钱 API 额度**的前提下被单测。
 * 有了这层接口,FakeLLM 就能脚本化地"扮演"模型,测出多工具、失败回填、MAX_TURNS 等全部分支。
 *
 * 依据:docs/SDD.md §4.2、§12.4;DEC-028(DeepSeek + 原生 fetch)
 */

import type { Message, TokenUsage, ToolCall } from '../../agent/types.ts'
import type { DeepSeekToolSchema } from '../../tools/types.ts'

export interface LlmRequest {
  readonly messages: readonly Message[]
  readonly tools: readonly DeepSeekToolSchema[]
  readonly signal: AbortSignal
  /** 覆盖默认模型(用于 sideQuery 走便宜模型) */
  readonly model?: string
  /** 覆盖思考模式。默认 disabled(DEC-030:开启后不支持 tool_choice:required) */
  readonly thinking?: 'enabled' | 'disabled'
  /** 期望 JSON 输出(A/B/C 的"选/抽"类任务用) */
  readonly jsonObject?: boolean
  readonly maxTokens?: number
}

/** 一个完整的「轮次」结果:模型这一轮说了什么 + 要不要调工具 + 花了多少 token */
export interface LlmTurn {
  readonly text: string
  readonly toolCalls: readonly ToolCall[]
  readonly usage: TokenUsage
  /** finish_reason,仅用于诊断日志。**不要用它判断有无工具调用**(看 toolCalls) */
  readonly finishReason: string | null
}

export interface LlmClient {
  /**
   * 跑完一轮。文本增量通过 onText 回调实时吐出(用于流式 UI)。
   * **内部不得 throw 可恢复错误**;重试耗尽后抛 `LlmFatalError`。
   */
  turn(request: LlmRequest, onText?: (delta: string) => void): Promise<LlmTurn>

  /**
   * 单次结构化查询:便宜模型 + json 输出。给 A 知识库相关性筛选、
   * B 方法抽取、C 技能聚合用。
   *
   * 调用方负责解析返回的 JSON;本方法只保证"拿到一段 JSON 文本"。
   */
  sideQuery(request: Omit<LlmRequest, 'tools'>): Promise<string>
}

/** 不可恢复的 LLM 错误(重试耗尽 / 鉴权失败 / 参数非法) */
export class LlmFatalError extends Error {
  readonly status: number | undefined
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'LlmFatalError'
    this.status = status
  }
}

/** 把内部错误统一成可读消息 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return JSON.stringify(err)
}
