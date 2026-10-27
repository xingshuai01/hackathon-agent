# hackathon-agent

> 4 天黑客松项目 · 团队定位:**偏工程**,目标是通过比赛系统学习 Agent 架构开发
> 仓库私有,比赛结束后再考虑公开。

## 我们在做什么

**一个会"长大"的科研 Agent。**

你给它一批同领域论文,它不只是回答问题,而是把论文**沉淀成三类可复用资产**:记住了什么(知识库)、能做什么(工具库)、该怎么判断(技能库)。下次遇到同类任务,它直接用这些资产干活,而不是从头读一遍。

| 模块 | 沉淀什么 | 一句话 | 状态 |
|---|---|---|---|
| **A 个人知识库** | 事实与论断,带页码锚点 | 记「**是什么**」 | ⏳ 未开始 |
| **B 工具库** | 从论文抽出的可执行工具 | 做「**怎么做**」 | ⏳ 未开始 |
| **C 技能库** | 领域流程、判据、失败模式 | 判「**该做什么**」 | ⏳ 未开始 |

**相对普通 Agent 的差异**:Claude Code 的 40+ 工具全部由人手写,我们的工具**从论文里长出来** —— 这是真增量。

## 当前状态

| 项 | 状态 |
|---|---|
| 选题与产品方向 | ✅ 已锁定(科研 Agent + 三模块) |
| 交付形态 | ✅ 已定:**Web 可视化界面**(CLI 保留为兜底) |
| 文档(需求 / 设计 / 决策) | ✅ 就绪 |
| 仓库 / Issue / 标签 / 里程碑 | ✅ 就绪 |
| **代码** | ⏳ **0 行 —— 代码尚未开始** |

## ✅ 关键技术选型已全部敲定

| 项 | 结论 |
|---|---|
| LLM | **DeepSeek**(`deepseek-v4-pro` 主 + `deepseek-flash` 便宜活),**API Key 由每人自填**到自己的 `.env` |
| 调用方式 | OpenAI 兼容接口,**Node 原生 `fetch`,零 SDK 依赖** |
| 交付形态 | **Web 可视化界面**(SSE 实时推送),CLI 为兜底 |
| 知识库存储 | **自研** `LocalMarkdownStore` —— `kiwi` 是架构不是产品,不引入外部依赖 |
| 三个模块命名 | 个人知识库 / 工具库 / 技能库 |

## ⚠️ 唯一待确认

| 编号 | 问题 | 期限 | 未确认时的默认 |
|---|---|---|---|
| **Q4** | **团队分工**(谁负责哪块?) | D1 12:00 | 按 [`docs/SDD.md`](docs/SDD.md) §13.4 的 3 人分工执行 |

## 文档索引

**先读这三份,顺序不要颠倒:**

| 文档 | 回答什么 | 篇幅 |
|---|---|---|
| **[`docs/DECISIONS.md`](docs/DECISIONS.md)** | **为什么是这样**(31 条决策 + 备选方案 + 演进记录) | 短,先扫一遍 |
| **[`docs/SRS.md`](docs/SRS.md)** | **做什么**(功能需求 FR-A~F + 验收标准 + 里程碑) | 长,查用 |
| **[`docs/SDD.md`](docs/SDD.md)** | **怎么做**(架构 / 契约 / 数据模型 / 主循环 / 三模块 / Web 薄壳 / 开发计划) | 长,查用 |

其余:

| 文档 | 内容 |
|---|---|
| **[`AGENTS.md`](AGENTS.md)** | **AI 编码工具必读** —— 六条硬约束速查(契约/依赖/any/消息格式/不 throw/薄壳) |
| **[`docs/CODE-RULES.md`](docs/CODE-RULES.md)** | **代码编写规则** —— 十条铁律、模块边界、错误处理、AI 作业协议、检查器映射表 |
| [`docs/PLAN.md`](docs/PLAN.md) | 早期四天计划(部分内容已被 SRS/SDD 取代) |
| [`docs/wyh/`](docs/wyh/) | 队友方案:仓库分析建议 / 代码开发规范 / 需求可行性分析 |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | 分支 / commit / PR / 任务认领规范 |
| [`docs/reference/claude-code-architecture.md`](docs/reference/claude-code-architecture.md) | Claude Code 架构分析(原始参考资料) |
| `.env.example` | 环境变量清单,复制为 `.env` 后填写 |

