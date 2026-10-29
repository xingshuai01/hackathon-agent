/**
 * 生成工具:normalize_answer
 *
 * 来源:MethodSpec「EM 归一化(Rajpurkar et al., 2016)」(paperId=arxiv:2210.03629)
 * 证据页码:p.6
 * 原文引文:we randomly sampled 50 trajectories with correct and incorrect answers (judged by EM) from ReAct
 * 状态:draft(参数模板,待人工补写实现)
 *
 * ⚠️ 本文件由 src/services/toolsynth/render.ts 模板填充生成,不要手改。
 * 改实现 → src/services/toolsynth/impls.ts;改规格 → specs/*.methods.json,
 * 然后重跑 node src/services/toolsynth/generate.ts。
 */

import { z } from 'zod'
import { buildTool, toolOk, toolFail } from '../types.ts'

export const normalize_answer = buildTool({
  name: 'normalize_answer',
  description: () =>
    `EM 归一化(Rajpurkar et al., 2016)。来自论文 arxiv:2210.03629 p.6。前提:论文只提到用 EM 判定对错(Rajpurkar et al., 2016),归一化规则未在正文给出 —— 因此本工具降级为参数模板,待人工补实现。当任务需要这一计算时使用。`,
  inputSchema: z.strictObject({
  text: z.string().min(1).describe("待归一化的答案文本")
  }),
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  async call(input, _ctx) {
    return toolFail(
      '工具「EM 归一化(Rajpurkar et al., 2016)」尚未登记确定性 L1 实现:MethodSpec 已降级为参数模板(AC-B2.5)。参数已按规格生成并被 zod 校验,但计算逻辑需要人工补写。',
      '补写位置:src/services/toolsynth/impls.ts 登记 methodId=react-normalize-answer,然后重跑 generate.ts 与 tools doctor',
    )
  },
})
