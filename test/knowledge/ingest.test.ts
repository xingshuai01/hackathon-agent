/**
 * 模块 A · 入库编排的单测。
 *
 * 这一层负责的是**判断**,不是转换:这篇要不要处理、处理过了要不要重跑、
 * 抽空了要不要写盘。三个判断错任何一个,后果都是「跑通了但数据不对」——
 * 例如抽 0 条却写了空 notes.md,`listPaperIds()` 就会认为该论文已处理,
 * 以后再也不会重试,而界面上看起来一切正常。
 */

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { ingestPaper } from '../../src/services/knowledge/ingest.ts'
import { LocalMarkdownStore } from '../../src/services/knowledge/localMarkdown.ts'
import type { PageLine } from '../../src/services/paper/parse.ts'
import type { PaperDoc, Paragraph, Section } from '../../src/services/paper/types.ts'

// ─────────────────────────────────────────────────────────────
// 构造
// ─────────────────────────────────────────────────────────────

const FIXED_CLOCK = () => new Date('2026-10-29T00:00:00.000Z')

function paragraph(index: number): string {
  return (
    `We propose ReAct, a general paradigm that combines reasoning traces with task specific actions ` +
    `in an interleaved manner, and paragraph ${index} explains one more detail of the loop.`
  )
}

function paperWith(
  count: number,
  overrides: { readonly pagesParsed?: number; readonly pagesTotal?: number } = {},
): { doc: PaperDoc; pageLines: PageLine[] } {
  const paragraphs: Paragraph[] = []
  const pageLines: PageLine[] = []

  for (let index = 0; index < count; index += 1) {
    const text = paragraph(index)
    paragraphs.push({ text, page: index + 1 })
    pageLines.push({ page: index + 1, text })
  }

  const sections: Section[] = [{ heading: '3 Method', level: 1, paragraphs, tables: [], figures: [] }]
  const pagesTotal = overrides.pagesTotal ?? count
  return {
    doc: {
      paperId: 'arxiv:2210.03629',
      title: 'ReAct: Synergizing Reasoning and Acting in Language Models',
      authors: ['Shunyu Yao'],
      year: 2022,
      abstract: 'abstract text',
      sections,
      references: [],
      parseQuality: { pagesParsed: overrides.pagesParsed ?? pagesTotal, pagesTotal, hasOcr: false },
    },
    pageLines,
  }
}

/** 收集日志行,断言「用户能不能看出发生了什么」 */
function collector(): { log: (line: string) => void; lines: string[] } {
  const lines: string[] = []
  return { log: (line: string) => lines.push(line), lines }
}

let root = ''
let store: LocalMarkdownStore

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kb-ingest-'))
  store = new LocalMarkdownStore({ root })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

// ─────────────────────────────────────────────────────────────
// 1. 正常入库
// ─────────────────────────────────────────────────────────────

