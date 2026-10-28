/**
 * 模块 A · 存储的单测。
 *
 * 专门盯三件事:
 * 1. **往返无损** —— 落盘再读回来必须与内存里一模一样,否则「可 git diff」是假的
 * 2. **没有锚点不许入库** —— put() 里那道校验绕不过去
 * 3. **跨平台文件名** —— paperId 含冒号,在 Windows 上会直接炸,必须在命名层解决
 */

import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  LocalMarkdownStore,
  mergeNotes,
  paperDirName,
  parseDocument,
  serializeDocument,
  tokenize,
  truncate,
} from '../../src/services/knowledge/localMarkdown.ts'
import type { AtomicNote } from '../../src/services/knowledge/types.ts'

// ─────────────────────────────────────────────────────────────
// 构造
// ─────────────────────────────────────────────────────────────

function note(overrides: Partial<AtomicNote> = {}): AtomicNote {
  const base: AtomicNote = {
    noteId: 'arxiv:2210.03629#p3#a1b2c3',
    paperId: 'arxiv:2210.03629',
    page: 3,
    kind: 'method',
    description: 'ReAct combines reasoning traces with task specific actions.',
    text: 'We propose ReAct, a general paradigm that combines reasoning traces with task specific actions.',
    evidence: { quote: 'we propose react a general paradigm', page: 3 },
    confidence: 'high',
    createdAt: '2026-10-29T00:00:00.000Z',
  }

  const merged: AtomicNote = { ...base, ...overrides }
  // 只改 page 时让 evidence.page 跟上 —— 否则构造出的是非法知识页,
  // 会被 validateNote() 正确地拦掉,让测试看起来像实现坏了
  if (overrides.page !== undefined && overrides.evidence === undefined) {
    return { ...merged, evidence: { ...merged.evidence, page: overrides.page } }
  }
  return merged
}

let root = ''
let store: LocalMarkdownStore

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kb-store-'))
  store = new LocalMarkdownStore({ root })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

// ─────────────────────────────────────────────────────────────
// 1. 跨平台文件名
// ─────────────────────────────────────────────────────────────

describe('store · 目录名', () => {
  it('把 paperId 里的冒号换掉 —— 否则 Windows 上直接 EINVAL', () => {
    assert.equal(paperDirName('arxiv:2210.03629'), 'arxiv-2210.03629')
  })

  it('路径分隔符与通配符一并处理', () => {
    assert.equal(paperDirName('10.1000/abc?x=1'), '10.1000-abc-x=1')
    assert.equal(paperDirName('a\\b:c*d'), 'a-b-c-d')
  })

  it('结尾的点与空格被去掉(Windows 不允许)', () => {
    assert.equal(paperDirName('paper. '), 'paper')
  })

  it('空 id 不产生空目录名', () => {
    assert.equal(paperDirName(''), 'paper')
  })
})

// ─────────────────────────────────────────────────────────────
// 2. 往返无损
// ─────────────────────────────────────────────────────────────

