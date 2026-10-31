# 提交物差距评估与冲刺计划

| 项 | 值 |
|---|---|
| 版本 | v1.1 · 2026-10-31 17:15 |
| 本次变更 | ① 项目名定稿为 **Science Agent Coworker Hajimi** 并全局替换;② **已解决** —— `is_public` 走不通(API 只读 + UI 无「发布」按钮 + 市场未开通),改用「分享对话」生成公开只读链接,已用零 cookie 浏览器匿名验证 |
| 评估时间 | 2026-10-31 13:00(UTC+8) |
| 截止时间 | **2026-10-31 23:59(UTC+8)** —— 剩余 **约 11 小时** |
| 依据 | `https://sciencepal.ai/hackathon` §06 提交清单 + §07 评审方式(2026-10-31 实读) |
| 评估方式 | 逐条对照官网清单 + **实跑验证**(不是看文档) |
| 结论 | **4 项必交里,1 项基本就绪、1 项形式就绪但说服力不足、2 项为零;另有 3 个合规/可达性风险** |

---

## 0. 结论先行

**代码不是瓶颈。提交物才是。**

- 工程侧已经跑通:`npm run verify` **378 用例全过**(实测),Web 起在 `:7777` 且 `/`、`/app.js`、`/api/knowledge|tools|skills` 全 200,工具库 5 active、技能库 1 正式 + 3 草案、SciencePal 自定义 Agent 已建且链接 200。
- 但**评委要看的东西只完成了 1/4**:
  - 🔴 **演示视频:0**
  - 🔴 **≤5 页项目说明:0**
  - 🔴 **原创性与资源使用声明:0**
  - 🟡 **项目基本信息:材料齐,但没有成稿**(散在 README / SRS / DECISIONS)
- 还发现 **2 个会直接掉分甚至被判不合格的硬伤**:
  - ✅ **~~知识库面板是空的~~ → 已修复(13:05)**:4 篇论文重入库,**80 条**知识页,
    锚点定位率 99.7%–100%,隔离 0 / 失败 0,`/api/knowledge` 已返回 80 条。
    冻结样例已入 `fixtures/knowledge/`(88KB)。
  - ✅ **~~队伍 4 人~~ → 已澄清为 3 人**(13:15):WANG Xingshuai / WAN Yihui / ZHOU Yixuan,
    具名分工已写入声明;仅剩「4 个 git 身份需人工确认」这一处小尾巴
- 📌 一句话计划:**13:00–14:00 补演示数据 → 14:00–17:00 出图与说明 → 17:00–20:00 录剪视频 → 20:00–22:00 填表留证 → 22:00 后只做验证不再改内容。**

---

## 1. 逐条对照(官网清单 → 我们有什么 → 差什么)

### 1.1 四项必交

