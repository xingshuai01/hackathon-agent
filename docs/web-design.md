# Web 前端设计 · v1.0

| 项 | 内容 |
|---|---|
| 依据 | `docs/SDD.md` §3.4(薄壳设计)、SRS `FR-F`、`DEC-003/004/005/006` |
| 对应 Issue | #31(后端)、#32(前端)、#38(三面板) |
| 状态 | **设计定稿,待实现** |
| 目标读者 | 骨架负责人(实现)、三位同学(理解事件如何被消费) |

---

## 0. 一句话设计

**左看资产,右看过程:左边三个面板实时显示「知识/工具/技能」在增长,右边过程流实时显示 Agent 的每一步,产物区放交付文件。**

```
┌──────────────────────┬────────────────────────────────────────────┐
│ 📚 知识库    20 条   │  ◀ 过程流(SSE 实时,自动滚动)                │
│ 🔧 工具库     5 个   │  ┌────────────────────────────────────────┐ │
│ 📋 技能库     1 个   │  │ ▸ 你:低资源 RAG 有哪些方法?            │ │
│                      │  │                                          │ │
│  ┌──────────────┐    │  │   Agent: 我先检索知识库。               │ │
│  │[result] p7    │    │  │                                          │ │
│  │ 跨语言对齐提升 │    │  │   ⚙ knowledge_search                   │ │
│  │ 4.2 个点      │    │  │     {"query":"低资源 RAG"}              │ │
│  │ p3f8a2c1 p.7  │    │  │     ✓ 120ms · 命中 8 条                 │ │
│  └──────────────┘    │  │                                          │ │
│                      │  │   📚 引用 p3f8a2c1#p7 (p.7)              │ │
│  ── 点击展开证据 ──  │  │   📋 加载技能 低资源RAG研究(命中关键词) │ │
│                      │  │                                          │ │
│                      │  │   Agent: 主要方法有三类……(流式)         │ │
│                      │  └────────────────────────────────────────┘ │
│                      │  ┌─ 产物 ─────────────────────────────────┐ │
│                      │  │ out/report.md · run-xxxx.json          │ │
│                      │  └────────────────────────────────────────┘ │
└──────────────────────┴────────────────────────────────────────────┘
```

---

## 1. 设计原则(每条都对应一个约束)

| # | 原则 | 对应的约束 |
|---|---|---|
| 1 | **零构建、零框架、零 CDN** | `DEC-006`:现场断网也要能打开(`AC-F4.5`) |
| 2 | **薄壳**:server 不 import 任何业务实现 | `NFR-12`、`D-12`:检查器会机械拦截 |
| 3 | **一条事件流**:server 只做「总线 → SSE」的搬运工 | `DEC-005`、`FR-F1` |
| 4 | **面板数据 = 文件系统 + 注入的 provider** | `AC-F2.4`:`FR-F2` 要求「实时读取,不是从日志拼」 |
| 5 | **Web 崩了 CLI 必须还能用** | `D-12`、`AC-F4.4` |

---

## 2. 薄壳怎么落地(关键架构决定)

`web/server.ts` **禁止** import `src/agent/`、`src/services/`。那它怎么触发任务、怎么拿面板数据?

**答案:依赖注入。** 所有业务能力由 `main.ts` 在启动 Web 时**传进去**:

```ts
// web/server.ts —— 只定义接口形状,不 import 任何实现
export interface WebController {
  /** 启动一次 ask。返回 null = 已受理;返回 string = 拒绝原因(如"上一次运行未结束") */
  startTask(task: string): string | null
}

export interface PanelProviders {
  knowledge(): Promise<KnowledgePanelItem[]>
  tools(): Promise<ToolPanelItem[]>
  skills(): Promise<SkillPanelItem[]>
}

// main.ts —— 实现这些接口,用真实的 loop / store
const controller: WebController = {
  startTask(task) {
    if (busy) return '上一次运行尚未结束'
    busy = true
    void runAskPipeline(task).finally(() => { busy = false })
    return null
  },
}
```

这是团队已经验证过的模式(`KnowledgeHitSink` 工厂注入,`docs/wyh/三项待拍板决策.md` §1),
与之一致。检查器看到 `web/server.ts` 的 import 只有 `node:*` 和自己目录的文件 → 通过。

---

## 3. 页面结构

### 3.1 布局(三栏两区)

