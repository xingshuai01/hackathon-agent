/**
 * 模块 A · 页码锚定的单测。
 *
 * 这里测的是**整个 A 模块最不能错的东西**:如果页码反查错了,
 * 知识库里的每条引用都会指错地方,而系统完全不会报错 —— 静默的错误
 * 比崩溃危险得多(数据铁律 #1)。
 *
 * 用合成 PageLine[](不碰真实 PDF),这样快、确定,且能精确构造
 * 「同一句在多页重复」「公式被打散」「跨页」这些真实 PDF 里才出现的坑。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  attachPageByQuote,
  attachPagesByQuote,
  buildPageTexts,
  normalizeForMatch,
  type AnchorOutcome,
  type LocatedAnchor,
} from '../../src/services/knowledge/anchor.ts'
import type { PageLine } from '../../src/services/paper/parse.ts'

// ─────────────────────────────────────────────────────────────
// 辅助
// ─────────────────────────────────────────────────────────────

/** 按数组下标生成 PageLine[],第 i 个元素的页码是 i+1 */
function pagesFrom(pages: readonly string[]): PageLine[] {
  return pages.flatMap((text, index) =>
    text.split('\n').map((line) => ({ page: index + 1, text: line })),
  )
}

function expectLocated(outcome: AnchorOutcome): LocatedAnchor {
  if (outcome.status !== 'located') {
    throw new Error(`期望定位成功,实际是 ${JSON.stringify(outcome)}`)
  }
  return outcome.anchor
}

function expectUnlocated(outcome: AnchorOutcome): Extract<AnchorOutcome, { status: 'unlocated' }> {
  if (outcome.status !== 'unlocated') {
    throw new Error(`期望定位失败,实际是 ${JSON.stringify(outcome)}`)
  }
  return outcome
}

const QUOTE_REACT =
  'we augment the agent action space to A L where L is the space of language'

// ─────────────────────────────────────────────────────────────
// 1. 归一化
// ─────────────────────────────────────────────────────────────

describe('anchor · 归一化', () => {
  it('抵消大小写、花引号与全角字符', () => {
    // 撇号被抹成空格是**有意的**:原文与摘句都会被抹,一致性比保留更重要
    assert.equal(normalizeForMatch('We DON’T Know'), 'we don t know')
    assert.equal(normalizeForMatch('ＡＢＣ'), 'abc')
  })

  it('把连字拆开 —— pdfjs 抽出的 ﬁ 必须能与 fi 匹配上', () => {
    assert.equal(normalizeForMatch('efﬁcient'), 'efficient')
  })

  it('抹掉数学符号但保留 % 与小数点', () => {
    // 这正是 PDF 打散公式后的形态:A ∪ L 只剩 A 和 L
    assert.equal(normalizeForMatch('action space A ∪ L'), 'action space a l')
    assert.equal(normalizeForMatch('accuracy 61.2% > baseline'), 'accuracy 61.2% baseline')
  })

  it('保留汉字 —— 中文摘句不能被整句抹成空格', () => {
    assert.equal(normalizeForMatch('ReAct 将动作空间扩充为 A∪L'), 'react 将动作空间扩充为 a l')
  })
})

// ─────────────────────────────────────────────────────────────
// 2. 页文本聚合
// ─────────────────────────────────────────────────────────────

describe('anchor · 页文本', () => {
  it('同一页的多行合并成一段', () => {
    const texts = buildPageTexts(pagesFrom(['hello\nworld']))
    assert.equal(texts.get(1), 'hello world')
  })

  it('跳过页码为 0 / 非整数的行 —— 数据铁律 #1 不给占位符留口子', () => {
    const texts = buildPageTexts([
      { page: 0, text: 'placeholder' },
      { page: -1, text: 'negative' },
      { page: 1.5, text: 'fraction' },
      { page: 2, text: 'real content' },
    ])
    assert.equal(texts.size, 1)
    assert.equal(texts.get(2), 'real content')
  })

  it('只有标点没有实词的页不进表', () => {
    const texts = buildPageTexts(pagesFrom(['— — —', 'actual words here']))
    assert.equal(texts.has(1), false)
    assert.equal(texts.has(2), true)
  })
})

