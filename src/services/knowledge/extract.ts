/**
 * 模块 A · 抽取:PaperDoc → AtomicNote[]
 *
 * ── 设计前提(已拍板的三个决策)──
 * 1. **抽取源是本地 PaperDoc,不是模型输出**(D0)。理由:模型自报页码实测 0/20 正确,
 *    而本地段落自带原文,quote 天然可反查。SciencePal 的精读产物只当**黄金样例**
 *    做验收,不进主链路 —— 这样 A 不依赖外部服务与 API key 也能跑通。
 * 2. **页码一律用 quote 反查**(D1)。`Paragraph.page` 只当搜索起点。
 * 3. **反查失败仍入库,但 confidence 降为 low 并写入 rejected 留痕**(D2)。
 *    整条丢弃会让单篇产出掉到 AC-A1.1 的下限之下;`low` 可被下游 select() 过滤,
 *    比"假装没问题"和"直接丢掉"都更接近真实。
 *
 * ── 为什么不调模型 ──
 * - 没有 key 也要能开发与自测(D3)
 * - AC-A1.1 只要求「一论断一页 + 带锚点」,规则法就能满足
 * - 省掉的 token 留给需要"想"的地方(精筛、技能聚合)
 * 留了后续接模型的位置,但不先写:接模型要先有 key,而不是先有代码。
 *
 * ── 已知取舍 ──
 * 规则法分不清「作者的主张」和「他引用的别人的主张」,kind 靠标题与关键词猜,
 * 准确率不如模型。这是刻意的:宁可标注粗糙,**不能让页码不可信**。
 */

import { createHash } from 'node:crypto'

import type { PageLine } from '../paper/parse.ts'
import { gateByParseQuality } from '../paper/types.ts'
import type { PaperDoc, Paragraph } from '../paper/types.ts'

import { attachPageByQuote } from './anchor.ts'
import { validateNote, type AtomicNote, type Confidence, type NoteKind } from './types.ts'

// ─────────────────────────────────────────────────────────────
// 1. 参数
// ─────────────────────────────────────────────────────────────

/** 单篇知识页数量上下限,对齐 AC-A1.1(5–20) */
export const EXTRACT_LIMITS = {
  maxNotes: 20,
  minNotes: 5,
} as const

/** 低于此长度的段落没有独立论断价值 —— 单独成页会让 description 无法召回 */
const MIN_CHUNK_CHARS = 40

/** 超过此长度按句切分 —— 一段 3000 字塞成一条,等于没抽 */
const MAX_CHUNK_CHARS = 900

/** description 上限。它会被拼进索引与 prompt,必须短 */
const MAX_DESCRIPTION_CHARS = 120

/** 句末标点之后跟空白才算断句:避开 `et al.` 与小数点 */
const SENTENCE_BREAK = /(?<=[.!?。！？])\s+/

// ─────────────────────────────────────────────────────────────
// 2. 输入输出
// ─────────────────────────────────────────────────────────────

export interface ExtractInput {
  readonly doc: PaperDoc
  /** 原文分页行。用于 quote → 真页码反查,必传 */
  readonly pageLines: readonly PageLine[]
}

export interface ExtractOptions {
  readonly maxNotes?: number
  readonly windowPages?: number
  /** 注入时钟,便于测试固定 createdAt */
  readonly now?: () => Date
}

export type RejectReason =
  /** 解析质量不达标,整篇隔离(数据铁律 #3) */
  | 'quarantined'
  /** 反查失败且自报页码也不可用 —— 没有合法锚点,不能入库(数据铁律 #1) */
  | 'no_anchor'
  /** 段落太短,没有独立论断价值 */
  | 'too_short'
  /** 作者列表 / 单位 / 编号行 / 版权声明 / 许可样板等非正文内容 */
  | 'noise'
  /** 论文标题行(标题不是论断) */
  | 'title'
  /** noteId 重复(同一页同一 description) */
  | 'duplicate'
  /** 超出 maxNotes 上限(只汇总记一条,不逐条铺开) */
  | 'overflow'
  /** 组好的知识页过不了 validateNote(emit 前的最后自检,契约 #4-A) */
  | 'contract_violation'

