/**
 * ★★★ 冻结契约 #3 · 编排层契约 ★★★
 *
 * 变更规则:改动本文件的**任何已导出签名**都必须走 PR 且经 1 人 approve。
 * 依据:docs/SDD.md §4.2、§6.3;DEC-014、DEC-016、DEC-029
 * 对应任务:Issue #20
 *
 * ── ⚠️ 格式警告(最容易写错的一段)──
 *
 * 参考对象 Claude Code 用的是 **Anthropic 消息格式**,我们用的是
 * **DeepSeek / OpenAI 兼容格式**。两者在工具调用上的差异是硬性不兼容的,
 * 照抄 Anthropic 写法会在 D1 直接卡在 API 400。
 *
 *   环节         Anthropic                      DeepSeek(本文件)
 *   ─────────────────────────────────────────────────────────────
 *   工具请求     content[] 里的 tool_use 块      message.tool_calls[]
 *   参数形态     input 是对象                    arguments 是 JSON **字符串**
 *   结果回填     user 消息内嵌 tool_result       独立的 role:'tool' 消息
 *   失败标志     is_error: true                 无此字段,错误文本写 content
 */

// ─────────────────────────────────────────────────────────────
// 1. 消息
// ─────────────────────────────────────────────────────────────

/**
 * 模型请求的一次工具调用。
 *
 * 注意 `function.arguments` 是 **JSON 字符串**,不是对象。
 * 原因:流式返回时它是增量拼出来的,官方给的就是字符串。
 * 解析请用本文件的 `parseToolArguments()`,不要自己 JSON.parse。
 */
export interface ToolCall {
  readonly id: string
  readonly type: 'function'
  readonly function: {
    readonly name: string
    /** JSON 字符串。**不保证合法**(官方明确说明模型可能输出非法 JSON) */
    readonly arguments: string
  }
}

/**
 * 对话消息。四种角色,与 DeepSeek 的 `messages` 数组一一对应。
 *
 * 关键约束(违反即 API 报错):
 * - 一个 assistant 消息带 `tool_calls` 时,**每个** tool_call 都必须有对应的
 *   `role:'tool'` 消息回填,漏一条就报错
 * - `role:'tool'` 消息必须带 `tool_call_id` 且与某个 tool_call 的 id 匹配
 * - `role:'tool'` **不是** user 消息,不要往 user 的 content 里塞结果
 */
export type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: readonly ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

/** 简写构造器,避免手写对象字面量时漏字段 */
export const msg = {
  system: (content: string): Message => ({ role: 'system', content }),
  user: (content: string): Message => ({ role: 'user', content }),
  assistant: (content: string | null, toolCalls?: readonly ToolCall[]): Message =>
    toolCalls === undefined
      ? { role: 'assistant', content }
      : { role: 'assistant', content, tool_calls: toolCalls },
  tool: (toolCallId: string, content: string): Message => ({
    role: 'tool',
    tool_call_id: toolCallId,
    content,
  }),
} as const

// ─────────────────────────────────────────────────────────────
// 2. 参数解析(红线 ③)
// ─────────────────────────────────────────────────────────────

export type ParsedArguments =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string }

/**
 * 解析 `ToolCall.function.arguments`。
 *
 * **必须用它,不要直接 JSON.parse** —— 因为它把解析失败转成了结构化结果,
 * 让主循环可以把错误回填给模型重试,而不是抛异常把循环带崩。
 *
 * DeepSeek 官方原话:
 *   「模型并不总是生成有效的 JSON,并且可能会臆造出你函数模式中未定义的参数。
 *     在调用函数之前,请在代码中验证这些参数。」
 * 后半句由 `inputSchema.safeParse` 在 invokeTool 里完成。
 */
export function parseToolArguments(call: ToolCall): ParsedArguments {
  const raw = call.function.arguments
  if (raw.trim() === '') return { ok: true, value: {} }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: `arguments 必须是 JSON 对象,实际是 ${typeof parsed}` }
    }
    return { ok: true, value: parsed as Record<string, unknown> }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `arguments 不是合法 JSON(${detail}):${raw.slice(0, 200)}` }
  }
}

// ─────────────────────────────────────────────────────────────
// 3. 终止与结果
// ─────────────────────────────────────────────────────────────

export interface TokenUsage {
  input: number
  output: number
}

