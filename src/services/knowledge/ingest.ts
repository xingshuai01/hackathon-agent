/**
 * 模块 A · 入库编排:一篇论文 → 知识页 → 磁盘 + 索引
 *
 * ── 为什么要有这一层 ──
 * `extract.ts` 只管「抽」,`localMarkdown.ts` 只管「存」。真正决定
 * 「这篇论文要不要处理」的逻辑(解析质量门控、已入库跳过、统计与日志)
 * 需要一个明确的落点,否则这些判断会散落在 CLI、Web、测试三处,逐渐不一致。
 *
 * ── 三条顺序不能换 ──
 * 1. **先过解析质量门控**(数据铁律 #3):解析率 <0.7 的论文直接隔离,
 *    连抽取都不做 —— 脏数据会污染 C 模块的领域共识,而 C 是长期资产
 * 2. **再判重**(AC-A4.2/A4.3):同一 `paperId` 默认跳过,日志必须出现
 *    「命中已有,跳过」这几个字,否则用户无法判断是没跑还是没变
 * 3. **最后才落盘**:抽取 0 条时**不写空文件** —— 空 notes.md 会让
 *    `listPaperIds()` 认为这篇已处理,以后再也不会重试
 */

import type { PageLine } from '../paper/parse.ts'
import { gateByParseQuality, type PaperDoc } from '../paper/types.ts'
import { extractNotes, type ExtractStats, type RejectedCandidate } from './extract.ts'
import { writeIndexFile, type IndexFileStats } from './indexFile.ts'
import type { AtomicNote, KnowledgeStore } from './types.ts'

/** 结构化判断「这个 store 是否支持批量写/按论文列」,避免为了性能改契约 */
interface BulkCapable {
  putAll(notes: readonly AtomicNote[], meta?: { readonly title?: string }): Promise<void>
}
interface PaperLister {
  listByPaper(paperId: string): Promise<readonly AtomicNote[]>
}

function hasPutAll(store: KnowledgeStore): store is KnowledgeStore & BulkCapable {
  return typeof (store as Partial<BulkCapable>).putAll === 'function'
}

function hasListByPaper(store: KnowledgeStore): store is KnowledgeStore & PaperLister {
  return typeof (store as Partial<PaperLister>).listByPaper === 'function'
}

export interface IngestRequest {
  readonly doc: PaperDoc
  /** quote → 真页码反查要用。空数组等于放弃反查,会被 extract 判成 fail-closed */
  readonly pageLines: readonly PageLine[]
}

export interface IngestOptions {
  /** 覆盖已入库的论文(AC-A4.2 的 `--force`) */
  readonly force?: boolean
  /** 注入时钟,便于测试固定 createdAt */
  readonly now?: () => Date
  readonly log?: (line: string) => void
  /** 传了就在落盘后重建 INDEX.md */
  readonly indexRoot?: string
}

export type IngestResult =
  | {
      readonly status: 'skipped'
      readonly paperId: string
      readonly existingNotes: number
      readonly message: string
    }
  | {
      readonly status: 'quarantined'
      readonly paperId: string
      readonly reason: string
      readonly message: string
    }
  | {
      readonly status: 'empty'
      readonly paperId: string
      readonly rejected: readonly RejectedCandidate[]
      readonly stats: ExtractStats
      readonly message: string
    }
  | {
      readonly status: 'stored'
      readonly paperId: string
      readonly notes: readonly AtomicNote[]
      readonly rejected: readonly RejectedCandidate[]
      readonly stats: ExtractStats
      readonly index: IndexFileStats | null
    }

/** 抽出来的条数低于 AC-A1.1 下限时的提示语(不阻断入库,只提醒) */
function lowYieldWarning(count: number): string | null {
  return count < 5 ? `只抽出 ${count} 条,低于 AC-A1.1 的下限 5 条 —— 该论文可能图表为主或版式特殊` : null
}

export async function ingestPaper(
  store: KnowledgeStore,
  request: IngestRequest,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const { doc, pageLines } = request
  const log = options.log ?? ((): void => {})
  const paperId = doc.paperId

  // ── 1. 解析质量门控(数据铁律 #3)──
  const verdict = gateByParseQuality(doc.parseQuality)
  if (verdict.status === 'quarantined') {
    const message = `论文被隔离:${verdict.reason}(数据铁律 #3,不进抽取队列)`
    log(`· ${message}`)
    return { status: 'quarantined', paperId, reason: verdict.reason, message }
  }

  // ── 2. 判重(AC-A4.2 / AC-A4.3)──
  if (options.force !== true) {
    const existing = await store.listPaperIds()
    if (existing.includes(paperId)) {
      const existingNotes = hasListByPaper(store) ? (await store.listByPaper(paperId)).length : 0
      const message = `命中已有,跳过:${paperId}(已有 ${existingNotes} 条知识页;要重建加 --force)`
      log(`· ${message}`)
      return { status: 'skipped', paperId, existingNotes, message }
    }
  } else {
    log(`· --force:忽略「已入库」判断,重建 ${paperId}`)
  }

  // ── 3. 抽取 ──
  const extracted = extractNotes({ doc, pageLines }, options.now === undefined ? {} : { now: options.now })
  if (extracted.status === 'quarantined') {
    const message = `抽取阶段判定隔离:${extracted.reason}`
    log(`· ${message}`)
    return { status: 'quarantined', paperId, reason: extracted.reason, message }
  }

  const { notes, rejected, stats } = extracted
  log(`· 段落 ${stats.paragraphs} / 候选 ${stats.candidates} / 入库 ${notes.length}(locateRate ${(stats.locateRate * 100).toFixed(1)}%)`)

  if (notes.length === 0) {
    // 不写空文件:写了会让 listPaperIds() 认为这篇已处理,以后再也不会重试
    const message = '抽取结果为空,未写入磁盘(避免空 notes.md 把该论文标记成「已处理」)'
    log(`· ${message}`)
    return { status: 'empty', paperId, rejected, stats, message }
  }

  const warning = lowYieldWarning(notes.length)
  if (warning !== null) log(`· ${warning}`)

  // ── 4. 落盘 ──
  const meta = { title: doc.title }
  if (hasPutAll(store)) {
    await store.putAll(notes, meta)
  } else {
    for (const note of notes) await store.put(note)
  }
  log(`· 已写入 ${paperId}(${notes.length} 条)`)

  // ── 5. 重建索引(派生数据,失败不影响入库结果)──
  let index: IndexFileStats | null = null
  if (options.indexRoot !== undefined) {
    index = await writeIndexFile(store, {
      root: options.indexRoot,
      ...(options.now === undefined ? {} : { now: options.now }),
    })
    log(`· 索引 ${index.path}(${index.lines} 行 / ${index.bytes} 字节)`)
  }

  return { status: 'stored', paperId, notes, rejected, stats, index }
}
