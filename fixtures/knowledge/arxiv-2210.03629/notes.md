---
paperId: "arxiv:2210.03629"
title: "REAC T : SYNERGIZING REASONING AND ACTING IN LANGUAGE MODELS"
notes: 20
updated_at: 2026-10-31T05:01:10.531Z
---

# REAC T : SYNERGIZING REASONING AND ACTING IN LANGUAGE MODELS

## p1 · fb8757

- noteId: "arxiv:2210.03629#p1#fb8757"
- paperId: "arxiv:2210.03629"
- page: 1
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：While large language models (LLMs) have demonstrated impressive performance across tasks in language understanding and…

**证据**（p1）：

> While large language models (LLMs) have demonstrated impressive performance across tasks in language understanding and interactive decision making, their abilities for reasoning (e.g. chain-of-thought prompting) and acting (e.g. action plan generation) have primarily been studied as separate topics. In this paper, we explore the use of LLMs to generate both reasoning traces and task-specific actions in an interleaved manner, allowing for greater synergy between the two: reasoning traces help the model induce, track, and update action plans as well as handle exceptions, while actions allow it to interface with and gather additional information from external sources such as knowledge bases or environments.

## p1 · eef101

- noteId: "arxiv:2210.03629#p1#eef101"
- paperId: "arxiv:2210.03629"
- page: 1
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：We may also act (open a cookbook to read the recipe, open the fridge, check ingredients) to support the reasoning and t…

**证据**（p1）：

> We may also act (open a cookbook to read the recipe, open the fridge, check ingredients) to support the reasoning and to answer questions (“What dish can I make right now?”). This tight synergy between “acting” and “reasoning” allows humans to learn new tasks quickly and perform robust decision making or reasoning, even under previously unseen circumstances or facing information uncertainties.

## p3 · 8b8ae0

- noteId: "arxiv:2210.03629#p3#8b8ae0"
- paperId: "arxiv:2210.03629"
- page: 3
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：Consider a general setup of an agent interacting with an environment for task solving.

**证据**（p3）：

> Consider a general setup of an agent interacting with an environment for task solving. At time step t, an agent receives an observation ot ∈ O from the environment and takes an action at ∈ A following some policy π(at|ct), where ct = (o1, a1, · · · , ot−1, at−1, ot) is the context to the agent.

## p4 · aedaf7

- noteId: "arxiv:2210.03629#p4#aedaf7"
- paperId: "arxiv:2210.03629"
- page: 4
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：We begin with knowledge-intensive reasoning tasks like multi-hop question answering and fact verification.

**证据**（p4）：

> We begin with knowledge-intensive reasoning tasks like multi-hop question answering and fact verification. As shown in Figure 1(1d), by interacting with a Wikipedia API, ReAct is able to retrieve information to support reasoning, while also use reasoning to target what to retrieve next, demonstrating a synergy of reasoning and acting.

## p4 · a1af71

- noteId: "arxiv:2210.03629#p4#a1af71"
- paperId: "arxiv:2210.03629"
- page: 4
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：Domains We consider two datasets challenging knowledge retrieval and reasoning: (1) Hot- PotQA (Yang et al., 2018), a m…

**证据**（p4）：

> Domains We consider two datasets challenging knowledge retrieval and reasoning: (1) Hot- PotQA (Yang et al., 2018), a multi-hop question answering benchmark that requires reasoning over two or more Wikipedia passages, and (2) FEVER (Thorne et al., 2018), a fact verification benchmark where each claim is annotated SUPPORTS, REFUTES, or NOT ENOUGH INFO, based on if there exists a Wikipedia passage to verify the claim. In this work, we operate in a question-only setup for both tasks, where models only receive the question/claim as input without access to support paragraphs, and have to rely on their internal knowledge or retrieve knowledge via interacting with an external environment to support reasoning.

## p4 · e2d173

- noteId: "arxiv:2210.03629#p4#e2d173"
- paperId: "arxiv:2210.03629"
- page: 4
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：Action Space We design a simple Wikipedia web API with three types of actions to support interactive information retrie…

**证据**（p4）：

> Action Space We design a simple Wikipedia web API with three types of actions to support interactive information retrieval: (1) search[entity], which returns the first 5 sentences from the corresponding entity wiki page if it exists, or else suggests top-5 similar entities from the Wikipedia search engine, (2) lookup[string], which would return the next sentence in the page containing string, simulating Ctrl+F functionality on the browser. (3) finish[answer], which would finish the current task with answer. We note that this action space mostly can only retrieve a small part of a passage based on exact passage name, which is significantly weaker than state-of-the- art lexical or neural retrievers. The purpose is to simulate how humans would interact with Wikipedia, and force models to retrieve via explicit reasoning in language.

