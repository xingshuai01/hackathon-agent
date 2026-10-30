/**
 * 生成工具的注册表 —— **由 src/services/toolsynth/generate.ts 自动生成,勿手改**。
 *
 * - 只有 smoke 通过(active)的工具列在 generatedTools 里,main.ts 会循环注册
 * - draft 工具(未过 smoke,不进可调用池):normalize_answer —— 见 report.json 的降级原因。
 * - 改 MethodSpec 或 L1 实现后,重跑:node src/services/toolsynth/generate.ts
 *
 * 生成时间:2026-10-30T16:16:50.793Z
 * 来源 specs:C:\Users\ASUS\Desktop\hacthon pro\src\services\toolsynth\specs\arxiv-2210.03629.methods.json
 */

import type { Tool } from '../types.ts'
import { majority_vote } from './majority_vote.ts'
import { should_backoff_to_react } from './should_backoff_to_react.ts'
import { step_backoff_to_cotsc } from './step_backoff_to_cotsc.ts'
import { webshop_score } from './webshop_score.ts'
import { success_rate } from './success_rate.ts'

// 每个工具的入参类型都不同,统一断言成 Tool<unknown> 才能放进同一个数组
// (与 src/tools/infra.ts 的 infraTools 同一模式;入参安全性由 invokeTool 的 schema 校验保证)
export const generatedTools = [majority_vote, should_backoff_to_react, step_backoff_to_cotsc, webshop_score, success_rate] as unknown as readonly Tool<unknown>[]
