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

## 要建的文件

| 文件 | 职责 |
|---|---|
| `extract.ts` | `PaperDoc → AtomicNote[]`。**一论断一页**,每页必带 `page` |
| `localMarkdown.ts` | `KnowledgeStore` 的**唯一实现**。纯 Markdown + frontmatter |
| `index.ts` | 生成 `INDEX.md`,截断 120 行 / 15KB(`INDEX_LIMITS`) |
| `select.ts` | 两段式检索:段 1 本地关键词粗筛,段 2 调 `sideQuery` 精筛 |

## 三条必须遵守的

1. **入库前必须调 `validateNote()`** —— 它把「无锚点不入库」做成了函数,别绕过去
2. **不要按 token 切片** —— 按「一个可独立引用的论断」切。按 token 切会把论文炸成上百碎片,引用断链
3. **不引入向量库** —— 检索靠「关键词粗筛 + LLM 精筛」(DEC-010)。这是省掉 embedding 成本和向量库依赖的关键

## 禁止

- ❌ `import '../skills/*'` 或 `'../toolsynth/*'`(检查器会拦)
- ❌ 改 `types.ts` 的签名
- ❌ 在 `scan()` 里调模型(它必须 <1s)
- ❌ 由 `select()` 凭空造 `noteId` —— 必须做白名单过滤

## 完成判据

- [ ] 单篇产出 5–20 条知识页,每条 `page` 非空
- [ ] `validateNote()` 拦得住无锚点 / 描述过短
- [ ] 落盘格式:纯 Markdown + frontmatter,可 git diff
- [ ] 粗筛 <1s;精筛 ≤8 条
- [ ] 同一 `paperId` 重复入库默认跳过(`--force` 覆盖)

## 开发时怎么不被别人卡住

`extract.ts` 只需要 `PaperDoc` **类型**(已在契约里),你可以自己造一个假 PaperDoc 开始写。
不用等 `paper/parse.ts` 完成。
