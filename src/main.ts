#!/usr/bin/env node
/**
 * CLI 入口。四个子命令(AC-12.1~12.4):
 *
 *   node src/main.ts ask "<任务>"      运行 Agent(消费方向)
 *   node src/main.ts ingest <路径>     沉淀:论文 → 知识/工具/技能(尚未实现)
 *   node src/main.ts tools doctor      工具体检
 *   node src/main.ts web               启动 Web 界面(尚未实现)
 *
 * 全局 flag:
 *   --fake          使用剧本化假 LLM,不花 API 额度(没有 key 时也能看骨架跑)
 *   --replay        从 fixtures 回放,零网络请求
 *   --record        把外部响应录进 fixtures(配合 live)
 *   --max-turns N   覆盖轮次上限
 *   -v, --verbose   工具失败时打印更多信息
 *
 * 退出码:0 成功 / 1 失败 / 2 配置错误
 */

import { randomUUID } from 'node:crypto'
import { loadDotEnv } from './config/env.ts'
import { bus, type AgentEvent } from './ui/events.ts'
import { createCliRenderer } from './ui/renderCli.ts'
import { createToolRegistry, type ToolRegistry } from './agent/registry.ts'
import { runLoop } from './agent/loop.ts'
import { LOOP_DEFAULTS, type LoopEndReason, type LoopOptions, type RunTrace } from './agent/types.ts'
import { buildSystemPrompt, DEFAULT_ROLE } from './agent/prompt.ts'
import { createFakeLlm, demoScript } from './agent/fakeLlm.ts'
import { infraTools } from './tools/infra.ts'
import { createSciencePalTool, sciencePalConfigFromEnv } from './tools/sciencepal.ts'
import { createDeepSeekClient, configFromEnv } from './services/llm/deepseek.ts'
import { LlmFatalError, errorMessage, type LlmClient } from './services/llm/types.ts'
import { createTraceWriter } from './services/trace/writer.ts'
import { createFixtureCache } from './services/cache/fixtures.ts'
import type { ToolContext } from './tools/types.ts'

// ─────────────────────────────────────────────────────────────
// 参数解析
// ─────────────────────────────────────────────────────────────

interface Args {
  readonly command: string
  readonly positional: readonly string[]
  readonly fake: boolean
  readonly replay: boolean
  readonly record: boolean
  readonly verbose: boolean
  readonly maxTurns: number | undefined
}

const USAGE = `
hackathon-agent · 科研领域 Agent(知识库 / 工具库 / 技能库)

用法:
  node src/main.ts ask "<任务>"       运行 Agent
  node src/main.ts ingest <论文路径>   沉淀:论文 → 知识/工具/技能   [未实现,见 #36]
  node src/main.ts tools doctor       工具体检
  node src/main.ts web                启动 Web 界面               [未实现,见 #31]

flags:
  --fake            用剧本化假 LLM,不花 API 额度(无 key 时也能跑)
  --replay          从 fixtures 回放,零网络请求
  --record          live 模式下把响应录进 fixtures
  --max-turns N     轮次上限(默认 ${LOOP_DEFAULTS.maxTurns})
  -v, --verbose     失败时打印更多信息
  -h, --help        显示本帮助

环境变量(写在 .env):
  DEEPSEEK_API_KEY    必填,https://platform.deepseek.com/api_keys
  SCIENCEPAL_API_KEY  可选,填了才会注册 sciencepal_query 工具
`.trim()

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = []
  let fake = false
  let replay = false
  let record = false
  let verbose = false
  let maxTurns: number | undefined

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? ''
    switch (arg) {
      case '--fake':
        fake = true
        break
      case '--replay':
        replay = true
        break
      case '--record':
        record = true
        break
      case '-v':
      case '--verbose':
        verbose = true
        break
      case '--max-turns': {
        const next = argv[i + 1]
        if (next === undefined) throw new LlmFatalError('--max-turns 需要一个数字')
        maxTurns = Number(next)
        i += 1
        break
      }
      default:
        if (!arg.startsWith('-')) positional.push(arg)
    }
  }

  return {
    command: positional[0] ?? 'help',
    positional: positional.slice(1),
    fake,
    replay,
    record,
    verbose,
    maxTurns,
  }
}

// ─────────────────────────────────────────────────────────────
// 工具注册
// ─────────────────────────────────────────────────────────────

interface RegistryBuild {
  readonly registry: ToolRegistry
  readonly registered: readonly string[]
  readonly notes: readonly string[]
}

function buildRegistry(): RegistryBuild {
  const registry = createToolRegistry()
  const notes: string[] = []

  for (const tool of infraTools) registry.register(tool)

  const spConfig = sciencePalConfigFromEnv()
  if (spConfig === null) {
    notes.push('未配置 SCIENCEPAL_API_KEY,sciencepal_query 工具未注册')
  } else {
    registry.register(createSciencePalTool(spConfig))
    notes.push(`已注册 sciencepal_query(agent=${spConfig.agentId})`)
  }

  // 三位同学的模块在这里接入(留好位置,不要在别处硬编码):
  //   registry.register(...knowledge tools from 同学1)
  //   registry.register(...generated tools from 同学2)
  // 技能库(同学3)不注册工具,而是通过 prompt 注入清单。

  return { registry, registered: registry.names(), notes }
}

// ─────────────────────────────────────────────────────────────
// 子命令
// ─────────────────────────────────────────────────────────────

