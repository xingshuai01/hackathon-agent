# src/services/skills/ — 模块 C · 技能库

| 项 | 值 |
|---|---|
| **负责人** | 同学 3 |
| **对应 Issue** | #33 #34 |
| **契约** | [`types.ts`](./types.ts) —— ★ 冻结,不可改签名 |
| **上级说明** | [`docs/STRUCTURE.md`](../../../docs/STRUCTURE.md) §3 |

## 你要做什么

把跨论文的**领域共识**固化成**可加载的判断力文件**。

```
AtomicNote[] ──generate.ts──▶ Skill(needs_review) ──人工审核──▶ active
                                                          │
                                    store.ts  ────────────┤
                                    match.ts  ────────────┤ ← 按 when_to_use 匹配任务
                                    manifest.ts ──────────┘ ← 生成注入 prompt 的清单
```

## 这个模块最想防的事:技能写成综述

| 如果写成综述 | 我们要的是判断力 |
|---|---|
| 「该领域主要有三种方法……」 | 「每个阶段:输入 → 动作 → **判据**」 |
| 通常没有「失败模式」一节 | **第 4 节失败模式 ≥3 条**,每条能让人判断"我是不是正在踩" |
| 通常没有「不要做什么」 | **第 7 节负向约束**,防模型过度发挥 |

**评审话术**:「这份技能里,哪句话是只有踩过坑的人才知道的?」——答不出来就是综述,打回重写。

## 两个必须实现的机制(照抄 Claude Code)

### ① 渐进式披露

常驻上下文的**只有元数据**(`name` + `description` + `whenToUse`),正文懒加载。
依据:`loadSkillsDir.ts:100-105` 的 `estimateSkillFrontmatterTokens` 只统计这三个字段。

### ② 1% 上下文预算

清单总预算 ≈ 8000 字符(`SKILL_MANIFEST_LIMITS`)。
超预算时:**核心技能保全文,其余压成纯名字**。
依据:`SkillTool/prompt.ts:21-40`。

## 要建的文件

| 文件 | 职责 |
|---|---|
| `store.ts` | `SkillStore` 实现,读写 `skills/<skillId>/SKILL.md`,保存前必须 `validateSkillStructure()` |
| `match.ts` | 按 `whenToUse` + `loadWhen.keywords` 匹配任务 |
| `manifest.ts` | 生成注入 prompt 的清单字符串,**含预算截断** |
| `generate.ts` | `AtomicNote[] → Skill` 草案,状态 `needs_review` |

## 禁止

- ❌ `import '../knowledge/*'` 或 `'../toolsynth/*'`
- ❌ 未经审核就置 `status: 'active'`(数据铁律 #4,校验器会拦)
- ❌ 第 4 节少于 3 条失败模式
- ❌ 把正文塞进 `manifest()`(那就是放弃渐进式披露了)

## 完成判据

- [ ] 手写 1 个真实科研技能通过 `validateSkillStructure()`
- [ ] 缺节 / 失败模式<3 条 → `incomplete`,**拒绝加载**(不是警告)
- [ ] 启动只扫元数据,日志能证明正文是懒加载的
- [ ] `manifest()` 超预算时有压缩策略
- [ ] `match()` 抽 5 个任务,≥4 次正确
- [ ] `generate.ts` 产出标 `needs_review`

## 开发时怎么不被别人卡住

`store.ts` / `match.ts` / `manifest.ts` **完全不依赖别人** —— 自己造一个 mock `Skill` 对象就能开发。
只有 `generate.ts` 需要 `AtomicNote[]`,做成函数参数接收即可,用 mock 数组开发。
