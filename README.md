# hackathon-agent

> 4 天黑客松项目 · 团队定位:**偏工程**,目标是通过比赛系统学习 Agent 架构开发
> 仓库私有,比赛结束后再考虑公开。

---

## 当前状态

| 项 | 状态 |
|---|---|
| 仓库 / 分支 / 协作流程 | ✅ 就绪 |
| 问题跟踪(Milestones + Issues + Labels) | ✅ 就绪 |
| **选题锁定** | ⏳ 待定(D0 当天锁定) |
| MVP 骨架 | ⏳ |
| 端到端 Demo | ⏳ |

## 文档索引

| 文档 | 内容 |
|---|---|
| [`docs/PLAN.md`](docs/PLAN.md) | 四天里程碑、任务拆解、验收标准、风险 |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | 分支 / commit / PR / 任务认领规范(4 天轻量版) |
| `黑客松选题与Claude_Code技术框架(1).md` | 原始选题与技术框架参考资料 |

## 四天日程(概览)

| 日期 | 目标 | 当日交付物 |
|---|---|---|
| **D1** | 选题锁定 + 骨架跑通 | 项目脚手架、工具接口抽象、LLM 主循环能跑通一轮 tool_use |
| **D2** | 核心能力 | 2-3 个真实工具 + 子 Agent 机制 + 最小记忆 |
| **D3** | 端到端打通 | 完整 pipeline / 工作流、可复现 demo 脚本 |
| **D4** | 打磨与交付 | Demo 脚本、README/幻灯片、录屏、公开仓库清理 |

> 详细拆解见 [`docs/PLAN.md`](docs/PLAN.md);每天的任务以 GitHub Issue 为准。

## 工作方式

- **所有任务先进 Issue**,有 Issue 才有分支,PR 标题带 `Closes #<issue号>`
- `main` 保持随时可跑;每人用自己的 `feat/*` 分支,当天至少 push 一次
- 看板按 `status:` 标签过滤(见 [`CONTRIBUTING.md`](CONTRIBUTING.md))

## 本地环境

已确认可用:Node `v24.15.0`、git `2.54.0`、GitHub CLI `2.103.2`。
具体运行时依赖待选题锁定后在 `docs/PLAN.md` 补齐。

## 目录结构

```
.
├── docs/                 # 计划与设计文档
├── .github/              # Issue / PR 模板
└── 黑客松选题与Claude_Code技术框架(1).md   # 参考资料
```

> 代码目录待 D1 骨架落地后补充。
