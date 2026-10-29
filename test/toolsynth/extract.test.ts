/**
 * extract.ts 单测:paperToPromptText / locateQuotePage / extractMethods(假 LLM)。
 *
 * extractMethods 用假 LLM 全脚本化 —— 不花一分钱 API 额度,且能精确测出
 * 「引文不可追溯 → 丢弃」「unsupported → 丢弃」「LLM 坏了 → 降级不抛」三条路径。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LlmFatalError } from '../../src/services/llm/types.ts'
import type { LlmClient, LlmRequest, LlmTurn } from '../../src/services/llm/types.ts'
import type { PaperDoc } from '../../src/services/paper/types.ts'
import { extractMethods, locateQuotePage, paperToPromptText } from '../../src/services/toolsynth/extract.ts'

// ─────────────────────────────────────────────────────────────
// 测试论文(2 页,段落少而精确,便于断言引文回指)
// ─────────────────────────────────────────────────────────────

const doc: PaperDoc = {
  paperId: 'test-paper',
  title: 'Test Paper',
  authors: ['Alice'],
  year: 2024,
  abstract: 'abstract',
  sections: [
    {
      heading: 'Method',
      level: 1,
      paragraphs: [
        { text: 'We use the majority answer among samples.', page: 1 },
        { text: 'The recipe is judged by EM.', page: 2 },
      ],
      tables: [],
      figures: [],
    },
  ],
  references: [],
  parseQuality: { pagesParsed: 2, pagesTotal: 2, hasOcr: false },
}

/** 假 LLM:respond 拿到完整请求,可断言 prompt 内容 */
function fakeLlm(respond: (request: Omit<LlmRequest, 'tools'>) => string | Promise<string>): LlmClient {
  return {
    async turn(): Promise<LlmTurn> {
      throw new Error('方法抽取只应调用 sideQuery')
    },
    async sideQuery(request: Omit<LlmRequest, 'tools'>): Promise<string> {
      return respond(request)
    },
  }
}

describe('paperToPromptText', () => {
  it('段落带 [pN] 页码前缀,预算内不截断', () => {
    const text = paperToPromptText(doc, 500)
    assert.ok(text.includes('[p1] We use the majority answer among samples.'))
    assert.ok(text.includes('[p2] The recipe is judged by EM.'))
    assert.ok(!text.includes('已按预算截断'))
  })

  it('超预算时按段截断并留下标记', () => {
    const text = paperToPromptText(doc, 50)
    assert.ok(text.includes('[p1] We use the majority answer among samples.'))
    assert.ok(!text.includes('[p2]'))
    assert.ok(text.includes('(正文过长已按预算截断)'))
  })
})

describe('locateQuotePage(逐字回指校验)', () => {
  it('引文在声称页找到 → 原页', () => {
    assert.equal(locateQuotePage(doc, 'majority answer among samples', 1), 1)
  })

  it('声称页没有、别的页有 → 改判到真实页(不信模型自报的页码)', () => {
    assert.equal(locateQuotePage(doc, 'judged by EM', 1), 2)
  })

  it('全文都找不到 → null(调用方丢弃并记录)', () => {
    assert.equal(locateQuotePage(doc, 'this sentence appears nowhere', 1), null)
  })

  it('空引文 → 原样返回声称页(不伪造证据)', () => {
    assert.equal(locateQuotePage(doc, '   ', 1), 1)
  })
})

describe('extractMethods(假 LLM 全流程)', () => {
  const valid = {
    methodId: 't-majority',
    name: 'majority vote',
    params: [{ name: 'answers', type: 'object', required: true, description: '答案列表' }],
    preconditions: [],
    evidencePage: 1,
    evidenceQuote: 'majority answer among samples',
    supportLevel: 'L1',
  }

  it('正常路径:合法方法进队列,prompt 带页码前缀', async () => {
    const report = await extractMethods(doc, {
      llm: fakeLlm((request) => {
        const user = request.messages.find((m) => m.role === 'user')
        assert.ok(user !== undefined && user.role === 'user')
        assert.ok(user.content.includes('[p1]'))
        assert.equal(request.jsonObject, true)
        return JSON.stringify({ methods: [valid] })
      }),
    })
    assert.equal(report.degraded, false)
    assert.equal(report.specs.length, 1)
    assert.equal(report.dropped.length, 0)
    const spec = report.specs[0]
    assert.ok(spec !== undefined)
    assert.equal(spec.toolName, 'majority_vote')
    assert.equal(spec.evidencePage, 1)
    assert.equal(spec.paperId, 'test-paper')
  })

  it('引文不可追溯 → 丢弃并记录(数据铁律 #2,不静默)', async () => {
    const report = await extractMethods(doc, {
      llm: fakeLlm(() =>
        JSON.stringify({
          methods: [{ ...valid, evidenceQuote: 'this sentence appears nowhere' }],
        }),
      ),
    })
    assert.equal(report.specs.length, 0)
    assert.equal(report.dropped.length, 1)
    assert.ok(report.dropped[0]?.reason.includes('无法在原文任何一页找到'))
  })

  it('模型自报页码错了、引文在别的页 → 改判页码而不是丢弃', async () => {
    const report = await extractMethods(doc, {
      llm: fakeLlm(() =>
        JSON.stringify({
          methods: [{ ...valid, evidenceQuote: 'judged by EM', evidencePage: 1 }],
        }),
      ),
    })
    assert.equal(report.specs.length, 1)
    assert.equal(report.specs[0]?.evidencePage, 2)
  })

  it('evidencePage 超出论文页码范围 → 丢弃', async () => {
    const report = await extractMethods(doc, {
      llm: fakeLlm(() =>
        JSON.stringify({
          methods: [{ ...valid, evidenceQuote: '', evidencePage: 99 }],
        }),
      ),
    })
    assert.equal(report.specs.length, 0)
    assert.ok(report.dropped[0]?.reason.includes('超出论文页码范围 1..2'))
  })

  it('supportLevel=unsupported → 丢弃并记录(AC-B1.4)', async () => {
    const report = await extractMethods(doc, {
      llm: fakeLlm(() =>
        JSON.stringify({
          methods: [{ ...valid, supportLevel: 'unsupported' }],
        }),
      ),
    })
    assert.equal(report.specs.length, 0)
    assert.ok(report.dropped[0]?.reason.includes('supportLevel=unsupported'))
  })

  it('LLM 抛错 → degraded=true,不 throw(调用方改用已提交 specs)', async () => {
    const report = await extractMethods(doc, {
      llm: fakeLlm(() => {
        throw new LlmFatalError('api key 无效', 401)
      }),
    })
    assert.equal(report.degraded, true)
    assert.equal(report.specs.length, 0)
    assert.ok(report.degradeReason?.includes('LLM 抽取失败'))
  })

  it('LLM 返回坏 JSON → degraded=true,原因可读', async () => {
    const report = await extractMethods(doc, { llm: fakeLlm(() => 'not json at all') })
    assert.equal(report.degraded, true)
    assert.ok(report.degradeReason?.includes('不是合法 JSON'))
  })

  it('JSON 结构不对(没有 methods 数组)→ degraded=true', async () => {
    const report = await extractMethods(doc, { llm: fakeLlm(() => '{"foo": 1}') })
    assert.equal(report.degraded, true)
  })
})
