/**
 * 契约自检。**这组测试的作用是证明契约可用,而不是测业务逻辑。**
 *
 * 运  行:npm test
 * 要  求:任何同学改动契约文件后,此文件必须仍然通过;若不通过说明破坏性变更,
 *       必须先走 PR 评审。
 *
 * 不花任何 API 额度 —— 全部是纯函数与内存对象。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { z } from 'zod'

import {
  AGENT_EVENT_TYPES,
  createEventBus,
  fromSseFrame,
  toSseFrame,
  type AgentEvent,
} from '../src/ui/events.ts'
import {
  buildTool,
  invokeTool,
  toolFail,
  toolOk,
  type ToolContext,
  type ToolResult,
} from '../src/tools/types.ts'
import {
  LOOP_DEFAULTS,
  msg,
  parseToolArguments,
  partitionToolCalls,
  type ToolCall,
} from '../src/agent/types.ts'
import { INDEX_LIMITS, validateNote, type AtomicNote } from '../src/services/knowledge/types.ts'
import {
  MIN_FAILURE_MODES,
  SKILL_SECTION_KEYS,
  validateSkillStructure,
  type Skill,
} from '../src/services/skills/types.ts'
import {
  gateByParseQuality,
  checkParagraphAnchors,
  type PaperDoc,
} from '../src/services/paper/types.ts'

// ─────────────────────────────────────────────────────────────
// 测试用的 ctx 桩
// ─────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    signal: new AbortController().signal,
    mode: 'replay',
    trace: { write: () => {} },
    cache: {
      get: async () => null,
      set: async () => {},
    },
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────
// 契约 #1 · 事件总线
// ─────────────────────────────────────────────────────────────

describe('契约 #1 事件总线', () => {
  it('声明了 9 种事件类型', () => {
    assert.equal(AGENT_EVENT_TYPES.length, 9)
  })

  it('能把事件送达监听器', () => {
    const bus = createEventBus()
    const received: AgentEvent[] = []
    bus.on((e) => received.push(e))

    bus.emit({ type: 'text_delta', text: 'hi' })

    assert.equal(received.length, 1)
    assert.deepEqual(received[0], { type: 'text_delta', text: 'hi' })
  })

  it('一个监听器抛错不影响其他监听器,也不向外抛(薄壳降级的关键)', () => {
    const bus = createEventBus()
    const received: AgentEvent[] = []

    bus.on(() => {
      throw new Error('渲染器炸了')
    })
    bus.on((e) => received.push(e))

    // 不应该 throw
    bus.emit({ type: 'progress', step: 'x', done: 1, total: 2 })

    assert.equal(received.length, 1, '第二个监听器必须仍然收到事件')
  })

  it('退订后不再收到事件', () => {
    const bus = createEventBus()
    let count = 0
    const off = bus.on(() => {
      count += 1
    })

    bus.emit({ type: 'text_delta', text: 'a' })
    off()
    bus.emit({ type: 'text_delta', text: 'b' })

    assert.equal(count, 1)
    assert.equal(bus.listenerCount(), 0)
  })

  it('SSE 帧可无损往返', () => {
    const event: AgentEvent = {
      type: 'run_end',
      reason: 'completed',
      ms: 1234,
      tokens: { input: 10, output: 20 },
      toolCalls: 3,
    }
    const frame = toSseFrame(event)
    assert.ok(frame.startsWith('data: '))
    assert.ok(frame.endsWith('\n\n'))
    assert.deepEqual(fromSseFrame(frame), event)
  })
})

// ─────────────────────────────────────────────────────────────
// 契约 #2 · 工具契约
// ─────────────────────────────────────────────────────────────

describe('契约 #2 工具契约', () => {
  const echoTool = buildTool({
    name: 'echo',
    description: (input) => `回显 ${String((input as { text: string }).text)}`,
    inputSchema: z.strictObject({ text: z.string().min(1) }),
    async call(input) {
      return toolOk({ text: input.text }, `echoed ${input.text}`)
    },
  })

  it('buildTool 补齐 fail-closed 默认值', () => {
    // 没写 isReadOnly / isConcurrencySafe / isDestructive → 必须全部按最保守值
    assert.equal(echoTool.isReadOnly?.({ text: 'a' }), false, '不写就算可写')
    assert.equal(echoTool.isConcurrencySafe?.({ text: 'a' }), false, '不写就算不可并发')
    assert.equal(echoTool.isDestructive?.({ text: 'a' }), false)
    assert.equal(echoTool.maxResultSizeChars, 20_000)
  })

  it('schema 拒绝多余字段(strictObject)', async () => {
    const { result } = await invokeTool(echoTool, { text: 'a', extra: 1 }, makeCtx())
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /参数校验失败/)
  })

  it('正常调用返回成功', async () => {
    const { result } = await invokeTool(echoTool, { text: 'hello' }, makeCtx())
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.summary, 'echoed hello')
  })

  it('validateInput 失败时不进入 call()', async () => {
    let called = false
    const guarded = buildTool({
      name: 'guarded',
      description: () => 'x',
      inputSchema: z.strictObject({ p: z.string() }),
      validateInput: (input) =>
        input.p.startsWith('ok') ? { ok: true } : { ok: false, message: 'p 必须以 ok 开头' },
      async call() {
        called = true
        return toolOk(null, 'done')
      },
    })

    const { result } = await invokeTool(guarded, { p: 'bad' }, makeCtx())

    assert.equal(result.ok, false)
    assert.equal(called, false, '语义校验失败后不得有副作用')
    if (!result.ok) assert.match(result.error, /必须以 ok 开头/)
  })

  it('call() 内部 throw 被兜底成失败,不向外抛', async () => {
    const bomb = buildTool({
      name: 'bomb',
      description: () => 'x',
      inputSchema: z.strictObject({}),
      async call() {
        throw new Error('内部炸了')
      },
    })

    const { result } = await invokeTool(bomb, {}, makeCtx())

    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /工具内部异常.*内部炸了/)
  })

  it('summary 超长被截断,data 不被截断', async () => {
    const long = buildTool({
      name: 'long',
      description: () => 'x',
      inputSchema: z.strictObject({}),
      maxResultSizeChars: 10,
      async call() {
        return toolOk({ keep: 'this is data' }, 'x'.repeat(100))
      },
    })

    const { result } = await invokeTool(long, {}, makeCtx())

    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.summary.length, 11, '10 字符 + 省略号')
      assert.deepEqual(result.data, { keep: 'this is data' }, 'data 必须完整')
    }
  })

  it('toolFail / toolOk 构造正确', () => {
    const ok: ToolResult = toolOk(1, 'fine')
    const bad: ToolResult = toolFail('boom', '再试一次')
    assert.equal(ok.ok, true)
    assert.equal(bad.ok, false)
  })
})

// ─────────────────────────────────────────────────────────────
// 契约 #3 · 编排层
// ─────────────────────────────────────────────────────────────

describe('契约 #3 编排层', () => {
  const call = (args: string): ToolCall => ({
    id: 'call_1',
    type: 'function',
    function: { name: 'demo', arguments: args },
  })

  it('parseToolArguments 解析合法 JSON', () => {
    const parsed = parseToolArguments(call('{"a":1,"b":"x"}'))
    assert.equal(parsed.ok, true)
    if (parsed.ok) assert.deepEqual(parsed.value, { a: 1, b: 'x' })
  })

  it('parseToolArguments 对非法 JSON 返回结构化错误而不抛(红线 ③)', () => {
    const parsed = parseToolArguments(call('{"a":'))
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.match(parsed.error, /不是合法 JSON/)
  })

  it('parseToolArguments 拒绝非对象 JSON', () => {
    for (const bad of ['[1,2]', '"str"', '42', 'null']) {
      const parsed = parseToolArguments(call(bad))
      assert.equal(parsed.ok, false, `${bad} 应被拒绝`)
    }
  })

  it('parseToolArguments 把空参数视为空对象', () => {
    const parsed = parseToolArguments(call(''))
    assert.equal(parsed.ok, true)
    if (parsed.ok) assert.deepEqual(parsed.value, {})
  })

  it('msg.assistant 在有工具调用时带上 tool_calls', () => {
    const withCalls = msg.assistant(null, [call('{}')])
    assert.equal(withCalls.role, 'assistant')
    if (withCalls.role === 'assistant') assert.equal(withCalls.tool_calls?.length, 1)

    const plain = msg.assistant('hi')
    if (plain.role === 'assistant') {
      assert.equal(plain.content, 'hi')
      assert.ok(!('tool_calls' in plain), 'content 存在时不应强行带 tool_calls 字段')
    }
  })

  it('工具结果回填是独立的 role:tool 消息(不是 user)', () => {
    const message = msg.tool('call_1', '结果文本')
    assert.equal(message.role, 'tool')
    if (message.role === 'tool') {
      assert.equal(message.tool_call_id, 'call_1')
      assert.equal(message.content, '结果文本')
    }
  })

  it('partitionToolCalls 只把连续的可并发调用合批', () => {
    type C = { name: string }
    const calls: C[] = [{ name: 'a' }, { name: 'b' }, { name: 'w' }, { name: 'c' }]
    const safe = (c: C): boolean => c.name !== 'w'

    const batches = partitionToolCalls(calls, safe, 3)

    assert.deepEqual(batches, [
      [{ name: 'a' }, { name: 'b' }],
      [{ name: 'w' }],
      [{ name: 'c' }],
    ])
  })

  it('partitionToolCalls 遵守并发上限', () => {
    const calls = Array.from({ length: 7 }, (_, i) => i)
    const batches = partitionToolCalls(calls, () => true, 3)
    assert.equal(batches.length, 3, '7 个按上限 3 切成 3+3+1')
    assert.deepEqual(
      batches.map((b) => b.length),
      [3, 3, 1],
    )
  })

  it('默认并发上限是 3(源码默认 10,我们按现场网络收到 3)', () => {
    assert.equal(LOOP_DEFAULTS.maxConcurrency, 3)
  })
})

// ─────────────────────────────────────────────────────────────
// 契约 #4-A · 知识库
// ─────────────────────────────────────────────────────────────

describe('契约 #4-A 知识库', () => {
  const baseNote: AtomicNote = {
    noteId: 'p1#p7#a91f3e',
    paperId: 'p1',
    page: 7,
    kind: 'result',
    description: '低资源 RAG 在 XNLI 上比基线提升 4.2 个点',
    text: '正文……',
    evidence: { quote: '原文原句', page: 7 },
    confidence: 'high',
    createdAt: new Date().toISOString(),
  }

  it('合格知识页通过校验', () => {
    assert.deepEqual(validateNote(baseNote), { ok: true })
  })

  it('缺少页码锚点被拒绝(数据铁律 #1)', () => {
    const bad = { ...baseNote, page: 0 }
    const result = validateNote(bad)
    assert.equal(result.ok, false)
    if (!result.ok) assert.ok(result.reasons.some((r) => r.includes('数据铁律 #1')))
  })

  it('paperId 为空被拒绝', () => {
    const bad = { ...baseNote, paperId: '  ' }
    assert.equal(validateNote(bad).ok, false)
  })

  it('page 与 evidence.page 不一致被拒绝', () => {
    const bad = { ...baseNote, evidence: { quote: '原文', page: 9 } }
    const result = validateNote(bad)
    assert.equal(result.ok, false)
    if (!result.ok) assert.ok(result.reasons.some((r) => r.includes('不一致')))
  })

  it('description 过短被拒绝(无法召回)', () => {
    assert.equal(validateNote({ ...baseNote, description: '短' }).ok, false)
  })

  it('索引截断上限比源码更保守', () => {
    assert.ok(INDEX_LIMITS.maxLines <= 200)
    assert.ok(INDEX_LIMITS.maxBytes <= 25_000)
  })
})

// ─────────────────────────────────────────────────────────────
// 契约 #4-B · 技能库
// ─────────────────────────────────────────────────────────────

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    skillId: 'low-resource-rag',
    name: '低资源语言 RAG 研究',
    domain: 'NLP',
    version: '1.0',
    description: '低资源语言检索增强研究的方法与陷阱',
    whenToUse: '当用户询问低资源语言的检索增强或跨语言检索时使用',
    loadWhen: { keywords: ['低资源'], taskTypes: ['literature_review'] },
    allowedTools: ['knowledge_search'],
    status: 'needs_review',
    sections: {
      domainMap: [{ concept: 'RAG' }],
      workflow: [{ stage: '明确边界', input: '问题', action: '确认语种', criteria: '未给出语种必须先问' }],
      toolMapping: [{ method: '检索', tool: 'knowledge_search' }],
      failureModes: ['把跨语言检索和跨语言生成混淆', '忽略数据泄漏', '把 BLEU 当任务解决'],
      terminology: [{ term: 'alignment', disambiguation: '嵌入对齐 vs 偏好对齐' }],
      evidenceIndex: [{ claim: '提升 4.2 点', noteId: 'p1#p7#a91f3e' }],
      negativeConstraints: ['不要在缺 baseline 时给提升幅度'],
    },
    ...overrides,
  }
}

describe('契约 #4-B 技能库', () => {
  it('七节结构齐全时通过', () => {
    const result = validateSkillStructure(makeSkill())
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.equal(SKILL_SECTION_KEYS.length, 7)
  })

  it('缺节被判不合格并标出缺了哪节', () => {
    const skill = makeSkill()
    const broken: Skill = {
      ...skill,
      sections: { ...skill.sections, failureModes: [] },
    }
    const result = validateSkillStructure(broken)
    assert.equal(result.ok, false)
    assert.deepEqual(result.missing, ['failureModes'])
  })

  it('失败模式少于 3 条被判不合格(数据铁律)', () => {
    const skill = makeSkill()
    const broken: Skill = {
      ...skill,
      sections: { ...skill.sections, failureModes: ['只有一条'] },
    }
    const result = validateSkillStructure(broken)
    assert.equal(result.ok, false)
    assert.ok(result.problems.some((p) => p.includes(`至少要 ${MIN_FAILURE_MODES} 条`)))
  })

  it('标准流程缺判据被判不合格', () => {
    const skill = makeSkill()
    const broken: Skill = {
      ...skill,
      sections: {
        ...skill.sections,
        workflow: [{ stage: 's', input: 'i', action: 'a', criteria: '' }],
      },
    }
    const result = validateSkillStructure(broken)
    assert.equal(result.ok, false)
    assert.ok(result.problems.some((p) => p.includes('判据')))
  })

  it('status=active 但无审核人被拒(数据铁律 #4)', () => {
    const skill = makeSkill({ status: 'active' })
    const result = validateSkillStructure(skill)
    assert.equal(result.ok, false)
    assert.ok(result.problems.some((p) => p.includes('数据铁律 #4')))
  })

  it('引用了不存在的工具被拒', () => {
    const result = validateSkillStructure(makeSkill(), { knownTools: ['other_tool'] })
    assert.equal(result.ok, false)
    assert.ok(result.problems.some((p) => p.includes('不存在的工具')))
  })
})

// ─────────────────────────────────────────────────────────────
// 契约 #5 · 共享底座
// ─────────────────────────────────────────────────────────────

describe('契约 #5 共享底座', () => {
  const makeDoc = (pagesParsed: number, pagesTotal: number): PaperDoc => ({
    paperId: 'p1',
    title: 't',
    authors: [],
    year: 2024,
    abstract: 'a',
    sections: [
      {
        heading: 'Intro',
        level: 1,
        paragraphs: [{ text: '段落一', page: 1 }],
        tables: [],
        figures: [],
      },
    ],
    references: [],
    parseQuality: { pagesParsed, pagesTotal, hasOcr: false },
  })

  it('解析率达标可用', () => {
    const verdict = gateByParseQuality({ pagesParsed: 8, pagesTotal: 10, hasOcr: false })
    assert.equal(verdict.status, 'usable')
  })

  it('解析率低于 0.7 被隔离(数据铁律 #3)', () => {
    const verdict = gateByParseQuality({ pagesParsed: 6, pagesTotal: 10, hasOcr: false })
    assert.equal(verdict.status, 'quarantined')
    if (verdict.status === 'quarantined') assert.match(verdict.reason, /低于阈值/)
  })

  it('pagesTotal 非法被隔离,不抛异常', () => {
    const verdict = gateByParseQuality({ pagesParsed: 1, pagesTotal: 0, hasOcr: false })
    assert.equal(verdict.status, 'quarantined')
  })

  it('段落全部带页码时锚点检查通过', () => {
    assert.deepEqual(checkParagraphAnchors(makeDoc(10, 10)), [])
  })

  it('段落缺页码被检出', () => {
    const doc = makeDoc(10, 10)
    const broken: PaperDoc = {
      ...doc,
      sections: [
        {
          ...doc.sections[0]!,
          paragraphs: [{ text: '没有页码', page: 0 }],
        },
      ],
    }
    const problems = checkParagraphAnchors(broken)
    assert.ok(problems.some((p) => p.includes('缺少有效 page')))
  })
})
