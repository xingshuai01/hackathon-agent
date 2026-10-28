/**
 * system prompt 组装。
 *
 * 依据:docs/SDD.md §4.3-4.4(知识索引 + 技能清单注入)、DEC-023(渐进式披露)。
 *
 * 三条约束:
 *  1. 知识库只注入 **索引**(INDEX.md),不注入正文 —— 正文由工具按需检索
 *  2. 技能只注入 **元数据清单**(name + description + whenToUse),不注入七节正文
 *  3. 两部分都有预算上限,超了要截断而不是把上下文撑爆
 */

export interface PromptParts {
  /** 任务角色说明 */
  readonly role: string
  /** A 模块产出的索引文本(`KnowledgeStore.index()`) */
  readonly knowledgeIndex?: string
  /** C 模块产出的技能清单(`SkillStore.manifest()`) */
  readonly skillManifest?: string
  /** 本次任务命中的技能正文(懒加载结果)。与清单分开,各有预算 */
  readonly skillBody?: string
  /** 额外约束(运行模式、当前日期等) */
  readonly notes?: readonly string[]
  /**
   * 当前**实际注册**的工具名。
   *
   * 用途:避免提示词让模型去调用一个不存在的工具。
   * 反例(已修复):曾经无条件写「用 knowledge_search 检索正文」,
   * 但那个工具没注册,模型照做就会吃一个「未知工具」。
   * 不传 = 不知道注册了哪些工具,此时只描述能力、不点名工具。
   */
  readonly availableTools?: readonly string[]
}

/** 索引与清单各自的注入预算 */
export const PROMPT_LIMITS = {
  knowledgeIndex: 15_000,
  skillManifest: 8_000,
  /** 技能正文只在命中后才注入,单次给 4k:清单 8k 之外单独计 */
  skillBody: 4_000,
} as const

function clip(text: string, limit: number): string {
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}\n…(已截断,原长 ${String(text.length)} 字符)`
}

/**
 * 组装 system prompt。
 *
 * 顺序有讲究:角色 → 知识索引 → 技能清单 → 约束。
 * 把「你有哪些资产」放在约束之前,模型更容易先想着用已有资产再考虑自由发挥。
 */
export function buildSystemPrompt(parts: PromptParts): string {
  const blocks: string[] = [parts.role.trim()]

  if (parts.knowledgeIndex !== undefined && parts.knowledgeIndex.trim() !== '') {
    // 只有真的注册了 knowledge_search 才点名它,否则模型会去调一个不存在的工具
    const canSearch = parts.availableTools?.includes('knowledge_search') === true
    blocks.push(
      [
        '## 你的知识库索引',
        canSearch
          ? '下面是你已经沉淀的知识页。**需要依据时,用 knowledge_search 工具检索正文,不要凭索引猜测。**'
          : '下面是你已经沉淀的知识页索引(只有描述与锚点,没有正文)。**当前没有可检索正文的工具,需要原文时如实说明缺什么,不要凭索引编造内容。**',
        '每条都带锚点(paperId + page),引用时必须原样带上锚点。',
        '',
        clip(parts.knowledgeIndex.trim(), PROMPT_LIMITS.knowledgeIndex),
      ].join('\n'),
    )
  }

  if (parts.skillManifest !== undefined && parts.skillManifest.trim() !== '') {
    blocks.push(
      [
        '## 可用技能',
        '下面是你的技能清单(只列元数据)。**遇到匹配的任务时,先按技能给出的流程与判据行事。**',
        '',
        clip(parts.skillManifest.trim(), PROMPT_LIMITS.skillManifest),
      ].join('\n'),
    )
  }

  // 命中的技能正文。与清单分开渲染:清单是「有哪些」,正文是「怎么做」。
  // 没有正文时不要留空块 —— 空标题会让模型以为技能里没写东西
  if (parts.skillBody !== undefined && parts.skillBody.trim() !== '') {
    blocks.push(
      [
        '## 本次任务适用的技能(已加载正文)',
        '**按下面的流程与判据执行。判据是硬门槛:不满足就停下来说明,不要跳过。**',
        '',
        clip(parts.skillBody.trim(), PROMPT_LIMITS.skillBody),
      ].join('\n'),
    )
  }

  if (parts.notes !== undefined && parts.notes.length > 0) {
    blocks.push(['## 运行约束', ...parts.notes.map((n) => `- ${n}`)].join('\n'))
  }

  return blocks.join('\n\n')
}

/** 默认角色。科研场景,强调「可追溯」与「不确定就说不确定」 */
export const DEFAULT_ROLE = `你是一个科研领域的智能体,帮助研究者处理文献与研究任务。

工作原则:
1. 需要事实依据时,先调用工具检索,不要凭记忆编造。
2. 任何结论都要能回指来源(paperId + 页码)。没有来源就说「资料中未提及」。
3. 不确定就问,不要猜。猜错的代价比问一句高。
4. 工具失败时,把失败原因如实说明,并提出下一步尝试。`
