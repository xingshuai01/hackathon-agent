/**
 * 生成工具的注册表 —— **B 模块的产出汇总点**。
 *
 * ── 这个文件为什么存在 ──
 *
 * `src/services/toolsynth/render.ts` 会往 `src/tools/generated/` 里生成工具文件,
 * 但「生成完」不等于「模型能调用」——它们必须被 `registry.register()` 进池子。
 * 如果由 B 直接改 `src/main.ts` 去注册,那么 B 和骨架负责人会一直抢同一个文件。
 *
 * 约定:**B 只改这个文件,不改 main.ts**。
 *
 * ── 两种维护方式(选一种即可)──
 *
 * 1. 手写(工具少时最简单):在下面 import 并加进数组
 * 2. 自动生成(render.ts 覆写本文件):生成器直接输出这个文件的全文
 *
 * 目前是空数组 —— main.ts 会照常启动,只是没有生成工具可用。
 */

import type { Tool } from '../types.ts'

/**
 * 待注册的生成工具。
 *
 * 约束(与 `Tool` 契约一致,check:rules 不会替你检查):
 * - `name` 只能含 `[a-zA-Z0-9_]`,且不能与手写工具重名(重名时后者覆盖前者并告警)
 * - 未过 smoke test 的工具**不要放进来**。STRUCTURE 的验收要求
 *   「未过 smoke 的工具标 draft,不进可调用池」—— 放进来就等于让模型调用一个坏工具
 */
export const generatedTools: readonly Tool<never>[] = []
