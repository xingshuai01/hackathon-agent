/**
 * C 模块的「接电」层:把 `Skill` 正文渲染成可注入 prompt 的片段。
 *
 * ── 为什么需要这一层 ──
 *
 * `SkillStore.manifest()` 只给**元数据**(name / description / whenToUse),
 * 这是渐进式披露的第一级:常驻上下文便宜,模型据此判断"要不要用这个技能"。
 * 但判断出"要用"之后,它还需要正文才知道「第一步做什么、判据是什么、
 * 我是不是正在踩第 4 节那个坑」。
 *
 * 没有这一层,技能清单等于一张只有书名的目录 —— 模型知道有这本书,
 * 但翻不开,于是只能凭自己的先验发挥,技能库等于没接。
 *
 * ── 为什么不写在 agent/prompt.ts ──
 *
 * `prompt.ts` 属骨架,它只需要认识一个字符串(`skillManifest`)。
 * 技能正文怎么排版、哪节优先、超预算怎么截,是 C 模块自己的事;
 * 放在骨架里会让「改技能版式」变成「动骨架」。
 */

import {
  SKILL_SECTION_KEYS,
  SKILL_SECTION_TITLES,
  type Skill,
  type SkillSectionKey,
  type SkillSections,
} from './types.ts'

/** 正文注入预算。清单(8k)之外再给 4k:一个技能不该把上下文吃光 */
export const SKILL_BODY_LIMITS = {
  maxChars: 4_000,
  /** 每节最多渲染几条。领域地图本来就 10~20 条,全渲染会淹没流程 */
  maxItemsPerSection: 8,
} as const

export interface RenderSkillOptions {
  readonly maxChars?: number
  readonly maxItemsPerSection?: number
}

/**
 * 一节的渲染结果。`undefined` 表示这节没有内容,整节跳过 ——
 * 空节渲染成「(空)」只是噪声,不给模型任何可执行信息。
 */
function renderSection(skill: Skill, key: SkillSectionKey, limit: number): string | undefined {
  const sections: SkillSections = skill.sections
  const title = SKILL_SECTION_TITLES[key]
  const lines: string[] = []

  switch (key) {
    case 'domainMap': {
      for (const item of sections.domainMap.slice(0, limit)) {
        lines.push(item.note === undefined ? `- ${item.concept}` : `- ${item.concept} —— ${item.note}`)
      }
      break
    }
    case 'workflow': {
      // 字段名省略不写:prompt 里放标签是给模型看的,不是给人查表的
      sections.workflow.slice(0, limit).forEach((stage, index) => {
        lines.push(`${String(index + 1)}. **${stage.stage}**`)
        if (stage.input.trim() !== '') lines.push(`   输入:${stage.input}`)
        if (stage.action.trim() !== '') lines.push(`   动作:${stage.action}`)
        // 判据是这一节的全部价值所在,永远渲染(哪怕为空也要留痕,让模型知道这里没定)
        lines.push(`   判据:${stage.criteria.trim() === '' ? '(未定义 —— 这一步不满足「可判断」要求)' : stage.criteria}`)
      })
      break
    }
    case 'toolMapping': {
      for (const item of sections.toolMapping.slice(0, limit)) {
        lines.push(`- ${item.method} → \`${item.tool}\``)
      }
      break
    }
    case 'failureModes': {
      for (const item of sections.failureModes.slice(0, limit)) lines.push(`- ${item}`)
      break
    }
    case 'terminology': {
      for (const item of sections.terminology.slice(0, limit)) {
        lines.push(`- **${item.term}**:${item.disambiguation}`)
      }
      break
    }
    case 'evidenceIndex': {
      for (const item of sections.evidenceIndex.slice(0, limit)) {
        // noteId 一并给出:模型引用时能带上锚点,而不是笼统说「有研究表明」
        lines.push(`- ${item.claim}(证据:${item.noteId})`)
      }
      break
    }
    case 'negativeConstraints': {
      for (const item of sections.negativeConstraints.slice(0, limit)) lines.push(`- ${item}`)
      break
    }
  }

  if (lines.length === 0) return undefined
  const total = sections[key].length
  const omitted = total - Math.min(total, limit)
  const suffix = omitted > 0 ? `\n  …(另有 ${String(omitted)} 条未展示)` : ''
  return `**${title}**\n${lines.join('\n')}${suffix}`
}

/**
 * 把技能渲染成 prompt 片段。**保持七节顺序** —— 顺序本身就是写作要求:
 * 先有领域地图,才有流程;流程之后才是工具映射;失败模式必须紧跟工具,
 * 因为它们说的是「用这些工具时最容易怎么错」。
 *
 * 超预算时从后往前丢整节(证据索引、术语消歧先丢),并显式标注丢了什么 ——
 * 静默截断会让模型以为技能只有三节。
 */
export function renderSkillForPrompt(skill: Skill, options: RenderSkillOptions = {}): string {
  const maxChars = options.maxChars ?? SKILL_BODY_LIMITS.maxChars
  const limit = options.maxItemsPerSection ?? SKILL_BODY_LIMITS.maxItemsPerSection

  const blocks: string[] = [
    `### 技能:${skill.name}(${skill.skillId} · v${skill.version})`,
    skill.description,
    `**适用场景**:${skill.whenToUse}`,
  ]

  const rendered = SKILL_SECTION_KEYS.map((key) => renderSection(skill, key, limit)).filter(
    (block): block is string => block !== undefined,
  )

  // 从低价值到高价值排序丢:证据索引/术语 → 领域地图 → 工具映射 …
  // 但 workflow 与 failureModes 永远保留,它们是这个技能之所以存在的理由
  const droppable = new Set<SkillSectionKey>(['evidenceIndex', 'terminology', 'domainMap', 'toolMapping'])
  const dropped: string[] = []

  let used = blocks.join('\n').length
  const kept: string[] = []
  for (const block of rendered) {
    if (used + block.length + 2 <= maxChars) {
      kept.push(block)
      used += block.length + 2
      continue
    }
    // 定不住是哪一节被丢,按标题前缀反查
    const key = SKILL_SECTION_KEYS.find((candidate) => block.startsWith(`**${SKILL_SECTION_TITLES[candidate]}**`))
    if (key !== undefined && !droppable.has(key)) {
      // 关键节超预算:宁可整体超,也不丢判据与失败模式
      kept.push(block)
      used += block.length + 2
      continue
    }
    dropped.push(key === undefined ? '未知节' : SKILL_SECTION_TITLES[key])
  }

  // 省略提示放末尾:它是对「上面为什么少了这几节」的注脚,
  // 放正文之前会让人先读到「缺了什么」再读到「有什么」,顺序反了
  const omittedNote =
    dropped.length === 0
      ? null
      : `…(因上下文预算省略:${dropped.join('、')}。需要全文用 \`skills check\` 查看)`

  return [...blocks, ...kept, ...(omittedNote === null ? [] : [omittedNote])].join('\n\n')
}

/** 技能是否值得注入正文:校验通过才算「可用」 */
export function isLoadableSkill(skill: Skill): boolean {
  return skill.status === 'active' || skill.status === 'needs_review'
}
