/**
 * 模块 A · 存储:`KnowledgeStore` 的唯一实现(DEC-031)
 *
 * ── 为什么是 Markdown,不是 SQLite / 一个 JSON ──
 * 1. AC-A2.3 明文要求「纯 Markdown,人类可直接阅读、可 git diff」
 * 2. AC-A2.4 要求与 KiwiFS 的 frontmatter 约定兼容
 * 3. AC-A3.3 要求检索 <1s —— 不用索引服务,内存里做关键词匹配就够
 * 数据量在「几十篇论文、几百条知识页」这个量级,数据库是纯负担。
 *
 * ── 一个刻意的偏离,必须说清楚 ──
 * 决策 D5 原本写「notes.md + `_index.json` 机器索引」。这里**只落 notes.md**,
 * 不写 `_index.json`。理由:`_index.json` 是纯派生数据,双写必然出现「改了 md 忘了
 * json」的不一致,而它带来的唯一好处是省一次目录扫描(实测几百条笔记扫描 <50ms)。
 * 等 scan 超过 1s 再加,接口不用变。**数据永远以 notes.md 为准。**
 *
 * ── 目录名为什么不是 paperId 原文 ──
 * `paperId` 形如 `arxiv:2210.03629`,冒号在 Windows 上是非法文件名字符 ——
 * 照 AC-A2.1 字面落盘会在 Windows 直接失败。所以目录名做 sanitize(冒号→`-`),
 * 原始 `paperId` 完整保存在 frontmatter 与每条知识页里,**可追溯性不受影响**。
 */

import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { INDEX_LIMITS, validateNote } from './types.ts'
import type {
  AtomicNote,
  Confidence,
  KnowledgeStore,
  NoteHit,
  NoteKind,
  NoteLink,
  NoteRelation,
  NoteSelector,
} from './types.ts'

/** 每篇论文一个目录,目录里固定这一个文件名 */
const NOTES_FILE = 'notes.md'

/** 单篇论文的 Markdown 文件头 */
interface DocumentMeta {
  readonly paperId: string
  readonly title: string
}

/** 一条反向引用:谁(from)以什么关系(rel)指向某个知识页 */
export interface Backlink {
  readonly from: string
  readonly rel: NoteRelation
}

export interface LocalMarkdownStoreOptions {
  /** 知识库根目录。默认 `<cwd>/knowledge` */
  readonly root?: string
}

// ─────────────────────────────────────────────────────────────
// 1. 路径与标量
// ─────────────────────────────────────────────────────────────

/**
 * `paperId` → 目录名。
 *
 * 不做这件事的直接后果:Windows 上 `mkdir('knowledge/arxiv:2210.03629')` 抛
 * `EINVAL`。这是「在 Mac 上开发、在 Windows 上演示」时最典型的翻车点。
 */
export function paperDirName(paperId: string): string {
  const replaced = paperId
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
  const safe = replaced === '' ? 'paper' : replaced
  return safe.length > 80 ? safe.slice(0, 80) : safe
}

/** 需要引号包裹的值:含冒号、引号、井号或首尾空白的,直接 JSON 化最省心 */
function scalar(value: string): string {
  return /[:#'"\n]|^\s|\s$/.test(value) ? JSON.stringify(value) : value
}

function unscalar(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (typeof parsed === 'string') return parsed
    } catch {
      return trimmed
    }
  }
  return trimmed
}

// ─────────────────────────────────────────────────────────────
// 2. 序列化:一条知识页 = 一个 `##` 段
// ─────────────────────────────────────────────────────────────

