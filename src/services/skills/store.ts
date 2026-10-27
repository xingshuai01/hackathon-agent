import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  SKILL_MANIFEST_LIMITS,
  validateSkillStructure,
  type Skill,
  type SkillManifestItem,
  type SkillStore,
} from './types.ts'
import { parseSkillMarkdown, serializeSkill } from './markdown.ts'
import { scoreSkillMatch } from './match.ts'

function extractFrontMatter(raw: string): Record<string, string> | null {
  const trimmed = raw.replace(/^\uFEFF/, '')
  const lines = trimmed.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return null
  const front: Record<string, string> = {}
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) break
    if (line.trim() === '---') break
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key) front[key] = value
  }
  return front
}

function formatManifestItem(item: SkillManifestItem): string {
  const line = `${item.skillId}: ${item.description} — ${item.whenToUse}`
  if (line.length <= SKILL_MANIFEST_LIMITS.maxCharsPerItem) return line
  return line.slice(0, SKILL_MANIFEST_LIMITS.maxCharsPerItem)
}

export function createSkillStore(dir: string): SkillStore {
  async function listSkillIds(): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      const ids: string[] = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const skillFile = path.join(dir, entry.name, 'SKILL.md')
        try {
          const stat = await fs.stat(skillFile)
          if (stat.isFile()) ids.push(entry.name)
        } catch {
          // not a skill directory
        }
      }
      return ids
    } catch {
      return []
    }
  }

  async function readManifestItem(skillId: string): Promise<SkillManifestItem | null> {
    const filePath = path.join(dir, skillId, 'SKILL.md')
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const front = extractFrontMatter(raw)
      if (front === null) return null
      const description = front['description']
      const whenToUse = front['whenToUse']
      if (description === undefined || whenToUse === undefined) return null
      return { skillId, description, whenToUse }
    } catch {
      return null
    }
  }

  async function load(skillId: string): Promise<Skill | null> {
    const filePath = path.join(dir, skillId, 'SKILL.md')
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const skill = parseSkillMarkdown(raw)
      if (skill === null) return null
      const validation = validateSkillStructure(skill)
      if (!validation.ok) return null
      return skill
    } catch {
      return null
    }
  }

  async function list(): Promise<readonly SkillManifestItem[]> {
    const ids = await listSkillIds()
    const items: SkillManifestItem[] = []
    for (const id of ids) {
      const item = await readManifestItem(id)
      if (item !== null) items.push(item)
    }
    return items
  }

  async function match(task: string): Promise<Skill | null> {
    const ids = await listSkillIds()
    let best: Skill | null = null
    let bestScore = 0
    for (const id of ids) {
      const skill = await load(id)
      if (skill === null) continue
      const score = scoreSkillMatch(skill, task)
      if (score > bestScore) {
        bestScore = score
        best = skill
      }
    }
    return bestScore > 0 ? best : null
  }

  async function save(skill: Skill): Promise<void> {
    const validation = validateSkillStructure(skill)
    if (!validation.ok) {
      throw new Error(`技能校验不通过,拒绝写入:${validation.problems.join(';')}`)
    }
    if (skill.status === 'active' && !skill.reviewedBy?.trim()) {
      throw new Error('status=active 但缺少 reviewedBy —— 数据铁律 #4:技能必须人工审核')
    }
    const skillDir = path.join(dir, skill.skillId)
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), serializeSkill(skill), 'utf8')
  }

  async function manifest(): Promise<string> {
    const items = await list()
    const parts: string[] = []
    let total = 0
    let compressed = false
    for (const item of items) {
      if (!compressed) {
        const line = formatManifestItem(item)
        const cost = line.length + 1
        if (total + cost > SKILL_MANIFEST_LIMITS.maxChars) {
          compressed = true
        } else {
          parts.push(line)
          total += cost
          continue
        }
      }
      const name = item.skillId
      const cost = name.length + 1
      if (total + cost > SKILL_MANIFEST_LIMITS.maxChars) break
      parts.push(name)
      total += cost
    }
    return parts.join('\n')
  }

  return { list, load, match, save, manifest }
}
