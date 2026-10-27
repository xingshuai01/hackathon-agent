/**
 * ★★★ 冻结契约 #2 · 工具契约 ★★★
 *
 * 变更规则:改动本文件的**任何已导出签名**都必须走 PR 且经 1 人 approve。
 * 依据:docs/SDD.md §4.1;源码参考 `Tool.ts:362-393`(类型)、`Tool.ts:757-769`(fail-closed)
 * 对应任务:Issue #19
 *
 * ── 三条最容易写错的地方(先读这段)──
 *
 * 1. **失败只有一种表达**:`{ ok:false, error }`。没有 recoverable / fatal 之分。
 *    框架没有足够信息判断「这个错误可不可恢复」,把判断权交给模型更准(DEC-012)。
 *
 * 2. **能力位 fail-closed**:不写 `isReadOnly` 就当作「可写」,不写 `isConcurrencySafe`
 *    就当作「不可并发」。安全靠默认值兜底,不靠开发者记得写(DEC-013)。
 *
 * 3. **入参校验交给 schema,不要在 `call()` 里手写 if 判断**。
 *    `inputSchema` 是单源真相:它同时生成模型的 JSON Schema 和运行时校验。
 */

import type { z } from 'zod'

// ─────────────────────────────────────────────────────────────
// 1. 结果类型
// ─────────────────────────────────────────────────────────────

/**
 * 工具执行结果。判别字段是 `ok`。
 *
 * - 成功:`data` 给程序用,`summary` 给人和模型看(简短,一行为佳)
 * - 失败:回填给模型的错误文本,不是抛给上层的异常
 */
export type ToolResult<T = unknown> =
  | { ok: true; data: T; summary: string }
  | { ok: false; error: string; hint?: string }

/** 便捷构造:成功 */
export function toolOk<T>(data: T, summary: string): ToolResult<T> {
  return { ok: true, data, summary }
}

/** 便捷构造:失败 */
export function toolFail(error: string, hint?: string): ToolResult<never> {
  return hint === undefined ? { ok: false, error } : { ok: false, error, hint }
}

/**
 * 校验结果。用于 `validateInput`。
 *
 * 与 `ToolResult` 分开的原因:`validateInput` 是**零 I/O 的语义校验**,
 * 它的失败原因通常能直接告诉模型怎么改,所以只需要 message。
 */
export type ValidationResult = { ok: true } | { ok: false; message: string }

// ─────────────────────────────────────────────────────────────
// 2. 运行环境(由编排层注入,工具不得自行创建)
// ─────────────────────────────────────────────────────────────

/** JSONL 追踪写入器。每次运行一个文件,便于回放与复盘 */
export interface TraceWriter {
  write(entry: Record<string, unknown>): void
}

/**
 * fixtures 缓存。`mode === 'replay'` 时只读,
 * `mode === 'live'` 且开启录制时只写。见 FR-E1。
 */
export interface Cache {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
}

/** 运行模式。replay 下**不得**产生任何网络请求(NFR-1、A-11) */
export type RunMode = 'live' | 'replay'

/**
 * 工具运行时上下文。
 *
 * **重要**:工具只能通过 ctx 访问外部能力,不得直接 import services/ 下的实现。
 * 这保证了工具可以被单测(mock 一个 ctx 即可)。
 */
export interface ToolContext {
  /** 中断信号。长耗时工具必须把它透传到底层调用 */
  readonly signal: AbortSignal
  /** 运行模式。replay 模式下从 ctx.cache 读,不许联网 */
  readonly mode: RunMode
  /** 进度回调。工具**可选**调用,不调用不会报错 */
  readonly onProgress?: (progress: { step: string; done: number; total: number }) => void
  readonly trace: TraceWriter
  readonly cache: Cache
}

// ─────────────────────────────────────────────────────────────
// 3. Tool 接口
// ─────────────────────────────────────────────────────────────

/**
 * 统一工具契约。**包括 B 模块自动生成的工具在内,一切工具都实现它。**
 *
 * @typeParam In 入参类型。由 `inputSchema` 推导,不要手写成 any。
 */
