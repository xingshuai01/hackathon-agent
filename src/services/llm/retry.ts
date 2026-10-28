/**
 * 指数退避重试。
 *
 * 依据:docs/SDD.md §1.6(源码 `withRetry.ts:170/530`)与 §12.4。
 * 与源码的差异:重试次数 3(源码 10 次是为超大项目设计的),因为我们要的是
 * 「现场网络抖一下能扛住」,而不是「网络彻底挂了也硬撑」。
 */

import { LlmFatalError, errorMessage } from './types.ts'

export interface RetryOptions {
  /** 总尝试次数(含首次) */
  readonly maxAttempts: number
  /** 基础延迟,毫秒 */
  readonly baseDelayMs: number
  /** 单次最大延迟,毫秒 */
  readonly maxDelayMs: number
  /** 抖动比例,0.25 = ±25% */
  readonly jitter: number
  readonly signal: AbortSignal
  /** 每次重试前的回调,用于日志与 UI 提示 */
  readonly onRetry?: (info: { attempt: number; delayMs: number; reason: string }) => void
}

export const RETRY_DEFAULTS: Omit<RetryOptions, 'signal'> = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 32_000,
  jitter: 0.25,
}

/** 判断一个 HTTP 状态码是否值得重试 */
export function isRetryableStatus(status: number): boolean {
  // 429 限流、529 过载、5xx 服务端错误 → 重试
  // 400 参数错、401/403 鉴权、404 不存在 → 不重试(重试也没用)
  return status === 429 || status === 529 || (status >= 500 && status !== 501)
}

/** 从一个 Response 里尝试读出 `retry-after`(秒或 HTTP 日期) */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const asNumber = Number(header)
  if (Number.isFinite(asNumber) && asNumber >= 0) return asNumber * 1000
  const asDate = Date.parse(header)
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now()
    return delta > 0 ? delta : 0
  }
  return null
}

function withJitter(ms: number, jitter: number): number {
  const spread = ms * jitter
  return Math.max(0, Math.round(ms - spread + Math.random() * spread * 2))
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new LlmFatalError('已中断'))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new LlmFatalError('已中断'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * 执行一个可能失败的操作,失败时按指数退避重试。
 *
 * `attempt` 回调抛出的错误必须携带可选 `status` 字段,否则按不可重试处理。
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastMessage = '未知错误'

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    if (options.signal.aborted) throw new LlmFatalError('已中断')

    try {
      return await operation(attempt)
    } catch (err) {
      lastMessage = errorMessage(err)

      const status = err instanceof LlmFatalError ? err.status : undefined
      const retryable = status === undefined ? false : isRetryableStatus(status)
      const isLast = attempt === options.maxAttempts

      if (!retryable || isLast) {
        throw err instanceof LlmFatalError ? err : new LlmFatalError(lastMessage, status)
      }

      // 指数退避:500 → 1000 → 2000 …
      const base = Math.min(options.baseDelayMs * 2 ** (attempt - 1), options.maxDelayMs)
      const delayMs = withJitter(base, options.jitter)
      options.onRetry?.({ attempt, delayMs, reason: lastMessage })
      await sleep(delayMs, options.signal)
    }
  }

  throw new LlmFatalError(lastMessage)
}
