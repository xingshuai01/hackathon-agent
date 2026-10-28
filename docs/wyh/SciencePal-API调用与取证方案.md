# SciencePal API 调用与取证方案

> 回答三个问题:**该调哪些 API、需要什么凭证、怎么留下不可否认的调用证据。**
> 依据:实测 `https://sciencepal.ai/openapi.json`(OpenAPI 3.1,293 个端点)+ 鉴权探测。

| 项 | 值 |
|---|---|
| 版本 | v1.1 · 2026-10-28(新增 §0 赛事硬要求) |
| 适用范围 | 四层能力分配见 §1.1:C 全权交,A/B 只交「读」不交「存」,骨架瘦身保留 |
| 前置结论 | 平台**有**自有 REST API(非 OpenAI 兼容形状),需 Access Key |

---

## 0. 赛事硬要求(先看这个,它约束下面所有取舍)

来源:`https://sciencepal.ai/hackathon`(2026-10-28 读取)

| # | 原文 | 对我们的约束 |
|---|---|---|
| 1 | "以 SciencePal 为**主要创作平台**……打造可运行、可展示、可验证的科研 Agent、工具、工作流或应用原型" | 作品的运行时必须在它上面,不能只有本地系统 |
| 2 | "**至少一个核心环节实质性使用** SciencePal。**仅用于撰写介绍、润色文案或制作 PPT,不构成有效使用**" | "用它写代码 / 跑测试"不算核心环节 |
| 3 | 提交物②:"可运行作品链接——可正常访问和演示的 **SciencePal 项目、Agent 或工作流链接**" | **必须在它里面有可访问实体**,评审期间打得开 |
| 4 | 评审·创新性:"AI 与 SciencePal 是否进入**核心工作**,而非只增加技术复杂度或 Token 消耗" | 堆调用不加分,反而扣分 |
| 5 | 评审三维度:科学价值 / 创新性 / 可行性(资格与合规审查**先于**评分) | 合规不过=不进评分 |
| 6 | "**1–3 人 / 队**" | ⚠️ `STRUCTURE.md` 写的是 4 人,须核对报名信息 |
| 7 | 声明:"区分**赛前已有成果**与赛事期间新增成果" | 现有 2043 行代码 + 4 份文档须声明为赛前 |
| 8 | 截止 **10 月 31 日 23:59(UTC+8)**,提交入口为腾讯问卷 | 从 10-28 起算,只剩 3 天 |

### 0.1 使用程度四级(自查用)

| 级别 | 形态 | 判定 |
|---|---|---|
| **L0** | 只写文案 / PPT / 帮跑测试 | **不合格**(原文点名排除) |
| **L1** | 某环节由它的 agent 完成,但产物留在本地 | 勉强,易被判"未进入核心工作" |
| **L2** | 产物沉淀进它(skills / 知识)+ 有可访问 Agent 链接 + 现场能跑 | **目标线** |
| **L3** | L2 + 可复现材料(`audit/export`、工作流导出、replay) | 加分项 |

**结论:必须做到 L2。** 组员目前的做法是 L1 偏 L0(测试跑在它里面,产物在本地),差一步。

### 0.2 提交清单 → 我们的产出 → 对应端点

| 提交项 | 我们要交什么 | 靠什么产出 |
|---|---|---|
| ① 项目基本信息 | 名称、简介、科学问题、目标用户 | 本地文档 |
| ② **可运行作品链接** | SciencePal 里一个可访问的 Agent(或项目/工作流) | `POST /api/agents` → `publish`(或分享 thread) |
| ③ 演示视频 + ≤5 页说明 | 技术方案、创新点、验证结果、局限、计划 | 本地 + `audit/export` 当验证材料 |
| ④ 原创性与资源使用声明 | 模型/数据/代码/API 清单,赛前 vs 赛中 | 本项目 `git log` + 本文档 §3 端点清单 |
| 加分:代码仓库 | 就是本仓库 | — |
| 加分:Agent 配置/工作流导出 | Agent 配置 JSON + 技能包 | `GET /api/agents/{id}`、`GET /api/skills/items/{id}/download` |
| 加分:可复现实验材料 | `logs/runs/` + `fixtures/` + replay | §5 三层证据 |