| # | 官网原文要求 | 现状 | 差距 | 工时 |
|---|---|---|---|---|
| ① | **项目基本信息**:名称、简介、拟解决的科学问题或科研痛点、目标用户与使用场景 | ✅ **已成稿**(13:15):`submission/01-project-info.{en,zh}.md` + 英文 PDF;17:10 已把占位符全部替换为定稿名 **Science Agent Coworker Hajimi**(中英文 6 个文件,0 残留) | 只剩 PDF 需按新标题重出(见 §7) | ✅ |
| ② | **可运行作品链接**:可正常访问和演示的 **SciencePal 项目、Agent 或工作流链接** | 🟡 **形式满足、能力受限**(17:35 复核):链接 = https://sciencepal.ai/share/7cc3f00e-1999-4c3d-9c32-e842399ac817,匿名可看。但严格讲它是**对话回放**,不是「项目/Agent/工作流」;平台当前版本对**所有队伍**都不提供「自定义 Agent 公开可对话」(前端 52 个 chunk 无任何 agent publish 调用、`is_public` 只挂在 project/thread、市场接口全局 403) | 已按「回放 + 30 秒导览 + 视频兜底」定案(见 §2 P0-3 末段)。问卷 ② 填该链接并附一句性质说明;「现场真跑」由 ③-a 承担 | ✅ 已定案 |
| ③-a | **3–5 分钟演示视频** | 🔴 **不存在**(全仓库无 mp4/mov) | 从脚本到成片全无 | 3.5h |
| ③-b | **不超过 5 页**项目说明(技术方案/创新点/验证结果/局限/后续计划) | ✅ **已成稿**(14:05):`submission/03b-project-description.en.md` + 英文 PDF(**恰好 5 页**,PDF `/Count` 校验);**含 3 张图**(架构图 / 产品实拍 / 页码偏移图),对应官网「用文字和**图表**系统地阐述」+ 中文审阅版 | 页数为硬约束,后续改内容须重跑构建并复核页数 | ✅ |
| ④ | **原创性与资源使用声明**:模型/数据/代码/API/外部工具清单,区分**赛前已有**与**赛中新增**,团队分工与合规 | ✅ **已成稿并已修订**(16:30):`submission/04-originality.{en,zh}.md` + 英文 PDF(**5 页**,末尾新增「证据索引」附录) | 已按 `manifest.json` 的事实纠正三处:内置 Survey Agent 不产生本提交数据 / 跑数据的是 `9e70403e` 而非 `ae5aaadf` / 自建 Agent 是 **2 个**不是 1 个。数据出处改为读 `fixtures/runs/<runId>/manifest.json`,不看叙述 | ✅ |
| ⑤ | 加分:代码仓库 / 技术报告 / Agent 配置 / 用户测试 / 可复现材料 | 🟡 Agent 配置 JSON(`agents/`)、replay fixtures、`logs/` 有;但**仓库是 private**(未登录访问 404) | 评委打不开仓库 = 加分项归零。见 §3 决策 D2 | 0.5h |

### 1.2 评审维度自检(§07)

| 维度 | 我们的答案 | 视频/说明里必须出现的一帧 |
|---|---|---|
| **科学价值** | 解决「论文读完就忘、结论无法追溯」——原子知识页带**逐字 quote + 真实页码**,可验证 | 同一句话在 PDF 第 p 页被高亮,与知识页 quote 逐字一致 |
| **创新性** | 工具**从论文里长出来**(`toolsynth` 5 个 active),而非人手写 40 个 | 展示 `github.com/…/tools/majority_vote.ts` 与它引用的论文页 |
| **可行性** | 378 测试、Web 可跑、CLI 兜底、replay 可复现 | 终端 `npm run verify` 全绿 + 浏览器三面板 |

---

## 2. 阻塞项(P0):不解决会直接损失分数

### P0-1 · 知识库面板是空的 —— 最严重 · ✅ 已修复(2026-10-31 13:05)

**修复前实测证据**

```
GET /api/knowledge → {"items":[]}
knowledge/        → 只有 INDEX.md(声称 3 篇 × 20 条)+ README.md
fixtures/knowledge/ → 不存在(DEC-034 说「必须入库一份冻结样例」,实际没有)
```

**已执行的修复**

| 步骤 | 结果 |
|---|---|
| ① 隔离试跑 `KNOWLEDGE_DIR=logs/k-p01` | 20 条 / locateRate 99.7% / 0 失败 → 闸门通过 |
| ② 补下载 3 篇(arXiv 直连 200,代理已失效) | Transformer 2.2MB / BERT 775KB / RAG 885KB |
| ③ 正式 `ingest fixtures/papers --force` | **4 篇 / 80 条**,定位率 99.7%–100%,**隔离 0 · 失败 0** |
| ④ 冻结样例入 `fixtures/knowledge/` | 88KB,未被 gitignore,评委 clone 即可看 |
| ⑤ `GET /api/knowledge` 复核 | **80 条** ✅;`/api/tools` 5;`/api/skills` 5(1 正式 + 4 草案) |
| ⑥ `npm run verify` 回归 | **378 pass / 0 fail** ✅ |
| ⑦ 16:30 补 `fixtures/runs/`(三份 `manifest.json` + README) | `logs/` 整目录被 gitignore,导致「结果可看、出处不可看」。现固化三份 run 的 `agentId`/预算/消耗/状态,兑现 04 附录的「每个数字可核对」 |

**意外收获**:原先 3 份「指向不存在知识页」的悬空草案(Transformer / BERT / RAG)
已重新对上知识页,仓库状态一致;新增 ReAct 草案,技能库面板从 4 条变 5 条。