export interface RejectedCandidate {
  readonly reason: RejectReason
  /** 失败时的锚点线索;完全无锚点时为 null */
  readonly page: number | null
  readonly snippet: string
  readonly detail: string
}

export interface ExtractStats {
  readonly paragraphs: number
  /** 通过长度与噪声过滤、进入反查的块数 */
  readonly candidates: number
  /** 反查成功数 / 候选数 */
  readonly locateRate: number
  /** 反查成功里「整段命中」的比例,衡量 quote 保真度 */
  readonly exactRate: number
  /** 未被选中的候选数(超出单篇上限) */
  readonly droppedByLimit: number
  /** 最终入库条数 */
  readonly notes: number
}

export type ExtractResult =
  | {
      readonly status: 'quarantined'
      readonly notes: readonly AtomicNote[]
      readonly rejected: readonly RejectedCandidate[]
      readonly stats: ExtractStats
      readonly reason: string
    }
  | {
      readonly status: 'ok'
      readonly notes: readonly AtomicNote[]
      readonly rejected: readonly RejectedCandidate[]
      readonly stats: ExtractStats
    }

// ─────────────────────────────────────────────────────────────
// 3. 切分:段落 → 论断块
// ─────────────────────────────────────────────────────────────

export interface Chunk {
  readonly text: string
  /** 段落自报页码,只作为反查起点 */
  readonly hintPage: number
  /** 所在章节标题,用于 kind 分类与配额分配 */
  readonly heading: string
  /** 章节序号,用于按章节分批取样 */
  readonly sectionIndex: number
}

function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_BREAK)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '')
}

/** 贪心把句子合成不超过 limit 的块 */
function packSentences(sentences: readonly string[], limit: number): string[] {
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (current === '') {
      current = sentence
      continue
    }
    if (current.length + 1 + sentence.length <= limit) {
      current = `${current} ${sentence}`
    } else {
      chunks.push(current)
      current = sentence
    }
  }
  if (current !== '') chunks.push(current)
  return chunks
}

/**
 * 把一篇论文切成「论断块」。
 *
 * 合并规则:长度不足 MIN_CHUNK_CHARS 的段落会并进**同页**的上一块 ——
 * 跨页不合并,否则 quote 会横跨两页,锚点变得模糊。
 */
export function chunkPaper(doc: PaperDoc): Chunk[] {
  const chunks: Chunk[] = []

  doc.sections.forEach((section, sectionIndex) => {
    for (const paragraph of section.paragraphs) {
      if (appendShortParagraph(chunks, paragraph, section.heading)) continue

      const text = paragraph.text.trim()
      const pieces =
        text.length <= MAX_CHUNK_CHARS ? [text] : packSentences(splitSentences(text), MAX_CHUNK_CHARS)
      for (const piece of pieces) {
        chunks.push({ text: piece, hintPage: paragraph.page, heading: section.heading, sectionIndex })
      }
    }
  })

  return chunks
}

/**
 * 短段落并入同页上一块。返回 true 表示已并入、无需单独成块。
 *
 * 为什么值得单独一个函数:论文里「如图 2 所示。」这类残句极多,
 * 每条都成页会把知识库填满无信息量的碎片。
 */
function appendShortParagraph(chunks: Chunk[], paragraph: Paragraph, heading: string): boolean {
  const text = paragraph.text.trim()
  if (text.length >= MIN_CHUNK_CHARS) return false
  const last = chunks[chunks.length - 1]
  if (last === undefined) return false
  if (last.hintPage !== paragraph.page) return false
  if (last.text.length + text.length + 1 > MAX_CHUNK_CHARS) return false

  chunks[chunks.length - 1] = {
    text: `${last.text} ${text}`,
    hintPage: last.hintPage,
    heading: last.heading,
    sectionIndex: last.sectionIndex,
  }
  return true
}

// ─────────────────────────────────────────────────────────────
// 4. 噪声:标题页的作者列表 / 单位 / 编号行
// ─────────────────────────────────────────────────────────────

