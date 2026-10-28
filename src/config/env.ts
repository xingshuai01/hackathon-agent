/**
 * 极简 .env 加载器。
 *
 * 为什么不用 dotenv:不引入依赖(铁律 2)。Node 24 虽然支持 `--env-file`,
 * 但那样启动命令就得带参数,不如在代码里读一次来得省事。
 *
 * 规则:
 *  - 已存在的环境变量**不覆盖**(方便临时用 shell 变量顶掉 .env)
 *  - 支持 `#` 注释、`KEY=VALUE`、值两端的引号会被剥掉
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface LoadEnvResult {
  readonly loaded: boolean
  readonly path: string
  readonly keys: readonly string[]
}

export function loadDotEnv(file = '.env', env: NodeJS.ProcessEnv = process.env): LoadEnvResult {
  const path = resolve(file)
  if (!existsSync(path)) return { loaded: false, path, keys: [] }

  const keys: string[] = []
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue

    const eq = line.indexOf('=')
    if (eq <= 0) continue

    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()

    // 剥引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    // 行尾注释(只在没有引号包裹时处理)
    const hash = value.indexOf(' #')
    if (hash > 0 && !value.includes('"') && !value.includes("'")) {
      value = value.slice(0, hash).trim()
    }

    if (env[key] === undefined || env[key] === '') {
      env[key] = value
      keys.push(key)
    }
  }

  return { loaded: true, path, keys }
}
