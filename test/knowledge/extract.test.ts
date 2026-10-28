/**
 * 模块 A · 抽取的单测。
 *
 * 重点不在「能不能抽出东西」,而在**抽出来的东西能不能被验证**:
 * 每条知识页的 page 必须来自原文反查,而不是抄段落里的数字。
 * 因此这里的每个用例都同时准备了「原文分页文本」和「论文结构」,
 * 并且故意让两者的页码不一致 —— 不一致时以原文为准,是这层唯一的正确行为。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { PageLine } from '../../src/services/paper/parse.ts'
import type { PaperDoc, Paragraph, Section } from '../../src/services/paper/types.ts'
import {
  allocateQuotas,
  buildDescription,
  buildNoteId,
  chunkPaper,
  classifyKind,
  EXTRACT_LIMITS,
  extractNotes,
  hashOf,
  isNoiseChunk,
  pickEvenly,
} from '../../src/services/knowledge/extract.ts'
import { validateNote } from '../../src/services/knowledge/types.ts'

// ─────────────────────────────────────────────────────────────
// 构造
// ─────────────────────────────────────────────────────────────

function section(heading: string, paragraphs: readonly Paragraph[]): Section {
  return { heading, level: 1, paragraphs, tables: [], figures: [] }
}

function doc(sections: readonly Section[], pagesTotal = 10, pagesParsed = 10): PaperDoc {
  return {
    paperId: 'arxiv:2210.03629',
    title: 'ReAct: Synergizing Reasoning and Acting in Language Models',
    authors: ['Shunyu Yao'],
    year: 2022,
    abstract: 'abstract text',
    sections,
    references: [],
    parseQuality: { pagesParsed, pagesTotal, hasOcr: false },
  }
}

/** 按数组下标生成分页行,第 i 个元素的页码是 i+1 */
function linesFrom(pages: readonly string[]): PageLine[] {
  return pages.flatMap((text, index) => [{ page: index + 1, text }])
}

const FIXED_CLOCK = () => new Date('2026-10-29T00:00:00.000Z')

const LONG_METHOD =
  'We propose ReAct, a general paradigm that combines reasoning traces with task specific actions in an interleaved manner.'
const LONG_RESULT =
  'On HotpotQA ReAct achieves 61.2% exact match and outperforms the chain of thought baseline by a clear margin.'
const LONG_LIMIT =
  'A limitation of ReAct is that it only works when the environment provides a reliable observation signal to the agent.'

// ─────────────────────────────────────────────────────────────
// 1. 门控:解析质量不达标,一条都不产
// ─────────────────────────────────────────────────────────────

describe('extract · 解析质量门控', () => {
  it('解析率低于 70% 时整篇隔离,不产出任何知识页(数据铁律 #3)', () => {
    const paper = doc([section('Method', [{ text: LONG_METHOD, page: 3 }])], 10, 5)
    const result = extractNotes({ doc: paper, pageLines: linesFrom(['x', 'y', 'z']) })

    assert.equal(result.status, 'quarantined')
    assert.equal(result.notes.length, 0)
    assert.equal(result.rejected.length, 0)
    if (result.status !== 'quarantined') throw new Error('unreachable')
    assert.match(result.reason, /50\.0%/)
  })

  it('pagesTotal 非法同样隔离,不冒险继续', () => {
    const paper = doc([section('Method', [{ text: LONG_METHOD, page: 1 }])], 0, 0)
    const result = extractNotes({ doc: paper, pageLines: linesFrom(['x']) })
    assert.equal(result.status, 'quarantined')
  })
})

// ─────────────────────────────────────────────────────────────
// 2. 正常抽取
// ─────────────────────────────────────────────────────────────

