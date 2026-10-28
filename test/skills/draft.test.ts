import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  DRAFT_DIR_NAME,
  listDrafts,
  promoteDraft,
  readDraft,
  writeSkillDraft,
} from '../../src/services/skills/draft.ts'
import { generateSkillDraft, type DraftNote } from '../../src/services/skills/generate.ts'
import { serializeSkill } from '../../src/services/skills/markdown.ts'
import { createSkillStore } from '../../src/services/skills/store.ts'
import type { Skill } from '../../src/services/skills/types.ts'

const notes: DraftNote[] = [
  { noteId: 'arxiv:2210.03629#p3#a1b2c3', page: 3, kind: 'method', description: 'ReAct 交替产生推理与动作', text: 'We propose ReAct.' },
  { noteId: 'arxiv:2210.03629#p6#d4e5f6', page: 6, kind: 'result', description: 'HotpotQA 上 EM 提升 6%', text: 'EM improves by 6%.' },
]

function draftOutcome(): ReturnType<typeof generateSkillDraft> {
  return generateSkillDraft(
    {
      skillId: 'paper-arxiv-2210.03629',
      name: 'ReAct',
      domain: '待人工填写',
      description: '从 ReAct 抽取的方法草案',
      whenToUse: '当任务涉及 ReAct 所描述的推理与动作交替范式时使用',
    },
    notes,
  )
}

async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'skill-draft-'))
  try {
    return await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const validSkill: Skill = {
  skillId: 'valid-skill',
  name: '合规技能',
  domain: 'demo',
  version: '1.0.0',
  description: '七节齐全,可直接晋升',
  whenToUse: '当用户要求复现 XNLI 跨语言检索时使用',
  loadWhen: { keywords: ['XNLI'], taskTypes: ['复现'] },
  allowedTools: [],
  status: 'needs_review',
  sections: {
    domainMap: [{ concept: '跨语言检索' }],
    workflow: [{ stage: '准备', input: '论文', action: '抽取', criteria: '每条带页码' }],
    toolMapping: [{ method: '复现', tool: 'run-experiment' }],
    failureModes: ['忘记对齐语言', '评测集泄漏', '指标口径不一致'],
    terminology: [{ term: 'recall', disambiguation: '召回率' }],
    evidenceIndex: [{ claim: '基线 78.2', noteId: 'p1#abc' }],
    negativeConstraints: ['不要自行增删基线'],
  },
}

describe('draft · 落盘', () => {
  it('草案写进指定目录,文件名就是 skillId', async () => {
    await withTempDir(async (dir) => {
      const file = await writeSkillDraft(dir, draftOutcome())
      assert.equal(path.basename(file.path), 'paper-arxiv-2210.03629.md')
      assert.equal(file.skillId, 'paper-arxiv-2210.03629')
      assert.ok((await stat(file.path)).isFile())
    })
  })

  it('文件头写明这是未审草案,并给出晋升命令', async () => {
    await withTempDir(async (dir) => {
      const file = await writeSkillDraft(dir, draftOutcome())
      const raw = await readFile(file.path, 'utf8')
      assert.match(raw, /技能草案 · 自动生成,未经人工审核/)
      assert.match(raw, /skills promote paper-arxiv-2210\.03629/)
    })
  })

  it('生成器报的缺项原样写进文件头 —— 那就是人工审核的待办', async () => {
    await withTempDir(async (dir) => {
      const outcome = draftOutcome()
      assert.ok(outcome.warnings.length > 0, '本用例需要一个真的报了缺项的草案')
      const file = await writeSkillDraft(dir, outcome)
      const raw = await readFile(file.path, 'utf8')
      for (const warning of outcome.warnings) assert.ok(raw.includes(warning), `文件里没有:${warning}`)
      assert.equal(file.warnings.length, outcome.warnings.length)
    })
  })

  it('写进去能读回来,且七节内容不丢', async () => {
    await withTempDir(async (dir) => {
      await writeSkillDraft(dir, draftOutcome())
      const back = await readDraft(dir, 'paper-arxiv-2210.03629')
      assert.notEqual(back, null)
      assert.equal(back?.skillId, 'paper-arxiv-2210.03629')
      assert.equal(back?.status, 'needs_review')
      // 只断言生成器确实推出来的节:失败模式要靠 limitation 类知识页,本例的语料里没有
      assert.ok((back?.sections.domainMap.length ?? 0) > 0)
      assert.ok((back?.sections.workflow.length ?? 0) > 0)
      assert.equal(back?.whenToUse, draftOutcome().skill.whenToUse)
    })
  })

  it('重复生成覆盖旧草案 —— 草案是派生数据,重新生成比手工合并可信', async () => {
    await withTempDir(async (dir) => {
      await writeSkillDraft(dir, draftOutcome())
      await writeSkillDraft(dir, draftOutcome())
      assert.deepEqual(await listDrafts(dir), ['paper-arxiv-2210.03629'])
    })
  })

  it('目录不存在时 listDrafts 返回空数组而不是抛错', async () => {
    assert.deepEqual(await listDrafts(path.join(tmpdir(), 'not-exist-drafts-xyz')), [])
  })
})

describe('draft · 晋升', () => {
  it('草案不存在时明确说 missing', async () => {
    await withTempDir(async (dir) => {
      const store = createSkillStore(path.join(dir, 'skills'))
      const result = await promoteDraft(store, dir, 'ghost')
      assert.equal(result.status, 'missing')
    })
  })

  it('不合格的草案被拒绝,且技能库里什么都没多出来', async () => {
    await withTempDir(async (dir) => {
      const store = createSkillStore(path.join(dir, 'skills'))
      await writeSkillDraft(dir, draftOutcome())

      const result = await promoteDraft(store, dir, 'paper-arxiv-2210.03629')
      assert.equal(result.status, 'invalid')
      if (result.status === 'invalid') assert.ok(result.problems.length > 0)

      // 关键:拒绝之后不能留半个技能目录
      assert.deepEqual(await store.list(), [])
    })
  })

  it('合格的草案晋升成正式技能', async () => {
    await withTempDir(async (dir) => {
      const store = createSkillStore(path.join(dir, 'skills'))
      await writeSkillDraft(dir, { skill: validSkill, validation: { ok: true, missing: [], problems: [] }, warnings: [] })

      const result = await promoteDraft(store, dir, 'valid-skill')
      assert.equal(result.status, 'saved')
      assert.equal((await store.list()).length, 1)
      assert.equal((await store.load('valid-skill'))?.name, '合规技能')
    })
  })

  it('草案目录名不会把自己伪装成一个技能', () => {
    assert.equal(DRAFT_DIR_NAME.startsWith('_'), true)
  })
})
