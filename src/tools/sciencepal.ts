/**
 * SciencePal 科研智能体工具。
 *
 * ── 为什么必须有这个工具 ──
 * 比赛要求「至少一个核心环节须实质性使用 SciencePal」,且提交清单包含
 * 「可访问的 SciencePal 项目、Agent 或工作流链接」。
 * 把它做成主循环里的一个**工具节点**,我们的流水线就有一步真正由 SciencePal 执行 ——
 * 这满足「实质性使用」,同时**不改变我们自己的 Agent 架构**。
 *
 * 依据:DEC-032;docs/SDD.md §12.5
 *
 * ── 接口 ──
 *   POST {baseUrl}/agent/initiate        → { thread_id, agent_run_id }
 *   GET  {baseUrl}/agent-run/{id}/stream → SSE 事件流
 *   GET  {baseUrl}/agent-run/{id}        → { status, error, ... }
 *
 * 事件里 `content` 是 **JSON 编码的字符串**,需要二次解析。
 */

import { z } from 'zod'
import { buildTool, toolFail, toolOk, type Tool, type ToolContext } from './types.ts'

/**
 * 取不到 fixture 时的明确错误。
 *
 * 注意:这里**故意不 import `services/cache/fixtures.ts`** ——
 * 工具层不允许依赖 services 实现(R2,检查器会拦)。
 * 缓存能力通过 `ctx.cache` 注入,消息文案就在本文件里写。
 */
function missingFixtureMessage(key: string): string {
  return (
    `replay 模式下 fixtures 里没有这个请求:${key}\n` +
    `  解决:先用 live 模式带 --record 跑一次,把响应录下来并提交到 git`
  )
}

export interface SciencePalConfig {
  readonly apiKey: string
  /** 默认 https://sciencepal.ai/api */
  readonly baseUrl: string
  /** 默认 Survey Agent(学术综述)。可用环境变量覆盖 */
  readonly agentId: string
  /** 可选:指定模型,如 platform::deepseek-v4-flash */
  readonly model?: string
  /** initiate 可能很慢(实测约 28s),给足超时 */
  readonly initiateTimeoutMs: number
  /** 整个运行的最长等待 */
  readonly runTimeoutMs: number
  /**
   * 单次 run 的 token 上限。**必须显式传,不能留空。**
   *
   * 实测:平台的固定开销(prompt_tokens)就有 2.4–3.1 万,与我们的 prompt 长度
   * 关系不大。留空等于不设上限;设得太小(如 8000)会在第一步就
   * `token_budget_exhausted`,run 变成 `asked` 而不是 failed —— 容易被误判成成功。
   */
  readonly tokenBudget: number
}

/** SciencePal 内置 Agent 的固定 ID(来自 GET /agent-catalog 实测) */
export const SCIENCEPAL_BUILTIN_AGENTS = {
  general: '10000000-0000-0000-0000-000000000001',
  biology: '10000000-0000-0000-0000-000000000002',
  material: '10000000-0000-0000-0000-000000000003',
  survey: '10000000-0000-0000-0000-000000000007',
  mimic: '10000000-0000-0000-0000-00000000000a',
} as const

export const SCIENCEPAL_DEFAULTS = {
  baseUrl: 'https://sciencepal.ai/api',
  agentId: SCIENCEPAL_BUILTIN_AGENTS.survey,
  initiateTimeoutMs: 120_000,
  runTimeoutMs: 600_000,
  /**
   * 60 万。`token_budget` 是**上限**,不是预扣,实际按用量结算,
   * 所以设宽比设紧安全:设小了会提前 `asked`,设大了不会多花钱。
   * 依据:实测一篇 33 页论文精读消耗 42.2 万,留约 40% 余量。
   */
  tokenBudget: 600_000,
} as const

