/**
 * #39 离线回放 —— LLM 包装器单测。
 *
 * 验证三件事:
 *  1. record → replay 往返无损(turn 与 sideQuery 都能原样回放)
 *  2. replay 缺 fixture 时抛 LlmFatalError,绝不静默联网
 *  3. live + record=false 时不写缓存(不污染 fixtures)
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createReplayLlmClient } from '../../src/services/llm/replay.ts'
import { LlmFatalError, type LlmClient, type LlmRequest, type LlmTurn } from '../../src/services/llm/types.ts'
import type { Cache } from '../../src/tools/types.ts'
import type { Message } from '../../src/agent/types.ts'

function req(userContent: string): LlmRequest {
  const messages: Message[] = [{ role: 'user', content: userContent }]
  return { messages, tools: [], signal: new AbortController().signal }
}

/** 内存缓存,测试只关心「写进去能不能读回来」,不碰磁盘 */
function memoryCache(): Cache & { readonly entries: Map<string, string> } {
  const entries = new Map<string, string>()
  return {
    entries,
    async get(key) {
      return entries.get(key) ?? null
    },
    async set(key, value) {
      entries.set(key, value)
    },
  }
}

const TURN_0: LlmTurn = {
  text: '我先调个工具。',
  toolCalls: [{ id: 'c1', type: 'function', function: { name: 'calc', arguments: '{"a":1}' } }],
  usage: { input: 10, output: 5 },
  finishReason: 'tool_calls',
}
const TURN_1: LlmTurn = {
  text: '答案是 42。',
  toolCalls: [],
  usage: { input: 20, output: 6 },
  finishReason: 'stop',
}

describe('replay · turn 往返', () => {
  it('record 后 replay 能原样回放每一轮,且 onText 一次性收到全文', async () => {
    const cache = memoryCache()
    const script = [TURN_0, TURN_1]
    const inner: LlmClient = {
      async turn() {
        return script.shift() as LlmTurn
      },
      async sideQuery() {
        return '{}'
      },
    }

    // 第一次:live + record 录制
    const recorder = createReplayLlmClient({ inner, cache, mode: 'live', record: true })
    const rec0 = await recorder.turn(req('问题 A'))
    const rec1 = await recorder.turn(req('问题 A'))
    assert.equal(rec0.text, TURN_0.text)
    assert.equal(rec1.text, TURN_1.text)
    assert.equal(cache.entries.size, 2)

    // 第二次:replay 离线回放(inner 已经空了,若被调用 shift 返回 undefined → 报错,证明没联网/没调用)
    const replayer = createReplayLlmClient({ inner, cache, mode: 'replay', record: false })
    const deltas: string[] = []
    const rep0 = await replayer.turn(req('问题 A'), (d) => deltas.push(d))
    const rep1 = await replayer.turn(req('问题 A'))
    assert.deepEqual(rep0, TURN_0)
    assert.deepEqual(rep1, TURN_1)
    // 回放非流式:整段一次吐出
    assert.deepEqual(deltas, [TURN_0.text])
  })

  it('不同任务各自独立计数,互不串号', async () => {
    const cache = memoryCache()
    const inner: LlmClient = {
      async turn(request) {
        const isA = request.messages.some((m) => m.role === 'user' && m.content.includes('任务A'))
        return isA ? TURN_0 : TURN_1
      },
      async sideQuery() {
        return '{}'
      },
    }
    const recorder = createReplayLlmClient({ inner, cache, mode: 'live', record: true })
    await recorder.turn(req('任务A'))
    await recorder.turn(req('任务B'))
    await recorder.turn(req('任务A'))

    const replayer = createReplayLlmClient({ inner, cache, mode: 'replay', record: false })
    assert.equal((await replayer.turn(req('任务A'))).text, TURN_0.text)
    assert.equal((await replayer.turn(req('任务B'))).text, TURN_1.text)
    // 任务A 第二轮仍是它自己的序号 1(TURN_0),不会被任务B 污染
    assert.equal((await replayer.turn(req('任务A'))).text, TURN_0.text)
  })

  it('replay 缺 fixture 时抛 LlmFatalError,并点出缺失 key', async () => {
    const cache = memoryCache()
    const inner: LlmClient = {
      async turn() {
        return TURN_0
      },
      async sideQuery() {
        return '{}'
      },
    }
    const replayer = createReplayLlmClient({ inner, cache, mode: 'replay', record: false })
    await assert.rejects(
      () => replayer.turn(req('从没录过的任务')),
      (err: unknown) => err instanceof LlmFatalError && /llm:default:turn:/.test(err.message),
    )
  })

  it('live 且 record=false 时不写缓存,也不影响返回', async () => {
    const cache = memoryCache()
    let innerCalls = 0
    const inner: LlmClient = {
      async turn() {
        innerCalls += 1
        return TURN_0
      },
      async sideQuery() {
        return '{}'
      },
    }
    const client = createReplayLlmClient({ inner, cache, mode: 'live', record: false })
    const result = await client.turn(req('问题'))
    assert.equal(result.text, TURN_0.text)
    assert.equal(innerCalls, 1)
    assert.equal(cache.entries.size, 0)
  })
})

describe('replay · sideQuery 往返', () => {
  it('record 后 replay 原样返回结构化结果', async () => {
    const cache = memoryCache()
    const inner: LlmClient = {
      async turn() {
        return TURN_0
      },
      async sideQuery() {
        return '{"selected":["n1","n2"]}'
      },
    }
    const recorder = createReplayLlmClient({ inner, cache, mode: 'live', record: true })
    const raw = await recorder.sideQuery({
      messages: [{ role: 'user', content: '精筛:找相关' }],
      signal: new AbortController().signal,
    })
    assert.equal(raw, '{"selected":["n1","n2"]}')

    const replayer = createReplayLlmClient({ inner, cache, mode: 'replay', record: false })
    assert.equal(
      await replayer.sideQuery({
        messages: [{ role: 'user', content: '精筛:找相关' }],
        signal: new AbortController().signal,
      }),
      '{"selected":["n1","n2"]}',
    )
  })
})
