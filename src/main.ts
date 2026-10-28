#!/usr/bin/env node
/**
 * CLI 入口。四个子命令(AC-12.1~12.4):
 *
 *   node src/main.ts ask "<任务>"      运行 Agent(消费方向)
 *   node src/main.ts ingest <路径>     沉淀:论文 → 知识页 → knowledge/(模块 A)
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
import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { loadDotEnv } from './config/env.ts'
import { bus, type AgentEvent } from './ui/events.ts'
import { createCliRenderer } from './ui/renderCli.ts'
import { createToolRegistry, probeInput, type ToolRegistry } from './agent/registry.ts'
import { runLoop } from './agent/loop.ts'
import { LOOP_DEFAULTS, type LoopEndReason, type LoopOptions, type RunTrace } from './agent/types.ts'
import { buildSystemPrompt, DEFAULT_ROLE } from './agent/prompt.ts'
import { createFakeLlm, demoScript } from './agent/fakeLlm.ts'
import { infraTools } from './tools/infra.ts'
import { generatedTools } from './tools/generated/registry.generated.ts'
import { createSciencePalTool, sciencePalConfigFromEnv } from './tools/sciencepal.ts'
import { createDeepSeekClient, configFromEnv } from './services/llm/deepseek.ts'
import { LlmFatalError, errorMessage, type LlmClient } from './services/llm/types.ts'
import { createTraceWriter } from './services/trace/writer.ts'
import { createFixtureCache } from './services/cache/fixtures.ts'
import { parsePdfFile } from './services/paper/parse.ts'
import { ingestPaper } from './services/knowledge/ingest.ts'
import { writeIndexFile } from './services/knowledge/indexFile.ts'
import { LocalMarkdownStore } from './services/knowledge/localMarkdown.ts'
import { createKnowledgeSearchTool } from './services/knowledge/tool.ts'
import { createSkillStore } from './services/skills/store.ts'
import { generateSkillDraft } from './services/skills/generate.ts'
import { renderSkillForPrompt } from './services/skills/inject.ts'
import {
  DRAFT_DIR_NAME,
  listDrafts,
  promoteDraft,
  readDraft,
  writeSkillDraft,
} from './services/skills/draft.ts'
import { validateSkillStructure } from './services/skills/types.ts'
import type { PaperDoc } from './services/paper/types.ts'
import type { AtomicNote } from './services/knowledge/types.ts'
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
  readonly force: boolean
  readonly indexOnly: boolean
  /** ingest 时跳过技能草案生成(默认会生成,写进 skills/_drafts/) */
  readonly noSkillDraft: boolean
  readonly maxTurns: number | undefined
}

const USAGE = `
hackathon-agent · 科研领域 Agent(知识库 / 工具库 / 技能库)

用法:
  node src/main.ts ask "<任务>"       运行 Agent
  node src/main.ts ingest <文件|目录>  沉淀:PDF → 知识页 → knowledge/ + 技能草案
  node src/main.ts skills list        列出技能与待审草案
  node src/main.ts skills check <id>  检查技能是否满足七节要求
  node src/main.ts skills promote <id> 草案通过校验后晋升为正式技能
  node src/main.ts tools doctor       工具体检
  node src/main.ts web                启动 Web 界面               [未实现,见 #31]

flags:
  --fake            用剧本化假 LLM,不花 API 额度(无 key 时也能跑)
  --replay          从 fixtures 回放,零网络请求
  --record          live 模式下把响应录进 fixtures
  --force           ingest 时覆盖已入库的论文(默认跳过)
  --index-only      只重建 knowledge/INDEX.md,不重新解析论文
  --no-skill-draft  ingest 时不生成技能草案(默认写入 skills/_drafts/)
  --max-turns N     轮次上限(默认 ${LOOP_DEFAULTS.maxTurns})
  -v, --verbose     失败时打印更多信息
  -h, --help        显示本帮助

环境变量(写在 .env):
  DEEPSEEK_API_KEY    必填,https://platform.deepseek.com/api_keys
  SCIENCEPAL_API_KEY  可选,填了才会注册 sciencepal_query 工具
  KNOWLEDGE_DIR       可选,知识库根目录(默认 knowledge)
  SKILLS_DIR          可选,技能库根目录(默认 skills)
`.trim()

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = []
  let fake = false
  let replay = false
  let record = false
  let verbose = false
  let force = false
  let indexOnly = false
  let noSkillDraft = false
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
      case '--force':
        force = true
        break
      case '--index-only':
        indexOnly = true
        break
      case '--no-skill-draft':
        noSkillDraft = true
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
    force,
    indexOnly,
    noSkillDraft,
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

