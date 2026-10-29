/**
 * 生成工具:majority_vote
 *
 * 来源:MethodSpec「CoT-SC 多数投票 (self-consistency majority vote)」(paperId=arxiv:2210.03629)
 * 证据页码:p.5
 * 原文引文:build a self-consistency baseline (CoT-SC) (Wang et al., 2022a;b) by sampling 21 CoT trajectories with decoding temperature 0.7 during inference and adopting the majority answer, which is found to consistently boost performance over CoT.
 * 状态:active(L1 确定性实现)
 *
 * ⚠️ 本文件由 src/services/toolsynth/render.ts 模板填充生成,不要手改。
 * 改实现 → src/services/toolsynth/impls.ts;改规格 → specs/*.methods.json,
 * 然后重跑 node src/services/toolsynth/generate.ts。
 */

import { z } from 'zod'
import { buildTool, toolOk, toolFail } from '../types.ts'

export const majority_vote = buildTool({
  name: 'majority_vote',
  description: () =>
    `CoT-SC 多数投票 (self-consistency majority vote)。来自论文 arxiv:2210.03629 p.5。前提:已有同一问题的多条 CoT 采样答案(论文:21 条,decoding temperature 0.7);答案需为可直接比较的字符串。当任务需要这一计算时使用。`,
  inputSchema: z.strictObject({
  answers: z.array(z.string().min(1)).min(1),
  }),
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  async call(input, _ctx) {
    try {
      const counts = new Map<string, number>()
          let winner = input.answers[0] ?? ''
          let best = 0
          for (const answer of input.answers) {
            const count = (counts.get(answer) ?? 0) + 1
            counts.set(answer, count)
            if (count > best) {
              best = count
              winner = answer
            }
          }
          return toolOk(
            { answer: winner, count: best, total: input.answers.length },
            `多数答案 "${winner}"(${String(best)}/${String(input.answers.length)} 票)`,
          )
    } catch (err) {
      return toolFail(`计算失败:${err instanceof Error ? err.message : String(err)}`)
    }
  },
})
