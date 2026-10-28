import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createEventBus } from '../../src/ui/events.ts'
import { serializeSkill } from '../../src/services/skills/markdown.ts'
import { createSkillStore } from '../../src/services/skills/store.ts'
import type { Skill } from '../../src/services/skills/types.ts'

/**
 * `match()` 的验收:STRUCTURE.md 要求「抽 5 个任务,≥4 次匹配正确」。
 *
 * 这里用 4 个合成技能 + 5 个任务,验证它真的能按 `whenToUse` / `keywords`
 * 挑对人,而不是「有匹配就算」。
 */

function makeSkill(id: string, whenToUse: string, keywords: readonly string[], taskTypes: readonly string[]): Skill {
  return {
    skillId: id,
    name: id,
    domain: 'acceptance',
    version: '1.0.0',
    description: `${id} 的验收用技能`,
    whenToUse,
    loadWhen: { keywords, taskTypes },
    allowedTools: [],
    status: 'needs_review',
    sections: {
      domainMap: [{ concept: '节点' }],
      workflow: [{ stage: '准备', input: '输入', action: '动作', criteria: '判据' }],
      toolMapping: [{ method: '方法', tool: 'echo' }],
      failureModes: ['失败一', '失败二', '失败三'],
      terminology: [{ term: '术语', disambiguation: '消歧' }],
      evidenceIndex: [{ claim: '断言', noteId: 'p1#abc' }],
      negativeConstraints: ['不要乱来'],
    },
  }
}

const SKILLS: readonly Skill[] = [
  makeSkill(
    'xnli-repro',
    '当用户要求复现 XNLI 跨语言检索实验,或比较低资源语言的检索增强方法时使用',
    ['XNLI', '跨语言检索', '复现'],
    ['实验复现'],
  ),
  makeSkill(
    'code-review-gate',
    '当有人把外部 AI 生成的代码放进仓库,需要判断能不能合入时使用',
    ['代码审查', '合入', 'AI 生成'],
    ['代码审查'],
  ),
  makeSkill(
    'rag-long-doc',
    '当任务涉及长文档问答、需要设计 RAG 检索链路时使用',
    ['RAG', '长文档问答', '检索链路'],
    ['方案设计'],
  ),
  makeSkill(
    'metric-calc',
    '当需要计算或核对 F1、EM、BLEU 等评测指标时使用',
    ['F1', 'EM', '指标计算'],
    ['指标核对'],
  ),
]

const TASKS: readonly { task: string; expect: string }[] = [
  { task: '帮我复现 XNLI 跨语言检索那个实验', expect: 'xnli-repro' },
  { task: '这段 AI 生成的代码能不能合入主干', expect: 'code-review-gate' },
  { task: '给一份 200 页的长文档问答设计 RAG 检索链路', expect: 'rag-long-doc' },
  { task: '这个表格里的 F1 指标怎么算出来的', expect: 'metric-calc' },
  { task: '帮我核对一下论文里报告的 EM 指标', expect: 'metric-calc' },
]

async function withSkillLibrary<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'skill-match-'))
  try {
    for (const skill of SKILLS) {
      await mkdir(path.join(dir, skill.skillId), { recursive: true })
      await writeFile(path.join(dir, skill.skillId, 'SKILL.md'), serializeSkill(skill), 'utf8')
    }
    return await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('match · 命中率验收', () => {
  it('5 个任务至少 4 次命中正确技能', async () => {
    await withSkillLibrary(async (dir) => {
      const store = createSkillStore(dir)

      let correct = 0
      const misses: string[] = []
      for (const { task, expect } of TASKS) {
        const hit = await store.match(task)
        if (hit?.skillId === expect) correct += 1
        else misses.push(`「${task}」期望 ${expect},实际 ${hit?.skillId ?? '无'}`)
      }

      assert.ok(
        correct >= 4,
        `命中 ${String(correct)}/${String(TASKS.length)},低于 4;未命中:${misses.join(';')}`,
      )
    })
  })

  it('完全无关的任务返回 null,而不是硬挑一个', async () => {
    await withSkillLibrary(async (dir) => {
      const store = createSkillStore(dir)
      const hit = await store.match('今天中午吃什么')
      assert.equal(hit, null)
    })
  })

  it('命中时给出理由,便于向用户解释「为什么加载这个技能」', async () => {
    await withSkillLibrary(async (dir) => {
      const events: { type: string; skillId?: string; reason?: string }[] = []
      const bus = createEventBus()
      bus.on((event) => {
        events.push(event as { type: string; skillId?: string; reason?: string })
      })
      const store = createSkillStore(dir, { events: bus })

      await store.match('帮我复现 XNLI 跨语言检索')

      const loaded = events.filter((event) => event.type === 'skill_load')
      assert.equal(loaded.length, 1)
      assert.equal(loaded[0]?.skillId, 'xnli-repro')
      assert.match(loaded[0]?.reason ?? '', /命中:/)
    })
  })
})