describe('extract · 正常抽取', () => {
  const pages = [
    'header line for page one',
    'header line for page two',
    LONG_METHOD,
    LONG_RESULT,
    LONG_LIMIT,
    'another result sentence about ablation studies on the benchmark suite',
  ]
  const paper = doc([
    section('3 Method', [{ text: LONG_METHOD, page: 3 }]),
    section('4 Experiments', [
      { text: LONG_RESULT, page: 4 },
      { text: 'another result sentence about ablation studies on the benchmark suite', page: 6 },
    ]),
    section('5 Limitations', [{ text: LONG_LIMIT, page: 5 }]),
  ])

  it('每条知识页都通过 validateNote(),页码与 evidence.page 一致', () => {
    const result = extractNotes({ doc: paper, pageLines: linesFrom(pages) }, { now: FIXED_CLOCK })
    assert.equal(result.status, 'ok')
    // 三个段落 + 一个独立的结果句 = 4 块
    assert.equal(result.notes.length, 4)

    for (const note of result.notes) {
      const check = validateNote(note)
      assert.equal(check.ok, true, `校验失败:${JSON.stringify(check)}`)
      assert.equal(note.evidence.page, note.page)
      assert.match(note.noteId, /^arxiv:2210\.03629#p\d+#[0-9a-f]{6}$/)
      assert.equal(note.paperId, 'arxiv:2210.03629')
      assert.equal(note.createdAt, '2026-10-29T00:00:00.000Z')
    }
  })

  it('kind 按章节标题分类', () => {
    const result = extractNotes({ doc: paper, pageLines: linesFrom(pages) }, { now: FIXED_CLOCK })
    const kinds = result.notes.map((note) => note.kind)
    assert.deepEqual(kinds, ['method', 'result', 'result', 'limitation'])
  })

  it('全部反查成功时 locateRate 与 exactRate 都是 1', () => {
    const result = extractNotes({ doc: paper, pageLines: linesFrom(pages) }, { now: FIXED_CLOCK })
    assert.equal(result.stats.locateRate, 1)
    assert.equal(result.stats.exactRate, 1)
    assert.equal(result.stats.notes, 4)
  })

  it('没有原文可反查时拒绝入库 —— 「无法验证」不能伪装成「低置信度」', () => {
    const result = extractNotes({ doc: paper, pageLines: [] })
    assert.equal(result.status, 'ok')
    assert.equal(result.notes.length, 0)
    assert.ok(result.rejected.every((item) => item.reason === 'no_anchor'))
    assert.match(result.rejected[0]?.detail ?? '', /未提供原文/)
  })
})

// ─────────────────────────────────────────────────────────────
// 3. 页码:以原文为准,不抄段落里的数字
// ─────────────────────────────────────────────────────────────

describe('extract · 页码纠偏', () => {
  it('段落自报第 4 页、原文实际在第 3 页时,采用第 3 页', () => {
    const paper = doc([section('3 Method', [{ text: LONG_METHOD, page: 4 }])])
    const result = extractNotes({ doc: paper, pageLines: linesFrom(['a', 'b', LONG_METHOD, 'd']) })

    assert.equal(result.status, 'ok')
    assert.equal(result.notes.length, 1)
    const note = result.notes[0]
    if (note === undefined) throw new Error('没有产出知识页')
    assert.equal(note.page, 3)
    assert.equal(note.evidence.page, 3)
    assert.equal(note.confidence, 'high')
  })

  it('反查失败时降为 low 但仍入库,页码用自报值(决策 D2)', () => {
    const rewritten =
      'This sentence was paraphrased by a model and does not appear verbatim anywhere in the source pages at all.'
    const paper = doc([section('3 Method', [{ text: rewritten, page: 2 }])])
    const result = extractNotes({ doc: paper, pageLines: linesFrom(['unrelated page one', 'unrelated page two']) })

    assert.equal(result.status, 'ok')
    const note = result.notes[0]
    if (note === undefined) throw new Error('低置信度知识页应仍然入库')
    assert.equal(note.confidence, 'low')
    assert.equal(note.page, 2)
    assert.equal(result.stats.locateRate, 0)
  })

  it('没有合法自报页码且反查失败时拒绝入库(数据铁律 #1)', () => {
    const paper = doc([section('3 Method', [{ text: LONG_METHOD, page: 0 }])])
    const result = extractNotes({ doc: paper, pageLines: linesFrom(['unrelated text here']) })

    assert.equal(result.status, 'ok')
    assert.equal(result.notes.length, 0)
    const rejected = result.rejected[0]
    if (rejected === undefined) throw new Error('应记录一条拒绝')
    assert.equal(rejected.reason, 'no_anchor')
    assert.equal(rejected.page, null)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. 切分与合并
// ─────────────────────────────────────────────────────────────

describe('extract · 切分', () => {
  it('同页的短残句并入上一块,不单独成页', () => {
    const paper = doc([section('4 Experiments', [
      { text: LONG_RESULT, page: 3 },
      { text: 'As shown in Table 2.', page: 3 },
    ])])
    const chunks = chunkPaper(paper)
    assert.equal(chunks.length, 1)
    assert.match(chunks[0]?.text ?? '', /As shown in Table 2\./)
  })

  it('跨页的短残句不合并 —— 合并会让 quote 横跨两页,锚点失效', () => {
    const paper = doc([section('4 Experiments', [
      { text: LONG_RESULT, page: 3 },
      { text: 'As shown in Table 2.', page: 4 },
    ])])
    const chunks = chunkPaper(paper)
    assert.equal(chunks.length, 2)
  })

  it('首块过短时拒绝,并记录 too_short', () => {
    const paper = doc([section('4 Experiments', [{ text: 'See Table 2.', page: 3 }])])
    const result = extractNotes({ doc: paper, pageLines: linesFrom(['x', 'y', 'See Table 2.']) })
    assert.equal(result.notes.length, 0)
    assert.equal(result.rejected[0]?.reason, 'too_short')
  })

  it('超长段落按句切分成多块,而不是一条塞满', () => {
    const sentence = 'This is a reasonably long sentence about the experimental setup and its parameters. '
    const paper = doc([section('3 Method', [{ text: sentence.repeat(12).trim(), page: 2 }])])
    const chunks = chunkPaper(paper)
    assert.ok(chunks.length > 1, `期望切分,实际 ${chunks.length} 块`)
    for (const chunk of chunks) {
      assert.ok(chunk.text.length <= 900, `块长度 ${chunk.text.length} 超过上限`)
    }
  })
})

// ─────────────────────────────────────────────────────────────
// 5. 去重与上限
// ─────────────────────────────────────────────────────────────

describe('extract · 去重与上限', () => {
  it('同页同描述的两段只保留一条', () => {
    const paper = doc([section('4 Experiments', [
      { text: LONG_RESULT, page: 3 },
      { text: LONG_RESULT, page: 3 },
    ])])
    const result = extractNotes({ doc: paper, pageLines: linesFrom(['a', 'b', LONG_RESULT]) })
    assert.equal(result.notes.length, 1)
    assert.ok(result.rejected.some((item) => item.reason === 'duplicate'))
  })

  it('超过 maxNotes 的候选记 overflow,不静默丢弃', () => {
    const paragraphs = [
      { text: `${LONG_METHOD} first variant of the approach description here.`, page: 2 },
      { text: `${LONG_RESULT} second variant of the result description here.`, page: 3 },
      { text: `${LONG_LIMIT} third variant of the limitation description here.`, page: 4 },
    ]
    const paper = doc([section('3 Method', paragraphs)])
    const result = extractNotes(
      { doc: paper, pageLines: linesFrom(['a', paragraphs[0]?.text ?? '', paragraphs[1]?.text ?? '', paragraphs[2]?.text ?? '']) },
      { maxNotes: 2 },
    )
    assert.equal(result.notes.length, 2)
    assert.ok(result.rejected.some((item) => item.reason === 'overflow'))
  })

  it('默认上限与 AC-A1.1 一致', () => {
    assert.equal(EXTRACT_LIMITS.maxNotes, 20)
    assert.equal(EXTRACT_LIMITS.minNotes, 5)
  })
})

// ─────────────────────────────────────────────────────────────
// 6. 纯函数:分类 / 描述 / id
// ─────────────────────────────────────────────────────────────

describe('extract · 分类', () => {
  it('标题优先于句内关键词', () => {
    // 句子里有 61.2%,但章节是 Method → 仍归 method
    assert.equal(classifyKind('3 Method', LONG_RESULT), 'method')
  })

  it('标题无线索时看句内关键词', () => {
    assert.equal(classifyKind('Prelude', LONG_RESULT), 'result')
    assert.equal(classifyKind('Prelude', 'We propose a new decoding strategy for agents.'), 'method')
    assert.equal(classifyKind('Prelude', 'It only works when the reward is dense enough.'), 'limitation')
    assert.equal(classifyKind('Prelude', 'A trace is defined as a sequence of thoughts.'), 'definition')
  })

  it('都没有线索时归 claim', () => {
    assert.equal(classifyKind('Prelude', 'Agents and humans share some properties.'), 'claim')
  })
})

describe('extract · 描述与 id', () => {
  it('描述取首句并截断到上限', () => {
    assert.equal(buildDescription('First sentence. Second sentence.'), 'First sentence.')
    const long = `${'a'.repeat(200)}. tail`
    const description = buildDescription(long)
    assert.ok(description.length <= 120)
    assert.ok(description.endsWith('…'))
  })

  it('noteId 由 description 推导,同一描述恒定', () => {
    const a = buildNoteId('arxiv:2210.03629', 3, 'ReAct combines reasoning and acting.')
    const b = buildNoteId('arxiv:2210.03629', 3, 'ReAct combines reasoning and acting.')
    assert.equal(a, b)
    assert.equal(hashOf('ReAct combines reasoning and acting.'), a.split('#')[2])
  })

  it('描述变了 id 就变 —— 这正是不能拿 text 做 hash 的原因', () => {
    const a = buildNoteId('p', 3, 'one claim')
    const b = buildNoteId('p', 3, 'two claim')
    assert.notEqual(a, b)
  })
})

// ─────────────────────────────────────────────────────────────
// 7. 噪声过滤(真实论文跑出来的问题)
// ─────────────────────────────────────────────────────────────

describe('extract · 噪声过滤', () => {
  it('把标题页的作者列表判为噪声 —— 它长度够、也有页码,只能靠语法结构识别', () => {
    const authors = '∗∗,1 2 2 2 2 1 2 Shunyu Yao , Jeffrey Zhao , Dian Yu , Nan Du , Izhak Shafran'
    assert.equal(isNoiseChunk(authors), true)
  })

  it('邮箱 / arXiv 编号 / 链接行判为噪声', () => {
    assert.equal(isNoiseChunk('Correspondence to: shunyuyao@cs.princeton.edu please contact us for details'), true)
    assert.equal(isNoiseChunk('Preprint. Under review. arXiv:2210.03629v3 [cs.CL] 10 Mar 2023'), true)
  })

  it('单词太少的碎片判为噪声', () => {
    assert.equal(isNoiseChunk('Table 2 shows this clearly'), true)
  })

  it('正常正文不被误杀 —— 功能词密度是判据', () => {
    assert.equal(isNoiseChunk(LONG_METHOD), false)
    assert.equal(isNoiseChunk(LONG_RESULT), false)
    assert.equal(isNoiseChunk(LONG_LIMIT), false)
  })
})

// ─────────────────────────────────────────────────────────────
// 8. 配额:不能「取前 N 条」
// ─────────────────────────────────────────────────────────────

describe('extract · 配额分配', () => {
  it('pickEvenly 覆盖首尾而不是只取开头', () => {
    const items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    assert.deepEqual(pickEvenly(items, 3), [0, 5, 9])
  })

  it('pickEvenly 要的比给的多时全取,不重复', () => {
    assert.deepEqual(pickEvenly([1, 2], 5), [1, 2])
    assert.deepEqual(pickEvenly([], 3), [])
  })

  it('名额够时每个有候选的章节都拿到 1 条', () => {
    const quotas = allocateQuotas([5, 5, 5], [1, 1, 1], 3)
    assert.deepEqual(quotas, [1, 1, 1])
  })

  it('权重高的章节拿更多,但没有章节被饿死', () => {
    const quotas = allocateQuotas([10, 10, 10], [1, 3, 3], 9)
    assert.equal(quotas.reduce((sum, quota) => sum + quota, 0), 9)
    const intro = quotas[0] ?? 0
    const method = quotas[1] ?? 0
    assert.ok(method > intro, `方法章节(${method})应多于引言(${intro})`)
    assert.ok(intro >= 1, '引言也应有 1 条')
  })

  it('配额永不超过该章节的候选数', () => {
    const quotas = allocateQuotas([1, 20], [3, 3], 15)
    assert.equal(quotas[0], 1)
    assert.ok((quotas[1] ?? 0) <= 20)
  })

  it('名额为 0 时什么都不给', () => {
    assert.deepEqual(allocateQuotas([5, 5], [1, 1], 0), [0, 0])
  })
})

describe('extract · 跨章节取样', () => {
  /** 造 3 个章节、每章 count 段互不相同的正文 */
  function bigPaper(countPerSection: number): { paper: PaperDoc; pages: string[] } {
    const headings = ['1 Introduction', '3 Method', '4 Experiments']
    const pages: string[] = []
    const sections: Section[] = []

    headings.forEach((heading, sectionIndex) => {
      const paragraphs: Paragraph[] = []
      for (let i = 0; i < countPerSection; i += 1) {
        const text = `Section ${sectionIndex} paragraph ${i} describes an important finding about the proposed approach in detail.`
        pages.push(text)
        paragraphs.push({ text, page: pages.length })
      }
      sections.push(section(heading, paragraphs))
    })

    return { paper: doc(sections), pages }
  }

  it('20 条不会全落在第一章 —— 这是真实论文跑第一版时的失败模式', () => {
    const { paper, pages } = bigPaper(10)
    const result = extractNotes({ doc: paper, pageLines: linesFrom(pages) })
    assert.equal(result.status, 'ok')

    const pagesUsed = new Set(result.notes.map((note) => note.page))
    assert.ok(pagesUsed.size >= 6, `页码覆盖只有 ${pagesUsed.size} 页,样本过于集中`)
    assert.equal(result.notes.length, 20)
  })

  it('每个章节都有代表,不会出现某章一条都没有', () => {
    const { paper, pages } = bigPaper(10)
    const result = extractNotes({ doc: paper, pageLines: linesFrom(pages) })
    const kinds = new Set(result.notes.map((note) => note.kind))
    // 引言→claim,方法→method,实验→result
    assert.ok(kinds.has('claim'), '引言章节未被取样')
    assert.ok(kinds.has('method'), '方法章节未被取样')
    assert.ok(kinds.has('result'), '实验章节未被取样')
  })

  it('超出上限的候选被汇总成一条 overflow,而不是逐条铺开', () => {
    const { paper, pages } = bigPaper(10)
    const result = extractNotes({ doc: paper, pageLines: linesFrom(pages) })
    const overflows = result.rejected.filter((item) => item.reason === 'overflow')
    assert.equal(overflows.length, 1)
    assert.equal(result.stats.droppedByLimit, 10)
  })
})