**遗留(不阻塞)**:ReAct 标题被 PDF 文本层拆成 `REAC T : …`,属已知问题
(`docs/REVIEW-2026-10-29.md`),**今天不改代码**,只在五页说明的「局限」里提一句。

### P0-2 · ~~队伍 4 人 vs 规则 1–3 人/队~~ → ✅ 已解决(13:15)

已确认实际为 **3 人**,分工已按具名写入声明:

| 成员 | 职责 |
|---|---|
| WANG Xingshuai | 架构、冻结契约、Agent 主循环、LLM 层、工具注册表、CLI、Web 薄壳 |
| WAN Yihui | 知识库全链路 + 项目交付标准检验 + 全部提交物制作 |
| ZHOU Yixuan | 工具库全链路 + 技能库全链路 |

**遗留一处需人工确认**:`git shortlog` 显示 4 个 git 身份(`xingshuai01` 27 / `XHH520` 8 /
`Don` 4 / `aqiu` 1)。声明里已加脚注解释为「同一成员在不同机器/账号提交」;
若其中某个身份不属于这 3 人,需回头重核。

> 另:`docs/STRUCTURE.md:8` 仍写「团队 4 人」,与本声明冲突,建议同步改为 3 人(未擅改)。

### P0-3 · 「可运行」的三条链接都不可被评委直接打开

| 链接 | 现状 | 评委体验 |
|---|---|---|
| SciencePal Agent | `/agents/{id}` 路由存在(200),但内容由客户端拉 `/api/agents/{id}`,**匿名 401** | 未登录 = 空壳;登录后还受「是否共享给该账号」限制 |
| 我们的 Web | `http://127.0.0.1:7777`,仅本机 | **打不开** |
| GitHub 仓库 | private → 404 | **打不开** |

最低成本解法(按性价比排序,详见 §3 决策 D1/D2):
① 视频里以「本机真实运行 + 全程无剪辑」背书;② 公开仓库或提供评审包 zip;
③ 若时间允许,把 Web 发布到公网(WorkBuddy 的站点发布能力可直接部署 Node 应用)。

#### 2026-10-31 17:00 追加:`is_public` 到底能不能改成 true

**结论:API 改不了,四条实测都堵死了;只有网页端能改。**

| # | 做法 | 实测结果 | 判定 |
|---|---|---|---|
| 1 | `PUT /api/agents/{id}` 带 `{"is_public":true}` | **200**,但回包 `is_public: false` —— 字段被静默忽略。查 OpenAPI:`is_public` 只在 `AgentResponse`(**只读输出**),`AgentCreateRequest` / `AgentUpdateRequest` / `AgentDraftFinalizeRequest` **都没有这个字段** | ❌ 写不进去 |
| 2 | `POST /api/agents/{id}/publish` | `403 {"detail":"API keys are limited to SDK catalogs, agent, run and sandbox endpoints"}` —— key 的权限白名单里没有发布 | ❌ 需 session |
| 3 | 建一个「发布态」的新 Agent | `POST /api/agents` 的必填只有 `name` + `system_prompt`,请求体无 `is_public` | ❌ 建时即固定为私有 |
| 4 | 匿名访问的市场入口 | `GET /api/marketplace/agents` → `403 {"detail":"Custom agent currently disabled. This feature is not available at the moment."}`(带 key 同样 403,`/api/feature-flags` 里也没有市场开关) | ⚠️ 平台侧市场可能整体关闭 |

> 附带确认:`/api/agents/{id}/access-rules`(共享规则)对 key 也是同一个 403 白名单拦截 —— 所以「共享给某个账号」同样只能在网页端做。
> 另一个账号的 Agent(`ae5aaadf-…`)用本机 key 读 → `403 Access denied`,证明**跨账号读是默认拒绝**,这正是必须发布/共享的原因。

#### 17:20 网页端实测:UI 里**没有「发布」这个按钮**

用 WAN Yihui 账号(`yihuiwan2-c@my.cityu.edu.hk`)真实登录后,把三个可能的入口都点了一遍:

