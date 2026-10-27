/**
 * ★★★ 冻结契约 #4-B · 技能库契约(模块 C)★★★
 *
 * 变更规则:改动本文件的**任何已导出签名**都必须走 PR 且经 1 人 approve。
 * 依据:docs/SDD.md §4.4、§9;源码参考 `loadSkillsDir.ts:100-105`(元数据预算)、
 *       `SkillTool/prompt.ts:21-40`(1% 上下文预算)、`bundled/skillify.ts:96-146`(正文模板)
 * 对应任务:Issue #21、#33、#34
 *
 * ── 数据铁律 #4 ──
 * **技能未经人工审核不得转 `active`。**
 * 理由:技能是长期资产,一个错误的技能会持续污染 agent 的判断,
 * 而审核成本只是「看一遍」。
 *
 * ── 这份契约最想防的事 ──
 * 技能**写成综述**。综述回答「这个领域有什么」,技能回答「我该怎么做、什么时候会翻车」。
 * 七节结构里的「失败模式」与「负向约束」就是分水岭 —— 综述型文档通常没有这两节。
 */

// ─────────────────────────────────────────────────────────────
// 1. 状态
// ─────────────────────────────────────────────────────────────

export type SkillStatus =
  /** 生成器产出的原始草案 */
  | 'draft'
  /** 七节齐全但未经人审核 */
  | 'needs_review'
  /** 审核通过,可被加载 */
  | 'active'
  /** 缺节或某节不合格,**拒绝加载** */
  | 'incomplete'

// ─────────────────────────────────────────────────────────────
// 2. 七节结构
// ─────────────────────────────────────────────────────────────

/**
 * 技能的七节内容。**七节缺一即 `incomplete`**。
 *
 * 字段名用英文是为了程序处理;每节的中文语义见下方注释,
 * 写文件时用中文标题(见 SDD §9.2)。
 */
export interface SkillSections {
  /**
   * 一、领域地图 —— 这个领域的 10~20 个关键概念节点。
   * 最多 20 个:再多的读者记不住,也挤占上下文。
   */
  readonly domainMap: readonly { readonly concept: string; readonly note?: string }[]

  /**
   * 二、标准流程 —— **每个阶段必须有 `criteria`(判据)**。
   * 没有判据的流程等于「随便做」,这是技能最常见的偷懒点。
   */
  readonly workflow: readonly {
    readonly stage: string
    readonly input: string
    readonly action: string
    /** 判据:满足什么才算这一步做完了 / 该不该继续 */
    readonly criteria: string
  }[]

  /**
   * 三、方法 → 工具映射 —— 把判断落到 B 模块的具体工具上。
   * `tool` 必须是 registry 里真实存在的工具名(校验时会检查)。
   */
  readonly toolMapping: readonly { readonly method: string; readonly tool: string }[]

  /**
   * 四、常见失败模式 ★ **最有价值的一节** —— 至少 3 条。
   * 判据:每条都要能让读者判断「我是不是正在踩这个坑」。
   */
  readonly failureModes: readonly string[]

  /** 五、术语消歧 —— 同名不同义的概念,防误用 */
  readonly terminology: readonly { readonly term: string; readonly disambiguation: string }[]

  /**
   * 六、证据索引 —— 每条论断指向 A 知识库的具体知识页。
   * `noteId` 必须真实存在(供 UI 做锚点跳转)。
   */
  readonly evidenceIndex: readonly { readonly claim: string; readonly noteId: string }[]

  /** 七、负向约束 —— 明确「不要做什么」,防模型过度发挥 */
  readonly negativeConstraints: readonly string[]
}

/** 七节的键名。校验与 UI 渲染共用,新增一节必须同步这里 */
export const SKILL_SECTION_KEYS = [
  'domainMap',
  'workflow',
  'toolMapping',
  'failureModes',
  'terminology',
  'evidenceIndex',
  'negativeConstraints',
] as const satisfies readonly (keyof SkillSections)[]

export type SkillSectionKey = (typeof SKILL_SECTION_KEYS)[number]

/** 每节的中文标题,写 Markdown 时用 */
export const SKILL_SECTION_TITLES: Readonly<Record<SkillSectionKey, string>> = {
  domainMap: '一、领域地图',
  workflow: '二、标准流程',
  toolMapping: '三、方法→工具映射',
  failureModes: '四、常见失败模式',
  terminology: '五、术语消歧',
  evidenceIndex: '六、证据索引',
  negativeConstraints: '七、负向约束',
}

// ─────────────────────────────────────────────────────────────
// 3. 技能
// ─────────────────────────────────────────────────────────────

/**
 * 技能。对应磁盘上的 `skills/<skillId>/SKILL.md`。
 *
 * **常驻上下文的只有 `name` + `description` + `whenToUse`**(渐进式披露,DEC-023)。
 * 正文(sections)是懒加载的,不出现在 system prompt 里 ——
 * 依据:`loadSkillsDir.ts:100-105` 的 `estimateSkillFrontmatterTokens` 只统计这三个字段。
 */