const NOISE_PATTERNS: readonly RegExp[] = [
  /@[\w.-]+\.\w+/, // 邮箱
  /https?:\/\//, // 链接
  /arxiv:\s*\d{4}\.\d{4,5}/i, // arXiv 编号
  /^\s*\d+(\s*[,;]\s*\d+)*\s+\S/, // 以纯编号开头(作者上标的残留)
  // ── 版权 / 许可样板(arXiv 首页极常见,实测混进了知识页)──
  /provided proper attribution/i,
  /reproduce (the )?(tables and figures|this paper)/i,
  /hereby grants? permission/i,
  /\ball rights reserved\b/i,
  /^\s*copyright\b/i,
  /^\s*©/,
]

/** 英文功能词。作者列表与单位行里几乎没有它们,正文里到处都是 */
const STOPWORDS = new Set([  'the', 'of', 'and', 'is', 'are', 'was', 'were', 'we', 'our', 'in', 'on', 'to', 'that', 'this',
  'with', 'for', 'as', 'by', 'an', 'be', 'it', 'from', 'at', 'or', 'which', 'can', 'not', 'has',
  'have', 'their', 'they', 'these', 'such', 'more', 'than', 'also', 'but', 'when', 'while',
])

/**
 * 判断一个块是不是非正文噪声。
 *
 * 实测教训:真实论文跑第一版时,产出第一条是
 * `∗*,1 2 2 2 2 1 2 Shunyu Yao , Jeffrey Zhao , Dian Yu ...` ——
 * 标题页的作者列表。它长度够、也带页码,靠长度过滤拦不住。
 *
 * 这里的启发式基于一个观察:**正文一定有成句的语法结构**,而作者列表、
 * 单位地址、编号行只是名词堆。所以用「功能词密度」判定比用长度可靠。
 */
export function isNoiseChunk(text: string): boolean {
  const trimmed = text.trim()
  if (NOISE_PATTERNS.some((pattern) => pattern.test(trimmed))) return true

  const words = trimmed.split(/\s+/).filter((word) => /\p{L}/u.test(word))
  if (words.length < 5) return true

  const stopwordHits = words.filter((word) =>
    STOPWORDS.has(word.toLowerCase().replace(/[^\p{L}]/gu, '')),
  ).length
  return words.length >= 8 && stopwordHits / words.length < 0.08
}

// ─────────────────────────────────────────────────────────────
// 5. 配额:为什么不能「取前 20 条」
// ─────────────────────────────────────────────────────────────

/**
 * 不应进入知识库的章节:参考文献、致谢、伦理声明、附录提示词与智能体轨迹。
 *
 * 实测:ReAct 这篇论文的 `C PROMPTS` 有 119 段、`D TRAJECTORIES` 有 86 段,
 * 它们页数够、语法也像正文,靠噪声过滤拦不住。这些内容放进知识库只是稀释召回。
 */
const EXCLUDED_SECTIONS =
  /reference|bibliograph|acknowledg|ethic|reproducib|appendix|prompt|trajector|supplement/i

/**
 * 章节权重。用途只有一个:决定配额先给谁。
 *
 * 不给权重的话,按文件顺序取满 20 条会全部落在摘要与引言 ——
 * 实测一篇 33 页的论文,前 20 条候选全在第 1–2 页,「实验结果」一条都进不来,
 * 知识库于是退化成「摘要的复述」。
 *
 * 返回 0 表示**该章节不参与分配**(不是权重低,而是不该进知识库)。
 */
export function sectionWeight(heading: string): number {
  if (EXCLUDED_SECTIONS.test(heading)) return 0
  if (/method|approach|model|architect|framework|formulat|setup/i.test(heading)) return 3
  if (/experiment|evaluation|result|observation|performance|benchmark|ablation|decision making|analysis/i.test(heading)) {
    return 3
  }
  if (/limitation|discussion|conclusion|future/i.test(heading)) return 2
  return 1
}

/** 只有权重达到这个值才享受「第一轮保底 1 条」 */
const ANCHOR_WEIGHT = 3