| 位置 | 实际看到 | 结论 |
|---|---|---|
| `/agents`(全部智能体 → 我的自定义) | 卡片上只有 **使用 / 编辑 / 分享 / 删除** 四个按钮,无「发布」「公开」 | 无入口 |
| 卡片「编辑」弹窗 | 四段:**基础信息 / 附加能力 / 系统提示词 / 版本与更新记录**,没有可见性开关 | 无入口 |
| 卡片「分享」弹窗 | 只能**按邮箱**分享给指定用户(「启用后,对方可以在智能体列表里看到并使用」),无「公开链接」 | 只能定向共享 |
| `/marketplace` | 直接被重定向到 `/marketplace/settings`,页面显示 **「Account not found」** | 市场未对本账号开通 |

→ 与 API 侧四条实测完全一致:**这个版本的自定义 Agent 没有"公开"能力**,`is_public` 是服务端字段,用户侧改不了。**不要再找发布按钮了,不存在。**

#### 17:25 正解:改用「分享对话」,生成公开只读链接

会话页右上角有 **`分享对话`** 按钮,点开写明「创建一个可分享的链接,**允许其他人公开查看此对话**」。已为 `f229dde2` 那次完整精读(Transformer,`status=completed`)创建:

```
https://sciencepal.ai/share/7cc3f00e-1999-4c3d-9c32-e842399ac817
```

**匿名验证已做**:另起一个**空配置、零 cookie** 的 Edge 实例打开该链接 → 标题 `Shared Conversation`,正文完整显示待精读的 prompt、Agent 逐轮回复、右侧「执行命令」终端输出、`253.9K tokens / ↑247.5K ↓6.4K` 统计与 24 页翻页器,**无登录墙、无报错**。

这个链接同时满足三件事:在 SciencePal 站内、可公开访问、内容就是「Agent 在真跑」的完整证据链(比一个空的 Agent 卡片页信息量大得多)。

**如果还要更多:** 同样方式可给 ReAct 那次 run 也生成一条(`thread c13c3bff-…`),或在「分享对话」弹窗里点「删除链接」随时撤销。撤销入口就在同一弹窗(分享链接 / 复制链接 / 删除链接)。

> 注意:分享出去的是**只读回放**,访客不能续问。所以 ② 的措辞写「可公开查看的完整运行记录」,不要写「可交互试用」——后者目前平台给不了。

#### 17:35 复核:这条链接到底合不合规(队友质疑后的补充取证)

**质疑**:「分享会话链接不符合提交物要求吧,评委又不能真的自己用我们的 Agent。」——**这个质疑成立**,但不能因此推翻了事,得把边界定清楚。

**一、严格读规则:确实差一层。** 官网 06 节原文是「可正常访问和演示的 **SciencePal 项目、Agent 或工作流链接**」;`/share/<threadId>` 是「一次对话」,不是项目/Agent/工作流。且 06 节还写着「**作品无法访问或无法演示时,组委会可要求限时补正;未在期限内补正的,可能不进入评分**」——所以「只给回放」是有风险的,不能当成无痛通过。

**二、但平台自己的演示范式就是它。** 翻前端数据发现,官方 Agent 目录里每个内置 Agent 都有一个 `example-share-page` 字段,值全部是 `/share/<id>`:

| 内置 Agent | 官方登记的示例页 |
|---|---|
| General / AMIX / Biology / Material / Plasma / Survey | `/share/89a8cb7a…`、`/share/15feaf51…`、`/share/0ccde0a8…`、`/share/711ab92c…`、`/share/64a75a29…`、`/share/520391b0…` |

实测其中两条匿名 `200`。即 **SciencePal 自己就是用 share 页来"演示一个 Agent"的**,我们走的是官方范式,不是绕路。

**三、让评委「真用」在这个平台上对所有队伍都做不到。** 三条硬证据(全部来自前端产物与接口,不是推测):

| 检查 | 结果 |
|---|---|
| 52 个前端 chunk 里搜 `publish` | 只命中博客/静态页发布(**上传含 index.html 的文件夹**),**无任何 agent 发布调用** |
| `is_public` 在前端挂在哪 | 只在 `projects` 与 `threads` 对象上;**agent 对象上没有这个字段** |
| `GET /api/marketplace/agents` | `403 Custom agent currently disabled`(匿名与带 key 同) |
| 跨账号读他人 Agent | `403 Access denied` |

