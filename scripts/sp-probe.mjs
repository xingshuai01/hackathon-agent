#!/usr/bin/env node
/**
 * scripts/sp-probe.mjs —— SciencePal 只读探活
 *
 * 作用:验证 Access Key 有效、列出可用 Agent 与模型、确认平台可达。
 *       只发 GET,不创建、不修改、不发布任何东西。
 *
 * 运行:node scripts/sp-probe.mjs
 * 前置:.env 里有 SCIENCEPAL_API_KEY
 *
 * 端点依据官方文档 https://sciencepal.ai/help/sdk:
 *   - Agent 列表  GET /api/agent-catalog?usable_only=true   (body.agents[])
 *   - 模型列表    GET /api/billing/available-models         (body.models[], id 带 platform:: 前缀)
 *   注意:不要用 /api/agents —— 它只返回当前账号"拥有"的,不含内置与共享 Agent。
 *
 * 输出:
 *   1. 终端打印结论
 *   2. logs/runs/sp-probe/<时间戳>.json  完整响应(已脱敏,不含 key)
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT_DIR = join(ROOT, 'logs', 'runs', 'sp-probe')

/** 从 .env 读,不覆盖已有环境变量(优先用 shell 里显式 export 的) */
function loadEnv() {
  const envPath = join(ROOT, '.env')
  if (!existsSync(envPath)) return
  const text = readFileSync(envPath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    const [, k, raw] = m
    if (process.env[k] !== undefined) continue
    process.env[k] = raw.replace(/^['"]|['"]$/g, '').trim()
  }
}

/** 只显示尾部 4 位,任何输出都不允许出现完整 key */
function mask(secret) {
  if (!secret) return '<empty>'
  return `${secret.slice(0, 7)}****${secret.slice(-4)}`
}

const BASE_DEFAULT = 'https://sciencepal.ai'

// 注意:这两个值必须在 loadEnv() 之后读取,否则 .env 里的配置还没进 process.env
let BASE = BASE_DEFAULT
let KEY = ''

async function call(path, { timeout = 20000 } = {}) {
  const startedAt = Date.now()
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeout),
    })
    const text = await res.text()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      body = text.slice(0, 400)
    }
    return { path, status: res.status, ms: Date.now() - startedAt, body }
  } catch (error) {
    return {
      path,
      status: 0,
      ms: Date.now() - startedAt,
      body: { error: error instanceof Error ? error.message : String(error) },
    }
  }
}

function verdictFor(record) {
  if (record.status === 0) return `网络不可达:${JSON.stringify(record.body).slice(0, 120)}`
  if (record.status === 401) return 'key 无效 / 过期 / 已撤销'
  if (record.status === 403) return 'key 有效但无该端点权限'
  if (record.status === 404) return '端点不存在 —— 后端版本可能过旧'
  if (record.status === 429) return '触发限流'
  if (record.status >= 500) return '平台侧错误'
  return 'OK'
}

function pickList(body, key) {
  if (!body || typeof body !== 'object') return []
  return Array.isArray(body[key]) ? body[key] : []
}

async function main() {
  loadEnv()
  BASE = (process.env.SCIENCEPAL_BASE_URL || BASE_DEFAULT).replace(/\/+$/, '')
  KEY = process.env.SCIENCEPAL_API_KEY || ''

  if (!KEY) {
    console.error('缺少 SCIENCEPAL_API_KEY')
    console.error('  1) 登录 sciencepal.ai → 侧边栏用户菜单 → Connections & development → API & Python SDK')
    console.error('  2) 生成 key 后写进 .env:SCIENCEPAL_API_KEY=sp_live_xxx')
    console.error('  3) 重新运行:node scripts/sp-probe.mjs')
    process.exit(1)
  }

  console.log(`SciencePal 探活\n  平台:${BASE}\n  key :${mask(KEY)}\n`)

  const health = await call('/api/health')
  const catalog = await call('/api/agent-catalog?usable_only=true')
  const models = await call('/api/billing/available-models')

  for (const r of [health, catalog, models]) {
    const flag = r.status === 200 ? 'OK  ' : 'FAIL'
    console.log(`  [${flag}] ${String(r.status).padStart(3)} ${r.path}  ${r.ms}ms  ${verdictFor(r)}`)
  }

  const agents = pickList(catalog.body, 'agents')
  const modelList = pickList(models.body, 'models')

  if (catalog.status === 200) {
    console.log(`\n可用 Agent:${agents.length} 个`)
    for (const a of agents.slice(0, 12)) {
      console.log(`  - ${a.name ?? '(unnamed)'}`)
      console.log(`    agent_id: ${a.agent_id ?? '?'}   source: ${a.source ?? '?'}`)
    }
    if (agents.length > 12) console.log(`  … 其余 ${agents.length - 12} 个未显示`)
  }

  if (models.status === 200) {
    console.log(`\n可选模型:${modelList.length} 个`)
    for (const m of modelList.slice(0, 8)) {
      console.log(`  - ${m.id ?? '?'}  (${m.display_name ?? ''})`)
    }
    if (modelList.length > 8) console.log(`  … 其余 ${modelList.length - 8} 个未显示`)
  }

  // 结论与下一步
  const ok = catalog.status === 200
  console.log('\n=== 结论 ===')
  if (ok) {
    console.log('key 可用。把想用的 agent_id 填进 .env 的 SCIENCEPAL_AGENT_ID,')
    console.log('把想用的模型 id(带 platform:: 前缀)填进 SCIENCEPAL_MODEL_ID,然后跑第一次真实 run。')
  } else if (catalog.status === 401) {
    console.log('key 不可用:检查是否复制完整、是否已过期(该 key 到期 2026-11-27)、是否被撤销。')
  } else if (catalog.status === 403 || catalog.status === 404) {
    console.log('后端可能不支持 API key 访问 agent-catalog(文档提到过这种旧后端情形)。')
    console.log('退路:改用 /api/agents(只列自有 Agent),或联系主办方确认后端版本。')
  } else {
    console.log(`未预期状态 ${catalog.status},把上面的响应体留好再排查。`)
  }

  // 落盘证据:logs/ 已被 gitignore;仍然脱敏
  mkdirSync(OUT_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = join(OUT_DIR, `${stamp}.json`)
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        base: BASE,
        keyMasked: mask(KEY),
        at: new Date().toISOString(),
        records: [health, catalog, models].map((r) => ({
          ...r,
          headers: { authorization: '<redacted>' },
        })),
      },
      null,
      2,
    ),
  )
  console.log(`\n响应已写入:${outPath}`)

  process.exit(ok ? 0 : 2)
}

main()
