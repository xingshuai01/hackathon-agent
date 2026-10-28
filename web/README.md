# web/ — Web 薄壳

| 项 | 值 |
|---|---|
| **负责人** | 你(骨架) |
| **对应 Issue** | #31 #32 #38 |
| **依据** | [`docs/SDD.md`](../../docs/SDD.md) §3.4、DEC-003 / DEC-004 / DEC-006 |

## ⚠️ 最重要的约束:这是薄壳

```
✅ 允许 import:  node:*
                 ../src/ui/events.ts
                 ./*
❌ 禁止 import:  src/services/**  src/agent/**  src/tools/** 的实现
```

检查器(`scripts/check-rules.mjs` 的 `import-boundary` 规则)**会机械拦截**越界 import。

**理由**(NFR-12):一旦 Web 能直接调业务,4 天内必然出现两套逻辑;而且 Web 出 bug 会连带核心不可用,演示直接崩。

## 那 Web 需要数据怎么办

两条路,**都不碰业务逻辑**:

1. **订阅事件**:`bus.on(e => sse.write(e))` —— 核心层发什么就展示什么
2. **读文件系统**:`GET /api/knowledge` 等端点直接读 `knowledge/`、`skills/`、`src/tools/generated/`

## 要建的文件

| 文件 | 职责 | 量级 |
|---|---|---|
| `server.ts` | `node:http` + SSE + 静态文件 + 端口顺延 | ~120 行 |
| `public/index.html` | 单页,**零构建零框架零 CDN** | |
| `public/app.js` | `EventSource` + DOM 渲染 | ~500 行 |
| `public/style.css` | 手写 CSS | |

## 端点

| 路径 | 作用 |
|---|---|
| `GET /events` | SSE 事件流 |
| `POST /api/ask` | 提交任务,**立刻返回 202**(事件继续走 SSE,不卡浏览器) |
| `GET /api/knowledge` | 三面板数据:读 `knowledge/` |
| `GET /api/tools` | 读生成工具 |
| `GET /api/skills` | 读 `skills/` |
| `GET /*` | 静态文件 |

## 三面板布局

```
┌──────────────────┬───────────────────────────────────────┐
│ 📚 知识库 N 条   │  ◀ 过程流(SSE 实时)                  │
│ 🔧 工具库  N 个  │  ⚙ knowledge_search "..." 120ms ✓     │
│ 📋 技能库  N 个  │  📋 加载技能 X(命中关键词)            │
│                  │  📚 引用 p3f8a2c1#p7 (p.7)            │
│ ── 点击展开 ──   │  答:……(流式)                          │
└──────────────────┴───────────────────────────────────────┘
```

## 验收标准

- [ ] `EventSource` 能收到全部 9 种事件
- [ ] `/api/ask` 立即返回,3 分钟任务不卡浏览器
- [ ] 端口被占自动顺延并打印实际地址
- [ ] **Web 启动失败不退出进程**(CLI 必须仍可用)
- [ ] 断网(无 CDN)页面正常打开
- [ ] 三面板数据来自文件系统实时读取,`run_end` 后自动刷新
- [ ] 静态检查:`web/` 的 import 在白名单内

## 禁止

- ❌ React / Vue / Vite / Express / 任何 CDN
- ❌ 在 Web 层做任何业务判断(重试、解析、校验都属于核心层)
- ❌ 把业务逻辑复制一份到前端
