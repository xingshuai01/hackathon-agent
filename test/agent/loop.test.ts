/**
 * 主循环测试 —— 不花一分钱 API 额度。
 *
 * 覆盖 SDD §6.3 的四条红线 + §6.4 的并发分区 + 5 种终止 reason。
 * 任何人改动 loop.ts 后,此文件必须仍然通过。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { z } from 'zod'

import { runLoop, renderToolResult } from '../../src/agent/loop.ts'
import { createToolRegistry } from '../../src/agent/registry.ts'
import type { LoopOptions } from '../../src/agent/types.ts'
import { partitionToolCalls } from '../../src/agent/types.ts'
import type { AgentEvent } from '../../src/ui/events.ts'
import { buildTool, toolFail, toolOk, type ToolContext } from '../../src/tools/types.ts'
import { createFakeLlm, createFailingLlm, fakeToolCall } from '../../src/agent/fakeLlm.ts'

// ─────────────────────────────────────────────────────────────
// 夹具
// ─────────────────────────────────────────────────────────────

function makeToolContext(): Omit<ToolContext, 'signal'> {
  return {
    mode: 'replay',
    trace: { write: () => {} },
    cache: { get: async () => null, set: async () => {} },
  }
}

function makeOptions(overrides: Partial<LoopOptions> = {}): LoopOptions {
  return {
    systemPrompt: '你是一个科研助手',
    task: '测试任务',
    toolNames: [],
    maxTurns: 5,
    maxTotalTokens: 1_000_000,
    maxConcurrency: 3,
    signal: new AbortController().signal,
    ...overrides,
  }
}

function makeDeps(
  llm: ReturnType<typeof createFakeLlm> | ReturnType<typeof createFailingLlm>,
  registry = createToolRegistry(),
) {
  const events: AgentEvent[] = []
  return {
    deps: {
      llm,
      registry,
      emit: (e: AgentEvent) => events.push(e),
      toolContext: makeToolContext(),
    },
    events,
  }
}

const echoTool = buildTool({
  name: 'echo',
  description: () => '原样返回输入',
  inputSchema: z.strictObject({ text: z.string().min(1) }),
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  async call(input) {
    return toolOk({ echoed: input.text }, `echoed:${input.text}`)
  },
})

const boomTool = buildTool({
  name: 'boom',
  description: () => '总是抛异常',
  inputSchema: z.strictObject({}),
  async call() {
    throw new Error('工具内部炸了')
  },
})

// ─────────────────────────────────────────────────────────────
// 终止 reason
// ─────────────────────────────────────────────────────────────

describe('主循环 · 终止 reason(5 种)', () => {
  it('无工具调用 → completed', async () => {
    const llm = createFakeLlm([{ text: '直接回答' }])
    const { deps } = makeDeps(llm)

    const result = await runLoop(makeOptions(), deps)

    assert.equal(result.reason, 'completed')
    assert.equal(result.turns, 1)
    const last = result.messages.at(-1)
    assert.equal(last?.role, 'assistant')
    if (last?.role === 'assistant') assert.equal(last.content, '直接回答')
  })

  it('触到 maxTurns → max_turns,且保留已有消息', async () => {
    // 每一轮都请求工具,永远不收敛
    const specs = Array.from({ length: 10 }, (_, i) => ({
      toolCalls: [fakeToolCall(`c${i}`, 'echo', { text: 'x' })],
    }))
    const llm = createFakeLlm(specs)
    const deps = makeDeps(llm).deps
    deps.registry.register(echoTool)

    const result = await runLoop(makeOptions({ maxTurns: 3 }), deps)

    assert.equal(result.reason, 'max_turns')
    assert.equal(result.turns, 4, 'for 循环结束后 turns 会 +1')
    assert.ok(result.messages.length > 2, '必须保留已有的部分结果')
  })

  it('预算耗尽 → budget_exceeded', async () => {
    // 注意:必须让循环「继续」才能走到下一轮的预算检查,
    // 所以每轮都要带工具调用;否则第一轮就 completed 了。
    const llm = createFakeLlm([
      { text: 'a', toolCalls: [fakeToolCall('c1', 'echo', { text: 'x' })], usage: { input: 500, output: 500 } },
      { text: 'b', toolCalls: [fakeToolCall('c2', 'echo', { text: 'y' })] },
      { text: '不该到这里' },
    ])
    const deps = makeDeps(llm).deps
    deps.registry.register(echoTool)

    const result = await runLoop(makeOptions({ maxTotalTokens: 800, maxTurns: 5 }), deps)

    assert.equal(result.reason, 'budget_exceeded')
    assert.equal(result.turns, 2, '第二轮开始时发现预算已超')
    assert.equal(llm.turnCount, 1, '超预算后不应再调模型')
  })

  it('已中断 → aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const llm = createFakeLlm([{ text: '不该被调用' }])
    const { deps } = makeDeps(llm)

    const result = await runLoop(makeOptions({ signal: controller.signal }), deps)

    assert.equal(result.reason, 'aborted')
  })

  it('LLM 不可恢复错误 → model_error,不抛', async () => {
    const llm = createFailingLlm('鉴权失败')
    const { deps, events } = makeDeps(llm)

    const result = await runLoop(makeOptions(), deps)

    assert.equal(result.reason, 'model_error')
    assert.ok(events.some((e) => e.type === 'error' && e.stage === 'llm'))
  })
})

// ─────────────────────────────────────────────────────────────
// 红线 ①②③④
// ─────────────────────────────────────────────────────────────

describe('主循环 · 四条红线', () => {
  it('红线① 靠 toolCalls 判断:finish_reason=stop 但有 toolCalls 时仍要执行工具', async () => {
    const llm = createFakeLlm([
      { text: '我先查一下', toolCalls: [fakeToolCall('c1', 'echo', { text: 'hi' })], finishReason: 'stop' },
      { text: '完成' },
    ])
    const deps = makeDeps(llm).deps
    deps.registry.register(echoTool)

    const result = await runLoop(makeOptions(), deps)

    assert.equal(result.reason, 'completed')
    assert.equal(result.turns, 2, '必须执行了工具并进入第二轮')
    assert.ok(result.messages.some((m) => m.role === 'tool'))
  })

  it('红线② 每条结果是一条独立的 role:tool 消息,且 tool_call_id 对齐', async () => {
    const llm = createFakeLlm([
      {
        toolCalls: [
          fakeToolCall('call_A', 'echo', { text: 'a' }),
          fakeToolCall('call_B', 'echo', { text: 'b' }),
        ],
      },
      { text: '完成' },
    ])
    const deps = makeDeps(llm).deps
    deps.registry.register(echoTool)

    const result = await runLoop(makeOptions(), deps)

    const toolMessages = result.messages.filter((m) => m.role === 'tool')
    assert.equal(toolMessages.length, 2, '两个调用必须回填两条独立消息')

    const ids = toolMessages.map((m) => (m.role === 'tool' ? m.tool_call_id : ''))
    assert.deepEqual(ids.sort(), ['call_A', 'call_B'], 'tool_call_id 必须与请求一一对应')

    // assistant 消息必须带 tool_calls
    const assistantWithCalls = result.messages.find(
      (m) => m.role === 'assistant' && m.tool_calls !== undefined && m.tool_calls.length > 0,
    )
    assert.ok(assistantWithCalls !== undefined, 'assistant 消息必须带 tool_calls')

    // 回填的**不是** user 消息(Anthropic 格式才会那样)
    const userMessages = result.messages.filter((m) => m.role === 'user')
    assert.equal(userMessages.length, 1, '只应有最初那条 user 任务消息')
  })

  it('红线③ 非法 JSON 参数被结构化回填,不崩', async () => {
    const llm = createFakeLlm([
      { toolCalls: [fakeToolCall('c1', 'echo', '{"text":')] }, // 故意残缺
      { text: '我改用合法参数' },
    ])
    const deps = makeDeps(llm).deps
    deps.registry.register(echoTool)

    const result = await runLoop(makeOptions(), deps)

    assert.equal(result.reason, 'completed')
    const toolMsg = result.messages.find((m) => m.role === 'tool')
    assert.ok(toolMsg !== undefined)
    if (toolMsg?.role === 'tool') assert.match(toolMsg.content, /不是合法 JSON/)
  })

  it('红线③ 未知工具被结构化回填,并提示可用工具', async () => {
    const llm = createFakeLlm([
      { toolCalls: [fakeToolCall('c1', 'not_exist', {})] },
      { text: '换个工具' },
    ])
    const deps = makeDeps(llm).deps
    deps.registry.register(echoTool)

    const result = await runLoop(makeOptions(), deps)

    const toolMsg = result.messages.find((m) => m.role === 'tool')
    assert.ok(toolMsg !== undefined)
    if (toolMsg?.role === 'tool') {
      assert.match(toolMsg.content, /未知工具/)
      assert.match(toolMsg.content, /echo/, '应把可用工具列给模型')
    }
  })

  it('红线④ 工具内部 throw 被兜底成失败结果,循环继续', async () => {
    const llm = createFakeLlm([
      { toolCalls: [fakeToolCall('c1', 'boom', {})] },
      { text: '工具失败了,我说明一下' },
    ])
    const deps = makeDeps(llm).deps
    deps.registry.register(boomTool)

    const result = await runLoop(makeOptions(), deps)

    assert.equal(result.reason, 'completed', '工具抛异常不能让循环崩掉')
    const toolMsg = result.messages.find((m) => m.role === 'tool')
    if (toolMsg?.role === 'tool') assert.match(toolMsg.content, /工具内部炸了/)
  })

  it('schema 校验失败(schema 拒绝多余字段)也走回填', async () => {
    const llm = createFakeLlm([
      { toolCalls: [fakeToolCall('c1', 'echo', { text: 'a', extra: 1 })] },
      { text: '好' },
    ])
    const deps = makeDeps(llm).deps
    deps.registry.register(echoTool)

    const result = await runLoop(makeOptions(), deps)
    const toolMsg = result.messages.find((m) => m.role === 'tool')
    if (toolMsg?.role === 'tool') assert.match(toolMsg.content, /参数校验失败/)
  })
})

// ─────────────────────────────────────────────────────────────
// 并发分区
// ─────────────────────────────────────────────────────────────

describe('主循环 · 并发分区(SDD §6.4)', () => {
  it('连续可并发的工具合成一批,遇到不可并发的断开', () => {
    const calls = [
      { name: 'safe1' }, { name: 'safe2' }, { name: 'unsafe' }, { name: 'safe3' },
    ]
    const batches = partitionToolCalls(calls, (c) => c.name !== 'unsafe', 3)

    assert.deepEqual(
      batches.map((b) => b.map((c) => c.name)),
      [['safe1', 'safe2'], ['unsafe'], ['safe3']],
    )
  })

  it('不可并发的工具在循环里仍然被执行(只是单独成批)', async () => {
    const safeCalls = [
      fakeToolCall('a', 'echo', { text: '1' }),
      fakeToolCall('b', 'echo', { text: '2' }),
      fakeToolCall('c', 'boom', {}),
    ]
    const llm = createFakeLlm([{ toolCalls: safeCalls }, { text: 'ok' }])
    const deps = makeDeps(llm).deps
    deps.registry.register(echoTool) // isConcurrencySafe = true
    deps.registry.register(boomTool) // 默认 false → fail-closed

    const result = await runLoop(makeOptions(), deps)

    const toolMessages = result.messages.filter((m) => m.role === 'tool')
    assert.equal(toolMessages.length, 3, '三个调用都要有结果')
  })
})

// ─────────────────────────────────────────────────────────────
// 事件与工具白名单
// ─────────────────────────────────────────────────────────────

describe('主循环 · 事件与白名单', () => {
  it('发出 text_delta / tool_start / tool_end 事件', async () => {
    const llm = createFakeLlm([
      { text: '思考中', toolCalls: [fakeToolCall('c1', 'echo', { text: 'x' })] },
      { text: '答完' },
    ])
    const { deps, events } = makeDeps(llm)
    deps.registry.register(echoTool)

    await runLoop(makeOptions(), deps)

    assert.ok(events.some((e) => e.type === 'text_delta' && e.text === '思考中'))
    assert.ok(events.some((e) => e.type === 'tool_start' && e.name === 'echo'))
    assert.ok(events.some((e) => e.type === 'tool_end' && e.ok === true))
  })

  it('toolNames 白名单限制暴露给模型的工具', async () => {
    const llm = createFakeLlm([{ text: 'ok' }])
    const { deps } = makeDeps(llm)
    deps.registry.register(echoTool)
    deps.registry.register(boomTool)

    await runLoop(makeOptions({ toolNames: ['echo'] }), deps)

    const request = llm.requests[0]
    assert.ok(request !== undefined)
    const names = request.tools.map((t) => t.function.name)
    assert.deepEqual(names, ['echo'], '白名单外的工具不能出现在 schemas 里')
  })

  it('渲染工具结果:成功给 summary,失败给错误 + 提示', () => {
    const ok = renderToolResult({
      id: '1', name: 't', ms: 1,
      result: toolOk({ a: 1 }, '做完了'),
    })
    assert.equal(ok, '做完了')

    const bad = renderToolResult({
      id: '2', name: 't', ms: 1,
      result: toolFail('炸了', '重试一次'),
    })
    assert.match(bad, /工具执行失败:炸了/)
    assert.match(bad, /提示:重试一次/)
  })
})

// ─────────────────────────────────────────────────────────────
// 进度上报通道
// ─────────────────────────────────────────────────────────────

describe('loop · 进度上报', () => {
  // onProgress 由编排层注入,loop 只负责原样透传。
  // 曾经 main.ts 忘了注入,结果任何工具调它都是静默丢弃,
  // 长任务在 UI 上就是黑屏 —— 这条用例守住「透传不丢」。
  const progressTool = buildTool({
    name: 'slow_tool',
    description: () => '会上报进度的慢工具',
    inputSchema: z.strictObject({ steps: z.number() }),
    async call(input, ctx) {
      for (let i = 1; i <= input.steps; i += 1) {
        ctx.onProgress?.({ step: `第 ${String(i)} 步`, done: i, total: input.steps })
      }
      return toolOk({ steps: input.steps }, `完成 ${String(input.steps)} 步`)
    },
  })

  it('工具调用 ctx.onProgress 后能收到事件', async () => {
    const llm = createFakeLlm([
      { text: '开始', toolCalls: [fakeToolCall('p1', 'slow_tool', { steps: 3 })] },
      { text: '结束' },
    ])
    const events: AgentEvent[] = []
    const deps = {
      llm,
      registry: createToolRegistry(),
      emit: (e: AgentEvent) => events.push(e),
      toolContext: {
        ...makeToolContext(),
        onProgress: (p: { step: string; done: number; total: number }) => {
          events.push({ type: 'progress', ...p })
        },
      },
    }
    deps.registry.register(progressTool)

    await runLoop(makeOptions(), deps)

    const progress = events.filter((e) => e.type === 'progress')
    assert.equal(progress.length, 3)
    assert.deepEqual(progress[0], { type: 'progress', step: '第 1 步', done: 1, total: 3 })
  })
})
