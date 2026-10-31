#!/usr/bin/env node
/**
 * scripts/sp-public-check.mjs —— 提交物②「可运行链接」可达性核查
 *
 * 背景(2026-10-31 实测):
 *   is_public 在 OpenAPI 里**只出现在 AgentResponse(只读输出)**,
 *   不在 AgentCreateRequest 也不在 AgentUpdateRequest 里 → 写不进去。
 *   唯一会翻它的是 POST /api/agents/{id}/publish,而该端点对 API key 返回
 *   403 "API keys are limited to SDK catalogs, agent, run and sandbox endpoints"
 *   → 只能在**网页端登录后点发布**。
 *
 * 本脚本做的事:发布前后各跑一次,用四个观测点回答「评委能不能打开」。
 *   1. 带 key 读 Agent 详情      → is_public / marketplace_published_at
 *   2. 匿名 GET /api/agents/{id} → 401 = 必须登录,不是坏了
 *   3. 匿名 GET /api/marketplace/agents → 当前返回 403 custom agent disabled
 *   4. 匿名 GET /agents/{id}(HTML) → 200 是 Next.js 外壳,不代表有内容;
 *      故额外检查 SSR 里有没有 Agent 名称字符串
 *
 * 运行:
 *   node scripts/sp-public-check.mjs                     # 用 .env 的 SCIENCEPAL_AGENT_ID
 *   node scripts/sp-public-check.mjs --agent <agent_id>
 *   node scripts/sp-public-check.mjs --agent <id> --expect-public   # 发布后复核,不达标则退出码 1
 *
 * 只发 GET,不改任何状态。
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return undefined
  const next = process.argv[i + 1]
  return next && !next.startsWith('--') ? next : true
}

function mask(s) {
  return s ? `${s.slice(0, 7)}****${s.slice(-4)}` : '<empty>'
}

const rows = []
function record(label, value, verdict) {
  rows.push({ label, value, verdict })
  console.log(`  ${verdict.padEnd(6)} ${label.padEnd(34)} ${value}`)
}

async function get(path, { auth = false, timeout = 20000 } = {}) {
  const headers = { Accept: 'application/json' }
  if (auth) headers.Authorization = `Bearer ${process.env.SCIENCEPAL_API_KEY || ''}`
  try {
    const res = await fetch(`${process.env.SCIENCEPAL_BASE_URL || BASE_DEFAULT}${path}`, {
      headers,
      signal: AbortSignal.timeout(timeout),
    })
    const text = await res.text()
    return { status: res.status, text }
  } catch (e) {
    return { status: 0, text: String(e?.message || e) }
  }
}

async function main() {
  loadEnv()
  // .env 里的 SCIENCEPAL_BASE_URL 可能是 https://sciencepal.ai/api(客户端自己拼 /api),
  // 本脚本自己拼完整路径,所以要把尾部 /api 去掉,否则变成 /api/api/...
  const BASE = (process.env.SCIENCEPAL_BASE_URL || BASE_DEFAULT).replace(/\/+$/, '').replace(/\/api$/, '')
  process.env.SCIENCEPAL_BASE_URL = BASE
  const KEY = process.env.SCIENCEPAL_API_KEY || ''
  const agentId = String(arg('agent') || process.env.SCIENCEPAL_AGENT_ID || '')
  const expectPublic = Boolean(arg('expect-public'))

  if (!KEY) {
    console.error('缺少 SCIENCEPAL_API_KEY')
    process.exit(1)
  }
  if (!agentId) {
    console.error('缺少 agent id:传 --agent <id> 或在 .env 设 SCIENCEPAL_AGENT_ID')
    process.exit(1)
  }

  console.log(`SciencePal 可运行链接核查`)
  console.log(`  平台    ${BASE}`)
  console.log(`  key     ${mask(KEY)}`)
  console.log(`  agent   ${agentId}`)
  console.log(`  页面    ${BASE}/agents/${agentId}\n`)

  // 1) 带 key 读真实状态
  const detail = await get(`/api/agents/${agentId}`, { auth: true })
  let isPublic = null
  let publishedAt = null
  let name = null
  if (detail.status === 200) {
    try {
      const d = JSON.parse(detail.text)
      isPublic = d.is_public
      publishedAt = d.marketplace_published_at
      name = d.name
    } catch {
      /* 宽松解析:字段变了也不炸 */
    }
  }
  record(
    'is_public(带 key 读)',
    detail.status === 200 ? String(isPublic) : `HTTP ${detail.status}`,
    isPublic === true ? 'PASS' : 'FAIL',
  )
  record('marketplace_published_at', publishedAt ? publishedAt : 'null', publishedAt ? 'PASS' : 'WARN')
  if (name) record('name', name, 'INFO')

  // 2) 匿名读 API —— 401 是预期,说明「要登录」而非「链接挂了」
  const anonApi = await get(`/api/agents/${agentId}`)
  record(
    '匿名 GET /api/agents/{id}',
    `HTTP ${anonApi.status}`,
    anonApi.status === 200 ? 'PUBLIC' : anonApi.status === 401 ? 'LOGIN' : 'WARN',
  )

  // 3) 市场入口 —— 当前平台侧的状态
  const market = await get('/api/marketplace/agents?limit=3')
  let marketDetail = market.text.slice(0, 80).replace(/\s+/g, ' ')
  record('匿名 GET /api/marketplace/agents', `HTTP ${market.status} ${marketDetail}`, market.status === 200 ? 'PASS' : 'BLOCK')

  // 4) HTML 外壳 —— 200 只代表路由存在,查 SSR 有没有名称
  const page = await get(`/agents/${agentId}`, { timeout: 30000 })
  const hasName = Boolean(name) && page.text.includes(name)
  record(
    '匿名 GET /agents/{id}(HTML)',
    `HTTP ${page.status} SSR含名称=${hasName}`,
    page.status === 200 ? (hasName ? 'PASS' : 'SHELL') : 'FAIL',
  )

  // 5) 目录可见性 —— 注意:catalog 是「本账号可用的」,含自己建的 Agent,
  //    因此出现只说明「没被停用」,不能证明他人可见;公开与否只看 is_public。
  const cat = await get('/api/agent-catalog?usable_only=true', { auth: true })
  let inCatalog = false
  let catSize = '?'
  if (cat.status === 200) {
    try {
      const list = JSON.parse(cat.text).agents || []
      catSize = String(list.length)
      inCatalog = list.some((a) => (a.agent_id || a.id) === agentId)
    } catch {
      /* 宽松解析 */
    }
  }
  record(
    '目录可见性 /api/agent-catalog',
    `HTTP ${cat.status} 共 ${catSize} 个 · 含本 Agent=${inCatalog}(含自己建的,≠他人可见)`,
    inCatalog ? 'SELF' : 'WARN',
  )

  console.log('\n判读:')
  if (isPublic === true && publishedAt) {
    console.log('  ✅ is_public 已为 true。请在无痕窗口用**非本人账号**打开上面的页面,')
    console.log('     再点一次「新建对话」确认能真跑 —— 这一步机器测不了,必须人眼看。')
  } else {
    console.log('  ❌ is_public 仍为 false —— 2026-10-31 网页端实测:这个版本**没有发布入口**。')
    console.log('     Agent 卡片只有 使用/编辑/分享/删除;编辑弹窗无可见性开关;')
    console.log('     分享只能按邮箱定向;/marketplace 重定向到 settings 且显示 Account not found。')
    console.log('     → 不要再找发布按钮。正解在**会话页**:右上角「分享对话」→「创建可分享链接」,')
    console.log('       得到 https://sciencepal.ai/share/<thread_id>,任何人有链接即可公开查看。')
    console.log('     例:https://sciencepal.ai/share/7cc3f00e-1999-4c3d-9c32-e842399ac817')
  }
  if (market.status === 403) {
    console.log('  ⚠️  市场接口整体返回 403「Custom agent currently disabled」——')
    console.log('     即使发布成功,也不保证有匿名可浏览的落地页。备用方案见')
    console.log('     docs/SUBMISSION-CHECK-2026-10-31.md §2 P0-3。')
  }

  if (expectPublic && isPublic !== true) process.exit(1)
}

main()
