/**
 * generate.ts 端到端测试:用「已提交的 specs 产物」在临时目录里完整跑一遍
 * 渲染 → 落盘 → 子进程 smoke → 注册表,断言 5 active / 1 draft、注册表只列
 * active、draft 不生成 .test.ts(不把注定失败的用例带进 npm test)。
 *
 * 临时目录放在仓库内(tmp/,已被 gitignore),这样生成文件的相对 import
 * (../types.ts → ../../src/tools/types.ts)在子进程里能解析。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { generateFromSpecs, loadSpecs } from '../../src/services/toolsynth/generate.ts'
import { SPEC_FILE, committedSpecs } from './specs.ts'

const ROOT = process.cwd()

function makeTmpDir(prefix: string): { dir: string; typesImport: string } {
  const base = join(ROOT, 'tmp', 'toolsynth-test')
  mkdirSync(base, { recursive: true })
  const dir = mkdtempSync(join(base, `${prefix}-`))
  // 生成文件里的 `import ... from '<typesImport>'` 要能跨平台解析 → 相对路径 + 正斜杠
  const typesImport = relative(dir, join(ROOT, 'src', 'tools', 'types.ts')).replaceAll('\\', '/')
  return { dir, typesImport }
}

describe('generateFromSpecs(端到端)', () => {
  it('渲染 + 落盘 + smoke:5 active / 1 draft,通过率超 60% 验收阈值', () => {
    const { dir, typesImport } = makeTmpDir('gen')
    try {
      const loaded = loadSpecs(SPEC_FILE)
      assert.equal(loaded.problems.length, 0)
      const result = generateFromSpecs(
        { specs: loaded.specs, specFiles: [SPEC_FILE] },
        { generatedDir: dir, typesImport, smokeTimeoutMs: 30_000 },
      )

      assert.equal(result.tools.length, 6)
      assert.equal(result.tools.filter((t) => t.status === 'active').length, 5)
      assert.equal(result.tools.filter((t) => t.status === 'draft').length, 1)
      assert.ok(
        result.passRate > 0.6,
        `通过率 ${result.passRate} 应超过 60% 验收阈值(SRS A-7)`,
      )

      // 注册表只 import active 工具,draft 名单进注释
      const registry = readFileSync(join(dir, 'registry.generated.ts'), 'utf8')
      assert.ok(registry.includes("import { majority_vote } from './majority_vote.ts'"))
      assert.ok(!registry.includes('normalize_answer } from'))
      assert.ok(registry.includes('draft 工具(未过 smoke,不进可调用池):normalize_answer'))

      // draft(参数模板)只落盘工具文件,不生成 .test.ts
      assert.ok(existsSync(join(dir, 'normalize_answer.ts')))
      assert.ok(!existsSync(join(dir, 'normalize_answer.test.ts')))

      // report.json 记录通过率与降级原因(AC-B2.5 不静默丢弃)
      const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as Record<
        string,
        unknown
      >
      assert.equal(report['passRate'], result.passRate)
      const tools = report['tools']
      assert.ok(Array.isArray(tools))
      const draft = tools.find(
        (t): t is { toolName: string; reason?: string } =>
          t !== null && typeof t === 'object' && (t as Record<string, unknown>)['toolName'] === 'normalize_answer',
      )
      assert.ok(draft !== undefined)
      assert.ok(draft.reason?.includes('无 L1 实现登记'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('dryRun:不落盘、不跑 smoke', () => {
    const { dir, typesImport } = makeTmpDir('dry')
    try {
      generateFromSpecs(
        { specs: committedSpecs(), specFiles: [SPEC_FILE] },
        { generatedDir: dir, typesImport, dryRun: true },
      )
      assert.equal(existsSync(join(dir, 'registry.generated.ts')), false)
      assert.equal(existsSync(join(dir, 'majority_vote.ts')), false)
      assert.equal(existsSync(join(dir, 'majority_vote.test.ts')), false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('unsupported / L2 规格被跳过并记录原因(不静默丢弃)', () => {
    const { dir, typesImport } = makeTmpDir('skip')
    try {
      const loaded = loadSpecs(SPEC_FILE)
      const skippedSpecs = [
        {
          methodId: 't-unsupported',
          paperId: 'test-paper',
          name: 'unsupported thing',
          toolName: 'unsupported_thing',
          params: [],
          preconditions: [],
          evidencePage: 1,
          supportLevel: 'unsupported',
        },
        {
          methodId: 't-l2',
          paperId: 'test-paper',
          name: 'multi step pipeline',
          toolName: 'multi_step_pipeline',
          params: [],
          preconditions: [],
          evidencePage: 1,
          supportLevel: 'L2',
        },
      ] as const
      const result = generateFromSpecs(
        { specs: [...loaded.specs, ...skippedSpecs], specFiles: [SPEC_FILE] },
        { generatedDir: dir, typesImport, smokeTimeoutMs: 30_000 },
      )
      assert.equal(result.skipped.length, 2)
      assert.ok(result.skipped[0]?.reason.includes('unsupported'))
      assert.ok(result.skipped[1]?.reason.includes('只承诺 L1'))
      // 跳过的规格不落盘
      assert.equal(existsSync(join(dir, 'unsupported_thing.ts')), false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
