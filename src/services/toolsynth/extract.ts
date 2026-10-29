/**
 * 方法抽取(模块 B 入口):PaperDoc → MethodSpec[](AC-B1.1 ~ B1.4)。
 *
 * ── 设计要点 ──
 * 1. **LLM 只抽结构,不写代码**(DEC-019):用 sideQuery + json_object 强约束输出
 *    MethodSpec;代码由 render.ts 的模板产出,两者之间没有「模型自由发挥」的通道。
 * 2. **evidencePage 必填且能回指原文**(数据铁律 #2 / Issue #29):模型自报页码不可信
 *    (模块 A 实测 20 条错 20 条),所以这里对 LLM 给的 evidenceQuote 做**逐字回指校验**:
 *      引文在声称页找不到 → 全文反查,找到就改判到真实页;
 *      全文都找不到 → 丢弃并记录原因(AC-B2.5 不静默丢弃)。
 * 3. **降级不抛错**:LLM 不可用 / 返回坏 JSON → 返回空 specs + degradeReason,由上层
 *    决定走「已提交的 specs 产物」(specs/*.methods.json)。
 *
 * 依据:SRS FR-B1、docs/SDD.md §8.3、Issue #29。
 */

import { errorMessage, type LlmClient } from '../llm/types.ts'
import { iterateParagraphs, type PaperDoc } from '../paper/types.ts'
import {
  sanitizeToolName,
  validateSpec,
  type DroppedMethod,
  type ExtractReport,
  type MethodSpec,
} from './types.ts'

/** 送进 prompt 的论文正文上限(字符)。方法描述通常集中在 Method 章节,12k 足够 */
export const PROMPT_MAX_CHARS = 12_000
/** 单次抽取的规格上限,防模型跑飞 */
export const MAX_SPECS = 20

export interface ExtractOptions {
  readonly llm: LlmClient
  readonly signal?: AbortSignal
  readonly maxChars?: number
  readonly onProgress?: (progress: { step: string; done: number; total: number }) => void
}

/** 把论文段落拼成「带页码前缀」的 prompt 文本,超预算时按段截断 */
export function paperToPromptText(doc: PaperDoc, maxChars: number = PROMPT_MAX_CHARS): string {
  const chunks: string[] = []
  let used = 0
  let truncated = false
  for (const paragraph of iterateParagraphs(doc)) {
    const piece = `[p${paragraph.page}] ${paragraph.text}`
    if (used + piece.length > maxChars) {
      truncated = true
      break
    }
    chunks.push(piece)
    used += piece.length
  }
  return chunks.join('\n') + (truncated ? '\n(正文过长已按预算截断)' : '')
}

/** 逐字回指校验:引文在声称页找不到时全文反查,返回真实页码;找不到返回 null */
export function locateQuotePage(doc: PaperDoc, quote: string, claimedPage: number): number | null {
  const normalized = quote.replace(/\s+/g, ' ').trim()
  if (normalized === '') return claimedPage
  const pageTexts = new Map<number, string>()
  for (const paragraph of iterateParagraphs(doc)) {
    const page = paragraph.page
    pageTexts.set(page, `${pageTexts.get(page) ?? ''} ${paragraph.text}`)
  }
  const contains = (page: number): boolean =>
    (pageTexts.get(page) ?? '').replace(/\s+/g, ' ').includes(normalized)
  if (contains(claimedPage)) return claimedPage
  for (const page of pageTexts.keys()) {
    if (contains(page)) return page
  }
  return null
}

const SYSTEM_PROMPT = `你是科研论文的「方法抽取器」。从论文正文中找出可参数化的方法,输出 JSON。

输出格式(只输出 JSON,不要任何解释):
{
  "methods": [
    {
      "methodId": "小写连字符 id,如 react-cotsc-majority",
      "name": "论文里的人类可读方法名",
      "params": [
        {
          "name": "参数名",
          "type": "string | number | boolean | enum | object",
          "required": true,
          "default": "仅当 required=false 时给默认值,否则省略",
          "enumValues": ["仅当 type=enum 时给可选值列表"],
          "description": "参数含义"
        }
      ],
      "preconditions": ["调用前提"],
      "evidencePage": 5,
      "evidenceQuote": "必须逐字复制自正文该页的一句话",
      "supportLevel": "L1 | unsupported"
    }
  ]
}

硬性规则:
1. evidencePage 必须来自正文中 [pN] 前缀的真实页码,evidenceQuote 必须逐字复制自该页,不许改写
2. type 只能取 string/number/boolean/enum/object 五种
3. 无法确定参数类型的方法,supportLevel 写 "unsupported"(不要硬凑参数)
4. 只抽取「方法 / 指标 / 启发式规则」这类可参数化的东西,不抽背景介绍与结论
5. 最多 ${MAX_SPECS} 条,宁缺毋滥`