describe('store · 序列化往来', () => {
  it('落盘再读回来完全一致', () => {
    const original = note()
    const raw = serializeDocument({ paperId: original.paperId, title: 'ReAct' }, [original])
    const parsed = parseDocument(raw)

    assert.equal(parsed.length, 1)
    assert.deepEqual(parsed[0], original)
  })

  it('多段正文与多行证据不丢行', () => {
    const original = note({
      text: '第一段论述。\n\n第二段论述。',
      evidence: { quote: 'line one\nline two', page: 3 },
    })
    const parsed = parseDocument(serializeDocument({ paperId: 'p', title: '' }, [original]))
    assert.equal(parsed[0]?.text, '第一段论述。\n\n第二段论述。')
    assert.equal(parsed[0]?.evidence.quote, 'line one\nline two')
  })

  it('links 往返不丢', () => {
    const original = note({ links: [{ to: 'arxiv:2210.03629#p5#ffffff', rel: 'supports' }] })
    const parsed = parseDocument(serializeDocument({ paperId: 'p', title: '' }, [original]))
    assert.deepEqual(parsed[0]?.links, original.links)
  })

  it('含冒号的字段值被正确还原(paperId 自带冒号)', () => {
    const parsed = parseDocument(serializeDocument({ paperId: 'p', title: '' }, [note()]))
    assert.equal(parsed[0]?.paperId, 'arxiv:2210.03629')
    assert.equal(parsed[0]?.noteId, 'arxiv:2210.03629#p3#a1b2c3')
  })

  it('正文与证据相同时省略正文块,读回信息不丢', () => {
    const same = note({ text: 'identical text here', evidence: { quote: 'identical text here', page: 3 } })
    const raw = serializeDocument({ paperId: 'p', title: '' }, [same])
    assert.equal(raw.includes('**正文**'), false)
    assert.deepEqual(parseDocument(raw)[0], same)
  })

  it('正文与证据不同时两者都落盘', () => {
    const raw = serializeDocument({ paperId: 'p', title: '' }, [note()])
    assert.equal(raw.includes('**正文**'), true)
  })

  it('含冒号的标题被引号包裹且能还原', () => {
    const raw = serializeDocument({ paperId: 'p', title: 'ReAct: Synergizing' }, [note()])
    assert.match(raw, /^title: "ReAct: Synergizing"$/m)
  })

  it('缺字段的段落被丢弃,不产出半个知识页', () => {
    const broken = `## p3 · abc
- noteId: x
- paperId: y
`
    assert.deepEqual(parseDocument(broken), [])
  })

  it('page 非法的段落被丢弃 —— 数据铁律 #1', () => {
    const broken = `## p0 · abc
- noteId: x#p0#abc
- paperId: y
- page: 0
- kind: claim
- confidence: high
- created_at: 2026-10-29T00:00:00.000Z
`
    assert.deepEqual(parseDocument(broken), [])
  })
})

// ─────────────────────────────────────────────────────────────
// 3. 入库与读取
// ─────────────────────────────────────────────────────────────