→ 结论:**「公开可对话的自定义 Agent」在这个版本不存在**,不是我们不会用,是产品没做。

**四、定案(用户 17:40 选 A)。** ② 用 share 链接,但把「可演示」的举证责任显式分摊:

1. **问卷 ② 填链接 + 一句性质说明**:「SciencePal 上本次运行的完整公开回放(匿名可看);平台当前不开放自定义 Agent 的公开对话,故非可续问会话」。
2. **`submission/01` 中英各加一节「可运行链接:打开后 30 秒看什么」**:4 行表格告诉评委看 prompt 原文 / 逐步执行 / 执行命令 / 产物与翻页核对,并明写「不是什么」。
3. **`submission/04` 证据索引加一行**:`curl -sI` 可验匿名可达,零 cookie 实测。
4. **「现场真跑」交给 ③-a 视频**——这是唯一能证明系统活着的东西,优先级高于任何文档措辞。

> 备选方案(未采用):把我们的 Web 端公网部署,让评委真的输入任务。代价是 `web/server.ts` 目前 `listen(port,'127.0.0.1')` 需改 bind、托管、把 `DEEPSEEK_API_KEY` 放服务端(谁打开谁烧 token),约 1–2 小时,且会挤掉录视频的时间。**若 ③-a 录完后仍有余量,再回头做这一项。**

**问卷 ② 字段直接粘这段(中文):**

```
https://sciencepal.ai/share/7cc3f00e-1999-4c3d-9c32-e842399ac817
SciencePal 上本次运行的完整公开回放(Transformer 精读,status=completed,101.9s / 44,292 tokens),
无需登录即可打开;页面内含送入的 prompt 原文、Agent 逐步执行、实际调用的命令与产物清单,
可逐页核对每条 quote 是否真在原文中。
说明:SciencePal 当前版本未开放自定义 Agent 的公开对话,故该链接为完整执行过程回放,
非可继续追问的会话;系统实时运行见 3–5 分钟演示视频。
```

**English, if the form is in English:**

```
https://sciencepal.ai/share/7cc3f00e-1999-4c3d-9c32-e842399ac817
Public replay of our full run on SciencePal (Transformer close reading; status=completed;
101.9 s / 44,292 tokens). Opens without login. The page contains the exact prompt we sent,
the agent's step-by-step execution, the commands it actually invoked, and the artifact list,
so every quote can be checked against the source paper page by page.
Note: the current SciencePal version does not expose custom agents for public chat, so this
link is a replay of the complete run rather than a continuable session; the live run is
shown in the 3–5 minute demo video.
```


---

## 3. 需要现在拍板的 2 个决策

| 编号 | 决策 | 选项 | 我的建议 |
|---|---|---|---|
| **D1** | Web Demo 要不要公开发布 | A. 不发布,靠视频证明「本机真跑」<br>B. 发布到公网(需处理 API key 计费与滥用) | **A**,但把 `npm run verify` 与启动日志**录进视频**。B 的风险是评委乱点烧 key、冷启动超时,11 小时内不值得 |
| **D2** | 代码仓库怎么给评委 | A. 转 public<br>B. 打「评审包」zip 传网盘给链接<br>C. 不给 | **B**:既保护仓库,又能让评委看到代码。评审包 = `README` + `docs/` 精选 + `src/` + `fixtures/` + 一份 `REVIEWER-GUIDE.md`(10 分钟跑通路径) |

---

## 4. 冲刺时间表(今天 13:00 → 23:59)

> 原则:**先补「能看见的东西」,后写「能读到的东西」,最后才做「能验证的东西」。**
> 每段都有完成判据,过不了就按 §5 降级。

