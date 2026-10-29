/**
 * 测试共享助手:加载「已提交的 specs 产物」(specs/*.methods.json)。
 *
 * 这个文件不是测试,只是避免每个测试文件各自复制加载逻辑。
 * npm test 的 glob 只扫 *.test.ts,本文件不会被当成用例。
 */

import { join } from 'node:path'
import { loadSpecs } from '../../src/services/toolsynth/generate.ts'
import type { MethodSpec } from '../../src/services/toolsynth/types.ts'

export const SPEC_FILE = join(
  process.cwd(),
  'src',
  'services',
  'toolsynth',
  'specs',
  'arxiv-2210.03629.methods.json',
)

/** 已提交的 MethodSpec 列表(校验失败直接抛 —— 这是测试,失败就该炸) */
export function committedSpecs(): readonly MethodSpec[] {
  const loaded = loadSpecs(SPEC_FILE)
  if (loaded.problems.length > 0) {
    throw new Error(`已提交 specs 校验失败:${loaded.problems.join(';')}`)
  }
  return loaded.specs
}
