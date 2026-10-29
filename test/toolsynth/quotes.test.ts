/**
 * 数据铁律 #2 的守门测试:已提交 specs 里每条 evidenceQuote 必须能在论文 PDF
 * 对应页**逐字**找到(用 extract.ts 的 locateQuotePage,与抽取链路同一套校验)。
 *
 * PDF 不入库(版权+体积,见 .gitignore 的 fixtures/papers/*.pdf),
 * 没有 PDF 的环境会 skip —— 有 PDF 的机器(本机)必须全绿。
 */

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { parsePdfFile } from '../../src/services/paper/parse.ts'
import { locateQuotePage } from '../../src/services/toolsynth/extract.ts'
import { committedSpecs } from './specs.ts'

const PDF = join(process.cwd(), 'fixtures', 'papers', 'react-2210.03629.pdf')

describe('已提交 specs 的证据引文逐字回指', () => {
  it('每条 evidenceQuote 都在论文对应页逐字找到', async (t) => {
    if (!existsSync(PDF)) {
      t.skip('论文 PDF 未入库;本机跑过(下载 fixtures/papers/react-2210.03629.pdf 后本用例生效)')
      return
    }
    const assembled = await parsePdfFile(PDF)
    let checked = 0
    for (const spec of committedSpecs()) {
      const quote = spec.evidenceQuote
      if (quote === undefined) continue
      checked += 1
      const located = locateQuotePage(assembled.doc, quote, spec.evidencePage)
      assert.equal(
        located,
        spec.evidencePage,
        `spec「${spec.methodId}」的 evidenceQuote 应逐字回指 p.${spec.evidencePage}`,
      )
    }
    assert.ok(checked >= 6, `应至少校验 6 条引文,实际 ${checked}`)
  })
})
