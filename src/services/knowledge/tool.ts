/**
 * 模块 A · 把检索暴露成 Agent 工具(AC-A3.2)
 *
 * ── 为什么这个文件在 services/knowledge 而不是 src/tools ──
 * 边界规则 R2 规定 `src/tools` 不得 import 具体业务模块(检查器会拦)。
 * 所以工具**工厂**放在业务模块里,由编排层注入 store 后注册:
 *
 * ```ts
 * registry.register(createKnowledgeSearchTool({ store, selector }))
 * ```
 *
 * 这样既满足「检索结果可被 Agent 作为工具调用获取」,又没有让工具层依赖 A 的实现。
 *
 * ── 返回里必须有锚点 ──
 * AC-A3.1 要求「返回 noteId + 摘要 + 锚点」。这里额外带上 `evidence.quote`:
 * 模型要引用一句话时,拿到原句才能对齐,只给页码它会自己编一句「看起来像原文」的话。
 */

import { z } from 'zod'

import { buildTool, toolOk, type Tool } from '../../tools/types.ts'
import type { LlmClient } from '../llm/types.ts'
import { createNoteSelector, FINAL_LIMIT, retrieve, type RetrieveStage } from './select.ts'
import type { KnowledgeStore, NoteKind, NoteSelector } from './types.ts'

export const KNOWLEDGE_SEARCH_TOOL_NAME = 'knowledge_search'

/** 单条引用里 quote 的最大长度。够模型对齐原句,又不至于把上下文吃满 */
const MAX_QUOTE_CHARS = 240

