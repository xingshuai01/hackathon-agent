/**
 * 模块 B · 工具库 —— 本模块自己的类型(非冻结契约)。
 *
 * `MethodSpec` 的结构由 B 自己定(见 docs/STRUCTURE.md §3、B 开工前审计 §2):
 * 它是「LLM 抽取产物」与「代码模板」之间的中间表示,不是跨模块契约。
 * 跨模块的唯一契约是 `src/tools/types.ts` 的 `Tool`。
 *
 * 依据:SRS FR-B1(AC-B1.1 ~ B1.4)、docs/SDD.md §8.3;数据铁律 #2(无 evidencePage 不得进工具库)
 */

// ─────────────────────────────────────────────────────────────
// 1. 方法参数
// ─────────────────────────────────────────────────────────────

/** 参数类型白名单。SRS AC-B1.4:无法确定参数类型的方法标 unsupported */
export const PARAM_TYPES = ['string', 'number', 'boolean', 'enum', 'object'] as const
export type ParamType = (typeof PARAM_TYPES)[number]

export interface MethodParam {
  readonly name: string
  readonly type: ParamType
  readonly required: boolean
  /** 默认值。仅当 required=false 时才有意义 */
  readonly default?: unknown
  /** 仅当 type='enum' 时有效。取值必须全部非空 */
  readonly enumValues?: readonly string[]
  readonly description: string
}

// ─────────────────────────────────────────────────────────────
// 2. 方法规格(LLM 抽取产物)
// ─────────────────────────────────────────────────────────────

/** 支持级别。L3(自动生成分析代码)明确不做(DEC-019 / SRS D-04) */
export const SUPPORT_LEVELS = ['unsupported', 'L1', 'L2'] as const
export type SupportLevel = (typeof SUPPORT_LEVELS)[number]

export interface MethodSpec {
  /** 稳定 id,推荐 `<paperId 缩写>-<主题>`,如 `react-cotsc-majority` */
  readonly methodId: string
  readonly paperId: string
  /** 论文里的人类可读方法名,如 "CoT-SC majority vote" */
  readonly name: string
  /** 生成工具的函数名。只允许 `[a-zA-Z0-9_]`(DeepSeek function name 硬限制) */
  readonly toolName: string
  readonly params: readonly MethodParam[]
  /** 调用前提。渲染进工具的 description,帮助模型判断「何时该用」 */
  readonly preconditions: readonly string[]
  /** ★ 证据页码(数据铁律 #2)。1-based,必须能回指原文 */
  readonly evidencePage: number
  /** 原文引文。用于追溯「方法确实出自这一页」,可省略 */
  readonly evidenceQuote?: string
  readonly supportLevel: SupportLevel
}

/** 抽取阶段被丢弃的方法。AC-B1.4 / AC-B2.5:不静默丢弃,必须记录原因 */
export interface DroppedMethod {
  readonly name: string
  readonly reason: string
}

export interface ExtractReport {
  readonly specs: readonly MethodSpec[]
  /** 抽取出来但没进生成队列的方法(unsupported / 无锚点 / 参数非法) */
  readonly dropped: readonly DroppedMethod[]
  /** true = 走了降级路径(LLM 不可用或返回坏 JSON),specs 为空 */
  readonly degraded: boolean
  readonly degradeReason: string | null
}

// ─────────────────────────────────────────────────────────────
// 3. 校验
// ─────────────────────────────────────────────────────────────

export const TOOL_NAME_RE = /^[a-zA-Z0-9_]+$/

export type SpecValidation =
  | { ok: true; spec: MethodSpec }
  | { ok: false; problems: readonly string[] }

/**
 * 校验一份 MethodSpec 是否满足进入生成队列的最低要求。
 * 只做结构性检查;evidenceQuote 是否真能回指原文由抽取方保证(见 extract.ts)。
 */