function serializeNote(note: AtomicNote): string {
  const shortId = note.noteId.split('#')[2] ?? note.noteId
  const lines: string[] = [
    `## p${note.page} · ${shortId}`,
    '',
    `- noteId: ${scalar(note.noteId)}`,
    `- paperId: ${scalar(note.paperId)}`,
    `- page: ${note.page}`,
    `- kind: ${note.kind}`,
    `- confidence: ${note.confidence}`,
    // 落盘用 snake_case:AC-A2.2 原文写的就是 created_at,且这是 frontmatter 惯例
    `- created_at: ${note.createdAt}`,
  ]

  if (note.links !== undefined && note.links.length > 0) {
    lines.push(`- links: ${JSON.stringify(note.links)}`)
  }

  lines.push('')
  lines.push(`**描述**：${note.description}`)
  // 正文与证据相同是常态(extract 的 quote 就取自段落原文),此时省略正文块。
  // 解析侧会把 text 回落到 quote,信息一点不丢,文件体积却小一半。
  if (note.text.trim() !== note.evidence.quote.trim()) {
    lines.push('')
    lines.push('**正文**：')
    lines.push('')
    lines.push(note.text)
  }
  lines.push('')
  lines.push(`**证据**（p${note.evidence.page}）：`)
  lines.push('')
  for (const quoteLine of note.evidence.quote.split(/\r?\n/)) {
    lines.push(`> ${quoteLine}`)
  }
  lines.push('')
  return lines.join('\n')
}

export function serializeDocument(meta: DocumentMeta, notes: readonly AtomicNote[]): string {
  const header = [
    '---',
    `paperId: ${scalar(meta.paperId)}`,
    `title: ${scalar(meta.title)}`,
    `notes: ${notes.length}`,
    `updated_at: ${new Date().toISOString()}`,
    '---',
    '',
    `# ${meta.title === '' ? meta.paperId : meta.title}`,
    '',
  ]
  return `${header.join('\n')}\n${notes.map(serializeNote).join('\n')}`
}

// ─────────────────────────────────────────────────────────────
// 3. 解析
// ─────────────────────────────────────────────────────────────

const CONFIDENCES = new Set<string>(['high', 'medium', 'low'])
const KINDS = new Set<string>(['claim', 'method', 'result', 'limitation', 'definition'])
const RELATIONS = new Set<string>(['supports', 'contradicts', 'extends'])

function asConfidence(value: string): Confidence | null {
  return CONFIDENCES.has(value) ? (value as Confidence) : null
}

function asKind(value: string): NoteKind | null {
  return KINDS.has(value) ? (value as NoteKind) : null
}

/** 解析单个 `## ` 段。任何必填字段缺失就返回 null —— 宁可少一条,不要脏一条 */
export function parseNoteBlock(block: string): AtomicNote | null {
  const lines = block.split(/\r?\n/)
  const fields = new Map<string, string>()
  let description = ''
  const textLines: string[] = []
  const quoteLines: string[] = []

  let section: 'head' | 'text' | 'quote' = 'head'
  for (const line of lines) {
    if (line.startsWith('## ')) continue

    if (line.startsWith('**描述**：')) {
      description = line.slice('**描述**：'.length).trim()
      continue
    }
    if (line.startsWith('**正文**：')) {
      section = 'text'
      continue
    }
    if (line.startsWith('**证据**')) {
      section = 'quote'
      continue
    }

    if (line.startsWith('- ') && section === 'head') {
      const separator = line.indexOf(':', 2)
      if (separator > 2) {
        // 值可能被 scalar() 加了引号(含冒号/井号的值必须加),这里要还原
        fields.set(line.slice(2, separator).trim(), unscalar(line.slice(separator + 1)))
      }
      continue
    }

    if (section === 'text') {
      textLines.push(line)
      continue
    }
    if (section === 'quote' && line.startsWith('>')) {
      quoteLines.push(line.replace(/^>\s?/, ''))
    }
  }

  const text = textLines.join('\n').trim()
  const quote = quoteLines.join('\n').trim()

  const noteId = fields.get('noteId')
  const paperId = fields.get('paperId')
  const pageRaw = fields.get('page')
  const kind = asKind(fields.get('kind') ?? '')
  const confidence = asConfidence(fields.get('confidence') ?? '')
  const createdAt = fields.get('created_at')
  const page = Number(pageRaw)

  if (noteId === undefined || paperId === undefined || createdAt === undefined) return null
  if (kind === null || confidence === null) return null
  if (!Number.isInteger(page) || page < 1) return null

  const evidencePage = readEvidencePage(lines) ?? page
  const note: AtomicNote = {
    noteId,
    paperId,
    page,
    kind,
    description: description === '' ? text.slice(0, 120) : description,
    text: text === '' ? quote : text,
    evidence: { quote: quote === '' ? text : quote, page: evidencePage },
    confidence,
    createdAt,
    ...(fields.has('links') ? { links: parseLinks(fields.get('links') ?? '') } : {}),
  }
  return note
}

