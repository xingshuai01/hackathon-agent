import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createSkillStore } from '../../src/services/skills/store.ts'
import { serializeSkill, parseSkillMarkdown } from '../../src/services/skills/markdown.ts'
import { scoreSkillMatch } from '../../src/services/skills/match.ts'
import { generateSkillDraft, type DraftNote } from '../../src/services/skills/generate.ts'
import {
  SKILL_MANIFEST_LIMITS,
  validateSkillStructure,
  type Skill,
} from '../../src/services/skills/types.ts'

const REAL_SKILL_DIR = path.resolve(import.meta.dirname, '../../skills')
const REAL_SKILL_ID = 'ai-code-review-gate'

const demoSkill: Skill = {
  skillId: 'demo-skill',
  name: '演示技能',
  domain: 'demo',
  version: '1.0.0',
  description: '用于验证落盘与往返',
  whenToUse: '当用户要求复现 XNLI 跨语言检索或使用低资源语言评测时使用',
  loadWhen: { keywords: ['XNLI', '跨语言检索'], taskTypes: ['复现', '评测'] },
  allowedTools: ['run-experiment'],
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
}

async function withTempStore<T>(run: (dir: string, store: ReturnType<typeof createSkillStore>) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'skills-test-'))
  try {
    return await run(dir, createSkillStore(dir))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('技能库 · 判据 1 手写真实技能能通过校验', () => {
  it('仓库里那一个技能七节齐全且已真人签收', async () => {
    const raw = await readFile(path.join(REAL_SKILL_DIR, REAL_SKILL_ID, 'SKILL.md'), 'utf8')
    const skill = parseSkillMarkdown(raw)
    assert.ok(skill, '真实技能的 SKILL.md 解析失败')
    assert.equal(skill.skillId, REAL_SKILL_ID)

    const validation = validateSkillStructure(skill)
    assert.deepEqual(validation.problems, [])
    assert.ok(validation.ok)

    assert.equal(skill.status, 'active')
    assert.ok(skill.reviewedBy?.trim(), 'active 却没有 reviewedBy —— 违反数据铁律 #4')
    assert.ok(skill.sections.failureModes.length >= 3)
  })

  it('落盘再读回无损', async () => {
    await withTempStore(async (_dir, store) => {
      const raw = await readFile(path.join(REAL_SKILL_DIR, REAL_SKILL_ID, 'SKILL.md'), 'utf8')
      const skill = parseSkillMarkdown(raw)
      assert.ok(skill)
      await store.save(skill)
      const loaded = await store.load(REAL_SKILL_ID)
      assert.ok(loaded)
      assert.deepEqual(loaded.sections, skill.sections)
      assert.equal(loaded.whenToUse, skill.whenToUse)
      assert.equal(loaded.status, skill.status)
      assert.equal(loaded.reviewedBy, skill.reviewedBy)
    })
  })

  it('序列化文本能被原样解析回来(往返一致)', () => {
    const text = serializeSkill(demoSkill)
    const back = parseSkillMarkdown(text)
    assert.ok(back)
    assert.deepEqual(back, demoSkill)
  })
})

describe('技能库 · 判据 2 缺节或失败模式不足则拒绝加载', () => {
  it('缺第 4 节 → 校验不通过且 load 返回 null', async () => {
    await withTempStore(async (dir, store) => {
      const missing: Skill = {
        ...demoSkill,
        sections: { ...demoSkill.sections, failureModes: [] },
      }
      const validation = validateSkillStructure(missing)
      assert.equal(validation.ok, false)
      await assert.rejects(() => store.save(missing), /校验不通过/)

      const brokenPath = path.join(dir, demoSkill.skillId)
      await writeFileQuiet(brokenPath, serializeSkill(missing))
      assert.equal(await store.load(demoSkill.skillId), null)
    })
  })

  it('失败模式少于 3 条 → 不通过', () => {
    const thin: Skill = {
      ...demoSkill,
      sections: { ...demoSkill.sections, failureModes: ['只有一条'] },
    }
    assert.equal(validateSkillStructure(thin).ok, false)
  })

  it('流程某步判据为空 → 不通过', () => {
    const noCriteria: Skill = {
      ...demoSkill,
      sections: {
        ...demoSkill.sections,
        workflow: [{ stage: '准备', input: '论文', action: '抽取', criteria: '  ' }],
      },
    }
    const validation = validateSkillStructure(noCriteria)
    assert.equal(validation.ok, false)
    assert.ok(validation.problems.some((p) => p.includes('criteria')))
  })

  it('active 但没有 reviewedBy → 不通过,写入被拒', async () => {
    await withTempStore(async (_dir, store) => {
      const unsigned: Skill = { ...demoSkill, status: 'active' }
      assert.ok(validateSkillStructure(unsigned).problems.some((p) => p.includes('reviewedBy')))
      await assert.rejects(() => store.save(unsigned), /reviewedBy/)
    })
  })

  it('乱文本解析成 null,不抛异常', () => {
    assert.equal(parseSkillMarkdown('not a skill'), null)
    assert.equal(parseSkillMarkdown(''), null)
    assert.equal(scoreSkillMatch(demoSkill, '完全无关的任务'), 0)
  })
})

describe('技能库 · 判据 3 manifest 超预算时压成纯名字', () => {
  it('超出 8000 字符后,尾部只剩 skillId', async () => {
    await withTempStore(async (_dir, store) => {
      const long = 'x'.repeat(400)
      for (let i = 0; i < 40; i++) {
        await store.save({
          ...demoSkill,
          skillId: `bulk-skill-${String(i).padStart(2, '0')}`,
          description: `第 ${i} 条描述 ${long}`,
        })
      }
      const manifest = await store.manifest()
      assert.ok(manifest.length <= SKILL_MANIFEST_LIMITS.maxChars, `manifest ${manifest.length} 超预算`)

      const lines = manifest.split('\n')
      const bare = lines.filter((line) => !line.includes(': '))
      assert.ok(bare.length > 0, '超预算后仍然全量输出,压缩没生效')
      assert.ok(bare.every((line) => line.startsWith('bulk-skill-')))
      assert.ok(lines.some((line) => line.includes(': ')), '前段应保留「id: 描述 — 何时用」')

      for (const line of lines.filter((l) => l.includes(': '))) {
        assert.ok(line.length <= SKILL_MANIFEST_LIMITS.maxCharsPerItem, `单条超 250: ${line.length}`)
      }
    })
  })

  it('未超预算时不压缩,正文不进 manifest', async () => {
    await withTempStore(async (_dir, store) => {
      await store.save(demoSkill)
      const manifest = await store.manifest()
      assert.ok(manifest.includes('demo-skill: '))
      assert.ok(!manifest.includes('忘记对齐语言'), 'manifest 里混进了正文,渐进披露失效')
    })
  })
})

describe('技能库 · 判据 4 match 抽 5 个任务命中 4 个', () => {
  const samples: { task: string; expect: string | null }[] = [
    { task: '帮我审一下 SciencePal 生成的这三个文件能不能合', expect: REAL_SKILL_ID },
    { task: '把 AI 写的代码跑一遍 verify 看看', expect: REAL_SKILL_ID },
    { task: '这段 AI 生成的产物要返工,给我编号清单', expect: REAL_SKILL_ID },
    { task: '这个外部 agent 的代码能不能合进仓库', expect: REAL_SKILL_ID },
    { task: '今晚吃什么', expect: null },
  ]

  it('真实仓库目录上 5 题至少对 4 题', async () => {
    const store = createSkillStore(REAL_SKILL_DIR)
    let correct = 0
    const wrong: string[] = []
    for (const { task, expect } of samples) {
      const matched = await store.match(task)
      const got = matched?.skillId ?? null
      if (got === expect) correct++
      else wrong.push(`${task} -> ${got ?? 'NONE'}(期望 ${expect ?? 'NONE'})`)
    }
    assert.deepEqual(wrong, [], `命中不足: ${String(correct)}/5`)
    assert.ok(correct >= 4, `只有 ${String(correct)}/5 命中`)
  })
})

async function writeFileQuiet(filePath: string, content: string): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises')
  await mkdir(filePath, { recursive: true })
  await writeFile(path.join(filePath, 'SKILL.md'), content, 'utf8')
}

