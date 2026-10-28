#!/usr/bin/env node
/**
 * scripts/verify-anchors.mjs —— 锚点可信度核验(A 模块的质量门)
 *
 * 为什么需要它:
 *   大模型说"这条论断在 p.5",这句话本身没有任何可信度 —— 它可能对,也可能凭空写。
 *   唯一能证明 locator 可信的办法,是拿 quote 回到 PDF 原文里定位一遍。
 *
 * 做法:
 *   1. pdftotext 按页切分(靠 \f 分隔符)
 *   2. 每条论断的 quote 按 "..." 拆成片段(去掉省略号),逐段做归一化子串匹配
 *   3. 记录 quote 实际出现在第几页,与声称的 page 比对
 *
 * 产出指标:
 *   pageAccuracy = 页码正确的条数 / 能定位到的条数
 *   locateRate   = 能定位到的条数 / 总条数      (低 = quote 是编的或改写过度)
 *
 * 用法:
 *   node scripts/verify-anchors.mjs --pdf <paper.pdf> --reading <reading.md>
 *   node scripts/verify-anchors.mjs --pdf a.pdf --reading b.md --json out.json
 *
 * 注意:
 *   跨页论断(quote 横跨两页)会记为 "span",不计入错误,单独统计。
 */

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

/** 归一化:去标点、压空白、小写,只留字母数字与少数符号 —— 抵消 PDF 提取的排版噪声 */
function norm(text) {
  return String(text)
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9%.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitPages(pdfPath) {
  const dir = mkdtempSync(join(tmpdir(), 'anchors-'))
  const out = join(dir, 'pages.txt')
  try {
    execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', resolve(pdfPath), out], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
  } catch (e) {
    rmSync(dir, { recursive: true, force: true })
    throw new Error(`pdftotext 失败: ${e.message}`)
  }
  const raw = readFileSync(out, 'utf8')
  rmSync(dir, { recursive: true, force: true })
  // pdftotext 用 \f 分页,末尾会多一个空页
  return raw.split('\f').map((p) => p.trimEnd())
}

/** 从 reading.md 里把 JSON 抠出来:允许前有说明文字、外有 ```json 围栏 */
function extractClaims(readingPath) {
  const text = readFileSync(readingPath, 'utf8')
  const unfenced = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '')
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('reading.md 里找不到 JSON 对象')
  const slice = unfenced.slice(start, end + 1)
  let parsed
  try {
    parsed = JSON.parse(slice)
  } catch (e) {
    throw new Error(`JSON 解析失败(可能是模型输出被截断): ${e.message}`)
  }
  if (!Array.isArray(parsed.claims)) throw new Error('JSON 里没有 claims 数组')
  return parsed
}

