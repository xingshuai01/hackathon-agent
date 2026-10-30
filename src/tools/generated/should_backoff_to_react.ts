/**
 * 生成工具:should_backoff_to_react
 *
 * 来源:MethodSpec「CoT-SC → ReAct 回退判定」(paperId=arxiv:2210.03629)
 * 证据页码:p.5
 * 原文引文:B) CoT-SC → ReAct: when the majority answer among n CoT-SC samples occurs less than n/2 times (i.e. internal knowledge might not support the task confidently), back off to ReAct.
 * 状态:active(L1 确定性实现)
 *
 * ⚠️ 本文件由 src/services/toolsynth/render.ts 模板填充生成,不要手改。
 * 改实现 → src/services/toolsynth/impls.ts;改规格 → specs/*.methods.json,
 * 然后重跑 node src/services/toolsynth/generate.ts。
 */

import { z } from 'zod'
import { buildTool, toolOk, toolFail } from '../types.ts'

export const should_backoff_to_react = buildTool({
  name: 'should_backoff_to_react',
  description: () =>
    `CoT-SC → ReAct 回退判定。来自论文 arxiv:2210.03629 p.5。前提:已经跑完 CoT-SC 采样并统计出多数答案的票数。当任务需要这一计算时使用。`,
  inputSchema: z.strictObject({
  majorityCount: z.number().int().min(0),
  total: z.number().int().min(1),
  }),
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  validateInput: (input) => {
    if (input.majorityCount > input.total) return { ok: false, message: 'majorityCount 不能大于 total:多数票数不可能超过总采样数' }
        return { ok: true }
  },
  async call(input, _ctx) {
    try {
      const backoff = input.majorityCount < input.total / 2
          return toolOk(
            { backoff, majorityCount: input.majorityCount, total: input.total },
            backoff
              ? `应回退到 ReAct:多数票 ${String(input.majorityCount)}/${String(input.total)} < n/2,内部知识不足以支撑答案`
              : `多数意见成立(${String(input.majorityCount)}/${String(input.total)}),不回退`,
          )
    } catch (err) {
      return toolFail(`计算失败:${err instanceof Error ? err.message : String(err)}`)
    }
  },
})
