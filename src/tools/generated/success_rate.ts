/**
 * 生成工具:success_rate
 *
 * 来源:MethodSpec「ALFWorld 成功率」(paperId=arxiv:2210.03629)
 * 证据页码:p.7
 * 原文引文:Following Shridhar et al. (2020b), we evaluate on 134 unseen evaluation games
 * 状态:active(L1 确定性实现)
 *
 * ⚠️ 本文件由 src/services/toolsynth/render.ts 模板填充生成,不要手改。
 * 改实现 → src/services/toolsynth/impls.ts;改规格 → specs/*.methods.json,
 * 然后重跑 node src/services/toolsynth/generate.ts。
 */

import { z } from 'zod'
import { buildTool, toolOk, toolFail } from '../types.ts'

export const success_rate = buildTool({
  name: 'success_rate',
  description: () =>
    `ALFWorld 成功率。来自论文 arxiv:2210.03629 p.7。前提:ALFWorld 评估场景:已有每局成功/失败的判定结果;论文评估设置:134 个未见的评估游戏。当任务需要这一计算时使用。`,
  inputSchema: z.strictObject({
  successes: z.number().int().min(0),
  total: z.number().int().min(1),
  }),
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  validateInput: (input) => {
    if (input.successes > input.total) return { ok: false, message: 'successes 不能大于 total:成功数不可能超过总局数' }
        return { ok: true }
  },
  async call(input, _ctx) {
    try {
      const rate = input.successes / input.total
          return toolOk(
            { rate, successes: input.successes, total: input.total },
            `成功率 ${(rate * 100).toFixed(1)}%(${String(input.successes)}/${String(input.total)})`,
          )
    } catch (err) {
      return toolFail(`计算失败:${err instanceof Error ? err.message : String(err)}`)
    }
  },
})
