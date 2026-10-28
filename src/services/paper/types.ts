/**
 * ★★★ 冻结契约 #5 · 共享底座:论文结构化产物 ★★★
 *
 * 变更规则:改动本文件的**任何已导出签名**都必须走 PR 且经 1 人 approve。
 * 依据:docs/SDD.md §5、§7.1;数据铁律 #1、#3
 * 对应任务:Issue #23
 *
 * ── 为什么这是"共享底座" ──
 * A 知识库、B 工具库、C 技能库三个模块的**唯一共同上游**。
 * 如果这里不先做对,后面三个模块都要返工。
 *
 * ── 四条硬要求(来自 SDD §7.1)──
 * 1. **每个段落必须带 `page`** —— 所有引用、证据、复现都要能回指「第几页第几节」
 * 2. **`paperId` 必须稳定可推导** —— 重复入库、增量更新、跨库引用都依赖它
 * 3. **`parseQuality` 必须显式** —— 解析失败的论文要能被过滤,而不是产出垃圾知识
 * 4. **表格必须转 Markdown** —— 论文核心结果 80% 在表里,纯文本流会丢行列对应
 */

// ─────────────────────────────────────────────────────────────
// 1. 论文结构
// ─────────────────────────────────────────────────────────────

/**
 * 段落。`page` 是**全系统最重要的一个字段** ——
 * 它是「可追溯性」的物质基础,没有它,知识页的锚点、证据表、复现指令全都失效。
 */
export interface Paragraph {
  readonly text: string
  /** 1-based 页码。**必须是 >=1 的整数**(数据铁律 #1) */
  readonly page: number
}

/** 表格。已转成 Markdown,保留行列对应关系 */
export interface TableBlock {
  readonly caption: string
  /** Markdown 表格源码,含表头分隔行 */
  readonly markdown: string
  readonly page: number
}

/** 图。v1.0 只记标题与页码,不做图像理解(见 SRS §3.2 明确不做) */
export interface FigureBlock {
  readonly caption: string
  readonly page: number
}

export interface Section {
  readonly heading: string
  /** 标题层级,1 = 一级标题 */
  readonly level: number
  readonly paragraphs: readonly Paragraph[]
  readonly tables: readonly TableBlock[]
  readonly figures: readonly FigureBlock[]
}

export interface Reference {
  /** 原始引用字符串,保证不丢失信息 */
  readonly raw: string
  readonly doi?: string
  readonly arxivId?: string
}

/**
 * 解析质量。用于「宁可少 20 篇,不要脏 1 篇」的门控(数据铁律 #3)。
 *
 * 判定:当 `pagesParsed / pagesTotal < 0.7` 时,调用方必须把该论文标记
 * `quarantined` 并且**不送进抽取队列**。
 */
export interface ParseQuality {
  readonly pagesParsed: number
  readonly pagesTotal: number
  /** 是否使用了 OCR。v1.0 固定 false,字段先留着便于将来扩展 */
  readonly hasOcr: boolean
}

/** 解析质量阈值。低于此值的论文被隔离 */
export const PARSE_QUALITY_THRESHOLD = 0.7

/**
 * 一篇论文的结构化产物。
 *
 * 注意 `paperId` 的推导规则(必须实现,不可随意生成):
 *   1. 有 DOI → 用 DOI
 *   2. 有 arXiv id → 用 arXiv id
 *   3. 否则 → `sha256(文件内容).slice(0, 16)`
 * 这样同一篇论文无论入库多少次,id 都一致,不会产生重复节点。
 */
export interface PaperDoc {
  readonly paperId: string
  readonly title: string
  readonly authors: readonly string[]
  readonly year: number
  readonly venue?: string
  readonly abstract: string
  readonly sections: readonly Section[]
  readonly references: readonly Reference[]
  readonly parseQuality: ParseQuality
}

// ─────────────────────────────────────────────────────────────
// 2. 门控与工具函数
// ─────────────────────────────────────────────────────────────

export type ParseVerdict =
  /** 可以进入抽取队列 */
  | { status: 'usable'; quality: ParseQuality }
  /** 解析质量不足,隔离。`ratio` 供报告里说明原因 */
  | { status: 'quarantined'; quality: ParseQuality; ratio: number; reason: string }

/**
 * 解析质量门控。**所有论文在进入抽取前都必须过这个函数。**
 */
export function gateByParseQuality(quality: ParseQuality): ParseVerdict {
  const total = quality.pagesTotal
  if (!Number.isInteger(total) || total <= 0) {
    return {
      status: 'quarantined',
      quality,
      ratio: 0,
      reason: 'pagesTotal 非法(必须是正整数),无法判断解析质量',
    }
  }
  const ratio = quality.pagesParsed / total
  if (ratio < PARSE_QUALITY_THRESHOLD) {
    return {
      status: 'quarantined',
      quality,
      ratio,
      reason: `解析率 ${(ratio * 100).toFixed(1)}% 低于阈值 ${(PARSE_QUALITY_THRESHOLD * 100).toFixed(0)}%`,
    }
  }
  return { status: 'usable', quality }
}

/**
 * 遍历论文的全部段落。抽取逻辑(A/B/C)统一走这个函数,
 * 避免各模块自己递归 sections 时漏掉某些层级。
 */
export function* iterateParagraphs(doc: PaperDoc): Generator<Paragraph> {
  for (const section of doc.sections) {
    for (const paragraph of section.paragraphs) {
      yield paragraph
    }
  }
}

/**
 * 校验段落锚点完整性。实现方在构造 `PaperDoc` 之后应调用一次做自检。
 * 返回问题列表,空数组表示通过。
 */
export function checkParagraphAnchors(doc: PaperDoc): string[] {
  const problems: string[] = []
  let index = 0
  for (const paragraph of iterateParagraphs(doc)) {
    index += 1
    if (!Number.isInteger(paragraph.page) || paragraph.page < 1) {
      problems.push(`第 ${index} 段缺少有效 page(实际:${String(paragraph.page)})`)
    }
    if (!paragraph.text.trim()) {
      problems.push(`第 ${index} 段正文为空`)
    }
  }
  if (index === 0) problems.push('论文没有任何段落 —— 解析可能完全失败')
  return problems
}