| 时段 | 任务 | 负责 | 完成判据 |
|---|---|---|---|
| 13:00–13:40 | ~~**P0-1 补演示数据**~~ **✅ 13:05 完成**:4 篇 80 条入库 + 冻结样例入 `fixtures/` | 骨架 | 已达成:`/api/knowledge` = 80 条 |
| 13:40–14:00 | ~~**P0-2 合规核对**~~ **✅ 13:15 完成**:确认为 3 人并具名 | 队长 | 已达成 |
| 14:00–15:00 | ~~**① 项目基本信息成稿**~~ **✅ 13:15 完成**(中英 + PDF) | 谁熟谁写 | 已达成 |
| 14:00–15:00 | ~~**④ 原创性声明成稿**~~ **✅ 13:16 完成**(中英 + PDF) | 另一人 | 已达成 |
| 15:00–17:00 | **③-b 五页说明**(见 §4.1 分页大纲) | 设计感最好的人 | 导出 PDF,恰好 5 页 |
| 17:00–18:30 | **③-a 录屏**(见 §4.2 分镜):先不剪,录 2 遍取一遍 | 一人操作一人念 | 一段 4–5 分钟无中断原始素材 |
| 18:30–19:30 | 剪辑:去口误 + 字幕 + 首帧标题;**控制在 4:30** | 同一人 | 成片 ≤100MB,MP4 |
| 19:30–20:00 | 上传视频(留后路:网盘 + 直链各一份) | — | 无痕窗口能播 |
| 20:00–21:30 | **填问卷**(腾讯问卷 `wj.qq.com/s2/28257934/cce2/`),逐项贴 ①②③④ + 评审包链接 | 队长 | 提交成功截图 |
| 21:30–22:30 | **冷启动复核**:换一个目录 `git clone` → `npm i` → `ingest` → `web`,按评委视角走一遍 | 非作者本人 | 30 分钟内跑通;发现的问题只记不修 |
| 22:30–23:30 | 缓冲:补漏、可访问性复查(无痕窗口逐个点链接) | 全员 | 4 个链接全部可打开 |
| 23:30–23:59 | **不再改任何内容**,只做最终确认与留证 | 队长 | 提交回执截图 |

### 4.1 五页说明分页大纲(每页 1 个论点,不堆字)

| 页 | 标题 | 内容要点 |
|---|---|---|
| **P1** | 问题:论文读完了,知识没留下 | 痛点三连:结论无法追溯页码 / 方法无法复用 / 经验无法传递。目标用户:研究生、青年科研人员。场景:组会前读 20 篇同领域论文 |
| **P2** | 方案:一个「会长大」的科研 Agent | 一张主链路图:PDF → `PaperDoc` → **三库沉淀** → 下次任务直接消费。标注 **SciencePal 在链路上的位置**(精读 Agent 出 quote,本地反查页码) |
| **P3** | 创新点:工具不是人写的,是从论文里长出来的 | 对比图:Claude Code 40+ 工具手写 vs 我们的 `toolsynth` 从 `MethodSpec` 生成 + smoke 验证。给 `majority_vote` 一个真实例子 |
| **P4** | 验证结果(**全是实测数字**) | 378 测试全绿 / 单篇 20 条知识页 / 锚点定位 99.7% / 检索 3–8ms / 工具库 5 active + 1 draft / 技能 1 正式 + 3 草案 |
| **P5** | 局限与后续 | 表格解析为空 / 标题清洗 / `normalize_answer` 无实现 / Web 未公网部署;下一步:表格→Markdown、多论文共识 skills、人类审核工作台 |

### 4.2 视频分镜(4 分 30 秒,一条过)

| 时间 | 画面 | 口播重点 |
|---|---|---|
| 0:00–0:30 | 标题页 + 一句话定位 | 「它不是聊天机器人,它读完论文会留下三样东西」 |
| 0:30–1:30 | **浏览器里拖入 PDF → 解析 → 三库计数跳动** | 讲「沉淀」:20 条知识页、每条的页码从哪来 |
| 1:30–2:30 | 点开一条知识页,对照 PDF 同一句高亮 | 讲**可验证性**:quote 逐字一致,页码是本地反查不是模型自报("实测模型自报 0/20 正确"——这句最能打动评委) |
| 2:30–3:15 | 工具库点开 `majority_vote`,展示"来自论文 p.5" | 讲**创新点**:工具从论文长出来,不是手写 |
| 3:15–4:00 | 输入科研任务 → 过程流里出现 `knowledge_search` / `sciencepal_query` / 技能注入 | 讲 **SciencePal 进入核心工作**:它负责读,我们负责锚点治理 |
| 4:00–4:30 | 终端 `npm run verify` 全绿 + 局限一页 | 讲**诚实**:当前局限 + 下一步 |

