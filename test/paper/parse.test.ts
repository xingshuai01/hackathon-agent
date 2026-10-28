/**
 * 共享底座 parse.ts 的单测。
 *
 * 用**合成的分页纯文本**(`\f` 分隔)测逻辑,不依赖真实 PDF 文件 ——
 * 这样测试快、确定、且不用往仓库塞 2MB 的论文。
 *
 * 真实 PDF 的验证方式见文件末尾注释。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  assemblePaperDoc,
  derivePaperId,
  extractAbstract,
  extractReferences,
  groupIntoParagraphs,
  guessTitle,
  headingLevel,
  isHeading,
  isNoiseLine,
  paginatedTextToLines,
  parsePaginatedText,
  splitPagesByFormFeed,
  stripRunningHeaders,
  textItemsToLines,
  yearFromArxivId,
  type PageLine,
} from '../../src/services/paper/parse.ts'
import { checkParagraphAnchors, gateByParseQuality } from '../../src/services/paper/types.ts'

// ─────────────────────────────────────────────────────────────
// 1. 分页与行
// ─────────────────────────────────────────────────────────────

describe('parse · 分页', () => {
  it('按 \\f 切页,并丢掉末尾空页', () => {
    const text = 'page one\fpage two\f   \f'
    const pages = splitPagesByFormFeed(text)
    assert.equal(pages.length, 2)
    assert.equal(pages[0]?.trim(), 'page one')
    assert.equal(pages[1]?.trim(), 'page two')
  })

  it('每行记住自己属于哪一页(数据铁律 #1 的基础)', () => {
    const lines = paginatedTextToLines('a1\nb1\f a2\nb2')
    assert.deepEqual(
      lines.map((l) => [l.text.trim(), l.page]),
      [
        ['a1', 1],
        ['b1', 1],
        ['a2', 2],
        ['b2', 2],
      ],
    )
  })

  it('丢掉空白行', () => {
    const lines = paginatedTextToLines('a\n\n\n   \nb')
    assert.equal(lines.length, 2)
  })
})

// ─────────────────────────────────────────────────────────────
// 2. 页眉页脚
// ─────────────────────────────────────────────────────────────

describe('parse · 页眉页脚剔除', () => {
  it('在多页重复出现的行被当作噪声剔除', () => {
    const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon']
    const lines: PageLine[] = []
    for (let p = 1; p <= 5; p += 1) {
      lines.push({ text: 'Preprint. Under review.', page: p })
      // 正文必须每页**内容不同**,否则归一化后会与页眉一样被视为重复
      lines.push({ text: `This page discusses ${words[p - 1] ?? 'zeta'} in detail.`, page: p })
    }
    const stripped = stripRunningHeaders(lines)
    assert.equal(stripped.filter((l) => l.text === 'Preprint. Under review.').length, 0)
    assert.equal(stripped.length, 5, '正文必须保留')
  })

  it('只出现一两次的行不被误删', () => {
    const lines: PageLine[] = [
      { text: 'unique line A', page: 1 },
      { text: 'unique line B', page: 2 },
      { text: 'unique line C', page: 3 },
      { text: 'unique line D', page: 4 },
    ]
    assert.equal(stripRunningHeaders(lines).length, 4)
  })

  it('页数太少时不启用剔除(避免误杀)', () => {
    const lines: PageLine[] = [
      { text: 'same', page: 1 },
      { text: 'same', page: 2 },
    ]
    assert.equal(stripRunningHeaders(lines).length, 2)
  })
})

// ─────────────────────────────────────────────────────────────
// 3. 标题识别
// ─────────────────────────────────────────────────────────────

describe('parse · 章节标题识别', () => {
  it('识别编号标题', () => {
    for (const h of ['1 Introduction', '2.1 Model Architecture', '3. Results and Discussion']) {
      assert.equal(isHeading(h), true, h)
    }
  })

  it('识别常见固定标题', () => {
    for (const h of ['Abstract', 'References', 'Conclusion', 'Acknowledgments']) {
      assert.equal(isHeading(h), true, h)
    }
  })

  it('识别全大写短行', () => {
    assert.equal(isHeading('RELATED WORK'), true)
    assert.equal(isHeading('EXPERIMENTAL SETUP'), true)
  })

  it('不把正文当标题', () => {
    const body =
      'Recurrent neural networks have been firmly established as state of the art approaches in sequence modeling.'
    assert.equal(isHeading(body), false)
    // 以数字开头但其实是列表项的正文
    assert.equal(isHeading('1 This is a very long sentence that clearly is not a heading at all.'), false)
  })

  it('不把过长的全大写行当标题', () => {
    assert.equal(isHeading(`${'A'.repeat(95)}`), false)
  })

  it('层级由编号点号决定', () => {
    assert.equal(headingLevel('1 Introduction'), 1)
    assert.equal(headingLevel('3.2 Attention'), 2)
    assert.equal(headingLevel('3.2.1 Scaled Dot-Product Attention'), 3)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. 段落切分
// ─────────────────────────────────────────────────────────────

describe('parse · 段落切分', () => {
  it('把多行合并成一段,并取首行所在页', () => {
    const paragraphs = groupIntoParagraphs([
      { text: '这是第一行,', page: 2 },
      { text: '这是第二行。', page: 2 },
    ])
    assert.equal(paragraphs.length, 1)
    assert.equal(paragraphs[0]?.page, 2)
    assert.match(paragraphs[0]?.text ?? '', /第一行, 这是第二行。/)
  })

  it('句子结束且长度足够时断开', () => {
    const long = 'A'.repeat(60)
    const paragraphs = groupIntoParagraphs([
      { text: `${long}.`, page: 1 },
      { text: `${long}.`, page: 1 },
    ])
    assert.equal(paragraphs.length, 2)
  })

  it('列表项开头强制断段', () => {
    const paragraphs = groupIntoParagraphs([
      { text: '前言文字'.repeat(10), page: 1 },
      { text: '- 第一项', page: 1 },
      { text: '- 第二项', page: 1 },
    ])
    assert.equal(paragraphs.length, 3)
  })

  it('每个段落都带页码', () => {
    const paragraphs = groupIntoParagraphs([
      { text: 'a'.repeat(80) + '.', page: 3 },
      { text: 'b'.repeat(80) + '.', page: 4 },
    ])
    for (const p of paragraphs) assert.ok(Number.isInteger(p.page) && p.page >= 1)
  })
})

// ─────────────────────────────────────────────────────────────
// 5. paperId 推导
// ─────────────────────────────────────────────────────────────

describe('parse · paperId 推导(必须稳定可推导)', () => {
  it('优先 arXiv ID', () => {
    assert.equal(derivePaperId('see arXiv: 1706.03762v7 for details'), 'arxiv:1706.03762')
  })

  it('其次 DOI', () => {
    assert.equal(
      derivePaperId('doi: 10.1145/3292500.3330701'),
      'doi:10.1145/3292500.3330701',
    )
  })

  it('都没有时用文件字节哈希', () => {
    const bytes = new TextEncoder().encode('some pdf bytes')
    const id = derivePaperId('no identifier here', bytes)
    assert.match(id, /^[0-9a-f]{16}$/)
    // 同一份字节必须得到同一个 id
    assert.equal(id, derivePaperId('different text', bytes))
  })

  it('没有字节时用正文哈希(仍然稳定)', () => {
    const a = derivePaperId('the same body text')
    const b = derivePaperId('the same body text')
    assert.equal(a, b)
  })

  it('从 arXiv ID 推年份', () => {
    assert.equal(yearFromArxivId('arxiv:1706.03762'), 2017)
    assert.equal(yearFromArxivId('arxiv:2401.12345'), 2024)
    assert.equal(yearFromArxivId('doi:10.1/x'), null)
  })
})

// ─────────────────────────────────────────────────────────────
// 6. 标题与噪声
// ─────────────────────────────────────────────────────────────

describe('parse · 标题识别', () => {
  it('字号最大的一段作为标题', () => {
    const lines: PageLine[] = [
      { text: 'Provided proper attribution is provided, Google hereby grants permission to', page: 1, fontSize: 8 },
      { text: 'Attention Is All You Need', page: 1, fontSize: 17 },
      { text: 'Ashish Vaswani, Noam Shazeer', page: 1, fontSize: 11 },
      { text: 'Abstract', page: 1, fontSize: 12 },
      { text: 'The dominant sequence transduction models are based on', page: 1, fontSize: 10 },
    ]
    assert.equal(guessTitle(lines), 'Attention Is All You Need')
  })

  it('多行标题被拼接', () => {
    const lines: PageLine[] = [
      { text: 'A Very Long Paper Title That', page: 1, fontSize: 18 },
      { text: 'Spans Two Lines', page: 1, fontSize: 18 },
      { text: 'Body text here', page: 1, fontSize: 10 },
    ]
    assert.equal(guessTitle(lines), 'A Very Long Paper Title That Spans Two Lines')
  })

  it('没有字号信息时回退到启发式,并跳过版权噪声', () => {
    const lines: PageLine[] = [
      { text: 'Provided proper attribution is provided, Google hereby grants permission to', page: 1 },
      { text: 'reproduce the tables and figures in this paper', page: 1 },
      { text: 'scholarly works.', page: 1 },
      { text: 'Attention Is All You Need', page: 1 },
    ]
    assert.equal(guessTitle(lines), 'Attention Is All You Need')
  })

  it('噪声行判定覆盖版权/许可/arXiv 标注', () => {
    for (const t of [
      'Provided proper attribution is provided',
      'reproduce the tables and figures in this paper',
      'Copyright 2024 ACM',
      'arXiv:2401.12345v1',
      'Under review as a conference paper',
      'Figure 3: Model overview',
      'Table 2: Results',
    ]) {
      assert.equal(isNoiseLine(t), true, t)
    }
    assert.equal(isNoiseLine('Attention Is All You Need'), false)
  })
})

// ─────────────────────────────────────────────────────────────
// 7. 端到端:合成论文
// ─────────────────────────────────────────────────────────────

function syntheticPaper(): string {
  const page1 = [
    'Preprint. Under review.',
    'Attention Is All You Need',
    'Ashish Vaswani, Noam Shazeer',
    'Abstract',
    'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.',
    'We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.',
  ].join('\n')

  const page2 = [
    'Preprint. Under review.',
    '1 Introduction',
    'Recurrent neural networks, long short-term memory and gated recurrent neural networks in particular,',
    'have been firmly established as state of the art approaches in sequence modeling and transduction.',
    '2 Background',
    'The goal of reducing sequential computation also forms the foundation of the Extended Neural GPU.',
  ].join('\n')

  const page3 = [
    'Preprint. Under review.',
    '3 Model Architecture',
    'Most competitive neural sequence transduction models have an encoder-decoder structure.',
    'References',
    '[1] Jimmy Lei Ba, Jamie Ryan Kiros, and Geoffrey E Hinton. Layer normalization. arXiv:1607.06450, 2016.',
    '[2] Dzmitry Bahdanau, Kyunghyun Cho, and Yoshua Bengio. Neural machine translation by jointly learning. 2015.',
  ].join('\n')

  return [page1, page2, page3].join('\f')
}

describe('parse · 端到端(合成 3 页论文)', () => {
  const { doc, warnings } = parsePaginatedText(syntheticPaper())

  it('页码总数正确', () => {
    assert.equal(doc.parseQuality.pagesTotal, 3)
    assert.equal(doc.parseQuality.pagesParsed, 3)
  })

  it('门控通过', () => {
    assert.equal(gateByParseQuality(doc.parseQuality).status, 'usable')
  })

  it('页眉被剔除', () => {
    const allText = doc.sections.flatMap((s) => s.paragraphs.map((p) => p.text)).join(' ')
    assert.ok(!allText.includes('Preprint. Under review.'), '页眉不该出现在正文里')
  })

  it('识别出章节结构', () => {
    const headings = doc.sections.map((s) => s.heading)
    assert.ok(headings.includes('Abstract'), headings.join(' | '))
    assert.ok(headings.some((h) => h.includes('Introduction')), headings.join(' | '))
    assert.ok(headings.some((h) => h.includes('Background')), headings.join(' | '))
    assert.ok(headings.some((h) => h.includes('Model Architecture')), headings.join(' | '))
  })

  it('摘要被抽出', () => {
    assert.match(doc.abstract, /dominant sequence transduction models/)
  })

  it('**所有段落都带有效页码**(数据铁律 #1)', () => {
    assert.deepEqual(checkParagraphAnchors(doc), [])
  })

  it('跨页正文的页码正确', () => {
    const intro = doc.sections.find((s) => s.heading.includes('Introduction'))
    assert.ok(intro !== undefined)
    assert.equal(intro.paragraphs[0]?.page, 2)
  })

  it('参考文献被抽出', () => {
    assert.equal(doc.references.length, 2)
    assert.match(doc.references[0]?.raw ?? '', /Layer normalization/)
  })

  it('没有产生警告', () => {
    assert.deepEqual(warnings, [])
  })
})

// ─────────────────────────────────────────────────────────────
// 8. 坐标重组(用最小文本项模拟 pdfjs 输出)
// ─────────────────────────────────────────────────────────────

describe('parse · 文本项按坐标重组为行', () => {
  const item = (str: string, x: number, y: number, width: number, fontSize = 10) => ({
    str,
    transform: [fontSize, 0, 0, fontSize, x, y],
    width,
    hasEOL: false,
  })

  it('同一 y 的项合成一行', () => {
    const lines = textItemsToLines(
      [item('Hello', 10, 700, 30), item('world', 45, 700, 30)],
      1,
    )
    assert.equal(lines.length, 1)
    assert.equal(lines[0]?.text, 'Hello world', '间距够大时必须补空格')
    assert.equal(lines[0]?.page, 1)
  })

  it('间距很小时不补空格(避免把词拆开)', () => {
    const lines = textItemsToLines(
      [item('permission', 10, 700, 50), item('to', 60.2, 700, 10)],
      1,
    )
    assert.equal(lines[0]?.text, 'permissionto')
  })

  it('不同 y 的项分成不同行,并按 y 从上到下', () => {
    const lines = textItemsToLines(
      [item('second', 10, 680, 30), item('first', 10, 700, 30)],
      2,
    )
    assert.deepEqual(lines.map((l) => l.text), ['first', 'second'])
    assert.ok(lines.every((l) => l.page === 2))
  })

  it('记录每行最大字号(标题识别的基础)', () => {
    const lines = textItemsToLines(
      [
        { str: 'Title', transform: [18, 0, 0, 18, 10, 700], width: 40, hasEOL: true },
        { str: 'body', transform: [10, 0, 0, 10, 10, 680], width: 30, hasEOL: true },
      ],
      1,
    )
    assert.equal(lines[0]?.fontSize, 18)
    assert.equal(lines[1]?.fontSize, 10)
  })

  it('空输入返回空数组,不抛', () => {
    assert.deepEqual(textItemsToLines([], 1), [])
  })
})

// ─────────────────────────────────────────────────────────────
// 9. 质量门控联动
// ─────────────────────────────────────────────────────────────

describe('parse · 与质量门控联动(数据铁律 #3)', () => {
  it('大量空页时给出警告,并会被门控隔离', () => {
    // 直接用 assemblePaperDoc 指定 pagesTotal,模拟「PDF 有 5 页但只有第 1 页有文本」。
    // (不通过 parsePaginatedText:它按 \f 切页,会丢弃尾部空页,页数会算少。)
    const result = assemblePaperDoc({
      lines: [
        { text: 'Title Here', page: 1 },
        { text: 'body '.repeat(60).trim(), page: 1 },
      ],
      pagesTotal: 5,
    })

    assert.equal(result.doc.parseQuality.pagesTotal, 5)
    assert.equal(result.doc.parseQuality.pagesParsed, 1)
    assert.ok(result.warnings.length > 0)
    assert.equal(gateByParseQuality(result.doc.parseQuality).status, 'quarantined')
  })

  it('assemblePaperDoc 在标题缺失时给出警告而不是抛错', () => {
    const result = assemblePaperDoc({ lines: [], pagesTotal: 1 })
    assert.equal(result.doc.title, '')
    assert.ok(result.warnings.some((w) => w.includes('标题')))
  })
})

// ─────────────────────────────────────────────────────────────
// 真实 PDF 的手动验证方式(不进 CI,避免依赖 2MB 二进制)
// ─────────────────────────────────────────────────────────────
//
//   node -e "fetch('https://arxiv.org/pdf/1706.03762v7').then(r=>r.arrayBuffer()).then(b=>{require('fs').mkdirSync('data/papers',{recursive:true});require('fs').writeFileSync('data/papers/attention.pdf',Buffer.from(b))})"
//   node --input-type=module -e "
//     import { parsePdfFile } from './src/services/paper/parse.ts'
//     const r = await parsePdfFile('data/papers/attention.pdf')
//     console.log(r.doc.title, r.doc.paperId, r.doc.parseQuality)
//   "
//
// 实测(15 页):耗时 ~460ms,15/15 页,25 个章节,123 段落,37755 字符,
// 标题 "Attention Is All You Need",paperId arxiv:1706.03762,46 条参考文献。
