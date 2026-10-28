#!/usr/bin/env node
/**
 * scripts/knowledge-probe.ts —— 模块 A 的真实论文验收探针
 *
 * 为什么需要它:
 *   单测用的是合成文本,只能证明逻辑对,不能证明「真 PDF 跑得通」。
 *   这个探针把 parse → extract 全链路跑在真实论文上,输出可对比的指标,
 *   验收时拿数字说话,而不是说「我测过了」。
 *
 * 它检查的具体指标:
 *   · notes 条数是否落在 AC-A1.1 的 5–20 区间
 *   · locateRate(quote 能反查到的比例)—— 低于 70% 说明抽取源不可信
 *   · exactRate(整段命中的比例)—— 低说明文本被重度改写
 *   · 每条是否通过 validateNote()「无锚点不入库」的硬校验
 *   · 加 --store 时还会验证:入库/读回、二次入库被去重、INDEX.md 生成、
 *     检索粗筛 <1s、knowledge_search 返回带完整锚点
 *
 * 用法:
 *   node scripts/knowledge-probe.ts
 *   node scripts/knowledge-probe.ts fixtures/papers/xxx.pdf --json logs/a-probe.json
 *   node scripts/knowledge-probe.ts --min-notes 8
 *   node scripts/knowledge-probe.ts --store logs/a-store --query reasoning
 *
 * 退出码:0 通过 / 5 指标不达标 / 1 用法或文件错误
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { EXTRACT_LIMITS, extractNotes } from '../src/services/knowledge/extract.ts'
import { ingestPaper } from '../src/services/knowledge/ingest.ts'
import { LocalMarkdownStore } from '../src/services/knowledge/localMarkdown.ts'
import { retrieve } from '../src/services/knowledge/select.ts'
import { createKnowledgeSearchTool } from '../src/services/knowledge/tool.ts'
import { validateNote } from '../src/services/knowledge/types.ts'
import { parsePdfFile } from '../src/services/paper/parse.ts'
import { invokeTool } from '../src/tools/types.ts'

function flagValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  return value !== undefined && !value.startsWith('--') ? value : undefined
}

function positionalArgs(): string[] {
  const values = new Set<string>()
  for (const name of ['json', 'min-notes', 'store', 'query']) {
    const value = flagValue(name)
    if (value !== undefined) values.add(value)
  }
  return process.argv.slice(2).filter((arg) => !arg.startsWith('--') && !values.has(arg))
}

function countBy<T extends string>(items: readonly T[]): Record<string, number> {
  const counter = new Map<string, number>()
  for (const item of items) counter.set(item, (counter.get(item) ?? 0) + 1)
  return Object.fromEntries(counter)
}

async function main(): Promise<number> {
  const pdfPath = positionalArgs()[0] ?? 'fixtures/papers/react-2210.03629.pdf'
  if (!existsSync(pdfPath)) {
    console.error(`文件不存在:${pdfPath}`)
    console.error('提示:真实 PDF 不入库(见 .gitignore),需要先从 arXiv 下载。')
    return 1
  }

  const minNotes = Number(flagValue('min-notes') ?? String(EXTRACT_LIMITS.minNotes))
  const started = Date.now()
  console.log(`模块 A 验收探针:${pdfPath}`)

  let parsed
  try {
    parsed = await parsePdfFile(pdfPath)
  } catch (error: unknown) {
    console.error(`\n✗ 解析失败:${error instanceof Error ? error.message : String(error)}`)
    return 1
  }

  const parseMs = Date.now() - started
  const quality = parsed.doc.parseQuality
  console.log(`  PDF 页数     : ${quality.pagesTotal}`)
  console.log(`  解析页数     : ${quality.pagesParsed} (${((quality.pagesParsed / quality.pagesTotal) * 100).toFixed(1)}%)`)
  console.log(`  分页行数     : ${parsed.pageLines.length}`)
  console.log(`  解析耗时     : ${parseMs} ms`)

  const result = extractNotes({ doc: parsed.doc, pageLines: parsed.pageLines })
  const extractMs = Date.now() - started - parseMs

  if (result.status === 'quarantined') {
    console.error(`\n✗ 论文被隔离:${result.reason}(数据铁律 #3,不进抽取队列)`)
    return 5
  }

  const { notes, rejected, stats } = result
  console.log(`  抽取耗时     : ${extractMs} ms`)
  console.log(`  段落数       : ${stats.paragraphs}`)
  console.log(`  候选块       : ${stats.candidates}`)

  // 逐条过一遍硬校验 —— 入库前的最后一道闸
  const invalid = notes.filter((note) => !validateNote(note).ok)

  console.log(`\n  知识页       : ${notes.length} 条`)
  console.log(`  kind 分布    : ${JSON.stringify(countBy(notes.map((note) => note.kind)))}`)
  console.log(`  confidence   : ${JSON.stringify(countBy(notes.map((note) => note.confidence)))}`)
  console.log(`  locateRate   : ${(stats.locateRate * 100).toFixed(1)}%`)
  console.log(`  exactRate    : ${(stats.exactRate * 100).toFixed(1)}%`)
  console.log(`  校验不通过   : ${invalid.length} 条`)

  if (rejected.length > 0) {
    console.log(`  拒绝         : ${JSON.stringify(countBy(rejected.map((item) => item.reason)))}`)
  }

  console.log('\n--- 前 5 条(页码: 描述)---')
  for (const note of notes.slice(0, 5)) {
    console.log(`  p${note.page} [${note.kind}/${note.confidence}] ${note.description.slice(0, 80)}`)
  }

  const jsonOut = flagValue('json')
  if (jsonOut !== undefined) {
    const target = resolve(jsonOut)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(
      target,
      JSON.stringify(
        {
          pdf: resolve(pdfPath),
          paperId: parsed.doc.paperId,
          parseQuality: quality,
          warnings: parsed.warnings,
          stats,
          notes,
          rejected,
        },
        null,
        2,
      ),
    )
    console.log(`\n报告已写入 ${jsonOut}`)
  }

  const problems: string[] = []
  if (invalid.length > 0) problems.push(`${invalid.length} 条知识页未通过 validateNote()`)
  if (notes.length < minNotes) problems.push(`知识页 ${notes.length} 条,低于下限 ${minNotes}(AC-A1.1)`)
  if (notes.length > EXTRACT_LIMITS.maxNotes) {
    problems.push(`知识页 ${notes.length} 条,超过上限 ${EXTRACT_LIMITS.maxNotes}`)
  }
  if (stats.locateRate < 0.7) problems.push(`locateRate ${(stats.locateRate * 100).toFixed(1)}% 低于 70%`)

  // ── 落盘往返:证明「抽出来的东西真的存得住、读得回」(AC-A2) ──
  const storeDir = flagValue('store')
  if (storeDir !== undefined) {
    const store = new LocalMarkdownStore({ root: storeDir })

    const first = await ingestPaper(
      store,
      { doc: parsed.doc, pageLines: parsed.pageLines },
      { indexRoot: storeDir, log: (line) => console.log(`  ${line}`) },
    )

    console.log(`\n--- 入库(--store)---`)
    console.log(`  目录         : ${storeDir}`)
    console.log(`  入库结果     : ${first.status}`)
    if (first.status !== 'stored') problems.push(`首次入库结果为 ${first.status},期望 stored`)

    // 与「入库时真正写下去的那份」比对 —— 不能用上面单独抽取的结果比,
    // 两次抽取的 createdAt 不同,那会把时钟差异误报成落盘不一致
    const storedFirst = first.status === 'stored' ? first.notes[0] : undefined
    const readBack = storedFirst === undefined ? null : await store.get(storedFirst.noteId)
    const sameCount = (await store.listPaperIds()).includes(parsed.doc.paperId)
    console.log(`  读回一致     : ${readBack === null ? '读不到' : JSON.stringify(readBack) === JSON.stringify(storedFirst) ? '是' : '否'}`)
    console.log(`  论文已登记   : ${sameCount ? '是' : '否'}`)

    if (readBack === null) problems.push('落盘后读不回第一条知识页')
    else if (JSON.stringify(readBack) !== JSON.stringify(storedFirst)) {
      problems.push('落盘往返不一致:写进去与读回来的内容不同')
    }
    if (!sameCount) problems.push('listPaperIds() 里找不到该论文')

    // 二次入库必须被去重挡住(AC-A4.2 / AC-A4.3)
    const second = await ingestPaper(store, { doc: parsed.doc, pageLines: parsed.pageLines })
    console.log(`  二次入库     : ${second.status}${second.status === 'skipped' ? `(${second.message})` : ''}`)
    if (second.status !== 'skipped') problems.push('同一论文二次入库没有被跳过')

    // 索引(AC-A2.1 的延伸:INDEX.md 是派生数据,可随时重建)
    const indexPath = join(storeDir, 'INDEX.md')
    console.log(`  INDEX.md     : ${existsSync(indexPath) ? `${readFileSync(indexPath, 'utf8').length} 字符` : '缺失'}`)
    if (!existsSync(indexPath)) problems.push('INDEX.md 没有生成')

    // 检索(AC-A3.1 / AC-A3.3)
    const query = flagValue('query') ?? 'reasoning'
    const retrieved = await retrieve(store, query, { finalLimit: 5 })
    console.log(`  检索 "${query}"${' '.repeat(Math.max(0, 6 - query.length))}: ${retrieved.hits.length} 条 / 粗筛 ${retrieved.coarseMs}ms / stage=${retrieved.stage}`)
    if (retrieved.hits.length === 0) problems.push(`retrieve("${query}") 一条都没命中`)
    if (retrieved.coarseMs >= 1000) problems.push(`粗筛耗时 ${retrieved.coarseMs}ms 超过 AC-A3.3 的 1s`)

    // 工具形态(AC-A3.2):模型拿到的必须带锚点与原句
    const tool = createKnowledgeSearchTool({ store })
    const invoked = await invokeTool(tool, { query, limit: 3 }, {
      signal: new AbortController().signal,
      mode: 'live',
      trace: { write: () => {} },
      cache: { get: async () => null, set: async () => {} },
    })
    if (!invoked.result.ok) {
      problems.push(`knowledge_search 调用失败:${invoked.result.error}`)
    } else {
      const output = invoked.result.data as { hits: readonly { noteId: string; page: number; quote: string }[] }
      const withAnchor = output.hits.filter((item) => item.noteId !== '' && item.page >= 1 && item.quote !== '')
      console.log(`  工具返回     : ${output.hits.length} 条,带完整锚点 ${withAnchor.length} 条 / ${invoked.durationMs}ms`)
      console.log(`  summary      : ${invoked.result.summary.slice(0, 120)}`)
      if (withAnchor.length !== output.hits.length) problems.push('knowledge_search 有命中缺 noteId / page / quote')
    }
  }

  if (problems.length > 0) {
    console.error('\n✗ 未达标:')
    for (const problem of problems) console.error(`  · ${problem}`)
    return 5
  }

  console.log('\n✓ 通过:条数、锚点可信度、硬校验均达标')
  return 0
}

process.exitCode = await main()
