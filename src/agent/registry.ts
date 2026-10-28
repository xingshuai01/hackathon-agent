/**
 * 工具注册表。
 *
 * 职责:把「手写工具」与「B 模块生成的工具」放进同一个池子,
 * 并渲染成 DeepSeek 的 `tools` 参数。
 *
 * 依据:docs/SDD.md §8.3、Issue #22;源码 `tools.ts:193-251`(扁平数组 + 运行时过滤)
 */

import { z } from 'zod'
import type { DeepSeekToolSchema, Tool } from '../tools/types.ts'

export interface ToolRegistry {
  /** 注册一个工具。同名会覆盖(并告警)—— 生成工具与手写工具重名时以最后注册者为准 */
  register<In>(tool: Tool<In>): void
  /** 取工具。返回 `Tool<unknown>`,入参安全性由 invokeTool 的 schema 校验保证 */
  get(name: string): Tool<unknown> | null
  list(): readonly Tool<unknown>[]
  names(): readonly string[]
  /** 按白名单取子集。子 Agent 用它限定能力范围(FR-D4) */
  subset(names: readonly string[]): readonly Tool<unknown>[]
  /**
   * 渲染成 DeepSeek `tools` 参数。
   * @param names 只渲染这些工具;不传则全部
   */
  schemas(names?: readonly string[]): Promise<readonly DeepSeekToolSchema[]>
}

/** zod → JSON Schema,并剥掉 `$schema` 字段(DeepSeek 不认) */
export function zodToParameters(schema: z.ZodType<unknown>): Record<string, unknown> {
  const raw = z.toJSONSchema(schema) as Record<string, unknown>
  const { $schema: _ignored, ...rest } = raw
  return rest
}

/**
 * 从 JSON Schema 合成一个「能过校验」的示例入参。
 *
 * 只填与类型相称的占位值,不猜业务语义:字符串给 `'x'`(能过 `min(1)`)、
 * 数字给 `1`(能过 `positive()`)、数组给 `[]`。目的是让 `description(input)`
 * 这类只读字段的回调不崩,而不是模拟真实调用。
 */
function synthesizeFromSchema(schema: z.ZodType<unknown>): Record<string, unknown> | null {
  let json: Record<string, unknown>
  try {
    json = z.toJSONSchema(schema) as Record<string, unknown>
  } catch {
    return null
  }
  const properties = json['properties']
  if (properties === undefined || typeof properties !== 'object') return null

  const out: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(properties as Record<string, unknown>)) {
    if (raw === null || typeof raw !== 'object') continue
    const field = raw as Record<string, unknown>
    if (field['default'] !== undefined) {
      out[key] = field['default']
      continue
    }
    const enumValues = field['enum']
    if (Array.isArray(enumValues) && enumValues.length > 0) {
      out[key] = enumValues[0]
      continue
    }
    switch (field['type']) {
      case 'string':
        out[key] = 'x'
        break
      case 'number':
      case 'integer':
        out[key] = 1
        break
      case 'boolean':
        out[key] = false
        break
      case 'array':
        out[key] = []
        break
      case 'object':
        out[key] = {}
        break
      default:
        break
    }
  }
  return out
}

/**
 * 为「不执行工具、只问元信息」的场景构造一个够用的入参。
 *
 * `description(input)` 与 `isReadOnly(input)` 的签名都要求入参,但渲染 schema
 * 和 `tools doctor` 时还没有真实调用。直接传 `undefined` 会让任何
 * `input.foo` 当场崩 —— 现有 `sciencepal_query` 就踩过这个坑,
 * 表现为日志里一句「description 无参探测抛错,已退化为工具名」。
 *
 * 三级尝试:
 *   1. `safeParse({})` —— 全可选字段的 schema,拿到的是**真实合法**入参
 *   2. 从 JSON Schema 合成占位值再解析 —— 必填字段也能给个形状对的东西
 *   3. 都不行才 undefined,由调用方兜底
 *
 * B 模块生成的工具几乎都有必填参数,第 2 级是它们能正常渲染描述的关键。
 */
export function probeInput<In>(tool: Tool<In>): In | undefined {
  try {
    const empty = tool.inputSchema.safeParse({})
    if (empty.success) return empty.data

    const synthesized = synthesizeFromSchema(tool.inputSchema)
    if (synthesized !== null) {
      const parsed = tool.inputSchema.safeParse(synthesized)
      if (parsed.success) return parsed.data
    }
  } catch {
    // schema 本身有问题(比如用了 z.custom),交给调用方兜底
  }
  return undefined
}

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, Tool<unknown>>()

  /** 已告警过的工具名,避免每次渲染 schema 都刷一遍 */
  const degradedWarned = new Set<string>()

  function describe(tool: Tool<unknown>): Promise<string> | string {
    // 渲染 schema 时没有真实入参:先用 schema 探一个合法空入参,
    // 探不到(有必填字段)才退到 undefined,再崩就降级成工具名。
    // 但**不能静默**:退化后模型看到的描述只剩工具名,能力会明显下降,
    // 所以每个工具只告警一次,让人能发现「描述悄悄变差了」。
    const probe = probeInput(tool)
    try {
      return tool.description(probe as never)
    } catch {
      if (!degradedWarned.has(tool.name)) {
        degradedWarned.add(tool.name)
        console.warn(
          `[registry] 工具 ${tool.name} 的 description 无参探测抛错,已退化为工具名;` +
            `请让 description 在空入参下也能返回(或用 z.strictObject 给字段默认值)`,
        )
      }
      return tool.name
    }
  }

  /** 按白名单取子集。子 Agent 用它限定能力范围(FR-D4) */
  function subsetOf(names: readonly string[]): readonly Tool<unknown>[] {
    return names.map((n) => tools.get(n)).filter((t): t is Tool<unknown> => t !== undefined)
  }

  return {
    register<In>(tool: Tool<In>): void {
      if (tools.has(tool.name)) {
        console.warn(`[registry] 工具名重复,后者覆盖前者:${tool.name}`)
      }
      // Tool<In> 的 call 入参是逆变的,存进 Tool<unknown> 需要一次显式转换。
      // 运行时安全性由 invokeTool 里的 inputSchema.safeParse 保证 ——
      // 能进入 call 的数据一定已经过该工具自己的 schema 校验。
      tools.set(tool.name, tool as unknown as Tool<unknown>)
    },

    get(name) {
      return tools.get(name) ?? null
    },

    list() {
      return [...tools.values()]
    },

    names() {
      return [...tools.keys()]
    },

    subset(names) {
      return subsetOf(names)
    },

    async schemas(names) {
      // 用闭包函数而不是 this.subset —— 调用方一旦写成
      // `const { schemas } = registry`,this 就丢了,会静默返回空列表。
      const picked = names === undefined ? [...tools.values()] : subsetOf(names)
      const out: DeepSeekToolSchema[] = []
      for (const tool of picked) {
        out.push({
          type: 'function',
          function: {
            name: tool.name,
            description: await describe(tool),
            parameters: zodToParameters(tool.inputSchema),
          },
        })
      }
      return out
    },
  }
}
