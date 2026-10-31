# 04 · Originality and Resource-Use Declaration — Science Agent Coworker Hajimi

> Submission copy for *Global AI4Science Hackathon 2026*.
> Everything below is verifiable from the repository: `git log`, `package.json`, and the gate command
> `npm run verify`.

## 1. Summary statement

All source code, design documents, contracts and test suites in this project were created **during the
hackathon period**. The repository's first commit is dated **2026-10-26** and precedes no imported
work; there is no pre-existing product, codebase or dataset carried into this submission. The project
uses two hosted model services and two open-source libraries; all are listed below with their role,
and none of them is an agent framework.

## 2. Models used

<!-- colw:11,22,44,23 -->

| Service | Model / agent | How it is used | Interface |
|---|---|---|---|
| DeepSeek | `deepseek-v4-pro` (primary), `deepseek-v4-flash` (cheap tasks) | Main loop reasoning and tool calling; two-stage retrieval refinement; method-spec extraction | OpenAI-compatible REST, called with Node's native `fetch`. **No vendor SDK, no LangChain/LangGraph/AutoGen/OpenAI/Anthropic SDK/LlamaIndex.** Thinking mode explicitly disabled. |
| SciencePal | Built-in **Survey Agent** | The default in code; **none of this submission's data comes from it** | `POST /agent/initiate`, `GET /agent-run/{id}/stream` (SSE), `GET /agent-run/{id}` |
| SciencePal | Custom **Research Distiller** (`9e70403e-…`, created by WAN Yihui) | What `sciencepal_query` actually calls; executed every measured run behind `fixtures/reading/` (run `452938f7`) | Same, injected via `SCIENCEPAL_AGENT_ID` |
| SciencePal | Custom **Paper Close Reader** (`ae5aaadf-…`, created by WANG Xingshuai) | Close-reading configuration: claims with verbatim quotes, no page numbers (see §5). One real run was issued (`1eaab751`); it stopped at `asked` because a 20,000 budget sits below the platform's fixed overhead, and produced no deposited data | Same, `agent_id` selected per call |

Both services are used **inside the product's core loop**, not for writing promotional text, editing
prose, or producing slides. Run attribution is read from the `agentId` field of
`fixtures/runs/<runId>/manifest.json`, never asserted in prose; all three manifests are committed.

## 3. Data used

| Data | Source / licence | How it enters the system | Redistribution |
|---|---|---|---|
| 4 research papers (ReAct 2210.03629, Transformer 1706.03762, BERT 1810.04805, RAG 2005.11401) | arXiv, publicly available preprints | Parsed locally; converted into atomic notes | **PDFs are not redistributed.** They are excluded from the repository by `.gitignore` (`fixtures/papers/*.pdf`); only public arXiv identifiers are recorded so anyone can re-fetch them |
| Verbatim quotes extracted from those papers | Short excerpts, quoted for evidence and citation (research-quotation use) | Stored as the provenance anchor of each atomic note | Short quotations only, always attributed to paper and page. No full-text reproduction |
| Synthesised demo fixtures (`fixtures/`) | Produced by our own pipeline | Replayable demo and test data | Original to this project |

No personal data, no patient or clinical data, no human-subject data and no proprietary or licensed
datasets are used anywhere in this project. No web scraping of paywalled or access-controlled
literature was performed. No user studies involving human participants were conducted, so no ethics
approval was required.

## 4. Code and third-party components

**Written by us** — 12,404 lines of TypeScript/JavaScript source and 5,510 lines of tests, plus 21
design documents (requirements, architecture, decisions log, code rules, review reports). The
architecture, the six frozen interface contracts, the agent main loop, all three library modules, the
web shell and the rule checker are original work of this team.

**Runtime dependencies (2)**

| Package | Version | Licence | Role |
|---|---|---|---|
| `zod` | 4.6.7 | MIT | Input schema validation for every tool |
| `pdfjs-dist` | 6.4.299 | Apache-2.0 | PDF text extraction with page boundaries |

