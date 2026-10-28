#!/usr/bin/env node
/**
 * scripts/sp-create-agent.mjs —— 从本地配置创建一个 SciencePal 自定义 Agent
 *
 * 依据:POST /api/agents  required: { name, system_prompt }
 *
 * 运行:
 *   node scripts/sp-create-agent.mjs --file agents/research-distiller.json
 *   node scripts/sp-create-agent.mjs --file agents/research-distiller.json --publish
 *
 * 行为:
 *   - 不带 --publish 时只创建,打印 agent_id,不对外可见
 *   - 带 --publish 时再调 POST /api/agents/{id}/publish(可能变成他人可见,谨慎)
 *   - 响应写入 logs/runs/sp-agents/<时间戳>.json(已脱敏)
 *
 * 撤销:DELETE /api/agents/{agent_id}
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
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

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return fallback
  const next = process.argv[i + 1]
  return next && !next.startsWith('--') ? next : true
}

function mask(secret) {
  return secret ? `${secret.slice(0, 7)}****${secret.slice(-4)}` : '<empty>'
}

async function main() {
  loadEnv()
  const BASE = (process.env.SCIENCEPAL_BASE_URL || BASE_DEFAULT).replace(/\/+$/, '').replace(/\/api$/, '')
  const KEY = process.env.SCIENCEPAL_API_KEY || ''
  const file = String(arg('file', 'agents/research-distiller.json'))
  const publish = Boolean(arg('publish', false))

  if (!KEY) {
    console.error('缺少 SCIENCEPAL_API_KEY')
    process.exit(1)
  }

  const cfgPath = join(ROOT, file)
  if (!existsSync(cfgPath)) {
    console.error(`配置不存在:${cfgPath}`)
    process.exit(1)
  }
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
  if (!cfg.name || !cfg.system_prompt) {
    console.error('配置缺必填字段:name / system_prompt')
    process.exit(1)
  }

  console.log(`创建 Agent\n  平台: ${BASE}\n  key : ${mask(KEY)}\n  名称: ${cfg.name}`)
  console.log(`  prompt 长度: ${cfg.system_prompt.length} 字符\n`)

  const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
  const body = { name: cfg.name, description: cfg.description, system_prompt: cfg.system_prompt }

  const res = await fetch(`${BASE}/api/agents`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  })
  const text = await res.text()
  let created
  try {
    created = JSON.parse(text)
  } catch {
    created = { raw: text.slice(0, 800) }
  }

  mkdirSync(join(ROOT, 'logs', 'runs', 'sp-agents'), { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = join(ROOT, 'logs', 'runs', 'sp-agents', `${stamp}.json`)

  if (res.status !== 200 && res.status !== 201) {
    console.error(`创建失败 ${res.status}: ${JSON.stringify(created).slice(0, 600)}`)
    console.error('\n如果是 403/404:后端可能不允许 API key 创建 Agent,')
    console.error('退路是在网页里用「自定义智能体」手建,再把 agent_id 写进 .env。')
    writeFileSync(outPath, JSON.stringify({ at: stamp, status: res.status, body: created }, null, 2))
    process.exit(2)
  }

  const agentId = created.id ?? created.agent_id ?? created.agent?.id
  console.log(`创建成功`)
  console.log(`  agent_id : ${agentId ?? '(响应里没找到,见落盘文件)'}`)
  console.log(`  名称     : ${created.name ?? cfg.name}`)

  let published = null
  if (publish && agentId) {
    console.log('\n发布中…')
    const pr = await fetch(`${BASE}/api/agents/${agentId}/publish`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(60000),
    })
    const ptext = await pr.text()
    published = { status: pr.status, body: ptext.slice(0, 800) }
    console.log(`  发布返回 ${pr.status}: ${ptext.slice(0, 200)}`)
  } else if (agentId) {
    console.log('\n未发布(未带 --publish)。确认无误后再执行:')
    console.log(`  curl -X POST -H "Authorization: Bearer $SCIENCEPAL_API_KEY" ${BASE}/api/agents/${agentId}/publish`)
  }

  writeFileSync(
    outPath,
    JSON.stringify({ at: stamp, status: res.status, created, published, headers: { authorization: '<redacted>' } }, null, 2),
  )
  console.log(`\n响应已写入:${outPath}`)
  if (agentId) {
    console.log(`\n下一步:把 agent_id 写进 .env`)
    console.log(`  SCIENCEPAL_AGENT_ID=${agentId}`)
  }
}

main()
