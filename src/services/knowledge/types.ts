/**
 * ★★★ 冻结契约 #4-A · 知识库契约(模块 A)★★★
 *
 * 变更规则:改动本文件的**任何已导出签名**都必须走 PR 且经 1 人 approve。
 * 依据:docs/SDD.md §4.3、§8.1;源码参考 `memdir/memoryTypes.ts:261`(元数据极简)、
 *       `findRelevantMemories.ts:97-130`(用 LLM 选而不是向量检索)
 * 对应任务:Issue #21、#25、#26、#27
 *
 * ── 数据铁律 #1(违反即返工)──
 * **没有 `paperId` + `page` 锚点的信息不得进入知识库。**
 * 理由:无锚点的文本无法验证是不是模型编的,整条链路失去可信度。
 * 本文件用 `validateNote()` 把这条规则做成可调用的函数,入库前必须过。
 */

// ─────────────────────────────────────────────────────────────
// 1. 知识页
// ─────────────────────────────────────────────────────────────

/**
 * 知识页类型。**一个论断一条**,不要把整段摘要塞进来。
 *
 * 为什么按「论断」而不按 token 切片:按固定 token 切会把一篇论文炸成上百碎片,
 * 单页失去主语、引用断链。
 */
export type NoteKind =
  /** 论文主张 / 结论 */
  | 'claim'
  /** 方法描述 */
  | 'method'
  /** 实验数据 / 指标结果 */
  | 'result'
  /** 局限性 / 失败条件 */
  | 'limitation'
  /** 术语定义 */
  | 'definition'

export type Confidence = 'high' | 'medium' | 'low'

/** 知识页之间的关系 */
export type NoteRelation = 'supports' | 'contradicts' | 'extends'

export interface NoteLink {
  readonly to: string
  readonly rel: NoteRelation
}

/**
 * 原子知识页。
 *
 * `description` 单独拎出来且要求「写得具体」,是有原因的 ——
 * 采纳 `memoryTypes.ts:261` 的做法:**这条描述本身就是召回依据**。
 * 检索时只看 description,不看正文,所以它必须是一句能独立看懂的话,
 * 而不是一个标题。
 */
export interface AtomicNote {
  /** 形如 `${paperId}#p${page}#${hash6}`,必须可推导,不要用随机 id */
  readonly noteId: string
  readonly paperId: string
  /** 页码锚点。**必填,不允许 0 / undefined** */
  readonly page: number
  readonly kind: NoteKind
  /** 一句话描述,用于召回。要求具体,例:「低资源语言 RAG 在 XNLI 上比基线 +4.2」 */
  readonly description: string
  /** 完整论述正文 */
  readonly text: string
  /** 原文证据。quote 是原句摘录,page 与 page 字段一致 */
  readonly evidence: { readonly quote: string; readonly page: number }
  readonly confidence: Confidence
  readonly links?: readonly NoteLink[]
  /** ISO 8601 */
  readonly createdAt: string
}

// ─────────────────────────────────────────────────────────────
// 2. 入库校验(数据铁律的可执行形式)
// ─────────────────────────────────────────────────────────────

export type NoteValidation = { ok: true } | { ok: false; reasons: readonly string[] }

/**
 * 校验一条知识页能否入库。**`KnowledgeStore.put()` 的实现必须先调用它。**
 *
 * 检查项:
 * - paperId 非空
 * - page 是正整数且与 evidence.page 一致
 * - description 足够长(短到无法召回的描述等于没有)
 * - evidence.quote 非空(必须能回指原文)
 */
export function validateNote(note: AtomicNote): NoteValidation {
  const reasons: string[] = []

  if (!note.noteId.trim()) reasons.push('noteId 不能为空')
  if (!note.paperId.trim()) reasons.push('paperId 不能为空 —— 数据铁律 #1')

  if (!Number.isInteger(note.page) || note.page < 1) {
    reasons.push(`page 必须是 >=1 的整数,实际是 ${String(note.page)} —— 数据铁律 #1`)
  }
  if (note.evidence.page !== note.page) {
    reasons.push(`evidence.page(${note.evidence.page})与 page(${note.page})不一致,锚点不可信`)
  }
  if (!note.evidence.quote.trim()) {
    reasons.push('evidence.quote 不能为空 —— 必须能回指原文原句')
  }
  if (note.description.trim().length < 8) {
    reasons.push('description 太短,无法用于召回(建议至少 8 个字符,且是一句完整的话)')
  }
  if (note.text.trim().length === 0) reasons.push('text 不能为空')

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons }
}

// ─────────────────────────────────────────────────────────────
// 3. 存储接口
// ─────────────────────────────────────────────────────────────

/** 检索命中项。带上锚点,UI 可以据此跳到原文 */
export interface NoteHit {
  readonly noteId: string
  readonly paperId: string
  readonly page: number
  readonly kind: NoteKind
  readonly description: string
  /** 相关度。粗筛阶段是关键词命中数,精筛阶段是模型给出的排序位次 */
  readonly score: number
}

/**
 * 知识存储。**默认且唯一的实现是 `LocalMarkdownStore`**(DEC-031)。
 *
 * 接口仍然保留的原因不是「为了将来换实现」,而是:
 * 1. 单测可以注入内存 stub,不必碰文件系统
 * 2. 上层(A 模块的生成/汇总逻辑)与存储解耦
 */
export interface KnowledgeStore {
  /** 入库。实现必须先用 `validateNote()` 拦截,失败时抛错或返回拒绝原因 */
  put(note: AtomicNote): Promise<void>

  get(noteId: string): Promise<AtomicNote | null>

  /**
   * 段 1 · 关键词粗筛。**纯本地、不调模型**、应在 1s 内返回(AC-A3.3)。
   */
  scan(query: string, limit?: number): Promise<readonly NoteHit[]>

  /**
   * 段 2 · LLM 精筛。把候选清单交给便宜模型选,返回 ≤limit 条(DEC-010)。
   *
   * 为什么不在这里直接实现:LLM 调用属于 services/llm,存储层不该依赖它。
   * 因此实现方接收一个 `selector` 注入。
   */
  select(
    query: string,
    candidates: readonly NoteHit[],
    selector: NoteSelector,
  ): Promise<readonly NoteHit[]>

  /** 建立知识页之间的关系 */
  link(from: string, to: string, rel: NoteRelation): Promise<void>

  /**
   * 生成索引文本(等价于 Claude Code 的 `MEMORY.md`)。
   * **会被拼进 system prompt**,实现方必须做行数/字节截断。
   */
  index(): Promise<string>

  /** 已入库的论文 id 列表。用于「已处理过就跳过」的判断(FR-A4、FR-D5) */
  listPaperIds(): Promise<readonly string[]>
}

/**
 * 精筛器的注入签名。实现方(services/llm)负责调便宜模型并用 json_schema 强约束。
 *
 * 契约要求:
 * - 返回值必须是 candidates 的**子集**,不得凭空造 noteId
 * - 模型返回非法 id 时,实现方必须做白名单过滤(AC-A3.3)
 */
export type NoteSelector = (
  query: string,
  candidates: readonly NoteHit[],
) => Promise<readonly string[]>

/** 索引截断上限。比源码的 200 行 / 25000 字节更保守 */
export const INDEX_LIMITS = {
  maxLines: 120,
  maxBytes: 15_000,
} as const