/** 从环境变量构造配置。缺 key 时返回 null(工具不注册,而不是让进程崩) */
export function sciencePalConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SciencePalConfig | null {
  const apiKey = env.SCIENCEPAL_API_KEY?.trim() ?? ''
  if (apiKey === '') return null
  const model = env.SCIENCEPAL_MODEL?.trim()
  return {
    apiKey,
    baseUrl: env.SCIENCEPAL_BASE_URL?.trim() || SCIENCEPAL_DEFAULTS.baseUrl,
    agentId: env.SCIENCEPAL_AGENT_ID?.trim() || SCIENCEPAL_DEFAULTS.agentId,
    ...(model !== undefined && model !== '' ? { model } : {}),
    initiateTimeoutMs: Number(env.SCIENCEPAL_INITIATE_TIMEOUT_MS ?? SCIENCEPAL_DEFAULTS.initiateTimeoutMs),
    runTimeoutMs: Number(env.SCIENCEPAL_RUN_TIMEOUT_MS ?? SCIENCEPAL_DEFAULTS.runTimeoutMs),
    tokenBudget: Number(env.SCIENCEPAL_TOKEN_BUDGET ?? SCIENCEPAL_DEFAULTS.tokenBudget),
  }
}

const sciencePalInputSchema = z.strictObject({
  prompt: z
    .string()
    .min(1)
    .max(8000)
    .describe('交给 SciencePal 的任务描述。请把目标、输入材料、期望产出写清楚。'),
  agentId: z
    .string()
    .optional()
    .describe('可选,指定 SciencePal 的 Agent ID。不填用默认的 Survey Agent(学术综述)。'),
})

export type SciencePalInput = z.infer<typeof sciencePalInputSchema>

export interface SciencePalResult {
  readonly answer: string
  readonly threadId: string
  readonly runId: string
  readonly status: string
  readonly model: string | null
}

/** SciencePal SSE 事件的形状(只声明我们用到的字段) */
interface SciencePalEvent {
  type?: string
  content?: string | null
  /** JSON 字符串。`assistant` 事件里带 `stream_status: chunk | complete` */
  metadata?: string | null
  message_id?: string
  thread_id?: string
}

/** 从 assistant 事件的 content(JSON 字符串)里取出正文 */
function extractAssistantText(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || raw === '') return ''
  try {
    const parsed = JSON.parse(raw) as { content?: unknown; role?: unknown }
    return typeof parsed.content === 'string' ? parsed.content : ''
  } catch {
    return ''
  }
}

/**
 * 取 `metadata.stream_status`。
 *
 * **只有 `complete` 态是最终文本。** `chunk` 是流式增量片段,
 * 把它当成答案会拿到半截句子 —— 这是 A 模块消费本工具输出时最危险的失真来源。
 * 返回 '' 表示这个事件没有 metadata(旧版行为),按兼容处理。
 */
function extractStreamStatus(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || raw === '') return ''
  try {
    const parsed = JSON.parse(raw) as { stream_status?: unknown }
    return typeof parsed.stream_status === 'string' ? parsed.stream_status : ''
  } catch {
    return ''
  }
}

/** 从 status 事件的 content 里取 status_type,用于判断结束 */
function extractStatusType(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || raw === '') return ''
  try {
    const parsed = JSON.parse(raw) as { status_type?: unknown }
    return typeof parsed.status_type === 'string' ? parsed.status_type : ''
  } catch {
    return ''
  }
}

/** 哪些 run 状态算"已落定"。running / pending 都不算 */
function isTerminalStatus(status: string): boolean {
  return ['completed', 'failed', 'stopped', 'cancelled', 'error'].includes(status)
}

