#!/usr/bin/env node
/**
 * scripts/sp-run.mjs —— 发起一次真实 run,收流,落盘证据
 *
 * 依据官方文档 https://sciencepal.ai/help/sdk:
 *   POST /api/agent/initiate           form 字段: agent_id / prompt / stream / agent_select_type
 *   GET  /api/agent-run/{id}/stream    Bearer header 鉴权, SSE 以 data: [DONE] 结束
 *   GET  /api/agent-run/{id}           读 status(failed / stopped / asked / ...)
 *
 * 运行:
 *   node scripts/sp-run.mjs --prompt "用一句话说明你能做什么"
 *   node scripts/sp-run.mjs --agent 10000000-...  --prompt "..." --budget 20000
 *
 * 产出 logs/runs/<runId>/
 *   request.json / stream.ndjson / run.json / manifest.json
 *
 * 注意:
 *   - 状态 asked 表示 Agent 在反问,不是完成。脚本会明确提示,不会自动续跑。
 *   - 不打印 key;落盘前把 authorization 换掉。
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE_DEFAULT = 'https://sciencepal.ai'

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

function mask(secret) {
  return secret ? `${secret.slice(0, 7)}****${secret.slice(-4)}` : '<empty>'
}

function redact(text) {
  if (!text) return text
  return String(text).replace(/sp_live_[A-Za-z0-9]+/g, '<redacted-key>')
}

async function main() {
  loadEnv()
  const BASE = (process.env.SCIENCEPAL_BASE_URL || BASE_DEFAULT).replace(/\/+$/, '').replace(/\/api$/, '')
  const KEY = process.env.SCIENCEPAL_API_KEY || ''
  const AGENT_ID = arg('agent', process.env.SCIENCEPAL_AGENT_ID || '')
  const MODEL = arg('model', process.env.SCIENCEPAL_MODEL_ID || 'platform::deepseek-v4-pro')
  const PROMPT = arg('prompt', '用一句话说明你能帮我做什么。')
  const BUDGET = arg('budget', '20000')

  if (!KEY) {
    console.error('缺少 SCIENCEPAL_API_KEY,先跑 node scripts/sp-probe.mjs')
    process.exit(1)
  }
  if (!AGENT_ID) {
    console.error('缺少 agent id —— 先跑 sp-probe.mjs 看可用 Agent,再传 --agent <id>')
    process.exit(1)
  }

  const headers = { Authorization: `Bearer ${KEY}` }
  console.log(`发起 run\n  agent : ${AGENT_ID}\n  model : ${MODEL}\n  budget: ${BUDGET}\n  prompt: ${PROMPT}\n`)

  // ── 1. initiate(form-urlencoded,与官方 HTTP 示例一致)──────────────
  const form = new URLSearchParams({
    agent_id: AGENT_ID,
    prompt: PROMPT,
    stream: 'true',
    agent_select_type: 'manual',
    model_name: MODEL,
    token_budget: BUDGET,
    web_search_on: 'false',
  })
  const t0 = Date.now()
  const initRes = await fetch(`${BASE}/api/agent/initiate`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(120000),
  })
  const initText = await initRes.text()
  let init
  try {
    init = JSON.parse(initText)
  } catch {
    init = { raw: initText.slice(0, 800) }
  }
  if (initRes.status !== 200) {
    console.error(`initiate 失败 ${initRes.status}: ${JSON.stringify(init).slice(0, 500)}`)
    process.exit(2)
  }

  const threadId = init.thread_id
  const runId = init.agent_run_id
  console.log(`  thread_id: ${threadId}`)
  console.log(`  run_id   : ${runId}`)
  if (!runId) {
    console.error('\n没有返回 agent_run_id —— 可能被权限或额度拦截。原始返回:')
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
        params: { agentId: AGENT_ID, model: MODEL, budget: BUDGET, prompt: PROMPT },
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
    signal: AbortSignal.timeout(600000),
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
      appendFileSync(
        ndjson,
        `${JSON.stringify({ seq, receivedAt: Date.now() - t0, event: parsed })}\n`,
      )
      const kind = parsed.type ?? parsed.event ?? parsed.kind ?? ''
      if (kind) process.stdout.write(`  #${seq} ${kind}\n`)
    }
    if (done) break
  }
  const streamMs = Date.now() - t0

  // ── 3. 读状态(流结束 ≠ 任务结束,必须轮询到终态)─────────────
  const TERMINAL = new Set(['completed', 'failed', 'stopped', 'asked', 'cancelled', 'error'])
  let status = {}
  for (let i = 0; i < 45; i += 1) {
    const statusRes = await fetch(`${BASE}/api/agent-run/${runId}`, {
      headers,
      signal: AbortSignal.timeout(30000),
    })
    status = await statusRes.json().catch(() => ({}))
    if (TERMINAL.has(String(status.status))) break
    await new Promise((r) => setTimeout(r, 2000))
  }

  // ── 4. 从流里取最终文本与用量 ────────────────────────────────
  // 规则:assistant 事件有 chunk 与 complete 两种,只认 complete;
  //       usage 在 assistant_response_end 里。
  const events = readFileSync(ndjson, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line).event)

  const parseJsonField = (value) => {
    if (typeof value !== 'string') return value ?? null
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }

  let finalText = ''
  let usage = null
  for (const e of events) {
    if (e?.type === 'assistant') {
      const content = parseJsonField(e.content)
      const meta = parseJsonField(e.metadata)
      if (content?.content && meta?.stream_status === 'complete') finalText = content.content
    }
    if (e?.type === 'assistant_response_end') {
      const content = parseJsonField(e.content)
      if (content?.usage) usage = content.usage
    }
  }

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
        inputSha256: { prompt: createHash('sha256').update(PROMPT).digest('hex') },
        evidence: ['request.json', 'stream.ndjson', 'run.json'],
      },
      null,
      2,
    ),
  )

  console.log(`\n=== 结果 ===`)
  console.log(`  事件数     : ${seq}`)
  console.log(`  [DONE]     : ${done ? '收到' : '未收到(流提前结束,以最终状态为准)'}`)
  console.log(`  状态       : ${status.status ?? '未知'}`)
  console.log(`  耗时       : ${(streamMs / 1000).toFixed(1)}s`)
  if (usage) {
    console.log(
      `  token      : 总 ${usage.total_tokens}  输入 ${usage.prompt_tokens}  输出 ${usage.completion_tokens}  缓存命中 ${usage.cached_input_tokens ?? 0}`,
    )
  }
  if (finalText) {
    console.log(`\n--- 回复 ---\n${finalText.slice(0, 1200)}${finalText.length > 1200 ? '\n…(截断)' : ''}`)
  }
  if (status.error) console.log(`\n错误: ${redact(JSON.stringify(status.error))}`)
  if (status.status === 'asked') {
    console.log('\n⚠️ 状态 asked:Agent 在等你回答,不是完成。')
    console.log(`   续跑:POST /api/thread/${threadId}/messages + /agent/start`)
  }
  console.log(`\n证据目录:logs/runs/${runId}/`)

  process.exit(status.status === 'failed' || status.status === 'stopped' ? 5 : 0)
}

main()
