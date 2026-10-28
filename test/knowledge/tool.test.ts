/**
 * 模块 A · `knowledge_search` 工具的单测。
 *
 * 这一层的价值在于「模型能不能据此引用」,所以断言的重点是**返回里有没有锚点**:
 * noteId + page + 原句。只给一段摘要的话,模型引用时会自己编一句像原文的话。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  createKnowledgeSearchTool,
  KNOWLEDGE_SEARCH_TOOL_NAME,
  type KnowledgeSearchOutput,
} from '../../src/services/knowledge/tool.ts'
import type { KnowledgeStore, NoteHit } from '../../src/services/knowledge/types.ts'
import { invokeTool, type ToolContext } from '../../src/tools/types.ts'

// ─────────────────────────────────────────────────────────────
// 构造
// ─────────────────────────────────────────────────────────────

const QUOTE = 'We propose ReAct, a general paradigm that combines reasoning traces with task specific actions.'

function hit(index: number): NoteHit {
  return {
    noteId: `arxiv:2210.03629#p${index + 1}#a${String(index).padStart(5, '0')}`,
    paperId: 'arxiv:2210.03629',
    page: index + 1,
    kind: 'method',
    description: `ReAct 的第 ${index + 1} 个方法细节`,
    score: 5 - index,
  }
}

function stubStore(candidates: readonly NoteHit[]): KnowledgeStore {
  return {
    async put() {},
    async get(noteId) {
      const found = candidates.find((item) => item.noteId === noteId)
      if (found === undefined) return null
      return {
        noteId: found.noteId,
        paperId: found.paperId,
        page: found.page,
        kind: found.kind,
        description: found.description,
        text: QUOTE,
        evidence: { quote: QUOTE, page: found.page },
        confidence: 'high',
        createdAt: '2026-10-29T00:00:00.000Z',
      }
    },
    async scan(_query, limit = 8) {
      return candidates.slice(0, limit)
    },
    async select(_query, list, selector) {
      const chosen = await selector(_query, list)
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

const CTX: ToolContext = {
  signal: new AbortController().signal,
  mode: 'live',
  trace: { write: () => {} },
  cache: { get: async () => null, set: async () => {} },
}

// ─────────────────────────────────────────────────────────────
// 1. 契约
// ─────────────────────────────────────────────────────────────

describe('tool · knowledge_search 契约', () => {
  it('工具名是 snake_case 且只含 [a-zA-Z0-9_](DeepSeek 的硬限制)', () => {
    assert.equal(KNOWLEDGE_SEARCH_TOOL_NAME, 'knowledge_search')
    assert.match(KNOWLEDGE_SEARCH_TOOL_NAME, /^[a-zA-Z0-9_]+$/)
  })

  it('只读且可并发 —— 检索没有副作用', () => {
    const tool = createKnowledgeSearchTool({ store: stubStore([]) })
    assert.equal(tool.isReadOnly?.({ query: 'x' }), true)
    assert.equal(tool.isConcurrencySafe?.({ query: 'x' }), true)
  })

  it('描述里写清「什么时候该用」,否则模型不会调它', () => {
    const tool = createKnowledgeSearchTool({ store: stubStore([]) })
    const description = tool.description({ query: 'x' })
    assert.match(String(description), /知识库/)
    assert.match(String(description), /适合/)
  })
})

// ─────────────────────────────────────────────────────────────
// 2. 命中
// ─────────────────────────────────────────────────────────────

describe('tool · 命中', () => {
  it('返回 noteId + 页码 + 原句,summary 里带锚点', async () => {
    const candidates = [hit(0), hit(1)]
    const tool = createKnowledgeSearchTool({ store: stubStore(candidates) })
    const { result } = await invokeTool(tool, { query: 'ReAct 怎么做' }, CTX)

    assert.equal(result.ok, true)
    if (!result.ok) return
    const output = result.data as KnowledgeSearchOutput
    assert.equal(output.hits.length, 2)

    const first = output.hits[0]
    assert.ok(first !== undefined)
    assert.equal(first.noteId, candidates[0]?.noteId)
    assert.equal(first.page, 1)
    assert.equal(first.quote, QUOTE)
    assert.match(result.summary, /arxiv:2210\.03629#p1#a00000\(p1\)/)
  })

  it('limit 生效,且不会超过工具声明的上限', async () => {
    const candidates = Array.from({ length: 10 }, (_unused, index) => hit(index))
    const tool = createKnowledgeSearchTool({ store: stubStore(candidates) })

    const one = await invokeTool(tool, { query: 'q', limit: 1 }, CTX)
    assert.equal(one.result.ok, true)
    if (!one.result.ok) return
    assert.equal((one.result.data as KnowledgeSearchOutput).hits.length, 1)

    // 超过 20 的参数被 schema 拦住,而不是悄悄执行
    const tooMany = await invokeTool(tool, { query: 'q', limit: 999 }, CTX)
    assert.equal(tooMany.result.ok, false)
  })

  it('quote 过长时截断,不把整段正文塞回模型', async () => {
    const longStore = stubStore([hit(0)])
    const original = longStore.get.bind(longStore)
    longStore.get = async (noteId: string) => {
      const note = await original(noteId)
      return note === null ? null : { ...note, evidence: { ...note.evidence, quote: 'A'.repeat(600) } }
    }

    const tool = createKnowledgeSearchTool({ store: longStore })
    const { result } = await invokeTool(tool, { query: 'q' }, CTX)
    assert.equal(result.ok, true)
    if (!result.ok) return
    const quote = (result.data as KnowledgeSearchOutput).hits[0]?.quote ?? ''
    assert.ok(quote.length <= 241, `quote 长度 ${quote.length}`)
    assert.match(quote, /…$/)
  })
})

// ─────────────────────────────────────────────────────────────
// 3. 未命中与降级
// ─────────────────────────────────────────────────────────────

describe('tool · 未命中', () => {
  it('没命中时仍是成功结果,但明确告诉模型「不要凭空引用」', async () => {
    const tool = createKnowledgeSearchTool({ store: stubStore([]) })
    const { result } = await invokeTool(tool, { query: '量子引力' }, CTX)

    assert.equal(result.ok, true)
    if (!result.ok) return
    const output = result.data as KnowledgeSearchOutput
    assert.equal(output.hits.length, 0)
    assert.match(result.summary, /未命中/)
    assert.match(result.summary, /不要凭空引用/)
  })

  it('精筛失败时 summary 如实标注降级,不假装是精筛结果', async () => {
    const candidates = Array.from({ length: 12 }, (_unused, index) => hit(index))
    const tool = createKnowledgeSearchTool({
      store: stubStore(candidates),
      selector: async () => {
        throw new Error('模型 503')
      },
    })

    const { result } = await invokeTool(tool, { query: 'q' }, CTX)
    assert.equal(result.ok, true)
    if (!result.ok) return
    const output = result.data as KnowledgeSearchOutput
    assert.equal(output.stage, 'refined_fallback')
    assert.match(result.summary, /降级/)
  })

  it('空查询被 schema 拦住,不进业务逻辑', async () => {
    const tool = createKnowledgeSearchTool({ store: stubStore([]) })
    const { result } = await invokeTool(tool, { query: '' }, CTX)
    assert.equal(result.ok, false)
  })

  it('多余字段被 strictObject 拒绝 —— 防止模型塞自己发明的参数', async () => {
    const tool = createKnowledgeSearchTool({ store: stubStore([]) })
    const { result } = await invokeTool(tool, { query: 'q', topK: 3 }, CTX)
    assert.equal(result.ok, false)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. knowledge_hit 上报(三面板「知识库」面板的数据来源)
// ─────────────────────────────────────────────────────────────

describe('tool · 命中上报', () => {
  /** 只记录 knowledge_hit,别的类型收不到 —— 这个口子就只该发一种事件 */
  function recorder(): {
    readonly events: { noteId: string; paperId: string; page: number; description: string }[]
    emit(event: { type: 'knowledge_hit'; noteId: string; paperId: string; page: number; description: string }): void
  } {
    const events: { noteId: string; paperId: string; page: number; description: string }[] = []
    return {
      events,
      emit(event) {
        const { type: _type, ...rest } = event
        events.push(rest)
      },
    }
  }

  it('每条命中各上报一次,字段带齐锚点(UI 要据此定位原文)', async () => {
    const sink = recorder()
    const tool = createKnowledgeSearchTool({ store: stubStore([hit(0), hit(1)]), events: sink })
    const { result } = await invokeTool(tool, { query: 'reasoning' }, CTX)

    assert.equal(result.ok, true)
    assert.equal(sink.events.length, 2)
    assert.deepEqual(sink.events[0], {
      noteId: 'arxiv:2210.03629#p1#a00000',
      paperId: 'arxiv:2210.03629',
      page: 1,
      description: 'ReAct 的第 1 个方法细节',
    })
  })

  it('零命中时一条都不发 —— 面板不该被「未命中」点亮', async () => {
    const sink = recorder()
    const tool = createKnowledgeSearchTool({ store: stubStore([]), events: sink })
    await invokeTool(tool, { query: 'reasoning' }, CTX)
    assert.equal(sink.events.length, 0)
  })

  it('上报口抛错也不让工具失败 —— 展示层的问题不该污染检索结果', async () => {
    const tool = createKnowledgeSearchTool({
      store: stubStore([hit(0)]),
      events: {
        emit() {
          throw new Error('UI 挂了')
        },
      },
    })
    const { result } = await invokeTool(tool, { query: 'reasoning' }, CTX)
    assert.equal(result.ok, true)
  })

  it('不传 events 时完全静默(单测 / 批处理路径)', async () => {
    const tool = createKnowledgeSearchTool({ store: stubStore([hit(0)]) })
    const { result } = await invokeTool(tool, { query: 'reasoning' }, CTX)
    assert.equal(result.ok, true)
  })
})
