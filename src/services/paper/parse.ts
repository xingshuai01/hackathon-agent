/**
 * 共享底座:PDF / 纯文本 → PaperDoc。
 *
 * 依据:docs/SDD.md §7.1、SRS FR-D1;数据铁律 #1(无页码不入库)。
 * 对应任务:Issue #23。
 *
 * ── 这一层为什么必须先做 ──
 * A 知识库、B 工具库、C 技能库三个模块的**唯一共同上游**。
 * 这里不产出带 `page` 的段落,下游三个模块全会返工。
 *
 * ── 页码从哪来 ──
 * 不用猜:pdfjs 按页给文本,页号由解析器给出,页码精度 100%。
 * 备选路径 `parsePaginatedText()` 支持「按 \f 分页的纯文本」
 * (等价于 pdftotext -layout 的输出),方便没装 poppler 的环境与单测。
 *
 * ── 已知取舍 ──
 * 不做 OCR、不做公式转写、不做图表深度解析(SRS §3.2 明确不做)。
 * 表格只做「识别为连续行并保留」,不重建行列结构 —— 那是后续可选项。
 */

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type {
  FigureBlock,
  PaperDoc,
  ParseQuality,
  Paragraph,
  Reference,
  Section,
  TableBlock,
} from './types.ts'

// ─────────────────────────────────────────────────────────────
// 1. 原始页文本 → 行 → 段落
// ─────────────────────────────────────────────────────────────

/** 一行文本 + 它所在的页 */
export interface PageLine {
  readonly text: string
  readonly page: number
  /** 该行的最大字号(取自 PDF 文本矩阵的 scaleY)。用于识别标题 */
  readonly fontSize?: number
}

/**
 * 把一段纯文本按 `\f`(form feed)切页。
 *
 * `pdftotext -layout` 的输出天然以 `\f` 分页,所以这条路径的页码同样精确。
 * 末尾常有一个多余的空页,这里会丢掉。
 */
export function splitPagesByFormFeed(text: string): string[] {
  const pages = text.split('\f')
  // 去掉最后一页(若全为空白)
  while (pages.length > 1 && (pages.at(-1) ?? '').trim() === '') pages.pop()
  return pages
}

/** 把页文本切成行,记住行属于哪一页 */
export function paginatedTextToLines(text: string): PageLine[] {
  const lines: PageLine[] = []
  splitPagesByFormFeed(text).forEach((pageText, index) => {
    const page = index + 1
    for (const raw of pageText.split(/\r?\n/)) {
      const trimmed = raw.replace(/\s+$/, '')
      if (trimmed.trim() === '') continue
      lines.push({ text: trimmed, page })
    }
  })
  return lines
}

