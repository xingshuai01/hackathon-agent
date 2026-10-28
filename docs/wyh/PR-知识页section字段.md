# PR 草稿 · 给 `AtomicNote` 增加可选字段 `section`

> ## ⛔ 状态：**暂不实施**（2026-10-29 复核后撤回）
>
> 撤回理由（详见 `docs/wyh/三项待拍板决策.md` §3）：
> 1. `docs/SRS.md` / `docs/SDD.md` 全文没有一条需求要求知识页记住自己出自哪一章；
> 2. C 模块的证据索引结构是 `{ claim, noteId }`（`src/services/skills/types.ts:81`），**不看章节**；
> 3. A 的验收 AC-A1.1~A5.2 也没有相关条目。
>
> 也就是说，这是个**没有需求出处的字段**，为它改冻结契约不划算。
> 保留本文仅作记录：等 Web 的「知识库」面板真要做「按章节分组浏览」时再评估。

| 项 | 值 |
|---|---|
| 目标文件 | `src/services/knowledge/types.ts`(★★★ 冻结契约 #4-A) |
| 变更类型 | **新增可选字段**(`CODE-RULES.md` 铁律 1 明确允许) |
| 需要谁点头 | 模块 A 负责人之外的 1 人 approve(契约文件头部的规则比铁律 1 更严) |
| 当前状态 | **已撤回，不要提交 PR** |

---

## 1. 变更内容

```diff
 export interface AtomicNote {
   /** 形如 `${paperId}#p${page}#${hash6}`,必须可推导,不要用随机 id */
   readonly noteId: string
   readonly paperId: string
   /** 页码锚点。**必填,不允许 0 / undefined** */
   readonly page: number
+  /**
+   * 所在章节标题(如 `3.2 METHODS`)。
+   *
+   * 为什么需要 `page` 之外再加一层:页码能定位到「第几页」,
+   * 但读者与下游要的是「第几节」。论文一页常有 2–3 个小节,
+   * 只有页码时 UI 只能跳到页首,人还得自己找。
+   *
+   * 为什么是可选:已有实现与测试不必改动;抽取时拿不到章节就留空,
+   * 不因为缺这个字段而拒绝入库(它不属于数据铁律 #1 的锚点)。
+   */
+  readonly section?: string
   readonly kind: NoteKind
```

**`validateNote()` 不增加任何检查项** —— `section` 是增强信息,不是锚点。若给它加必填校验,等于凭空抬高数据铁律 #1 的门槛,会让现有 173 个用例里的知识页全部变成非法。

---

## 2. 为什么现在需要它

| 需求 | 没有 `section` 会怎样 |
|---|---|
| SRS `AC-A1.5`「建立与来源论文的双向链接」 | 只能回到「第几页」,回不到「第几节」。双栏排版下一页有 3 个小节时,锚点形同虚设 |
| SDD §4.3「证据、复现都要能回指第几页第几节」 | 原文明确要求「第几页**第几节**」,当前契约只表达了一半 |
| C 模块 `evidenceIndex`(技能第 6 节) | 技能里引用一条证据时只能写 `p7`,审核人无法判断它出自「方法」还是「讨论」——而这两者的可信度完全不同 |
| Web 端跳转 | 只能滚动到页首 |

抽取侧**已经拿到了**这个信息:`extract.ts` 的 `Chunk` 结构里一直带着 `heading`(章节标题),只是契约里没有地方放,现在只能丢弃。

---

## 3. 落地后要改的地方(共 3 处,都很小)

| 文件 | 改动 |
|---|---|
| `src/services/knowledge/types.ts` | 加上面的可选字段 |
| `src/services/knowledge/extract.ts` | 组装 note 时写 `...section: chunk.heading`(1 行) |
| `test/knowledge/extract.test.ts` | 断言 `section` 与所在章节一致(1 个用例) |

`localMarkdown.ts` 落盘时把它写进 frontmatter(`section:` 一行),`select.ts` 的粗筛可以顺便按 section 过滤——这两处都还没写,正好一起带上,不产生返工。

---

## 4. 这个 PR 不做什么

- 不改 `noteId` 的推导规则(仍为 `${paperId}#p${page}#${hash6}`)
- 不把 `section` 变成必填
- 不动 `validateNote()` 的判定条件
- 不涉及 B/C 两个模块的任何文件
