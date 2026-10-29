/**
 * smoke test:success_rate(由 src/services/toolsynth/render.ts 生成,勿手改)
 *
 * 依据:MethodSpec「ALFWorld 成功率」,证据 p.7(paperId=arxiv:2210.03629)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { success_rate } from './success_rate.ts'
import type { ToolContext } from '../types.ts'

const ctx: ToolContext = {
  signal: AbortSignal.timeout(5_000),
  mode: 'live',
  trace: { write() {} },
  cache: { get: async () => null, set: async () => {} },
}

test('success_rate smoke:合法入参返回预期输出', async () => {
  const result = await success_rate.call({ successes: 71, total: 100 }, ctx)
  assert.equal(result.ok, true)
  if (result.ok) assert.ok(result.summary.includes("71.0%"))
})