/** 页眉页脚识别:同一行文本在 >= 30% 的页面上重复出现,就当作噪声丢掉 */
export function stripRunningHeaders(lines: readonly PageLine[]): PageLine[] {
  const totalPages = new Set(lines.map((l) => l.page)).size
  if (totalPages < 3) return [...lines]

  const counts = new Map<string, number>()
  for (const line of lines) {
    // 数字归一化:页码会变,内容不变
    const key = line.text.toLowerCase().replace(/\d+/g, '#').trim()
    if (key.length < 4 || key.length > 120) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const threshold = Math.max(2, Math.floor(totalPages * 0.3))
  const noise = new Set(
    [...counts.entries()].filter(([, n]) => n >= threshold).map(([k]) => k),
  )

  return lines.filter((line) => {
    const key = line.text.toLowerCase().replace(/\d+/g, '#').trim()
    return !noise.has(key)
  })
}

// ─────────────────────────────────────────────────────────────
// 2. 章节识别
// ─────────────────────────────────────────────────────────────

/** 常见的固定章节名。命中则直接当标题 */
const KNOWN_HEADINGS = [
  'abstract',
  'introduction',
  'related work',
  'background',
  'method',
  'methods',
  'methodology',
  'approach',
  'experiments',
  'experimental setup',
  'results',
  'discussion',
  'analysis',
  'ablation study',
  'conclusion',
  'conclusions',
  'future work',
  'limitations',
  'references',
  'acknowledgments',
  'acknowledgements',
  'appendix',
]

/**
 * 判断一行是否是章节标题。
 *
 * 三类信号:
 *  1. 编号标题:`1 Introduction` / `2.1 Model Architecture` / `3. Results`
 *  2. 常见固定名(Abstract / References / …),要求整行匹配
 *  3. 全大写短行(≤ 60 字符)
 *
 * 行长度上限 90 —— 再长的行即使是全大写也是正文而不是标题。
 */
export function isHeading(line: string): boolean {
  const text = line.trim()
  if (text.length === 0 || text.length > 90) return false
  // 去掉尾部页码/句点
  const normalized = text.replace(/[.\s]+$/, '')
  if (normalized.length === 0) return false

  // 1. 编号标题。标题里允许出现冠词、小写介词
  if (/^\d+(\.\d+)*\.?\s+\S/.test(normalized)) {
    const words = normalized.split(/\s+/).slice(1)
    // 真标题很短:词数 ≤ 12。超过这个量级基本是「以数字开头的正文/列表项」。
    // 只靠「首字母大写」判断会把 "1 This is a long sentence..." 这种误判成标题(实测踩过)。
    const shortEnough = words.length > 0 && words.length <= 12
    const looksTitle = words.some((w) => /^[A-Z]/.test(w)) && !/[;:,]$/.test(normalized)
    if (shortEnough && looksTitle) return true
  }

  // 2. 常见固定名
  const lower = normalized.toLowerCase()
  if (KNOWN_HEADINGS.includes(lower)) return true
  // 允许带编号前缀的固定名,如 "7 Conclusion"
  const withoutNumber = lower.replace(/^\d+(\.\d+)*\.?\s+/, '')
  if (KNOWN_HEADINGS.includes(withoutNumber)) return true

  // 3. 全大写短行(至少 3 个字母,避免把 "AI" 之类当标题)
  if (/^[A-Z][A-Z0-9\s\-:&/,]{2,}$/.test(normalized) && /[A-Z]{3}/.test(normalized)) {
    return true
  }

  return false
}

/** 标题层级:看编号里点号的个数 */
export function headingLevel(line: string): number {
  const m = /^(\d+(?:\.\d+)*)/.exec(line.trim())
  if (m?.[1] === undefined) return 1
  return m[1].split('.').length
}

// ─────────────────────────────────────────────────────────────
// 3. 行 → 章节 / 段落
// ─────────────────────────────────────────────────────────────

interface DraftSection {
  heading: string
  level: number
  firstPage: number
  body: PageLine[]
}

/** 把行切分成草稿章节 */
export function linesToDraftSections(lines: readonly PageLine[]): DraftSection[] {
  const sections: DraftSection[] = []
  let current: DraftSection = {
    heading: '',
    level: 1,
    firstPage: lines[0]?.page ?? 1,
    body: [],
  }

  for (const line of lines) {
    if (isHeading(line.text)) {
      if (current.body.length > 0 || current.heading !== '') sections.push(current)
      current = {
        heading: line.text.trim(),
        level: headingLevel(line.text),
        firstPage: line.page,
        body: [],
      }
    } else {
      current.body.push(line)
    }
  }
  sections.push(current)

  return sections.filter((s) => s.heading !== '' || s.body.length > 0)
}

/**
 * 段落切分。
 *
 * 论文 PDF 抽出来的行没有空行信息,所以按启发式合并:
 *  - 上一行以 `.` `。` `?` `!` `:` 结尾且长度足够 → 断段
 *  - 当前行以短横线或编号开头(列表项)→ 断段
 *  - 单行超过 MIN_PARAGRAPH_CHARS 仍未断 → 也断,避免超大段落
 */
const MIN_PARAGRAPH_CHARS = 40
const MAX_PARAGRAPH_CHARS = 1600
const SENTENCE_END = /[.。?!:]\s*$/
const LIST_START = /^(?:[-•*]|\(\d+\)|\d+\))\s+/

