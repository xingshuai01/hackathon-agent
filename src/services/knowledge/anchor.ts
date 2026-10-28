/**
 * 模块 A · 页码锚定:把「说是第几页」换成「原文里真的是第几页」
 *
 * ── 为什么这个文件必须存在 ──
 * A 开工前的探针实测(arXiv 2210.03629,20 条论断):
 * | 页码来源 | 正确率 | 说明 |
 * |---|---|---|
 * | SciencePal 自报 page | **0/20** | 偏移 +1 十二次、+2 七次 —— 不是恒定偏移,无法线性校正 |
 * | parse.ts 段落 page  | 70.4% | 偏 1 页 10.4%、错页 5.2%、找不到 14.0% |
 * | quote 回原文反查    | **20/20 定位成功** | 本文件实现的路径 |
 *
 * 结论:页码唯一可信的来源是原文本身。`Paragraph.page` 只能当**搜索起点**,
 * 不能当结论 —— 直接采信它,等于让三成知识页挂着错页码而不自知(数据铁律 #1)。
 *
 * ── 这个文件不做的事 ──
 * 1. 不调模型:纯函数,毫秒级,可全量单测
 * 2. 不决定「定位失败要不要入库」:那是 extract.ts 的策略
 *    (已定:失败仍入库,但 confidence 降为 low,并写入 rejected 日志留痕)
 *
 * ── 算法来自哪里 ──
 * 移植自 `scripts/verify-anchors.mjs`(已实测 20/20)。不重写算法是有意的:
 * 那套「整段 → 前 30 字符 → 前 16 字符」的三级退化,专门对付 PDF 把
 * `A ∪ L`、`α = 0.05` 这类数学表达打散的情况。重写一遍只会丢掉这个经验。
 */

import type { PageLine } from '../paper/parse.ts'

// ─────────────────────────────────────────────────────────────
// 1. 参数与结果
// ─────────────────────────────────────────────────────────────

/** 单个片段低于这个长度不参与匹配:太短的片段(如一个数字)会造成大量假阳性 */
export const MIN_FRAG_CHARS = 8

/** 以 hint 为中心默认搜几页。2 意味着 [hint-2, hint+2] */
export const DEFAULT_WINDOW_PAGES = 2

/** 退化匹配的阈值,与 verify-anchors.mjs 保持一致 */
const LONG_FRAG_CHARS = 30
const SHORT_FRAG_CHARS = 16

/** 「跨页」判定:多数片段命中但非全部,且命中页与所称页相邻 */
const SPAN_RATIO = 0.5

export interface AnchorOptions {
  /** 自报页码,仅作为搜索起点;非法值视为「没有提示」 */
  readonly hint?: number
  /** 窗口半径(页)。传 0 表示只搜 hint 那一页 */
  readonly windowPages?: number
  /** 片段最短长度,默认 MIN_FRAG_CHARS */
  readonly minFragChars?: number
}

export interface LocatedAnchor {
  /** 原文本里的真实页码(1-based) */
  readonly page: number
  /** 真实页码 - 自报页码。无自报页码时为 0 */
  readonly offset: number
  /** 片段命中率 0..1。1 = 每个片段都在这页找到 */
  readonly similarity: number
  /** 是否至少有一个片段**整段**命中(最可信的匹配级别) */
  readonly exact: boolean
  /** 是否跨页(片段分散在两页) */
  readonly acrossPages: boolean
  /**
   * 是否落在 hint 的搜索窗口内。
   * `false` 表示「必须在全篇才找到」—— 页码离自报值很远,
   * 调用方应据此把 confidence 降级(见 extract.ts)。
   */
  readonly withinWindow: boolean
}

export type AnchorFailureReason =
  /** quote 是空字符串 */
  | 'empty_quote'
  /** quote 归一化后没有 ≥minFragChars 的片段,无法可靠匹配 */
  | 'too_short'
  /** 原文里找不到:quote 可能是模型改写或编造的 */
  | 'not_found'
  /** 没有可用的页文本(PageLine[] 为空) */
  | 'no_pages'