describe('store · put / get', () => {
  it('写入后能按 noteId 读回', async () => {
    await store.put(note())
    const loaded = await store.get('arxiv:2210.03629#p3#a1b2c3')
    assert.deepEqual(loaded, note())
  })

  it('不存在的 noteId 返回 null,不抛错', async () => {
    assert.equal(await store.get('nope#p1#abcdef'), null)
  })

  it('没有锚点的知识页被拒收(数据铁律 #1 的闸门)', async () => {
    await assert.rejects(() => store.put(note({ page: 0 })), /校验失败/)
    await assert.rejects(() => store.put(note({ evidence: { quote: '', page: 3 } })), /校验失败/)
    await assert.rejects(() => store.put(note({ description: '短' })), /校验失败/)
  })

  it('同 noteId 再写是覆盖而不是重复', async () => {
    await store.put(note())
    await store.put(note({ confidence: 'low' }))
    const loaded = await store.get('arxiv:2210.03629#p3#a1b2c3')
    assert.equal(loaded?.confidence, 'low')

    const raw = await readFile(join(root, 'arxiv-2210.03629', 'notes.md'), 'utf8')
    assert.equal(raw.match(/^## /gm)?.length, 1)
  })

  it('putAll 把不同论文分到不同目录', async () => {
    await store.putAll([
      note(),
      note({ noteId: 'doi:10.1000/x#p7#000001', paperId: 'doi:10.1000/x', page: 7 }),
    ])
    const ids = await store.listPaperIds()
    assert.deepEqual([...ids].sort(), ['arxiv:2210.03629', 'doi:10.1000/x'])
  })

  it('空库时 listPaperIds 返回空数组而不是报错', async () => {
    assert.deepEqual(await store.listPaperIds(), [])
  })

  it('落盘的是纯 Markdown,带 frontmatter 与可读标题', async () => {
    await store.put(note())
    const raw = await readFile(join(root, 'arxiv-2210.03629', 'notes.md'), 'utf8')
    assert.match(raw, /^---\npaperId: /)
    assert.match(raw, /created_at: 2026-10-29T00:00:00\.000Z/)
    assert.match(raw, /\*\*证据\*\*（p3）：/)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. 检索
// ─────────────────────────────────────────────────────────────

describe('store · scan 粗筛', () => {
  it('关键词命中并带锚点返回', async () => {
    await store.put(note())
    const hits = await store.scan('reasoning traces')
    assert.equal(hits.length, 1)
    assert.equal(hits[0]?.page, 3)
    assert.equal(hits[0]?.noteId, 'arxiv:2210.03629#p3#a1b2c3')
  })

  it('命中词多的排前面', async () => {
    await store.putAll([
      note({ noteId: 'a#p1#111111', paperId: 'a', description: 'reasoning and acting', page: 1 }),
      note({
        noteId: 'b#p2#222222',
        paperId: 'b',
        description: 'reasoning traces combined with acting',
        page: 2,
      }),
    ])
    const hits = await store.scan('reasoning acting', 5)
    assert.equal(hits.length, 2)
    assert.ok((hits[0]?.score ?? 0) >= (hits[1]?.score ?? 0))
  })

  it('中文按 2-gram 命中', async () => {
    await store.put(note({ description: '本文提出一种检索增强方法', text: '实验表明有效' }))
    const hits = await store.scan('检索增强')
    assert.equal(hits.length, 1)
  })

  it('空查询不返回任何结果,也不报错', async () => {
    await store.put(note())
    assert.deepEqual(await store.scan(''), [])
    assert.deepEqual(await store.scan('，。'), [])
  })

  it('limit 生效', async () => {
    await store.putAll([
      note({ noteId: 'a#p1#111111', paperId: 'a', page: 1 }),
      note({ noteId: 'a#p2#222222', paperId: 'a', page: 2 }),
      note({ noteId: 'a#p3#333333', paperId: 'a', page: 3 }),
    ])
    assert.equal((await store.scan('reasoning', 2)).length, 2)
  })
})

describe('store · select 精筛', () => {
  const candidates = [
    {
      noteId: 'a#p1#111111',
      paperId: 'a',
      page: 1,
      kind: 'claim' as const,
      description: 'x',
      score: 2,
    },
    {
      noteId: 'a#p2#222222',
      paperId: 'a',
      page: 2,
      kind: 'claim' as const,
      description: 'y',
      score: 1,
    },
  ]

  it('模型返回不存在的 id 会被白名单过滤掉', async () => {
    const picked = await store.select('q', candidates, async () => [
      'a#p2#222222',
      'ai#p99#幻觉id',
    ])
    assert.equal(picked.length, 1)
    assert.equal(picked[0]?.noteId, 'a#p2#222222')
  })

  it('候选为空时连模型都不该调', async () => {
    let called = false
    const picked = await store.select('q', [], async () => {
      called = true
      return []
    })
    assert.deepEqual(picked, [])
    assert.equal(called, false)
  })

  it('保持模型给的顺序', async () => {
    const picked = await store.select('q', candidates, async () => ['a#p2#222222', 'a#p1#111111'])
    assert.deepEqual(picked.map((hit) => hit.noteId), ['a#p2#222222', 'a#p1#111111'])
  })
})

// ─────────────────────────────────────────────────────────────
// 5. 关系与索引
// ─────────────────────────────────────────────────────────────

describe('store · link', () => {
  it('建立关系后能读回', async () => {
    await store.putAll([note(), note({ noteId: 'arxiv:2210.03629#p5#ffffff', page: 5 })])
    await store.link('arxiv:2210.03629#p3#a1b2c3', 'arxiv:2210.03629#p5#ffffff', 'supports')
    const from = await store.get('arxiv:2210.03629#p3#a1b2c3')
    assert.deepEqual(from?.links, [{ to: 'arxiv:2210.03629#p5#ffffff', rel: 'supports' }])
  })

  it('重复建立同一条关系是幂等的', async () => {
    await store.putAll([note(), note({ noteId: 'arxiv:2210.03629#p5#ffffff', page: 5 })])
    await store.link('arxiv:2210.03629#p3#a1b2c3', 'arxiv:2210.03629#p5#ffffff', 'supports')
    await store.link('arxiv:2210.03629#p3#a1b2c3', 'arxiv:2210.03629#p5#ffffff', 'supports')
    const from = await store.get('arxiv:2210.03629#p3#a1b2c3')
    assert.equal(from?.links?.length, 1)
  })

  it('目标不存在时拒绝 —— 不留悬空引用', async () => {
    await store.put(note())
    await assert.rejects(
      () => store.link('arxiv:2210.03629#p3#a1b2c3', 'ghost#p1#000000', 'supports'),
      /悬空引用/,
    )
  })

  it('源不存在时报错', async () => {
    await assert.rejects(() => store.link('ghost#p1#000000', 'x#p1#111111', 'supports'), /不存在/)
  })
})

// ─────────────────────────────────────────────────────────────
// 5b. 双向链接(AC-A1.5)
// ─────────────────────────────────────────────────────────────

describe('store · 双向链接', () => {
  const OTHER = 'arxiv:2301.00001'

  it('论文 → 知识页:listByPaper 只返回该论文的条目', async () => {
    await store.putAll([
      note(),
      note({ noteId: 'arxiv:2210.03629#p4#bbbbbb', page: 4 }),
      note({ noteId: `${OTHER}#p2#cccccc`, paperId: OTHER, page: 2 }),
    ])

    const mine = await store.listByPaper('arxiv:2210.03629')
    assert.equal(mine.length, 2)
    assert.ok(mine.every((item) => item.paperId === 'arxiv:2210.03629'))

    const others = await store.listByPaper(OTHER)
    assert.equal(others.length, 1)
  })

  it('知识页 → 论文:每条都带 paperId,和 listByPaper 互为反查', async () => {
    await store.putAll([note(), note({ noteId: 'arxiv:2210.03629#p4#bbbbbb', page: 4 })])

    const note0 = await store.get('arxiv:2210.03629#p3#a1b2c3')
    assert.ok(note0 !== null)
    const byPaper = await store.listByPaper(note0.paperId)
    assert.ok(byPaper.some((item) => item.noteId === note0.noteId))
  })

  it('不存在的论文返回空数组,不抛错', async () => {
    assert.deepEqual(await store.listByPaper('ghost'), [])
  })

  it('backlinks 返回「谁引用了我」,并带关系类型', async () => {
    await store.putAll([
      note(),
      note({ noteId: 'arxiv:2210.03629#p5#ffffff', page: 5 }),
      note({ noteId: 'arxiv:2210.03629#p6#dddddd', page: 6 }),
    ])
    await store.link('arxiv:2210.03629#p5#ffffff', 'arxiv:2210.03629#p3#a1b2c3', 'supports')
    await store.link('arxiv:2210.03629#p6#dddddd', 'arxiv:2210.03629#p3#a1b2c3', 'extends')

    const back = await store.backlinks('arxiv:2210.03629#p3#a1b2c3')
    assert.deepEqual(back, [
      { from: 'arxiv:2210.03629#p5#ffffff', rel: 'supports' },
      { from: 'arxiv:2210.03629#p6#dddddd', rel: 'extends' },
    ])
  })

  it('没有任何引用时 backlinks 返回空数组', async () => {
    await store.put(note())
    assert.deepEqual(await store.backlinks('arxiv:2210.03629#p3#a1b2c3'), [])
  })

  it('rootDir 与实际落盘目录一致 —— CLI 用它写 INDEX.md,不能自己再猜路径', () => {
    assert.equal(store.rootDir, root)
  })
})

describe('store · index', () => {
  it('空库给出明确提示,不是空字符串', async () => {
    assert.match(await store.index(), /空/)
  })

  it('按论文分组列出,带 kind 与页码', async () => {
    await store.putAll([note(), note({ noteId: 'arxiv:2210.03629#p5#ffffff', page: 5 })])
    const text = await store.index()
    assert.match(text, /arxiv:2210\.03629\(2 条\)/)
    assert.match(text, /\[method\] p3/)
  })
})

// ─────────────────────────────────────────────────────────────
// 6. 纯函数
// ─────────────────────────────────────────────────────────────

describe('store · 纯函数', () => {
  it('mergeNotes 同 id 原地替换,保持顺序', () => {
    const a = note({ noteId: 'a#p1#111111' })
    const b = note({ noteId: 'b#p2#222222', page: 2 })
    const merged = mergeNotes([a, b], [note({ noteId: 'a#p1#111111', confidence: 'low' })])
    assert.equal(merged.length, 2)
    assert.equal(merged[0]?.confidence, 'low')
  })

  it('truncate 先触行数上限就停', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`)
    assert.equal(truncate(lines, 3, 10_000).trim().split('\n').length, 3)
  })

  it('truncate 先触字节上限就停', () => {
    const lines = ['x'.repeat(100), 'y'.repeat(100)]
    const text = truncate(lines, 100, 150)
    assert.equal(text.trim().split('\n').length, 1)
  })

  it('tokenize 忽略单字符噪声,保留中文 2-gram', () => {
    const tokens = tokenize('a ReAct 检索增强')
    assert.ok(tokens.includes('react'))
    assert.ok(tokens.includes('检索'))
    assert.ok(!tokens.includes('a'))
  })
})