/** 组内等间隔取样:既覆盖首尾,又不会把配额全花在开头 */
export function pickEvenly<T>(items: readonly T[], count: number): T[] {
  if (count <= 0 || items.length === 0) return []
  if (items.length <= count) return [...items]

  if (count === 1) {
    const first = items[0]
    return first === undefined ? [] : [first]
  }

  const step = (items.length - 1) / (count - 1)
  const picked: T[] = []
  const seen = new Set<number>()
  for (let i = 0; i < count; i += 1) {
    const index = Math.round(i * step)
    if (seen.has(index)) continue
    seen.add(index)
    const item = items[index]
    if (item !== undefined) picked.push(item)
  }
  return picked
}

/**
 * 配额分配:
 * 1. 第一轮,只给权重 ≥ ANCHOR_WEIGHT 的章节保底 1 条
 *    —— 不设这个门槛,一篇论文二十多个章节(含附录)会一人一条把名额吃光,
 *    实测就是这样让 20 条里 13 条退化成「各章开头第一句」
 * 2. 之后按 `权重 / (已分配+1)` 最大者优先 —— 权重高的章节拿得更多,
 *    同时不会让某个章节独占名额
 * 3. 权重 0(参考文献/提示词/轨迹)一律不参与
 */
export function allocateQuotas(sizes: readonly number[], weights: readonly number[], max: number): number[] {
  const quotas = sizes.map(() => 0)
  if (max <= 0) return quotas

  let remaining = max
  const anchors = sizes
    .map((size, index) => ({ index, size, weight: weights[index] ?? 1 }))
    .filter((group) => group.size > 0 && group.weight >= ANCHOR_WEIGHT)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)

  for (const group of anchors) {
    if (remaining <= 0) break
    quotas[group.index] = 1
    remaining -= 1
  }

  while (remaining > 0) {
    let bestIndex = -1
    let bestScore = 0
    for (let i = 0; i < sizes.length; i += 1) {
      const size = sizes[i] ?? 0
      const quota = quotas[i] ?? 0
      const weight = weights[i] ?? 1
      if (weight <= 0 || quota >= size) continue
      const score = weight / (quota + 1)
      if (score > bestScore) {
        bestScore = score
        bestIndex = i
      }
    }
    // 兜底:所有章节都被排除,但还有名额 —— 把剩余的按顺序补给有候选的章节,
    // 宁可产出质量一般的知识页,也不让「名额没用完」被误认为「论文没有内容」
    if (bestIndex < 0) {
      bestIndex = sizes.findIndex((size, index) => (quotas[index] ?? 0) < size)
    }
    if (bestIndex < 0) break
    quotas[bestIndex] = (quotas[bestIndex] ?? 0) + 1
    remaining -= 1
  }

  return quotas
}

// ─────────────────────────────────────────────────────────────
// 6. 分类:heading 优先,关键词兜底
// ─────────────────────────────────────────────────────────────

const HEADING_RULES: readonly { readonly pattern: RegExp; readonly kind: NoteKind }[] = [
  { pattern: /method|approach|model|architect|framework|formulat/i, kind: 'method' },
  { pattern: /experiment|evaluation|result|performance|benchmark/i, kind: 'result' },
  { pattern: /limitation|discussion|future work|threat/i, kind: 'limitation' },
  { pattern: /background|related work|preliminar/i, kind: 'definition' },
]

const TEXT_RULES: readonly { readonly pattern: RegExp; readonly kind: NoteKind }[] = [
  { pattern: /\d+(\.\d+)?\s*%|\boutperform|\bimprov|\bachiev|\baccuracy|\bF1\b|\bBLEU\b/i, kind: 'result' },
  { pattern: /\bwe (propose|introduce|present|design)\b|\bour (method|model|approach)\b/i, kind: 'method' },
  { pattern: /\blimitation|\bfails?\b|\bonly works?\b|\brestrict/i, kind: 'limitation' },
  { pattern: /\bis defined as\b|\brefers to\b|\bwe call\b|\bdenote[sd]?\b/i, kind: 'definition' },
]

/** 分类:先看章节标题,标题没线索再看句内关键词,都没有算 claim */
export function classifyKind(heading: string, text: string): NoteKind {
  for (const rule of HEADING_RULES) {
    if (rule.pattern.test(heading)) return rule.kind
  }
  for (const rule of TEXT_RULES) {
    if (rule.pattern.test(text)) return rule.kind
  }
  return 'claim'
}