export function validateSpec(raw: unknown): SpecValidation {
  const problems: string[] = []
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, problems: ['MethodSpec 必须是对象'] }
  }
  const s = raw as Record<string, unknown>

  const methodId = s['methodId']
  if (typeof methodId !== 'string' || methodId.trim() === '') problems.push('methodId 必须是非空字符串')
  const paperId = s['paperId']
  if (typeof paperId !== 'string' || paperId.trim() === '') problems.push('paperId 必须是非空字符串')
  const name = s['name']
  if (typeof name !== 'string' || name.trim() === '') problems.push('name 必须是非空字符串')
  const toolName = s['toolName']
  if (typeof toolName !== 'string' || !TOOL_NAME_RE.test(toolName)) {
    problems.push(`toolName 只允许 [a-zA-Z0-9_](DeepSeek function name 硬限制),实际:${String(toolName)}`)
  }

  const evidencePage = s['evidencePage']
  if (typeof evidencePage !== 'number' || !Number.isInteger(evidencePage) || evidencePage < 1) {
    problems.push(`evidencePage 必须是 >=1 的整数(数据铁律 #2),实际:${String(evidencePage)}`)
  }

  const supportLevel = s['supportLevel']
  if (typeof supportLevel !== 'string' || !SUPPORT_LEVELS.includes(supportLevel as SupportLevel)) {
    problems.push(`supportLevel 必须是 ${SUPPORT_LEVELS.join('/')} 之一,实际:${String(supportLevel)}`)
  }

  const params = s['params']
  if (!Array.isArray(params)) {
    problems.push('params 必须是数组')
  } else {
    params.forEach((p, i) => {
      if (p === null || typeof p !== 'object' || Array.isArray(p)) {
        problems.push(`params[${i}] 必须是对象`)
        return
      }
      const param = p as Record<string, unknown>
      if (typeof param['name'] !== 'string' || param['name'].trim() === '') {
        problems.push(`params[${i}].name 必须是非空字符串`)
      }
      if (typeof param['type'] !== 'string' || !PARAM_TYPES.includes(param['type'] as ParamType)) {
        problems.push(`params[${i}].type 必须是 ${PARAM_TYPES.join('/')} 之一,实际:${String(param['type'])}`)
      }
      if (typeof param['required'] !== 'boolean') problems.push(`params[${i}].required 必须是 boolean`)
      if (typeof param['description'] !== 'string' || param['description'].trim() === '') {
        problems.push(`params[${i}].description 必须是非空字符串`)
      }
      if (param['type'] === 'enum') {
        const values = param['enumValues']
        if (!Array.isArray(values) || values.length === 0 || values.some((v) => typeof v !== 'string' || v === '')) {
          problems.push(`params[${i}] 是 enum 类型,enumValues 必须是非空字符串数组`)
        }
      }
    })
  }

  const preconditions = s['preconditions']
  if (preconditions !== undefined && !Array.isArray(preconditions)) {
    problems.push('preconditions 必须是数组(可省略)')
  }
  const quote = s['evidenceQuote']
  if (quote !== undefined && typeof quote !== 'string') problems.push('evidenceQuote 必须是字符串(可省略)')

  if (problems.length > 0) return { ok: false, problems }

  const spec: MethodSpec = {
    methodId: (methodId as string).trim(),
    paperId: (paperId as string).trim(),
    name: (name as string).trim(),
    toolName: toolName as string,
    params: (params as readonly MethodParam[]),
    preconditions: (preconditions as readonly string[] | undefined) ?? [],
    evidencePage: evidencePage as number,
    supportLevel: supportLevel as SupportLevel,
    ...(typeof quote === 'string' && quote !== '' ? { evidenceQuote: quote } : {}),
  }
  return { ok: true, spec }
}

/**
 * 把 LLM 给的人类可读方法名转成合法的工具名。
 * 只做机械转换:小写、非 [a-zA-Z0-9_] 折叠成单个 `_`、去掉首尾 `_`、数字开头补 `tool_` 前缀。
 * 转换结果为空(如全中文名)时返回 null,由调用方决定丢弃。
 */
export function sanitizeToolName(rawName: string): string | null {
  const folded = rawName
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (folded === '') return null
  return /^[0-9]/.test(folded) ? `tool_${folded}` : folded
}
