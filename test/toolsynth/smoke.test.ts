/**
 * smoke.ts 单测:runSmokeTest / scanGeneratedTools。
 *
 * smoke 的执行语义是「子进程 node --test」,与 npm test 同一条路径 ——
 * 这里用真实的生成工具文件验证通过路径,用临时目录验证缺测试文件的失败路径。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSmokeTest, scanGeneratedTools } from '../../src/services/toolsynth/smoke.ts'

const ROOT = process.cwd()

describe('runSmokeTest', () => {
  it('真实生成工具的 smoke 通过(exit 0)', () => {
    const result = runSmokeTest(join(ROOT, 'src', 'tools', 'generated', 'majority_vote.test.ts'), {
      timeoutMs: 20_000,
    })
    assert.equal(result.passed, true)
    assert.equal(result.exitCode, 0)
  })

  it('测试文件不存在 → 失败(exit 非 0)', () => {
    const result = runSmokeTest(join(ROOT, 'src', 'tools', 'generated', 'no_such_tool.test.ts'))
    assert.equal(result.passed, false)
    assert.ok(result.exitCode !== 0)
  })
})

describe('scanGeneratedTools', () => {
  it('缺少 .test.ts 的工具按 smoke 失败计(保持 draft)', () => {
    const base = join(ROOT, 'tmp', 'toolsynth-test')
    mkdirSync(base, { recursive: true })
    const dir = mkdtempSync(join(base, 'scan-'))
    try {
      // 孤儿工具:没有测试文件 → smoke 失败
      writeFileSync(join(dir, 'orphan_tool.ts'), 'export const x = 1\n', 'utf8')
      // 成对工具:测试文件存在且通过 → smoke 通过
      writeFileSync(join(dir, 'pair_tool.ts'), 'export const y = 2\n', 'utf8')
      writeFileSync(
        join(dir, 'pair_tool.test.ts'),
        "import { test } from 'node:test'\nimport assert from 'node:assert/strict'\ntest('ok', () => { assert.equal(1, 1) })\n",
        'utf8',
      )
      // 非工具文件:跳过
      writeFileSync(join(dir, 'registry.generated.ts'), 'export const generatedTools = []\n', 'utf8')

      const entries = scanGeneratedTools({ generatedDir: dir, timeoutMs: 20_000 })
      const names = entries.map((e) => e.toolName).sort()
      assert.deepEqual(names, ['orphan_tool', 'pair_tool'])

      const orphan = entries.find((e) => e.toolName === 'orphan_tool')
      assert.ok(orphan !== undefined)
      assert.equal(orphan.smoke.passed, false)
      assert.ok(orphan.smoke.output.includes('缺少 smoke test 文件'))

      const pair = entries.find((e) => e.toolName === 'pair_tool')
      assert.ok(pair !== undefined)
      assert.equal(pair.smoke.passed, true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('目录不存在 → 空结果(不 throw)', () => {
    const entries = scanGeneratedTools({ generatedDir: join(ROOT, 'tmp', 'does-not-exist-xyz') })
    assert.deepEqual(entries, [])
  })
})
