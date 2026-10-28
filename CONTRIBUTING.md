# 协作规范(4 天黑客松轻量版)

> 原则:**流程服务于速度**。以下规则只为降低「撞车」和「找不到东西」的成本,不做任何额外仪式。

> ## ⚠️ 写代码前必读两份
>
> | 文件 | 管什么 |
> |---|---|
> | [`AGENTS.md`](AGENTS.md) | **六条硬约束**(冻结契约 / 依赖 / any / 消息格式 / 不 throw / web 薄壳) |
> | [`docs/CODE-RULES.md`](docs/CODE-RULES.md) | 完整规则、模块边界、错误处理、AI Agent 作业协议 |
>
> **提交前必须跑 `npm run verify`**(typecheck + 规则检查 + 测试),把输出贴进 PR。
> 规则检查器(`scripts/check-rules.mjs`)会拦下:新增依赖、`any`、`enum`、越界 import、改契约签名、`page: 0` 占位等。

## 1. 任务认领

- 所有任务先建 **Issue**(用 `任务` 模板),写清验收标准。
- 要开工 → 在 Issue 上 **Assign 自己** + 打 `status: in-progress` 标签。
- 做完 → 打 `status: review` 并开 PR;PR 合并后 **关闭 Issue**(PR 里写 `Closes #12` 自动关)。
- 状态只看标签:`status: todo` → `status: in-progress` → `status: review` → 已关闭即 done。

## 2. 分支

| 分支 | 用途 |
|---|---|
| `main` | 随时可跑。只通过 PR 合入 |
| `feat/<issue号>-<短描述>` | 新功能,例 `feat/12-tool-interface` |
| `fix/<issue号>-<短描述>` | 修 bug |
| `spike/<短描述>` | 探索性代码,允许粗糙,不合入 main 也可以 |

比赛期间时间紧,允许本人模块紧急直推 `main`,但**必须在群里说一句**,且推送后 main 要能跑。

## 3. Commit

[Conventional Commits](https://www.conventionalcommits.org/) 简版:

```
<type>(<scope>): <一句话>

type: feat | fix | docs | refactor | test | chore
scope: 可选,模块名
```

例:`feat(loop): 实现 tool_use 解析与结果回填`

## 4. PR

- 小而频,一个 PR 只做一件事。**超过 400 行 diff 或 5 个文件考虑拆分。**
- 标题:`<type>(<scope>): <描述> (#issue号)`
- 描述里写 `Closes #<issue号>`,并勾选自测项。
- **必须贴 `npm run verify` 的实际输出**(typecheck + check:rules + test 三项全绿)。
- 至少 **1 人 approve** 再合;作者本人不能自己 approve。
- 合并方式:优先 **Squash merge**,保持 main 历史干净。
- **改动了「★★★ 冻结契约」文件的签名 → 一律打回**,先恢复再讨论。

## 5. 每天收工前 5 分钟

- [ ] 自己的分支已 push
- [ ] 手里的 Issue 更新了状态和一句话进展
- [ ] `main` 拉下来能跑

## 6. 禁止入库

密钥、`.env`、API token、`node_modules`、大数据集、模型权重 —— 见 `.gitignore`。
**推送前自查 `git diff --cached`**,误提交密钥要立刻轮换而不是只删文件。
