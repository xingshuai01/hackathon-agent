/**
 * LLM 回放包装器 —— #39 的核心。
 *
 * ── 要解决的问题 ──
 * 演示现场网络/额度一抖,`ask` 就跑不了。录一次,之后离线回放。
 *
 * ── 怎么工作 ──
 *   live + record:真实调用 LLM,把每个 turn/sideQuery 的结果写进 fixtures/
 *   replay       :只读 fixtures,绝不联网;缺 fixture 时抛明确错误(而非静默联网)
 *
 * ── key 设计(为什么按「任务」而不是按完整消息)──
 * 完整消息里含 system prompt(知识索引、技能清单),它每次运行都可能有细微变化,
 * 按它做 key 会导致回放命中率飘。按「任务(最后一条 user 消息)+ 模型 + 序号」
 * 做 key:同一个问题回放同一段对话,足够确定、足够鲁棒。
 *
 * 局限(可接受):回放的是「整段结果」,不是流式增量 —— 文本一次性吐给 onText。
 * 视觉上少了逐字流式的观感,但内容完全一致。演示够用。
 */

import { createHash } from 'node:crypto'
import type { Cache } from '../../tools/types.ts'
import { LlmFatalError, type LlmClient, type LlmRequest, type LlmTurn } from './types.ts'

export interface ReplayLlmOptions {
  /** 真实客户端(记录时用它,回放时不用) */
  readonly inner: LlmClient
  readonly cache: Cache
  readonly mode: 'live' | 'replay'
  /** live 模式下是否录制到 fixtures */
  readonly record: boolean
}

function sha16(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/** 从请求里取「任务」:最后一条 user 消息的文本(只读 messages,两种请求都兼容) */
function taskOf(request: Pick<LlmRequest, 'messages'>): string {
  for (let i = request.messages.length - 1; i >= 0; i -= 1) {
    const message = request.messages[i]
    if (message !== undefined && message.role === 'user') return message.content
  }
  return '(no-user-message)'
}

export function createReplayLlmClient(options: ReplayLlmOptions): LlmClient {
  // 每个任务各自计数 turn 序号(record 与 replay 两次运行会得到相同序号)
  const turnIndex = new Map<string, number>()
  const sideQueryIndex = new Map<string, number>()

  function nextIndex(map: Map<string, number>, key: string): number {
    const current = map.get(key) ?? 0
    map.set(key, current + 1)
    return current
  }

  function turnKey(model: string, task: string, index: number): string {
    return `llm:${model}:turn:${sha16(task)}:${String(index)}`
  }

  function sideQueryKey(model: string, task: string, index: number): string {
    return `llm:${model}:sidequery:${sha16(task)}:${String(index)}`
  }

  return {
    async turn(request, onText) {
      const model = request.model ?? 'default'
      const task = taskOf(request)
      const index = nextIndex(turnIndex, task)
      const key = turnKey(model, task, index)

      if (options.mode === 'replay') {
        const raw = await options.cache.get(key)
        if (raw === null) {
          throw new LlmFatalError(
            `replay 模式下没有 LLM 响应 fixture:${key}\n` +
              `  解决:先用 live 模式带 --record 跑一次同一任务,把响应录进 fixtures/ 并提交`,
          )
        }
        try {
          const turn = JSON.parse(raw) as LlmTurn
          // 回放不是流式:一次性把整段文本交给 onText(观感差异,内容一致)
          if (turn.text !== '' && onText !== undefined) onText(turn.text)
          return turn
        } catch {
          throw new LlmFatalError(`fixture 损坏(不是合法 JSON):${key}`)
        }
      }

      const result = await options.inner.turn(request, onText)
      if (options.record) {
        await options.cache.set(key, JSON.stringify(result))
      }
      return result
    },

    async sideQuery(request) {
      const model = request.model ?? 'side'
      const task = taskOf(request)
      const index = nextIndex(sideQueryIndex, task)
      const key = sideQueryKey(model, task, index)

      if (options.mode === 'replay') {
        const raw = await options.cache.get(key)
        if (raw === null) {
          throw new LlmFatalError(
            `replay 模式下没有 sideQuery fixture:${key}\n` +
              `  解决:先用 live 模式带 --record 跑一次`,
          )
        }
        return raw
      }

      const result = await options.inner.sideQuery(request)
      if (options.record) await options.cache.set(key, result)
      return result
    },
  }
}
