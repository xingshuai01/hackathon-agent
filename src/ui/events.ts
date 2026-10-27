/**
 * ★★★ 冻结契约 #1 · 事件总线 ★★★
 *
 * 变更规则:改动本文件的**任何已导出签名**都必须走 PR 且经 1 人 approve。
 * 依据:docs/SDD.md §3.4.2-3.4.3(一条事件流两个渲染器)、DEC-005
 * 对应任务:Issue #18
 *
 * ── 为什么要有这层 ──
 * 核心层只管 emit,不知道谁在消费。CLI 渲染器与 Web 渲染器订阅同一份事件序列。
 * 于是:
 *   1. Web 层不需要 import 任何业务代码(薄壳约束 NFR-12)
 *   2. 新增一种展示 = 加一种事件,而不是改主循环
 *   3. Web 崩了,CLI 照样能跑(降级兜底 FR-F4)
 */

// ─────────────────────────────────────────────────────────────
// 1. 事件定义:9 种,覆盖全部需要展示的语义
// ─────────────────────────────────────────────────────────────

/**
 * 判别联合。**新增类型必须同步更新 `AGENT_EVENT_TYPES`**,否则 check-rules 会失败。
 */
export type AgentEvent =
  /** LLM 流式文本增量。渲染器应追加而不是替换 */
  | { type: 'text_delta'; text: string }
  /** 工具开始执行。input 为已解析的参数对象(不是 JSON 字符串) */
  | { type: 'tool_start'; id: string; name: string; input: unknown }
  /** 工具执行结束。ok=false 时 summary 里放错误文本 */
  | { type: 'tool_end'; id: string; ok: boolean; ms: number; summary: string }
  /** 技能被加载。reason 用于向用户解释「为什么加载这个技能」 */
  | { type: 'skill_load'; skillId: string; name: string; reason: string }
  /** 知识页被引用。锚点(paperId + page)必须完整,供 UI 定位原文 */
  | { type: 'knowledge_hit'; noteId: string; paperId: string; page: number; description: string }
  /** B 模块产出了一个新工具 */
  | { type: 'tool_generated'; toolName: string; sourcePaper: string; status: 'active' | 'draft' }
  /** 长任务的阶段性进度(如「正在精读 3/10」) */
  | { type: 'progress'; step: string; done: number; total: number }
  /** 可恢复的错误。不应中断整个运行 */
  | { type: 'error'; stage: string; message: string }
  /** 一次运行结束。三面板据此刷新(FR-F2) */
  | {
      type: 'run_end'
      reason: string
      ms: number
      tokens: { input: number; output: number }
      toolCalls: number
    }

export type AgentEventType = AgentEvent['type']

/** 全部事件类型清单。新增事件必须同步加到这里,否则 check-rules 会报错 */
export const AGENT_EVENT_TYPES = [
  'text_delta',
  'tool_start',
  'tool_end',
  'skill_load',
  'knowledge_hit',
  'tool_generated',
  'progress',
  'error',
  'run_end',
] as const satisfies readonly AgentEventType[]

// ─────────────────────────────────────────────────────────────
// 2. 订阅者与总线
// ─────────────────────────────────────────────────────────────

export type EventListener = (event: AgentEvent) => void

/** 取消订阅。调用后该监听器不再收到事件 */
export type Unsubscribe = () => void

export interface EventBus {
  /** 发事件。**必须保证任何监听器抛错都不影响其他监听器,也不影响主流程** */
  emit(event: AgentEvent): void
  /** 订阅。返回取消订阅函数 */
  on(listener: EventListener): Unsubscribe
  /** 退订(等价于用 on 返回的函数,保留此方法给不保存返回值的场景) */
  off(listener: EventListener): void
  /** 当前监听器数量。仅用于测试与诊断 */
  listenerCount(): number
}

/**
 * 创建事件总线。
 *
 * 关键设计:**emit 绝不向外抛异常**。
 * 理由:一个渲染器写错(比如 DOM 操作报错)不能把 Agent 主循环带崩 ——
 * 这是 FR-F4「Web 启动失败不影响 CLI」的底层保证。
 */
export function createEventBus(): EventBus {
  const listeners = new Set<EventListener>()

  return {
    emit(event) {
      for (const listener of listeners) {
        try {
          listener(event)
        } catch (err) {
          // 故意吞掉:渲染器的问题不该影响别的渲染器和主流程
          // 用 console.error 而不是抛,方便本地调试时看到
          console.error('[event-bus] listener threw:', err)
        }
      }
    },

    on(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    off(listener) {
      listeners.delete(listener)
    },

    listenerCount() {
      return listeners.size
    },
  }
}

/**
 * 进程级共享总线。
 *
 * 用法:
 *   核心层:  bus.emit({ type:'text_delta', text:'...' })
 *   CLI 层:  bus.on(renderCli)
 *   Web 层:  bus.on(e => sse.write(e))
 */
export const bus: EventBus = createEventBus()

// ─────────────────────────────────────────────────────────────
// 3. 序列化(Web 端用)
// ─────────────────────────────────────────────────────────────

/**
 * 把事件编码成 SSE 帧。SSE 协议要求 `data: <payload>\n\n`。
 *
 * 注意:payload 内部不能含裸换行,JSON.stringify 已保证这一点。
 */
export function toSseFrame(event: AgentEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

/** 从 SSE 帧反解事件(客户端与服务端单测共用) */
export function fromSseFrame(frame: string): AgentEvent | null {
  const line = frame.trim()
  if (!line.startsWith('data:')) return null
  try {
    return JSON.parse(line.slice('data:'.length).trim()) as AgentEvent
  } catch {
    return null
  }
}