| 区域 | 内容 | 宽度 |
|---|---|---|
| 顶部栏 | 项目名 + 连接状态灯 + 输入框 + [运行] 按钮 | 100% |
| 左侧 · 资产面板 | 三个 tab(知识库 / 工具库 / 技能库),每个 tab 一个计数徽章 | 340px,可折叠 |
| 右侧 · 过程流 | 用户问题、Agent 文本(流式)、工具调用行、引用/技能 chips | 剩余宽度 |
| 右侧底部 · 产物区 | 每次运行结束后的产物文件列表 | 可折叠 |

### 3.2 顶部栏

```
[● live]  hackathon-agent ────────────────────────── [输入框……] [运行]
```
- 状态灯三态:`● live`(绿)/ `● connecting`(黄,闪烁)/ `○ offline`(红)
- 输入框回车即提交;运行中按钮变 [中断],再次点击 abort

### 3.3 左侧资产面板

三个 tab,默认「知识库」。每个 tab 标题带实时计数:

| Tab | 计数来源 | 卡片内容 |
|---|---|---|
| 📚 知识库 | `GET /api/knowledge` 长度 | 每条:`[kind] 描述(截 80 字)` + `paperId p.N`;点击展开证据 quote |
| 🔧 工具库 | `GET /api/tools` 长度 | 工具名 + 状态徽章(active 绿 / draft 黄)+ 来源论文 |
| 📋 技能库 | `GET /api/skills` 长度 | skillId + 状态徽章(active/needs_review/incomplete)+ whenToUse |

刷新时机:每次 `run_end` 事件后自动 fetch 三个面板 + 顶部栏的 [刷新] 按钮手动触发。

### 3.4 右侧过程流(核心)

每个「运行」是一个块(run block),块内自上而下:

| 元素 | 渲染自 | 样式 |
|---|---|---|
| 用户问题 | 本地 echo | 右对齐气泡 |
| Agent 文本 | `text_delta` 追加 | 左对齐,等宽字体,流式逐字 |
| 工具调用行 | `tool_start` → `tool_end` | `⚙ name {args}` 后接 `✓ 120ms · 摘要` 或 `✗ 原因` |
| 知识引用 | `knowledge_hit` | 绿色 chip:`📚 p3f8a2c1 p.7 描述`,可点击定位到左侧面板对应卡片 |
| 技能加载 | `skill_load` | 蓝色 banner:`📋 加载技能 X —— reason` |
| 进度 | `progress` | 细进度条:`done/total step` |
| 错误 | `error` | 红色行,`[stage] message` |
| 汇总 footer | `run_end` | `■ completed · 12.3s · tokens 300/75 · 工具 3 次` |

**流式实现**:`text_delta` 到达时 `textContent += delta`,不做 diff、不做 re-render。
**自动滚动**:仅当用户已滚到底部时才跟随,否则不动(不打断用户回看)。

### 3.5 产物区

`run_end` 后从 `GET /api/artifacts` 拿最近运行的文件列表
(`out/`、`logs/` 里的可见文件),渲染成可点击的链接列表。

---

## 4. 事件 → DOM 映射表(9 种事件全表)

| 事件 | 触发时机 | DOM 动作 | 失败时的行为 |
|---|---|---|---|
| `text_delta` | LLM 流式 | 追加到当前 agent bubble | — |
| `tool_start` | 工具开始 | 新建工具行 + 参数摘要 + spinner | — |
| `tool_end` | 工具结束 | spinner → `✓`(绿)或 `✗`(红)+ ms + summary | summary 即错误文本 |
| `skill_load` | 技能命中 | 插入蓝色 banner | — |
| `knowledge_hit` | 知识命中 | 插入绿色 chip,可点击 | — |
| `tool_generated` | B 模块产出 | 工具面板计数 +1,toast 提示 | — |
| `progress` | 长任务 | 更新当前进度条行 | — |
| `error` | 可恢复错误 | 红色行(不中断) | — |
| `run_end` | 运行结束 | 汇总 footer + **三面板自动刷新** | 标记 `reason` |

---

## 5. 连接状态机(SSE 的三种情况都要好看)

```
        EventSource open
 disconnected ──────────────▶ live ──▶ 事件 → 渲染
   ▲                            │
   │        服务器重启/断网       │
   └────────────────────────────┘
              │
              ▼
         connecting(黄灯)── 3s 后自动重连,退避至 30s 上限
```

