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

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, Tool<unknown>>()

  /** 已告警过的工具名,避免每次渲染 schema 都刷一遍 */
  const degradedWarned = new Set<string>()

  function describe(tool: Tool<unknown>): Promise<string> | string {
    // schema 渲染阶段没有真实入参,用 undefined 探测一次;
    // 若工具的 description 依赖入参而抛错,退化为名字,不阻断整个列表渲染。
    // 但**不能静默**:退化后模型看到的描述只剩工具名,能力会明显下降,
    // 所以每个工具只告警一次,让人能发现「描述悄悄变差了」。
    try {
      return tool.description(undefined as never)
    } catch {
      if (!degradedWarned.has(tool.name)) {
        degradedWarned.add(tool.name)
        console.warn(
          `[registry] 工具 ${tool.name} 的 description 无参探测抛错,已退化为工具名;` +
            `请让它能接受 undefined 入参,否则模型看到的描述会变差`,
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
