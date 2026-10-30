/**
 * 渲染器:MethodSpec → 工具源码(模板填充,**不是让 LLM 写代码**)。
 *
 * ── 为什么这是全模块最重要的设计(DEC-019)──
 * 「论文里的一段方法描述」到「可执行代码」之间有巨大语义鸿沟。L3(让 LLM 直接
 * 生成代码)的质量完全不可控,失败即毁 demo。所以:
 *
 *   1. LLM 只负责抽取结构(MethodSpec)
 *   2. 代码由**固定模板**填出,实现来自 `impls.ts` 的确定性 L1 目录
 *   3. 没有登记实现的方法 → 降级为「参数模板 + 人工填写」,绝不静默丢弃(AC-B2.5)
 *
 * 即使 LLM 抽错参数,生成的工具也只是参数不对(被 zod 挡住),不会产生任意可执行代码。
 *
 * 依据:SRS FR-B2(AC-B2.1 ~ B2.5)、docs/SDD.md §8.4、Issue #30。
 */

import type { L1Impl } from './impls.ts'
import type { MethodParam, MethodSpec } from './types.ts'

export interface RenderToolOptions {
  /** 生成文件中 import Tool 契约的路径。默认 `../types.ts`(src/tools/generated/ 下) */
  readonly typesImport?: string
}

/** 由 MethodSpec 参数派生 zod 字段源码(仅用于「参数模板」降级路径) */
export function zodFieldFor(param: MethodParam): string {
  let base: string
  switch (param.type) {
    case 'string':
      base = 'z.string().min(1)'
      break
    case 'number':
      base = 'z.number()'
      break
    case 'boolean':
      base = 'z.boolean()'
      break
    case 'enum':
      base = `z.enum([${(param.enumValues ?? []).map((v) => JSON.stringify(v)).join(', ')}])`
      break
    case 'object':
      base = 'z.record(z.string(), z.unknown())'
      break
  }
  const described = `${base}.describe(${JSON.stringify(param.description)})`
  if (param.default !== undefined) return `${described}.default(${JSON.stringify(param.default)})`
  return param.required ? described : `${described}.optional()`
}

function joinFields(fields: readonly string[]): string {
  return fields.map((f) => `  ${f}`).join('\n')
}

/**
 * 生成工具文件的完整源码。
 *
 * 有 `impl`(已登记 L1 实现)→ 可执行工具;无 `impl` → 参数模板(call 恒返
 * toolFail,提示人工补写),由调用方标 draft。
 */
export function renderToolSource(spec: MethodSpec, impl: L1Impl | undefined, options: RenderToolOptions = {}): string {
  const typesImport = options.typesImport ?? '../types.ts'
  const preconditionText =
    spec.preconditions.length > 0 ? `前提:${spec.preconditions.join(';')}` : '前提:无'

  const fields =
    impl === undefined ? spec.params.map((p) => `${p.name}: ${zodFieldFor(p)}`) : impl.zodFields

  const callBody = impl === undefined ? draftCallBody(spec) : implCallBody(impl)

  const validateBlock =
    impl?.validateSource === undefined
      ? ''
      : `  validateInput: (input) => {
${impl.validateSource
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n')}
  },
`

  return `/**
 * 生成工具:${spec.toolName}
 *
 * 来源:MethodSpec「${spec.name}」(paperId=${spec.paperId})
 * 证据页码:p.${spec.evidencePage}${spec.evidenceQuote === undefined ? '' : `\n * 原文引文:${spec.evidenceQuote}`}
 * 状态:${impl === undefined ? 'draft(参数模板,待人工补写实现)' : 'active(L1 确定性实现)'}
 *
 * ⚠️ 本文件由 src/services/toolsynth/render.ts 模板填充生成,不要手改。
 * 改实现 → src/services/toolsynth/impls.ts;改规格 → specs/*.methods.json,
 * 然后重跑 node src/services/toolsynth/generate.ts。
 */

import { z } from 'zod'
import { buildTool, toolOk, toolFail } from '${typesImport}'

export const ${spec.toolName} = buildTool({
  name: '${spec.toolName}',
  description: () =>
    \`${spec.name}。来自论文 ${spec.paperId} p.${spec.evidencePage}。${preconditionText}。当任务需要这一计算时使用。\`,
  inputSchema: z.strictObject({
${joinFields(fields)}
  }),
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
${validateBlock}${callBody}
})
`
}

