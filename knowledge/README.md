# knowledge/ — A 模块产物:知识页

| 项 | 值 |
|---|---|
| **负责人** | 同学 1(模块 A) |
| **由谁写** | `src/services/knowledge/localMarkdown.ts`,**不要手写** |
| **入库?** | ✅ **必须入库**(队友 clone 后要能直接 `ask`,不用重新 ingest) |

## 布局

```
knowledge/
├── INDEX.md                      # 索引,会被拼进 system prompt(截断 120 行 / 15KB)
├── _index.json                   # 机器可读索引(paperId → noteIds)
└── papers/
    └── <paperId>/
        ├── meta.md               # frontmatter: title / authors / year / parseQuality
        └── notes.md              # 原子知识页,每条一个 ## 小节
```

## notes.md 的单条格式

```markdown
## {noteId}

---
noteId: p3f8a2c1#p7#a91f3e
paperId: p3f8a2c1
page: 7
kind: result
confidence: high
createdAt: 2026-10-28T01:00:00.000Z
---

低资源语言的 RAG 在检索阶段引入语言对齐嵌入,XNLI 上比基线提升 4.2 个点。

**证据**:> "our approach improves XNLI accuracy by 4.2 points (Table 3, p.7)"
**出处**:@p3f8a2c1 p.7 §5.2
```

## INDEX.md 的单行格式

```markdown
- [p3f8a2c1#p7] 低资源 RAG 在 XNLI 上比基线 +4.2 — result
```

## 三条铁律(违反即返工)

1. **每条必带 `paperId` + `page`**,无锚点的不得入库(数据铁律 #1)
2. **一个论断一条**,不要把整段摘要塞进来
3. **`description` 必须能独立看懂** —— 它是召回依据,不是标题

## 不该出现在这里的

- ❌ 原始论文 PDF(放 `data/`)
- ❌ 解析失败的论文(应被标 `quarantined` 并跳过,绝不产出垃圾知识页)
- ❌ 运行日志(放 `logs/`)