---

## 1. 一句话结论

**只需要 1 个凭证(Access Key)、必须打通 9 个端点、证据分 3 层落在仓库里。**

三条都不能省:
- 少了凭证 → 退回人肉粘贴,不可复现;
- 少了 9 个端点里的 `agent/initiate` + `stream` → 只能算"用过一次",不算"核心环节";
- 少了证据 → 评委无法验证,等于没做。

---

## 1.1 四层能力分配:为什么 C 是主链路

不是"C 更重要",而是**平台能力的形状决定的**。三条判据,按顺序问,任一不过就降级:

1. **产物是不是平台原语?** 是 → 可全权交;不是 → 只交"生成",存储自己管
2. **是否需要平台外的状态?**(文件树 / 页码锚点 / git / 版本锁) 是 → 留在本地
3. **失败会不会静默?**(跑通了但结果错) 会 → 必须本地校验 + 人工确认

| 层 | 平台给什么 | 缺什么(已核实) | 结论 | 理由 |
|---|---|---|---|---|
| **C 技能** | `POST /api/skills/items` 直接收 `body_markdown`;`/import` 收技能包;`quality-scores`、`evolution-*` 现成 | 只缺"谁来蒸馏、谁来审核" | **主链路** | 产物就是平台原语,存储/版本/质量分全部托管 |
| **A 知识** | `agent/initiate` 带 PDF 精读;`/api/search` 全文检索 | **没有知识库原语**:`knowledge-base` 只有 4 个端点,本质是"连一个外部 RAGFlow"(需 endpoint + key);全站无 dataset / chunk / 原子页 API | 交"读",不交"存" | 切片与页码锚点平台不提供,自建才有可验证性 |
| **B 工具** | 沙箱完整:21 个端点,`files` CRUD + `terminal/connect` + `snapshots` + `tool-policy` + `tool-approvals` | **不能注册 MCP**:`/api/mcp/*` 5 个端点全为只读;工具只能建 agent 时用 `configured_mcps` / `custom_mcps` / `agentpress_tools` 声明 | 交"执行",不交"定义" | 失败易静默,必须本地 smoke + 契约校验 |
| **骨架** | `agent-run` 就是 loop;`token_budget` 就是 budget;`handoff` + `tool-policy` 部分对应 subagent | 没有"结果 → 原子页/技能"的转换层 | **瘦身保留**,见 §1.2 | 编排层是不可替代部分 |

## 1.2 骨架的三种含义,只有一种该保留

| 理解 | 能不能交 | 结论 |
|---|---|---|
| 骨架作为**运行时**(`loop` / `subagent` / `budget`) | 能,技术成立 | 交给 `agent-run`;`loop.ts`、`subagent.ts` 删除 |
| 骨架作为**代码产出**(让它的 agent 写 `loop.ts`) | 能,但没用 | 这是"用 AI 写代码",不是"接入平台";证据强度等同任意编码助手 |
| 骨架作为**编排层**(run 结果 → 锚点 / 契约 / 质量门 / 落盘) | **不能交** | 唯一不可替代的部分,删了项目只剩 Web 壳 |

瘦身结果(20 个待实现文件 → 约 7 个,省约 2 天,留下的全是自己的):

```
main.ts                 保留   CLI: ingest / ask / tools doctor / web
agent/registry.ts       保留   本地工具 + B 生成工具的注册
agent/prompt.ts         保留   改为 composePrompt():产出发给 SP 的 prompt
agent/budget.ts         简化   只算 token_budget 与截断,不做分段压缩
agent/loop.ts           删除   → services/sciencepal/runner.ts(发起 + 收流 + 落盘)
agent/subagent.ts       删除   需要并行就开多个 thread / run
services/llm/*          删 3 留 1:只留 stream.ts,改为解析 SP 的 SSE
services/paper/parse.ts 删除   PDF 交给 SP
```

