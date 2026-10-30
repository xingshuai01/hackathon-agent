/**
 * smoke 执行器:对单个生成工具跑它自己的 .test.ts。
 *
 * 用子进程 `node --test` 执行 —— 与 `npm test` / CI 完全同一条路径(见 package.json
 * 的 test 脚本:扫 test/** 与 src/**)。在进程内 import 测试文件会让 node:test 的
 * 结果注册到本进程的 runner,拿不到逐文件的 pass/fail,所以这里用子进程最诚实。
 *
 * 依据:SRS FR-B2(AC-B2.3 每个生成工具必须通过 smoke test)、Issue #30。
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export interface SmokeResult {
  readonly toolName: string
  readonly testFile: string
  readonly passed: boolean
  readonly exitCode: number | null
  readonly durationMs: number
  /** 失败时的关键输出(截断),用于报告「期望什么、实际什么」 */
  readonly output: string
}

const OUTPUT_LIMIT = 600

/**
 * 跑一个 smoke test 文件。进程永不崩:spawn 失败 / 超时都转成 passed=false。
 * 超时默认 20s(生成工具都是纯计算,正常 <1s;超时本身即视为 smoke 失败)。
 */
export function runSmokeTest(testFile: string, options: { readonly timeoutMs?: number } = {}): SmokeResult {
  const timeoutMs = options.timeoutMs ?? 20_000
  const startedAt = Date.now()
  const args = ['--test', '--experimental-test-isolation=none', testFile]

  // 首选 pipe 拿输出(失败原因可读);但沙箱/受限环境禁止管道 spawn(EPERM),
  // 此时退化为 stdio:'ignore' —— 拿不到输出,但退出码仍然可靠,smoke 照常能判 pass/fail。
  const piped = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
  })
  // spawnSync 的 error 类型标成 Error,但运行时带 NodeJS.ErrnoException.code
  const blocked = (piped.error as { code?: string } | undefined)?.code === 'EPERM'
  const run = blocked
    ? spawnSync(process.execPath, args, { timeout: timeoutMs, stdio: 'ignore' })
    : piped

  const durationMs = Date.now() - startedAt
  const tail =
    blocked && run.stdout === null
      ? '(受限环境:无法捕获 smoke 输出,仅有退出码)'
      : ((piped.stdout ?? '') + (piped.stderr ?? '')).slice(-OUTPUT_LIMIT)
  // 注意:spawnSync 无错时 .error 是 undefined,不是 null
  const passed = run.status === 0 && run.error === undefined
  return {
    toolName: '',
    testFile,
    passed,
    exitCode: run.error !== undefined ? null : run.status,
    durationMs,
    output: tail,
  }
}

export interface GeneratedScanOptions {
  readonly generatedDir: string
  readonly timeoutMs?: number
}

export interface ToolSmokeEntry {
  readonly toolName: string
  readonly toolFile: string
  readonly testFile: string
  readonly smoke: SmokeResult
}

/**
 * 扫描 generated 目录,为每个生成工具跑 smoke。
 *
 * 目录结构约定(见 src/tools/generated/README.md):每个工具一对文件
 * `<toolName>.ts` + `<toolName>.test.ts`;`registry.generated.ts` 与 `report.json`
 * 不是工具,跳过。没有 .test.ts 的工具也算 smoke 失败(契约要求每个工具必须有)。
 */
export function scanGeneratedTools(options: GeneratedScanOptions): readonly ToolSmokeEntry[] {
  const entries: ToolSmokeEntry[] = []
  let names: string[] = []
  try {
    names = readdirSync(options.generatedDir)
  } catch {
    return entries
  }
  for (const file of names) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts') || file === 'registry.generated.ts') continue
    const toolName = file.replace(/\.ts$/, '')
    const toolFile = join(options.generatedDir, file)
    const testFile = join(options.generatedDir, `${toolName}.test.ts`)
    const smoke: SmokeResult = existsSync(testFile)
      ? { ...runSmokeTest(testFile, { ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }) }), toolName }
      : {
          toolName,
          testFile,
          passed: false,
          exitCode: null,
          durationMs: 0,
          output: `缺少 smoke test 文件:${testFile}(约定:每个生成工具必须有 .test.ts)`,
        }
    entries.push({ toolName, toolFile, testFile, smoke })
  }
  return entries
}