export function createSciencePalTool(config: SciencePalConfig): Tool<SciencePalInput> {
  const auth = { Authorization: `Bearer ${config.apiKey}` }

  async function runLive(input: SciencePalInput, ctx: ToolContext): Promise<SciencePalResult> {
    const agentId = input.agentId ?? config.agentId

    // ── 1. initiate ──
    // `token_budget` 必须显式传:留空等于不设上限,设太小会让 run 变 `asked`。
    const form = new URLSearchParams({
      agent_id: agentId,
      prompt: input.prompt,
      stream: 'true',
      agent_select_type: 'manual',
      token_budget: String(config.tokenBudget),
    })
    if (config.model !== undefined) form.set('model_name', config.model)

    const initSignal = AbortSignal.any([ctx.signal, AbortSignal.timeout(config.initiateTimeoutMs)])
    const initRes = await fetch(`${config.baseUrl}/agent/initiate`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: initSignal,
    })
    if (!initRes.ok) {
      const body = (await initRes.text()).slice(0, 400)
      throw new Error(`SciencePal initiate 失败 HTTP ${initRes.status}:${body}`)
    }
    const init = (await initRes.json()) as {
      thread_id?: string
      agent_run_id?: string
    }
    const runId = init.agent_run_id
    const threadId = init.thread_id ?? ''
    if (typeof runId !== 'string' || runId === '') {
      throw new Error('SciencePal 未返回 agent_run_id,响应不完整')
    }

    // ── 2. 订阅事件流 ──
    let lastAssistantText = ''
    let assistantTextCount = 0
    /** 上次上报的进度值。事件流一秒几十帧,同值重复上报会让 CLI 刷屏(实测 60+ 行) */
    let reportedCount = -1
    let sawEnd = false
    let model: string | null = null

    const streamSignal = AbortSignal.any([ctx.signal, AbortSignal.timeout(config.runTimeoutMs)])
    const streamRes = await fetch(`${config.baseUrl}/agent-run/${runId}/stream`, {
      headers: { ...auth, Accept: 'text/event-stream' },
      signal: streamSignal,
    })
    if (!streamRes.ok || streamRes.body === null) {
      throw new Error(`SciencePal 事件流打开失败 HTTP ${streamRes.status}`)
    }

    const decoder = new TextDecoder()
    let buffer = ''

    outer: for await (const chunk of streamRes.body) {
      buffer += decoder.decode(chunk, { stream: true })
      let idx = buffer.indexOf('\n\n')
      while (idx !== -1) {
        const frame = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)

        for (const line of frame.split('\n')) {
          const trimmed = line.trimStart()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice('data:'.length).trim()
          if (payload === '') continue
          if (payload === '[DONE]') {
            sawEnd = true
            break outer
          }

          let event: SciencePalEvent
          try {
            event = JSON.parse(payload) as SciencePalEvent
          } catch {
            continue
          }

          if (event.type === 'assistant') {
            const text = extractAssistantText(event.content)
            const streamStatus = extractStreamStatus(event.metadata)
            // ★ 只采纳「最终态」的 assistant 文本,不累加。
            //   - metadata 缺失(旧版/未知):按兼容处理,取最后一条非空
            //   - stream_status === 'complete':这是最终全文,采纳
            //   - stream_status === 'chunk':增量片段,丢弃(采纳它会得到半截句子)
            //   这与 DEC-017「只回传最后一条 assistant 的 text」一致。
            if (text !== '' && streamStatus !== 'chunk') {
              lastAssistantText = text
              assistantTextCount += 1
            }
          } else if (event.type === 'status') {
            const statusType = extractStatusType(event.content)
            if (statusType === 'model_resolved') {
              try {
                const parsed = JSON.parse(event.content ?? '{}') as { model_name?: unknown }
                if (typeof parsed.model_name === 'string') model = parsed.model_name
              } catch {
                // 忽略
              }
            }
            if (statusType === 'thread_run_end' || statusType === 'finish') sawEnd = true
          }

          // 只在计数真的变化时上报:一次 run 的 SSE 有上千帧,逐帧上报等于刷屏
          if (assistantTextCount !== reportedCount) {
            reportedCount = assistantTextCount
            ctx.onProgress?.({
              step: 'sciencepal',
              done: assistantTextCount,
              total: Math.max(assistantTextCount, 1),
            })
          }
        }

        idx = buffer.indexOf('\n\n')
      }
    }

    // ── 3. 查最终状态(流断开不代表完成) ──
    // 实测:事件流会在 assistant_response_end 后就关闭,而 run 状态还需要一小会儿
    // 才从 running 转成 completed。所以这里做几次短轮询,别急着把 running 报给用户。
    let status = sawEnd ? 'completed' : 'unknown'
    let error: string | null = null
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const statusRes = await fetch(`${config.baseUrl}/agent-run/${runId}`, {
          headers: auth,
          signal: AbortSignal.timeout(30_000),
        })
        if (statusRes.ok) {
          const j = (await statusRes.json()) as { status?: unknown; error?: unknown }
          if (typeof j.status === 'string') status = j.status
          if (typeof j.error === 'string' && j.error !== '') error = j.error
        }
      } catch {
        // 查询失败不影响已有结果
      }
      if (isTerminalStatus(status)) break
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }

    const answer = lastAssistantText.trim()

    // ★ `asked` 不是失败,而是「暂停等用户回答」。实测:token_budget 耗尽即此状态。
    //   它**一定**带着半截答案,若当成功返回,下游会把半截论断当完整清单 —— 正是
    //   「跑通了但结果错」的静默错误。所以这里必须显式失败,让主循环能看到并重试。
    if (status === 'asked') {
      const partial = answer === '' ? '' : `(已收到 ${String(answer.length)} 字但未完成)`
      throw new Error(
        `SciencePal 运行被暂停,未完成(status=asked)${partial}` +
          `${error !== null ? `;原因:${error}` : ''}。` +
          `多半是 token_budget(当前 ${String(config.tokenBudget)})不足,提高 SCIENCEPAL_TOKEN_BUDGET 后重试`,
      )
    }

    if (answer === '' && error !== null) {
      throw new Error(`SciencePal 运行失败(${status}):${error}`)
    }
    if (answer === '') {
      throw new Error(`SciencePal 运行结束但没有任何输出(status=${status})`)
    }

    return { answer, threadId, runId, status, model }
  }

  return buildTool<SciencePalInput>({
    name: 'sciencepal_query',
    description: (input) =>
      `调用 SciencePal 科研智能体完成一个研究子任务(默认 Survey Agent 做文献综述)。` +
      `适合:系统性文献调研、跨领域背景梳理、需要平台内置科研工具的深度分析。` +
      `不适合:一两个事实的查询(那用 knowledge_search 更快)。` +
      (input.agentId === undefined ? '' : ` 本次指定 agent=${input.agentId}。`),
    inputSchema: sciencePalInputSchema,
    // 会产生远程副作用并消耗额度 → 默认 fail-closed
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
    maxResultSizeChars: 12_000,

    async call(input, ctx) {
      const cacheKey = `sciencepal:${input.agentId ?? config.agentId}:${input.prompt}`

      // replay:只读 fixtures,绝不联网
      if (ctx.mode === 'replay') {
        const cached = await ctx.cache.get(cacheKey)
        if (cached === null) return toolFail(missingFixtureMessage(cacheKey))
        try {
          const parsed = JSON.parse(cached) as SciencePalResult
          // ★ answer 必须进 summary,不能只报字数 —— 见下方 live 分支的说明
          return toolOk(parsed, `[replay] SciencePal 回答(${parsed.answer.length} 字):\n\n${parsed.answer}`)
        } catch {
          return toolFail('fixtures 里的 SciencePal 响应不是合法 JSON,请重新录制')
        }
      }

      try {
        const result = await runLive(input, ctx)
        await ctx.cache.set(cacheKey, JSON.stringify(result))
        // ★ 为什么正文必须拼进 summary(而不是只写「回答 N 字」)
        //   工具契约规定:`data` 给程序用、`summary` 是**唯一回填给模型**的通道
        //   (`types.ts` ToolResult 注释 + `loop.ts` renderToolResult 只读 summary)。
        //   先前这里只报字数,模型拿不到任何正文,于是「调用成功但内容作废」——
        //   实测表现:模型回一句「工具返回了 status=completed,但正文没带回来」。
        //   截断由 truncateResult 按 maxResultSizeChars(12000)统一兜底。
        return toolOk(
          result,
          `SciencePal 精读结果(status=${result.status},${String(result.answer.length)} 字):\n\n${result.answer}`,
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return toolFail(
          `调用 SciencePal 失败:${message}`,
          '可考虑:① 检查 SCIENCEPAL_API_KEY 是否有效 ② 改用其他 agentId ③ 稍后重试',
        )
      }
    },
  })
}