> ⚠️ 一处未核实:如果网页里能看到"知识库 / 上传资料 / 切片"这类入口,它可能来自另一个服务的 API(未包含在这份 `openapi.json` 里)。遇到这种情况,抓一次浏览器请求就能确认 —— 在确认之前,A 的存储层不要压在平台上。


## 1.3 两条链路:别把「用它开发」和「系统调它」混为一谈

组员之前做的事,和我建议的事,其实不在同一条链路上。混着说就会得出"要么全用、要么没用"的错误结论。

| 链路 | 具体做什么 | 有没有意义 | 算不算"实质性使用" |
|---|---|---|---|
| **开发链路** | 把仓库传进 workspace,让它的 agent 读契约、改代码,在沙箱里跑 `npm test`,再把文件拉回来 | **有**,能省半天到一天,而且可以正式化 | **不算**。它证明的是"我们在 SP 上开发",不是"我们的系统调用了 SP" |
| **运行链路** | 项目代码里用 `Authorization: Bearer` 调 `agent/initiate`、`skills/items`、`sandbox` | 有,而且这是"实质性使用"的唯一落点 | **算** |

### 开发链路怎么正式化(四步,替代人肉粘贴)

```bash
# 1) 把仓库传进去(或先打 zip)
POST /api/workspace/files/upload          # multipart
# 2) 起 run,prompt 里给契约路径 + 验收命令
POST /api/agent/initiate                  # "读 src/agent/types.ts,实现 loop.ts,跑 npm test"
# 3) 沙箱内跑测试
GET  /api/thread/{thread_id}/sandbox
POST /api/project/{project_id}/sandbox/terminal/connect
# 4) 拉回改动 + 导出审计
GET  /api/workspace/files/content
GET  /api/agent-run/{agent_run_id}/audit/export
```

这就是组员做法的升级版:**同样的目的,但从"粘提示词"变成"有调用记录、有审计、可复现"**。

> 两条链路的证据必须**分开存放**:开发链路进 `docs/evidence/dev/`,运行链路进 `logs/runs/`。混在一起,评委第一个问题就是"这到底是你们的系统在调用,还是你们在用它当 IDE"。

## 1.4 本项目里 SP 具体承担哪 6 件事

11 个环节,把"平台擅长的"和"只有你能做的"分开:

| # | 环节 | 谁做 | 端点 / 文件 | 产出 |
|---|---|---|---|---|
| 1 | 论文精读 | **SP** | `agent/initiate` + `files[]` | 结构化精读结果 |
| 2 | 论断原子化 + 页码锚点 | 本地 | `knowledge/extract.ts` | `AtomicNote` |
| 3 | 方法抽取 | **SP** | 同一个 run,换 prompt | `MethodSpec` 草案 |
| 4 | 工具生成 | 本地 | `toolsynth/render.ts`(模板填充) | `Tool` 代码 |
| 5 | 工具体检 | **SP 沙箱** | `sandboxes/{id}/files` + `terminal` | smoke 结果 |
| 6 | 技能蒸馏 | 本地 | `skills/generate.ts`(已有 981 行) | `SKILL.md` 草案 |
| 7 | 技能存储 / 质量分 / 进化 | **SP** | `skills/{items,quality-scores,evolution-*}` | `skill_id` + `content_hash` |
| 8 | 专家 agent 组装 | **SP** | `agents` + `PUT /agents/{id}/skills` | 可对话的领域专家 |
| 9 | 效果验证 | **SP** | `thread/{id}/messages` + `agent/start` | 加载前后准确率 |
| 10 | 过程留证 | **SP + 本地** | `audit/export` + `logs/runs/` | manifest + replay |
| 11 | 可视化 | 本地 | `web/` | 三面板 |

**SP 承担 6 件:读、抽、跑、存、审、验。本地承担 5 件:锚点、契约、生成、留证、可视化。**

