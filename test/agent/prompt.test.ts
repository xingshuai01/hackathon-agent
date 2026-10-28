import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildSystemPrompt, PROMPT_LIMITS } from '../../src/agent/prompt.ts'

const ROLE = '你是测试角色。'

describe('prompt · 知识索引', () => {
  it('注入索引时带锚点要求', () => {
    const text = buildSystemPrompt({ role: ROLE, knowledgeIndex: '- p3 · 方法:ReAct 交替推理' })
    assert.match(text, /你的知识库索引/)
    assert.match(text, /引用时必须原样带上锚点/)
  })

  it('注册了 knowledge_search 才点名它 —— 否则模型会去调一个不存在的工具', () => {
    const withTool = buildSystemPrompt({
      role: ROLE,
      knowledgeIndex: '- p3 · 方法',
      availableTools: ['knowledge_search'],
    })
    assert.match(withTool, /用 knowledge_search 工具检索正文/)

    const withoutTool = buildSystemPrompt({
      role: ROLE,
      knowledgeIndex: '- p3 · 方法',
      availableTools: ['read_file'],
    })
    assert.equal(withoutTool.includes('用 knowledge_search'), false)
    assert.match(withoutTool, /当前没有可检索正文的工具/)
  })

  it('索引为空时不产生空标题', () => {
    const text = buildSystemPrompt({ role: ROLE, knowledgeIndex: '   ' })
    assert.equal(text.includes('你的知识库索引'), false)
  })
})

describe('prompt · 技能', () => {
  it('清单渲染成「可用技能」', () => {
    const text = buildSystemPrompt({ role: ROLE, skillManifest: 'xnli-repro: 复现 XNLI' })
    assert.match(text, /## 可用技能/)
    assert.match(text, /xnli-repro: 复现 XNLI/)
  })

  it('命中技能的正文单独成块,与清单分开', () => {
    const text = buildSystemPrompt({
      role: ROLE,
      skillManifest: 'xnli-repro: 复现 XNLI',
      skillBody: '**二、标准流程**\n1. **准备**\n   判据:每条带页码',
    })
    assert.match(text, /## 本次任务适用的技能\(已加载正文\)/)
    assert.match(text, /判据是硬门槛/)
    assert.match(text, /\*\*二、标准流程\*\*/)
  })

  it('只有正文没有清单时也能渲染(单测直接注入正文的场景)', () => {
    const text = buildSystemPrompt({ role: ROLE, skillBody: '**一、领域地图**\n- 节点' })
    assert.match(text, /本次任务适用的技能/)
  })

  it('正文超预算时截断并注明原长 —— 静默截断会吃掉判据', () => {
    const body = 'x'.repeat(PROMPT_LIMITS.skillBody + 100)
    const text = buildSystemPrompt({ role: ROLE, skillBody: body })
    assert.match(text, /已截断,原长/)
  })

  it('两者都空时一个技能标题都不出现', () => {
    const text = buildSystemPrompt({ role: ROLE })
    assert.equal(text.includes('可用技能'), false)
    assert.equal(text.includes('已加载正文'), false)
  })
})
