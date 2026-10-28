---
skillId: ai-code-review-gate
name: 外部 AI 生成代码的机械审查门禁
domain: 软件工程 / AI 协作
version: 1.0.0
description: 把外部 AI 产出的代码审到能合入本仓库为止,并决定能否合入
whenToUse: 当有人把外部 AI(SciencePal、Copilot、Claude 类)生成的代码放进本仓库,或要求「让学校的 agent 写、你来审」时使用。也适用于:收到一段自称已通过测试的代码、需要判断能不能合。
loadWhen: {"keywords":["AI 生成","审查","verify","typecheck","SciencePal","返工","合入"],"taskTypes":["代码审查","合入判定","产物搬运"]}
allowedTools: ["npm run verify","git diff --name-only","tools doctor"]
status: active
reviewedBy: B1eberz
---

## 一、领域地图
- {"concept":"冻结契约","note":"6 个 types.ts / events.ts 接口约定文件,标 ★★★,只能加不能改"}
- {"concept":"可加不可改","note":"契约演进的唯一合法方向;改已导出签名要走 PR + 1 个非作者 approve"}
- {"concept":"门禁三件套","note":"typecheck + check:rules + test,由 npm run verify 串行"}
- {"concept":"文件级所有权","note":"一个文件只有一个主人;跨模块改别人的文件要先问,不要顺手重构"}
- {"concept":"无构建步骤","note":"Node 24 直接执行 .ts,所以相对 import 一律带 .ts 后缀"}
- {"concept":"类型剥离","note":"只删类型不做转译,因此 enum / namespace / 构造函数参数属性在运行时直接崩"}
- {"concept":"数据铁律","note":"四条硬规矩(页码锚点 / 失败模式≥3 / 解析率≥0.7 / active 必须真人签),违反就是 incomplete"}
- {"concept":"渐进披露","note":"常驻上下文的只有 name + description + whenToUse;正文懒加载,清单有 8000 字符预算"}
- {"concept":"三态状态机","note":"draft(原始草案)→ needs_review(齐全未签)→ active(已签);incomplete 是拒绝加载,不是状态档位"}
- {"concept":"编号返工轮次","note":"一轮一份编号清单,而不是一句句追问;清单里要引它自己的原始报错"}
## 二、标准流程
- {"stage":"1. 收产物","input":"AI 会话里的代码块","action":"逐字搬到仓库外的暂存目录,先不进 src/","criteria":"每个暂存文件的字符数与页面代码块的 textContent.length 完全相等;不等就是搬运有损,重搬"}
- {"stage":"2. 查改动面","input":"暂存文件","action":"复制进对应模块目录,用 git diff --name-only 列出改了哪些文件","criteria":"清单里不含 6 个契约文件;package.json 与 package-lock.json 的 diff 为空"}
- {"stage":"3. 真实门禁","input":"本仓库工作区","action":"跑 npm run verify,三条子命令分别留原始输出","criteria":"typecheck 无诊断且 EXIT=0、check:rules 打印通过、test 的 pass 数与 fail 数都写出来。AI 自己环境的结论一律不算数"}
- {"stage":"4. 运行时探针","input":"新模块的导出","action":"写一条最小测试直接 import 新模块并调用一次真实路径(含文件读写)","criteria":"该测试出现在 npm test 的结果里并通过。只过 typecheck 不算,因为本项目没有构建步骤"}
- {"stage":"5. 编号返工","input":"门禁原始报错","action":"把报错逐条贴回同一个 AI 会话,编号列出要求,并声明本仓库 tsconfig 冻结、禁用 as 绕过","criteria":"下一轮产物一次过 verify;若某条它说改不了,要求它指名缺哪一项编译选项,而不是让它改配置"}
- {"stage":"6. 逐条判据","input":"docs/STRUCTURE.md §8 本模块的判据清单","action":"一条一条对,不合并、不概括","criteria":"每条标 ✅ / ⚠️ / ⬜;⬜ 的必须写清还差什么、谁来做、什么时候差"}
## 三、方法→工具映射
- {"method":"3. 真实门禁","tool":"npm run verify"}
- {"method":"2. 查改动面","tool":"git diff --name-only"}
- {"method":"1. 工具池体检(待 B 模块落地,当前不存在)","tool":"tools doctor"}
## 四、常见失败模式
- AI 报告「tsc 通过、N 个测试全过」,但它在自己的沙箱里新建了宽松的 tsconfig 和 package.json —— 它验的不是这个项目。自查:仓库的 package.json / tsconfig 有没有出现在它的产物清单里;出现了就是它另起了一套环境。
- 无构建步骤的项目里出现 ./x.js 形式的相对 import。tsc 放它过,Node 直接 ERR_MODULE_NOT_FOUND。自查:只跑 typecheck 不跑 import 探针,这类错误 100% 漏网。
- AI 顺手降级或新增依赖(例:把 zod 4 写成 zod 3 以适配它的沙箱)。自查:git diff package.json package-lock.json 必须为空,不看它怎么声明。
- AI 说「未改动契约」,实际是把契约文件复刻了一份到它自己目录里编译。措辞真实但误导 —— 那份复刻文件若跟产物一起搬回来,仓库就出现两份 types.ts。自查:改动清单里有没有契约路径。
- 人(或我)手抄几 KB 代码时漏一行、改错一行,肉眼看不出来。自查:搬运后按字符数或校验和比对,不等就重搬。这条是审查者自己的失败模式,最容易忽略。
- AI 把可选优化也做了但不主动提,只在末尾一句带过。自查:逐条回读它自己的交付说明,凡是它说「另外还做了」的都要单独跑一遍门禁。
## 五、术语消歧
- {"term":"验证通过","disambiguation":"AI 说的「验证通过」指它自己环境的编译;本仓库只认 npm run verify 的原始输出文本"}
- {"term":"绿了","disambiguation":"typecheck 绿 ≠ 能运行。本项目无构建,模块解析错误 tsc 抓不到,必须另有运行时探针"}
- {"term":"契约","disambiguation":"不是合同,是 6 个被标 ★★★ 的接口约定文件;「改契约」指动已导出的签名"}
- {"term":"draft / needs_review / incomplete","disambiguation":"draft = 生成器原始草案;needs_review = 七节齐全但没真人签;incomplete = 缺节或不达标,直接拒绝加载,不是审核档位"}
- {"term":"审查","disambiguation":"这里是机械审查(跑门禁、比对改动面),不是读一遍觉得写得不错"}
## 六、证据索引
- {"claim":"AI 在自己宽松配置里报绿、在真实仓库里 5 个类型错 —— 本技能第 4 节第 1 条的原始案例","noteId":"PENDING#A"}
- {"claim":"./x.js 在无构建项目里导致 ERR_MODULE_NOT_FOUND —— 第 4 节第 2 条","noteId":"PENDING#A"}
- {"claim":"数据铁律 #4:active 必须有 reviewedBy,依据 docs/CODE-RULES.md 与契约 #4-B 注释","noteId":"PENDING#A"}
## 七、负向约束
- 不要为了让 AI 通过而修改冻结契约,也不要放宽本仓库的 tsconfig 编译选项。契约不够用时报告缺什么,不是改它。
- 不要用 as / any / @ts-ignore 绕类型错误。绕过去的错误会在运行时以更难看的方式回来。
- 不要把 AI 的自我报告当证据,包括「我已经验证过了」和它贴出来的测试数字。
- 不要一次改超过 5 个文件;超了就拆 PR,别顺手重构别人模块里的代码。
- 不要搬运依赖:不接受 AI 新建的 package.json / lockfile / tsconfig,只要它的 src 产物。
- 不要在没跑运行时探针之前给出「可以合」的结论。