边界很硬:凡是"平台有原语"的给它(技能、沙箱、审计),凡是"需要平台外状态"的留本地(页码锚点、工具契约、Git)。

---

## 2. 需要你提供的凭证(只要一个)

| 项 | 内容 |
|---|---|
| **必需** | `SCIENCEPAL_API_KEY` = 在 sciencepal.ai 生成 Access Key 后的 `sp_...` 字符串 |
| **不需要** | 账号密码、登录 cookie、浏览器会话 |
| **可选** | `SCIENCEPAL_BASE_URL`(默认 `https://sciencepal.ai`,一般不用改) |
| **暂不需要** | RAGFlow 的 `endpoint` + `key`(见 §7 风险 2) |
| **可以删掉** | `DEEPSEEK_API_KEY` —— 主链路改走 SciencePal 后,仅 `sideQuery` 结构化抽取可能还需要 |

### 怎么生成

1. 登录 sciencepal.ai → 设置 / 开发者 / Access Keys
2. Create,`name` 填 `hackathon-agent`(≤80 字符)
3. **`expires_in_days` 填 30,不要用默认的 90** —— 比赛结束即失效,减少泄露面
4. 复制 `sp_...`(只显示一次)

### 怎么放

写入 `D:\XHH\hackathon-agent\.env`,不要写进任何 `.ts`、`.md`、代码块或聊天记录:

```bash
SCIENCEPAL_API_KEY=sp_xxxxxxxx
SCIENCEPAL_BASE_URL=https://sciencepal.ai
```

`.env` 已在 `.gitignore` 第 3 行,不会入库。

### 鉴权形状(已实测)

```http
Authorization: Bearer <SCIENCEPAL_API_KEY>
```

探测证据:同一端点,无头返回 `401 "No valid authentication credentials found"`,带假 Bearer 返回 `401 "Invalid authentication credentials"` —— 说明 Bearer 被识别。

---

## 3. 必须调用的 9 个端点(P0 主链路)

对应"PDF 进去 → 技能出来 → 绑给专家 Agent → 验证效果"这一个闭环。

| # | 端点 | 用途 | 落点 | 关键参数 / 请求体 |
|---|---|---|---|---|
| 1 | `GET /api/agents` | 验证 key 有效 + 看可见 agent 目录 | 探活 | `page/limit/search` |
| 2 | `POST /api/agent/initiate` | **起一次 run**(直接带 PDF) | C 核心 | `multipart`: `prompt`、`files[]`、`agent_id`、`token_budget` |
| 3 | `GET /api/agent-run/{id}/stream` | 收流式过程 | 证据 | `token`(query!)、`after_index` |
| 4 | `GET /api/agent-run/{id}` | 步数 / 耗时 / 状态 / token | 指标 | — |
| 5 | `GET /api/agent-run/{id}/audit/export` | **导出审计** | 硬证据 | `format=json\|csv` |
| 6 | `POST /api/skills/items` | 把蒸馏结果写回它 | C 沉淀 | `description` + `body_markdown`(必填) |
| 7 | `GET /api/agent-run/{id}/skills` | 确认 run 实际加载了哪些技能 | 校验 | — |
| 8 | `POST /api/agents` | 建"领域专家"agent | 演示主体 | `name` + `system_prompt`(必填) |
| 9 | `PUT /api/agents/{id}/skills` | 把技能绑给该 agent | 闭环 | 技能 id 列表 |

### 关键请求体形状(已从 OpenAPI 核实)

```jsonc
// POST /api/agents  (必填只有两个)
{ "name": "蛋白设计专家", "system_prompt": "你是……" }

// POST /api/skills/items  (必填两个)
{ "description": "一句话触发条件", "body_markdown": "## 1. 适用场景\n……" }

// POST /api/thread/{thread_id}/messages
{ "message_id": "<uuid>", "content": "用户问题" }
//   message_id 自己生成 UUID,重试时复用同一个 = 幂等,不会重复起 run

// POST /api/thread/{thread_id}/agent/start
{ "agent_id": "...", "enable_thinking": false, "reasoning_effort": "low",
  "token_budget": 200000, "stream": true, "web_search_on": false }
```

