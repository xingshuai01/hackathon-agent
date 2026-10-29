/**
 * doctor.ts 单测:runDoctor / formatDoctorReport。
 *
 * 用 generateFromSpecs 在临时目录造出真实产物(5 active + 1 draft),
 * 再对同一目录跑体检 —— 完整复现 `tools doctor` 的数据流,零网络请求。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { formatDoctorReport, runDoctor } from '../../src/services/toolsynth/doctor.ts'
import { generateFromSpecs } from '../../src/services/toolsynth/generate.ts'
import { SPEC_FILE, committedSpecs } from './specs.ts'

const ROOT = process.cwd()

function makeTmpDir(prefix: string): { dir: string; typesImport: string } {
  const base = join(ROOT, 'tmp', 'toolsynth-test')
  mkdirSync(base, { recursive: true })
  const dir = mkdtempSync(join(base, `${prefix}-`))
  const typesImport = relative(dir, join(ROOT, 'src', 'tools', 'types.ts')).replaceAll('\\', '/')
  return { dir, typesImport }
}

describe('runDoctor', () => {
  it('对生成产物汇总 active/draft 与通过率,draft 原因来自 report.json', () => {
    const { dir, typesImport } = makeTmpDir('doctor')
    try {
      generateFromSpecs(
        { specs: committedSpecs(), specFiles: [SPEC_FILE] },
        { generatedDir: dir, typesImport, smokeTimeoutMs: 30_000 },
      )

      const report = runDoctor({ generatedDir: dir, timeoutMs: 30_000 })
      assert.equal(report.total, 6)
      assert.equal(report.active, 5)
      assert.equal(report.draft, 1)
      assert.ok(report.passRate > 0.6)

      const draftEntry = report.tools.find((t) => t.toolName === 'normalize_answer')
      assert.ok(draftEntry !== undefined)
      assert.equal(draftEntry.status, 'draft')
      assert.ok(draftEntry.reason.includes('无 L1 实现登记'))

      const activeEntry = report.tools.find((t) => t.toolName === 'majority_vote')
      assert.ok(activeEntry !== undefined)
      assert.equal(activeEntry.status, 'active')
      assert.equal(activeEntry.reason, 'smoke 通过')

      // 格式报告可读:通过率、验收阈值、每个工具的 ✓/✗
      const text = formatDoctorReport(report)
      assert.ok(text.includes('通过率 83%'))
      assert.ok(text.includes('验收阈值 ≥60%'))
      assert.ok(text.includes('✓ majority_vote'))
      assert.ok(text.includes('✗ normalize_answer'))
      assert.ok(text.includes('draft 不进 Agent 可调用池'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('空目录 → 总数 0,报告给出下一步提示(不 throw)', () => {
    const base = join(ROOT, 'tmp', 'toolsynth-test')
    mkdirSync(base, { recursive: true })
    const dir = mkdtempSync(join(base, 'doctor-empty-'))
    try {
      const report = runDoctor({ generatedDir: dir })
      assert.equal(report.total, 0)
      assert.equal(report.active, 0)
      assert.equal(report.passRate, 0)
      assert.ok(formatDoctorReport(report).includes('没有生成工具'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
