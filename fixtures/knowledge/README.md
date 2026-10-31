# fixtures/knowledge/ —— 冻结的知识库样例

> **为什么要放进仓库**:`knowledge/<paperId>/` 是派生数据,已按 `DEC-034` 加入
> `gitignore`(一条 `ingest` 命令即可重建)。但评审需要「打开就能看」的证据,
> 所以这里冻结一份**原样输出**,评委不必先跑 ingest。

| 项 | 值 |
|---|---|
| 来源论文 | `fixtures/papers/` 下 4 篇(ReAct / Transformer / BERT / RAG) |
| 生成命令 | `node src/main.ts ingest fixtures/papers --force` |
| 生成时间 | 2026-10-31T05:02Z |
| 条数 | **4 篇 × 20 条 = 80 条**原子知识页 |
| 锚点定位率 | 99.7%–100%(quote → 真实页码反查,非模型自报) |
| 隔离/失败 | 0 / 0(parseQuality 门控全部通过) |
| 内容一致性 | 与 `knowledge/<paperId>/notes.md` 逐字节一致 |
| 体积 | 88 KB |

## 怎么用

```bash
# 直接拿这份样例起 Web,不需要重新解析 PDF
KNOWLEDGE_DIR=fixtures/knowledge node src/main.ts web
# 三面板的「📚 知识库」会显示 20 条

# 或从头重建(需要 PDF,PDF 因版权不入库)
node src/main.ts ingest fixtures/papers --force
```

## 已知瑕疵(不在本文件修复范围)

- `title` 抽出为 `REAC T : SYNERGIZING REASONING AND ACTING IN LANGUAGE MODELS` ——
  PDF 文本层的字母间距导致标题被拆开。已知问题,记录在
  `docs/REVIEW-2026-10-29.md` 的「PDF 标题清洗不干净」。
- 每条 `page` **不是**模型自报的页码,而是用 `evidence.quote` 在原文分页行里
  反查出来的(实测模型自报页码 0/20 正确)。这是本项目「可验证」的核心,
  改动本文件时不要绕过 `attachPageByQuote()`。
