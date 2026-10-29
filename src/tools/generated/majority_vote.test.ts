/**
 * smoke test:majority_vote(由 src/services/toolsynth/render.ts 生成,勿手改)
 *
 * 依据:MethodSpec「CoT-SC 多数投票 (self-consistency majority vote)」,证据 p.5(paperId=arxiv:2210.03629)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { majority_vote } from './majority_vote.ts'
import type { ToolContext } from '../types.ts'

const ctx: ToolContext = {
  signal: AbortSignal.timeout(5_000),
  mode: 'live',
  trace: { write() {} },
  cache: { get: async () => null, set: async () => {} },
}

test('majority_vote smoke:合法入参返回预期输出', async () => {
  const result = await majority_vote.call({ answers: ['a', 'b', 'a', 'c', 'a'] }, ctx)
  assert.equal(result.ok, true)
  if (result.ok) assert.ok(result.summary.includes("3/5"))
})
