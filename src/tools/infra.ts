/**
 * 演示与自检用的最小工具集。
 *
 * 存在的意义:
 *  1. 让 `npm run verify` 与 `--fake` 演示有一个真实可调用的工具
 *  2. 给三位同学一个「照这个写」的最小模板
 *
 * 注意:这里只放**基础设施级**工具。业务工具(A 检索 / B 生成)由各自负责人实现。
 */

import { z } from 'zod'
import { buildTool, toolOk, type Tool } from './types.ts'

/** 原样回显。用于连通性验证与单测 */
export const echoTool = buildTool({
  name: 'echo',
  description: () => '原样返回输入文本。仅用于连通性验证,不要用它做事。',
  inputSchema: z.strictObject({
    text: z.string().min(1).describe('要回显的文本'),
  }),
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  async call(input) {
    return toolOk({ echoed: input.text }, `echoed:${input.text}`)
  },
})

/** 当前时间。用来验证「工具能拿到真实外部信息」 */
export const nowTool = buildTool({
  name: 'now',
  description: () => '返回当前时间(ISO 8601)。用于需要时间戳的任务。',
  inputSchema: z.strictObject({}),
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  async call() {
    const iso = new Date().toISOString()
    return toolOk({ iso }, `当前时间 ${iso}`)
  },
})

/** 四则运算。用来验证「工具能执行真实计算」 */
export const calcTool = buildTool({
  name: 'calc',
  description: () =>
    '对两个数做四则运算(add/sub/mul/div)。用于需要精确计算的场景,不要心算。',
  inputSchema: z.strictObject({
    a: z.number().describe('左操作数'),
    b: z.number().describe('右操作数'),
    op: z.enum(['add', 'sub', 'mul', 'div']).describe('运算符'),
  }),
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  validateInput: (input) =>
    input.op === 'div' && input.b === 0
      ? { ok: false, message: '除数不能为 0' }
      : { ok: true },
  async call(input) {
    const { a, b, op } = input
    const value =
      op === 'add' ? a + b : op === 'sub' ? a - b : op === 'mul' ? a * b : a / b
    return toolOk({ value }, `${a} ${op} ${b} = ${value}`)
  },
})

/**
 * 基础设施级工具集合。main.ts 默认注册这些。
 *
 * 为什么断言成 `Tool<unknown>[]`:每个工具的入参类型都不同,
 * 数组字面量会退化成联合类型,而注册表的 `register<In>` 期望单一泛型。
 * 统一成 `Tool<unknown>` 只是为了让它们能放进同一个数组 ——
 * 真正的入参安全性由 `invokeTool` 里的 `inputSchema.safeParse` 保证。
 */
export const infraTools = [echoTool, nowTool, calcTool] as unknown as readonly Tool<unknown>[]