**Development dependencies (2)**: `typescript` 5.9.3 (Apache-2.0), `@types/node` 24.19.2 (MIT).

No agent framework, orchestration library or vendor SDK is used. This was a deliberate constraint:
the project enforces a dependency allow-list mechanically in CI.

**Third-party reference material — read, not copied.** The architecture of an established coding agent
was studied through its public documentation and an externally published source mirror, in order to
learn design patterns (event bus, fail-closed capabilities, three-stage tool pipeline). That mirror is
`gitignore`d, is **not** part of this repository, and **no code was copied from it**; only design ideas
were adopted and re-implemented. This is recorded as decision `DEC-024` in our decisions log.

## 5. Original contributions (what is actually new here)

For honesty, we separate "new" from "assembled well":

1. **Quote-anchored provenance instead of model-reported pages.** In two instrumented reading runs
   (ReAct arXiv 2210.03629, 20 claims; Transformer arXiv 1706.03762, 18 claims), **1 of 38**
   self-reported page numbers was right — the rest were off by +1 (28 cases), +2 (7), −4 (1) or −3 (1),
   so no arithmetic correction exists. The quotes, by contrast, were locatable **38/38**. We state this
   as a **design-settling observation, not a measured error rate**: it settles whether a page number
   may ever be taken on trust. The system therefore reverse-locates the verbatim quote against the
   PDF's own page boundaries — **99.7%–100%** locate rate over 80 notes. This turns "the model says
   so" into "the page says so".
2. **Tools grown from papers.** Methods are extracted as specifications carrying an evidence page, then
   rendered by a deterministic template into runnable tools, each shipped with a smoke test. Where no
   verified implementation exists, the system degrades to a parameter template for human completion and
   records why — it never emits plausible-looking code silently.
3. **Correction of silent-wrong-answer failure modes.** During review we found generated tools accepting
   impossible inputs (`success_rate(11,10)` returning "110%"). Cross-field validation was added to the
   template layer and covered by regression tests. We report this because "it runs" and "it is right"
   are different claims.
4. **Governance gate on skills.** A skill cannot become `active` without human review; drafts live in a
   separate queue. Consensus claims must be tagged with the number of independent papers supporting
   them, and a single-paper practice must be labelled as "only seen in individual studies".

## 6. Pre-existing work vs. work produced during the hackathon

| Category | Pre-existing before the event | Produced during the event |
|---|---|---|
| Source code | **None** | All 12,404 lines (first commit 2026-10-26) |
| Tests | **None** | All 5,510 lines, 378 passing tests |
| Design documents | **None** | All 21 documents |
| Datasets | Four public arXiv papers (public prior art, not our creation) | All derived notes, fixtures, tools, skills |
| SciencePal agent | Platform-provided built-in agents | **Two** custom agents created by us ("Research Distiller", "Paper Close Reader"), on two members' accounts |

Repository evidence: 40 commits between 2026-10-26 and 2026-10-31, all authored by team members.

<!-- pagebreak -->

## 7. Team division of work

The team consists of **three members**, as registered.

| Member | Responsibility | Primary artefacts |
|---|---|---|
| **WANG Xingshuai** | Architecture, the six frozen interface contracts, agent main loop, LLM layer, tool registry, CLI, web shell | `src/agent/`, `src/services/llm/`, `src/tools/types.ts`, `src/ui/`, `web/` |
| **WAN Yihui** | Knowledge library: paper parsing, quote→page anchoring, extraction, storage, retrieval, ingestion orchestration. Also owns delivery-standard QA and the production of all submission artefacts | `src/services/knowledge/`, `src/services/paper/` |
| **ZHOU Yixuan** | Tool library: method extraction, spec validation, tool rendering, smoke tests, health checks. Skill library: seven-section structure, matching, prompt injection, draft review flow | `src/services/toolsynth/`, `src/tools/generated/`, `src/services/skills/` |