## 契约文件(冻结,改动需 PR)

代码已起步:`src/` 下有 **6 个冻结契约文件**,任何人(含 AI)不得改其既有签名。

| 契约 | 管什么 |
|---|---|
| `src/ui/events.ts` | 9 种 Agent 事件 + EventBus(CLI/Web 共用的唯一接口) |
| `src/tools/types.ts` | Tool 接口、fail-closed 能力位、三段式调用管线 |
| `src/agent/types.ts` | Message(DeepSeek 格式)、5 种终止 reason、并发分区 |
| `src/services/knowledge/types.ts` | AtomicNote、KnowledgeStore、锚点校验 |
| `src/services/skills/types.ts` | Skill 七节结构、SkillStore、结构校验 |
| `src/services/paper/types.ts` | PaperDoc、解析质量门控 |

```bash
npm run verify   # typecheck + 规则检查 + 38 个契约测试
```


## 四天日程

| 日期 | 主线 | 完成判据 |
|---|---|---|
| **D1** | 契约 + 底座 + 主循环 + 事件总线 | 主循环跑通一轮;1 篇论文能出 `PaperDoc` |
| **D2** | A 知识库闭环 + B 首个工具 + Web 骨架 | 产出 ≥5 条知识页可检索;≥1 个工具 active;浏览器能看到流式输出 |
| **D3** | C 技能库 + 三层贯通 + 三个可视化面板 | 一条命令跑通「沉淀 → 消费」;三面板实时显示资产增长 |
| **D4** | 打磨与交付 | 三模块各自可独立演示;Web 崩了能秒切 CLI |

**四个硬检查点**(过不了就按 SRS §3.3 的裁剪顺序降级):

| 时点 | 检查 |
|---|---|
| D1 10:00 | 每人用自己的 key 调通一次 LLM API |
| D1 12:00 | Q0/Q1/Q2/Q4 关闭 + 三个冻结契约合入 main |
| D2 17:00 | A 知识库闭环跑通 |
| D3 17:00 | 一条命令跑通完整链路 |

## 工作方式

- **所有任务先进 Issue**,有 Issue 才有分支,PR 标题带 `Closes #<issue号>`
- `main` 保持随时可跑;每人用自己的 `feat/*` 分支,当天至少 push 一次
- 看板按 `status:` 标签过滤(见 [`CONTRIBUTING.md`](CONTRIBUTING.md))
- **三个冻结契约**(`tools/types.ts`、`agent/types.ts`、`knowledge/types.ts`、`ui/events.ts`)改动需 PR + 1 人 approve

## 本地环境

| 项 | 状态 |
|---|---|
| Node | `v24.15.0`(支持直接跑 `.ts`,免构建) |
| git | `2.54.0` |
| GitHub CLI | `2.103.2`(位于 `.tools/bin/gh.exe`,已 gitignore) |
| 代理 | 需配 `http://127.0.0.1:7892` —— **命令行工具不读 Windows 系统代理** |

> ⚠️ 项目路径含空格(`hacthon pro`),所有脚本路径必须加引号。
> 详细环境约束见 [`docs/SDD.md`](docs/SDD.md) §12.3。

## 目录结构

```
.
├── docs/
│   ├── DECISIONS.md                   # 决策台账
│   ├── SRS.md                         # 需求说明书
│   ├── SDD.md                         # 设计开发文档
│   ├── PLAN.md                        # 早期四天计划
│   ├── wyh/                           # 队友方案文档
│   └── reference/
│       └── claude-code-architecture.md
├── .github/                           # Issue / PR 模板
├── .env.example                       # 环境变量清单
├── data/                              # 原始论文与大文件(仅 README 入库)
├── fixtures/                          # demo 回放数据(必须入库)
└── claude-code-main/                  # ⛔ 第三方参考源码,已 gitignore,绝不入库
```

> 代码目录(`src/`、`web/`)待 D1 落地后补充,详见 [`docs/SDD.md`](docs/SDD.md) §11。
