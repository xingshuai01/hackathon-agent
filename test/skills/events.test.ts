import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createEventBus, type AgentEvent } from '../../src/ui/events.ts'
import { createSkillStore } from '../../src/services/skills/store.ts'
import { serializeSkill } from '../../src/services/skills/markdown.ts'
import type { Skill } from '../../src/services/skills/types.ts'

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    skillId: 'xnli-repro',
    name: 'XNLI 复现',
    domain: 'NLP',
    version: '1.0.0',
    description: '低资源语言跨语言检索与 XNLI 复现指南',
    whenToUse: '当用户询问低资源语言的检索增强、跨语言检索、或 XNLI 复现时使用',
    loadWhen: { keywords: ['XNLI', '跨语言检索', '低资源'], taskTypes: ['reproduce', 'retrieval'] },
    allowedTools: ['search', 'run'],
    sections: {
      domainMap: [
        { concept: 'XNLI', note: '跨语言自然语言推理基准' },
        { concept: '检索增强' },
      ],
      workflow: [
        { stage: '准备数据', input: '数据集', action: '下载并清洗', criteria: '数据完整可读' },
        { stage: '训练', input: '模型', action: '微调', criteria: '验证集达标' },
      ],
      toolMapping: [{ method: '检索', tool: 'search' }],
      failureModes: ['数据泄露导致虚高', '未做跨语言对齐', '评估集与训练集重叠'],
      terminology: [{ term: 'RAG', disambiguation: '检索增强生成,非检索增强' }],
      evidenceIndex: [{ claim: 'XNLI 覆盖 15 语言', noteId: 'kb-xnli' }],
      negativeConstraints: ['不要用测试集调参', '不要跳过人工审核'],
    },
    status: 'needs_review',
    ...overrides,
  }
}

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'skills-events-'))
  try {
    await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('load success emits exactly one skill_load with non-empty reason', async () => {
  await withTempDir(async (dir) => {
    const events = createEventBus()
    const store = createSkillStore(dir, { events })
    await store.save(makeSkill())
    const received: AgentEvent[] = []
    events.on((event) => received.push(event))
    const loaded = await store.load('xnli-repro')
    assert.ok(loaded !== null)
    const skillLoads = received.filter((e) => e.type === 'skill_load')
    assert.equal(skillLoads.length, 1)
    const ev = skillLoads[0]
    assert.ok(ev !== undefined)
    if (ev.type === 'skill_load') {
      assert.ok(ev.reason.length > 0)
      assert.equal(ev.skillId, 'xnli-repro')
      assert.equal(ev.name, 'XNLI 复现')
    }
  })
})

test('load of invalid skill returns null and emits zero events', async () => {
  await withTempDir(async (dir) => {
    const events = createEventBus()
    const store = createSkillStore(dir, { events })
    const base = makeSkill()
    const bad: Skill = {
      ...base,
      sections: {
        ...base.sections,
        failureModes: [],
      },
    }
    const skillDir = path.join(dir, 'xnli-repro')
    await mkdir(skillDir, { recursive: true })
    await writeFile(path.join(skillDir, 'SKILL.md'), serializeSkill(bad), 'utf8')
    const received: AgentEvent[] = []
    events.on((event) => received.push(event))
    const loaded = await store.load('xnli-repro')
    assert.equal(loaded, null)
    assert.equal(received.filter((e) => e.type === 'skill_load').length, 0)
  })
})

test('match hit emits exactly one skill_load with match basis in reason', async () => {
  await withTempDir(async (dir) => {
    const events = createEventBus()
    const store = createSkillStore(dir, { events })
    await store.save(makeSkill())
    const received: AgentEvent[] = []
    events.on((event) => received.push(event))
    const hit = await store.match('帮我复现 XNLI 的跨语言检索实验')
    assert.ok(hit !== null)
    const skillLoads = received.filter((e) => e.type === 'skill_load')
    assert.equal(skillLoads.length, 1)
    const ev = skillLoads[0]
    assert.ok(ev !== undefined)
    if (ev.type === 'skill_load') {
      assert.ok(ev.reason.includes('XNLI') || ev.reason.includes('跨语言检索'))
    }
  })
})

test('match no hit returns null and emits zero events', async () => {
  await withTempDir(async (dir) => {
    const events = createEventBus()
    const store = createSkillStore(dir, { events })
    await store.save(makeSkill())
    const received: AgentEvent[] = []
    events.on((event) => received.push(event))
    const miss = await store.match('写一首关于天气的诗')
    assert.equal(miss, null)
    assert.equal(received.filter((e) => e.type === 'skill_load').length, 0)
  })
})

test('list and manifest log bodyReads=0', async () => {
  await withTempDir(async (dir) => {
    const lines: string[] = []
    const store = createSkillStore(dir, { logger: (line) => lines.push(line) })
    await store.save(makeSkill())
    await store.list()
    await store.manifest()
    assert.ok(lines.some((l) => l.includes('bodyReads=0')), 'list/manifest should show bodyReads=0')
  })
})

test('list reads only metadata, not the full 200KB body', async () => {
  await withTempDir(async (dir) => {
    const lines: string[] = []
    const store = createSkillStore(dir, { logger: (line) => lines.push(line) })
    const base = makeSkill()
    const huge = makeSkill({
      sections: {
        ...base.sections,
        negativeConstraints: [new Array(200000).fill('x').join('')],
      },
    })
    const skillDir = path.join(dir, 'xnli-repro')
    await mkdir(skillDir, { recursive: true })
    const raw = serializeSkill(huge)
    await writeFile(path.join(skillDir, 'SKILL.md'), raw, 'utf8')
    const totalSize = Buffer.byteLength(raw)
    await store.list()
    const listLine = lines.find((l) => l.startsWith('list:'))
    assert.ok(listLine !== undefined)
    const match = /metadataBytes=(\d+)/.exec(listLine)
    assert.ok(match !== null)
    const metadataBytes = Number(match[1])
    assert.ok(
      metadataBytes < totalSize / 10,
      `metadataBytes=${metadataBytes} should be far less than totalSize=${totalSize}`,
    )
  })
})