export interface Tool<In = unknown> {
  /** 唯一名。只允许 `a-zA-Z0-9_` —— 这是 DeepSeek 对 function name 的硬限制 */
  readonly name: string

  /**
   * 给模型看的描述。**它直接决定模型会不会调用这个工具**,请写清「何时该用」。
   *
   * 是函数而非静态字符串:可根据入参动态调整描述(参考 `Tool.ts:362` 的设计)。
   */
  description(input: In): string | Promise<string>

  /**
   * 单源 schema。约定用 `z.strictObject`(拒绝多余字段)。
   * 它会自动派生:(a) 给模型的 JSON Schema (b) 运行时校验。
   */
  readonly inputSchema: z.ZodType<In>

  /** 真正执行。**内部不得 throw**,一切异常都要转成 `ToolResult` 失败 */
  call(input: In, ctx: ToolContext): Promise<ToolResult>

  // ── 能力位:全部可选,漏写即 fail-closed ──

  /** 是否只读。默认 **false**(当作可写处理) */
  isReadOnly?(input: In): boolean

  /**
   * 是否可与其他工具并发。默认 **false**(当作不可并发)。
   * 主循环只会把**连续**的可并发工具合成一批并行执行(DEC-015)。
   */
  isConcurrencySafe?(input: In): boolean

  /** 是否破坏性操作(删除、覆盖)。默认 **false**。用于 UI 高亮与日志告警 */
  isDestructive?(input: In): boolean

  /** 结果过大时的截断上限(字符数)。默认 **20000** */
  readonly maxResultSizeChars?: number

  /**
   * 零 I/O 的语义校验。在三段管线的第二段执行,早于 `call()`。
   * 典型用途:「这个 path 必须在 knowledge/ 下」「这个 id 必须非空」
   */
  validateInput?(input: In): ValidationResult
}

// ─────────────────────────────────────────────────────────────
// 4. fail-closed 默认值
// ─────────────────────────────────────────────────────────────

/**
 * 采纳 `Tool.ts:757-769` 的默认值策略。
 *
 * **不要绕过 buildTool 直接手写对象字面量** —— 那样会丢掉 fail-closed 保护。
 */
export const TOOL_DEFAULTS = {
  isReadOnly: (): boolean => false,
  isConcurrencySafe: (): boolean => false,
  isDestructive: (): boolean => false,
  maxResultSizeChars: 20_000,
} as const

/** 只写必要字段,能力位可省略 —— buildTool 会补齐 fail-closed 默认值 */
export type ToolDefinition<In> = Omit<
  Tool<In>,
  'isReadOnly' | 'isConcurrencySafe' | 'isDestructive' | 'maxResultSizeChars'
> &
  Partial<Pick<Tool<In>, 'isReadOnly' | 'isConcurrencySafe' | 'isDestructive' | 'maxResultSizeChars'>>

/**
 * 补齐 fail-closed 默认值。**所有工具都应该经由它创建。**
 *
 * @example
 * export const knowledgeSearch = buildTool({
 *   name: 'knowledge_search',
 *   description: () => '在个人知识库中检索与问题相关的原子知识页',
 *   inputSchema: z.strictObject({ query: z.string().min(1) }),
 *   isReadOnly: () => true,
 *   isConcurrencySafe: () => true,
 *   async call(input, ctx) {
 *     // ...
 *     return toolOk(hits, `命中 ${hits.length} 条知识页`)
 *   },
 * })
 */
export function buildTool<In>(def: ToolDefinition<In>): Tool<In> {
  const tool: Tool<In> = {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
    call: def.call,
    maxResultSizeChars: def.maxResultSizeChars ?? TOOL_DEFAULTS.maxResultSizeChars,
    isReadOnly: def.isReadOnly ?? TOOL_DEFAULTS.isReadOnly,
    isConcurrencySafe: def.isConcurrencySafe ?? TOOL_DEFAULTS.isConcurrencySafe,
    isDestructive: def.isDestructive ?? TOOL_DEFAULTS.isDestructive,
  }
  // validateInput 用 exactOptionalPropertyTypes 时不能赋 undefined,故条件添加
  if (def.validateInput) tool.validateInput = def.validateInput
  return tool
}