### 增量端点(P1/P2,有余力再做)

| 端点 | 模块 | 说明 |
|---|---|---|
| `POST /api/workspace/files/upload` | A | 批量传 PDF 到 workspace |
| `GET /api/search?q=&scope=` | A | 检索验证(keyword 高亮片段) |
| `GET /api/mcp/servers` | B | 看可用工具源 |
| `POST /api/sandboxes/{id}/files` | B | 把生成工具放进沙箱跑 smoke |

---

## 4. 一次完整 run 的时序(curl 版,可直接照抄验证)

```bash
BASE=https://sciencepal.ai
KEY=$(grep '^SCIENCEPAL_API_KEY=' .env | cut -d= -f2)

# 1) 探活:key 是否有效、可见范围
curl -s -H "Authorization: Bearer $KEY" "$BASE/api/agents?limit=5"

# 2) 起 run(multipart,带 1 篇 PDF)
curl -s -X POST -H "Authorization: Bearer $KEY" \
  -F "prompt=按七节结构抽出一份领域技能草案,只输出 JSON" \
  -F "files=@fixtures/papers/sample.pdf" \
  -F "token_budget=200000" \
  "$BASE/api/agent/initiate"
# → 返回 thread_id / agent_run_id,记下来

# 3) 收流(注意:token 走 query,不是 header)
curl -sN -H "Authorization: Bearer $KEY" \
  "$BASE/api/agent-run/$RUN_ID/stream?token=$KEY&after_index=0" \
  | tee logs/runs/$RUN_ID/stream.ndjson

# 4) 拿指标
curl -s -H "Authorization: Bearer $KEY" "$BASE/api/agent-run/$RUN_ID"

# 5) 导出审计(硬证据)
curl -s -H "Authorization: Bearer $KEY" \
  "$BASE/api/agent-run/$RUN_ID/audit/export?format=json" \
  -o logs/runs/$RUN_ID/audit.json
```

> `stream` 的 `token` 是 **query 参数**,因为浏览器的 EventSource 不能设 header。这带来一个必须处理的问题,见 §5.3。

---

## 5. 怎么保留调用证据(三层)

### 5.1 目录结构

```
logs/runs/<runId>/                 # 不入库,但演示时现场生成
├── request.jsonl                  # 每个请求一行:method/path/status/耗时/(脱敏后)headers
├── stream.ndjson                  # 原始 SSE 帧,含 seq 序号,保序
├── run.json                       # 步数、耗时、token、状态(GET /agent-run/{id})
├── audit.json                     # audit/export 导出件
└── manifest.json                  # 汇总 + 哈希链

fixtures/sciencepal/               # ★ 入库,断网回放用
├── agents_list.json
├── run_<场景>.stream.ndjson
├── run_<场景>.audit.json
└── run_<场景>.manifest.json

docs/evidence/                     # ★ 入库,人看的
├── README.md                      # 索引:哪条证据证明哪句话
└── 2026-10-28-thread-e1ecbce2.md  # 组员那次 34 步 run 的固化记录
```

### 5.2 manifest.json 的形状(哈希链)

```jsonc
{
  "runId": "…",
  "threadUrl": "https://sciencepal.ai/projects/…/thread/…",
  "startedAt": "2026-10-28T11:40:00Z",
  "steps": 34, "durationMs": 486000, "tokens": 183422,
  "inputSha256": { "sample.pdf": "9f2c…" },
  "outputSha256": { "skills/protein-design/SKILL.md": "1a7b…" },
  "platformHashes": { "skillContentHash": "…", "skillPackageHash": "…" },
  "gitCommit": "…",
  "evidence": ["stream.ndjson", "audit.json", "audit/export"]
}
```

`inputSha256` / `outputSha256` 的作用:**证明"进去的 PDF"和"出来的技能"与仓库里那份是同一份**。没有这层,评委只能信你的说法。

