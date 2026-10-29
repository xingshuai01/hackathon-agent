/**
 * 生成工具:step_backoff_to_cotsc
 *
 * 来源:MethodSpec「ReAct → CoT-SC 步数回退判定」(paperId=arxiv:2210.03629)
 * 证据页码:p.5
 * 原文引文:when ReAct fails to return an answer within given steps, back off to CoT-SC.
 * 状态:active(L1 确定性实现)
 *
 * ⚠️ 本文件由 src/services/toolsynth/render.ts 模板填充生成,不要手改。
 * 改实现 → src/services/toolsynth/impls.ts;改规格 → specs/*.methods.json,
 * 然后重跑 node src/services/toolsynth/generate.ts。
 */

import { z } from 'zod'
import { buildTool, toolOk, toolFail } from '../types.ts'

export const step_backoff_to_cotsc = buildTool({
  name: 'step_backoff_to_cotsc',
  description: () =>
    `ReAct → CoT-SC 步数回退判定。来自论文 arxiv:2210.03629 p.5。前提:ReAct 在给定步数内未能给出答案;任务数据集已知(HotpotQA 用 7、FEVER 用 5)。当任务需要这一计算时使用。`,
  inputSchema: z.strictObject({
  stepsUsed: z.number().int().min(0),
  maxSteps: z.number().int().min(1).optional(),
  }),
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  async call(input, _ctx) {
    try {
      // 论文默认值:HotpotQA 7 步、FEVER 5 步(更多步数不再提升性能)
          const maxSteps = input.maxSteps ?? 7
          const backoff = input.stepsUsed >= maxSteps
          return toolOk(
            { backoff, stepsUsed: input.stepsUsed, maxSteps },
            backoff
              ? `已用 ${String(input.stepsUsed)} 步,达到上限 ${String(maxSteps)},应回退到 CoT-SC`
              : `已用 ${String(input.stepsUsed)}/${String(maxSteps)} 步,继续 ReAct`,
          )
    } catch (err) {
      return toolFail(`计算失败:${err instanceof Error ? err.message : String(err)}`)
    }
  },
})
