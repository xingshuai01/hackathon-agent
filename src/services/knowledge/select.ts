/**
 * 模块 A · 检索:两段式(关键词粗筛 → LLM 精筛)
 *
 * ── 为什么不用向量 ──
 * Claude Code 的 `findRelevantMemories.ts` 全文件没有任何 embedding 调用:
 * 它把候选清单交给模型选。对科研文本(术语密集、同义词少)这条路反而更准,
 * 而且省掉 embedding 成本、向量库依赖和索引一致性维护(DEC-010)。
 *
 * ── 两段各自的红线 ──
 * 段 1 `scan()` 纯本地、不调模型、必须 <1s(AC-A3.3)。所以它只做关键词计数。
 * 段 2 由调用方注入 `NoteSelector`,存储层不依赖 LLM 实现(types.ts 的约定)。
 *
 * ── 精筛失败怎么办 ──
 * **降级,不抛错**。检索是「找依据」,不是数据写入:
 * 模型超时/返回坏 JSON 时,把关键词排序的前 N 条交出去,并显式标注
 * `stage: 'refined_fallback'`。上层(工具 summary)会如实告诉模型
 * 「这是关键词兜底,不是精筛结果」—— 宁可承认降级,也不假装精筛成功。
 */

import { errorMessage, type LlmClient } from '../llm/types.ts'
import type { KnowledgeStore, NoteHit, NoteSelector } from './types.ts'

/** 段 1 的默认候选上限。50 条足够让精筛有选择余地,又不会把 prompt 撑爆 */
export const COARSE_LIMIT = 50

/** 段 2 的默认返回上限。DEC-010:精筛结果 ≤8 条 */
export const FINAL_LIMIT = 8

/** 清单文本上限(字符)。超了按条截断并在末尾注明,不静默丢条目 */
export const MANIFEST_MAX_CHARS = 4_000

/** 精筛失败时兜底给几条。给满 finalLimit,由调用方决定要不要再收窄 */
const FALLBACK_LIMIT = FINAL_LIMIT

export interface RetrieveOptions {
  readonly coarseLimit?: number
  readonly finalLimit?: number
  /** 不传就是纯关键词检索(粗筛)。没有 API key 时也能用 */
  readonly selector?: NoteSelector
  /** 透传给 LLM 的中断信号 */
  readonly signal?: AbortSignal
}

export type RetrieveStage = 'coarse' | 'refined' | 'refined_fallback'

export interface RetrieveResult {
  readonly hits: readonly NoteHit[]
  readonly stage: RetrieveStage
  /** 粗筛命中的总数(不是返回数)—— 用来判断「是知识库空,还是精筛筛掉了」 */
  readonly coarseCount: number
  /** 粗筛耗时,AC-A3.3 的取证字段 */
  readonly coarseMs: number
  /** 降级/跳过的原因。`null` 表示走的是正常路径 */
  readonly note: string | null
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(Math.trunc(value), min), max)
}

/**
 * 生成给精筛模型的清单。
 *
 * 只给 `kind / noteId / 页码 / description`,**不给正文**:
 * description 就是召回依据(memoryTypes.ts:261 的设计),正文会把 prompt 撑大
 * 10 倍,却不会让模型选得更准。
 */
export function buildManifest(
  candidates: readonly NoteHit[],
  maxChars = MANIFEST_MAX_CHARS,
): { readonly text: string; readonly included: number; readonly truncated: boolean } {
  const lines: string[] = []
  let bytes = 0
  let included = 0

  for (const hit of candidates) {
    const line = `[${hit.kind}] ${hit.noteId} | p${hit.page} | ${hit.description}`
    const size = Buffer.byteLength(line, 'utf8') + 1
    if (bytes + size > maxChars) break
    lines.push(line)
    bytes += size
    included += 1
  }

  const truncated = included < candidates.length
  if (truncated) {
    lines.push(`… 还有 ${candidates.length - included} 条未列出(清单已达 ${maxChars} 字符上限)`)
  }
  return { text: lines.join('\n'), included, truncated }
}

const SELECTOR_SYSTEM = [
  '你是知识库检索的筛选器。用户会给出一个查询和一串候选知识页。',
  '你的任务:只挑出**能直接支撑回答这条查询**的条目,不要因为主题相近就选。',
  '严格遵守:',
  '1. 只能从候选清单里选,不得编造 noteId;',
  '2. 最多选 {max} 条,可以少于 {max} 条;',
  '3. 若没有一条能支撑,返回空数组 —— 不要凑数;',
  '4. 只输出 JSON,形如 {"selected": ["noteId1", "noteId2"]}。',
].join('\n')

/**
 * 解析精筛返回的 JSON。
 *
 * 容错是必要的:模型会返回 `{"selected":[...]}`、`{"note_ids":[...]}`、
 * 甚至裸数组。但**不合法就抛错**,让调用方降级 —— 静默返回空数组
 * 会让「模型挂了」看起来像「知识库没内容」。
 */
