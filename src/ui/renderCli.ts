/**
 * CLI 渲染器 —— 消费事件总线,把 Agent 的每一步打到终端。
 *
 * 依据:DEC-005(一条事件流两个渲染器)、SDD §3.4.2。
 *
 * 这个文件**只做展示**,不含任何业务判断。Web 渲染器(`web/public/app.js`)
 * 与之消费的是同一份事件序列 —— 这就是薄壳约束的具体体现。
 */

import type { AgentEvent } from './events.ts'

/** 极简 ANSI 上色,避免为几行颜色引入 chalk(可选依赖,能不加就不加) */
const useColor = process.stdout.isTTY === true && process.env.NO_COLOR === undefined
const paint = (code: string) => (text: string) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text)
const dim = paint('2')
const bold = paint('1')
const cyan = paint('36')
const green = paint('32')
const red = paint('31')
const yellow = paint('33')
const magenta = paint('35')

export interface CliRendererOptions {
  /** 是否把工具入参也打出来(默认只打摘要) */
  readonly verboseTools?: boolean
}

function shortArgs(input: unknown): string {
  let text: string
  try {
    text = JSON.stringify(input)
  } catch {
    text = String(input)
  }
  return text.length <= 80 ? text : `${text.slice(0, 80)}…`
}

export function createCliRenderer(options: CliRendererOptions = {}) {
  const verbose = options.verboseTools === true
  let sawText = false
  /** 上一行进度。同 step/done/total 连发时只打一次 —— 事件流密集时逐帧打会刷屏 */
  let lastProgress = ''

  function handle(event: AgentEvent): void {
    switch (event.type) {
      case 'text_delta':
        if (!sawText) {
          process.stdout.write(bold('\nAgent> '))
          sawText = true
        }
        process.stdout.write(event.text)
        break

      case 'tool_start':
        if (sawText) {
          process.stdout.write('\n')
          sawText = false
        }
        process.stdout.write(
          `${dim('  ⚙')} ${cyan(event.name)} ${dim(shortArgs(event.input))}\n`,
        )
        break

      case 'tool_end': {
        const mark = event.ok ? green('✓') : red('✗')
        const ms = `${event.ms}ms`
        const summary = event.summary.length <= 120 ? event.summary : `${event.summary.slice(0, 120)}…`
        process.stdout.write(`    ${mark} ${dim(ms)} ${event.ok ? dim(summary) : red(summary)}\n`)
        if (!event.ok && verbose) process.stdout.write(dim(`    (失败详情见 logs/)\n`))
        break
      }

      case 'skill_load':
        process.stdout.write(`${magenta('  📋 加载技能')} ${event.name} ${dim(`(${event.reason})`)}\n`)
        break

      case 'knowledge_hit':
        process.stdout.write(
          `${green('  📚 引用')} ${dim(`${event.paperId} p.${event.page}`)} ${event.description.slice(0, 80)}\n`,
        )
        break

      case 'tool_generated':
        process.stdout.write(
          `${yellow('  🔧 生成工具')} ${event.toolName} ${dim(`[${event.status}] 来自 ${event.sourcePaper}`)}\n`,
        )
        break

      case 'progress': {
        const key = `${event.step}:${String(event.done)}/${String(event.total)}`
        if (event.total > 1 && key !== lastProgress) {
          lastProgress = key
          process.stdout.write(dim(`  … ${event.step} ${event.done}/${event.total}\n`))
        }
        break
      }

      case 'error':
        if (sawText) {
          process.stdout.write('\n')
          sawText = false
        }
        process.stdout.write(`${red('  ✗')} ${dim(`[${event.stage}]`)} ${event.message}\n`)
        break

      case 'run_end': {
        if (sawText) {
          process.stdout.write('\n')
          sawText = false
        }
        const tint = event.reason === 'completed' ? green : yellow
        process.stdout.write(
          `\n${tint(`■ ${event.reason}`)} ${dim(
            `· ${(event.ms / 1000).toFixed(1)}s · tokens ${event.tokens.input}/${event.tokens.output} · 工具 ${event.toolCalls} 次`,
          )}\n`,
        )
        break
      }
    }
  }

  return {
    handle,
    /** 直接挂到 EventBus 上 */
    subscribe(bus: { on: (fn: (e: AgentEvent) => void) => () => void }) {
      return bus.on(handle)
    },
  }
}