export type AnchorOutcome =
  | { readonly status: 'located'; readonly anchor: LocatedAnchor }
  | {
      readonly status: 'unlocated'
      readonly reason: AnchorFailureReason
      /** 最接近的一页(可能为 null);用于日志里说明「差在哪」 */
      readonly bestPage: number | null
      readonly bestSimilarity: number
    }

// ─────────────────────────────────────────────────────────────
// 2. 归一化
// ─────────────────────────────────────────────────────────────

/**
 * 归一化:抵消 PDF 提取的排版噪声,只留下可比较的实词。
 *
 * 具体做四件事:
 * 1. NFKC —— `ﬁ` → `fi`,全角 `Ａ` → `A`(pdfjs 抽出的连字非常常见)
 * 2. 引号统一 —— 花引号 `’` 与 `'` 在原文里混用
 * 3. 只保留拉丁字母、汉字、数字、`%`、`.`;其余(数学符号、破折号、括号)变空格
 * 4. 压空白
 *
 * **为什么保留汉字**:英文论文路径行为不变(汉字范围外的字符照旧被替换),
 * 但中文论文/中文摘句不会整句被抹成空格 —— 这是原脚本没有的能力。
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^\p{Script=Latin}\p{Script=Han}0-9%.\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 把 quote 拆成片段。模型常写 `"前半句 ... 后半句"`,省略号处是它自己的压缩,
 * 逐片段匹配比整段匹配稳得多。
 */
function fragmentsOf(quote: string, minChars: number): string[] {
  return quote
    .split(/\.\.\.|…/)
    .map(normalizeForMatch)
    .filter((frag) => frag.length >= minChars)
}

/**
 * 片段在某页文本里的匹配强度:
 * 3 = 整段命中;2 = 前 30 字符命中;1 = 前 16 字符命中;0 = 没有
 *
 * 退化是必须的:PDF 会把公式打散成 `A ∪ L` → `A  L`,
 * 整段必然对不上,但前半句是稳定散文,足以定位。
 */
function fragmentLevel(pageText: string, frag: string): 0 | 1 | 2 | 3 {
  if (pageText.includes(frag)) return 3
  if (frag.length > LONG_FRAG_CHARS && pageText.includes(frag.slice(0, LONG_FRAG_CHARS))) return 2
  if (frag.length > SHORT_FRAG_CHARS && pageText.includes(frag.slice(0, SHORT_FRAG_CHARS))) return 1
  return 0
}

// ─────────────────────────────────────────────────────────────
// 3. 页文本
// ─────────────────────────────────────────────────────────────

/**
 * 按页聚合归一化文本。非法页码(0 / 非整数)直接跳过 ——
 * 数据铁律 #1:页码 0 是占位符,不是数据。
 */
export function buildPageTexts(lines: readonly PageLine[]): Map<number, string> {
  const parts = new Map<number, string[]>()
  for (const line of lines) {
    if (!Number.isInteger(line.page) || line.page < 1) continue
    const bucket = parts.get(line.page)
    if (bucket === undefined) parts.set(line.page, [line.text])
    else bucket.push(line.text)
  }

  const texts = new Map<number, string>()
  for (const [page, chunks] of parts) {
    const normalized = normalizeForMatch(chunks.join(' '))
    if (normalized !== '') texts.set(page, normalized)
  }
  return texts
}

// ─────────────────────────────────────────────────────────────
// 4. 单页评分与择优
// ─────────────────────────────────────────────────────────────

interface PageScore {
  readonly page: number
  readonly hits: number
  readonly exact: boolean
}

function scorePage(page: number, pageText: string, frags: readonly string[]): PageScore {
  let hits = 0
  let exact = false
  for (const frag of frags) {
    const level = fragmentLevel(pageText, frag)
    if (level > 0) hits += 1
    if (level === 3) exact = true
  }
  return { page, hits, exact }
}

/**
 * 择优规则(顺序即优先级):
 * 1. 命中片段数多者胜 —— 最主要的信号
 * 2. 平手时离 hint 近者胜 —— 同一句话常在摘要与结论重复,自报页码此时是有用线索
 * 3. 再平手取页码小的 —— 保证结果确定,不受遍历顺序影响
 */