export function groupIntoParagraphs(body: readonly PageLine[]): Paragraph[] {
  const paragraphs: Paragraph[] = []
  let buffer: PageLine[] = []

  const flush = (): void => {
    if (buffer.length === 0) return
    // 段落归属页 = 首行所在页(与「引用回指到段落起始页」的直觉一致)
    const page = buffer[0]?.page ?? 1
    const text = buffer
      .map((l) => l.text.trim())
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    if (text !== '') paragraphs.push({ text, page })
    buffer = []
  }

  for (const line of body) {
    const text = line.text.trim()
    if (text === '') {
      flush()
      continue
    }

    // 跨页时不断段(论文的段落常常跨页),但记录页信息时用首行页
    const isListStart = LIST_START.test(text)
    const prev = buffer.at(-1)
    const prevEndsSentence = prev !== undefined && SENTENCE_END.test(prev.text.trim())
    const bufferChars = buffer.reduce((n, l) => n + l.text.length, 0)
    const prevPage = prev?.page

    if (
      buffer.length > 0 &&
      (isListStart ||
        (prevEndsSentence && bufferChars >= MIN_PARAGRAPH_CHARS) ||
        bufferChars >= MAX_PARAGRAPH_CHARS ||
        (prevPage !== undefined && prevPage !== line.page && prevEndsSentence))
    ) {
      flush()
    }

    buffer.push(line)
  }
  flush()

  return paragraphs
}

// ─────────────────────────────────────────────────────────────
// 4. 元数据推导
// ─────────────────────────────────────────────────────────────

const DOI_RE = /\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/
const ARXIV_RE = /arXiv:\s*(\d{4}\.\d{4,5})(v\d+)?/i

/** 从全文里找 DOI / arXiv ID,推导稳定 paperId */
export function derivePaperId(fullText: string, fileBytes?: Uint8Array): string {
  const arxiv = ARXIV_RE.exec(fullText)
  if (arxiv?.[1] !== undefined) return `arxiv:${arxiv[1]}`

  const doi = DOI_RE.exec(fullText)
  if (doi?.[0] !== undefined) return `doi:${doi[0].toLowerCase()}`

  if (fileBytes !== undefined) {
    return createHash('sha256').update(fileBytes).digest('hex').slice(0, 16)
  }
  return createHash('sha256').update(fullText).digest('hex').slice(0, 16)
}

/** 从 arXiv ID 推年份 */
export function yearFromArxivId(paperId: string): number | null {
  const m = /^arxiv:(\d{2})\d{2}\.\d{4,5}$/.exec(paperId)
  if (m?.[1] === undefined) return null
  const yy = Number(m[1])
  // arXiv 的 YY 从 2007 年开始是两位年份;2007 之前是 92-06
  return yy >= 7 && yy <= 99 ? 2000 + yy : null
}

/** 从第一页文本猜标题:优先用字号,其次用启发式 */
export function guessTitle(lines: readonly PageLine[]): string {
  const page1 = lines.filter((l) => l.page === 1)

  // ── 首选:第一页字号最大的那一段连续行就是标题 ──
  // 论文排版里标题字号显著大于正文,这是最可靠的信号。
  const sized = page1.filter((l) => typeof l.fontSize === 'number' && l.fontSize > 0)
  if (sized.length > 0) {
    const maxSize = Math.max(...sized.map((l) => l.fontSize ?? 0))
    // 正文通常 9-12pt,标题 14-24pt。maxSize 若不超过正文的 1.15 倍,说明没有明显标题层
    const bodySizes = sized.map((l) => l.fontSize ?? 0).filter((s) => s < maxSize * 0.9)
    const bodyMedian =
      bodySizes.length > 0
        ? ([...bodySizes].sort((a, b) => a - b)[Math.floor(bodySizes.length / 2)] ?? 0)
        : 0
    if (maxSize >= 13 && (bodyMedian === 0 || maxSize >= bodyMedian * 1.15)) {
      const titleParts = sized
        .filter((l) => (l.fontSize ?? 0) >= maxSize * 0.95)
        .map((l) => l.text.trim())
        .filter((t) => t !== '' && !isNoiseLine(t))
      if (titleParts.length > 0) {
        const joined = titleParts.join(' ').replace(/\s{2,}/g, ' ').trim()
        if (joined.length >= 8 && joined.length <= 250) return joined
      }
    }
  }

  // ── 回退:启发式挑第一个「像标题」的行 ──
  for (const line of page1) {
    const text = line.text.trim()
    if (text.length < 8 || text.length > 200) continue
    if (isHeading(text)) continue
    if (isNoiseLine(text)) continue
    if (/@/.test(text)) continue
    return text
  }
  return ''
}

