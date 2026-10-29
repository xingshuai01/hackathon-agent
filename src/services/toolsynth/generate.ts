/**
 * 生成器编排:specs/*.methods.json → 渲染 → 落盘 generated/ → 跑 smoke → 注册表。
 *
 * 完整流水线(SDD §8.3):
 *
 *   specs(specs/*.methods.json)
 *     │  validateSpec()        ← 结构校验,不合格直接拒绝
 *     ▼
 *   MethodSpec[]
 *     │  supportLevel==='unsupported' → 跳过并记录原因(AC-B1.4,不静默丢弃)
 *     │  implFor(methodId) 命中       → 渲染可执行工具
 *     │  未命中                        → 渲染参数模板(AC-B2.5 降级,不静默丢弃)
 *     ▼
 *   src/tools/generated/<toolName>.ts + <toolName>.test.ts
 *     │  runSmokeTest()         ← 与 CI 同一条 node --test 路径
 *     ▼
 *   ├ 通过 → active,写进 registry.generated.ts(进 Agent 可调用池)
 *   └ 失败 → draft,留在 generated/ 供人工修补,原因写进 report.json
 *
 * 运行方式(在仓库根):
 *   node src/services/toolsynth/generate.ts [specs 目录或单个 spec 文件]
 *
 * 依据:SRS FR-B2/B3、docs/SDD.md §8.3-8.5、Issue #29 #30 #35。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { implFor } from './impls.ts'
import { renderRegistrySource, renderTestSource, renderToolSource } from './render.ts'
import { runSmokeTest } from './smoke.ts'
import { validateSpec, type MethodSpec } from './types.ts'

export interface GenerateOptions {
  /** 输出目录。默认 src/tools/generated/ */
  readonly generatedDir?: string
  /** 生成文件里 import Tool 契约的路径(默认 '../types.ts') */
  readonly typesImport?: string
  /** 跑 smoke 的超时 */
  readonly smokeTimeoutMs?: number
  /** 不落盘、不跑 smoke,只返回将要生成的文本(单测用) */
  readonly dryRun?: boolean
}

export interface GeneratedToolRecord {
  readonly toolName: string
  readonly methodId: string
  readonly paperId: string
  readonly evidencePage: number
  readonly status: 'active' | 'draft'
  readonly reason: string
}

export interface GenerateResult {
  readonly generatedDir: string
  readonly tools: readonly GeneratedToolRecord[]
  readonly skipped: readonly { name: string; reason: string }[]
  readonly passRate: number
  readonly reportPath: string
}

function defaultGeneratedDir(): string {
  return join(process.cwd(), 'src', 'tools', 'generated')
}

/** 读取一个 specs JSON 文件,校验并返回 MethodSpec 列表 */
export function loadSpecs(specFile: string): { file: string; specs: readonly MethodSpec[]; problems: readonly string[] } {
  const raw = JSON.parse(readFileSync(specFile, 'utf8')) as unknown
  const problems: string[] = []
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { file: specFile, specs: [], problems: ['spec 文件根节点必须是对象'] }
  }
  const list = (raw as Record<string, unknown>)['specs']
  if (!Array.isArray(list)) {
    return { file: specFile, specs: [], problems: ['spec 文件缺少 specs 数组'] }
  }
  const specs: MethodSpec[] = []
  list.forEach((item, i) => {
    const checked = validateSpec(item)
    if (checked.ok) {
      specs.push(checked.spec)
    } else {
      problems.push(`specs[${i}]:${checked.problems.join(';')}`)
    }
  })
  return { file: specFile, specs, problems }
}

/** 找到默认 specs 目录下的所有 .methods.json */
export function findSpecFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.methods.json'))
      .map((f) => join(dir, f))
  } catch {
    return []
  }
}

/**
 * 主流程:specs → 渲染 → 落盘 → smoke → 注册表 + report.json。
 *
 * 永不 throw;所有「生成不了」的情况都变成 result.skipped / draft.reason。
 */
