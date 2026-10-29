/**
 * types.ts 单测:validateSpec / sanitizeToolName,以及「spec ↔ L1 实现」防漂移交叉校验。
 *
 * 依据:SRS AC-B1.1/B1.2、数据铁律 #2(evidencePage 必须 >=1);
 * impls.ts 文件头的约定(登记新实现必须补一致性用例)。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { L1_IMPLS, checkSpecImplConsistency, implFor } from '../../src/services/toolsynth/impls.ts'
import { sanitizeToolName, validateSpec, type MethodParam, type MethodSpec } from '../../src/services/toolsynth/types.ts'
import { committedSpecs } from './specs.ts'

function validRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    methodId: 't-majority',
    paperId: 'arxiv:2210.03629',
    name: 'majority vote',
    toolName: 'majority_vote',
    params: [{ name: 'answers', type: 'object', required: true, description: '答案列表' }],
    preconditions: [],
    evidencePage: 5,
    evidenceQuote: 'adopting the majority answer',
    supportLevel: 'L1',
    ...overrides,
  }
}

describe('validateSpec', () => {
  it('合法规格通过,并规范化 methodId/name', () => {
    const checked = validateSpec(validRaw())
    assert.equal(checked.ok, true)
    if (checked.ok) {
      assert.equal(checked.spec.toolName, 'majority_vote')
      assert.equal(checked.spec.evidencePage, 5)
    }
  })

  it('evidencePage 缺失或非法 → 拒绝(数据铁律 #2)', () => {
    for (const page of [0, -1, 1.5, '5', undefined]) {
      const checked = validateSpec(validRaw({ evidencePage: page }))
      assert.equal(checked.ok, false, `evidencePage=${String(page)} 应被拒绝`)
    }
  })

  it('toolName 含 [a-zA-Z0-9_] 以外字符 → 拒绝(DeepSeek function name 硬限制)', () => {
    const checked = validateSpec(validRaw({ toolName: 'majority-vote!' }))
    assert.equal(checked.ok, false)
  })

  it('enum 参数缺少 enumValues → 拒绝', () => {
    const checked = validateSpec(
      validRaw({
        params: [{ name: 'mode', type: 'enum', required: true, description: '模式' }],
      }),
    )
    assert.equal(checked.ok, false)
  })

  it('supportLevel 超出白名单 → 拒绝(L3 明确不做)', () => {
    const checked = validateSpec(validRaw({ supportLevel: 'L3' }))
    assert.equal(checked.ok, false)
  })
})

describe('sanitizeToolName', () => {
  it('把人类可读方法名折叠成合法工具名', () => {
    assert.equal(sanitizeToolName('CoT-SC majority vote'), 'cot_sc_majority_vote')
    assert.equal(sanitizeToolName('  ReAct → CoT-SC  '), 'react_cot_sc')
  })

  it('全非 [a-zA-Z0-9_] → null(调用方丢弃并记录原因)', () => {
    assert.equal(sanitizeToolName('中文方法名'), null)
    assert.equal(sanitizeToolName('!!!'), null)
    assert.equal(sanitizeToolName(''), null)
  })

  it('数字开头 → 加 tool_ 前缀', () => {
    assert.equal(sanitizeToolName('3D voting'), 'tool_3d_voting')
  })
})

describe('spec ↔ L1 实现一致性(防漂移)', () => {
  it('登记表里每个 methodId 在已提交 specs 中都有对应条目', () => {
    const byMethodId = new Map(committedSpecs().map((s) => [s.methodId, s]))
    for (const impl of L1_IMPLS) {
      assert.ok(
        byMethodId.has(impl.methodId),
        `impl「${impl.methodId}」没有对应的 spec —— 两边必须同步提交`,
      )
    }
  })

  it('每个实现的必填参数都能在 zodFields 里找到', () => {
    const byMethodId = new Map(committedSpecs().map((s) => [s.methodId, s]))
    for (const impl of L1_IMPLS) {
      const spec = byMethodId.get(impl.methodId)
      if (spec === undefined) continue
      assert.deepEqual(
        checkSpecImplConsistency(spec, impl),
        [],
        `spec「${spec.methodId}」与 impl 的必填参数不一致`,
      )
    }
  })

  it('负路径:spec 声明了 impl 没有的必填参数 → 一致性检查报错', () => {
    const spec = committedSpecs().find((s) => s.methodId === 'react-webshop-score')
    assert.ok(spec !== undefined)
    const impl = implFor('react-webshop-score')
    assert.ok(impl !== undefined)
    const extra: MethodParam = { name: 'bogus', type: 'number', required: true, description: 'x' }
    const broken: MethodSpec = { ...spec, params: [...spec.params, extra] }
    assert.equal(checkSpecImplConsistency(broken, impl).length, 1)
  })
})
