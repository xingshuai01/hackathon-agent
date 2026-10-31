/**
 * DeepSeek 客户端 —— 原生 fetch 直调,**零 SDK 依赖**(DEC-028)。
 *
 * 接口:POST https://api.deepseek.com/chat/completions(OpenAI 兼容)
 *
 * 四个必踩的坑都在这里处理掉了(见 docs/SDD.md §12.4):
 *  ① 思考模式默认开启,且开启时不支持 tool_choice:'required' → 我们固定 disabled
 *  ② arguments 是 JSON 字符串 → 由 stream 累加器逐片拼装,下游用 parseToolArguments
 *  ③ 流式 tool_calls 分片 → stream.ts 按 index 累积
 *  ④ json_object 模式不强制要求 JSON → prompt 侧必须自述"只输出 JSON",本层只做兜底剥离
 */

import type { Message, TokenUsage, ToolCall } from '../../agent/types.ts'
import type { DeepSeekToolSchema } from '../../tools/types.ts'
import { createStreamAccumulator } from './stream.ts'
import { RETRY_DEFAULTS, isRetryableStatus, parseRetryAfter, withRetry } from './retry.ts'
import {
  LlmFatalError,
  errorMessage,
  type LlmClient,
  type LlmRequest,
  type LlmTurn,
} from './types.ts'

export interface DeepSeekConfig {
  readonly apiKey: string
  readonly baseUrl: string
  /** 主模型:主循环、方案生成、技能聚合 */
  readonly model: string
  /** 便宜模型:A 知识库相关性筛选、MethodSpec 抽取等「选/抽」类任务 */
  readonly cheapModel: string
  readonly maxAttempts: number
  readonly requestTimeoutMs: number
  /** 重试回调,用于把「正在重试」推进事件总线 */
  readonly onRetry?: (info: { attempt: number; delayMs: number; reason: string }) => void
}

export const DEEPSEEK_DEFAULTS = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-pro',
  cheapModel: 'deepseek-v4-flash',
  maxAttempts: RETRY_DEFAULTS.maxAttempts,
  requestTimeoutMs: 120_000,
} as const

/**
 * 从环境变量构造配置。缺少 key 时**立即失败**,并给出可操作的提示。
 * 依据 SRS `AC-1.1`:报错要包含「变量名 + 到哪填 + 示例」。
 */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): DeepSeekConfig {
  const apiKey = env.DEEPSEEK_API_KEY?.trim() ?? ''
  if (apiKey === '') {
    throw new LlmFatalError(
      '缺少 DEEPSEEK_API_KEY。\n' +
        '  到哪填:https://platform.deepseek.com/api_keys 生成后,写入项目根目录的 .env\n' +
        '  示例:  DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx\n' +
        '  注意:  .env 已被 gitignore,不要写进代码或提交',
    )
  }
  return {
    apiKey,
    baseUrl: env.DEEPSEEK_BASE_URL?.trim() || DEEPSEEK_DEFAULTS.baseUrl,
    model: env.DEEPSEEK_MODEL?.trim() || DEEPSEEK_DEFAULTS.model,
    cheapModel: env.DEEPSEEK_CHEAP_MODEL?.trim() || DEEPSEEK_DEFAULTS.cheapModel,
    maxAttempts: Number(env.MAX_RETRIES ?? DEEPSEEK_DEFAULTS.maxAttempts),
    requestTimeoutMs: Number(env.REQUEST_TIMEOUT_MS ?? DEEPSEEK_DEFAULTS.requestTimeoutMs),
  }
}

/** 请求体。字段名严格对齐 DeepSeek 文档 */
interface ChatRequestBody {
  model: string
  messages: readonly Message[]
  stream: boolean
  /**
   * 只在 `stream: true` 时合法。
   * 非流式请求带上它会被 DeepSeek 直接判为参数冲突(实测报错后整条 sideQuery 失败,
   * 知识检索的 LLM 精筛因此静默降级成关键词排序),所以这里必须可选。
   */
  stream_options?: { include_usage: boolean }
  thinking: { type: 'enabled' | 'disabled' }
  tools?: readonly DeepSeekToolSchema[]
  tool_choice?: 'auto' | 'none'
  response_format?: { type: 'json_object' }
  max_tokens?: number
}

