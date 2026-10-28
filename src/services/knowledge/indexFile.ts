/**
 * 模块 A · 索引落盘:`knowledge/INDEX.md`
 *
 * ── 它和 `store.index()` 的分工 ──
 * `store.index()` 返回**文本**(会被拼进 system prompt,已按 `INDEX_LIMITS` 截断);
 * 本文件负责把同一段文本**落成磁盘上的 INDEX.md**,给人和 git 看。
 *
 * 为什么要有磁盘副本:
 * 1. 演示时可以直接 `cat knowledge/INDEX.md` 证明「知识库真的建起来了」
 * 2. AC-A2.3「人类可直接阅读、可 git diff」对索引同样适用
 * 3. 它是**派生数据**,删掉能随时重建 —— 所以不放进 `notes.md`,避免事实源分裂
 */

import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { KnowledgeStore } from './types.ts'

export const INDEX_FILE_NAME = 'INDEX.md'

export interface IndexFileStats {
  readonly path: string
  readonly bytes: number
  readonly lines: number
  readonly generatedAt: string
}

export interface WriteIndexOptions {
  /** 知识库根目录(INDEX.md 与各论文目录同级) */
  readonly root: string
  /** 注入时钟,便于测试断言 */
  readonly now?: () => Date
}

export function indexFilePath(root: string): string {
  return join(root, INDEX_FILE_NAME)
}

/**
 * 加生成标记。
 *
 * 不用「本文件自动生成」这种空话,而是写清**数据源**与**重建方式** ——
 * 三个月后有人看到 INDEX.md 与 notes.md 不一致时,知道该信哪个。
 */
export function buildIndexDocument(body: string, generatedAt: Date): string {
  const header = [
    '<!-- 自动生成,请勿手改:数据源是 knowledge/*/notes.md,重建命令 `npm run ingest -- --index-only` -->',
    `<!-- generated_at: ${generatedAt.toISOString()} -->`,
    '',
  ].join('\n')
  return `${header}${body.endsWith('\n') ? body : `${body}\n`}`
}

/** 生成并落盘索引。返回字节/行数,供 CLI 与探针打印 */
export async function writeIndexFile(
  store: KnowledgeStore,
  options: WriteIndexOptions,
): Promise<IndexFileStats> {
  const now = options.now ?? ((): Date => new Date())
  const generatedAt = now()
  const body = await store.index()
  const content = buildIndexDocument(body, generatedAt)

  const path = indexFilePath(options.root)
  await mkdir(dirname(path), { recursive: true })
  // 与 notes.md 同样的写法:先写临时文件再 rename,避免半截文件
  const temp = `${path}.tmp`
  await writeFile(temp, content, 'utf8')
  await rename(temp, path)

  return {
    path,
    bytes: Buffer.byteLength(content, 'utf8'),
    lines: content.split('\n').length - 1,
    generatedAt: generatedAt.toISOString(),
  }
}
