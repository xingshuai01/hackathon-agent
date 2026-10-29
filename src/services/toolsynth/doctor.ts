/**
 * 工具体检(doctor):批量跑 smoke,输出通过率 —— B 模块的核心验收指标。
 *
 * `node src/main.ts tools doctor` 会调用本文件的 `runDoctor()`(main.ts 里只有一行接线),
 * 也可以独立运行:`node src/services/toolsynth/doctor.ts`。
 *
 * 输出语义(SRS AC-B5.1 / SDD §8.5):
 *   - 每个生成工具:smoke 通过 → active;失败 → draft
 *   - 通过率 = active / 总数,验收阈值 ≥60%(SRS A-7 / STRUCTURE §8)
 *   - draft 的原因从 report.json 读取(generate.ts 写入),读不到就写「smoke 失败」
 *
 * 依据:SRS FR-B5、docs/SDD.md §8.5、Issue #30。
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scanGeneratedTools, type SmokeResult } from './smoke.ts'

export type ToolStatus = 'active' | 'draft'

export interface DoctorToolEntry {
  readonly toolName: string
  readonly status: ToolStatus
  readonly smoke: SmokeResult
  /** draft 原因(来自 report.json 或 smoke 输出摘要) */
  readonly reason: string
}

export interface DoctorReport {
  readonly generatedDir: string
  readonly tools: readonly DoctorToolEntry[]
  readonly total: number
  readonly active: number
  readonly draft: number
  readonly passRate: number
  readonly ranAt: string
}

/** generate.ts 写入的降级原因表(toolName → reason) */
interface GenerationReport {
  readonly tools?: ReadonlyArray<{ toolName: string; status: ToolStatus; reason?: string }>
}

function readGenerationReport(generatedDir: string): GenerationReport | null {
  const path = join(generatedDir, 'report.json')
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as GenerationReport
  } catch {
    return null
  }
}

/** 从 node --test 的输出里抠一句可读的失败原因(截断) */
function smokeFailureReason(smoke: SmokeResult): string {
  if (smoke.output.trim() === '') return `smoke 失败(exit=${String(smoke.exitCode)},无输出)`
  const line = smoke.output.split('\n').find((l) => l.includes('✖') || l.includes('failing') || l.includes('fail'))
  if (line !== undefined) return line.trim().slice(0, 300)
  return smoke.output.trim().slice(0, 300)
}

/**
 * 批量体检。对 generated 目录里每个工具跑 smoke,汇总 active/draft 与通过率。
 * 纯本地,不调 LLM、不联网,没有 API key 也能跑。
 */
export function runDoctor(options: { readonly generatedDir: string; readonly timeoutMs?: number }): DoctorReport {
  const entries = scanGeneratedTools({
    generatedDir: options.generatedDir,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  })
  const reasons = readGenerationReport(options.generatedDir)
  const reasonByTool = new Map((reasons?.tools ?? []).map((t) => [t.toolName, t.reason]))

  const tools: DoctorToolEntry[] = entries.map((entry) => {
    const status: ToolStatus = entry.smoke.passed ? 'active' : 'draft'
    const reason =
      status === 'draft'
        ? (reasonByTool.get(entry.toolName) ?? smokeFailureReason(entry.smoke))
        : 'smoke 通过'
    return { toolName: entry.toolName, status, smoke: entry.smoke, reason }
  })

  const total = tools.length
  const active = tools.filter((t) => t.status === 'active').length
  const draft = total - active
  return {
    generatedDir: options.generatedDir,
    tools,
    total,
    active,
    draft,
    passRate: total === 0 ? 0 : active / total,
    ranAt: new Date().toISOString(),
  }
}

/** 渲染成 CLI 报告(SDD §8.5 的样式) */
export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = []
  lines.push(
    `\n生成工具 smoke 体检:总数 ${report.total}  active ${report.active}  draft ${report.draft}  通过率 ${(report.passRate * 100).toFixed(0)}%`,
  )
  lines.push(`(验收阈值 ≥60%,见 SRS A-7;draft 不进 Agent 可调用池)\n`)
  for (const tool of report.tools) {
    const mark = tool.status === 'active' ? '✓' : '✗'
    lines.push(`  ${mark} ${tool.toolName}  ${tool.status}`)
    if (tool.status === 'draft') lines.push(`      原因:${tool.reason}`)
  }
  if (report.total === 0) {
    lines.push(`  (${report.generatedDir} 下没有生成工具。先跑 node src/services/toolsynth/generate.ts)`)
  }
  lines.push('')
  return lines.join('\n')
}

// 独立运行:node src/services/toolsynth/doctor.ts [generatedDir]
if (import.meta.main) {
  const generatedDir = process.argv[2] ?? join(process.cwd(), 'src', 'tools', 'generated')
  const report = runDoctor({ generatedDir })
  console.log(formatDoctorReport(report))
}
