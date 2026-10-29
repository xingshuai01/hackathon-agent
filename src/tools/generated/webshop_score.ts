/**
 * 生成工具:webshop_score
 *
 * 来源:MethodSpec「WebShop 平均得分与成功率」(paperId=arxiv:2210.03629)
 * 证据页码:p.7
 * 原文引文:This task is evaluated by average score (percentage of desired attributes covered by the chosen product averaged across all episodes) and success rate (percentage of episodes where the chosen product satisfies all requirements) on 500 test instructions.
 * 状态:active(L1 确定性实现)
 *
 * ⚠️ 本文件由 src/services/toolsynth/render.ts 模板填充生成,不要手改。
 * 改实现 → src/services/toolsynth/impls.ts;改规格 → specs/*.methods.json,
 * 然后重跑 node src/services/toolsynth/generate.ts。
 */

import { z } from 'zod'
import { buildTool, toolOk, toolFail } from '../types.ts'

export const webshop_score = buildTool({
  name: 'webshop_score',
  description: () =>
    `WebShop 平均得分与成功率。来自论文 arxiv:2210.03629 p.7。前提:WebShop 场景:已选出商品并核对属性覆盖情况。当任务需要这一计算时使用。`,
  inputSchema: z.strictObject({
  requiredCount: z.number().int().min(1),
  matchedCount: z.number().int().min(0),
  }),
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  async call(input, _ctx) {
    try {
      const score = input.matchedCount / input.requiredCount
          const success = input.matchedCount >= input.requiredCount
          return toolOk(
            { score, success, requiredCount: input.requiredCount, matchedCount: input.matchedCount },
            `score=${score.toFixed(2)},success=${String(success)}(${String(input.matchedCount)}/${String(input.requiredCount)} 属性匹配)`,
          )
    } catch (err) {
      return toolFail(`计算失败:${err instanceof Error ? err.message : String(err)}`)
    }
  },
})