function readEvidencePage(lines: readonly string[]): number | null {
  for (const line of lines) {
    if (!line.startsWith('**证据**')) continue
    const matched = /p(\d+)/.exec(line)
    if (matched?.[1] !== undefined) {
      const value = Number(matched[1])
      if (Number.isInteger(value) && value >= 1) return value
    }
  }
  return null
}

function parseLinks(raw: string): readonly NoteLink[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const links: NoteLink[] = []
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue
      const record = item as Record<string, unknown>
      const to = record['to']
      const rel = record['rel']
      if (typeof to !== 'string' || typeof rel !== 'string') continue
      if (!RELATIONS.has(rel)) continue
      links.push({ to, rel: rel as NoteRelation })
    }
    return links
  } catch {
    return []
  }
}

/** 从整篇 notes.md 解析出全部知识页 */
export function parseDocument(raw: string): AtomicNote[] {
  const text = raw.replace(/^\uFEFF/, '')
  const blocks = text.split(/^## /m).slice(1)
  const notes: AtomicNote[] = []
  for (const block of blocks) {
    const note = parseNoteBlock(`## ${block}`)
    if (note !== null) notes.push(note)
  }
  return notes
}

// ─────────────────────────────────────────────────────────────
// 4. 检索用的分词
// ─────────────────────────────────────────────────────────────

/**
 * 查询分词。英文按非字母数字切,汉字按 2-gram 切。
 *
 * 为什么汉字要 2-gram:中文没有空格,按整句切等于要求用户输入与原文完全一致;
 * 按单字切又会把「的」「是」这种高频字变成噪声。2-gram 是这两者之间的常规折中。
 */
export function tokenize(query: string): string[] {
  const normalized = query.toLowerCase()
  const tokens = new Set<string>()

  for (const word of normalized.split(/[^\p{L}\p{N}]+/u)) {
    if (word.length >= 2) tokens.add(word)
  }
  for (const chunk of normalized.match(/\p{Script=Han}+/gu) ?? []) {
    for (let i = 0; i < chunk.length - 1; i += 1) tokens.add(chunk.slice(i, i + 2))
  }
  return [...tokens]
}

// ─────────────────────────────────────────────────────────────
// 5. 实现
// ─────────────────────────────────────────────────────────────

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}

export class LocalMarkdownStore implements KnowledgeStore {
  private readonly root: string
  /** 全量缓存。put 后置空,下一次读重新扫盘 —— 几百条笔记的扫描远快于维护增量索引 */
  private cache: AtomicNote[] | null = null

  constructor(options: LocalMarkdownStoreOptions = {}) {
    this.root = resolve(options.root ?? 'knowledge')
  }

  // ── 读盘原语 ──

  private async readDocument(file: string): Promise<AtomicNote[]> {
    try {
      return parseDocument(await readFile(file, 'utf8'))
    } catch (error) {
      if (isMissingFile(error)) return []
      throw error
    }
  }

  private async writeDocument(file: string, meta: DocumentMeta, notes: readonly AtomicNote[]): Promise<void> {
    await mkdir(dirname(file), { recursive: true })
    // 先写临时文件再 rename:避免「写到一半被 Ctrl+C」留下半篇笔记
    const temp = `${file}.tmp`
    await writeFile(temp, serializeDocument(meta, notes), 'utf8')
    await rename(temp, file)
  }

