/**
 * 模块 A · 检索的单测。
 *
 * 重点不是「能不能搜到」,而是**搜不到/搜坏了的时候行为是否诚实**:
 * 精筛超时要降级并标注、模型编造 id 要被白名单拦掉、空候选不许白花一次模型调用。
 * 这三件事都不会在手动点一遍时暴露,只会在演示现场暴露。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { LlmClient, LlmRequest } from '../../src/services/llm/types.ts'
import {
  buildManifest,
  COARSE_LIMIT,
  createNoteSelector,
  FINAL_LIMIT,
  parseSelectedIds,
  retrieve,
} from '../../src/services/knowledge/select.ts'
import type { KnowledgeStore, NoteHit, NoteSelector } from '../../src/services/knowledge/types.ts'

// ─────────────────────────────────────────────────────────────
// 构造
// ─────────────────────────────────────────────────────────────

function hit(index: number, overrides: Partial<NoteHit> = {}): NoteHit {
  return {
    noteId: `arxiv:2210.03629#p${index + 1}#a${String(index).padStart(5, '0')}`,
    paperId: 'arxiv:2210.03629',
    page: index + 1,
    kind: 'method',
    description: `第 ${index + 1} 条知识页描述了 ReAct 的一个方法细节`,
    score: 10 - index,
    ...overrides,
  }
}

function hits(count: number): NoteHit[] {
  return Array.from({ length: count }, (_unused, index) => hit(index))
}

interface StubStore extends KnowledgeStore {
  readonly calls: { scan: number; select: number; lastScanLimit: number | null }
}

/**
 * 内存 stub。`src/services/knowledge/types.ts` 的注释说得很清楚:
 * 接口保留的原因之一就是「单测可以注入内存 stub,不必碰文件系统」。
 */
function stubStore(
  candidates: readonly NoteHit[],
  options: { readonly selectorImpl?: NoteSelector; readonly selectThrows?: Error } = {},
): StubStore {
  const calls = { scan: 0, select: 0, lastScanLimit: null as number | null }
  return {
    calls,
    async put() {},
    async get(noteId) {
      const found = candidates.find((item) => item.noteId === noteId)
      return found === undefined
        ? null
        : {
            noteId: found.noteId,
            paperId: found.paperId,
            page: found.page,
            kind: found.kind,
            description: found.description,
            text: `${found.description}。这是正文。`,
            evidence: { quote: 'We propose ReAct, a general paradigm.', page: found.page },
            confidence: 'high',
            createdAt: '2026-10-29T00:00:00.000Z',
          }
    },
    async scan(_query, limit = 8) {
      calls.scan += 1
      calls.lastScanLimit = limit
      return candidates.slice(0, limit)
    },
    async select(_query, list, selector) {
      calls.select += 1
      if (options.selectThrows !== undefined) throw options.selectThrows
      const chosen = await selector(_query, list)
      // 与 LocalMarkdownStore.select 一致:按**模型给的顺序**返回,并做白名单过滤
      const byId = new Map(list.map((item) => [item.noteId, item]))
      const result: NoteHit[] = []
      for (const noteId of chosen) {
        const found = byId.get(noteId)
        if (found !== undefined) result.push(found)
      }
      return result
    },
    async link() {},
    async index() {
      return ''
    },
    async listPaperIds() {
      return ['arxiv:2210.03629']
    },
  }
}

function fakeLlm(reply: string, captured: { request: LlmRequest | null } = { request: null }): LlmClient {
  return {
    async turn() {
      throw new Error('检索测试不应调用 turn()')
    },
    async sideQuery(request) {
      captured.request = { ...request, tools: [] }
      return reply
    },
  }
}

const SIGNAL = new AbortController().signal

// ─────────────────────────────────────────────────────────────
// 1. 清单渲染
// ─────────────────────────────────────────────────────────────