const notes: DraftNote[] = [
  {
    noteId: 'n-method-1',
    page: 3,
    kind: 'method',
    description: '对比数据增强',
    text: '把源句与随机负例配对,用双塔编码器分别编码后算余弦。',
  },
  {
    noteId: 'n-method-2',
    page: 5,
    kind: 'method',
    description: '跨语言对齐评测',
    text: '对每种语言单独跑一遍检索,再对平均指标做显著性检验。',
  },
  { noteId: 'n-claim-1', page: 7, kind: 'claim', description: '翻译增强优于原文增强', text: '在 4 种语言上平均提升 3.1 个点。' },
  { noteId: 'n-result-1', page: 8, kind: 'result', description: 'XNLI recall@10', text: 'recall@10 = 0.712。' },
  { noteId: 'n-def-1', page: 2, kind: 'definition', description: 'pseudo-replication', text: '重复数增加了但独立性没增加。' },
  { noteId: 'n-lim-1', page: 9, kind: 'limitation', description: '负例采样偏置', text: '随机负例太简单时会高估模型,需按难度分层。' },
  { noteId: 'n-lim-2', page: 9, kind: 'limitation', description: '机翻噪声', text: '翻译引入的错误会被当成模型误差。' },
  { noteId: 'n-lim-3', page: 10, kind: 'limitation', description: '指标口径', text: '不同论文对 recall@k 的候选池定义不同,横向比较会失真。' },
]