/**
 * 判定「不像标题」的噪声行:版权声明、许可声明、arXiv 侧标、机构行等。
 *
 * 为什么需要:arXiv PDF 首页常有多行版权/许可说明,它们的字号也可能偏大,
 * 而且第一行被过滤掉之后第二行依然会被当标题(实测踩过)。
 */
const NOISE_PATTERNS: readonly RegExp[] = [
  /^provided proper attribution/i,
  /^reproduce the tables/i,
  /^scholarly works/i,
  /permission to reproduce/i,
  /hereby grants? permission/i,
  /^copyright\b/i,
  /^©/,
  /^all rights reserved/i,
  /^arxiv:/i,
  /^preprint\b/i,
  /^doi:/i,
  /^under review/i,
  /^published (in|at|as)/i,
  /^proceedings of/i,
  /^figure \d+/i,
  /^table \d+/i,
]

export function isNoiseLine(text: string): boolean {
  const t = text.trim()
  if (t === '') return true
  return NOISE_PATTERNS.some((re) => re.test(t))
}

/** 抽取摘要:Abstract 标题之后、下一个标题之前的正文 */
export function extractAbstract(sections: readonly Section[]): string {
  for (const section of sections) {
    if (section.heading.toLowerCase().replace(/^\d+(\.\d+)*\.?\s+/, '') !== 'abstract') continue
    const text = section.paragraphs.map((p) => p.text).join(' ').trim()
    return text.slice(0, 4000)
  }
  return ''
}

/** 抽取参考文献条目。只保留「看起来像引用」的行,供后续 CitationGraph 用 */
export function extractReferences(sections: readonly Section[]): Reference[] {
  const refs: Reference[] = []
  for (const section of sections) {
    const heading = section.heading.toLowerCase().replace(/^\d+(\.\d+)*\.?\s+/, '')
    if (heading !== 'references' && heading !== 'bibliography') continue
    for (const paragraph of section.paragraphs) {
      // 按 "[12]" 或 "12." 起头切分
      const parts = paragraph.text.split(/(?=\[\d{1,3}\])/).filter((p) => p.trim() !== '')
      for (const part of parts) {
        const raw = part.trim()
        if (raw.length < 20) continue
        const doi = DOI_RE.exec(raw)?.[0]
        const arxivId = ARXIV_RE.exec(raw)?.[1]
        refs.push({
          raw,
          ...(doi === undefined ? {} : { doi }),
          ...(arxivId === undefined ? {} : { arxivId }),
        })
      }
    }
  }
  return refs
}

// ─────────────────────────────────────────────────────────────
// 5. 汇编成 PaperDoc
// ─────────────────────────────────────────────────────────────

export interface AssembleInput {
  readonly lines: readonly PageLine[]
  readonly pagesTotal: number
  readonly bytes?: Uint8Array
  readonly titleHint?: string
  readonly authorsHint?: readonly string[]
  readonly yearHint?: number
  readonly venueHint?: string
}

export interface AssembleResult {
  readonly doc: PaperDoc
  readonly warnings: readonly string[]
}

/** 判断一页是否「解析成功」:去掉空白后至少这么多字符才算 */
const MIN_PAGE_CHARS = 50

