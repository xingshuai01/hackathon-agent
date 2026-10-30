/**
 * Web 薄壳 · 后端。
 *
 * ── 最重要的约束(检查器会机械拦截)──
 * 本目录只能 import:`node:*`、`../src/ui/events.ts`、`./*`。
 * **不得 import 任何业务实现**(src/agent、src/services)。
 *
 * ── 那任务怎么跑、面板数据怎么来 ──
 * 依赖注入:所有业务能力由 main.ts 在启动 Web 时传进来
 * (与团队已验证的 KnowledgeHitSink 工厂注入模式一致,见
 *  docs/wyh/三项待拍板决策.md §1、docs/web-design.md §2)。
 *
 * 本文件的职责只有三件:
 *   1. 把事件总线广播成 SSE(搬运工)
 *   2. 把 HTTP 请求翻译成对注入接口的调用
 *   3. 提供静态文件与端口顺延
 *
 * 依据:docs/web-design.md;SDD §3.4.4;SRS FR-F4。
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { join, extname, normalize, resolve } from 'node:path'
import { bus, toSseFrame, type AgentEvent } from '../src/ui/events.ts'

// ─────────────────────────────────────────────────────────────
// 1. 注入接口(形状在这里定义,实现全在 main.ts)
// ─────────────────────────────────────────────────────────────

/** 一次 PDF 解析产出的、按三库归类的资产(给前端弹框展示) */
export interface IngestKnowledgeItem {
  readonly noteId: string
  readonly kind: string
  readonly description: string
  readonly page: number
  readonly quote: string
}

export interface IngestSkillItem {
  readonly skillId: string
  readonly name: string
  readonly warnings: readonly string[]
}

export interface IngestResult {
  readonly paperId: string
  readonly title: string
  readonly status: 'stored' | 'skipped' | 'quarantined' | 'empty' | 'failed'
  readonly message: string
  /** A 知识库:本次抽出的原子知识页 */
  readonly knowledge: readonly IngestKnowledgeItem[]
  /** C 技能库:本次生成的技能草案(没抽出知识页时为 null) */
  readonly skill: IngestSkillItem | null
  /** B 工具库:当前已就绪的生成工具名(方法抽取是独立流程,这里只报现状) */
  readonly tools: readonly string[]
}

/**
 * 单任务互斥:上一次运行尚未结束时,controller 抛这个,server 回 409。
 * 定义在 web 侧是因为 main.ts 依赖注入时 import 这里(方向不变,无环)。
 */
export class BusyError extends Error {
  constructor(message = '上一次运行尚未结束,请稍候') {
    super(message)
    this.name = 'BusyError'
  }
}

export interface WebController {
  /**
   * 启动一次 ask 任务。**同步返回**:
   * - 返回 null = 已受理(事件随后经总线 → SSE 流出)
   * - 返回 string = 拒绝原因(如「上一次运行尚未结束」),由前端提示用户
   */
  startTask(task: string): string | null

  /**
   * 解析一个 PDF 并入库(知识库 A + 技能草案 C),返回按三库归类的结构化结果。
   * B 工具库由方法抽取流程生成,这里只回传当前已就绪的工具名。
   */
  ingestPdf(bytes: Uint8Array, filename: string): Promise<IngestResult>
}

export interface KnowledgePanelItem {
  readonly noteId: string
  readonly paperId: string
  readonly page: number
  readonly kind: string
  readonly description: string
  readonly evidence: { readonly quote: string; readonly page: number }
}

export interface ToolPanelItem {
  readonly name: string
  readonly status: 'active' | 'draft'
  readonly sourcePaper: string
  readonly description: string
}

export interface SkillPanelItem {
  readonly skillId: string
  readonly name: string
  readonly status: string
  readonly whenToUse: string
  readonly description: string
}

export interface ArtifactItem {
  readonly name: string
  readonly sizeBytes: number
  readonly mtimeMs: number
}

export interface PanelProviders {
  knowledge(): Promise<KnowledgePanelItem[]>
  tools(): Promise<ToolPanelItem[]>
  skills(): Promise<SkillPanelItem[]>
  artifacts(): Promise<ArtifactItem[]>
}

export interface WebServerOptions {
  readonly port?: number
  readonly controller: WebController
  readonly providers: PanelProviders
  /** 静态资源目录,默认 web/public */
  readonly publicDir?: string
  /** 启动日志 */
  readonly log?: (line: string) => void
}

export interface WebServerHandle {
  readonly port: number
  readonly server: Server
  close(): Promise<void>
}

// ─────────────────────────────────────────────────────────────
// 2. 静态资源(全部内联、无 CDN —— AC-F4.5)
// ─────────────────────────────────────────────────────────────

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

async function serveStatic(publicDir: string, urlPath: string, res: ServerResponse): Promise<boolean> {
  // 防路径穿越:normalize 后必须仍在 publicDir 内
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '')
  const file = normalize(resolve(publicDir, rel))
  if (!file.startsWith(resolve(publicDir))) return false

  try {
    const body = await readFile(file)
    const ext = extname(file)
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    res.end(body)
    return true
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────
// 3. 服务器
// ─────────────────────────────────────────────────────────────

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolveBody(null)
      }
    })
    req.on('error', () => resolveBody(null))
  })
}

