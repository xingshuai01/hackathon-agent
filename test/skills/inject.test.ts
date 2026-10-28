import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  isLoadableSkill,
  renderSkillForPrompt,
  SKILL_BODY_LIMITS,
} from '../../src/services/skills/inject.ts'
import type { Skill } from '../../src/services/skills/types.ts'

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    skillId: 'demo-skill',
    name: '演示技能',
    domain: 'demo',
    version: '1.0.0',
    description: '用于验证正文渲染',
    whenToUse: '当用户要求复现 XNLI 跨语言检索时使用',
    loadWhen: { keywords: ['XNLI'], taskTypes: ['复现'] },
    allowedTools: [],
    status: 'needs_review',
    sections: {
      domainMap: [{ concept: '跨语言检索' }, { concept: '低资源', note: '数据不足' }],
      workflow: [{ stage: '准备', input: '论文', action: '抽取', criteria: '每步有判据' }],
      toolMapping: [{ method: '复现', tool: 'run-experiment' }],
      failureModes: ['忘记对齐语言', '评测集泄漏', '指标口径不一致'],
      terminology: [{ term: 'recall', disambiguation: '召回率,非召回实验' }],
      evidenceIndex: [{ claim: '基线 78.2', noteId: 'p1#abc' }],
      negativeConstraints: ['不要自行增删基线'],
    },
    ...overrides,
  }
}

describe('inject · 正文渲染', () => {
  it('开头给出身份与适用场景 —— 模型据此确认「这就是我要用的那个技能」', () => {
    const text = renderSkillForPrompt(skill())
    assert.match(text, /^### 技能:演示技能\(demo-skill · v1\.0\.0\)/)
    assert.match(text, /适用场景.*XNLI/)
  })

  it('七节按写作顺序出现,顺序本身就是要求', () => {
    const text = renderSkillForPrompt(skill())
    const order = ['一、领域地图', '二、标准流程', '三、方法→工具映射', '四、常见失败模式', '五、术语消歧', '六、证据索引', '七、负向约束']
    let cursor = -1
    for (const title of order) {
      const at = text.indexOf(title)
      assert.ok(at > cursor, `${title} 位置不对(应在前一节之后)`)
      cursor = at
    }
  })

  it('流程渲染出输入 / 动作 / 判据三行', () => {
    const text = renderSkillForPrompt(skill())
    assert.match(text, /输入:论文/)
    assert.match(text, /动作:抽取/)
    assert.match(text, /判据:每步有判据/)
  })

  it('判据为空时显式标注「未定义」—— 不能悄悄留空让模型以为没要求', () => {
    const text = renderSkillForPrompt(
      skill({
        sections: {
          ...skill().sections,
          workflow: [{ stage: '准备', input: '论文', action: '抽取', criteria: '   ' }],
        },
      }),
    )
    assert.match(text, /判据:\(未定义/)
  })

  it('证据索引带上 noteId —— 引用时才可能给锚点', () => {
    const text = renderSkillForPrompt(skill())
    assert.match(text, /基线 78\.2\(证据:p1#abc\)/)
  })

  it('整节为空时跳过该节,不渲染空标题', () => {
    const text = renderSkillForPrompt(
      skill({
        sections: { ...skill().sections, terminology: [], negativeConstraints: [] },
      }),
    )
    assert.equal(text.includes('五、术语消歧'), false)
    assert.equal(text.includes('七、负向约束'), false)
  })

  it('超条数上限时标注还有多少未展示 —— 静默截断会让模型以为技能只有这几条', () => {
    const many = Array.from({ length: 12 }, (_, i) => `失败模式 ${String(i + 1)}`)
    const text = renderSkillForPrompt(skill({ sections: { ...skill().sections, failureModes: many } }))
    const shown = text.split('\n').filter((line) => line.startsWith('- 失败模式 ')).length
    assert.equal(shown, SKILL_BODY_LIMITS.maxItemsPerSection)
    assert.match(text, /另有 4 条未展示/)
  })
})

describe('inject · 预算', () => {
  it('超预算时丢低价值节,并如实标注丢了什么', () => {
    const text = renderSkillForPrompt(skill(), { maxChars: 240 })
    // 注意断言「节标题块」而不是关键词:省略提示里也会出现节名
    assert.equal(text.includes('**六、证据索引**'), false)
    assert.equal(text.includes('**五、术语消歧**'), false)
    assert.match(text, /因上下文预算省略:.*六、证据索引/)
  })

  it('省略提示放末尾,不打断正文顺序', () => {
    const text = renderSkillForPrompt(skill(), { maxChars: 240 })
    assert.ok(text.indexOf('因上下文预算省略') > text.indexOf('**四、常见失败模式**'))
  })

  it('无论怎么超预算,流程与失败模式都不丢 —— 那是技能存在的理由', () => {
    const text = renderSkillForPrompt(skill(), { maxChars: 120 })
    assert.equal(text.includes('**二、标准流程**'), true)
    assert.equal(text.includes('**四、常见失败模式**'), true)
  })

  it('预算宽松时不出现省略提示', () => {
    const text = renderSkillForPrompt(skill(), { maxChars: 100_000 })
    assert.equal(text.includes('因上下文预算省略'), false)
  })
})

describe('inject · 可加载判定', () => {
  it('needs_review 也能加载 —— 它就是给人审的时候看的', () => {
    assert.equal(isLoadableSkill(skill()), true)
  })

  it('deprecated / draft 之外的未知状态不加载', () => {
    assert.equal(isLoadableSkill(skill({ status: 'deprecated' as never })), false)
  })
})
