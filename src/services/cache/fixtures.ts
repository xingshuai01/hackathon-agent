/**
 * fixtures 缓存。
 *
 * 依据:docs/SDD.md §3.4.6、SRS FR-E1 / AC-E1.2 / AC-E1.3。
 *
 * 两种行为:
 *   live   + 录制开启 → 写入 fixtures/
 *   replay           → 只读 fixtures/,**绝不联网**
 *
 * replay 下命中不到时必须报明确错误(而不是静默返回 null 让上层继续联网),
 * 否则「断网演示」会在最不该的时候失败。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import type { Cache } from '../../tools/types.ts'

export interface FixtureCacheOptions {
  /** 默认 ./fixtures */
  readonly dir?: string
  /** live 模式下是否录制 */
  readonly record: boolean
}

/** 把任意 key 规范成安全的文件名:短名 + 哈希后缀,避免超长路径 */
export function fixtureFileName(key: string): string {
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 16)
  const slug = key
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${slug === '' ? 'fixture' : slug}_${hash}.json`
}

export function createFixtureCache(options: FixtureCacheOptions): Cache {
  const dir = options.dir ?? './fixtures'

  function pathOf(key: string): string {
    return join(dir, fixtureFileName(key))
  }

  return {
    async get(key) {
      try {
        return readFileSync(pathOf(key), 'utf8')
      } catch {
        return null
      }
    },

    async set(key, value) {
      if (!options.record) return
      const file = pathOf(key)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, value, 'utf8')
    },
  }
}

/**
 * replay 模式下取不到 fixture 时的明确错误。
 * 上层应该把这条消息原样带给用户,而不是悄悄联网。
 */
export function missingFixtureMessage(key: string, dir = './fixtures'): string {
  return (
    `replay 模式下 fixtures 里没有这个请求:${key}\n` +
    `  期望文件:${join(dir, fixtureFileName(key))}\n` +
    `  解决:先用 live 模式带 --record 跑一次,把响应录下来并提交到 git`
  )
}
