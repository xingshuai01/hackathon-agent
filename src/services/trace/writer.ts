/**
 * JSONL 运行追踪。
 *
 * 依据:docs/SDD.md §8.3、SRS FR-E1。
 * 每次运行一个文件:`logs/<runId>.jsonl`,一行一条事件。
 *
 * 为什么不用日志库:JSONL 天然可解析、可回放、可 git diff,
 * 而且演示结束后能直接拿去复盘「哪一步慢、哪一步失败」。
 */

import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import type { TraceWriter } from '../../tools/types.ts'

export interface TraceOptions {
  /** 默认 ./logs */
  readonly dir?: string
  readonly runId: string
}

export interface TraceHandle extends TraceWriter {
  readonly filePath: string
  close(): void
}

export function createTraceWriter(options: TraceOptions): TraceHandle {
  const dir = options.dir ?? './logs'
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, `${options.runId}.jsonl`)
  const stream: WriteStream = createWriteStream(filePath, { flags: 'a' })

  let closed = false

  return {
    filePath,

    write(entry) {
      if (closed) return
      try {
        stream.write(`${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`)
      } catch {
        // 追踪写入失败不得影响主流程
      }
    },

    close() {
      if (closed) return
      closed = true
      stream.end()
    },
  }
}

/** 内存追踪,单测与 --fake 演示用(不落盘) */
export function createMemoryTrace(): TraceWriter & { entries: Record<string, unknown>[] } {
  const entries: Record<string, unknown>[] = []
  return {
    entries,
    write(entry) {
      entries.push(entry)
    },
  }
}