// ─────────────────────────────────────────────────────────────
// 7. description / noteId
// ─────────────────────────────────────────────────────────────

/**
 * 一句话描述:取首句并截断。
 *
 * 契约要求「描述本身就是召回依据」,所以它必须能独立看懂 ——
 * 首句是段落里最可能自带主语的句子;截断只在上限处发生,不做智能摘要
 * (那需要模型,而这一步刻意不依赖模型)。
 */
/**
 * 描述句的最小长度,与 `validateNote` 的 description 下限一致(8 字符)。
 *
 * 为什么不是 20:合法短句如 "First sentence." 有 15 字符,不该被误杀。
 * 真正的碎片短得多(实测 "els." 4 字符、"2018)." 7 字符),
 * 8 这个阈值刚好把它们挡住,又不误伤正常短句。
 */
const MIN_DESCRIPTION_SENTENCE_CHARS = 8
/** 没有正常句子时,长尾巴片段至少要有这么多字符才可退而求其次当描述 */
const MIN_FALLBACK_SENTENCE_CHARS = 20

/**
 * 取第一个「像样的句子」。
 *
 * 为什么不能简单取首句:PDF 文本的 chunk 可能从句子中间开始
 * (断词换行、引用标记之后),首句会变成碎片。实测 BERT 篇 2/20 条
 * description 是 `"els."`、`"2018)."` 这类垃圾,既无法召回也被契约拦下。
 *
 * 退路:小写开头的句子先记下最长的 —— 有些 chunk 整块都是被切断的尾巴,
 * 但长尾巴仍有信息量(如 "most widely-used approaches in this section."),
 * 只有短碎片("els.")才彻底没有召回价值。
 */
function firstSubstantialSentence(text: string): string | null {
  let longest = ''
  for (const sentence of splitSentences(text)) {
    const trimmed = sentence.trim()
    if (trimmed.length < MIN_DESCRIPTION_SENTENCE_CHARS) continue
    // 以标点 / 右括号开头:是上一句的尾巴
    if (/^[.,;:)\]}]/.test(trimmed)) continue
    // 以引用年份尾巴开头:"(Brown et al., 2014) methods." 这种碎片
    if (/^\d{4}\)/.test(trimmed)) continue
    // 以小写字母开头:句子中间被切开。先记下最长的,继续找正常句子。
    if (/^[a-z]/.test(trimmed)) {
      if (trimmed.length > longest.length) longest = trimmed
      continue
    }
    return trimmed
  }
  if (longest.length >= MIN_FALLBACK_SENTENCE_CHARS) return longest
  return null
}

/**
 * 生成描述。**找不到像样的句子时返回空字符串**,而不是退回原文:
 * 整块都是碎片的 chunk 本来就没有可召回的论断,退回原文只会产出垃圾描述。
 * 空描述会被 validateNote 拦下,走 rejected(contract_violation)—— 这是 fail-closed。
 */
export function buildDescription(text: string): string {
  const substantial = firstSubstantialSentence(text)
  if (substantial === null) return ''
  const base = substantial.trim()
  if (base.length <= MAX_DESCRIPTION_CHARS) return base
  return `${base.slice(0, MAX_DESCRIPTION_CHARS - 1).trimEnd()}…`
}

/**
 * noteId 的可推导部分。
 *
 * 输入取 **description** 而不是 text:SRS 与 SDD 在这里表述不一致
 * (一处写 hash(claim)、一处写 hash(text)),必须统一到一处,否则同一论断
 * 会生成两个 id、引用断链。description 是唯一稳定的一句话标识,text 会被改写。
 * 表述已在同批文档里订正。
 */
export function hashOf(description: string): string {
  return createHash('sha256').update(description.trim(), 'utf8').digest('hex').slice(0, 6)
}

export function buildNoteId(paperId: string, page: number, description: string): string {
  return `${paperId}#p${page}#${hashOf(description)}`
}

// ─────────────────────────────────────────────────────────────
// 8. 主入口
// ─────────────────────────────────────────────────────────────

