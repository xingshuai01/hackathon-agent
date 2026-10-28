#!/usr/bin/env node
/**
 * scripts/sp-read-paper.mjs —— 「精读模式」决策探针
 *
 * 目的(只回答一个问题):
 *   SciencePal 返回的精读结果里,**有没有页码 / 章节定位**?
 *
 *   有 → knowledge/extract.ts 可直接消费,AtomicNote.locator 几乎白捡
 *   无 → 本地必须自己实现「PDF 文本层 → 页码映射」,A 模块 +1 天
 *
 * 这就是先跑它、而不是先写完 A 代码的理由:它决定 A 的输入契约。
 *
 * 运行:
 *   node scripts/sp-read-paper.mjs --file path/to/paper.pdf
 *   node scripts/sp-read-paper.mjs --file paper.pdf --budget 300000
 *   node scripts/sp-read-paper.mjs --file paper.pdf --dry      # 只看将要发的请求,不花 token
 *
 * 产出 logs/runs/<runId>/:
 *   request.json  stream.ndjson  run.json  manifest.json  reading.md  anchors.json
 *
 * 注意:
 *   - token_budget 必须 ≥250000:平台固定开销实测 2.4–3.1 万,论文正文另计
 *   - 状态 asked = 在等你回答(常见于预算耗尽),不是失败
 *   - 不打印 key;落盘前 authorization 一律替换
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync, appendFileSync, statSync } from 'node:fs'
import { join, dirname, basename, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE_DEFAULT = 'https://sciencepal.ai'

/** 精读模式提示词:强制它吐结构化论断,并要求带定位 —— 这样才能测出它给不给页码 */
const READING_PROMPT = `【精读模式】

请精读附件论文,只做一件事:输出它的原子论断清单。

输出格式(严格 JSON,不要加 markdown 代码块围栏,不要任何解释性前言):

{
  "paperTitle": "论文标题",
  "methodName": "核心方法名",
  "claims": [
    {
      "claim": "一条可独立成立的论断,一句话,必须含主语和量化结果",
      "page": 数字或 null,
      "section": "章节号或小节标题,如 4.2 或 Results,未知填 null",
      "type": "method | result | limitation | assumption",
      "quote": "支撑该论断的原文片段,不超过 40 字"
    }
  ]
}

硬性要求:
1. 8 到 20 条论断,宁少勿滥。每条必须能对应到原文的某一处。
2. page 字段必须是论文里真实的页码(印刷页码或 PDF 页码,标注你用的是哪一种)。
3. 如果无法确定页码,page 填 null,并在末尾 extra 字段里写 "pageUnavailable": true。
4. 不要写综述式开头,不要评价论文好坏,不要复述摘要。
5. 最后附加一个字段 "software": ["论文提到的软件/库及版本"],没有则空数组。`

