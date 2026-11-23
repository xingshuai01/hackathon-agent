# hackathon-agent — Project Report

### 科研搭子·哈基米 (Research Buddy Hachimi)

| | |
|---|---|
| **Competition** | Global AI4Science Hackathon 2026 · AGENT Track |
| **Project** | A research-domain Agent that distills papers into reusable knowledge / tools / skills |
| **Team** | 4 members |
| **GitHub** | https://github.com/xingshuai01/hackathon-agent |
| **SciencePal Agent** | https://sciencepal.ai/agents/ae5aaadf-41c2-41e1-9b33-dbe5b8d6226e |

---

## 1. Executive Summary

Researchers are drowning in papers: knowledge is fragmented, methods are not reproducible, and "I read it once but can't use it" is the norm. **hackathon-agent** attacks this by turning every paper into three reusable assets:

| Module | Question | Output |
|---|---|---|
| **A · Knowledge Base** | *What does it say?* | Atomic, evidence-backed claims, each pinned to an exact page anchor |
| **B · Tool Library** | *How do I do it?* | Executable tools auto-generated from paper methods, with smoke tests |
| **C · Skill Library** | *What should I do?* | Cross-paper consensus distilled into seven-section skills, human-reviewed |

The system is a **self-hosted agent loop** (DeepSeek via native `fetch`, zero SDK) with **SciencePal as a first-class tool node** in the main loop — satisfying the hackathon's mandatory "substantive use of SciencePal" requirement.

---

## 2. Team Contributions

### WANG Xingshuai — Team Lead (Architecture / Skeleton)

- Designed the **6-layer architecture** (entry → UI → orchestration → tools → services → state) and froze 6 interface contracts to allow three teammates to build modules in parallel without collision.
- Built the **agent core**: main loop (`src/agent/loop.ts`), tool registry, system prompt, and the three-stage tool pipeline (`safeParse → validateInput → call`).
- Built the **Web UI** (thin-shell server + frontend): drag-and-drop PDF parsing, the visualized workflow, three library panels with delete, and the mascot.
- **SciencePal integration**: `sciencepal_query` tool node, SSE stream parsing, and created the custom "论文精读官" Agent on the platform.
- **LLM layer**: DeepSeek client (streaming, retry, zero SDK), plus the full **offline replay** capability (`--record` / `--replay`) so the demo survives network failure.
- **Engineering discipline**: 34 recorded decisions (`docs/DECISIONS.md`), automated rule checks, and the `npm run verify` gate (typecheck + rules + 377 tests).

### XHH-Coco — Module A (Knowledge Base, ~2,200 lines)

- Built `src/services/knowledge/`: extraction, local Markdown store, index, two-stage retrieval (keyword + LLM refine), ingest, and anchoring.
- Implemented **atomic knowledge pages**: one claim per page, classified into claim/method/result/limitation/definition.
- Implemented **page anchoring**: the model never reports page numbers (empirically 0/20 correct); instead, a verbatim quote is reverse-located to the real page with 100% hit rate.
- Enforced the data iron law: no `paperId + page` anchor → not admitted to the knowledge base.

### aqiu — Module B (Tool Library, ~2,600 lines)

- Built `src/services/toolsynth/`: method extraction, tool generation, rendering, smoke testing, and a doctor report.
- Implemented **method → executable tool**: papers' methods become typed, validated, callable tools (`buildTool` + zod schema + deterministic implementation).
- Added cross-field validation (e.g. `success_rate` rejects `successes > total`) and fail-closed behavior (a failing tool never crashes the process).
- Enforced the data iron law: no `evidencePage` → method not admitted to the tool library.

### B1eberz — Module C (Skill Library)