interface ResolvedCandidate {
  readonly chunk: Chunk
  readonly page: number
  readonly confidence: Confidence
  /** 在候选序列里的位置,用于最终按原文顺序输出 */
  readonly order: number
}

function emptyStats(paragraphs = 0): ExtractStats {
  return { paragraphs, candidates: 0, locateRate: 0, exactRate: 0, droppedByLimit: 0, notes: 0 }
}

function countParagraphs(doc: PaperDoc): number {
  let total = 0
  for (const section of doc.sections) total += section.paragraphs.length
  return total
}

/**
 * 抽取主入口。
 *
 * 顺序是**先门控、后抽取**:解析质量不达标的论文连一条知识页都不该产出。
 * 这是数据铁律 #3 在 A 模块的落点 —— 放在这里而不是调用方,
 * 是为了让任何调用路径都不可能绕过它。
 *
 * 三个阶段:
 *   1. 切块并逐块反查页码(过滤长度与噪声)
 *   2. 按章节配额挑出 maxNotes 条(而不是取前 N 条)
 *   3. 组建成知识页并做 noteId 去重
 */

/** 归一化后比较:去掉所有非字母数字,统一小写(容忍空格/大小写/上标差异) */
function normalizeForCompare(text: string): string {
  return text.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()
}

/**
 * 判断 chunk 是否就是论文标题。
 *
 * 实测:RAG 篇的标题行被当成了 claim 知识页。标题不是论断,必须剔除。
 * 比较策略:整段归一化后等于标题,或(段落足够长时)包含标题。
 */
function isTitleChunk(text: string, normalizedTitle: string): boolean {
  if (normalizedTitle.length < 20) return false
  const chunk = normalizeForCompare(text)
  if (chunk === normalizedTitle) return true
  return chunk.length >= 30 && chunk.includes(normalizedTitle)
}