*Note for reviewers: commits in the repository appear under several local git identities
(`xingshuai01`, `XHH520`, `Don`, `aqiu`) because each member committed from more than one machine or
account. All of them belong to the three members listed above; `git log` is the authoritative record
of who changed what and when.*

## 8. AI-assisted development disclosure

We used AI coding assistants during the event, as most teams do. To keep this honest and auditable:

- **Humans decided** the product direction, the module boundaries, the six frozen interface contracts,
  the data-integrity rules and every trade-off recorded in the decisions log.
- **AI assistants drafted** a substantial share of implementation code, tests and documentation.
- **Every change passed a mechanical gate** before acceptance: `npm run typecheck` (0 errors),
  `npm run check:rules` (a custom checker enforcing dependency allow-list, import boundaries, banned
  `any`/`enum`/`namespace`), and `npm test` (378 tests, 0 failures).
- **Every change was reviewed** by a human, and the review findings are themselves committed as a
  document (`docs/REVIEW-2026-10-29.md`, `docs/REVIEW-B-2026-10-30.md`) — including defects we found and
  fixed, and known gaps we did not fix.

We state this explicitly because the evaluation criterion asks whether AI is doing the core work or
merely adding complexity. In our system, AI is deployed where it changes the result — reading papers,
extracting methods, distilling skills — and it is surrounded by verification that a human designed.

<!-- pagebreak -->

## 9. Compliance statement

- No restricted or prohibited library, model SDK or agent framework is used (enforced by an automated
  checker, not by convention).
- No personal, confidential, clinical or licensed data is processed or stored.
- Copyrighted PDFs are not redistributed; only short attributed quotations are retained.
- SciencePal is used for a **core product function**: literature close reading invoked as a tool node
  inside the main loop, whose output is consumed programmatically by our pipeline. The hackathon rules
  exclude using SciencePal *only* for copywriting, polishing or slide production; our claim rests on the
  runtime integration, not on any text assistance.
- Known limitations are disclosed rather than hidden: table and figure extraction is currently empty,
  PDF title cleaning is imperfect, one generated tool intentionally degrades to a parameter template,
  4 of 5 skills are drafts awaiting human review, and the page-number finding covers **two papers
  (38 claims)** — we treat it as a design-settling observation, not a measured error rate.

## Appendix — where each number above can be checked

Nothing in this document has to be taken on our word. Each quantitative claim resolves to a committed
file or a command that anyone can run in the repository.

| Claim | How to check it |
|---|---|
| 378 passing tests, 0 type errors, 0 rule violations | `npm run verify` |
| 12,404 source lines and 5,510 test lines | `wc -l $(git ls-files "*.ts")` |
| 40 commits between 2026-10-26 and 2026-10-31, all by team members | `git log --since=2026-10-26 --until=2026-10-31` |
| 80 atomic notes derived from 4 papers | `fixtures/knowledge/INDEX.md` |
| 38 claims across 2 papers; 1/38 self-reported pages correct; 38/38 quotes locatable; offsets +1×28, +2×7, −4×1, −3×1 | `fixtures/reading/react-2210.03629.anchor-verify.json`, `fixtures/reading/transformer-1706.03762.anchor-verify.json` |
| Which agent executed which run, and what it cost | `fixtures/runs/<runId>/manifest.json` — `agentId`, `inputSha256` |
| Why a budget of 8,000 or 20,000 cannot finish a run | `fixtures/runs/README.md` |
| No banned dependency, no agent framework | `npm run check:rules` |
| The item-② link opens anonymously and shows this real run | `curl -sI https://sciencepal.ai/share/7cc3f00e-1999-4c3d-9c32-e842399ac817`; the page shows the original prompt, every step of execution and the token accounting — verified in a zero-cookie browser with no login wall |

> On the nature of item ②: the current platform version offers no "publicly chattable custom agent"
> (no publish action in the front end; the marketplace endpoint returns `Custom agent disabled`), so the
> link is a **public replay of the complete run**, not a session a visitor can continue. The live run is
> covered by the 3–5 minute demo video; local reproduction is `node src/main.ts web` or `--replay`.