- `onerror` → 黄灯 + 顶部横幅「连接中断,正在重连…」
- 重连成功后,横幅消失;历史块保留
- 重连失败超过 10 次 → 红灯 + 横幅「已离线,点此重试」

---

## 6. API 设计

| 方法 | 路径 | 作用 | 响应 |
|---|---|---|---|
| GET | `/` | index.html | 静态 |
| GET | `/app.js` `/style.css` | 静态 | 静态 |
| GET | `/events` | SSE 事件流(全局总线广播) | `text/event-stream` |
| POST | `/api/ask` | `{question}` → **立刻 202** | `202 Accepted` |
| GET | `/api/knowledge` | 知识面板数据 | `{items:[…]}` |
| GET | `/api/tools` | 工具面板数据 | `{items:[…]}` |
| GET | `/api/skills` | 技能面板数据 | `{items:[…]}` |
| GET | `/api/artifacts` | 产物文件列表 | `{files:[…]}` |
| GET | `/healthz` | 探活 | `200 ok` |

**要点**:
- `/api/ask` 同步返回(不等待任务)—— 3 分钟任务不卡浏览器(`AC-F4.2`)
- SSE 帧格式:`data: {JSON}\n\n`(直接复用 `events.ts` 的 `toSseFrame()`)
- 所有 `/api/*` 都带 `Cache-Control: no-store`

---

## 7. 视觉系统

### 7.1 色板(深色主题,投影仪友好)

| 用途 | 色值 |
|---|---|
| 背景 | `#0d1117` |
| 面板/卡片 | `#161b22` |
| 边框 | `#30363d` |
| 正文 | `#e6edf3` |
| 次要 | `#8b949e` |
| 知识(绿) | `#3fb950` |
| 工具(紫) | `#bc8cff` |
| 技能(蓝) | `#58a6ff` |
| 错误(红) | `#f85149` |
| 警告(黄) | `#d29922` |

### 7.2 字体

```css
font-family: -apple-system, "Segoe UI", "Microsoft YaHei", system-ui, monospace;
/* 过程流用等宽 */
.code { font-family: "Cascadia Code", Consolas, monospace; }
```
不引外部字体(原则 1)。

### 7.3 组件

- 状态徽章:小圆角方块,`active=绿` / `draft=黄` / `incomplete=红` / `needs_review=蓝`
- chip(知识引用):绿底半透明 + 绿边
- banner(技能加载):蓝底半透明 + 蓝边
- 工具行:左图标 + 名称等宽 + 参数灰字 + 右对齐耗时

---

## 8. 降级与错误(逐条对应 AC)

| 场景 | 行为 | AC |
|---|---|---|
| 端口被占 | 顺延 20 个端口,打印实际地址,**进程不退出** | `AC-F4.3` |
| Web 启动失败 | 打印「Web 启动失败,请用 CLI」,CLI 照常 | `AC-F4.4` |
| 断网/无 CDN | 全部资源内联,页面正常打开 | `AC-F4.5` |
| SSE 断连 | 状态机 §5 | — |
| 面板 provider 抛错 | 返回空列表 + 面板显示「读取失败」,不崩 server | `NFR-4` |
| 上一次任务未结束 | `startTask` 返回拒绝原因,前端弹提示 | — |

---

## 9. 实现清单(按顺序)

| # | 文件 | 行数量级 | 依赖 |
|---|---|---|---|
| 1 | `web/server.ts` | ~220 | 契约 events.ts |
| 2 | `web/public/index.html` | ~120 | — |
| 3 | `web/public/style.css` | ~300 | — |
| 4 | `web/public/app.js` | ~450 | — |
| 5 | `src/main.ts` 接线(cmdWeb + controller + providers) | ~120 | 全部 |

### 验收清单(实现后逐项自测)

- [ ] `npm run web` 打开页面,状态灯 live
- [ ] 提交问题 → 过程流实时渲染,产物区出现文件
- [ ] 三面板在 `run_end` 后自动刷新,数字增长
- [ ] 断网(拔网线)页面仍完整渲染(资源内联)
- [ ] 杀掉 server 进程 → 页面黄灯 + 自动重连横幅
- [ ] `web/` 的 import 通过 `check:rules`(薄壳)
- [ ] `npm run verify` 全绿