const knowledgeSearchInputSchema = z.strictObject({
  query: z
    .string()
    .min(1)
    .max(300)
    .describe('检索语句。用论文里的术语,不要用「这个论文讲了什么」这种整句问题'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe(`最多返回几条,默认 ${FINAL_LIMIT}`),
})

export type KnowledgeSearchInput = z.infer<typeof knowledgeSearchInputSchema>

export interface KnowledgeSearchHit {
  readonly noteId: string
  readonly paperId: string
  readonly page: number
  readonly kind: NoteKind
  readonly description: string
  /** 原文摘句,供模型逐字引用 */
  readonly quote: string
  readonly score: number
}

export interface KnowledgeSearchOutput {
  readonly hits: readonly KnowledgeSearchHit[]
  readonly stage: RetrieveStage
  readonly coarseCount: number
  readonly coarseMs: number
  readonly note: string | null
}

/**
 * 知识页被引用的通知口。
 *
 * ── 为什么不给 `ToolContext` 加 `emit` ──
 * `tools/types.ts` 是冻结契约,加一个字段要全组 approve;而这里只需要「能把
 * 命中告诉 UI」。用**工厂注入**就能做到,契约零改动:
 *
 * ```ts
 * createKnowledgeSearchTool({ store, events: bus })   // main.ts 里就这么传
 * ```
 *
 * 这里只声明本模块真正用得到的那一个事件形状,不 import `ui/events.ts` ——
 * 结构上是 `EventBus` 的子集,传 bus 能直接通过类型检查,但 A 不会因为
 * UI 层改事件定义而被迫跟着改。
 */
export interface KnowledgeHitSink {
  emit(event: {
    readonly type: 'knowledge_hit'
    readonly noteId: string
    readonly paperId: string
    readonly page: number
    readonly description: string
  }): void
}

export interface KnowledgeSearchOptions {
  readonly store: KnowledgeStore
  /**
   * 传了就在命中后逐条上报 `knowledge_hit`。
   *
   * 三面板里的「知识库」面板靠它高亮本轮引用了哪几页;不传则完全静默,
   * 适合单测与批处理。上报失败不影响检索结果 —— 展示层的问题不该让工具失败。
   */
  readonly events?: KnowledgeHitSink
  /** 直接注入精筛器(测试或特殊编排用) */
  readonly selector?: NoteSelector
  /**
   * 传 LLM 就按需构造精筛器 —— **每次调用用 `ctx.signal`**。
   *
   * 为什么不在这里预先 `createNoteSelector({signal})`:工具被中断时,
   * 预建的那个 signal 与本次调用的 `ctx.signal` 不是同一个,取消就传不下去。
   */
  readonly llm?: LlmClient
  /** 精筛用的模型(默认 cheap model) */
  readonly selectorModel?: string
  /** 返回条数上限,默认 FINAL_LIMIT */
  readonly finalLimit?: number
  readonly maxResultSizeChars?: number
}

function trimQuote(quote: string): string {
  const flat = quote.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_QUOTE_CHARS ? `${flat.slice(0, MAX_QUOTE_CHARS)}…` : flat
}

export function createKnowledgeSearchTool(options: KnowledgeSearchOptions): Tool<KnowledgeSearchInput> {
  const { store } = options
  const finalLimit = options.finalLimit ?? FINAL_LIMIT

  return buildTool<KnowledgeSearchInput>({
    name: KNOWLEDGE_SEARCH_TOOL_NAME,
    description: () =>
      '在个人知识库里检索已沉淀的原子知识页,返回带页码锚点的原句证据。' +
      '适合:回答「某篇论文怎么做的 / 结果是多少 / 有什么局限」这类需要引用原文的问题。' +
      '不适合:查常识(直接答)、查最新进展(那是 sciencepal_query 的事)。' +
      '命中后引用时请带上 noteId 与页码,不要改写 quote。',
    inputSchema: knowledgeSearchInputSchema,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    ...(options.maxResultSizeChars === undefined
      ? {}
      : { maxResultSizeChars: options.maxResultSizeChars }),

    async call(input, ctx) {
      // 精筛器按需构造:只有真走到「候选 > finalLimit」时才会用到它。
      // 用 `ctx.signal` 而不是预先建好的 signal —— 否则主循环取消时传不下去。
      const selector =
        options.selector ??
        (options.llm === undefined
          ? undefined
          : createNoteSelector(options.llm, {
              signal: ctx.signal,
              maxItems: input.limit ?? finalLimit,
              ...(options.selectorModel === undefined ? {} : { model: options.selectorModel }),
            }))

      const result = await retrieve(store, input.query, {
        finalLimit: input.limit ?? finalLimit,
        signal: ctx.signal,
        ...(selector === undefined ? {} : { selector }),
      })

      if (result.hits.length === 0) {
        const reason = result.note ?? '无命中'
        return toolOk<KnowledgeSearchOutput>(
          {
            hits: [],
            stage: result.stage,
            coarseCount: result.coarseCount,
            coarseMs: result.coarseMs,
            note: result.note,
          },
          `知识库未命中(${reason})。不要凭空引用,换个术语再试或直接说明没有依据`,
        )
      }

      const hits: KnowledgeSearchHit[] = []
      for (const hit of result.hits) {
        const note = await store.get(hit.noteId)
        hits.push({
          noteId: hit.noteId,
          paperId: hit.paperId,
          page: hit.page,
          kind: hit.kind,
          description: hit.description,
          quote: trimQuote(note?.evidence.quote ?? ''),
          score: hit.score,
        })
      }

      // 逐条上报命中。放在「拿齐 quote 之后」:UI 要展示的是带锚点的条目,
      // 提前报会在 half-built 状态下把 page 与 description 发出去。
      // 按 AGENTS ⑤,工具内部不 throw —— 上报失败只降级为「UI 没收到」。
      if (options.events !== undefined) {
        for (const hit of hits) {
          try {
            options.events.emit({
              type: 'knowledge_hit',
              noteId: hit.noteId,
              paperId: hit.paperId,
              page: hit.page,
              description: hit.description,
            })
          } catch {
            break
          }
        }
      }

      const anchors = hits.map((hit) => `${hit.noteId}(p${hit.page})`).join('、')
      const suffix = result.note === null ? '' : ` · ${result.note}`
      // ★ 原句必须回填给模型。理由:`summary` 是模型唯一能看到的通道
      //   (`tools/types.ts` 的 ToolResult 约定:data 给程序,summary 给人和模型)。
      //   只回 noteId + 页码时,模型看得见「索引标题」却引不出原文,
      //   回答里就会出现「工具没返回 quote,我无法引用」——实测如此。
      //   而「每条论断可反查逐字原句」正是本项目的核心主张,不能断在回填这一步。
      //   长度由 trimQuote(240 字/条)与 maxResultSizeChars 双重兜底。
      const evidence = hits
        .map((hit) =>
          hit.quote === ''
            ? `[${hit.noteId} p${String(hit.page)}] (原句缺失,不要引用此条)`
            : `[${hit.noteId} p${String(hit.page)}] "${hit.quote}"`,
        )
        .join('\n')
      return toolOk<KnowledgeSearchOutput>(
        {
          hits,
          stage: result.stage,
          coarseCount: result.coarseCount,
          coarseMs: result.coarseMs,
          note: result.note,
        },
        `命中 ${hits.length} 条:${anchors}${suffix}\n${evidence}`,
      )
    },
  })
}