export function parseSelectedIds(raw: string): string[] {
  const text = raw.trim()
  if (text === '') throw new Error('精筛返回空内容')

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`精筛返回的不是合法 JSON:${text.slice(0, 120)}`)
  }

  const pick = (value: unknown): unknown => {
    if (Array.isArray(value)) return value
    if (typeof value !== 'object' || value === null) return null
    const record = value as Record<string, unknown>
    for (const key of ['selected', 'noteIds', 'note_ids', 'ids']) {
      if (key in record) return record[key]
    }
    return null
  }

  const list = pick(parsed)
  if (!Array.isArray(list)) {
    throw new Error(`精筛 JSON 里找不到数组字段(selected / noteIds):${text.slice(0, 120)}`)
  }

  const ids: string[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (typeof item !== 'string') continue
    const id = item.trim()
    if (id === '' || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

export interface NoteSelectorOptions {
  readonly signal: AbortSignal
  /** 最多选几条。默认 FINAL_LIMIT */
  readonly maxItems?: number
  /** 覆盖模型(走便宜模型) */
  readonly model?: string
  readonly maxManifestChars?: number
}

/**
 * 用 LLM 构造一个 `NoteSelector`。存储层只认签名,不认模型。
 *
 * 白名单过滤在这里做一次、`store.select()` 里再做一次:
 * 前者防「模型编造 id 进了清单之外」,后者防「调用方绕过了这个 selector」。
 * 两次都很便宜,而幻觉 id 一旦进入检索结果,引用就会指向不存在的知识页。
 */
export function createNoteSelector(llm: LlmClient, options: NoteSelectorOptions): NoteSelector {
  const maxItems = clamp(options.maxItems ?? FINAL_LIMIT, 1, 50)
  const maxChars = options.maxManifestChars ?? MANIFEST_MAX_CHARS

  return async (query, candidates) => {
    if (candidates.length === 0) return []

    const manifest = buildManifest(candidates, maxChars)
    const user = [
      `查询:${query}`,
      '',
      '候选知识页:',
      manifest.text,
      '',
      `最多选 ${maxItems} 条,只输出 JSON。`,
    ].join('\n')

    const raw = await llm.sideQuery({
      messages: [
        { role: 'system', content: SELECTOR_SYSTEM.replaceAll('{max}', String(maxItems)) },
        { role: 'user', content: user },
      ],
      signal: options.signal,
      jsonObject: true,
      ...(options.model === undefined ? {} : { model: options.model }),
    })

    const allowed = new Set(candidates.map((hit) => hit.noteId))
    const picked: string[] = []
    for (const noteId of parseSelectedIds(raw)) {
      if (!allowed.has(noteId)) continue
      picked.push(noteId)
      if (picked.length >= maxItems) break
    }
    return picked
  }
}

/**
 * 两段式检索的编排。**上层只需要这一个函数**。
 *
 * 三种短路,都是为了不让没必要花的 token 花出去:
 * 1. 粗筛 0 命中 → 没得精筛
 * 2. 没注入 selector → 纯关键词(无 key 的演示模式)
 * 3. 候选本来就不超过 finalLimit → 精筛不会改变结果
 */
export async function retrieve(
  store: KnowledgeStore,
  query: string,
  options: RetrieveOptions = {},
): Promise<RetrieveResult> {
  const coarseLimit = clamp(options.coarseLimit ?? COARSE_LIMIT, 1, 200)
  const finalLimit = clamp(options.finalLimit ?? FINAL_LIMIT, 1, 50)

  const startedAt = Date.now()
  const candidates = await store.scan(query, coarseLimit)
  const coarseMs = Date.now() - startedAt

  const base = { coarseCount: candidates.length, coarseMs }

  if (candidates.length === 0) {
    return { ...base, hits: [], stage: 'coarse', note: '知识库里没有命中关键词的条目' }
  }
  if (options.selector === undefined) {
    return {
      ...base,
      hits: candidates.slice(0, finalLimit),
      stage: 'coarse',
      note: '未注入精筛器,返回关键词排序前 N 条',
    }
  }
  if (candidates.length <= finalLimit) {
    return {
      ...base,
      hits: candidates,
      stage: 'coarse',
      note: `候选 ${candidates.length} 条不超过上限 ${finalLimit},跳过精筛`,
    }
  }

  try {
    const selected = await store.select(query, candidates, options.selector)
    if (selected.length === 0) {
      // 模型明确说「没有能支撑的」—— 尊重它,不拿关键词结果凑数
      return { ...base, hits: [], stage: 'refined', note: '精筛判定无相关条目' }
    }
    return { ...base, hits: selected.slice(0, finalLimit), stage: 'refined', note: null }
  } catch (error: unknown) {
    return {
      ...base,
      hits: candidates.slice(0, Math.min(finalLimit, FALLBACK_LIMIT)),
      stage: 'refined_fallback',
      note: `精筛失败,已降级为关键词排序:${errorMessage(error)}`,
    }
  }
}