export function assemblePaperDoc(input: AssembleInput): AssembleResult {
  const warnings: string[] = []

  const cleaned = stripRunningHeaders(input.lines)
  const draftSections = linesToDraftSections(cleaned)

  const sections: Section[] = draftSections.map((draft) => {
    const paragraphs = groupIntoParagraphs(draft.body)
    // 表格与图在 v1.0 不解析,只占位以免下游拿到 undefined
    const tables: TableBlock[] = []
    const figures: FigureBlock[] = []
    return {
      heading: draft.heading === '' ? '(无标题)' : draft.heading,
      level: draft.level,
      paragraphs,
      tables,
      figures,
    }
  })

  // 解析质量:按页统计有实质内容的页
  const charsByPage = new Map<number, number>()
  for (const line of cleaned) {
    charsByPage.set(line.page, (charsByPage.get(line.page) ?? 0) + line.text.trim().length)
  }
  let pagesParsed = 0
  for (let p = 1; p <= input.pagesTotal; p += 1) {
    if ((charsByPage.get(p) ?? 0) >= MIN_PAGE_CHARS) pagesParsed += 1
  }

  const parseQuality: ParseQuality = {
    pagesParsed,
    pagesTotal: input.pagesTotal,
    hasOcr: false,
  }

  if (pagesParsed < input.pagesTotal) {
    warnings.push(
      `${input.pagesTotal - pagesParsed} 页没有提取到有效文本(可能是扫描件或纯图片页)`,
    )
  }
  if (pagesParsed / Math.max(1, input.pagesTotal) < 0.7) {
    warnings.push(
      `解析率 ${((pagesParsed / Math.max(1, input.pagesTotal)) * 100).toFixed(1)}% 低于阈值 70%,该论文应被隔离(数据铁律 #3)`,
    )
  }

  const fullText = cleaned.map((l) => l.text).join('\n')
  const paperId = derivePaperId(fullText, input.bytes)

  const title = (input.titleHint ?? '').trim() !== '' ? (input.titleHint ?? '').trim() : guessTitle(cleaned)
  if (title === '') warnings.push('未能识别标题,已置为空字符串')

  const year = input.yearHint ?? yearFromArxivId(paperId) ?? new Date().getFullYear()

  const doc: PaperDoc = {
    paperId,
    title,
    authors: input.authorsHint ?? [],
    year,
    ...(input.venueHint === undefined ? {} : { venue: input.venueHint }),
    abstract: extractAbstract(sections),
    sections,
    references: extractReferences(sections),
    parseQuality,
  }

  return { doc, warnings }
}

// ─────────────────────────────────────────────────────────────
// 6. 两个入口
// ─────────────────────────────────────────────────────────────

/** 从「按 \f 分页的纯文本」构造(等价 pdftotext -layout 的输出;单测主力路径) */
export function parsePaginatedText(
  text: string,
  options: { readonly bytes?: Uint8Array; readonly titleHint?: string } = {},
): AssembleResult {
  const pages = splitPagesByFormFeed(text)
  const lines = paginatedTextToLines(text)
  return assemblePaperDoc({
    lines,
    pagesTotal: Math.max(pages.length, 1),
    ...(options.bytes === undefined ? {} : { bytes: options.bytes }),
    ...(options.titleHint === undefined ? {} : { titleHint: options.titleHint }),
  })
}

/**
 * 从 PDF 字节构造。
 *
 * 页码由 pdfjs 直接给出,**不需要按 \f 猜** —— 这是比 pdftotext 更硬的保证。
 */
export async function parsePdfBytes(
  bytes: Uint8Array,
  options: { readonly titleHint?: string } = {},
): Promise<AssembleResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const loadingTask = pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
  })
  const doc = await loadingTask.promise

  try {
    const lines: PageLine[] = []
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber)
      const content = await page.getTextContent()
      lines.push(...textItemsToLines(content.items, pageNumber))
      page.cleanup()
    }

    // 元数据(很多 arXiv PDF 的 Title/Author 是空的,所以只当 hint 用)
    let titleHint = options.titleHint
    let authorsHint: readonly string[] | undefined
    try {
      const meta = await doc.getMetadata()
      const info = meta?.info ?? {}
      const rawTitle = typeof info['Title'] === 'string' ? info['Title'].trim() : ''
      if (titleHint === undefined && rawTitle !== '') titleHint = rawTitle
      const rawAuthor = typeof info['Author'] === 'string' ? info['Author'].trim() : ''
      if (rawAuthor !== '') {
        authorsHint = rawAuthor.split(/[,;]/).map((a) => a.trim()).filter((a) => a !== '')
      }
    } catch {
      // 元数据读不到不影响正文
    }

    return assemblePaperDoc({
      lines,
      pagesTotal: doc.numPages,
      bytes,
      ...(titleHint === undefined ? {} : { titleHint }),
      ...(authorsHint === undefined ? {} : { authorsHint }),
    })
  } finally {
    doc.cleanup()
    await loadingTask.destroy().catch(() => undefined)
  }
}