async function parseLlmJson(raw: string): Promise<{ methods: readonly unknown[] } | null> {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const methods = (parsed as Record<string, unknown>)['methods']
    if (!Array.isArray(methods)) return null
    return { methods }
  } catch {
    return null
  }
}

/**
 * 从一篇论文抽取 MethodSpec。
 *
 * 失败语义:LLM 抛错 / 返回坏 JSON / 超预算 → degraded=true 并给出原因,
 * **不 throw**(调用方决定是否改用已提交的 specs 产物)。
 */
export async function extractMethods(doc: PaperDoc, options: ExtractOptions): Promise<ExtractReport> {
  const maxChars = options.maxChars ?? PROMPT_MAX_CHARS
  const body = paperToPromptText(doc, maxChars)
  options.onProgress?.({ step: `组装抽取 prompt(${body.length} 字符)`, done: 0, total: 1 })

  let raw: string
  try {
    raw = await options.llm.sideQuery({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `论文:${doc.paperId}《${doc.title}》\n\n正文(行首 [pN] 是真实页码):\n${body}`,
        },
      ],
      jsonObject: true,
      maxTokens: 4_000,
      signal: options.signal ?? new AbortController().signal,
    })
  } catch (err) {
    return {
      specs: [],
      dropped: [],
      degraded: true,
      degradeReason: `LLM 抽取失败:${errorMessage(err)}`,
    }
  }

  const parsed = await parseLlmJson(raw)
  if (parsed === null) {
    return { specs: [], dropped: [], degraded: true, degradeReason: 'LLM 返回的不是合法 JSON(无法解析)' }
  }

  const pagesTotal = doc.parseQuality.pagesTotal
  const specs: MethodSpec[] = []
  const dropped: DroppedMethod[] = []
  const seenToolNames = new Set<string>()

  for (const item of parsed.methods.slice(0, MAX_SPECS)) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      dropped.push({ name: '(非对象条目)', reason: 'LLM 返回了非对象条目' })
      continue
    }
    const candidate = item as Record<string, unknown>

    const supportLevel = candidate['supportLevel']
    if (supportLevel === 'unsupported') {
      dropped.push({
        name: typeof candidate['name'] === 'string' ? candidate['name'] : '(未命名)',
        reason: 'supportLevel=unsupported:无法确定参数类型(AC-B1.4),不进生成队列',
      })
      continue
    }

    const name = typeof candidate['name'] === 'string' ? candidate['name'].trim() : ''
    if (name === '') {
      dropped.push({ name: '(未命名)', reason: '缺少 name' })
      continue
    }
    const toolName = sanitizeToolName(name)
    if (toolName === null) {
      dropped.push({ name, reason: 'name 无法转成合法的 [a-zA-Z0-9_] 工具名' })
      continue
    }

    const claimedPage = candidate['evidencePage']
    const quote = typeof candidate['evidenceQuote'] === 'string' ? candidate['evidenceQuote'].trim() : ''
    let evidencePage = typeof claimedPage === 'number' ? claimedPage : 0
    if (quote !== '') {
      const located = locateQuotePage(doc, quote, Number.isInteger(evidencePage) ? evidencePage : 0)
      if (located === null) {
        dropped.push({ name, reason: `evidenceQuote 无法在原文任何一页找到,不可追溯(数据铁律 #2)` })
        continue
      }
      evidencePage = located
    }

    const built = {
      methodId: typeof candidate['methodId'] === 'string' && candidate['methodId'] !== ''
        ? candidate['methodId']
        : `${toolName}`,
      paperId: doc.paperId,
      name,
      toolName,
      params: Array.isArray(candidate['params']) ? candidate['params'] : [],
      preconditions: Array.isArray(candidate['preconditions']) ? candidate['preconditions'] : [],
      evidencePage,
      supportLevel: supportLevel === 'L2' ? 'L2' : 'L1',
      ...(quote === '' ? {} : { evidenceQuote: quote }),
    }

    const checked = validateSpec(built)
    if (!checked.ok) {
      dropped.push({ name, reason: checked.problems.join(';') })
      continue
    }
    const spec = checked.spec

    if (!Number.isInteger(spec.evidencePage) || spec.evidencePage < 1 || spec.evidencePage > pagesTotal) {
      dropped.push({ name, reason: `evidencePage=${String(spec.evidencePage)} 超出论文页码范围 1..${String(pagesTotal)}` })
      continue
    }
    if (seenToolNames.has(spec.toolName)) {
      dropped.push({ name, reason: `toolName=${spec.toolName} 与已抽取方法重名,跳过` })
      continue
    }
    seenToolNames.add(spec.toolName)
    specs.push(spec)
  }

  return { specs, dropped, degraded: false, degradeReason: null }
}