`platformHashes` 来自 `POST /api/skills/items` / `/api/skills/import` 的返回(`content_hash`、`package_hash`)——**这是平台自己算的**,比你自己算的可信。

### 5.3 脱敏(必须做,否则证据本身就泄密)

| 位置 | 处理 |
|---|---|
| `Authorization` 头 | 写 `<redacted>` |
| **`stream?token=` query** | **必须替换为 `<redacted>`** —— 否则 key 会原样落进 `stream.ndjson` 和终端输出 |
| `audit.json` | 导出后扫一遍是否含 key / 个人邮箱,再入库 |
| 截图 | 遮蔽左侧会话列表(可能含他人项目名) |

建议:客户端里对 URL 统一做 `redact(url)` 再落盘,而不是靠人记得。

---

## 6. 证据怎么被机械校验(对齐项目现有门禁)

项目已有 `check-rules.mjs` 的风格,建议加一条 `check:evidence`:

- [ ] `docs/evidence/` 里每个 `runId` 都能在 `fixtures/sciencepal/` 找到对应 `manifest.json`
- [ ] 每个 manifest 的 `stream.ndjson` 与 `audit.json` 都存在且非空
- [ ] `stream.ndjson` 与 `request.jsonl` 中**不含** `sp_` 开头的字符串(防泄露)
- [ ] 每个 manifest 的 `inputSha256` 能在 `fixtures/papers/` 里对上
- [ ] `DEMO_MODE=replay` 时,`npm run demo` 零网络请求仍能跑完

前四条是二值判断,能进 CI;第五条是演示兜底。

---

## 7. 已知风险(3 条,都要提前应对)

| # | 风险 | 应对 |
|---|---|---|
| 1 | **内部 API 无版本承诺**,字段可能变 | 全部响应录进 `fixtures/`,`replay` 模式不依赖线上形状;客户端用宽松解析(只取用到的字段) |
| 2 | `/api/knowledge-base/connections` 是 **RAGFlow 连接**(需 endpoint + key),不是它自带的知识库 | A 的知识库**不要押在这上面**;先在 workspace 里放 PDF,用 `/api/search` 验证检索即可 |
| 3 | `agent/initiate` 会消耗真实 token 额度 | 每次显式设 `token_budget`(如 200000),不要留空;开发期先用短 prompt 探活 |

### 待验证(拿到 key 后 10 分钟内可确认)

- [ ] Access Key 能否调 `POST /api/agent/initiate`(普通用户是否被限权)
- [ ] `audit/export` 对**自己的** run 是否开放(而不是仅管理员)
- [ ] `POST /api/skills/items` 的 `scope` 是用户级还是全局(影响"写进去会不会被别人看见")
- [ ] `stream` 是否必须带 `token` query,还是 header 也认

---

## 8. 与现有模块的对接点

| 现有资产 | 改动 | 工作量 |
|---|---|---|
| `src/services/skills/{store,match,markdown,generate}.ts`(981 行,58 测试) | 新增 `store.ts` 的 `syncToPlatform()`:本地写完后调 `POST /api/skills/items`,把返回的 `content_hash` 写进 frontmatter | 小 |
| `src/services/knowledge/types.ts` | 不动,`AtomicNote.locator` 仍是自建页码锚点 | 0 |
| `src/services/trace/`(未实现) | 直接复用为 `logs/runs/<runId>/` 的写入器,记录 SSE 帧 | 中 |
| `src/services/cache/`(未实现) | 实现 `fixtures.ts`,读 `fixtures/sciencepal/*` | 小 |
| `src/agent/loop.ts`(计划砍掉) | **不做**;SciencePal 的 agent-run 就是主循环 | 省 1 天 |

---

## 9. 一句话给组员

> 不要再在浏览器里粘提示词。同样的 prompt,用 `agent/initiate` 发出去、用 `stream` 收回来、用 `audit/export` 导出,三行 curl 就能做完;而且这三步产出的文件,正好就是答辩时最硬的那份证据。

---

## 10. 实测记录(2026-10-28,真实 key)

