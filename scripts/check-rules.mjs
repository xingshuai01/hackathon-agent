#!/usr/bin/env node
/**
 * 规则检查器 —— 把 docs/CODE-RULES.md 里「可机械检查」的部分变成 CI 门禁。
 *
 * 运  行:node scripts/check-rules.mjs        或    npm run check:rules
 * 退  出:0 = 全部通过;1 = 有违规
 *
 * 设计原则:
 *   1. 只检查**能明确判定对错**的规则。风格偏好交给 tsc 和 prettier,这里不放。
 *   2. 每条报错都要**指出文件、行号、违规内容、怎么改** —— 让 AI agent 能自己修。
 *   3. 误报比漏报更糟:一条误报会让人关掉整个检查。
 *
 * 临时豁免:在违规行末尾加 `// rule-ignore <规则名>`(需在 CODE-REVIEW 里说明理由)。
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative, extname, dirname, normalize } from 'node:path'

const ROOT = process.cwd()

// ─────────────────────────────────────────────────────────────
// 配置:白名单放这里,改白名单要过 PR
// ─────────────────────────────────────────────────────────────

/** 允许的生产依赖。**新增任何一个都要在 DECISIONS.md 记一条。** */
const ALLOWED_DEPS = new Set(['zod', 'chalk', 'pdfjs-dist'])

/** 允许的开发依赖 */
const ALLOWED_DEV_DEPS = new Set(['typescript', '@types/node'])

/** 禁止出现的第三方「帮我写 agent」的包 */
const BANNED_PACKAGES = [
  'langchain',
  'langgraph',
  '@langchain/core',
  'autogen',
  'ai', // Vercel AI SDK 的 agent 层
  '@ai-sdk/anthropic',
  '@ai-sdk/openai',
  'openai',
  '@anthropic-ai/sdk',
  'llamaindex',
  'haystack',
  'semantic-kernel',
  'crewai',
]

/**
 * 模块边界。路径统一解析成「仓库相对路径」后再比较,
 * 这样 `../skills/store.ts` 和 `src/services/skills/store.ts` 都能识别。
 * 依据 docs/SDD.md §3.2、docs/STRUCTURE.md §4。
 */
const IMPORT_BOUNDARIES = [
  {
    dir: 'web',
    allowResolvedPrefix: ['src/ui/events', 'web/'],
    allowSpec: ['node:'],
    why: '薄壳约束(NFR-12):Web 层不得 import 任何业务实现,只消费事件流。需要数据就订阅事件或读文件系统',
  },
  {
    dir: 'src/tools',
    allowResolvedPrefix: ['src/tools/', 'src/ui/', 'src/agent/types'],
    allowSpec: ['node:', 'zod'],
    why: 'R2:工具层不 import LLM,也不 import 具体业务模块(能力通过 ToolContext 注入)',
  },
]

/**
 * 三个模块之间不得互相 import 实现(R3)。
 *
 * 这是「三人各开发一个模块」能否并行的关键:
 * 一旦 knowledge 直接 import skills 的实现,两人的改动就会互相锁死。
 * 正确做法:需要别人的数据就做成函数参数,类型用契约里已有的。
 */
const MODULE_ISOLATION = [
  {
    dir: 'src/services/knowledge',
    forbid: ['src/services/skills/', 'src/services/toolsynth/'],
    owner: '同学1(模块 A)',
  },
  {
    dir: 'src/services/toolsynth',
    forbid: ['src/services/knowledge/', 'src/services/skills/'],
    owner: '同学2(模块 B)',
  },
  {
    dir: 'src/services/skills',
    forbid: ['src/services/knowledge/', 'src/services/toolsynth/'],
    owner: '同学3(模块 C)',
  },
]


/** 冻结契约文件:必须存在,且必须带 ★ 标记 */
const CONTRACT_FILES = [
  'src/ui/events.ts',
  'src/tools/types.ts',
  'src/agent/types.ts',
  'src/services/knowledge/types.ts',
  'src/services/skills/types.ts',
  'src/services/paper/types.ts',
]

/** 扫描的文件扩展名 */
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs'])