  private async loadAll(): Promise<readonly AtomicNote[]> {
    if (this.cache !== null) return this.cache

    let entries: Dirent[]
    try {
      entries = await readdir(this.root, { withFileTypes: true })
    } catch (error) {
      if (isMissingFile(error)) {
        this.cache = []
        return this.cache
      }
      throw error
    }

    const notes: AtomicNote[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      notes.push(...(await this.readDocument(join(this.root, entry.name, NOTES_FILE))))
    }
    this.cache = notes
    return notes
  }

  // ── KnowledgeStore ──

  async put(note: AtomicNote): Promise<void> {
    await this.putAll([note])
  }

  /** 非契约的便捷方法:一次落盘一批(ingest 场景下避免 20 次读改写) */
  async putAll(notes: readonly AtomicNote[], meta: { readonly title?: string } = {}): Promise<void> {
    // 逐条过硬校验 —— 「无锚点不入库」的最后一道闸,不能靠调用方自觉
    for (const note of notes) {
      const verdict = validateNote(note)
      if (!verdict.ok) {
        throw new Error(`知识页 ${note.noteId} 校验失败:${verdict.reasons.join('; ')}`)
      }
    }

    const byPaper = new Map<string, AtomicNote[]>()
    for (const note of notes) {
      const bucket = byPaper.get(note.paperId)
      if (bucket === undefined) byPaper.set(note.paperId, [note])
      else bucket.push(note)
    }

    for (const [paperId, incoming] of byPaper) {
      const dir = join(this.root, paperDirName(paperId))
      const file = join(dir, NOTES_FILE)
      const existing = await this.readDocument(file)
      const merged = mergeNotes(existing, incoming)
      await this.writeDocument(file, { paperId, title: meta.title ?? '' }, merged)
    }
    this.cache = null
  }

  async get(noteId: string): Promise<AtomicNote | null> {
    const notes = await this.loadAll()
    return notes.find((note) => note.noteId === noteId) ?? null
  }

  async scan(query: string, limit = 8): Promise<readonly NoteHit[]> {
    const tokens = tokenize(query)
    if (tokens.length === 0) return []

    const notes = await this.loadAll()
    const hits: NoteHit[] = []
    for (const note of notes) {
      const haystack = `${note.description}\n${note.text}`.toLowerCase()
      let score = 0
      for (const token of tokens) {
        if (haystack.includes(token)) score += 1
      }
      if (score === 0) continue
      hits.push({
        noteId: note.noteId,
        paperId: note.paperId,
        page: note.page,
        kind: note.kind,
        description: note.description,
        score,
      })
    }

    hits.sort((a, b) => b.score - a.score || a.noteId.localeCompare(b.noteId))
    return hits.slice(0, Math.max(0, limit))
  }

  /**
   * 段 2 · 精筛。存储层不依赖 LLM,由调用方注入 selector(types.ts 的约定)。
   *
   * 这里必须做**白名单过滤**:模型返回的 noteId 可能是不存在的、
   * 或者是提示词里出现的示例 id。放过去就等于让幻觉进入结果。
   */
  async select(
    query: string,
    candidates: readonly NoteHit[],
    selector: NoteSelector,
  ): Promise<readonly NoteHit[]> {
    if (candidates.length === 0) return []
    const chosen = await selector(query, candidates)
    const allowed = new Set(candidates.map((hit) => hit.noteId))
    const byId = new Map(candidates.map((hit) => [hit.noteId, hit]))

    const result: NoteHit[] = []
    for (const noteId of chosen) {
      if (!allowed.has(noteId)) continue
      const hit = byId.get(noteId)
      if (hit !== undefined) result.push(hit)
    }
    return result
  }

  async link(from: string, to: string, rel: NoteRelation): Promise<void> {
    const notes = await this.loadAll()
    const target = notes.find((note) => note.noteId === from)
    if (target === undefined) throw new Error(`noteId 不存在,无法建立关系:${from}`)
    if (!notes.some((note) => note.noteId === to)) {
      throw new Error(`目标 noteId 不存在,拒绝建立悬空引用:${to}`)
    }

    const links = target.links ?? []
    if (links.some((link) => link.to === to && link.rel === rel)) return
    await this.put({ ...target, links: [...links, { to, rel }] })
  }

