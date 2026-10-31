#!/usr/bin/env node
/**
 * 把 submission/*.en.md 渲染成 PDF(零依赖)。
 *
 * 为什么自己写转换器:
 *   仓库没有 markdown 库,也没有 pandoc;但提交物不允许「md 一份、PDF 另抄一份」——
 *   两份迟早不一致。所以从 md 单向生成 HTML,再用 Edge 无头打印成 PDF。
 *
 * 用法:
 *   node scripts/build-submission-pdf.mjs            # 生成全部 *.en.md → *.pdf
 *   node scripts/build-submission-pdf.mjs 01         # 只生成文件名含 "01" 的
 *
 * 只支持本目录实际用到的语法:标题 / 段落 / 表格 / 列表 / 代码块 / 引用 / 分隔线 /
 * 行内 **bold** *em* `code` [link](). 新增语法前先在这里实现,不要在 md 里写别的。
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { spawnSync } from 'node:child_process'

const SUB_DIR = resolve('submission')
const BUILD_DIR = join(SUB_DIR, '_build')

const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]

function esc(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 行内标记。输入是已转义的文本,所以只需处理 ** * ` []() 四类 */
function inline(text) {
  let out = text
  // 行内代码先做,避免其中的 * 被当成强调
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`)
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  return out
}

function isTableSeparator(line) {
  return /^\|[\s:|-]+\|$/.test(line.trim()) && line.includes('-')
}

/** 图片资源根:md 里的相对路径以 submission/ 为基准 */
const ASSET_ROOT = SUB_DIR

const MIME = { '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }

/**
 * 把图片内联成 data URI。
 * 为什么不用路径引用:PDF 由 Edge 打印 file:// 页面,相对路径受工作目录影响,
 * 内联后 HTML 自包含,换机器也能打印出同样的 PDF。
 */
function inlineImage(relPath) {
  const abs = resolve(ASSET_ROOT, relPath)
  if (!existsSync(abs)) {
    console.error(`✗ 图片不存在:${relPath}(解析为 ${abs})`)
    process.exit(1)
  }
  const ext = relPath.slice(relPath.lastIndexOf('.')).toLowerCase()
  const mime = MIME[ext]
  if (mime === undefined) {
    console.error(`✗ 不支持的图片类型:${relPath}`)
    process.exit(1)
  }
  return `data:${mime};base64,${readFileSync(abs).toString('base64')}`
}


function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

/** markdown → html 片段 */
function renderMarkdown(md) {
  const lines = md.split(/\r?\n/)
  const html = []
  let i = 0
  // 待应用的表格列宽(百分比),由 <!-- colw:... --> 指令设置,只作用于紧随其后的那一张表
  let pendingColw = []
  // 下一个标题是否需要另起一页(由 <!-- pagebreak --> 设置)
  let pendingBreak = false

  while (i < lines.length) {
    const line = lines[i]

    // 表格列宽:<!-- colw:13,24,44,19 --> 单独一行。
    // 不写时表格按内容自动分配列宽,含长 token 的列会撑宽、把别的列压成一条竖排文字。
    if (/^\s*<!--\s*colw:[\d.,\s]+-->\s*$/.test(line)) {
      pendingColw = line
        .replace(/.*colw:/, '')
        .replace(/-->.*/, '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
      i += 1
      continue
    }

    // 强制分页:写 <!-- pagebreak --> 单独一行。
    // 五页说明要求「每页一个论点」,自动分页无法保证版面,必须能手动定页。
    // 下一行是标题时改走 break-before(见标题分支),否则仍用空块。
    if (/^\s*<!--\s*pagebreak\s*-->\s*$/.test(line)) {
      if (/^#{1,4}\s+/.test(lines[i + 1] ?? '')) {
        pendingBreak = true
      } else {
        html.push('<div class="pb"></div>')
      }
      i += 1
      continue
    }

    // 图片:![图注](相对路径){w:70} 独占一行 → <figure> + <figcaption>
    // {w:70} 可选,按百分比控制图宽,用于压版面
    const image = /^!\[([^\]]*)\]\(([^)]+)\)(?:\{w:(\d{1,3})\})?\s*$/.exec(line)
    if (image !== null) {
      const caption = image[1].trim()
      const width = image[3] === undefined ? '' : ` style="width:${image[3]}%"`
      html.push(
        `<figure><img src="${inlineImage(image[2].trim())}" alt="${esc(caption)}"${width} />` +
          (caption === '' ? '' : `<figcaption>${inline(esc(caption))}</figcaption>`) +
          '</figure>',
      )
      i += 1
      continue
    }

    // 代码块
    if (line.trim().startsWith('```')) {
      const body = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        body.push(lines[i])
        i += 1
      }
      i += 1
      html.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`)
      continue
    }

    // 标题
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading !== null) {
      const level = heading[1].length
      // 分页指令若打在标题前,改为给标题加 break-before。
      // 用 <div class="pb"> 的空块做 page-break-after 有个坑:内容刚好填满一页时,
      // 空块被推到下一页再触发一次分页,于是多出一整页空白。
      const brk = pendingBreak ? ' class="pb-before"' : ''
      pendingBreak = false
      html.push(`<h${String(level)}${brk}>${inline(esc(heading[2]))}</h${String(level)}>`)
      i += 1
      continue
    }

    // 分隔线
    if (/^---+$/.test(line.trim())) {
      html.push('<hr />')
      i += 1
      continue
    }

    // 表格
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitRow(line)
      i += 2
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]))
        i += 1
      }
      const thead = header.map((c) => `<th>${inline(esc(c))}</th>`).join('')
      const tbody = rows
        .map((r) => `<tr>${r.map((c) => `<td>${inline(esc(c))}</td>`).join('')}</tr>`)
        .join('')
      const colgroup =
        pendingColw.length === header.length
          ? `<colgroup>${pendingColw.map((w) => `<col style="width:${w}%" />`).join('')}</colgroup>`
          : ''
      const tableAttrs = colgroup === '' ? '' : ' class="fixed"'
      pendingColw = []
      html.push(`<table${tableAttrs}>${colgroup}<thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`)
      continue
    }

    // 引用块
    if (line.trim().startsWith('>')) {
      const body = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        body.push(lines[i].trim().replace(/^>\s?/, ''))
        i += 1
      }
      html.push(`<blockquote>${renderMarkdown(body.join('\n'))}</blockquote>`)
      continue
    }

    // 列表(有序 / 无序)
    const ulItem = /^\s*[-*]\s+(.*)$/.exec(line)
    const olItem = /^\s*\d+\.\s+(.*)$/.exec(line)
    if (ulItem !== null || olItem !== null) {
      const ordered = olItem !== null
      const tag = ordered ? 'ol' : 'ul'
      const items = []
      while (i < lines.length) {
        const cur = lines[i]
        const m = ordered ? /^\s*\d+\.\s+(.*)$/.exec(cur) : /^\s*[-*]\s+(.*)$/.exec(cur)
        if (m !== null) {
          items.push(m[1])
          i += 1
        } else if (cur.trim() === '') {
          break
        } else if (/^\s+/.test(cur) && items.length > 0) {
          // 续行:并入上一条
          items[items.length - 1] = `${items[items.length - 1]} ${cur.trim()}`
          i += 1
        } else {
          break
        }
      }
      html.push(`<${tag}>${items.map((t) => `<li>${inline(esc(t))}</li>`).join('')}</${tag}>`)
      continue
    }

    // 空行
    if (line.trim() === '') {
      i += 1
      continue
    }

    // 段落(连续非空行合并)
    const para = []
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,4}\s|```|---+$|>|\||!\[|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])) {
      para.push(lines[i].trim())
      i += 1
    }
    if (para.length > 0) {
      html.push(`<p>${inline(esc(para.join(' ')))}</p>`)
    } else {
      i += 1
    }
  }

  return html.join('\n')
}

