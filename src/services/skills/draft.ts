/**
 * 技能草案的落盘与晋升。
 *
 * ── 为什么草案不能直接 `store.save()` ──
 *
 * `SkillStore.save()` 会硬拦 `validateSkillStructure()` 不通过的技能,
 * 而 `generateSkillDraft()` 的产物**按设计**就是不合格的:
 * 它从知识页里能抄出领域地图、流程、失败模式,
 * 但抄不出「这一步的判据是什么」「这条方法对应哪个工具」——
 * 那些是踩过坑的人才知道的东西(README 的评审话术)。
 *
 * 于是产生一个真实的矛盾:
 *   草案必须落地(否则人工审核无从下手)
 *   草案必须过不了 save(否则未审技能就进了库)
 *
 * 解法是把草案写到 `skills/_drafts/` —— 它是 skills 目录下的子目录,
 * 但没有 `SKILL.md`,所以 `listSkillIds()` 会跳过它,
 * 技能库既不会被草案污染,人又能在固定位置找到待办。
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { parseSkillMarkdown, serializeSkill } from './markdown.ts'
import type { DraftOutcome } from './generate.ts'
import { SKILL_SECTION_TITLES, validateSkillStructure, type Skill, type SkillStore } from './types.ts'

/** 草案目录名。放在 skills/ 下,但因为没有 SKILL.md 不会被当成技能 */
export const DRAFT_DIR_NAME = '_drafts'

export interface DraftFile {
  readonly path: string
  readonly skillId: string
  /** 生成器自己承认没推出来的部分 —— 人工审核的清单 */
  readonly warnings: readonly string[]
}

function draftHeader(outcome: DraftOutcome, generatedAt: string): string {
  const lines = [
    '<!--',
    '  技能草案 · 自动生成,未经人工审核。',
    `  生成时间:${generatedAt}`,
    '',
    '  ★ 状态固定为 needs_review。补齐下面几项后才能进技能库:',
  ]
  if (outcome.warnings.length === 0) {
    lines.push('    (生成器未报缺项 —— 仍须人工确认判据是否真的可判断)')
  } else {
    for (const warning of outcome.warnings) lines.push(`    - ${warning}`)
  }
  lines.push(
    '',
    '  审核方式:补齐后运行',
    `    node src/main.ts skills promote ${outcome.skill.skillId}`,
    '  校验不通过会被拒绝写入,并列出还差什么。',
    '-->',
    '',
  )
  return lines.join('\n')
}

/**
 * 把草案写进 `dir/<skillId>.md`。已存在**覆盖**,因为草案是派生数据,
 * 重新生成比手工合并更可信(人改的内容应该晋升成正式技能,而不是留在草案里)。
 */
export async function writeSkillDraft(
  dir: string,
  outcome: DraftOutcome,
  options: { readonly now?: () => Date } = {},
): Promise<DraftFile> {
  const now = options.now ?? ((): Date => new Date())
  await mkdir(dir, { recursive: true })

  const path = join(dir, `${outcome.skill.skillId}.md`)
  const body = `${draftHeader(outcome, now().toISOString())}${serializeSkill(outcome.skill)}`
  await writeFile(path, body, 'utf8')

  return { path, skillId: outcome.skill.skillId, warnings: outcome.warnings }
}

/** 列出草案文件名(去掉 .md),供 CLI 展示 */
export async function listDrafts(dir: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name.slice(0, -3))
      .sort()
  } catch {
    return []
  }
}

/**
 * 剥掉文件头的 HTML 注释。
 *
 * `parseSkillMarkdown()` 的第一行必须是 `---`,而草案的头注释正好挡在那儿。
 * 这注释是给人看的(待办清单),不该让机器解析失败 ——
 * 第一次跑测试时 3 个用例全红,根因就是这里。
 */
function stripLeadingComment(raw: string): string {
  const trimmed = raw.replace(/^\uFEFF/, '')
  if (!trimmed.startsWith('<!--')) return trimmed
  const end = trimmed.indexOf('-->')
  if (end < 0) return trimmed
  return trimmed.slice(end + 3).replace(/^\r?\n/, '')
}

/** 读一份草案。解析失败返回 null(手改坏了不该让 CLI 崩) */
export async function readDraft(dir: string, skillId: string): Promise<Skill | null> {
  try {
    const raw = await readFile(join(dir, `${skillId}.md`), 'utf8')
    return parseSkillMarkdown(stripLeadingComment(raw))
  } catch {
    return null
  }
}

export type PromoteResult =
  | { readonly status: 'saved'; readonly skillId: string }
  | { readonly status: 'missing'; readonly skillId: string }
  | { readonly status: 'invalid'; readonly skillId: string; readonly problems: readonly string[] }

/**
 * 草案 → 正式技能。必须过 `save()` 的全套校验,这里只负责把
 * 「为什么没通过」讲清楚,而不是放宽标准。
 */
export async function promoteDraft(
  store: SkillStore,
  dir: string,
  skillId: string,
): Promise<PromoteResult> {
  const skill = await readDraft(dir, skillId)
  if (skill === null) return { status: 'missing', skillId }

  const validation = validateSkillStructure(skill)
  if (!validation.ok) {
    const problems = [
      ...validation.missing.map((key) => `第「${SKILL_SECTION_TITLES[key]}」整节为空`),
      ...validation.problems,
    ]
    return { status: 'invalid', skillId, problems }
  }

  try {
    await store.save(skill)
  } catch (error: unknown) {
    return { status: 'invalid', skillId, problems: [error instanceof Error ? error.message : String(error)] }
  }
  return { status: 'saved', skillId }
}