  /**
   * 生成索引文本(等价于 Claude Code 的 MEMORY.md),会被拼进 system prompt。
   *
   * 必须截断:`INDEX_LIMITS`(120 行 / 15KB)是硬上限 —— 不截断的话,
   * 论文一多,索引自己就能把上下文吃满。
   */
  async index(): Promise<string> {
    const notes = await this.loadAll()
    if (notes.length === 0) return '# 知识库索引\n\n(空)\n'

    const byPaper = new Map<string, AtomicNote[]>()
    for (const note of notes) {
      const bucket = byPaper.get(note.paperId)
      if (bucket === undefined) byPaper.set(note.paperId, [note])
      else bucket.push(note)
    }

    const lines: string[] = ['# 知识库索引', '']
    for (const [paperId, group] of byPaper) {
      lines.push(`- ${paperId}(${group.length} 条)`)
      for (const note of group) {
        lines.push(`  - [${note.kind}] p${note.page} ${note.noteId}: ${note.description}`)
      }
    }

    return truncate(lines, INDEX_LIMITS.maxLines, INDEX_LIMITS.maxBytes)
  }

  async listPaperIds(): Promise<readonly string[]> {
    const notes = await this.loadAll()
    const ids = new Set<string>()
    for (const note of notes) ids.add(note.paperId)
    return [...ids]
  }

  /**
   * 非契约的便捷方法:某篇论文的全部知识页。
   *
   * 这就是 AC-A1.5「与来源论文的双向链接」的一个方向:
   * 知识页 → 论文 靠 `note.paperId` 与 frontmatter,
   * 论文 → 知识页 靠这里。两者都在契约已有字段上推导,**不需要额外存一份关系表**。
   */
  async listByPaper(paperId: string): Promise<readonly AtomicNote[]> {
    const notes = await this.loadAll()
    return notes.filter((note) => note.paperId === paperId)
  }

  /**
   * 非契约的便捷方法:哪些知识页引用了 `noteId`(反向边)。
   *
   * 为什么不在 `put()` 时维护一张反向表:那张表是派生数据,
   * 一旦与 notes.md 不同步就会给出错误的引用关系。几十到几百条的量级,
   * 每次全扫一遍更便宜也更可信。
   */
  async backlinks(noteId: string): Promise<readonly Backlink[]> {
    const notes = await this.loadAll()
    const result: Backlink[] = []
    for (const note of notes) {
      for (const link of note.links ?? []) {
        if (link.to === noteId) result.push({ from: note.noteId, rel: link.rel })
      }
    }
    return result.sort((a, b) => a.from.localeCompare(b.from))
  }

  /** 知识库根目录。CLI 与探针要用它落 INDEX.md,不必再各自猜一次路径 */
  get rootDir(): string {
    return this.root
  }

  /** 单测用:清掉缓存,模拟「另一个进程刚写过盘」 */
  invalidate(): void {
    this.cache = null
  }
}

// ─────────────────────────────────────────────────────────────
// 6. 纯函数零件
// ─────────────────────────────────────────────────────────────

/** 同 noteId 原地替换,新 note 追加 —— 保证文件顺序稳定,git diff 才不会到处跳 */
export function mergeNotes(existing: readonly AtomicNote[], incoming: readonly AtomicNote[]): AtomicNote[] {
  const merged = [...existing]
  for (const note of incoming) {
    const position = merged.findIndex((item) => item.noteId === note.noteId)
    if (position >= 0) merged[position] = note
    else merged.push(note)
  }
  return merged
}

/** 按行 + 字节双重截断。先触到哪个上限就在哪停 */
export function truncate(lines: readonly string[], maxLines: number, maxBytes: number): string {
  const kept: string[] = []
  let bytes = 0
  for (const line of lines) {
    if (kept.length >= maxLines) break
    const size = Buffer.byteLength(`${line}\n`, 'utf8')
    if (bytes + size > maxBytes) break
    kept.push(line)
    bytes += size
  }
  return `${kept.join('\n')}\n`
}