/**
 * 终止原因。**只做 5 种**(DEC-016),不照搬源码的 10 种 ——
 * 我们只需要能区分「正常结束」与「哪一类异常结束」。
 *
 * 新增 reason 前先问:现有的 5 种能不能表达?能就不要加,否则日志会难读。
 */
export type LoopEndReason =
  /** 模型不再请求工具,正常收敛 */
  | 'completed'
  /** 触到 MAX_TURNS 上限,安全退出。**必须保留已有产出** */
  | 'max_turns'
  /** 用户中断(Ctrl+C / Web 停止按钮) */
  | 'aborted'
  /** token 预算耗尽,安全退出。**必须保留已有产出** */
  | 'budget_exceeded'
  /** API 不可恢复错误(重试耗尽 / 鉴权失败 / 参数非法) */
  | 'model_error'

export interface LoopResult {
  /** 完整消息历史,可直接序列化进 trace */
  readonly messages: readonly Message[]
  readonly reason: LoopEndReason
  readonly turns: number
  readonly usage: TokenUsage
}

// ─────────────────────────────────────────────────────────────
// 4. 运行追踪
// ─────────────────────────────────────────────────────────────

/** 一次运行的性质。ingest = 沉淀方向,ask = 消费方向(见 SRS §3.2) */
export type TaskMode = 'ingest' | 'ask'

export interface ToolCallRecord {
  readonly name: string
  readonly ms: number
  readonly status: 'ok' | 'error'
}

export interface FailureRecord {
  /** 哪个阶段失败的,如 'paper_parse' / 'tool_synthesis' / 'skill_load' */
  readonly stage: string
  /** 关联对象,如 paperId / toolName / skillId */
  readonly ref?: string
  readonly message: string
}

/**
 * 一次运行的完整追踪。写入 `logs/<runId>.jsonl` 与 `out/run-<runId>.json`。
 * 演示时用它做复盘,回放时用它生成 fixtures 清单。
 */
export interface RunTrace {
  readonly runId: string
  readonly mode: TaskMode
  readonly startedAt: string
  readonly endedAt?: string
  readonly endReason?: LoopEndReason
  readonly turns: number
  readonly tokens: TokenUsage
  readonly toolCalls: readonly ToolCallRecord[]
  readonly failures: readonly FailureRecord[]
}

// ─────────────────────────────────────────────────────────────
// 5. 主循环参数
// ─────────────────────────────────────────────────────────────

export interface LoopOptions {
  /** 系统提示词(技能清单、知识索引会由调用方拼进这里) */
  readonly systemPrompt: string
  /** 用户任务 */
  readonly task: string
  /** 工具白名单。子 Agent 靠它限定能力范围(FR-D4) */
  readonly toolNames: readonly string[]
  readonly maxTurns: number
  /** 累计 token 上限,触顶返回 budget_exceeded */
  readonly maxTotalTokens: number
  /** 可并发工具的上限,默认 3(DEC-015)。注意源码默认是 10 */
  readonly maxConcurrency: number
  /** 中断信号 */
  readonly signal: AbortSignal
}

/** 主循环的默认参数。**不要在各处硬编码这些数字** */
export const LOOP_DEFAULTS = {
  maxTurns: 20,
  maxTotalTokens: 500_000,
  maxConcurrency: 3,
} as const

/**
 * 并发分区:把**连续**的可并发调用合成一批。
 *
 * 采纳 `toolOrchestration.ts:91` 的语义(依据 SDD §6.4):
 *   [safeA, safeB, unsafeC, safeD] → [[A,B], [C], [D]]
 *
 * 为什么不把所有 safe 的都并行:隔着一次不安全调用,它们的前后依赖可能被打乱。
 * 为什么上限不是 10:现场网络与限流,DEC-015 收到 3。
 */
export function partitionToolCalls<T>(
  calls: readonly T[],
  isSafe: (call: T) => boolean,
  maxConcurrency: number = LOOP_DEFAULTS.maxConcurrency,
): T[][] {
  const batches: T[][] = []
  let current: T[] = []
  const flush = (): void => {
    if (current.length > 0) {
      batches.push(current)
      current = []
    }
  }

  for (const call of calls) {
    if (isSafe(call)) {
      current.push(call)
      if (current.length >= maxConcurrency) flush()
    } else {
      flush()
      batches.push([call])
    }
  }
  flush()
  return batches
}
