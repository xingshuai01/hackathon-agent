/**
 * L1 实现目录 —— 「方法 → 确定性实现」的登记处。
 *
 * ── 为什么模板里不能直接塞实现 ──
 * `render.ts` 只做模板填充,它不知道某个 methodId 该怎么算。本文件把
 * 「论文里描述的方法」映射到一段**确定性的 TypeScript 计算逻辑**:
 *
 *   - `zodFields`:工具 inputSchema 的字段源码(单源真相,比 MethodSpec.params 更精确)
 *   - `fnSource`:`call()` 函数体,接收 `input`,必须返回 `toolOk(...)`
 *   - `smokeInput` / `smokeExpect`:smoke test 的入参与期望(summary 子串)
 *
 * ── L1 的边界(DEC-019)──
 * 只允许**纯计算**。没有网络、没有文件系统、没有随机数 —— 这样生成出来的工具
 * 天然 isReadOnly + isConcurrencySafe,smoke test 也永远可复现。
 *
 * 每个实现都注明证据页码(数据铁律 #2)。新增实现时必须:
 *   1. methodId 与 specs/*.methods.json 里的 MethodSpec 一一对应
 *   2. 补充一条 render.test.ts 的「spec.params 与 zodFields 字段一致」用例
 */

import type { MethodSpec } from './types.ts'

export interface L1Impl {
  readonly methodId: string
  /** inputSchema 的字段源码,每行一条,如 `answers: z.array(z.string().min(1)).min(1),` */
  readonly zodFields: readonly string[]
  /** `call()` 函数体。用 `input.<字段名>` 取值,return toolOk(...) */
  readonly fnSource: string
  /** smoke test 的入参(TS 对象字面量,必须能通过 inputSchema 校验) */
  readonly smokeInput: string
  /** smoke test 期望 summary 包含的子串(用于 assert.match) */
  readonly smokeExpect: string
}

// ─────────────────────────────────────────────────────────────
// 登记表(全部来自 ReAct 论文 arxiv:2210.03629)
// ─────────────────────────────────────────────────────────────

export const L1_IMPLS: readonly L1Impl[] = [
  {
    // 证据:p5「sampling 21 CoT trajectories ... adopting the majority answer」
    methodId: 'react-cotsc-majority',
    zodFields: [`answers: z.array(z.string().min(1)).min(1),`],
    fnSource: `const counts = new Map<string, number>()
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
      \`多数答案 "\${winner}"(\${String(best)}/\${String(input.answers.length)} 票)\`,
    )`,
    smokeInput: `{ answers: ['a', 'b', 'a', 'c', 'a'] }`,
    smokeExpect: `3/5`,
  },
  {
    // 证据:p5「B) CoT-SC → ReAct: when the majority answer among n CoT-SC samples
    //        occurs less than n/2 times ... back off to ReAct.」
    methodId: 'react-cotsc-backoff',
    zodFields: [
      `majorityCount: z.number().int().min(0),`,
      `total: z.number().int().min(1),`,
    ],
    fnSource: `const backoff = input.majorityCount < input.total / 2
    return toolOk(
      { backoff, majorityCount: input.majorityCount, total: input.total },
      backoff
        ? \`应回退到 ReAct:多数票 \${String(input.majorityCount)}/\${String(input.total)} < n/2,内部知识不足以支撑答案\`
        : \`多数意见成立(\${String(input.majorityCount)}/\${String(input.total)}),不回退\`,
    )`,
    smokeInput: `{ majorityCount: 2, total: 5 }`,
    smokeExpect: `应回退到 ReAct`,
  },
  {
    // 证据:p5「A) ReAct → CoT-SC: when ReAct fails to return an answer within given
    //        steps, back off to CoT-SC. We set 7 and 5 steps for HotpotQA and FEVER」
    methodId: 'react-step-backoff',
    zodFields: [
      `stepsUsed: z.number().int().min(0),`,
      `maxSteps: z.number().int().min(1).optional(),`,
    ],
    fnSource: `// 论文默认值:HotpotQA 7 步、FEVER 5 步(更多步数不再提升性能)
    const maxSteps = input.maxSteps ?? 7
    const backoff = input.stepsUsed >= maxSteps
    return toolOk(
      { backoff, stepsUsed: input.stepsUsed, maxSteps },
      backoff
        ? \`已用 \${String(input.stepsUsed)} 步,达到上限 \${String(maxSteps)},应回退到 CoT-SC\`
        : \`已用 \${String(input.stepsUsed)}/\${String(maxSteps)} 步,继续 ReAct\`,
    )`,
    smokeInput: `{ stepsUsed: 7 }`,
    smokeExpect: `达到上限 7`,
  },
  {
    // 证据:p7「evaluated by average score (percentage of desired attributes covered
    //        by the chosen product averaged across all episodes) and success rate
    //        (percentage of episodes where the chosen product satisfies all requirements)」
    methodId: 'react-webshop-score',
    zodFields: [
      `requiredCount: z.number().int().min(1),`,
      `matchedCount: z.number().int().min(0),`,
    ],
    fnSource: `const score = input.matchedCount / input.requiredCount
    const success = input.matchedCount >= input.requiredCount
    return toolOk(
      { score, success, requiredCount: input.requiredCount, matchedCount: input.matchedCount },
      \`score=\${score.toFixed(2)},success=\${String(success)}(\${String(input.matchedCount)}/\${String(input.requiredCount)} 属性匹配)\`,
    )`,
    smokeInput: `{ requiredCount: 4, matchedCount: 3 }`,
    smokeExpect: `score=0.75`,
  },
  {
    // 证据:p7「Following Shridhar et al. (2020b), we evaluate on 134 unseen
    //        evaluation games」(成功率 = 成功局数 / 总局数)
    methodId: 'react-alfworld-rate',
    zodFields: [
      `successes: z.number().int().min(0),`,
      `total: z.number().int().min(1),`,
    ],
    fnSource: `const rate = input.successes / input.total
    return toolOk(
      { rate, successes: input.successes, total: input.total },
      \`成功率 \${(rate * 100).toFixed(1)}%(\${String(input.successes)}/\${String(input.total)})\`,
    )`,
    smokeInput: `{ successes: 71, total: 100 }`,
    smokeExpect: `71.0%`,
  },
]

/** 查登记表。methodId 不在目录里 → 生成器降级为「参数模板 + 人工填写」(AC-B2.5) */
export function implFor(methodId: string): L1Impl | undefined {
  return L1_IMPLS.find((impl) => impl.methodId === methodId)
}

/** 人类可读的目录清单,给生成器写运行报告用 */
export function listImplMethodIds(): readonly string[] {
  return L1_IMPLS.map((impl) => impl.methodId)
}

/** 登记表的参数名清单(与 spec.params 做一致性校验用,见 render.test.ts) */
export function implParamNames(impl: L1Impl): readonly string[] {
  return impl.zodFields
    .map((field) => /^\s*([a-zA-Z0-9_]+)\s*:/.exec(field)?.[1])
    .filter((name): name is string => name !== undefined)
}

/**
 * 一致性检查:spec 声明的必填参数必须都能在 zodFields 里找到。
 * 防止「spec 文档说有三个参数,模板只生成了两个」这类漂移。
 */
export function checkSpecImplConsistency(spec: MethodSpec, impl: L1Impl): string[] {
  const problems: string[] = []
  const fields = new Set(implParamNames(impl))
  for (const param of spec.params) {
    if (param.required && !fields.has(param.name)) {
      problems.push(`必填参数 ${param.name} 在 L1 实现的 zodFields 中缺失`)
    }
  }
  return problems
}