async function cmdAsk(args: Args): Promise<number> {
  const task = args.positional.join(' ').trim()
  if (task === '') {
    console.error('缺少任务。用法:node src/main.ts ask "<任务>"')
    return 2
  }

  const runId = randomUUID()
  const mode = args.replay ? 'replay' : 'live'

  // LLM
  let llm: LlmClient
  if (args.fake) {
    llm = createFakeLlm(demoScript())
    console.log('提示:--fake 模式,使用剧本化假 LLM,不消耗 API 额度\n')
  } else {
    try {
      llm = createDeepSeekClient(configFromEnv())
    } catch (err) {
      console.error(errorMessage(err))
      console.error('\n想先看骨架跑起来?加 --fake:node src/main.ts ask "..." --fake')
      return 2
    }
  }

  const { registry, notes } = buildRegistry()
  for (const note of notes) console.log(`· ${note}`)
  console.log(`· 可用工具:${registry.names().join(', ') || '(无)'}\n`)

  // 追踪与缓存
  const trace = createTraceWriter({ runId })
  const cache = createFixtureCache({ record: args.record })
  const toolContext: Omit<ToolContext, 'signal'> = { mode, trace, cache }

  // 渲染器挂在全局总线上(Web 将来挂在同一个总线上)
  const renderer = createCliRenderer({ verboseTools: args.verbose })
  const unsubscribe = renderer.subscribe(bus)

  const controller = new AbortController()
  const onSigint = (): void => {
    console.log('\n收到中断,正在停止…(再按一次强制退出)')
    controller.abort()
    process.off('SIGINT', onSigint)
    process.on('SIGINT', () => process.exit(130))
  }
  process.on('SIGINT', onSigint)

  const options: LoopOptions = {
    systemPrompt: buildSystemPrompt({
      role: DEFAULT_ROLE,
      notes: [
        `运行模式:${mode}${mode === 'replay' ? '(只能从 fixtures 读,不要联网)' : ''}`,
        '工具失败时如实说明原因,不要假装成功。',
      ],
    }),
    task,
    toolNames: registry.names(),
    maxTurns: args.maxTurns ?? LOOP_DEFAULTS.maxTurns,
    maxTotalTokens: Number(process.env.MAX_TOTAL_TOKENS ?? LOOP_DEFAULTS.maxTotalTokens),
    maxConcurrency: Number(process.env.MAX_CONCURRENCY ?? LOOP_DEFAULTS.maxConcurrency),
    signal: controller.signal,
  }

  const startedAt = Date.now()

  // 统计真实的工具调用次数(run_end 里要报这个数,不能硬编码)
  let toolCallCount = 0
  const emit = (event: AgentEvent): void => {
    if (event.type === 'tool_end') toolCallCount += 1
    bus.emit(event)
  }

  const result = await runLoop(options, { llm, registry, emit, toolContext })

  bus.emit({
    type: 'run_end',
    reason: result.reason,
    ms: Date.now() - startedAt,
    tokens: result.usage,
    toolCalls: toolCallCount,
  })

  unsubscribe()

  // RunTrace 落进真实 trace 文件,供复盘与回放
  const runTrace: RunTrace = {
    runId,
    mode: 'ask',
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date().toISOString(),
    endReason: result.reason,
    turns: result.turns,
    tokens: result.usage,
    toolCalls: [],
    failures: [],
  }
  trace.write({ kind: 'run_trace', ...runTrace })
  trace.close()
  console.log(`\n追踪文件:logs/${runId}.jsonl`)

  return isSuccess(result.reason) ? 0 : 1
}

function isSuccess(reason: LoopEndReason): boolean {
  return reason === 'completed' || reason === 'max_turns'
}

async function cmdToolsDoctor(args: Args): Promise<number> {
  const { registry, notes } = buildRegistry()
  for (const note of notes) console.log(`· ${note}`)

  const tools = registry.list()
  console.log(`\n工具总数 ${tools.length}\n`)

  let ok = 0
  for (const tool of tools) {
    const readonly = tool.isReadOnly?.(undefined as never) ?? false
    const concurrent = tool.isConcurrencySafe?.(undefined as never) ?? false
    console.log(`  ${tool.name}`)
    console.log(`    只读=${readonly ? '是' : '否'}  可并发=${concurrent ? '是' : '否'}`)
    ok += 1
  }

  console.log(`\n已注册 ${ok} 个工具。`)
  console.log('注:smoke test 由 B 模块提供(Issue #30),目前只有注册表体检。')
  return 0
}

async function cmdNotImplemented(name: string, issue: string): Promise<number> {
  console.error(`\`${name}\` 尚未实现(${issue})。`)
  console.error('骨架已就位,等对应模块完成后接进来。')
  return 2
}

// ─────────────────────────────────────────────────────────────
// 入口
// ─────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const env = loadDotEnv()
  if (env.loaded) {
    console.log(`· 已加载 .env(${env.keys.length} 个变量)`)
  } else {
    console.log('· 未找到 .env(可复制 .env.example 后填写)')
  }

  const args = parseArgs(process.argv.slice(2))

  switch (args.command) {
    case 'ask':
      return cmdAsk(args)
    case 'tools':
      return args.positional[0] === 'doctor' ? cmdToolsDoctor(args) : cmdNotImplemented('tools', 'Issue #30')
    case 'ingest':
      return cmdNotImplemented('ingest', 'Issue #36')
    case 'web':
      return cmdNotImplemented('web', 'Issue #31')
    case 'help':
    case '-h':
    case '--help':
      console.log(USAGE)
      return 0
    default:
      console.error(`未知命令:${args.command}\n`)
      console.log(USAGE)
      return 2
  }
}

const code = await main()
process.exit(code)