/** 不扫描的目录 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.tools',
  'claude-code-main',
  'data',
  'logs',
  'out',
  'dist',
  'coverage',
])

// ─────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────

const violations = []

function report(rule, file, line, detail, howToFix) {
  violations.push({ rule, file, line, detail, howToFix })
}

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(join(dir, entry.name), out)
    } else if (entry.isFile()) {
      if (SOURCE_EXTS.has(extname(entry.name))) out.push(join(dir, entry.name))
    }
  }
  return out
}

function readLines(file) {
  return readFileSync(file, 'utf8').split(/\r?\n/)
}

function hasIgnoreComment(line, rule) {
  return line.includes('rule-ignore') && (rule === undefined || line.includes(rule))
}

const rel = (file) => relative(ROOT, file).replace(/\\/g, '/')

// ─────────────────────────────────────────────────────────────
// 规则 1:依赖白名单
// ─────────────────────────────────────────────────────────────

function checkDependencies() {
  const pkgPath = join(ROOT, 'package.json')
  if (!existsSync(pkgPath)) return
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

  for (const name of Object.keys(pkg.dependencies ?? {})) {
    if (!ALLOWED_DEPS.has(name)) {
      report(
        'dep-whitelist',
        'package.json',
        0,
        `不允许的生产依赖:${name}`,
        `允许清单:[${[...ALLOWED_DEPS].join(', ')}]。真要加,先在 docs/DECISIONS.md 记一条决策,再改 scripts/check-rules.mjs 的白名单`,
      )
    }
  }
  for (const name of Object.keys(pkg.devDependencies ?? {})) {
    if (!ALLOWED_DEV_DEPS.has(name)) {
      report(
        'dep-whitelist',
        'package.json',
        0,
        `不允许的开发依赖:${name}`,
        `允许清单:[${[...ALLOWED_DEV_DEPS].join(', ')}]`,
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 规则 2:禁止第三方 agent 框架 / 禁止 any / 禁止 enum、namespace
// ─────────────────────────────────────────────────────────────

const RE_IMPORT = /(?:^|[^.\w])(?:import\s[^'"]*?from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g
const RE_ANY = /(?::\s*any\b|\bas\s+any\b|<any>|\bany\[\])/ // rule-ignore no-any 本行是检测规则本身的正则字面量,非真实 any 用法
const RE_ENUM = /^\s*(?:export\s+)?(?:declare\s+)?enum\s+\w+/
const RE_NAMESPACE = /^\s*(?:export\s+)?(?:declare\s+)?namespace\s+\w+/
const RE_TODO_EMPTY = /throw new Error\(\s*['"](?:TODO|Not implemented|not implemented)/

function checkSourceFile(file) {
  const relPath = rel(file)
  const lines = readLines(file)

  lines.forEach((line, i) => {
    const lineNo = i + 1

    // 2.1 禁止第三方 agent 框架
    RE_IMPORT.lastIndex = 0
    let m
    while ((m = RE_IMPORT.exec(line)) !== null) {
      const spec = m[1]
      const bare = spec.startsWith('@')
        ? spec.split('/').slice(0, 2).join('/')
        : spec.split('/')[0]
      if (BANNED_PACKAGES.includes(bare)) {
        report(
          'banned-package',
          relPath,
          lineNo,
          `引入了被禁的包:${bare}`,
          '本项目自研 Agent 机制(DEC-008)。只用 Node 原生能力与 zod。DeepSeek 走原生 fetch,不需要 SDK',
        )
      }
    }

    // 2.2 禁止 any(erasableSyntaxOnly 管不到,只能静态查)
    if (RE_ANY.test(line) && !hasIgnoreComment(line, 'no-any')) {
      report(
        'no-any',
        relPath,
        lineNo,
        `使用了 any:${line.trim().slice(0, 80)}`,
        '改用 unknown + 收窄,或定义具体类型。确实无法避免时在该行末尾加 // rule-ignore no-any 并在评审里说明',
      )
    }

    // 2.3 禁止 enum / namespace(Node 类型剥离模式无法运行这两种语法)
    if (RE_ENUM.test(line) && !hasIgnoreComment(line, 'no-enum')) {
      report(
        'no-enum',
        relPath,
        lineNo,
        '使用了 enum',
        '改用 `as const` 对象 + 联合类型,例如 export const KIND = {...} as const; type Kind = typeof KIND[keyof typeof KIND]',
      )
    }
    if (RE_NAMESPACE.test(line) && !hasIgnoreComment(line, 'no-namespace')) {
      report('no-namespace', relPath, lineNo, '使用了 namespace', '改用 ES module(一个文件一个模块)')
    }

    // 2.4 禁止留 TODO 抛错当实现
    if (RE_TODO_EMPTY.test(line)) {
      report(
        'no-todo-throw',
        relPath,
        lineNo,
        '用 throw 表示「未实现」',
        '要么真正实现,要么明确返回结构化失败(如 toolFail("尚未实现"))',
      )
    }
  })
}

// ─────────────────────────────────────────────────────────────
// 规则 3:模块边界(import 白名单)+ 跨模块隔离
// ─────────────────────────────────────────────────────────────

/** 把相对 specifier 解析成仓库相对路径;裸包名返回 null */
function resolveSpecifier(fileRelPath, spec) {
  if (!spec.startsWith('.')) return null
  return normalize(join(dirname(fileRelPath), spec)).replace(/\\/g, '/')
}