> 录屏铁律:**开屏就录终端启动命令**,让评委看到 `node src/main.ts web` —— 这是「能跑」的唯一硬证据。

---

## 5. 时间不够时砍什么(降级顺序)

| 顺序 | 砍掉 | 代价 |
|---|---|---|
| 1 | 公网部署(D1-B) | 小,视频里已证明本机真跑 |
| 2 | 评审包 zip 里的 `REVIEWER-GUIDE.md` | 小 |
| 3 | 五页说明降到 3 页(允许「不超过 5 页」) | 小,**不违规** |
| 4 | 视频从 4:30 压到 3:30(下限就是 3 分钟) | 小,**不违规** |
| **不可砍** | 提交视频、提交说明、提交声明、补知识库数据 | 缺任何一项即不合规或大幅失分 |

---

## 6. 提交前 10 分钟 Checklist

- [ ] 问卷四项都填了,没有留空
- [ ] ② 填的是**分享链接** `https://sciencepal.ai/share/7cc3f00e-1999-4c3d-9c32-e842399ac817`,并在**无痕窗口**里打开确认能看到完整对话(已验过一次,提交前再验一次)
- [ ] 分享链接没有被误删(分享弹窗里若点过「删除链接」会立刻失效)
- [ ] 视频链接在无痕窗口能播,时长 3–5 分钟之间
- [ ] 说明文档 ≤ 5 页(数页码,不是数章节)
- [ ] 声明里明确写了「赛前已有成果 vs 赛事期间新增」
- [ ] 团队登记人数 ≤ 3
- [ ] 提交成功页已截图
- [ ] `git status` 干净,`npm run verify` 最后一次全绿

---

## 7. 项目名定稿(17:10)

**定稿名:Science Agent Coworker Hajimi**(中英文同一写法,不译)

| 文件 | 改动 |
|---|---|
| `submission/01-project-info.en.md` | `[PROJECT NAME]` ×6 → 定稿名 |
| `submission/01-project-info.zh.md` | 标题 / 正文 / 短版 / 「审阅备注 1」共 4 处;备注 1 原为「名字是占位符,定名后全局替换」,已改写为「名字已定稿」 |
| `submission/03b-project-description.{en,zh}.md` | 标题各 1 处 |
| `submission/04-originality.{en,zh}.md` | 标题各 1 处 |
| `submission/03a-video-script.zh.md` | S1 冷开场画面加项目名(首帧标题) |

- 复核命令:`grep -rn -e 'PROJECT NAME' -e '项目名待定' submission/ --include='*.md'` → **无输出**。
- ⚠️ **`submission/*.en.pdf` 必须重出**:PDF 里的页眉/首行仍是旧占位符。
  `node scripts/build-submission-pdf.mjs` 后数页码(01=4 页 / 03b=5 页 / 04=5 页),
  再跑 `npm run verify`。
- 若报名表里填的是别的写法,**以报名表为准**,回头改这一处并按上面重出 PDF。

---

## 附:本次评估的实跑记录(可复现)

```
npm run verify          → tests 378 / pass 378 / fail 0 / skipped 0   (15.9s)
node src/main.ts web    → http://127.0.0.1:7777  · 模式 live
GET /           200     GET /app.js  200    GET /style.css  200
GET /api/knowledge  → 80 条(修复前为 {"items":[]})  ← P0-1 已修
GET /api/tools      → 5 active(含 majority_vote …)
GET /api/skills     → 5 条(1 正式 + 4 草案)
curl github.com/xingshuai01/hackathon-agent → 404     ← 仓库 private
curl sciencepal.ai/agents/ae5aaadf-…        → 200     ← 仅 Next.js 外壳,匿名 /api/agents/{id} 实为 401
git status → 干净(HEAD ec6de2e,已推 origin/main)
node scripts/sp-public-check.mjs --agent 9e70403e-…(17:05 新增)
  → is_public=false · marketplace_published_at=null · 匿名 API 401 · 市场 403 custom agent disabled
```