/** 从文件路径构造 */
export async function parsePdfFile(
  filePath: string,
  options: { readonly titleHint?: string } = {},
): Promise<AssembleResult & { readonly fileName: string }> {
  const bytes = new Uint8Array(await readFile(filePath))
  const result = await parsePdfBytes(bytes, options)
  return { ...result, fileName: basename(filePath) }
}

// ─────────────────────────────────────────────────────────────
// 7. 文本项 → 行(按坐标重组)
// ─────────────────────────────────────────────────────────────

/** PDF 的 y 坐标容差。同一行的项 y 值可能差几个点 */
const LINE_Y_TOLERANCE = 3
/** 两项之间水平间距超过此值时补一个空格 */
const SPACE_GAP = 1.2

interface PositionedItem {
  readonly str: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly hasEOL: boolean
  /** 字号 = 文本矩阵的 scaleY(|transform[3]|) */
  readonly fontSize: number
}

/**
 * 把 pdfjs 的文本项按坐标重组成行。
 *
 * 两个必须处理的现实问题:
 *  1. 项之间**没有空格字符**,需要按水平间距补空格
 *     (否则会得到 "permission toreproduce" 这种粘连)
 *  2. 项的顺序不保证是从左到右阅读顺序,必须按 (y, x) 排序
 */
export function textItemsToLines(
  items: readonly { str?: string; transform?: number[]; width?: number; hasEOL?: boolean }[],
  page: number,
): PageLine[] {
  const positioned: PositionedItem[] = []
  for (const item of items) {
    if (typeof item.str !== 'string' || item.str === '') continue
    const transform = item.transform
    if (!Array.isArray(transform) || transform.length < 6) continue
    const x = transform[4] ?? 0
    const y = transform[5] ?? 0
    positioned.push({
      str: item.str,
      x,
      y,
      width: typeof item.width === 'number' ? item.width : 0,
      hasEOL: item.hasEOL === true,
      fontSize: Math.abs(transform[3] ?? 0),
    })
  }

  if (positioned.length === 0) return []

  // 按 y 降序(PDF 的 y 向上增大)、x 升序
  positioned.sort((a, b) => (Math.abs(a.y - b.y) > LINE_Y_TOLERANCE ? b.y - a.y : a.x - b.x))

  const lines: PageLine[] = []
  let currentY = positioned[0]?.y ?? 0
  let lineParts: PositionedItem[] = []

  const flush = (): void => {
    if (lineParts.length === 0) return
    let text = ''
    let maxFontSize = 0
    for (let i = 0; i < lineParts.length; i += 1) {
      const part = lineParts[i]
      if (part === undefined) continue
      if (part.fontSize > maxFontSize) maxFontSize = part.fontSize
      if (i > 0) {
        const prev = lineParts[i - 1]
        if (prev !== undefined) {
          const gap = part.x - (prev.x + prev.width)
          // 上一项已以空格结尾,或坐标上有明显间距 → 补空格
          if (gap > SPACE_GAP && !prev.str.endsWith(' ') && !part.str.startsWith(' ')) {
            text += ' '
          }
        }
      }
      text += part.str
    }
    const trimmed = text.replace(/\s+/g, ' ').trim()
    if (trimmed !== '') {
      lines.push(
        maxFontSize > 0
          ? { text: trimmed, page, fontSize: Number(maxFontSize.toFixed(2)) }
          : { text: trimmed, page },
      )
    }
    lineParts = []
  }

  for (const item of positioned) {
    if (Math.abs(item.y - currentY) > LINE_Y_TOLERANCE) {
      flush()
      currentY = item.y
    }
    lineParts.push(item)
    if (item.hasEOL) {
      flush()
      // 下一项的 y 未必变化,重置基准即可
      currentY = item.y
    }
  }
  flush()

  return lines
}