describe('ingest · 首次入库', () => {
  it('抽到的知识页真的落盘,并能按 paperId 反查', async () => {
    const { doc, pageLines } = paperWith(6)
    const result = await ingestPaper(store, { doc, pageLines }, { now: FIXED_CLOCK })

    assert.equal(result.status, 'stored')
    if (result.status !== 'stored') return

    assert.ok(result.notes.length >= 5, `只抽出 ${result.notes.length} 条`)
    assert.equal((await store.listPaperIds()).includes(doc.paperId), true)
    assert.equal((await store.listByPaper(doc.paperId)).length, result.notes.length)
  })

  it('传了 indexRoot 就生成 INDEX.md,头部说明数据源与重建方式', async () => {
    const { doc, pageLines } = paperWith(6)
    const result = await ingestPaper(store, { doc, pageLines }, { now: FIXED_CLOCK, indexRoot: root })

    assert.equal(result.status, 'stored')
    if (result.status !== 'stored') return
    assert.ok(result.index !== null, '没有生成索引')

    const path = join(root, 'INDEX.md')
    assert.equal(existsSync(path), true)
    const content = await readFile(path, 'utf8')
    assert.match(content, /自动生成/)
    assert.match(content, /generated_at: 2026-10-29T00:00:00\.000Z/)
    assert.match(content, /arxiv:2210\.03629/)
    assert.match(content, /# 知识库索引/)
  })

  it('不传 indexRoot 时只入库、不碰索引', async () => {
    const { doc, pageLines } = paperWith(6)
    const result = await ingestPaper(store, { doc, pageLines }, { now: FIXED_CLOCK })

    assert.equal(result.status, 'stored')
    if (result.status !== 'stored') return
    assert.equal(result.index, null)
    assert.equal(existsSync(join(root, 'INDEX.md')), false)
  })

  it('日志里看得到统计,而不是只有一句「完成」', async () => {
    const { doc, pageLines } = paperWith(6)
    const sink = collector()
    await ingestPaper(store, { doc, pageLines }, { now: FIXED_CLOCK, log: sink.log })

    const text = sink.lines.join('\n')
    assert.match(text, /段落/)
    assert.match(text, /locateRate/)
    assert.match(text, /已写入/)
  })
})

// ─────────────────────────────────────────────────────────────
// 2. 去重(AC-A4.2 / AC-A4.3)
// ─────────────────────────────────────────────────────────────

describe('ingest · 增量去重', () => {
  it('同一篇论文二次入库默认跳过,日志明确写「命中已有,跳过」', async () => {
    const { doc, pageLines } = paperWith(6)
    await ingestPaper(store, { doc, pageLines }, { now: FIXED_CLOCK })

    const sink = collector()
    const second = await ingestPaper(store, { doc, pageLines }, { now: FIXED_CLOCK, log: sink.log })

    assert.equal(second.status, 'skipped')
    if (second.status !== 'skipped') return
    assert.match(second.message, /命中已有,跳过/)
    assert.ok(second.existingNotes >= 5, `existingNotes=${second.existingNotes}`)
    assert.match(sink.lines.join('\n'), /命中已有,跳过/)
  })

  it('跳过时不重写磁盘 —— 文件修改时间不变', async () => {
    const { doc, pageLines } = paperWith(6)
    const first = await ingestPaper(store, { doc, pageLines }, { now: FIXED_CLOCK })
    assert.equal(first.status, 'stored')

    const file = join(root, 'arxiv-2210.03629', 'notes.md')
    const before = await readFile(file, 'utf8')
    await ingestPaper(store, { doc, pageLines }, { now: FIXED_CLOCK })
    assert.equal(await readFile(file, 'utf8'), before)
  })

  it('--force 重建不产生重复条目(同 noteId 原地替换)', async () => {
    const { doc, pageLines } = paperWith(6)
    const first = await ingestPaper(store, { doc, pageLines }, { now: FIXED_CLOCK })
    assert.equal(first.status, 'stored')
    if (first.status !== 'stored') return

    const sink = collector()
    const second = await ingestPaper(
      store,
      { doc, pageLines },
      { now: FIXED_CLOCK, force: true, log: sink.log },
    )

    assert.equal(second.status, 'stored')
    if (second.status !== 'stored') return
    assert.equal(second.notes.length, first.notes.length)
    assert.equal((await store.listByPaper(doc.paperId)).length, first.notes.length)
    assert.match(sink.lines.join('\n'), /--force/)
  })
})

// ─────────────────────────────────────────────────────────────
// 3. 门控与空结果(数据铁律 #3)
// ─────────────────────────────────────────────────────────────

describe('ingest · 门控', () => {
  it('解析率低于 70% 的论文被隔离,一条都不入库', async () => {
    const { doc, pageLines } = paperWith(6, { pagesParsed: 6, pagesTotal: 10 })
    const result = await ingestPaper(store, { doc, pageLines }, { now: FIXED_CLOCK })

    assert.equal(result.status, 'quarantined')
    if (result.status !== 'quarantined') return
    assert.match(result.reason, /60\.0%/)
    assert.deepEqual(await store.listPaperIds(), [])
  })

  it('隔离时不生成 INDEX.md', async () => {
    const { doc, pageLines } = paperWith(6, { pagesParsed: 1, pagesTotal: 10 })
    await ingestPaper(store, { doc, pageLines }, { now: FIXED_CLOCK, indexRoot: root })
    assert.equal(existsSync(join(root, 'INDEX.md')), false)
  })

  it('没有原文分页文本时抽不出锚点,结果是「空」而不是写一堆 page 瞎猜的条目', async () => {
    const { doc } = paperWith(6)
    const result = await ingestPaper(store, { doc, pageLines: [] }, { now: FIXED_CLOCK })

    assert.equal(result.status, 'empty')
    if (result.status !== 'empty') return
    assert.ok(result.rejected.some((item) => item.reason === 'no_anchor'))
  })

  it('抽空时不写空 notes.md —— 否则这篇论文会被标记成「已处理」,再也不重试', async () => {
    const { doc } = paperWith(6)
    await ingestPaper(store, { doc, pageLines: [] }, { now: FIXED_CLOCK, indexRoot: root })

    assert.deepEqual(await store.listPaperIds(), [])
    assert.equal(existsSync(join(root, 'arxiv-2210.03629', 'notes.md')), false)
  })

  it('空结果之后补上原文还能正常入库(没有被误标记)', async () => {
    const first = paperWith(6)
    await ingestPaper(store, { doc: first.doc, pageLines: [] }, { now: FIXED_CLOCK })

    const second = await ingestPaper(store, first, { now: FIXED_CLOCK })
    assert.equal(second.status, 'stored')
  })

  it('条数少于 5 时提示 AC-A1.1,但仍然入库', async () => {
    const { doc, pageLines } = paperWith(2)
    const sink = collector()
    const result = await ingestPaper(store, { doc, pageLines }, { now: FIXED_CLOCK, log: sink.log })

    assert.equal(result.status, 'stored')
    if (result.status !== 'stored') return
    assert.equal(result.notes.length, 2)
    assert.match(sink.lines.join('\n'), /低于 AC-A1\.1/)
  })
})