function loadEnv() {
  const envPath = join(ROOT, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    const [, k, raw] = m
    if (process.env[k] === undefined) process.env[k] = raw.replace(/^['"]|['"]$/g, '').trim()
  }
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const hasFlag = (name) => process.argv.includes(`--${name}`)

const mask = (s) => (s ? `${s.slice(0, 7)}****${s.slice(-4)}` : '<empty>')
const redact = (t) => (t ? String(t).replace(/sp_live_[A-Za-z0-9]+/g, '<redacted-key>') : t)

const parseJsonField = (v) => {
  if (typeof v !== 'string') return v ?? null
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

/** 锚点检测:这是本脚本的核心产出 —— 决定 A 模块能不能直接吃它的输出 */
function detectAnchors(text) {
  const patterns = {
    page_dot: /\bp\.?\s?\d{1,3}\b/gi, // p.7  p 7
    page_word: /\bpage\s+\d{1,3}\b/gi, // page 7
    page_cn: /第\s?\d{1,3}\s?页/g,
    section: /§\s?\d+(?:\.\d+)*/g, // §4.2
    section_word: /\b(?:section|sec\.)\s*\d+(?:\.\d+)*/gi,
    section_cn: /第\s?\d+(?:\.\d+)*\s?[章节]/g,
  }
  const found = {}
  for (const [k, re] of Object.entries(patterns)) {
    const m = text.match(re)
    if (m) found[k] = [...new Set(m)].slice(0, 8)
  }
  const jsonPage =
    /"page"\s*:\s*\d+/.test(text) ? 'page 字段有数字值(unverified 之外)' : null
  return { found, jsonPage, hasPage: Boolean(found.page_dot || found.page_word || found.page_cn || jsonPage), hasSection: Boolean(found.section || found.section_word || found.section_cn) }
}

async function main() {
  loadEnv()
  const BASE = (process.env.SCIENCEPAL_BASE_URL || BASE_DEFAULT).replace(/\/+$/, '').replace(/\/api$/, '')
  const KEY = process.env.SCIENCEPAL_API_KEY || ''
  const AGENT_ID = arg('agent', process.env.SCIENCEPAL_AGENT_ID || '')
  const MODEL = arg('model', process.env.SCIENCEPAL_MODEL_ID || 'platform::deepseek-v4-pro')
  const BUDGET = arg('budget', '300000')
  const FILE = arg('file', '')
  const DRY = hasFlag('dry')

  if (!FILE) {
    console.error('用法: node scripts/sp-read-paper.mjs --file <paper.pdf> [--budget 300000] [--dry]')
    process.exit(1)
  }
  const abs = resolve(FILE)
  if (!existsSync(abs)) {
    console.error(`找不到文件: ${abs}`)
    process.exit(1)
  }
  const sizeMB = statSync(abs).size / 1048576
  const buf = readFileSync(abs)
  const sha256 = createHash('sha256').update(buf).digest('hex')

  console.log(`精读探针\n  file  : ${basename(abs)} (${sizeMB.toFixed(2)} MB)\n  sha256: ${sha256.slice(0, 16)}…\n  agent : ${AGENT_ID || '<未设置>'}\n  model : ${MODEL}\n  budget: ${BUDGET}`)
  if (sizeMB > 30) {
    console.error(`\n⚠️ 文件 ${sizeMB.toFixed(1)}MB 偏大,上传可能超时或被拒。建议先裁到前 20 页。`)
  }

  if (DRY) {
    console.log('\n[dry] 不会发请求。将发送 multipart:')
    console.log(`  agent_id=${AGENT_ID} model_name=${MODEL} token_budget=${BUDGET} stream=true`)
    console.log(`  files=@${basename(abs)}`)
    console.log(`  prompt=${READING_PROMPT.slice(0, 80)}…`)
    process.exit(0)
  }

  if (!KEY) {
    console.error('缺少 SCIENCEPAL_API_KEY,先跑 node scripts/sp-probe.mjs')
    process.exit(1)
  }
  if (!AGENT_ID) {
    console.error('缺少 agent id —— 先跑 sp-probe.mjs 看可用 Agent,或 --agent <id>')
    process.exit(1)
  }

  const headers = { Authorization: `Bearer ${KEY}` }

  // ── 1. initiate (multipart,带 PDF) ─────────────────────────────
  const form = new FormData()
  form.set('agent_id', AGENT_ID)
  form.set('prompt', READING_PROMPT)
  form.set('stream', 'true')
  form.set('agent_select_type', 'manual')
  form.set('model_name', MODEL)
  form.set('token_budget', BUDGET)
  form.set('web_search_on', 'false')
  form.set(
    'files',
    new Blob([buf], { type: 'application/pdf' }),
    basename(abs),
  )

  const t0 = Date.now()
  const initRes = await fetch(`${BASE}/api/agent/initiate`, {
    method: 'POST',
    headers,
    body: form,
    signal: AbortSignal.timeout(300000),
  })
  const initText = await initRes.text()
  let init
  try {
    init = JSON.parse(initText)
  } catch {
    init = { raw: initText.slice(0, 800) }
  }
  if (initRes.status !== 200) {
    console.error(`initiate 失败 ${initRes.status}: ${redact(JSON.stringify(init)).slice(0, 600)}`)
    process.exit(2)
  }

  const threadId = init.thread_id
  const runId = init.agent_run_id
  console.log(`  thread_id: ${threadId}\n  run_id   : ${runId}`)
  if (!runId) {
    console.error('\n没有 agent_run_id,原始返回:')
    console.error(JSON.stringify(init, null, 2).slice(0, 1200))
    process.exit(3)
  }

  const outDir = join(ROOT, 'logs', 'runs', String(runId))
  mkdirSync(outDir, { recursive: true })
  writeFileSync(
    join(outDir, 'request.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        initiate: { status: initRes.status, ms: Date.now() - t0, body: init },
        params: { agentId: AGENT_ID, model: MODEL, budget: BUDGET, promptMode: 'reading' },
        file: { name: basename(abs), bytes: buf.length, sha256 },
        headers: { authorization: '<redacted>' },
        keyMasked: mask(KEY),
      },
      null,
      2,
    ),
  )

  // ── 2. 收流 ───────────────────────────────────────────────────
  console.log('\n收流中…')
  const streamRes = await fetch(`${BASE}/api/agent-run/${runId}/stream`, {
    headers: { ...headers, Accept: 'text/event-stream' },
    signal: AbortSignal.timeout(900000),
  })
  if (!streamRes.ok || !streamRes.body) {
    console.error(`stream 失败 ${streamRes.status}`)
    process.exit(4)
  }

  const ndjson = join(outDir, 'stream.ndjson')
  writeFileSync(ndjson, '')
  const decoder = new TextDecoder()
  let buffer = ''
  let seq = 0
  let done = false

  for await (const chunk of streamRes.body) {
    buffer += decoder.decode(chunk, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.trimEnd()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') {
        done = true
        break
      }
      seq += 1
      let parsed
      try {
        parsed = JSON.parse(payload)
      } catch {
        parsed = { raw: payload }
      }
      appendFileSync(ndjson, `${JSON.stringify({ seq, receivedAt: Date.now() - t0, event: parsed })}\n`)
      const kind = parsed.type ?? parsed.event ?? ''
      if (kind) process.stdout.write(`  #${seq} ${kind}\n`)
    }
    if (done) break
  }
  const streamMs = Date.now() - t0

  // ── 3. 轮询到终态(流关闭 ≠ 任务结束)───────────────────────
  const TERMINAL = new Set(['completed', 'failed', 'stopped', 'asked', 'cancelled', 'error'])
  let status = {}
  for (let i = 0; i < 90; i += 1) {
    const r = await fetch(`${BASE}/api/agent-run/${runId}`, { headers, signal: AbortSignal.timeout(30000) })
    status = await r.json().catch(() => ({}))
    if (TERMINAL.has(String(status.status))) break
    await new Promise((res) => setTimeout(res, 2000))
  }

  // ── 4. 取最终文本 + 用量 ─────────────────────────────────────
  const events = readFileSync(ndjson, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l).event)

  let finalText = ''
  let usage = null
  for (const e of events) {
    if (e?.type === 'assistant') {
      const c = parseJsonField(e.content)
      const m = parseJsonField(e.metadata)
      if (c?.content && m?.stream_status === 'complete') finalText = c.content
    }
    if (e?.type === 'assistant_response_end') {
      const c = parseJsonField(e.content)
      if (c?.usage) usage = c.usage
    }
  }

  // ── 5. 锚点判定(本脚本存在的理由)──────────────────────────
  const anchors = detectAnchors(finalText)
  writeFileSync(join(outDir, 'reading.md'), finalText || '<empty>')
  writeFileSync(join(outDir, 'anchors.json'), JSON.stringify({ ...anchors, verdict: anchors.hasPage ? 'HAS_PAGE_ANCHOR' : 'NO_PAGE_ANCHOR' }, null, 2))

  writeFileSync(join(outDir, 'run.json'), JSON.stringify(status, null, 2))
  writeFileSync(
    join(outDir, 'manifest.json'),
    JSON.stringify(
      {
        runId,
        threadId,
        threadUrl: `${BASE}/projects/-/thread/${threadId}`,
        startedAt: new Date(t0).toISOString(),
        durationMs: streamMs,
        events: seq,
        terminatedByDone: done,
        status: status.status ?? null,
        error: status.error ?? null,
        agentId: AGENT_ID,
        model: MODEL,
        inputSha256: { file: sha256, prompt: createHash('sha256').update(READING_PROMPT).digest('hex') },
        outputSha256: { reading: createHash('sha256').update(finalText || '').digest('hex') },
        anchorVerdict: anchors.hasPage ? 'HAS_PAGE_ANCHOR' : 'NO_PAGE_ANCHOR',
        evidence: ['request.json', 'stream.ndjson', 'run.json', 'reading.md', 'anchors.json'],
      },
      null,
      2,
    ),
  )

  // ── 6. 报告 ──────────────────────────────────────────────────
  console.log(`\n=== 结果 ===`)
  console.log(`  状态    : ${status.status ?? '未知'}`)
  console.log(`  事件数  : ${seq}`)
  console.log(`  耗时    : ${(streamMs / 1000).toFixed(1)}s`)
  if (usage) console.log(`  token   : 总 ${usage.total_tokens}  入 ${usage.prompt_tokens}  出 ${usage.completion_tokens}  缓存 ${usage.cached_input_tokens ?? 0}`)
  if (status.error) console.log(`  错误    : ${redact(JSON.stringify(status.error))}`)

  console.log(`\n=== 锚点判定(决定 A 模块怎么写)===
  页码 : ${anchors.hasPage ? '✅ 有' : '❌ 无'}
  章节 : ${anchors.hasSection ? '✅ 有' : '❌ 无'}
  命中 : ${JSON.stringify(anchors.found)}`)
  if (anchors.hasPage) {
    console.log('\n  → A 模块: extract.ts 可直接消费,locator 近乎白捡。')
  } else {
    console.log('\n  → A 模块: 必须本地补「PDF 文本层 → 页码映射」,预算 +1 天;')
    console.log('     或退化为「按章节锚定 + 引用原文片段」,答辩时如实说明。')
  }

  if (finalText) console.log(`\n--- 精读输出(前 800 字)---\n${finalText.slice(0, 800)}${finalText.length > 800 ? '\n…' : ''}`)
  if (status.status === 'asked') {
    console.log('\n⚠️ asked:在等你回答(常见于 token_budget 耗尽),不是失败。')
    console.log('   加大 --budget 重跑,或 POST /api/thread/{id}/messages 续跑。')
  }
  console.log(`\n证据目录: logs/runs/${runId}/`)

  process.exit(status.status === 'failed' || status.status === 'stopped' ? 5 : 0)
}

main().catch((e) => {
  console.error('未捕获异常:', redact(e?.message ?? String(e)))
  process.exit(9)
})