## p4 · 253f5e

- noteId: "arxiv:2210.03629#p4#253f5e"
- paperId: "arxiv:2210.03629"
- page: 4
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：Similar to Figure 1(d), each trajectory consists of multiple thought-action-observation steps (i.e.

**证据**（p4）：

> Similar to Figure 1(d), each trajectory consists of multiple thought-action-observation steps (i.e. dense thought), where free-form thoughts are used for various purposes. Specifically, we use a combination of thoughts that decompose questions (“I need to search x, find y, then find z”), extract information from Wikipedia observations (“x was started in 1844”, “The paragraph does not tell x”), perform commonsense (“x is not y, so z must instead be...”) or arithmetic reasoning (“1844 < 1989”), guide 2 We find more examples do not improve performance.

## p5 · 17d15e

- noteId: "arxiv:2210.03629#p5#17d15e"
- paperId: "arxiv:2210.03629"
- page: 5
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：Figure 2: PaLM-540B prompting results with respect to a HotpotQA EM is 27.1, 28.9, 33.8 for Standard, CoT, number of Co…

**证据**（p5）：

> Figure 2: PaLM-540B prompting results with respect to a HotpotQA EM is 27.1, 28.9, 33.8 for Standard, CoT, number of CoT-SC samples used.

## p5 · 7b5536

- noteId: "arxiv:2210.03629#p5#7b5536"
- paperId: "arxiv:2210.03629"
- page: 5
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：Finetuning Due to the challenge of manually annotating reasoning traces and actions at scale, we consider a bootstrapin…

**证据**（p5）：

> Finetuning Due to the challenge of manually annotating reasoning traces and actions at scale, we consider a bootstraping approach similar to Zelikman et al. (2022), using 3,000 trajectories with correct answers generated by ReAct (also for other baselines) to finetune smaller language models (PaLM-8/62B) to decode trajectories (all thoughts, actions, observations) conditioned on input questions/claims. More details are in Appendix B.1.

## p5 · 724067

- noteId: "arxiv:2210.03629#p5#724067"
- paperId: "arxiv:2210.03629"
- page: 5
- kind: result
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：ReAct outperforms Act consistently Table 1 shows HotpotQA and Fever results using PaLM- 540B as the base model with dif…

**证据**（p5）：

> ReAct outperforms Act consistently Table 1 shows HotpotQA and Fever results using PaLM- 540B as the base model with different prompting methods. We note that ReAct is better than Act on both tasks, demonstrating the value of reasoning to guide acting, especially for synthesizing the final answer, as shown in Figure 1 (1c-d). Fine-tuning results 3 also confirm the benefit of reasoning traces for more informed acting.

## p6 · e09658

- noteId: "arxiv:2210.03629#p6#e09658"
- paperId: "arxiv:2210.03629"
- page: 6
- kind: result
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：As all prompting methods are still significantly far from domain-specific state-of-the-art approaches (Table 1), we bel…

**证据**（p6）：

> As all prompting methods are still significantly far from domain-specific state-of-the-art approaches (Table 1), we believe finetuning with more human-written data might be a better way to unleash the power of ReAct.

## p7 · 5e9e7a

- noteId: "arxiv:2210.03629#p7#5e9e7a"
- paperId: "arxiv:2210.03629"
- page: 7
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：We also test ReAct on two language-based interactive decision-making tasks, ALFWorld and WebShop, both of which feature…

**证据**（p7）：

> We also test ReAct on two language-based interactive decision-making tasks, ALFWorld and WebShop, both of which feature complex environments that require agents to act over long horizons with sparse rewards, warranting the need for reasoning to act and explore effectively.

## p8 · e63ac8

- noteId: "arxiv:2210.03629#p8#e63ac8"
- paperId: "arxiv:2210.03629"
- page: 8
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：Both shortcomings can be addressed in the ReAct paradigm.

**证据**（p8）：

> Both shortcomings can be addressed in the ReAct paradigm. More details about ReAct-IM is in Appendix B.2. An example prompt for ReAct-IM can be found in Appendix C.4, and an example trajectory in Appendix D.2.3. 8

## p9 · a3dcf4

- noteId: "arxiv:2210.03629#p9#a3dcf4"
- paperId: "arxiv:2210.03629"
- page: 9
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：We have proposed ReAct – a simple yet effective method for synergizing reasoning and acting in large language models.

**证据**（p9）：

> We have proposed ReAct – a simple yet effective method for synergizing reasoning and acting in large language models. Through a diverse set of experiments on multi-hop question-answering, fact checking, and interactive decision-making tasks, we show that ReAct leads to superior performance with interpretable decision traces. Despite the simplicity of our method, complex tasks with large action spaces require more demonstrations to learn well, which unfortunately can easily go beyond the input length limit of in-context learning. We explore the fine-tuning approach on HotpotQA 6 Human feedback can also be incorporated in a complementary manner but we leave it for future work.

## p14 · 8cc8f1

- noteId: "arxiv:2210.03629#p14#8cc8f1"
- paperId: "arxiv:2210.03629"
- page: 14
- kind: result
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：On HotpotQA, we randomly sample a subset of 500 validation questions.

**证据**（p14）：

> On HotpotQA, we randomly sample a subset of 500 validation questions. On ALFWorld, we use all 134 unseen validation task instances, and use the best prompt set according to PaLM-540B.

## p15 · 8c53d4

- noteId: "arxiv:2210.03629#p15#8c53d4"
- paperId: "arxiv:2210.03629"
- page: 15
- kind: result
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：This paradigm is also more than human dialogue to update the goal or subgoal as in Huang et al.

**证据**（p15）：

> is difficult for Act and previous RL methods, as a human cannot change the model parameters, and changing a few actions might not edit the rest of the model behavior. This paradigm is also more than human dialogue to update the goal or subgoal as in Huang et al. (2022b) — while editing ReAct thoughts can do these, it can also modify the model’s internal belief, reasoning styles, or anything the flexible thought space supports, for better task solving. We believe this is an exciting direction for human alignment and leave more systematic study as future work.

## p15 · 4d2718

- noteId: "arxiv:2210.03629#p15#4d2718"
- paperId: "arxiv:2210.03629"
- page: 15
- kind: result
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：B.1 HOTPOTQA FINETUNING DETAILS For all finetuning we use a batch size of 64.

**证据**（p15）：

> B.1 HOTPOTQA FINETUNING DETAILS For all finetuning we use a batch size of 64. On PaLM-8B, we finetune ReAct and Act methods for 4, 000 steps and Standard and CoT methods for 2, 000 steps. On PaLM-62B, we finetune ReAct and Act methods for 4, 000 steps and Standard and CoT methods for 1, 000 steps. We find ReAct and Act methods generally benefit from more training steps (and more training data), while Standard and CoT methods degrade soon after finetuning.

## p15 · 354bcd

- noteId: "arxiv:2210.03629#p15#354bcd"
- paperId: "arxiv:2210.03629"
- page: 15
- kind: result
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：B.2 ALFWORLD IM-STYLE DETAILS For the IM-style ablation, the same expert trajectories used in ReAct are reannotated wit…

**证据**（p15）：

> B.2 ALFWORLD IM-STYLE DETAILS For the IM-style ablation, the same expert trajectories used in ReAct are reannotated with dense external feedback thoughts within these trajectories, that limit ReAct-IM to only think about (1) decomposing the current goal and (2) the current subgoal that needs to be completed. In particular, ReAct-IM lacks thoughts that (1) determine when a subgoal is completed (2) determine what the next subgoal should be (3) inducing the LLM to refer to its internal pretraining knowledge to identify where items can be within the environment. 15

## p32 · d4ef35

- noteId: "arxiv:2210.03629#p32#d4ef35"
- paperId: "arxiv:2210.03629"
- page: 32
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：E.1 SUCCESS AND FAILURE MODES ANALYSIS We provide some examples corresponding to the success and error mode analysis gi…

**证据**（p32）：

> E.1 SUCCESS AND FAILURE MODES ANALYSIS We provide some examples corresponding to the success and error mode analysis given in Sec. 3.3.

## p33 · 9816ce

- noteId: "arxiv:2210.03629#p33#9816ce"
- paperId: "arxiv:2210.03629"
- page: 33
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:10.529Z

**描述**：Answer: Psych (label: Psych is an American detective comedy-drama) 33

**证据**（p33）：

> Answer: Psych (label: Psych is an American detective comedy-drama) 33
