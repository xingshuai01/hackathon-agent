# src/services/knowledge/ — 模块 A · 个人知识库

| 项 | 值 |
|---|---|
| **负责人** | 同学 1 |
| **对应 Issue** | #25 #26 #27 #28 |
| **契约** | [`types.ts`](./types.ts) —— ★ 冻结,不可改签名 |
| **上级说明** | [`docs/STRUCTURE.md`](../../../docs/STRUCTURE.md) §3 |

## 你要做什么

把 `PaperDoc` 变成**可检索的原子知识页**,并让 Agent 能检索它。

```
PaperDoc ──extract.ts──▶ AtomicNote[] ──localMarkdown.ts──▶ knowledge/<paperId>/*.md
                                              │
                                              └──index.ts──▶ knowledge/INDEX.md(注入 prompt)
检索:关键词粗筛(scan) ──select.ts──▶ LLM 精筛 ──▶ ≤8 条 NoteHit
```

## 文件

| 文件 | 职责 |
|---|---|
| `anchor.ts` | quote → 真页码反查。**所有 `page` 都必须过它**,不许直接信任段落自报页码 |
| `extract.ts` | `PaperDoc → AtomicNote[]`。**一论断一页**,每页必带 `page` |
| `localMarkdown.ts` | `KnowledgeStore` 的**唯一实现**。纯 Markdown + frontmatter |
| `indexFile.ts` | 把 `store.index()` 落成 `knowledge/INDEX.md`(截断 120 行 / 15KB) |
| `select.ts` | 两段式检索:段 1 本地关键词粗筛,段 2 调 `sideQuery` 精筛 |
| `ingest.ts` | 入库编排:门控 → 判重 → 抽取 → 落盘 → 重建索引 |
| `tool.ts` | `knowledge_search` 工具工厂(注册在 `src/main.ts`) |

> 文件名说明:文档里写的 `index.ts` 落地为 `indexFile.ts` —— 目录里叫 `index.ts` 的
> 文件通常被当成 barrel,容易误 import。改名的成本是一行 import,收益是不会误判。

## 三条必须遵守的

1. **入库前必须调 `validateNote()`** —— 它把「无锚点不入库」做成了函数,别绕过去
2. **不要按 token 切片** —— 按「一个可独立引用的论断」切。按 token 切会把论文炸成上百碎片,引用断链
3. **不引入向量库** —— 检索靠「关键词粗筛 + LLM 精筛」(DEC-010)。这是省掉 embedding 成本和向量库依赖的关键

## 禁止

- ❌ `import '../skills/*'` 或 `'../toolsynth/*'`(检查器会拦)
- ❌ 改 `types.ts` 的签名
- ❌ 在 `scan()` 里调模型(它必须 <1s)
- ❌ 由 `select()` 凭空造 `noteId` —— 必须做白名单过滤

## 完成判据(对照 SRS 的 AC)

| 验收 | 落点 | 状态 |
|---|---|---|
| AC-A1.1 5–20 条、一论断一页 | `extract.ts` + `EXTRACT_LIMITS` | ✅ |
| AC-A1.2 缺 `paperId`/`page` 拒收 | `validateNote()` 在 `put()` 里强制执行 | ✅ |
| AC-A1.3 `kind` 五分类 | `classifyKind()` | ✅ |
| AC-A1.4 `evidence.quote` + `evidence.page` | `anchor.ts` 反查 | ✅ |
| AC-A1.5 与来源论文双向链接 | `note.paperId` + `store.listByPaper()` + `store.backlinks()` | ✅ |
| AC-A2.1/2.2 `notes.md` + frontmatter | `serializeDocument()` | ✅ |
| AC-A2.3 纯 Markdown 可 git diff | 落盘实测 14.9KB/篇,可读 | ✅ |
| AC-A2.4 KiwiFS frontmatter 兼容 | `paperId/title/notes/updated_at` 扁平标量 | ✅(待与 C 侧核对字段名) |
| AC-A3.1 关键词检索带锚点 | `scan()` 返回 `NoteHit` | ✅ |
| AC-A3.2 可被 Agent 当工具调用 | `tool.ts` → `main.ts` 注册 `knowledge_search` | ✅ |
| AC-A3.3 检索 <1s | 实测粗筛 8ms(20 条) | ✅ |
| AC-A3.4 向量检索 P2 | 未做,不阻塞 | ✅(按设计) |
| AC-A4.1 稳定可推导 paperId | `paper/parse.ts` 已产出 | ✅(上游) |
| AC-A4.2/A4.3 去重 + 日志提示 | `ingest.ts`:「命中已有,跳过」 | ✅ |
| AC-A5.1 三种关系 | `link()` + `RELATIONS` | ✅ |
| AC-A5.2 被 C 证据索引引用 | 需 C 侧按 `noteId` 查,契约已具备 | ⏳(等 C 接入) |

> 实测(ReAct,33 页):20 条知识页、locateRate 99.7%、confidence 全 high、
> 单篇 notes.md 14.9KB、粗筛 8ms、`knowledge_search` 3ms。
> 复现:`node scripts/knowledge-probe.ts --store logs/a-store --query reasoning`

## 开发时怎么不被别人卡住

`extract.ts` 只需要 `PaperDoc` **类型**(已在契约里),你可以自己造一个假 PaperDoc 开始写。
不用等 `paper/parse.ts` 完成。
