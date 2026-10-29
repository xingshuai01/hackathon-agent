/**
 * smoke test:webshop_score(由 src/services/toolsynth/render.ts 生成,勿手改)
 *
 * 依据:MethodSpec「WebShop 平均得分与成功率」,证据 p.7(paperId=arxiv:2210.03629)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { webshop_score } from './webshop_score.ts'
import type { ToolContext } from '../types.ts'

const ctx: ToolContext = {
  signal: AbortSignal.timeout(5_000),
  mode: 'live',
  trace: { write() {} },
  cache: { get: async () => null, set: async () => {} },
}

test('webshop_score smoke:合法入参返回预期输出', async () => {
  const result = await webshop_score.call({ requiredCount: 4, matchedCount: 3 }, ctx)
  assert.equal(result.ok, true)
  if (result.ok) assert.ok(result.summary.includes("score=0.75"))
})