/** 知识库根目录。默认相对 cwd,便于 `npm run ingest` 直接落在仓库里 */
function knowledgeRoot(): string {
  return process.env['KNOWLEDGE_DIR'] ?? 'knowledge'
}

/** 技能库根目录。草案放它下面的 `_drafts/`,没有 SKILL.md 所以不会被当成技能 */
function skillsRoot(): string {
  return process.env['SKILLS_DIR'] ?? 'skills'
}

function skillDraftsRoot(): string {
  return join(skillsRoot(), DRAFT_DIR_NAME)
}

function buildRegistry(
  options: { readonly store?: LocalMarkdownStore; readonly refineLlm?: LlmClient } = {},
): RegistryBuild {
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

  // 模块 A:知识库检索(AC-A3.2)
  // 传 refineLlm 才会启用「LLM 精筛」那一段;replay / fake 下只做关键词粗筛,零网络请求
  const store = options.store ?? new LocalMarkdownStore({ root: knowledgeRoot() })
  registry.register(
    createKnowledgeSearchTool({
      store,
      // 命中上报给事件总线:三面板的「知识库」面板靠它高亮本篇引用了哪几页。
      // 用工厂注入而不是给 ToolContext 加 emit —— 冻结契约零改动。
      events: bus,
      ...(options.refineLlm === undefined ? {} : { llm: options.refineLlm }),
    }),
  )
  notes.push(
    `已注册 knowledge_search(root=${store.rootDir},精筛=${options.refineLlm === undefined ? 'off' : 'on'})`,
  )

  // 模块 B:生成工具。**B 只改 registry.generated.ts,不用动本文件** ——
  // 这条约定是为了避免两人同时改 main.ts。
  for (const tool of generatedTools) registry.register(tool)
  if (generatedTools.length > 0) {
    notes.push(`已注册 ${String(generatedTools.length)} 个生成工具(B 模块)`)
  }

  // 技能库(模块 C)不注册工具,而是通过 prompt 注入清单,见 cmdAsk。

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

  // replay 与 fake 下都不走 LLM 精筛:前者禁止联网,后者没有真实模型
  const refineLlm = args.fake || args.replay ? undefined : llm
  const knowledgeStore = new LocalMarkdownStore({ root: knowledgeRoot() })
  const { registry, notes } = buildRegistry(
    refineLlm === undefined ? { store: knowledgeStore } : { store: knowledgeStore, refineLlm },
  )
  for (const note of notes) console.log(`· ${note}`)
  console.log(`· 可用工具:${registry.names().join(', ') || '(无)'}\n`)

  // 渲染器要在 Agent 动起来之前挂上:技能匹配会立刻发 skill_load 事件,
  // 订阅晚一步这条事件就白发(用户看不到「为什么加载了这个技能」)
  const renderer = createCliRenderer({ verboseTools: args.verbose })
  const unsubscribe = renderer.subscribe(bus)

  // 知识索引注入 prompt(只注入索引,正文交给 knowledge_search 按需取)
  // 库是空的时候不注入 —— 否则提示词里多出一段「(空)」,纯噪声
  const knowledgeIndex =
    (await knowledgeStore.listPaperIds()).length > 0 ? await knowledgeStore.index() : undefined

  // 技能库:清单常驻上下文(只有元数据,便宜);正文只在命中后才注入(贵)
  const skillStore = createSkillStore(skillsRoot(), { events: bus })
  const skillManifest = await skillStore.manifest()
  const matchedSkill = await skillStore.match(task)
  if (matchedSkill !== null) {
    console.log(`· 命中技能「${matchedSkill.name}」(${matchedSkill.skillId}),正文已注入`)
  } else if (skillManifest.trim() !== '') {
    console.log(`· 技能清单已注入(${String(skillManifest.split('\n').length)} 项),本次任务未命中`)
  }

  // 追踪与缓存
  const trace = createTraceWriter({ runId })
  const cache = createFixtureCache({ record: args.record })
  const toolContext: Omit<ToolContext, 'signal'> = {
    mode,
    trace,
    cache,
    // 工具的进度上报以前**没有接线**:onProgress 一直是 undefined,
    // 任何工具调用它都是静默丢弃。三面板的「阶段性进度」就靠这条,
    // 不接上,B 的精读/沙箱这类长任务在 UI 上会是一段黑屏。
    onProgress: (progress) => bus.emit({ type: 'progress', ...progress }),
  }

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
      ...(knowledgeIndex === undefined ? {} : { knowledgeIndex }),
      ...(skillManifest.trim() === '' ? {} : { skillManifest }),
      ...(matchedSkill === null ? {} : { skillBody: renderSkillForPrompt(matchedSkill) }),
      availableTools: registry.names(),
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

// ─────────────────────────────────────────────────────────────
// ingest:论文 → 知识库
// ─────────────────────────────────────────────────────────────

/** 单文件或目录。目录只收 `.pdf`,按文件名排序保证可复现 */
async function collectPdfFiles(target: string): Promise<string[]> {
  const info = await stat(target)
  if (info.isFile()) return [target]
  if (!info.isDirectory()) return []

  const entries = await readdir(target, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
    .map((entry) => join(target, entry.name))
    .sort()
}

/** 技能 id 只能含文件系统安全的字符;`arxiv:2210.03629` 里的冒号在 Windows 上非法 */
function sanitizeSkillId(paperId: string): string {
  return paperId
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
}

/**
 * 一篇论文的知识页 → 一份技能草案。
 *
 * **诚实说明**:单篇论文能抽出的是「这个工作怎么做」,不是领域共识。
 * 真正的技能要跨 3 篇以上比对后由人合并 —— 所以产物只能是 `needs_review`,
 * 且必须落在 `skills/_drafts/`(`_drafts` 没有 SKILL.md,不会被当成技能)。
 *
 * 生成器会自己报告缺哪些节,这里原样打印 —— 那些就是人工审核的待办清单。
 */
async function draftSkillFromPaper(
  doc: PaperDoc,
  notes: readonly AtomicNote[],
): Promise<void> {
  if (notes.length === 0) return

  const title = doc.title.trim() === '' ? doc.paperId : doc.title.trim()
  const brief = title.length > 60 ? `${title.slice(0, 59)}…` : title

  const outcome = generateSkillDraft(
    {
      skillId: `paper-${sanitizeSkillId(doc.paperId)}`,
      name: brief,
      domain: '待人工填写',
      description: `从《${brief}》抽取的方法草案(需跨论文比对后合并)`,
      // whenToUse 写具体触发场景:写「用于某领域」这种话,match() 永远命中不了
      whenToUse: `当任务涉及 ${brief} 所描述的方法、指标或结论时使用`,
    },
    notes,
  )

  const file = await writeSkillDraft(skillDraftsRoot(), outcome)
  console.log(`  · 技能草案:${file.path}(待补 ${String(file.warnings.length)} 项)`)
  for (const warning of file.warnings) console.log(`      - ${warning}`)
}

async function cmdIngest(args: Args): Promise<number> {
  const store = new LocalMarkdownStore({ root: knowledgeRoot() })
  const root = store.rootDir

  // 只重建索引:改了 notes.md 之后不必重新解析 PDF
  if (args.indexOnly) {
    const stats = await writeIndexFile(store, { root })
    console.log(`索引已重建:${stats.path}(${stats.lines} 行 / ${stats.bytes} 字节)`)
    console.log(`已入库论文 ${(await store.listPaperIds()).length} 篇`)
    return 0
  }

  const target = args.positional[0]
  if (target === undefined) {
    console.error('缺少论文路径。用法:node src/main.ts ingest <文件.pdf|目录>')
    return 2
  }

  let files: string[]
  try {
    files = await collectPdfFiles(target)
  } catch (error: unknown) {
    console.error(`路径不可读:${target}(${errorMessage(error)})`)
    return 2
  }
  if (files.length === 0) {
    console.error(`目录里没有 .pdf 文件:${target}`)
    return 1
  }

  console.log(`知识库根目录:${root}`)
  console.log(`待处理 ${files.length} 篇${args.force ? '(强制重建)' : ''}\n`)

  const tally = { stored: 0, skipped: 0, quarantined: 0, empty: 0, failed: 0 }
  let notesTotal = 0

  for (const file of files) {
    console.log(`── ${basename(file)} ──`)

    let parsed
    try {
      parsed = await parsePdfFile(file)
    } catch (error: unknown) {
      console.error(`  ✗ 解析失败:${errorMessage(error)}`)
      tally.failed += 1
      continue
    }

    const result = await ingestPaper(
      store,
      { doc: parsed.doc, pageLines: parsed.pageLines },
      { force: args.force, log: (line) => console.log(`  ${line}`) },
    )

    switch (result.status) {
      case 'stored':
        tally.stored += 1
        notesTotal += result.notes.length
        if (!args.noSkillDraft) await draftSkillFromPaper(parsed.doc, result.notes)
        break
      case 'skipped':
        tally.skipped += 1
        break
      case 'quarantined':
        tally.quarantined += 1
        break
      case 'empty':
        tally.empty += 1
        break
    }
  }

  // 索引在所有论文处理完之后统一重建,避免每篇都重写一次
  const index = await writeIndexFile(store, { root })

  console.log(`\n索引:${index.path}(${index.lines} 行 / ${index.bytes} 字节)`)
  console.log(
    `汇总:新入库 ${tally.stored} 篇(${notesTotal} 条) · 跳过 ${tally.skipped} · ` +
      `隔离 ${tally.quarantined} · 空结果 ${tally.empty} · 失败 ${tally.failed}`,
  )

  return tally.failed > 0 ? 1 : 0
}

/**
 * 技能库运维:`list` 看现状、`check` 查七节、`promote` 晋升草案。
 *
 * 为什么晋升要单独一个命令:草案是机器写的,`save()` 会硬拦不合格的技能。
 * 把「还差什么」讲清楚,比放宽校验有用得多 —— 判据与失败模式是这个模块的全部价值,
 * 放宽了技能就退化成综述。
 */
async function cmdSkills(args: Args): Promise<number> {
  const sub = args.positional[0] ?? 'list'
  const store = createSkillStore(skillsRoot(), {
    logger: (line) => {
      if (args.verbose) console.log(`  ${line}`)
    },
  })
  const draftsDir = skillDraftsRoot()

  if (sub === 'list') {
    const items = await store.list()
    console.log(`技能库:${skillsRoot()}(正式 ${String(items.length)} 个)`)
    for (const item of items) {
      console.log(`  · ${item.skillId}  ${item.description}`)
    }

    const drafts = await listDrafts(draftsDir)
    console.log(`\n待审草案:${draftsDir}(共 ${String(drafts.length)} 份)`)
    for (const id of drafts) {
      const skill = await readDraft(draftsDir, id)
      const state =
        skill === null
          ? '解析失败'
          : validateSkillStructure(skill).ok
            ? '可晋升'
            : `缺内容(${String(validateSkillStructure(skill).missing.length + validateSkillStructure(skill).problems.length)} 项)`
      console.log(`  · ${id}  [${state}]`)
    }

    if (items.length === 0 && drafts.length === 0) {
      console.log('\n两边都是空的。先跑 `ingest <pdf>` 生成草案,或手写 skills/<id>/SKILL.md。')
    }
    return 0
  }

  if (sub === 'check') {
    const skillId = args.positional[1]
    if (skillId === undefined) {
      console.error('缺少技能 id。用法:node src/main.ts skills check <skillId|草案id>')
      return 2
    }

    // 先当正式技能找,找不到再看草案 —— 两个地方都可能有人问"这个能用吗"
    const official = await store.load(skillId)
    const skill = official ?? (await readDraft(draftsDir, skillId))
    if (skill === null) {
      console.error(`找不到技能或草案:${skillId}`)
      return 2
    }

    const validation = validateSkillStructure(skill)
    console.log(`技能:${skill.name}(${skill.skillId})`)
    console.log(`状态:${skill.status}  来源:${official === null ? '草案' : '技能库'}`)
    if (validation.ok) {
      console.log('校验:通过(七节齐全、失败模式 ≥3、每阶段有判据)')
      return 0
    }

    console.log('校验:不通过')
    for (const key of validation.missing) console.log(`  ✗ 整节为空:${key}`)
    for (const problem of validation.problems) console.log(`  ✗ ${problem}`)
    return 1
  }

  if (sub === 'promote') {
    const skillId = args.positional[1]
    if (skillId === undefined) {
      console.error('缺少草案 id。用法:node src/main.ts skills promote <草案id>')
      return 2
    }

    const result = await promoteDraft(store, draftsDir, skillId)
    switch (result.status) {
      case 'saved':
        console.log(`已晋升:${skillsRoot()}/${skillId}/SKILL.md`)
        console.log('注意:状态仍是 needs_review —— 改 status=active 之前必须填 reviewedBy。')
        return 0
      case 'missing':
        console.error(`草案不存在:${draftsDir}/${skillId}.md`)
        return 2
      case 'invalid':
        console.error(`校验不通过,拒绝写入(这不算失败,是模块在防「技能退化成综述」):`)
        for (const problem of result.problems) console.error(`  ✗ ${problem}`)
        return 1
    }
  }

  console.error(`未知子命令:${sub}。可用:list / check / promote`)
  return 2
}

/**
 * 能力位探测。`true/false` 是结论,`null` 表示「取决于入参,当前探不出来」。
 *
 * 之前这里写的是 `tool.isReadOnly?.(undefined as never)`,对有必填参数的工具
 * 会直接抛错 —— B 生成的工具几乎都有参数,所以必须走 probeInput。
 */
function probeFlag(
  fn: ((input: never) => boolean) | undefined,
  input: unknown,
): boolean | null {
  if (fn === undefined) return false // fail-closed 默认:没写就当作可写 / 不可并发
  try {
    return fn(input as never)
  } catch {
    return null
  }
}

function formatFlag(value: boolean | null): string {
  if (value === null) return '?(取决于入参)'
  return value ? '是' : '否'
}

async function cmdToolsDoctor(args: Args): Promise<number> {
  const { registry, notes } = buildRegistry()
  for (const note of notes) console.log(`· ${note}`)

  const tools = registry.list()
  console.log(`\n工具总数 ${tools.length}\n`)

  let ok = 0
  for (const tool of tools) {
    const probe = probeInput(tool)
    console.log(`  ${tool.name}`)
    console.log(
      `    只读=${formatFlag(probeFlag(tool.isReadOnly, probe))}  ` +
        `可并发=${formatFlag(probeFlag(tool.isConcurrencySafe, probe))}  ` +
        `破坏性=${formatFlag(probeFlag(tool.isDestructive, probe))}`,
    )
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
    case 'skills':
      return cmdSkills(args)
    case 'tools':
      return args.positional[0] === 'doctor' ? cmdToolsDoctor(args) : cmdNotImplemented('tools', 'Issue #30')
    case 'ingest':
      return cmdIngest(args)
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
