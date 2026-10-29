/**
 * smoke test:step_backoff_to_cotsc(由 src/services/toolsynth/render.ts 生成,勿手改)
 *
 * 依据:MethodSpec「ReAct → CoT-SC 步数回退判定」,证据 p.5(paperId=arxiv:2210.03629)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { step_backoff_to_cotsc } from './step_backoff_to_cotsc.ts'
import type { ToolContext } from '../types.ts'

const ctx: ToolContext = {
  signal: AbortSignal.timeout(5_000),
  mode: 'live',
  trace: { write() {} },
  cache: { get: async () => null, set: async () => {} },
}

test('step_backoff_to_cotsc smoke:合法入参返回预期输出', async () => {
  const result = await step_backoff_to_cotsc.call({ stepsUsed: 7 }, ctx)
  assert.equal(result.ok, true)
  if (result.ok) assert.ok(result.summary.includes("达到上限 7"))
})