describe('select · buildManifest', () => {
  it('每条带 kind / noteId / 页码 / description —— 模型靠这四样判断相关性', () => {
    const manifest = buildManifest(hits(2))
    assert.match(manifest.text, /\[method\] arxiv:2210\.03629#p1#a00000 \| p1 \| /)
    assert.equal(manifest.included, 2)
    assert.equal(manifest.truncated, false)
  })

  it('超长清单按条截断,并明确告知还有多少条没列出', () => {
    const manifest = buildManifest(hits(10), 160)
    assert.ok(manifest.included < 10, `实际列出 ${manifest.included} 条`)
    assert.equal(manifest.truncated, true)
    assert.match(manifest.text, /还有 \d+ 条未列出/)
  })

  it('空候选给出空清单而不是抛错', () => {
    const manifest = buildManifest([])
    assert.equal(manifest.text, '')
    assert.equal(manifest.included, 0)
    assert.equal(manifest.truncated, false)
  })

  it('清单里不含正文 —— 正文会把 prompt 撑大十倍却不提高判断质量', () => {
    const manifest = buildManifest(hits(3))
    assert.ok(!manifest.text.includes('这是正文'))
  })
})

// ─────────────────────────────────────────────────────────────
// 2. 返回解析
// ─────────────────────────────────────────────────────────────

describe('select · parseSelectedIds', () => {
  it('标准形状 {selected:[...]}', () => {
    assert.deepEqual(parseSelectedIds('{"selected":["a","b"]}'), ['a', 'b'])
  })

  it('兼容 note_ids / noteIds / ids 这些模型顺手写出的字段名', () => {
    assert.deepEqual(parseSelectedIds('{"note_ids":["a"]}'), ['a'])
    assert.deepEqual(parseSelectedIds('{"noteIds":["b"]}'), ['b'])
    assert.deepEqual(parseSelectedIds('{"ids":["c"]}'), ['c'])
  })

  it('裸数组也能解析', () => {
    assert.deepEqual(parseSelectedIds('["a","b"]'), ['a', 'b'])
  })

  it('去重并保持模型给的顺序', () => {
    assert.deepEqual(parseSelectedIds('{"selected":["b","a","b"]}'), ['b', 'a'])
  })

  it('非字符串项被跳过,不让脏数据进结果', () => {
    assert.deepEqual(parseSelectedIds('{"selected":["a",1,null,{"x":1},"b"]}'), ['a', 'b'])
  })

  it('不是 JSON 时抛错 —— 静默返回空数组会把「模型挂了」伪装成「没有相关内容」', () => {
    assert.throws(() => parseSelectedIds('我觉得第二条最相关'), /不是合法 JSON/)
  })

  it('空内容抛错', () => {
    assert.throws(() => parseSelectedIds('   '), /空内容/)
  })

  it('JSON 里找不到数组字段时抛错', () => {
    assert.throws(() => parseSelectedIds('{"answer":"a"}'), /找不到数组字段/)
  })
})

// ─────────────────────────────────────────────────────────────
// 3. 精筛器
// ─────────────────────────────────────────────────────────────

describe('select · createNoteSelector', () => {
  it('把候选清单交给模型,并声明最多选几条', async () => {
    const captured: { request: LlmRequest | null } = { request: null }
    const selector = createNoteSelector(fakeLlm('{"selected":[]}', captured), { signal: SIGNAL, maxItems: 3 })
    await selector('React 怎么做的', hits(2))

    const request = captured.request
    assert.ok(request !== null, '没有调用 sideQuery')
    assert.equal(request.jsonObject, true)
    const user = request.messages.map((message) => message.content ?? '').join('\n')
    assert.match(user, /React 怎么做的/)
    assert.match(user, /最多选 3 条/)
  })

  it('模型编造的 id 被拦掉,只留候选里真实存在的', async () => {
    const candidates = hits(2)
    const selector = createNoteSelector(
      fakeLlm('{"selected":["arxiv:9999.99999#p1#ffffff","' + (candidates[1]?.noteId ?? '') + '"]}'),
      { signal: SIGNAL },
    )
    assert.deepEqual(await selector('query', candidates), [candidates[1]?.noteId])
  })

  it('超过 maxItems 的部分被截断', async () => {
    const candidates = hits(5)
    const ids = candidates.map((item) => item.noteId)
    const selector = createNoteSelector(fakeLlm(JSON.stringify({ selected: ids })), {
      signal: SIGNAL,
      maxItems: 2,
    })
    assert.equal((await selector('query', candidates)).length, 2)
  })

  it('没有候选时不调用模型(省一次 token)', async () => {
    const captured: { request: LlmRequest | null } = { request: null }
    const selector = createNoteSelector(fakeLlm('{"selected":[]}', captured), { signal: SIGNAL })
    assert.deepEqual(await selector('query', []), [])
    assert.equal(captured.request, null)
  })

  it('模型调用失败时把错误抛出去 —— 由 retrieve 决定怎么降级', async () => {
    const failing: LlmClient = {
      async turn() {
        throw new Error('unused')
      },
      async sideQuery() {
        throw new Error('503 Service Unavailable')
      },
    }
    const selector = createNoteSelector(failing, { signal: SIGNAL })
    await assert.rejects(() => selector('query', hits(2)), /503/)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. 两段式编排
// ─────────────────────────────────────────────────────────────

describe('retrieve · 粗筛短路', () => {
  it('零命中时不调精筛,返回明确的空结果', async () => {
    const store = stubStore([])
    const result = await retrieve(store, '不存在的词', { selector: async () => [] })

    assert.equal(result.hits.length, 0)
    assert.equal(result.stage, 'coarse')
    assert.equal(store.calls.select, 0)
    assert.match(result.note ?? '', /没有命中/)
  })

  it('没注入 selector 时返回关键词排序前 N 条(无 key 也能演示)', async () => {
    const result = await retrieve(stubStore(hits(20)), 'query', { finalLimit: 5 })

    assert.equal(result.hits.length, 5)
    assert.equal(result.stage, 'coarse')
    assert.match(result.note ?? '', /未注入精筛器/)
  })

  it('候选不超过上限时跳过精筛 —— 精筛不会改变结果,只会多花一次钱', async () => {
    const store = stubStore(hits(3))
    const result = await retrieve(store, 'query', { selector: async () => [hit(0).noteId], finalLimit: 8 })

    assert.equal(store.calls.select, 0)
    assert.equal(result.hits.length, 3)
    assert.match(result.note ?? '', /跳过精筛/)
  })

  it('粗筛上限默认 50,不会把几百条全塞给模型', async () => {
    const store = stubStore(hits(80))
    await retrieve(store, 'query', { selector: async () => [] })
    assert.equal(store.calls.lastScanLimit, COARSE_LIMIT)
  })

  it('粗筛上限被夹到 200 以内(防止调用方传 1e9 把内存打爆)', async () => {
    const store = stubStore(hits(5))
    await retrieve(store, 'query', { coarseLimit: 1_000_000 })
    assert.equal(store.calls.lastScanLimit, 200)
  })
})

describe('retrieve · 精筛', () => {
  it('采纳模型的选择,并保持模型给的顺序', async () => {
    // 候选必须多于 finalLimit(=8),否则会被「候选不多就别精筛」的短路拦住
    const candidates = hits(10)
    const store = stubStore(candidates)
    const picked = [candidates[4]?.noteId ?? '', candidates[1]?.noteId ?? '']

    const result = await retrieve(store, 'query', { selector: async () => picked })

    assert.equal(result.stage, 'refined')
    assert.deepEqual(
      result.hits.map((item) => item.noteId),
      picked,
    )
    assert.equal(result.note, null)
  })

  it('精筛结果超过 finalLimit 时截断', async () => {
    const candidates = hits(10)
    const store = stubStore(candidates)
    const result = await retrieve(store, 'query', {
      finalLimit: 3,
      selector: async () => candidates.map((item) => item.noteId),
    })
    assert.equal(result.hits.length, 3)
  })

  it('模型说「没有相关的」就返回空,不拿关键词结果凑数', async () => {
    const result = await retrieve(stubStore(hits(10)), 'query', { selector: async () => [] })

    assert.equal(result.hits.length, 0)
    assert.equal(result.stage, 'refined')
    assert.match(result.note ?? '', /无相关条目/)
  })

  it('精筛抛错时降级为关键词排序,并如实标注 —— 不假装精筛成功', async () => {
    const store = stubStore(hits(10), { selectThrows: new Error('side query 超时') })
    const result = await retrieve(store, 'query', { selector: async () => [] })

    assert.equal(result.stage, 'refined_fallback')
    assert.equal(result.hits.length, FINAL_LIMIT)
    assert.match(result.note ?? '', /降级/)
    assert.match(result.note ?? '', /side query 超时/)
  })

  it('返回粗筛命中总数,便于区分「库是空的」与「被精筛筛掉了」', async () => {
    const result = await retrieve(stubStore(hits(12)), 'query', { selector: async () => [] })
    assert.equal(result.coarseCount, 12)
    assert.ok(result.coarseMs >= 0)
  })
})