function main() {
  const pdf = arg('pdf', '')
  const reading = arg('reading', '')
  const outJson = arg('json', '')
  if (!pdf || !reading) {
    console.error('用法: node scripts/verify-anchors.mjs --pdf <paper.pdf> --reading <reading.md>')
    process.exit(1)
  }
  if (!existsSync(pdf) || !existsSync(reading)) {
    console.error('文件不存在')
    process.exit(1)
  }

  const pages = splitPages(pdf)
  const normPages = pages.map(norm)
  const doc = extractClaims(reading)
  const claims = doc.claims

  const rows = []
  for (const c of claims) {
    const claimed = Number.isInteger(c.page) ? c.page : null
    const quote = String(c.quote ?? '')
    // 省略号拆片段,太短的片段(如单独一个数字)不参与匹配,避免假阳性
    const frags = quote
      .split(/\.\.\.|…/)
      .map((f) => norm(f))
      .filter((f) => f.length >= 8)

    // 片段匹配:整段不行就退到前 30 / 前 16 个字符。
    // 原因:PDF 提取会把 A ∪ L、α=0.05 这类数学表达打散,整段必然对不上,
    // 但前半句通常是稳定散文,足以定位。
    const fragIn = (pageText, frag) => {
      if (pageText.includes(frag)) return 3
      if (frag.length > 30 && pageText.includes(frag.slice(0, 30))) return 2
      if (frag.length > 16 && pageText.includes(frag.slice(0, 16))) return 1
      return 0
    }

    let foundPage = null
    let span = false
    let matched = 0
    if (frags.length) {
      let best = { page: null, hits: 0 }
      for (let i = 0; i < normPages.length; i += 1) {
        const hits = frags.filter((f) => fragIn(normPages[i], f) > 0).length
        if (hits > best.hits) best = { page: i + 1, hits }
      }
      matched = best.hits
      foundPage = best.hits > 0 ? best.page : null
      if (foundPage && matched < frags.length && matched / frags.length >= 0.5) span = true
    }

    let verdict
    if (!frags.length) verdict = 'unlocatable'
    else if (!foundPage) verdict = 'quote_not_found'
    else if (claimed === null) verdict = 'no_claimed_page'
    else if (foundPage === claimed) verdict = 'match'
    else if (span && Math.abs(foundPage - claimed) <= 1) verdict = 'span_ok'
    else verdict = 'page_mismatch'

    rows.push({
      i: rows.length + 1,
      section: c.section ?? null,
      type: c.type ?? null,
      claimed,
      found: foundPage,
      frags: frags.length,
      matched,
      verdict,
      claim: String(c.claim ?? '').slice(0, 70),
    })
  }

  const count = (v) => rows.filter((r) => r.verdict === v).length
  const located = rows.filter((r) => r.found !== null).length
  const correct = count('match') + count('span_ok')
  const pageAccuracy = located ? correct / located : 0
  const locateRate = rows.length ? located / rows.length : 0

  console.log(`锚点核验:${reading}`)
  console.log(`  PDF 页数     : ${pages.length}`)
  console.log(`  论断条数     : ${rows.length}`)
  console.log(`  能定位到原文 : ${located}  (locateRate ${(locateRate * 100).toFixed(1)}%)`)
  console.log(`  页码正确     : ${correct}  (pageAccuracy ${(pageAccuracy * 100).toFixed(1)}%)`)
  console.log(`  含跨页容许   : ${count('span_ok')}`)
  console.log(`  页码错误     : ${count('page_mismatch')}`)
  console.log(`  quote 找不到 : ${count('quote_not_found')}`)
  console.log(`  未标页码     : ${count('no_claimed_page')}`)

  const bad = rows.filter((r) => r.verdict === 'page_mismatch' || r.verdict === 'quote_not_found')
  if (bad.length) {
    console.log('\n--- 有问题的条目 ---')
    for (const r of bad) {
      console.log(`  #${r.i} [${r.verdict}] 称 ${r.claimed ?? '-'} / 实 ${r.found ?? '-'} | ${r.claim}`)
    }
  }

  // 偏移分布:如果全是同一个偏移,说明模型用了另一套页码体系(常见于 markdown 转换的 page 标记),
  // 而不是随机乱写 —— 这两种情况对 A 模块的含义完全不同。
  const offsets = rows.filter((r) => r.found !== null && r.claimed !== null).map((r) => r.found - r.claimed)
  const offsetHist = offsets.reduce((m, d) => ({ ...m, [d]: (m[d] ?? 0) + 1 }), {})
  if (offsets.length) {
    const mode = Object.entries(offsetHist).sort((a, b) => b[1] - a[1])[0]
    console.log(`\n偏移分布(实际 - 自报): ${JSON.stringify(offsetHist)}`)
    console.log(`  最常见偏移 +${mode[0]} 占 ${mode[1]}/${offsets.length}`)
    console.log(
      offsetHist[mode[0]] === offsets.length
        ? '  → 单一偏移 = 模型用了另一套页码体系,可与本地页码建立线性映射'
        : '  → 偏移不一致 = 页码不可用,必须本地反查',
    )
  }

  const report = {
    pdf: resolve(pdf),
    reading: resolve(reading),
    pages: pages.length,
    metrics: { pageAccuracy, locateRate, located, correct, total: rows.length },
    offsetHist,
    rows,
  }
  if (outJson) {
    writeFileSync(resolve(outJson), JSON.stringify(report, null, 2))
    console.log(`\n报告已写入 ${outJson}`)
  }

  // 门槛:页码准确率 < 0.8 视为 locator 不可信
  process.exit(pageAccuracy >= 0.8 && locateRate >= 0.8 ? 0 : 6)
}

main()
