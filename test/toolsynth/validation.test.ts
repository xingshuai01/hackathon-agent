/**
 * 跨字段校验(validateSource)的回归测试。
 *
 * 背景:2026-10-30 实测发现 `success_rate(11,10)` 返回 110% ——
 * zod 的字段级校验管不了「successes <= total」这类跨字段约束,
 * 这正是风险登记册 R-1 说的"跑通了但结果错"。
 * 修复:L1Impl 增加 validateSource,render 渲染成工具的 validateInput。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createToolRegistry } from '../../src/agent/registry.ts'
import { invokeTool } from '../../src/tools/types.ts'
import { generatedTools } from '../../src/tools/generated/registry.generated.ts'
import { implFor } from '../../src/services/toolsynth/impls.ts'
import { renderToolSource } from '../../src/services/toolsynth/render.ts'
import { validateSpec } from '../../src/services/toolsynth/types.ts'

const ctx = {
  signal: new AbortController().signal,
  mode: 'replay' as const,
  trace: { write: () => {} },
  cache: { get: async () => null, set: async () => {} },
}

async function callTool(name: string, input: unknown) {
  const registry = createToolRegistry()
  for (const tool of generatedTools) registry.register(tool)
  const tool = registry.get(name)
  assert.ok(tool !== null, `工具 ${name} 未注册`)
  return invokeTool(tool, input, ctx)
}

describe('toolsynth · 跨字段校验(validateSource)', () => {
  it('success_rate 拒绝 successes > total(不再返回 110%)', async () => {
    const bad = await callTool('success_rate', { successes: 11, total: 10 })
    assert.equal(bad.result.ok, false)
    if (!bad.result.ok) assert.match(bad.result.error, /successes 不能大于 total/)

    const good = await callTool('success_rate', { successes: 8, total: 10 })
    assert.equal(good.result.ok, true)
  })

  it('webshop_score 拒绝 matchedCount > requiredCount', async () => {
    const bad = await callTool('webshop_score', { requiredCount: 3, matchedCount: 4 })
    assert.equal(bad.result.ok, false)
    if (!bad.result.ok) assert.match(bad.result.error, /matchedCount 不能大于 requiredCount/)
  })

  it('should_backoff_to_react 拒绝 majorityCount > total', async () => {
    const bad = await callTool('should_backoff_to_react', { majorityCount: 6, total: 5 })
    assert.equal(bad.result.ok, false)
    if (!bad.result.ok) assert.match(bad.result.error, /majorityCount 不能大于 total/)
  })

  it('合法的同字段输入仍然通过(不误伤)', async () => {
    const good = await callTool('webshop_score', { requiredCount: 4, matchedCount: 3 })
    assert.equal(good.result.ok, true)
    if (good.result.ok) assert.match(good.result.summary, /score=0\.75/)
  })
})

describe('toolsynth · validateSource 渲染', () => {
  it('有 validateSource 的实现会渲染出 validateInput 块', () => {
    const impl = implFor('react-alfworld-rate')
    assert.ok(impl !== undefined)
    assert.ok(impl.validateSource !== undefined, '该实现应带跨字段校验')

    const raw = {
      methodId: 'react-alfworld-rate',
      paperId: 'arxiv:2210.03629',
      name: 'ALFWorld 成功率',
      toolName: 'success_rate',
      params: [
        { name: 'successes', type: 'number', required: true, description: '成功数' },
        { name: 'total', type: 'number', required: true, description: '总数' },
      ],
      preconditions: [],
      evidencePage: 7,
      supportLevel: 'L1',
    }
    const checked = validateSpec(raw)
    assert.equal(checked.ok, true)
    if (checked.ok) {
      const source = renderToolSource(checked.spec, impl)
      assert.ok(source.includes('validateInput'), '生成源码应包含 validateInput')
      assert.ok(source.includes('successes 不能大于 total'), '生成源码应包含约束文案')
    }
  })

  it('无 validateSource 的实现不渲染 validateInput 块', () => {
    const impl = implFor('react-cotsc-majority')
    assert.ok(impl !== undefined)
    assert.equal(impl.validateSource, undefined, 'majority_vote 没有跨字段约束')
  })
})
