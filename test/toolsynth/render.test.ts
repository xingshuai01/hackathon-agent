/**
 * render.ts 单测:模板填充的三个产物(工具源码 / smoke test 源码 / 注册表源码)。
 *
 * 重点断言「证据锚点进产物」:生成的工具头注释与 description 必须带
 * paperId + 证据页码,否则数据铁律 #2 只在 spec 层成立、在代码层丢失。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { implFor } from '../../src/services/toolsynth/impls.ts'
import {
  renderRegistrySource,
  renderTestSource,
  renderToolSource,
} from '../../src/services/toolsynth/render.ts'
import { committedSpecs } from './specs.ts'

describe('renderToolSource(有 L1 实现)', () => {
  const spec = committedSpecs().find((s) => s.methodId === 'react-cotsc-majority')
  assert.ok(spec !== undefined)
  const impl = implFor('react-cotsc-majority')
  assert.ok(impl !== undefined)
  const src = renderToolSource(spec, impl)

  it('产出完整工具源码:buildTool + 契约 import + zod 字段', () => {
    assert.ok(src.includes("import { z } from 'zod'"))
    assert.ok(src.includes("import { buildTool, toolOk, toolFail } from '../types.ts'"))
    assert.ok(src.includes('export const majority_vote = buildTool({'))
    assert.ok(src.includes("name: 'majority_vote'"))
    assert.ok(src.includes('answers: z.array(z.string().min(1)).min(1),'))
    assert.ok(src.includes('isReadOnly: () => true'))
    assert.ok(src.includes('isConcurrencySafe: () => true'))
  })

  it('证据锚点进产物:头注释带 paperId 与页码,description 给模型看', () => {
    assert.ok(src.includes('paperId=arxiv:2210.03629'))
    assert.ok(src.includes('证据页码:p.5'))
    assert.ok(src.includes('来自论文 arxiv:2210.03629 p.5'))
    assert.ok(src.includes('当任务需要这一计算时使用'))
  })

  it('原文引文进头注释(逐字追溯)', () => {
    assert.ok(src.includes('adopting the majority answer'))
  })

  it('call 体是 L1 目录里的确定性计算,且失败转 toolFail 不 throw', () => {
    assert.ok(src.includes('const counts = new Map<string, number>()'))
    assert.ok(src.includes('catch (err) {'))
    assert.ok(src.includes('toolFail(`计算失败:'))
  })
})

describe('renderToolSource(参数模板,draft 路径)', () => {
  const spec = committedSpecs().find((s) => s.methodId === 'react-normalize-answer')
  assert.ok(spec !== undefined)
  const src = renderToolSource(spec, undefined)

  it('draft 状态写进头注释,降级说明写进 call 体', () => {
    assert.ok(src.includes('draft(参数模板,待人工补写实现)'))
    assert.ok(src.includes('AC-B2.5'))
    assert.ok(src.includes("methodId=react-normalize-answer"))
  })

  it('zod 字段带参数名前缀(可编译的严格对象)', () => {
    assert.ok(src.includes('text: z.string().min(1).describe("待归一化的答案文本")'))
  })

  it('call 恒返回 toolFail(不 throw),带人工补写指引', () => {
    assert.ok(src.includes('return toolFail('))
    assert.ok(src.includes('src/services/toolsynth/impls.ts'))
  })
})

describe('renderTestSource', () => {
  const spec = committedSpecs().find((s) => s.methodId === 'react-cotsc-majority')
  assert.ok(spec !== undefined)
  const impl = implFor('react-cotsc-majority')
  assert.ok(impl !== undefined)
  const src = renderTestSource(spec, impl)

  it('smoke 用例:合法入参 → ok:true 且 summary 含预期子串', () => {
    assert.ok(src.includes("import { test } from 'node:test'"))
    assert.ok(src.includes("from './majority_vote.ts'"))
    assert.ok(src.includes("{ answers: ['a', 'b', 'a', 'c', 'a'] }"))
    assert.ok(src.includes('assert.equal(result.ok, true)'))
    assert.ok(src.includes('includes("3/5")'))
  })
})

describe('renderRegistrySource', () => {
  it('只列 active 工具;draft 名单进注释供人查看', () => {
    const src = renderRegistrySource({
      activeToolNames: ['a_tool'],
      draftToolNames: ['b_tool'],
      generatedAt: '2026-01-01T00:00:00.000Z',
      specFiles: ['spec.json'],
    })
    assert.ok(src.includes("import { a_tool } from './a_tool.ts'"))
    assert.ok(src.includes('export const generatedTools = [a_tool]'))
    assert.ok(!src.includes('b_tool } from'))
    assert.ok(src.includes('draft 工具(未过 smoke,不进可调用池):b_tool'))
  })

  it('无 draft 时给出「当前无 draft」说明', () => {
    const src = renderRegistrySource({
      activeToolNames: [],
      draftToolNames: [],
      generatedAt: '2026-01-01T00:00:00.000Z',
      specFiles: [],
    })
    assert.ok(src.includes('当前无 draft 工具。'))
    assert.ok(src.includes('export const generatedTools = []'))
  })
})
