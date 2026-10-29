/**
 * smoke test:should_backoff_to_react(由 src/services/toolsynth/render.ts 生成,勿手改)
 *
 * 依据:MethodSpec「CoT-SC → ReAct 回退判定」,证据 p.5(paperId=arxiv:2210.03629)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { should_backoff_to_react } from './should_backoff_to_react.ts'
import type { ToolContext } from '../types.ts'

const ctx: ToolContext = {
  signal: AbortSignal.timeout(5_000),
  mode: 'live',
  trace: { write() {} },
  cache: { get: async () => null, set: async () => {} },
}

test('should_backoff_to_react smoke:合法入参返回预期输出', async () => {
  const result = await should_backoff_to_react.call({ majorityCount: 2, total: 5 }, ctx)
  assert.equal(result.ok, true)
  if (result.ok) assert.ok(result.summary.includes("应回退到 ReAct"))
})
