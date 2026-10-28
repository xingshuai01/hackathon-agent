# skills/ — C 模块产物:技能文件

| 项 | 值 |
|---|---|
| **负责人** | 同学 3(模块 C) |
| **由谁写** | `generate.ts` 产出草案 + **人工审核后**由 `store.ts` 落盘 |
| **入库?** | ✅ **必须入库**(技能是长期资产,是 D4 演示的重点) |

## 布局

```
skills/
├── _index.json                   # 技能清单(元数据,供 manifest() 快速读取)
└── <skillId>/
    └── SKILL.md                  # 七节结构,见下
```

> ⚠️ **只支持目录形式** `<skillId>/SKILL.md`。依据:`loadSkillsDir.ts:407-431`,
> 单文件 `.md` 不被接受。

## SKILL.md 格式

```markdown
---
name: 低资源语言 RAG 研究
domain: NLP / Retrieval-Augmented Generation
version: 1.0
description: 低资源语言检索增强研究的方法与陷阱
when_to_use: 当用户询问低资源语言的检索增强、跨语言检索、或 XNLI 复现时使用
allowed-tools: [arxiv_search, knowledge_search, extract_metric]
load_when:
  keywords: [低资源, low-resource, 跨语言, XNLI]
  task_types: [literature_review, experiment_plan]
status: active
reviewed_by: <审核人>
---

# 一、领域地图(10–20 个节点,≤20)
- 检索增强生成(RAG)
- 稠密检索 / 稀疏检索
- 跨语言嵌入对齐
- 低资源迁移

# 二、标准流程(每阶段必须有【判据】)
## 阶段 1:明确任务边界
- 输入:用户的问题
- 动作:确认语种范围、目标任务
- **判据**:若未给出语种,必须先问,不得假设

# 三、方法 → 工具映射(工具必须真实存在于 registry)
| 方法 | 工具 |
|---|---|
| 指标抽取 | `extract_metric` |

# 四、常见失败模式(≥3 条,最有价值的一节)
1. 把跨语言检索和跨语言生成混为一谈 —— 评测指标完全不同
2. 忽略低资源数据集的数据泄漏 —— 测试集与训练集有重叠
3. XNLI 的 zero-shot 与 translate-train 不可直接比较

# 五、术语消歧
- "alignment":嵌入语境指空间对齐,RLHF 语境指偏好对齐

# 六、证据索引(指向 knowledge/ 里的真实 noteId)
- 跨语言对齐提升 4.2 点 → `p3f8a2c1#p7#a91f3e`

# 七、不要做什么(负向约束)
- 不要在没有确认语种的情况下给出结论
- 不要引用未标注页码的实验数字
```

## 三条铁律

1. **七节缺一即 `incomplete`,拒绝加载**(不是警告)
2. **第 4 节失败模式不少于 3 条**
3. **未经人工审核不得 `status: active`**(数据铁律 #4)

## 评审话术

> 「这份技能里,哪句话是只有踩过坑的人才知道的?」
> 答不出来 → 这是综述,不是技能,打回重写。

## 不该出现在这里的

- ❌ 论文摘要(那是知识库的事)
- ❌ 通用编程技巧(技能必须**领域特定**)