function checkImportBoundaries(file) {
  const relPath = rel(file)
  const boundary = IMPORT_BOUNDARIES.find((r) => relPath.startsWith(r.dir + '/'))
  const isolation = MODULE_ISOLATION.find((r) => relPath.startsWith(r.dir + '/'))
  if (!boundary && !isolation) return

  const lines = readLines(file)
  lines.forEach((line, i) => {
    RE_IMPORT.lastIndex = 0
    let m
    while ((m = RE_IMPORT.exec(line)) !== null) {
      const spec = m[1]

      // ── 裸包名 / node: 前缀 ──
      if (!spec.startsWith('.')) {
        if (boundary && !boundary.allowSpec.some((a) => spec.startsWith(a))) {
          report('import-boundary', relPath, i + 1, `越界 import:${spec}`, boundary.why)
        }
        continue
      }

      // ── 相对路径:先解析成仓库相对路径 ──
      const resolved = resolveSpecifier(relPath, spec)
      if (!resolved) continue

      if (boundary && !boundary.allowResolvedPrefix.some((p) => resolved.startsWith(p))) {
        report('import-boundary', relPath, i + 1, `越界 import:${spec} → ${resolved}`, boundary.why)
        continue
      }

      if (isolation) {
        const hit = isolation.forbid.find((f) => resolved.startsWith(f))
        if (hit) {
          report(
            'module-isolation',
            relPath,
            i + 1,
            `跨模块 import:${spec} → ${resolved}`,
            `${isolation.owner} 的模块不得依赖别人模块的实现(R3)。` +
              `需要对方的数据,就把它做成函数参数传进来,类型用契约里已有的。`,
          )
        }
      }
    }
  })
}

// ─────────────────────────────────────────────────────────────
// 规则 4:冻结契约文件必须存在且带标记
// ─────────────────────────────────────────────────────────────

function checkContracts() {
  for (const contract of CONTRACT_FILES) {
    const full = join(ROOT, contract)
    if (!existsSync(full)) {
      report('contract-missing', contract, 0, '冻结契约文件不存在', '按 docs/SDD.md §4 创建')
      continue
    }
    const head = readFileSync(full, 'utf8').slice(0, 600)
    if (!head.includes('★★★')) {
      report(
        'contract-marker',
        contract,
        1,
        '缺少「★★★ 冻结契约」标记',
        '文件头部必须有该标记,否则别人不知道改它要过 PR',
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 规则 5:数据铁律的静态痕迹
// ─────────────────────────────────────────────────────────────

/**
 * 知识库实现里如果出现「不带 page 的 note 构造」很难静态判断,
 * 但可以检查一个高频错误:`page: 0` 这种占位值。
 */
function checkPlaceholderPage(file) {
  const relPath = rel(file)
  if (!relPath.startsWith('src/services/knowledge/')) return
  readLines(file).forEach((line, i) => {
    if (/\bpage:\s*0\b/.test(line) && !hasIgnoreComment(line, 'anchor')) {
      report(
        'anchor-placeholder',
        relPath,
        i + 1,
        '出现 page: 0 占位',
        '数据铁律 #1:页码必须是真实的 >=1 整数,不得用 0 占位',
      )
    }
  })
}

// ─────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────

function main() {
  checkDependencies()
  checkContracts()

  const files = walk(ROOT).filter((f) => {
    const r = rel(f)
    // 只检查我们自己的代码,不检查脚本与测试以外的杂物
    return r.startsWith('src/') || r.startsWith('web/') || r.startsWith('scripts/') || r.startsWith('test/')
  })

  for (const file of files) {
    checkSourceFile(file)
    checkImportBoundaries(file)
    checkPlaceholderPage(file)
  }

  // ── 输出 ──
  if (violations.length === 0) {
    console.log(`✅ 规则检查通过(${files.length} 个文件,6 组规则)`)
    process.exit(0)
  }

  const byRule = new Map()
  for (const v of violations) {
    if (!byRule.has(v.rule)) byRule.set(v.rule, [])
    byRule.get(v.rule).push(v)
  }

  console.error(`❌ 发现 ${violations.length} 处违规,涉及 ${byRule.size} 条规则\n`)

  for (const [rule, items] of byRule) {
    console.error(`── [${rule}] ${items.length} 处 ──`)
    for (const v of items) {
      console.error(`  ${v.file}${v.line ? ':' + v.line : ''}`)
      console.error(`    ${v.detail}`)
      console.error(`    → ${v.howToFix}`)
    }
    console.error('')
  }

  console.error('完整规则见 docs/CODE-RULES.md')
  process.exit(1)
}

main()
