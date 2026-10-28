/**
 * Agent 主循环。目标 150–250 行(对照源码 query.ts 的 1725 行,只保留骨架)。
 *
 * 依据:docs/SDD.md §6;源码 `query.ts:219/241/307`
 *
 * ── 四条红线(SDD §6.3)──
 *  ① 靠 `toolCalls` 数组判断有无工具调用,不靠 finish_reason
 *  ② 每条工具结果是一条**独立的** `role:'tool'` 消息(不是塞进 user 消息)
 *  ③ `arguments` 是 JSON 字符串,必须 parseToolArguments 后校验
 *  ④ 工具异常不抛,收敛成失败结果回填给模型
 *
 * ── 总原则 ──
 * 进程永不崩。任何失败都要变成「部分结果 + 失败说明」。
 */

import {
  LOOP_DEFAULTS,
  msg,
  parseToolArguments,
  partitionToolCalls,
  type LoopEndReason,
  type LoopOptions,
  type LoopResult,
  type Message,
  type TokenUsage,
  type ToolCall,
} from './types.ts'
import type { ToolRegistry } from './registry.ts'
import type { AgentEvent } from '../ui/events.ts'
import { invokeTool, type ToolContext, type ToolResult } from '../tools/types.ts'
import { errorMessage, type LlmClient } from '../services/llm/types.ts'
import { LlmFatalError } from '../services/llm/types.ts'

export interface LoopDeps {
  readonly llm: LlmClient
  readonly registry: ToolRegistry
  /** 事件出口。核心层不知道谁在消费(CLI / Web) */
  readonly emit: (event: AgentEvent) => void
  /** 工具运行时上下文(不含 signal,由 loop 注入) */
  readonly toolContext: Omit<ToolContext, 'signal'>
  /** 拼在 system prompt 末尾的内容(知识索引、技能清单等) */
  readonly extraSystem?: string
}

/** 单条工具调用的执行结果(内部用) */
interface ToolOutcome {
  readonly id: string
  readonly name: string
  readonly result: ToolResult
  readonly ms: number
}

/**
 * 执行一批工具调用。批内并发,批间串行。
 * 永远返回结果数组(即使工具不存在或参数非法),不抛。
 */
async function runBatch(
  calls: readonly ToolCall[],
  deps: LoopDeps,
  ctx: ToolContext,
): Promise<readonly ToolOutcome[]> {
  return Promise.all(
    calls.map(async (call): Promise<ToolOutcome> => {
      const startedAt = Date.now()

      // ① 解析 arguments(红线 ③)
      const args = parseToolArguments(call)
      if (!args.ok) {
        const result: ToolResult = { ok: false, error: args.error, hint: '请重新生成合法的 JSON 参数' }
        deps.emit({
          type: 'tool_end',
          id: call.id,
          ok: false,
          ms: 0,
          summary: args.error,
        })
        return { id: call.id, name: call.function.name, result, ms: 0 }
      }

      // ② 查工具
      const tool = deps.registry.get(call.function.name)
      if (tool === null) {
        const known = deps.registry.names().join(', ')
        const result: ToolResult = {
          ok: false,
          error: `未知工具:${call.function.name}`,
          hint: `可用工具:${known}`,
        }
        deps.emit({
          type: 'tool_end',
          id: call.id,
          ok: false,
          ms: 0,
          summary: result.error,
        })
        return { id: call.id, name: call.function.name, result, ms: 0 }
      }

      deps.emit({
        type: 'tool_start',
        id: call.id,
        name: tool.name,
        input: args.value,
      })

      // ③ 三段式管线(schema → validateInput → call),永不 throw
      const { result, durationMs } = await invokeTool(tool, args.value, ctx)

      deps.emit({
        type: 'tool_end',
        id: call.id,
        ok: result.ok,
        ms: durationMs,
        summary: result.ok ? result.summary : result.error,
      })

      return {
        id: call.id,
        name: tool.name,
        result,
        ms: durationMs || Date.now() - startedAt,
      }
    }),
  )
}

