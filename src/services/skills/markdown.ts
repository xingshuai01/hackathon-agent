import { z } from 'zod'
import {
  SKILL_SECTION_KEYS,
  SKILL_SECTION_TITLES,
  type Skill,
  type SkillSectionKey,
} from './types.ts'

const statusSchema = z.enum(['draft', 'needs_review', 'active', 'incomplete'])

const domainMapItemSchema = z.object({
  concept: z.string(),
  note: z.string().optional(),
})

const workflowItemSchema = z.object({
  stage: z.string(),
  input: z.string(),
  action: z.string(),
  criteria: z.string(),
})

const toolMappingItemSchema = z.object({
  method: z.string(),
  tool: z.string(),
})

const terminologyItemSchema = z.object({
  term: z.string(),
  disambiguation: z.string(),
})

const evidenceIndexItemSchema = z.object({
  claim: z.string(),
  noteId: z.string(),
})

const sectionsSchema = z.object({
  domainMap: z.array(domainMapItemSchema),
  workflow: z.array(workflowItemSchema),
  toolMapping: z.array(toolMappingItemSchema),
  failureModes: z.array(z.string()),
  terminology: z.array(terminologyItemSchema),
  evidenceIndex: z.array(evidenceIndexItemSchema),
  negativeConstraints: z.array(z.string()),
})

const skillSchema = z.object({
  skillId: z.string(),
  name: z.string(),
  domain: z.string(),
  version: z.string(),
  description: z.string(),
  whenToUse: z.string(),
  loadWhen: z.object({
    keywords: z.array(z.string()),
    taskTypes: z.array(z.string()),
  }),
  allowedTools: z.array(z.string()),
  sections: sectionsSchema,
  status: statusSchema,
  reviewedBy: z.string().optional(),
})

type SkillOutput = z.infer<typeof skillSchema>

function singleLine(value: string): string {
  return value.replace(/\r?\n/g, ' ')
}

function findKeyByTitle(title: string): SkillSectionKey | null {
  for (const key of SKILL_SECTION_KEYS) {
    if (SKILL_SECTION_TITLES[key] === title) return key
  }
  return null
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function parseFrontMatter(lines: readonly string[]): Record<string, string> {
  const front: Record<string, string> = {}
  for (const line of lines) {
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key) front[key] = value
  }
  return front
}

function parseSections(lines: readonly string[]): Record<string, string[]> | null {
  const sections: Record<string, string[]> = {}
  let currentKey: SkillSectionKey | null = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('## ')) {
      const key = findKeyByTitle(trimmed.slice(3).trim())
      if (key === null) return null
      currentKey = key
      sections[key] = []
      continue
    }
    if (currentKey === null) continue
    if (trimmed === '') continue
    if (trimmed.startsWith('- ')) {
      const bucket = sections[currentKey]
      if (bucket !== undefined) bucket.push(trimmed.slice(2).trim())
    }
  }
  for (const key of SKILL_SECTION_KEYS) {
    if (!(key in sections)) return null
  }
  return sections
}

function parseStructured(raw: string[] | undefined): unknown[] | null {
  if (raw === undefined) return null
  const parsed = raw.map((item) => parseJson(item))
  if (parsed.some((item) => item === null)) return null
  return parsed
}

function toSkill(data: SkillOutput): Skill {
  return {
    skillId: data.skillId,
    name: data.name,
    domain: data.domain,
    version: data.version,
    description: data.description,
    whenToUse: data.whenToUse,
    loadWhen: data.loadWhen,
    allowedTools: data.allowedTools,
    sections: {
      domainMap: data.sections.domainMap.map((item) =>
        item.note === undefined ? { concept: item.concept } : { concept: item.concept, note: item.note },
      ),
      workflow: data.sections.workflow,
      toolMapping: data.sections.toolMapping,
      failureModes: data.sections.failureModes,
      terminology: data.sections.terminology,
      evidenceIndex: data.sections.evidenceIndex,
      negativeConstraints: data.sections.negativeConstraints,
    },
    status: data.status,
    ...(data.reviewedBy !== undefined ? { reviewedBy: data.reviewedBy } : {}),
  }
}

export function serializeSkill(skill: Skill): string {
  const front: string[] = [
    `skillId: ${singleLine(skill.skillId)}`,
    `name: ${singleLine(skill.name)}`,
    `domain: ${singleLine(skill.domain)}`,
    `version: ${singleLine(skill.version)}`,
    `description: ${singleLine(skill.description)}`,
    `whenToUse: ${singleLine(skill.whenToUse)}`,
    `loadWhen: ${JSON.stringify(skill.loadWhen)}`,
    `allowedTools: ${JSON.stringify(skill.allowedTools)}`,
    `status: ${skill.status}`,
  ]
  if (skill.reviewedBy !== undefined) {
    front.push(`reviewedBy: ${singleLine(skill.reviewedBy)}`)
  }

  const body: string[] = []
  for (const key of SKILL_SECTION_KEYS) {
    body.push(`## ${SKILL_SECTION_TITLES[key]}`)
    for (const item of skill.sections[key]) {
      if (typeof item === 'string') {
        body.push(`- ${singleLine(item)}`)
      } else {
        body.push(`- ${JSON.stringify(item)}`)
      }
    }
  }

  return `---
${front.join('\n')}
---

${body.join('\n')}
`
}

export function parseSkillMarkdown(raw: string): Skill | null {
  try {
    const trimmed = raw.replace(/^\uFEFF/, '')
    const lines = trimmed.split(/\r?\n/)
    if (lines[0]?.trim() !== '---') return null
    let end = -1
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === '---') {
        end = i
        break
      }
    }
    if (end < 0) return null
    const front = parseFrontMatter(lines.slice(1, end))
    const rawSections = parseSections(lines.slice(end + 1))
    if (rawSections === null) return null

    const loadWhen = parseJson(front['loadWhen'] ?? '')
    const allowedTools = parseJson(front['allowedTools'] ?? '')
    if (loadWhen === null || allowedTools === null) return null

    const domainMap = parseStructured(rawSections.domainMap)
    const workflow = parseStructured(rawSections.workflow)
    const toolMapping = parseStructured(rawSections.toolMapping)
    const terminology = parseStructured(rawSections.terminology)
    const evidenceIndex = parseStructured(rawSections.evidenceIndex)
    if (
      domainMap === null ||
      workflow === null ||
      toolMapping === null ||
      terminology === null ||
      evidenceIndex === null
    ) {
      return null
    }

    const candidate = {
      skillId: front['skillId'],
      name: front['name'],
      domain: front['domain'],
      version: front['version'],
      description: front['description'],
      whenToUse: front['whenToUse'],
      loadWhen,
      allowedTools,
      sections: {
        domainMap,
        workflow,
        toolMapping,
        failureModes: rawSections.failureModes ?? [],
        terminology,
        evidenceIndex,
        negativeConstraints: rawSections.negativeConstraints ?? [],
      },
      status: front['status'],
      reviewedBy: front['reviewedBy'],
    }
    const result = skillSchema.safeParse(candidate)
    if (!result.success) return null
    return toSkill(result.data)
  } catch {
    return null
  }
}