const generateInput = {
  skillId: 'xnli-retrieval',
  name: '跨语言检索评测复现',
  domain: 'NLP / 检索',
  description: '复现 XNLI 跨语言检索评测时的判断力文件',
  whenToUse: '当用户询问低资源语言的检索增强、跨语言评测或 XNLI 复现时使用',
  keywords: ['XNLI', '跨语言检索'],
  taskTypes: ['复现', '评测'],
}

describe('技能库 · 判据 5 generate.ts 产出 needs_review 草案', () => {
  it('知识页聚合成草案:状态是 needs_review 且没有 reviewedBy', () => {
    const outcome = generateSkillDraft(generateInput, notes)
    assert.equal(outcome.skill.status, 'needs_review')
    assert.equal(outcome.skill.reviewedBy, undefined)
    assert.equal(outcome.skill.version, '0.1.0')

    const sections = outcome.skill.sections
    assert.equal(sections.workflow.length, 2)
    assert.ok(sections.workflow[0]?.criteria.includes('需人工确认'))
    assert.equal(sections.failureModes.length, 3)
    assert.equal(sections.terminology[0]?.term, 'pseudo-replication')
    assert.deepEqual(
      sections.evidenceIndex.map((e) => e.noteId),
      ['n-claim-1', 'n-result-1'],
    )
    assert.equal(outcome.skill.allowedTools.length, 0)
    assert.ok(outcome.validation.missing.includes('toolMapping'))
    assert.equal(outcome.validation.ok, false)
  })

  it('补齐第 3 节后草案可落盘,人工审核才转 active', async () => {
    await withTempStore(async (_dir, store) => {
      const outcome = generateSkillDraft({
        ...generateInput,
        toolMapping: [{ method: '对比数据增强', tool: 'run-experiment' }],
      }, notes)
      assert.ok(outcome.validation.ok, outcome.validation.problems.concat(outcome.validation.missing).join(';'))

      // 生成器的产物落盘后仍是 needs_review —— 它无权签字
      await store.save(outcome.skill)
      const draft = await store.load('xnli-retrieval')
      assert.ok(draft)
      assert.equal(draft.status, 'needs_review')
      assert.equal(draft.reviewedBy, undefined)
      assert.equal(draft.allowedTools.join(), 'run-experiment')

      // 没签名的 active 会被拦下
      const unsigned: Skill = { ...outcome.skill, status: 'active' }
      await assert.rejects(() => store.save(unsigned), /reviewedBy/)

      // 真人签名后才能转 active
      const reviewed: Skill = { ...outcome.skill, status: 'active', reviewedBy: 'B1eberz' }
      await store.save(reviewed)
      const loaded = await store.load('xnli-retrieval')
      assert.ok(loaded)
      assert.equal(loaded.status, 'active')
      assert.equal(loaded.reviewedBy, 'B1eberz')
      assert.deepEqual(loaded.sections, outcome.skill.sections)

      const matched = await store.match('帮我复现 XNLI 跨语言检索的评测')
      assert.equal(matched?.skillId, 'xnli-retrieval')
      assert.equal(await store.load('no-such-skill'), null)
    })
  })

  it('知识页里没有失败模式时,第 4 节空 → 校验不通过并写进 warnings', () => {
    const thin = notes.filter((note) => note.kind !== 'limitation')
    const outcome = generateSkillDraft(generateInput, thin)
    assert.equal(outcome.validation.ok, false)
    assert.ok(outcome.validation.missing.includes('failureModes'))
    assert.ok(outcome.warnings.some((w) => w.includes('第 4 节')))
    assert.ok(outcome.warnings.some((w) => w.includes('第 3 节')))
  })
})