// ─────────────────────────────────────────────────────────────
// 5. 三段式调用管线(契约的参考实现)
// ─────────────────────────────────────────────────────────────

/**
 * 三段式管线,采纳 `toolExecution.ts:615/683/1207` 的顺序,去掉权限段:
 *
 *   1. `inputSchema.safeParse`  —— schema 校验
 *   2. `validateInput`          —— 零 I/O 语义校验
 *   3. `call`                   —— 真正的副作用
 *
 * **本函数永不 throw**。任何阶段的失败都转成 `ToolResult` 失败,
 * 由主循环回填给模型,模型自行决定重试或换策略(DEC-012)。
 */
export async function invokeTool<In>(
  tool: Tool<In>,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<{ result: ToolResult; durationMs: number }> {
  const startedAt = Date.now()

  // ── 阶段 1:schema 校验 ──
  const parsed = tool.inputSchema.safeParse(rawInput)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    return {
      result: toolFail(`参数校验失败:${detail}`, '请按 inputSchema 修正参数后重试'),
      durationMs: Date.now() - startedAt,
    }
  }

  const input = parsed.data

  // ── 阶段 2:零 I/O 语义校验 ──
  if (tool.validateInput) {
    const validation = tool.validateInput(input)
    if (!validation.ok) {
      return {
        result: toolFail(validation.message),
        durationMs: Date.now() - startedAt,
      }
    }
  }

  // ── 阶段 3:执行 ──
  try {
    const result = await tool.call(input, ctx)
    const limit = tool.maxResultSizeChars ?? TOOL_DEFAULTS.maxResultSizeChars
    return {
      result: truncateResult(result, limit),
      durationMs: Date.now() - startedAt,
    }
  } catch (err) {
    // 工具内部 throw 了(违反了 call 的约定),这里兜底成失败而不是让进程崩
    const message = err instanceof Error ? err.message : String(err)
    return {
      result: toolFail(`工具内部异常:${message}`),
      durationMs: Date.now() - startedAt,
    }
  }
}

/**
 * 结果截断。`summary` 是给模型看的,过大会浪费 token,所以必须截。
 * 注意只截 `summary`,不截 `data` —— data 是给程序用的,截了会导致逻辑错误。
 */
export function truncateResult(result: ToolResult, limit: number): ToolResult {
  if (!result.ok) {
    return result.error.length <= limit ? result : toolFail(result.error.slice(0, limit) + '…')
  }
  const summary =
    result.summary.length <= limit ? result.summary : result.summary.slice(0, limit) + '…'
  return { ok: true, data: result.data, summary }
}

// ─────────────────────────────────────────────────────────────
// 6. 渲染成 DeepSeek 的 tools 参数
// ─────────────────────────────────────────────────────────────

/** DeepSeek/OpenAI `tools` 数组的元素结构 */
export interface DeepSeekToolSchema {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/**
 * 把一个工具渲染成 DeepSeek 的 tool 定义。
 *
 * **这是唯一允许把 zod schema 转成 JSON Schema 的地方** ——
 * 不要在别处再写一份转换逻辑,否则模型看到的和实际校验的会不一致。
 *
 * @param describe 由调用方注入的 JSON Schema 转换函数(通常是 zod v4 的 toJSONSchema),
 *                 这样本文件不需要把 zod 的运行时依赖拉进类型契约层
 */
export async function toDeepSeekToolSchema<In>(
  tool: Tool<In>,
  options: {
    exampleInput: In
    toJsonSchema: (schema: z.ZodType<In>) => Record<string, unknown>
  },
): Promise<DeepSeekToolSchema> {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: await tool.description(options.exampleInput),
      parameters: options.toJsonSchema(tool.inputSchema),
    },
  }
}