function implCallBody(impl: L1Impl): string {
  return `  async call(input, _ctx) {
    try {
${impl.fnSource
  .split('\n')
  .map((line) => `      ${line}`)
  .join('\n')}
    } catch (err) {
      return toolFail(\`计算失败:\${err instanceof Error ? err.message : String(err)}\`)
    }
  },`
}

function draftCallBody(spec: MethodSpec): string {
  return `  async call(input, _ctx) {
    return toolFail(
      '工具「${spec.name}」尚未登记确定性 L1 实现:MethodSpec 已降级为参数模板(AC-B2.5)。参数已按规格生成并被 zod 校验,但计算逻辑需要人工补写。',
      '补写位置:src/services/toolsynth/impls.ts 登记 methodId=${spec.methodId},然后重跑 generate.ts 与 tools doctor',
    )
  },`
}

/**
 * 生成 smoke test 文件源码。只用于**有 L1 实现**的工具;
 * 参数模板(draft)不生成测试文件 —— 体检时「缺少 .test.ts」按 smoke 失败计,
 * 工具保持 draft,且 npm test 不会被注定失败的用例带崩(AC-B2.4)。
 */
export function renderTestSource(spec: MethodSpec, impl: L1Impl, options: RenderToolOptions = {}): string {
  const typesImport = options.typesImport ?? '../types.ts'
  const smokeInput = impl.smokeInput
  const expectation = `  assert.equal(result.ok, true)
  if (result.ok) assert.ok(result.summary.includes(${JSON.stringify(impl.smokeExpect)}))`

  return `/**
 * smoke test:${spec.toolName}(由 src/services/toolsynth/render.ts 生成,勿手改)
 *
 * 依据:MethodSpec「${spec.name}」,证据 p.${spec.evidencePage}(paperId=${spec.paperId})
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ${spec.toolName} } from './${spec.toolName}.ts'
import type { ToolContext } from '${typesImport}'

const ctx: ToolContext = {
  signal: AbortSignal.timeout(5_000),
  mode: 'live',
  trace: { write() {} },
  cache: { get: async () => null, set: async () => {} },
}

test('${spec.toolName} smoke:合法入参返回预期输出', async () => {
  const result = await ${spec.toolName}.call(${smokeInput}, ctx)
${expectation}
})
`
}

/**
 * 生成 registry.generated.ts 的全文。
 * 只列 active(已过 smoke)的工具;draft 名单写进文件头注释供人查看。
 */
export function renderRegistrySource(args: {
  readonly activeToolNames: readonly string[]
  readonly draftToolNames: readonly string[]
  readonly generatedAt: string
  readonly specFiles: readonly string[]
}): string {
  const imports = args.activeToolNames.map((n) => `import { ${n} } from './${n}.ts'`).join('\n')
  const list = args.activeToolNames.join(', ')
  const draftNote =
    args.draftToolNames.length === 0
      ? '当前无 draft 工具。'
      : `draft 工具(未过 smoke,不进可调用池):${args.draftToolNames.join(', ')} —— 见 report.json 的降级原因。`

  return `/**
 * 生成工具的注册表 —— **由 src/services/toolsynth/generate.ts 自动生成,勿手改**。
 *
 * - 只有 smoke 通过(active)的工具列在 generatedTools 里,main.ts 会循环注册
 * - ${draftNote}
 * - 改 MethodSpec 或 L1 实现后,重跑:node src/services/toolsynth/generate.ts
 *
 * 生成时间:${args.generatedAt}
 * 来源 specs:${args.specFiles.join(', ')}
 */

import type { Tool } from '../types.ts'
${imports}

// 每个工具的入参类型都不同,统一断言成 Tool<unknown> 才能放进同一个数组
// (与 src/tools/infra.ts 的 infraTools 同一模式;入参安全性由 invokeTool 的 schema 校验保证)
export const generatedTools = [${list}] as unknown as readonly Tool<unknown>[]
`
}