function isBetter(candidate: PageScore, current: PageScore, hint: number | null): boolean {
  if (candidate.hits !== current.hits) return candidate.hits > current.hits
  if (hint !== null) {
    const dc = Math.abs(candidate.page - hint)
    const dk = Math.abs(current.page - hint)
    if (dc !== dk) return dc < dk
  }
  return candidate.page < current.page
}

function readHint(options: AnchorOptions): number | null {
  const hint = options.hint
  if (hint === undefined || !Number.isInteger(hint) || hint < 1) return null
  return hint
}

function unlocated(
  reason: AnchorFailureReason,
  bestPage: number | null,
  bestSimilarity: number,
): AnchorOutcome {
  return { status: 'unlocated', reason, bestPage, bestSimilarity }
}

// ─────────────────────────────────────────────────────────────
// 5. 主入口
// ─────────────────────────────────────────────────────────────

/**
 * 用原文摘句反查真实页码。
 *
 * 搜索顺序是「先窗口、后全篇」:
 * - 窗口内找到 → `withinWindow: true`,这是最可信的情形(自报页码基本对)
 * - 窗口内没有、全篇有 → 仍返回 located 但 `withinWindow: false`,
 *   把「页码离得很远」这个事实交给调用方降级,而不是在这里直接判死
 * - 全篇都没有 → unlocated,调用方按既定策略降 confidence 入库并留痕
 */
export function attachPageByQuote(
  quote: string,
  pageLines: readonly PageLine[],
  options: AnchorOptions = {},
): AnchorOutcome {
  if (quote.trim() === '') return unlocated('empty_quote', null, 0)

  const frags = fragmentsOf(quote, options.minFragChars ?? MIN_FRAG_CHARS)
  if (frags.length === 0) return unlocated('too_short', null, 0)

  const pageTexts = buildPageTexts(pageLines)
  if (pageTexts.size === 0) return unlocated('no_pages', null, 0)

  const hint = readHint(options)
  const radius = options.windowPages ?? DEFAULT_WINDOW_PAGES

  let best: PageScore | null = null
  let bestInWindow: PageScore | null = null

  for (const [page, pageText] of pageTexts) {
    const score = scorePage(page, pageText, frags)
    if (best === null || isBetter(score, best, hint)) best = score
    const inWindow = hint !== null && Math.abs(page - hint) <= radius
    if (inWindow && score.hits > 0 && (bestInWindow === null || isBetter(score, bestInWindow, hint))) {
      bestInWindow = score
    }
  }

  const winner = bestInWindow ?? (best !== null && best.hits > 0 ? best : null)
  if (winner === null) {
    // 一个片段都没命中:没有「最接近的页」可言,bestPage 必须是 null,
    // 否则日志里会出现「差 0.0% 命中于第 3 页」这种自相矛盾的记录
    return unlocated('not_found', null, 0)
  }

  const similarity = winner.hits / frags.length
  return {
    status: 'located',
    anchor: {
      page: winner.page,
      offset: hint === null ? 0 : winner.page - hint,
      similarity,
      exact: winner.exact,
      acrossPages: winner.hits < frags.length && similarity >= SPAN_RATIO,
      withinWindow: hint === null ? false : Math.abs(winner.page - hint) <= radius,
    },
  }
}

/**
 * 批量版:对一组「(自报页码, 摘句)」统一反查。
 *
 * 单独提供是因为 extract.ts 是逐段落处理的,重复建页文本会让
 * 100 段 × 34 页的匹配退化成 3400 次归一化(实测慢一个数量级)。
 */
export interface QuoteRequest {
  readonly quote: string
  readonly hint?: number
}

export function attachPagesByQuote(
  requests: readonly QuoteRequest[],
  pageLines: readonly PageLine[],
  options: Omit<AnchorOptions, 'hint'> = {},
): AnchorOutcome[] {
  return requests.map((request) =>
    attachPageByQuote(
      request.quote,
      pageLines,
      request.hint === undefined ? options : { ...options, hint: request.hint },
    ),
  )
}