const STYLE = `
@page { size: A4; margin: 18mm 16mm 18mm 16mm; }
* { box-sizing: border-box; }
body {
  font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  font-size: 10.2pt; line-height: 1.62; color: #1b1b1b; margin: 0;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
h1 {
  font-size: 19pt; line-height: 1.25; margin: 0 0 4mm; padding-bottom: 3mm;
  border-bottom: 2px solid #1b1b1b; letter-spacing: -0.2pt;
}
h2 {
  font-size: 12.6pt; margin: 7mm 0 2.5mm; padding-left: 3mm;
  border-left: 3px solid #1b1b1b; page-break-after: avoid;
}
h3 { font-size: 10.8pt; margin: 4mm 0 1.6mm; page-break-after: avoid; }
p { margin: 0 0 2.6mm; text-align: justify; }
strong { font-weight: 650; }
em { font-style: italic; color: #333; }
a { color: #17427a; text-decoration: none; border-bottom: 0.4pt solid #b9c6d8; }
code {
  font-family: "Cascadia Mono", Consolas, "Courier New", monospace;
  font-size: 8.6pt; background: #f2f3f5; padding: 0.3mm 1.1mm; border-radius: 1.2mm;
}
pre {
  background: #f6f7f9; border: 0.4pt solid #dfe3e8; border-radius: 1.5mm;
  padding: 3mm 3.5mm; margin: 2.5mm 0 3.5mm; page-break-inside: avoid;
}
pre code { background: none; padding: 0; font-size: 8.4pt; line-height: 1.5; }
table {
  width: 100%; border-collapse: collapse; margin: 2.5mm 0 4mm;
  font-size: 9.2pt; page-break-inside: avoid;
}
th {
  text-align: left; background: #f0f2f5; font-weight: 650;
  border-bottom: 1pt solid #9aa4b0; padding: 1.8mm 2mm;
}
td { border-bottom: 0.4pt solid #e2e5ea; padding: 1.6mm 2mm; vertical-align: top; }
tr { page-break-inside: avoid; }
table.fixed { table-layout: fixed; }
table.fixed th, table.fixed td { overflow-wrap: break-word; }
blockquote {
  margin: 3mm 0; padding: 2.5mm 4mm; background: #f7f8fa;
  border-left: 3px solid #8b98a8; color: #2b2b2b;
}
blockquote p:last-child { margin-bottom: 0; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1.4mm; }
hr { border: none; border-top: 0.4pt solid #d6dae0; margin: 6mm 0; }
figure { margin: 3mm 0 4mm; page-break-inside: avoid; text-align: center; }
figure img { max-width: 100%; border: 0.4pt solid #dfe3e8; }
figcaption {
  margin-top: 1.6mm; font-size: 8.2pt; line-height: 1.45; color: #5a6472; text-align: left;
}
/* 强制分页点:高度为 0,只承担 break-after;末元素不 break,避免拖出空白页 */
.pb { height: 0; margin: 0; page-break-after: always; }
.pb:last-child { page-break-after: auto; }
.pb-before { break-before: page; page-break-before: always; }
`

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<title>${esc(title)}</title><style>${STYLE}</style></head>
<body>${body}</body></html>`
}

function findBrowser() {
  for (const candidate of EDGE_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

async function main() {
  const filter = process.argv[2]
  const browser = findBrowser()
  if (browser === null) {
    console.error('未找到 Edge/Chrome,无法生成 PDF')
    process.exit(1)
  }

  await mkdir(BUILD_DIR, { recursive: true })
  const files = (await readdir(SUB_DIR)).filter(
    (f) => f.endsWith('.en.md') && (filter === undefined || f.includes(filter)),
  )
  if (files.length === 0) {
    console.error('没有匹配的 *.en.md')
    process.exit(1)
  }

  for (const file of files) {
    const md = await readFile(join(SUB_DIR, file), 'utf8')
    const title = (md.match(/^#\s+(.*)$/m)?.[1] ?? file).replace(/[*`]/g, '')
    const htmlPath = join(BUILD_DIR, `${basename(file, '.en.md')}.en.html`)
    const pdfPath = join(SUB_DIR, `${basename(file, '.en.md')}.en.pdf`)
    await writeFile(htmlPath, page(title, renderMarkdown(md)), 'utf8')

    const result = spawnSync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--no-pdf-header-footer',
        `--print-to-pdf=${pdfPath}`,
        `file:///${htmlPath.replace(/\\/g, '/')}`,
      ],
      { encoding: 'utf8', timeout: 120_000 },
    )
    if (result.status !== 0 || !existsSync(pdfPath)) {
      console.error(`✗ ${file} 打印失败:${(result.stderr ?? '').slice(0, 300)}`)
      process.exit(1)
    }
    console.log(`✓ ${file} → ${basename(pdfPath)}`)
  }
}

await main()