export function generateFromSpecs(
  input: { readonly specs: readonly MethodSpec[]; readonly specFiles: readonly string[] },
  options: GenerateOptions = {},
): GenerateResult {
  const generatedDir = resolve(options.generatedDir ?? defaultGeneratedDir())
  const typesImport = options.typesImport ?? '../types.ts'

  const records: GeneratedToolRecord[] = []
  const skipped: { name: string; reason: string }[] = []

  for (const spec of input.specs) {
    if (spec.supportLevel === 'unsupported') {
      skipped.push({ name: spec.name, reason: 'supportLevel=unsupported,不进生成队列(AC-B1.4)' })
      continue
    }
    if (spec.supportLevel === 'L2') {
      skipped.push({ name: spec.name, reason: 'supportLevel=L2,本项目只承诺 L1(SRS D-04),不做多步 DSL' })
      continue
    }
    const impl = implFor(spec.methodId)
    const toolSource = renderToolSource(spec, impl, { typesImport })

    let smokePassed = false
    if (impl === undefined) {
      // 无 L1 实现 → 参数模板(AC-B2.5):只落盘工具文件,不生成 smoke test。
      // 体检时「缺少 .test.ts」按 smoke 失败计(见 smoke.ts),工具保持 draft。
      // 不放 .test.ts 进 src/ 也是为了让 npm test 不被「注定失败的用例」带崩。
      if (options.dryRun !== true) {
        mkdirSync(generatedDir, { recursive: true })
        writeFileSync(join(generatedDir, `${spec.toolName}.ts`), toolSource, 'utf8')
        const staleTest = join(generatedDir, `${spec.toolName}.test.ts`)
        if (existsSync(staleTest)) unlinkSync(staleTest)
      }
    } else {
      const testSource = renderTestSource(spec, impl, { typesImport })
      if (options.dryRun !== true) {
        mkdirSync(generatedDir, { recursive: true })
        writeFileSync(join(generatedDir, `${spec.toolName}.ts`), toolSource, 'utf8')
        writeFileSync(join(generatedDir, `${spec.toolName}.test.ts`), testSource, 'utf8')
        smokePassed = runSmokeTest(join(generatedDir, `${spec.toolName}.test.ts`), {
          ...(options.smokeTimeoutMs === undefined ? {} : { timeoutMs: options.smokeTimeoutMs }),
        }).passed
      }
    }

    const status = smokePassed ? 'active' : 'draft'
    const reason = impl === undefined
      ? '无 L1 实现登记:降级为参数模板 + 人工填写(AC-B2.5)'
      : smokePassed
        ? 'smoke 通过'
        : 'smoke 失败:参数模板或实现与预期输出不符,留在 generated/ 供人工修补'
    records.push({
      toolName: spec.toolName,
      methodId: spec.methodId,
      paperId: spec.paperId,
      evidencePage: spec.evidencePage,
      status,
      reason,
    })
  }

  const activeNames = records.filter((r) => r.status === 'active').map((r) => r.toolName)
  const draftNames = records.filter((r) => r.status === 'draft').map((r) => r.toolName)
  const passRate = records.length === 0 ? 0 : activeNames.length / records.length
  const generatedAt = new Date().toISOString()

  const reportPath = join(generatedDir, 'report.json')

  if (options.dryRun !== true) {
    mkdirSync(generatedDir, { recursive: true })
    writeFileSync(
      join(generatedDir, 'registry.generated.ts'),
      renderRegistrySource({
        activeToolNames: activeNames,
        draftToolNames: draftNames,
        generatedAt,
        specFiles: input.specFiles,
      }),
      'utf8',
    )
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          generatedAt,
          specFiles: input.specFiles,
          passRate,
          tools: records,
          skipped,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    )
  }

  return { generatedDir, tools: records, skipped, passRate, reportPath }
}

/** 从 specs 目录(或单个文件)读取并生成 */
export function generateFromSpecFiles(specPath: string, options: GenerateOptions = {}): GenerateResult {
  const files = specPath.endsWith('.methods.json') ? [specPath] : findSpecFiles(specPath)
  const specs: MethodSpec[] = []
  const problems: string[] = []
  for (const file of files) {
    const loaded = loadSpecs(file)
    specs.push(...loaded.specs)
    problems.push(...loaded.problems.map((p) => `${file}: ${p}`))
  }
  const result = generateFromSpecs({ specs, specFiles: files }, options)
  if (problems.length > 0) {
    console.warn('[toolsynth] spec 校验问题(已跳过):')
    for (const p of problems) console.warn(`  - ${p}`)
  }
  return result
}

// 独立运行:node src/services/toolsynth/generate.ts [specs 目录]
if (import.meta.main) {
  const specPath = process.argv[2] ?? join(process.cwd(), 'src', 'services', 'toolsynth', 'specs')
  const result = generateFromSpecFiles(specPath)
  console.log(`生成完成:${result.generatedDir}`)
  console.log(`active ${result.tools.filter((t) => t.status === 'active').length} / draft ${result.tools.filter((t) => t.status === 'draft').length} / skipped ${result.skipped.length}`)
  console.log(`通过率 ${(result.passRate * 100).toFixed(0)}%(验收阈值 ≥60%)`)
  for (const t of result.tools) console.log(`  ${t.status === 'active' ? '✓' : '✗'} ${t.toolName}  ${t.status}  ${t.reason}`)
  for (const s of result.skipped) console.log(`  - ${s.name}:${s.reason}`)
}