// ─────────────────────────────────────────────────────────────
// 3. 定位成功
// ─────────────────────────────────────────────────────────────

describe('anchor · 定位成功', () => {
  const lines = pagesFrom([
    'ReAct Synergizing Reasoning and Acting in Language Models',
    'a frozen large language model PaLM is prompted with few-shot examples',
    'we augment the agent action space to A L where L is the space of language',
    'experiments show ReAct outperforms baselines on HotpotQA',
  ])

  it('窗口内命中:页码与自报值一致,offset 为 0', () => {
    const anchor = expectLocated(attachPageByQuote(QUOTE_REACT, lines, { hint: 3 }))
    assert.equal(anchor.page, 3)
    assert.equal(anchor.offset, 0)
    assert.equal(anchor.similarity, 1)
    assert.equal(anchor.exact, true)
    assert.equal(anchor.withinWindow, true)
  })

  it('自报页码偏 1 页:窗口内纠回来,offset 记为 -1', () => {
    const anchor = expectLocated(attachPageByQuote(QUOTE_REACT, lines, { hint: 4 }))
    assert.equal(anchor.page, 3)
    assert.equal(anchor.offset, -1)
    assert.equal(anchor.withinWindow, true)
  })

  it('自报页码偏到窗口外:仍能定位,但标记 withinWindow=false 交给调用方降级', () => {
    const anchor = expectLocated(attachPageByQuote(QUOTE_REACT, lines, { hint: 8 }))
    assert.equal(anchor.page, 3)
    assert.equal(anchor.withinWindow, false)
    assert.equal(anchor.offset, -5)
  })

  it('没有自报页码时也能定位,offset 归零', () => {
    const anchor = expectLocated(attachPageByQuote(QUOTE_REACT, lines))
    assert.equal(anchor.page, 3)
    assert.equal(anchor.offset, 0)
    assert.equal(anchor.withinWindow, false)
  })

  it('windowPages=0 时只搜自报那一页', () => {
    const outcome = attachPageByQuote(QUOTE_REACT, lines, { hint: 2, windowPages: 0 })
    // 第 2 页没有这句话 → 窗口内失手,退到全篇仍能找到第 3 页
    const anchor = expectLocated(outcome)
    assert.equal(anchor.page, 3)
    assert.equal(anchor.withinWindow, false)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. 择优:同一句话出现在多页
// ─────────────────────────────────────────────────────────────

describe('anchor · 多处重复时的择优', () => {
  // 摘要与结论都复述了同一句,这在论文里极常见
  const lines = pagesFrom([
    'we augment the agent action space to A L where L is the space of language',
    'unrelated discussion of retrieval baselines',
    'we augment the agent action space to A L where L is the space of language',
  ])

  it('平手时选离自报页码近的那页', () => {
    assert.equal(expectLocated(attachPageByQuote(QUOTE_REACT, lines, { hint: 1 })).page, 1)
    assert.equal(expectLocated(attachPageByQuote(QUOTE_REACT, lines, { hint: 3 })).page, 3)
  })

  it('没有自报页码时取页码小的,保证结果确定(不受遍历顺序影响)', () => {
    const first = expectLocated(attachPageByQuote(QUOTE_REACT, lines))
    const second = expectLocated(attachPageByQuote(QUOTE_REACT, lines))
    assert.equal(first.page, 1)
    assert.equal(second.page, 1)
  })
})

// ─────────────────────────────────────────────────────────────
// 5. 跨页与退化匹配
// ─────────────────────────────────────────────────────────────

describe('anchor · 跨页', () => {
  // 省略号两侧的句子分属第 2、3 页:典型的两栏排版被切开的情形
  const lines = pagesFrom([
    'introduction to the problem',
    'ReAct is a general paradigm that combines reasoning traces',
    'with task specific actions in an interleaved manner',
  ])

  it('片段分散在两页时标记 acrossPages', () => {
    const anchor = expectLocated(
      attachPageByQuote(
        'ReAct is a general paradigm ... with task specific actions',
        lines,
        { hint: 2 },
      ),
    )
    assert.equal(anchor.page, 2)
    assert.equal(anchor.acrossPages, true)
    assert.equal(anchor.similarity, 0.5)
  })
})

describe('anchor · 摘句被模型改写时的退化匹配', () => {
  // 真实情形:模型把 quote 抄长了,尾部夹了自己的话 —— 整段对不上,前半句还在
  const lines = pagesFrom([
    'cover page',
    'we augment the agent action space to A L where L is the space of language models',
  ])

  it('整段对不上时退到前缀,仍能定位但 exact=false', () => {
    const anchor = expectLocated(
      attachPageByQuote(
        'we augment the agent action space to A ∪ L and this tail is paraphrased by the model',
        lines,
        { hint: 2 },
      ),
    )
    assert.equal(anchor.page, 2)
    assert.equal(anchor.exact, false)
    // 只有一个片段,所以命中率仍是 1 —— 这正是「必须看 exact 而不能只看 similarity」的原因
    assert.equal(anchor.similarity, 1)
  })
})

describe('anchor · 中文论文', () => {
  const lines = pagesFrom([
    '摘要:本文提出一种新的检索增强方法',
    '实验表明该方法在三个数据集上均优于基线',
  ])

  it('中文摘句可以定位', () => {
    const anchor = expectLocated(
      attachPageByQuote('实验表明该方法在三个数据集上均优于基线', lines, { hint: 1 }),
    )
    assert.equal(anchor.page, 2)
    assert.equal(anchor.offset, 1)
  })
})

// ─────────────────────────────────────────────────────────────
// 6. 失败路径(规则要求:新纯函数必须测失败路径)
// ─────────────────────────────────────────────────────────────

describe('anchor · 失败路径', () => {
  const lines = pagesFrom(['some real content about retrieval', 'more content about baselines'])

  it('空 quote', () => {
    const failed = expectUnlocated(attachPageByQuote('   ', lines))
    assert.equal(failed.reason, 'empty_quote')
  })

  it('quote 太短,不足以可靠匹配', () => {
    const failed = expectUnlocated(attachPageByQuote('the', lines))
    assert.equal(failed.reason, 'too_short')
  })

  it('minFragChars 可调:放宽后短句也能匹配', () => {
    const outcome = attachPageByQuote('baselines', lines, { minFragChars: 4 })
    assert.equal(expectLocated(outcome).page, 2)
  })

  it('编造的 quote 找不到时,bestPage 必须是 null 而不是随便一页', () => {
    const failed = expectUnlocated(
      attachPageByQuote('this sentence does not exist anywhere in the paper', lines),
    )
    assert.equal(failed.reason, 'not_found')
    assert.equal(failed.bestPage, null)
    assert.equal(failed.bestSimilarity, 0)
  })

  it('没有页文本时明确报 no_pages,而不是静默返回找不到', () => {
    const failed = expectUnlocated(attachPageByQuote(QUOTE_REACT, []))
    assert.equal(failed.reason, 'no_pages')
  })
})

// ─────────────────────────────────────────────────────────────
// 7. 批量
// ─────────────────────────────────────────────────────────────

describe('anchor · 批量反查', () => {
  const lines = pagesFrom([
    'first claim about reasoning traces',
    'second claim about action space A L in detail',
  ])

  it('逐条返回,各自带上自己的 hint', () => {
    const outcomes = attachPagesByQuote(
      [
        { quote: 'first claim about reasoning traces', hint: 1 },
        { quote: 'second claim about action space', hint: 1 },
      ],
      lines,
    )
    assert.equal(outcomes.length, 2)
    const first = outcomes[0]
    const second = outcomes[1]
    if (first === undefined || second === undefined) throw new Error('批量结果长度不足')
    assert.equal(expectLocated(first).page, 1)
    assert.equal(expectLocated(second).page, 2)
    assert.equal(expectLocated(second).offset, 1)
  })
})