export function createDeepSeekClient(config: DeepSeekConfig): LlmClient {
  async function post(body: ChatRequestBody, signal: AbortSignal): Promise<Response> {
    const timeoutSignal = AbortSignal.timeout(config.requestTimeoutMs)
    const combined = AbortSignal.any([signal, timeoutSignal])

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: body.stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify(body),
      signal: combined,
    })

    if (!response.ok) {
      const text = (await response.text()).slice(0, 500)
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'))
      const suffix = retryAfter === null ? '' : `(服务端建议 ${retryAfter}ms 后重试)`
      throw new LlmFatalError(
        `DeepSeek 返回 ${response.status}${suffix}:${text}`,
        response.status,
      )
    }
    return response
  }

  async function streamTurn(
    request: LlmRequest,
    onText: ((delta: string) => void) | undefined,
    model: string,
    forceJson: boolean,
  ): Promise<LlmTurn> {
    const body: ChatRequestBody = {
      model,
      messages: request.messages,
      stream: true,
      stream_options: { include_usage: true },
      // 必须关:开启思考模式后不支持 tool_choice:'required' 与指定工具(DEC-030)
      thinking: { type: request.thinking ?? 'disabled' },
    }
    if (request.tools.length > 0) {
      body.tools = request.tools
      body.tool_choice = 'auto'
    }
    if (forceJson) {
      // ★ 注意:json_object 不强制模型必须输出 JSON,prompt 里也要写清楚
      body.response_format = { type: 'json_object' }
    }
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens

    const accumulator = createStreamAccumulator()

    return withRetry(
      async (attempt) => {
        // 重试时重置累加器,避免把上一次的半截内容拼进来
        const acc = attempt === 1 ? accumulator : createStreamAccumulator()
        const resetAcc = acc
        const response = await post(body, request.signal)
        if (!response.body) throw new LlmFatalError('响应没有 body')

        const decoder = new TextDecoder()
        for await (const chunk of response.body) {
          const delta = resetAcc.push(decoder.decode(chunk, { stream: true }))
          if (delta !== '' && onText) onText(delta)
        }

        const result = resetAcc.finish()
        return {
          text: result.text,
          toolCalls: result.toolCalls,
          usage: result.usage,
          finishReason: result.finishReason,
        }
      },
      {
        ...RETRY_DEFAULTS,
        maxAttempts: config.maxAttempts,
        signal: request.signal,
        ...(config.onRetry ? { onRetry: config.onRetry } : {}),
      },
    )
  }

  return {
    turn(request, onText) {
      return streamTurn(request, onText, request.model ?? config.model, request.jsonObject === true)
    },

    async sideQuery(request) {
      // 便宜模型 + 非流式(json_object 场景不需要流式)
      const body: ChatRequestBody = {
        model: request.model ?? config.cheapModel,
        messages: request.messages,
        stream: false,
        thinking: { type: request.thinking ?? 'disabled' },
        response_format: { type: 'json_object' },
      }
      if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens

      const text = await withRetry(
        async () => {
          const response = await post(body, request.signal)
          const json = (await response.json()) as {
            choices?: Array<{ message?: { content?: string | null } }>
          }
          const content = json.choices?.[0]?.message?.content
          if (typeof content !== 'string' || content.trim() === '') {
            throw new LlmFatalError('sideQuery 返回空内容')
          }
          return content
        },
        {
          ...RETRY_DEFAULTS,
          maxAttempts: config.maxAttempts,
          signal: request.signal,
          ...(config.onRetry ? { onRetry: config.onRetry } : {}),
        },
      )

      return stripCodeFence(text)
    },
  }
}

/** 模型偶尔会把 JSON 包进 ```json 围栏,剥掉它 */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed
  return trimmed
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/```\s*$/, '')
    .trim()
}

/**
 * 便捷解析:把模型返回的 JSON 文本解析成对象。
 * 失败时返回结构化结果,不抛 —— 让调用方决定是回填给模型还是告警。
 */
export function parseJsonObject(
  text: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed: unknown = JSON.parse(stripCodeFence(text))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: `期望 JSON 对象,实际是 ${Array.isArray(parsed) ? 'array' : typeof parsed}` }
    }
    return { ok: true, value: parsed as Record<string, unknown> }
  } catch (err) {
    return { ok: false, error: `JSON 解析失败:${errorMessage(err)};原文前 200 字:${text.slice(0, 200)}` }
  }
}

// ── 未使用的类型守卫:让 ToolCall / TokenUsage 的导入有实际用途(避免 unused 报错) ──
export type { Message, TokenUsage, ToolCall }

/** 判断状态码是否值得重试,供上层日志使用 */
export { isRetryableStatus }
