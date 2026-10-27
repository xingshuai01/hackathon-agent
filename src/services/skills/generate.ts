import {
  MIN_FAILURE_MODES,
  SKILL_SECTION_KEYS,
  SKILL_SECTION_TITLES,
  validateSkillStructure,
  type Skill,
  type SkillSections,
  type SkillValidation,
} from './types.ts'

/**
 * 生成器的输入:来自模块 A 的知识页。
 *
 * 契约禁止 `import '../knowledge/*'`,所以这里按结构对齐 AtomicNote 的字段,
 * A 落地的 AtomicNote 可以直接传进来(结构化子类型)。
 */
export type DraftNote = {
  readonly noteId: string
  readonly page: number
  readonly kind: 'claim' | 'method' | 'result' | 'limitation' | 'definition'
  readonly description: string
  readonly text: string
}

export type GenerateInput = {
  readonly skillId: string
  readonly name: string
  readonly domain: string
  readonly description: string
  readonly whenToUse: string
  readonly keywords?: readonly string[]
  readonly taskTypes?: readonly string[]
  /**
   * 方法 → 工具名映射。只能由调用方给(B 模块的 registry),生成器不猜工具名。
   * 不给则第 3 节留空,由 warnings 报出来。
   */
  readonly toolMapping?: readonly { readonly method: string; readonly tool: string }[]
}

export type DraftOutcome = {
  readonly skill: Skill
  readonly validation: SkillValidation
  /** 生成器无法从知识页推出、必须人工补的部分 */
  readonly warnings: readonly string[]
}

const MAX_TEXT = 160
const DRAFT_PLACEHOLDER = '（草案·需人工确认）'

function clip(value: string): string {
  const oneLine = value.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= MAX_TEXT) return oneLine
  return `${oneLine.slice(0, MAX_TEXT - 1)}…`
}

function pick(notes: readonly DraftNote[], kind: DraftNote['kind']): DraftNote[] {
  return notes.filter((note) => note.kind === kind)
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
}

function buildSections(notes: readonly DraftNote[], toolMapping: GenerateInput['toolMapping']): SkillSections {
  const methods = pick(notes, 'method')
  const claims = pick(notes, 'claim')
  const definitions = pick(notes, 'definition')
  const limitations = pick(notes, 'limitation')
  const evidences = notes.filter((note) => note.kind === 'claim' || note.kind === 'result')

  const concepts: { concept: string; note: string }[] = []
  const seenConcepts = new Set<string>()
  for (const note of [...methods, ...claims]) {
    const concept = clip(note.description)
    if (seenConcepts.has(concept)) continue
    seenConcepts.add(concept)
    concepts.push({ concept, note: clip(note.text) })
  }

  const workflow: SkillSections['workflow'] = methods.map((note, index) => ({
    stage: `${String(index + 1)}. ${clip(note.description)}`,
    input: DRAFT_PLACEHOLDER,
    action: clip(note.text),
    criteria: `知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 ${DRAFT_PLACEHOLDER}`,
  }))

  const failureModes = unique(
    limitations.map((note) => `${clip(note.description)}:${clip(note.text)}`),
  )

  return {
    domainMap: concepts,
    workflow,
    toolMapping: toolMapping ?? [],
    failureModes,
    terminology: definitions.map((note) => ({
      term: clip(note.description),
      disambiguation: clip(note.text),
    })),
    evidenceIndex: evidences.map((note) => ({ claim: clip(note.description), noteId: note.noteId })),
    negativeConstraints: unique(
      limitations.map((note) => `不要忽略「${clip(note.description)}」这一已知局限,除非有新的证据`),
    ),
  }
}

function missingSectionWarnings(sections: SkillSections): string[] {
  const warnings: string[] = []
  for (const key of SKILL_SECTION_KEYS) {
    if (sections[key].length > 0) continue
    const ordinal = SKILL_SECTION_KEYS.indexOf(key) + 1
    const reason =
      key === 'toolMapping'
        ? '需要 B 模块的真实工具名清单才能填,生成器不猜工具名'
        : '知识页里没有对应内容,需人工补写'
    warnings.push(`第 ${String(ordinal)} 节「${SKILL_SECTION_TITLES[key]}」为空:${reason}`)
  }
  if (sections.failureModes.length > 0 && sections.failureModes.length < MIN_FAILURE_MODES) {
    warnings.push(
      `第 4 节只有 ${String(sections.failureModes.length)} 条失败模式,少于 ${String(MIN_FAILURE_MODES)} 条下限:草案不足以拦截真实翻车`,
    )
  }
  return warnings
}

/**
 * 知识页 → 技能草案。产物永远是 `needs_review`,生成器无权签字。
 *
 * 校验通常不通过 —— 这是设计如此:缺的那些节会出现在 `warnings` 里,
 * 由审核人补完后才能 `store.save()`。
 */
export function generateSkillDraft(input: GenerateInput, notes: readonly DraftNote[]): DraftOutcome {
  const sections = buildSections(notes, input.toolMapping)

  const skill: Skill = {
    skillId: input.skillId,
    name: input.name,
    domain: input.domain,
    version: '0.1.0',
    description: input.description,
    whenToUse: input.whenToUse,
    loadWhen: {
      keywords: unique(input.keywords ?? []),
      taskTypes: unique(input.taskTypes ?? []),
    },
    allowedTools: unique((input.toolMapping ?? []).map((entry) => entry.tool)),
    sections,
    status: 'needs_review',
  }

  return { skill, validation: validateSkillStructure(skill), warnings: missingSectionWarnings(sections) }
}