export interface Skill {
  readonly skillId: string
  readonly name: string
  readonly domain: string
  readonly version: string
  /** 一句话描述,用于清单展示 */
  readonly description: string
  /**
   * 自动触发条件。**必须包含具体触发短语**,例:
   * 「当用户询问低资源语言的检索增强、跨语言检索、或 XNLI 复现时使用」
   * 不要写成「用于 NLP」这种无法匹配的废话。
   */
  readonly whenToUse: string
  /** 结构化匹配条件,与 whenToUse 互为补充 */
  readonly loadWhen: {
    readonly keywords: readonly string[]
    readonly taskTypes: readonly string[]
  }
  /** 工具白名单,取最小权限(采纳 `allowed-tools` 的做法) */
  readonly allowedTools: readonly string[]
  readonly sections: SkillSections
  readonly status: SkillStatus
  /** 审核人。`status === 'active'` 时必填(数据铁律 #4) */
  readonly reviewedBy?: string
}

// ─────────────────────────────────────────────────────────────
// 4. 校验(数据铁律的可执行形式)
// ─────────────────────────────────────────────────────────────

export type SkillValidation = {
  ok: boolean
  /** 缺失的节 */
  missing: readonly SkillSectionKey[]
  /** 不合格的原因 */
  problems: readonly string[]
}

/** 失败模式最少条数。定 3 是底线:1 条等于没写,2 条勉强,3 条才开始有区分度 */
export const MIN_FAILURE_MODES = 3

/**
 * 校验技能结构。`SkillStore.save()` 与 `load()` 都应调用。
 *
 * 检查:
 * - 七节齐全
 * - 失败模式 ≥ 3 条(数据铁律)
 * - 标准流程每阶段都有判据
 * - `active` 状态必须有审核人
 */
export function validateSkillStructure(
  skill: Skill,
  options?: {
    /** 传入 registry 里真实存在的工具名,用于校验第 3 节的引用是否有效 */
    knownTools?: readonly string[]
    /** 传入知识库里真实存在的 noteId,用于校验第 6 节的引用是否有效 */
    knownNoteIds?: readonly string[]
  },
): SkillValidation {
  const problems: string[] = []
  const missing: SkillSectionKey[] = []

  for (const key of SKILL_SECTION_KEYS) {
    const value = skill.sections[key]
    if (!Array.isArray(value) || value.length === 0) missing.push(key)
  }

  if (!missing.includes('failureModes') && skill.sections.failureModes.length < MIN_FAILURE_MODES) {
    problems.push(
      `第 4 节「常见失败模式」只有 ${skill.sections.failureModes.length} 条,至少要 ${MIN_FAILURE_MODES} 条`,
    )
  }

  if (!missing.includes('workflow')) {
    const noCriteria = skill.sections.workflow.filter((stage) => !stage.criteria.trim())
    if (noCriteria.length > 0) {
      problems.push(
        `第 2 节有 ${noCriteria.length} 个阶段缺少判据(criteria):${noCriteria
          .map((stage) => stage.stage)
          .join('、')}`,
      )
    }
  }

  if (options?.knownTools) {
    const known = new Set(options.knownTools)
    const unknown = skill.sections.toolMapping.map((m) => m.tool).filter((tool) => !known.has(tool))
    if (unknown.length > 0) {
      problems.push(`第 3 节引用了不存在的工具:${[...new Set(unknown)].join('、')}`)
    }
  }

  if (options?.knownNoteIds) {
    const known = new Set(options.knownNoteIds)
    const unknown = skill.sections.evidenceIndex
      .map((e) => e.noteId)
      .filter((noteId) => !known.has(noteId))
    if (unknown.length > 0) {
      problems.push(`第 6 节引用了不存在的知识页:${[...new Set(unknown)].join('、')}`)
    }
  }

  if (skill.status === 'active' && !skill.reviewedBy?.trim()) {
    problems.push('status=active 但缺少 reviewedBy —— 数据铁律 #4:技能必须人工审核')
  }

  if (!skill.whenToUse.trim() || skill.whenToUse.trim().length < 8) {
    problems.push('whenToUse 太短,无法用于匹配(需写清触发场景,而非「用于某领域」)')
  }

  return { ok: missing.length === 0 && problems.length === 0, missing, problems }
}

// ─────────────────────────────────────────────────────────────
// 5. 存储与上下文注入
// ─────────────────────────────────────────────────────────────

/** 清单项。这是**唯一**会进常驻上下文的部分 */
export interface SkillManifestItem {
  readonly skillId: string
  readonly description: string
  readonly whenToUse: string
}

/**
 * 技能存储。对应磁盘 `skills/<skillId>/SKILL.md`。
 */
export interface SkillStore {
  /** 只读元数据,不读正文 —— 启动阶段调用,必须快 */
  list(): Promise<readonly SkillManifestItem[]>
  /** 读正文并校验。返回 null 表示不存在或校验不通过 */
  load(skillId: string): Promise<Skill | null>
  /**
   * 按任务匹配技能。无匹配返回 null(正常降级,不报错,AC-C3.4)。
   */
  match(task: string): Promise<Skill | null>
  /** 保存。实现必须先 `validateSkillStructure()`,不合格拒绝写入 */
  save(skill: Skill): Promise<void>
  /** 生成注入 system prompt 的清单文本,必须做预算截断 */
  manifest(): Promise<string>
}

/** 清单预算。采纳 `SkillTool/prompt.ts:21-40` 的「上下文窗口 1%」策略 */
export const SKILL_MANIFEST_LIMITS = {
  /** 总字符预算(约 8000,对应 1% 上下文) */
  maxChars: 8_000,
  /** 单项截断长度,采纳源码的 250 */
  maxCharsPerItem: 250,
} as const
