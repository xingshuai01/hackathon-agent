import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import type { EventBus } from '../../ui/events.ts'
import {
  SKILL_MANIFEST_LIMITS,
  validateSkillStructure,
  type Skill,
  type SkillManifestItem,
  type SkillStore,
} from './types.ts'
import { parseSkillMarkdown, serializeSkill } from './markdown.ts'
import { matchEvidence, scoreSkillMatch } from './match.ts'

export type SkillStoreOptions = {
  readonly events?: EventBus
  readonly logger?: (line: string) => void
}

function readFrontMatterStream(
  filePath: string,
): Promise<{ front: Record<string, string> | null; bytesRead: number }> {
  return new Promise((resolve) => {
    const stream = createReadStream(filePath, { encoding: 'utf8', highWaterMark: 4096 })
    let buffer = ''
    let bytesRead = 0
    let front: Record<string, string> | null = null
    let state: 0 | 1 = 0
    let closed = false
    let done = false

    const finish = (result: { front: Record<string, string> | null; bytesRead: number }): void => {
      if (done) return
      done = true
      stream.destroy()
      resolve(result)
    }

    stream.on('data', (chunk: string | Buffer) => {
      if (done) return
      bytesRead += Buffer.byteLength(chunk)
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      buffer += text
      let newlineIndex: number
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '')
        buffer = buffer.slice(newlineIndex + 1)
        if (state === 0) {
          if (line.replace(/^\uFEFF/, '').trim() !== '---') {
            finish({ front: null, bytesRead })
            return
          }
          front = {}
          state = 1
          continue
        }
        if (line.trim() === '---') {
          closed = true
          finish({ front, bytesRead })
          return
        }
        if (front !== null) {
          const idx = line.indexOf(':')
          if (idx >= 0) {
            const key = line.slice(0, idx).trim()
            const value = line.slice(idx + 1).trim()
            if (key) front[key] = value
          }
        }
      }
    })

    stream.on('end', () => {
      finish({ front: closed ? front : null, bytesRead })
    })

    stream.on('error', () => {
      finish({ front: null, bytesRead })
    })
  })
}

function formatManifestItem(item: SkillManifestItem): string {
  const line = `${item.skillId}: ${item.description} — ${item.whenToUse}`
  if (line.length <= SKILL_MANIFEST_LIMITS.maxCharsPerItem) return line
  return line.slice(0, SKILL_MANIFEST_LIMITS.maxCharsPerItem)
}

export function createSkillStore(dir: string, options?: SkillStoreOptions): SkillStore {
  const events = options?.events
  const logger = options?.logger
  let metadataReads = 0
  let bodyReads = 0

  function emitSkillLoad(skill: Skill, reason: string): void {
    if (events === undefined) return
    try {
      events.emit({ type: 'skill_load', skillId: skill.skillId, name: skill.name, reason })
    } catch {
      // never let event emission affect store control flow
    }
  }

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

  async function readManifestItem(
    skillId: string,
  ): Promise<{ item: SkillManifestItem; bytesRead: number } | null> {
    const filePath = path.join(dir, skillId, 'SKILL.md')
    try {
      const { front, bytesRead } = await readFrontMatterStream(filePath)
      if (front === null) return null
      const description = front['description']
      const whenToUse = front['whenToUse']
      if (description === undefined || whenToUse === undefined) return null
      metadataReads += 1
      return { item: { skillId, description, whenToUse }, bytesRead }
    } catch {
      return null
    }
  }

  async function readSkill(skillId: string): Promise<Skill | null> {
    const filePath = path.join(dir, skillId, 'SKILL.md')
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      bodyReads += 1
      logger?.(`body: read ${skillId}, bodyReads=${bodyReads}`)
      const skill = parseSkillMarkdown(raw)
      if (skill === null) return null
      const validation = validateSkillStructure(skill)
      if (!validation.ok) return null
      return skill
    } catch {
      return null
    }
  }

  async function load(skillId: string): Promise<Skill | null> {
    const skill = await readSkill(skillId)
    if (skill !== null) {
      emitSkillLoad(skill, '显式加载技能')
    }
    return skill
  }

  async function list(): Promise<readonly SkillManifestItem[]> {
    const ids = await listSkillIds()
    const items: SkillManifestItem[] = []
    let metadataBytes = 0
    for (const id of ids) {
      const result = await readManifestItem(id)
      if (result !== null) {
        items.push(result.item)
        metadataBytes += result.bytesRead
      }
    }
    logger?.(`list: scanned ${ids.length} dirs, metadataReads=${metadataReads}, bodyReads=${bodyReads}, metadataBytes=${metadataBytes}`)
    return items
  }

  async function match(task: string): Promise<Skill | null> {
    const ids = await listSkillIds()
    let best: Skill | null = null
    let bestScore = 0
    let bestEvidence: readonly string[] = []
    for (const id of ids) {
      const skill = await readSkill(id)
      if (skill === null) continue
      const score = scoreSkillMatch(skill, task)
      if (score > bestScore) {
        bestScore = score
        best = skill
        bestEvidence = matchEvidence(skill, task)
      }
    }
    if (best !== null && bestScore > 0) {
      const reason = bestEvidence.length > 0 ? `按任务匹配,命中:${bestEvidence.join('、')}` : '按任务匹配'
      emitSkillLoad(best, reason)
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
    logger?.(`manifest: scanned ${items.length} dirs, metadataReads=${metadataReads}, bodyReads=${bodyReads}, compressed=${compressed}`)
    return parts.join('\n')
  }

  return { list, load, match, save, manifest }
}