/** 读原始二进制 body(PDF 上传用)。超过上限返回 null,避免内存被打爆 */
function readRawBody(req: IncomingMessage, maxBytes: number): Promise<Uint8Array | null> {
  return new Promise((resolveBody) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total <= maxBytes) chunks.push(chunk)
    })
    req.on('end', () => (total > maxBytes ? resolveBody(null) : resolveBody(Buffer.concat(chunks))))
    req.on('error', () => resolveBody(null))
  })
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(payload))
}

export async function startWebServer(options: WebServerOptions): Promise<WebServerHandle> {
  const publicDir = options.publicDir ?? resolve('web/public')
  const log = options.log ?? ((): void => {})
  const startPort = options.port ?? Number(process.env.WEB_PORT ?? 7777)

  // ── SSE 客户端集合:server 关闭或 client 断开时清理 ──
  const clients = new Set<ServerResponse>()

  const unsubscribe = bus.on((event: AgentEvent) => {
    if (clients.size === 0) return
    const frame = toSseFrame(event)
    for (const client of clients) {
      // 客户端读走慢/挂起时不能阻塞其他客户端
      if (!client.writableEnded) client.write(frame)
    }
  })

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname

    // ── SSE ──
    if (path === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      })
      res.write(': connected\n\n')
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }

    // ── 启动任务:立刻 202,不等任务完成(AC-F4.2)──
    if (path === '/api/ask' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const question =
        body !== null && typeof body === 'object' && 'question' in body && typeof body.question === 'string'
          ? body.question.trim()
          : ''
      if (question === '') {
        sendJson(res, 400, { error: 'question 不能为空' })
        return
      }
      const rejected = options.controller.startTask(question)
      if (rejected !== null) {
        sendJson(res, 409, { error: rejected })
        return
      }
      sendJson(res, 202, { accepted: true })
      return
    }

    // ── PDF 上传解析:body 是原始 PDF 字节,文件名走 query 或 header ──
    if (path === '/api/ingest' && req.method === 'POST') {
      const bytes = await readRawBody(req, 50 * 1024 * 1024)
      if (bytes === null || bytes.byteLength === 0) {
        sendJson(res, 400, { error: 'PDF 为空或超过 50MB 上限' })
        return
      }
      const filename =
        url.searchParams.get('filename') ??
        (req.headers['x-filename'] as string | undefined) ??
        'upload.pdf'
      try {
        const result = await options.controller.ingestPdf(bytes, filename)
        sendJson(res, 200, { result })
      } catch (err) {
        if (err instanceof BusyError) {
          sendJson(res, 409, { error: err.message })
          return
        }
        const message = err instanceof Error ? err.message : String(err)
        sendJson(res, 500, { error: message })
      }
      return
    }

    // ── 面板数据(经注入 provider,server 自己不含业务)──
    const panel: Record<string, () => Promise<unknown>> = {
      '/api/knowledge': options.providers.knowledge,
      '/api/tools': options.providers.tools,
      '/api/skills': options.providers.skills,
      '/api/artifacts': options.providers.artifacts,
    }
    const provider = panel[path]
    if (provider !== undefined) {
      try {
        sendJson(res, 200, { items: await provider() })
      } catch (err) {
        // 面板失败不能带崩 server(NFR-4):返回空列表 + 错误信息,前端显示「读取失败」
        const message = err instanceof Error ? err.message : String(err)
        sendJson(res, 200, { items: [], error: message })
      }
      return
    }

    // ── 探活 ──
    if (path === '/healthz') {
      sendJson(res, 200, { ok: true })
      return
    }

    // ── 静态 ──
    if (req.method === 'GET') {
      if (await serveStatic(publicDir, path, res)) return
      sendJson(res, 404, { error: `not found: ${path}` })
      return
    }

    sendJson(res, 405, { error: 'method not allowed' })
  })

  // ── 端口顺延(AC-F4.3):被占就试下一个,绝不因端口问题退出 ──
  let lastError: unknown = null
  for (let port = startPort; port < startPort + 20; port += 1) {
    try {
      await new Promise<void>((resolveListen, reject) => {
        const onError = (err: unknown): void => {
          server.off('listening', onListening)
          reject(err)
        }
        const onListening = (): void => {
          server.off('error', onError)
          resolveListen()
        }
        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(port, '127.0.0.1')
      })
      log(`Web 服务已启动:http://127.0.0.1:${port}`)
      return {
        port,
        server,
        close: async () => {
          unsubscribe()
          for (const client of clients) client.end()
          await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
        },
      }
    } catch (err) {
      lastError = err
    }
  }

  // 全部端口失败:明确报错,但**不退出进程**(AC-F4.4,CLI 兜底)
  throw new Error(`Web 启动失败:20 个端口均被占用(自 ${startPort} 起)。${errMessage(lastError)}`)
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