| 项 | 实测值 |
|---|---|
| key | `sp_live****B3XI`,到期 2026-11-27,名称 `Hackathon_wyh` |
| `GET /api/health` | 200 |
| `GET /api/agent-catalog?usable_only=true` | 200,5 个可用 Agent,**全部 builtin**:Biology / General / Material / MIMIC / Survey |
| `GET /api/billing/available-models` | 200,5 个:`deepseek-v4-flash`、`deepseek-v4-pro`、`glm-5.3`、`glm-5.3-flash`、`kimi-k3` |
| `POST /api/agents` | 200,**API key 可建自定义 Agent**(`Research Distiller` = `9e70403e-…`) |
| `POST /api/agent/initiate` | 200,返回 `thread_id` + `agent_run_id` |
| `GET /api/agent-run/{id}/stream` | 200,Bearer header 即可鉴权 |

### 10.1 固定 token 开销(重要)

| Agent | prompt_tokens | 说明 |
|---|---|---|
| 内置 General Agent | 31,087(其中缓存 30,720) | 系统提示 + 通用工具集 |
| 自建 Research Distiller | 24,712 | 平台基线约 2.4–2.5 万,**与你的 prompt 长度关系不大** |

**推论:`token_budget` 低于 25,000 一定会在第一步就 `token_budget_exhausted`。实际跑建议 ≥ 200,000。**

该错误状态下 `status = asked`,error.code = `token_budget_exhausted`,message 提示"回复继续即可续跑"。**`asked` 不是失败**,脚本必须与 `failed` 区分。

### 10.2 事件信封与解析规则

```jsonc
{ "type": "status|assistant|assistant_response_end|…",
  "content": "JSON 字符串",        // 必须二次 JSON.parse
  "metadata": "JSON 字符串",
  "message_id": "…", "thread_id": "…" }
```

| 规则 | 细节 |
|---|---|
| 取最终文本 | `assistant` 事件有 `metadata.stream_status = chunk \| complete`;**只用 complete,不要拼接全部**,否则文本会重复一遍 |
| 取用量 | `assistant_response_end` 的 `content.usage`(`total_tokens` / `prompt_tokens` / `completion_tokens` / `cached_input_tokens`) |
| 结束信号 | **不保证收到 `data: [DONE]`**;实测流会在 run 仍为 `running` 时关闭 |
| 终态判断 | 必须轮询 `GET /api/agent-run/{id}` 到 `completed / failed / stopped / asked`,不能以流关闭为完成 |

### 10.3 已落地脚本

| 脚本 | 作用 | 副作用 |
|---|---|---|
| `scripts/sp-probe.mjs` | 只读探活:key、可用 Agent、可选模型 | 无 |
| `scripts/sp-run.mjs` | 发起 run → 收流 → 轮询终态 → 落盘 `logs/runs/<runId>/` | 消耗 token |
| `scripts/sp-create-agent.mjs` | 从 `agents/*.json` 创建 Agent,`--publish` 才发布 | 在账号内创建对象 |

### 10.4 验证进度

- [x] `agent/initiate` 上传 PDF 后的**页码/章节定位** —— **答案为「有 quote、无可靠页码」**（2026-10-28 实测）
  - 20 条论断,quote **20/20 可在原文定位**(引用真实,无编造)
  - 自报页码 **0/20 与 PDF 物理页码一致**,偏移 +1 ×12、+2 ×7、其他 ×1
  - **结论:不让模型给 page,只给 quote;页码用 `scripts/verify-anchors.mjs` 本地反查后覆盖**
  - 证据:`fixtures/reading/react-2210.03629.{reading.md,anchor-verify.json}`
- [x] 单篇论文精读的 token 成本与耗时 —— 33 页 / **151.9s / 421,904 tokens**(400k 预算耗尽,状态 `asked`)
- [ ] `POST /api/skills/items` 的 `scope`(用户级还是全局)
- [ ] `POST /api/agents/{id}/publish` 后的可见范围与链接形态