export function extractNotes(input: ExtractInput, options: ExtractOptions = {}): ExtractResult {
  const paragraphs = countParagraphs(input.doc)
  const verdict = gateByParseQuality(input.doc.parseQuality)
  if (verdict.status === 'quarantined') {
    return {
      status: 'quarantined',
      notes: [],
      rejected: [],
      stats: emptyStats(paragraphs),
      reason: verdict.reason,
    }
  }

  const maxNotes = options.maxNotes ?? EXTRACT_LIMITS.maxNotes
  const clock = options.now ?? (() => new Date())
  const chunks = chunkPaper(input.doc)

  const rejected: RejectedCandidate[] = []
  const resolved: ResolvedCandidate[] = []
  let candidates = 0
  let located = 0
  let exact = 0
  const normalizedTitle = normalizeForCompare(input.doc.title)

  // ── 阶段 1:过滤 + 反查 ──
  for (const chunk of chunks) {
    const snippet = buildDescription(chunk.text)

    if (chunk.text.length < MIN_CHUNK_CHARS) {
      rejected.push({
        reason: 'too_short',
        page: chunk.hintPage,
        snippet,
        detail: `仅 ${chunk.text.length} 字符,不足 ${MIN_CHUNK_CHARS}`,
      })
      continue
    }
    if (isNoiseChunk(chunk.text)) {
      rejected.push({
        reason: 'noise',
        page: chunk.hintPage,
        snippet,
        detail: '不像成句正文(作者列表 / 单位 / 编号行 / 版权样板)',
      })
      continue
    }
    if (isTitleChunk(chunk.text, normalizedTitle)) {
      rejected.push({
        reason: 'title',
        page: chunk.hintPage,
        snippet,
        detail: '与论文标题一致 —— 标题不是论断,不进知识库',
      })
      continue
    }

    candidates += 1
    const outcome = attachPageByQuote(
      chunk.text,
      input.pageLines,
      options.windowPages === undefined
        ? { hint: chunk.hintPage }
        : { hint: chunk.hintPage, windowPages: options.windowPages },
    )

    let page: number
    let confidence: Confidence
    if (outcome.status === 'located') {
      page = outcome.anchor.page
      located += 1
      if (outcome.anchor.exact) exact += 1
      confidence = outcome.anchor.exact && outcome.anchor.withinWindow ? 'high' : 'medium'
    } else if (
      outcome.reason !== 'no_pages' &&
      Number.isInteger(chunk.hintPage) &&
      chunk.hintPage >= 1
    ) {
      // D2:反查失败仍入库,但降为 low —— 下游 select() 可据此过滤。
      // `no_pages` 是唯一例外:那是调用方没传原文,系统此时**没有验证能力**,
      // 全篇降级入库等于把「无法验证」伪装成「低置信度」,比直接拒绝更危险。
      page = chunk.hintPage
      confidence = 'low'
    } else {
      rejected.push({
        reason: 'no_anchor',
        page: null,
        snippet,
        detail:
          outcome.reason === 'no_pages'
            ? '调用方未提供原文分页文本,无法建立锚点'
            : `quote 反查失败(${outcome.reason}),自报页码 ${String(chunk.hintPage)} 也不合法`,
      })
      continue
    }

    resolved.push({ chunk, page, confidence, order: resolved.length })
  }

  // ── 阶段 2:按章节配额挑选 ──
  // 分组键用 heading 而不是 sectionIndex:parse.ts 会把大量段落归进
  // `(无标题)` 章节,若按 index 分组,每个空标题章节都能在第一轮拿到 1 条配额,
  // 结果名额被二十个「无标题」吃掉 —— 实测就是这样让 20 条里 13 条变成背景陈述。
  const groups = new Map<string, ResolvedCandidate[]>()
  for (const item of resolved) {
    const key = item.chunk.heading
    const bucket = groups.get(key)
    if (bucket === undefined) groups.set(key, [item])
    else bucket.push(item)
  }

  const groupKeys = [...groups.keys()]
  const sizes = groupKeys.map((key) => (groups.get(key) ?? []).length)
  const weights = groupKeys.map((key) => sectionWeight(key))
  const quotas = allocateQuotas(sizes, weights, maxNotes)

  const selected: ResolvedCandidate[] = []
  groupKeys.forEach((key, position) => {
    const items = groups.get(key) ?? []
    selected.push(...pickEvenly(items, quotas[position] ?? 0))
  })
  // 回到原文顺序,让 notes 读起来跟论文一致
  selected.sort((a, b) => a.order - b.order)

  const droppedByLimit = resolved.length - selected.length
  if (droppedByLimit > 0) {
    rejected.push({
      reason: 'overflow',
      page: null,
      snippet: '',
      detail: `${droppedByLimit} 条候选因超出单篇上限 ${maxNotes} 条未入库(AC-A1.1)`,
    })
  }

  // ── 阶段 3:组建成知识页 ──
  const notes: AtomicNote[] = []
  const seen = new Set<string>()
  for (const item of selected) {
    const description = buildDescription(item.chunk.text)
    const noteId = buildNoteId(input.doc.paperId, item.page, description)
    if (seen.has(noteId)) {
      rejected.push({
        reason: 'duplicate',
        page: item.page,
        snippet: description,
        detail: `noteId 重复:${noteId}`,
      })
      continue
    }
    seen.add(noteId)

    const note: AtomicNote = {
      noteId,
      paperId: input.doc.paperId,
      page: item.page,
      kind: classifyKind(item.chunk.heading, item.chunk.text),
      description,
      text: item.chunk.text,
      evidence: { quote: item.chunk.text, page: item.page },
      confidence: item.confidence,
      createdAt: clock().toISOString(),
    }

    // ── 契约自检(emit 前的最后一道闸)──
    // store 的 putAll 校验抛错是设计行为,但**脏数据不该流到 store 才被拦**。
    // 在这里拦住:不合格的转 rejected,让 ingest 拿到的是「全合格」清单。
    const verdict = validateNote(note)
    if (!verdict.ok) {
      rejected.push({
        reason: 'contract_violation',
        page: item.page,
        snippet: description,
        detail: verdict.reasons.join('; '),
      })
      continue
    }

    notes.push(note)
  }

  return {
    status: 'ok',
    notes,
    rejected,
    stats: {
      paragraphs,
      candidates,
      locateRate: candidates === 0 ? 0 : located / candidates,
      exactRate: located === 0 ? 0 : exact / located,
      droppedByLimit,
      notes: notes.length,
    },
  }
}