/** 把工具结果渲染成回填给模型的文本 */
export function renderToolResult(outcome: ToolOutcome): string {
  if (outcome.result.ok) {
    return outcome.result.summary === '' ? '(执行成功,无输出)' : outcome.result.summary
  }
  const hint = outcome.result.hint === undefined ? '' : `\n提示:${outcome.result.hint}`
  return `工具执行失败:${outcome.result.error}${hint}`
}

export async function runLoop(options: LoopOptions, deps: LoopDeps): Promise<LoopResult> {
  const maxTurns = options.maxTurns > 0 ? options.maxTurns : LOOP_DEFAULTS.maxTurns
  const maxConcurrency =
    options.maxConcurrency > 0 ? options.maxConcurrency : LOOP_DEFAULTS.maxConcurrency

  const systemPrompt =
    deps.extraSystem === undefined || deps.extraSystem === ''
      ? options.systemPrompt
      : `${options.systemPrompt}\n\n${deps.extraSystem}`

  const messages: Message[] = [msg.system(systemPrompt), msg.user(options.task)]

  const usage: TokenUsage = { input: 0, output: 0 }
  const ctx: ToolContext = { ...deps.toolContext, signal: options.signal }

  let turns = 0

  const finish = (reason: LoopEndReason): LoopResult => ({
    messages,
    reason,
    turns,
    usage,
  })

  for (turns = 1; turns <= maxTurns; turns += 1) {
    // ── 预算硬闸(触顶保留已有产出)──
    if (usage.input + usage.output > options.maxTotalTokens) return finish('budget_exceeded')
    if (options.signal.aborted) return finish('aborted')

    // ── 调模型 ──
    let turn
    try {
      turn = await deps.llm.turn(
        {
          messages,
          tools: await deps.registry.schemas(options.toolNames),
          signal: options.signal,
        },
        (delta) => deps.emit({ type: 'text_delta', text: delta }),
      )
    } catch (err) {
      if (options.signal.aborted) return finish('aborted')
      deps.emit({ type: 'error', stage: 'llm', message: errorMessage(err) })
      // 可恢复错误已在 llm 层重试过;走到这里是不可恢复
      return finish('model_error')
    }

    usage.input += turn.usage.input
    usage.output += turn.usage.output

    // ── 红线 ①:靠 toolCalls 判断,不看 finish_reason ──
    if (turn.toolCalls.length === 0) {
      messages.push(msg.assistant(turn.text))
      return finish('completed')
    }

    // ── 分区并发(SDD §6.4)──
    const batches = partitionToolCalls(
      turn.toolCalls,
      (call) => {
        const tool = deps.registry.get(call.function.name)
        if (tool === null) return false
        const args = parseToolArguments(call)
        return args.ok ? (tool.isConcurrencySafe?.(args.value) ?? false) : false
      },
      maxConcurrency,
    )

    const outcomes: ToolOutcome[] = []
    for (const batch of batches) {
      if (options.signal.aborted) {
        // 中断时把已完成的回填,避免消息序列不完整
        break
      }
      outcomes.push(...(await runBatch(batch, deps, ctx)))
    }

    // ── 红线 ②:assistant 带 tool_calls,然后**每条**结果一条独立的 role:'tool' ──
    messages.push(msg.assistant(turn.text === '' ? null : turn.text, turn.toolCalls))
    for (const call of turn.toolCalls) {
      const outcome = outcomes.find((o) => o.id === call.id)
      // 漏结果会让 API 报错,所以必须有兜底
      messages.push(
        msg.tool(
          call.id,
          outcome === undefined ? '工具未执行(运行被中断)' : renderToolResult(outcome),
        ),
      )
    }

    if (options.signal.aborted) return finish('aborted')
  }

  // 触顶:保留已有产出
  deps.emit({
    type: 'error',
    stage: 'loop',
    message: `已达最大轮次 ${maxTurns},返回部分结果`,
  })
  return finish('max_turns')
}

/** 供 UI 判断是否需要提示「已中断」 */
export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof LlmFatalError && err.message.includes('已中断')) ||
    (err instanceof Error && err.name === 'AbortError')
  )
}