- Built `src/services/skills/`: store, matching, manifest, generation, injection, and the seven-section structure.
- Implemented **seven-section skills** (applicability / workflow / criteria / failure modes / parameters / evidence / don'ts) with consensus grading (`evidence:3` for practices supported by ≥3 papers).
- Implemented skill matching that loads the right skill into the agent's context per task.
- Enforced the data iron law: a skill is never activated until it is human-reviewed (`reviewedBy`).

---

## 3. Development Process

The project was built in a **4-day sprint** (deadline 2026-10-31 23:59 HKT).

### Day 1 — Architecture & Contracts
- Wrote `AGENTS.md`, `SRS`, `SDD`, and `DECISIONS.md` (the "why" documents).
- Froze the 6 interface contracts and the message format (DeepSeek/OpenAI — not Anthropic).
- Stood up the agent loop skeleton and the `npm run verify` pipeline.

### Day 2–3 — Three Modules in Parallel
- XHH-Coco, aqiu, and B1eberz built Modules A, B, C **independently** against the frozen contracts.
- The team lead integrated SciencePal (DEC-032: SciencePal as a tool node, not a dev tool), the DeepSeek client, and the thin-shell Web UI.
- The offline replay capability was added so the live demo can never fail to a network outage.

### Day 3–4 — Hardening & Submission
- Full code review of each module; fixed cross-field validation and sandbox-compat defects.
- Built the Web UI: drag-drop PDF parsing → visualized workflow → three library views.
- Created the custom SciencePal Agent and verified it end-to-end (3 atomic claims, verbatim quotes).
- `npm run verify` all green: **377 tests pass, 0 fail, 1 skip**.
- Produced submission materials (project info, description, originality statement, video script) and the mascot.

---

## 4. Architecture

```
entry (CLI / Web)
  → UI (event bus → SSE / terminal renderer)
    → orchestration (agent loop, tool registry)
      → tools (knowledge_search, sciencepal_query, generated tools)
        → services (knowledge / skills / toolsynth / paper / llm)
          → state (local Markdown store, fixtures cache, trace writer)
```

- **LLM**: DeepSeek (`deepseek-v4-pro` / `deepseek-v4-flash`), native `fetch`, streaming with retry.
- **SciencePal**: the main loop calls `sciencepal_query`, which invokes our custom Agent on the platform — this is the "substantive use" of SciencePal.
- **Thin-shell Web**: `web/` only imports `node:*` and the event bus; all business logic is injected from `main.ts`.

---

## 5. Usage Instructions

### Prerequisites
- **Node.js 24** (runs `.ts` directly).
- **DeepSeek API key** — https://platform.deepseek.com/api_keys
- *(optional)* **SciencePal API key** — for `sciencepal_query`.

### Setup
```bash
npm install            # add --cache ./.tools/npm-cache if npm complains about cache permissions
cp .env.example .env   # fill DEEPSEEK_API_KEY (and optionally SCIENCEPAL_API_KEY)
```

### CLI
```bash
node src/main.ts ingest <paper.pdf|dir>   # paper → knowledge pages (A) + skill draft (C)
node src/main.ts ask "<task>"             # run the agent (live)
node src/main.ts ask "<task>" --replay    # offline replay (zero network)
node src/main.ts web --fake               # start the Web UI at http://127.0.0.1:7777
node src/main.ts tools doctor             # tool health report
node src/main.ts skills list|check|promote
```

### Web UI
1. Open http://127.0.0.1:7777.
2. **Drag a PDF** into the drop zone, click **开始解析 (Start Parsing)**.
3. A dialog shows what was distilled into A (knowledge) / B (tools) / C (skill draft).
4. Click the three **library buttons** to view / delete knowledge pages, tools, and skills.
5. Type a task in the top bar to run the agent end-to-end.

### Offline Demo (recommended for the live pitch)
```bash
node src/main.ts ask "Summarize the method of this paper" --record   # record responses
node src/main.ts ask "Summarize the method of this paper" --replay   # replay, zero network
```

### Verify
```bash
npm run verify    # typecheck + rule check + 377 tests
```

---

## 6. Key Design Decisions & Constraints

1. **SciencePal as a tool node (DEC-032)** — SciencePal is a first-class tool in our own main loop, not a dev tool for writing docs.
2. **Zero SDK** — DeepSeek and SciencePal are called via native `fetch`; no langchain/openai/agent frameworks.
3. **Frozen contracts** — 6 interface files are immutable; parallel work never collides.
4. **Four data iron laws** — no page anchor → not in knowledge; no evidence page → not in tools; parse quality < 0.7 → quarantined; skill not human-reviewed → not active.
5. **Thin-shell Web** — the Web layer carries no business logic.
6. **Offline replay** — the whole demo can run with zero network.

---

## 7. Testing & Validation

- **377 automated tests** (typecheck + 6 rule groups + unit/integration), 0 failures.
- **Page anchoring** validated on real papers: model-reported page numbers are 0/20 correct, while quote-based reverse-lookup locates the true page with **100% hit rate**.
- **SciencePal Agent** verified: close-reading produced 3 atomic claims with verbatim quotes and no invented page numbers.

---

## 8. Links

- **GitHub (public)**: https://github.com/xingshuai01/hackathon-agent
- **SciencePal Agent**: https://sciencepal.ai/agents/ae5aaadf-41c2-41e1-9b33-dbe5b8d6226e
- **Demo thread**: https://sciencepal.ai/projects/-/thread/8c01b81f-56b9-4905-bdae-00a203757cbb
