<!--
  技能草案 · 自动生成,未经人工审核。
  生成时间:2026-10-31T05:01:10.544Z

  ★ 状态固定为 needs_review。补齐下面几项后才能进技能库:
    - 第 3 节「三、方法→工具映射」为空:需要 B 模块的真实工具名清单才能填,生成器不猜工具名
    - 第 4 节「四、常见失败模式」为空:知识页里没有对应内容,需人工补写
    - 第 5 节「五、术语消歧」为空:知识页里没有对应内容,需人工补写
    - 第 7 节「七、负向约束」为空:知识页里没有对应内容,需人工补写

  审核方式:补齐后运行
    node src/main.ts skills promote paper-arxiv-2210.03629
  校验不通过会被拒绝写入,并列出还差什么。
-->
---
skillId: paper-arxiv-2210.03629
name: REAC T : SYNERGIZING REASONING AND ACTING IN LANGUAGE MODELS
domain: 待人工填写
version: 0.1.0
description: 从《REAC T : SYNERGIZING REASONING AND ACTING IN LANGUAGE MODELS》抽取的方法草案(需跨论文比对后合并)
whenToUse: 当任务涉及 REAC T : SYNERGIZING REASONING AND ACTING IN LANGUAGE MODELS 所描述的方法、指标或结论时使用
loadWhen: {"keywords":[],"taskTypes":[]}
allowedTools: []
status: needs_review
---

## 一、领域地图
- {"concept":"Action Space We design a simple Wikipedia web API with three types of actions to support interactive information retrie…","note":"Action Space We design a simple Wikipedia web API with three types of actions to support interactive information retrieval: (1) search[entity], which returns t…"}
- {"concept":"Similar to Figure 1(d), each trajectory consists of multiple thought-action-observation steps (i.e.","note":"Similar to Figure 1(d), each trajectory consists of multiple thought-action-observation steps (i.e. dense thought), where free-form thoughts are used for vario…"}
- {"concept":"Figure 2: PaLM-540B prompting results with respect to a HotpotQA EM is 27.1, 28.9, 33.8 for Standard, CoT, number of Co…","note":"Figure 2: PaLM-540B prompting results with respect to a HotpotQA EM is 27.1, 28.9, 33.8 for Standard, CoT, number of CoT-SC samples used."}
- {"concept":"Finetuning Due to the challenge of manually annotating reasoning traces and actions at scale, we consider a bootstrapin…","note":"Finetuning Due to the challenge of manually annotating reasoning traces and actions at scale, we consider a bootstraping approach similar to Zelikman et al. (2…"}
- {"concept":"We have proposed ReAct – a simple yet effective method for synergizing reasoning and acting in large language models.","note":"We have proposed ReAct – a simple yet effective method for synergizing reasoning and acting in large language models. Through a diverse set of experiments on m…"}
- {"concept":"While large language models (LLMs) have demonstrated impressive performance across tasks in language understanding and…","note":"While large language models (LLMs) have demonstrated impressive performance across tasks in language understanding and interactive decision making, their abili…"}
- {"concept":"We may also act (open a cookbook to read the recipe, open the fridge, check ingredients) to support the reasoning and t…","note":"We may also act (open a cookbook to read the recipe, open the fridge, check ingredients) to support the reasoning and to answer questions (“What dish can I mak…"}
- {"concept":"Consider a general setup of an agent interacting with an environment for task solving.","note":"Consider a general setup of an agent interacting with an environment for task solving. At time step t, an agent receives an observation ot ∈ O from the environ…"}
- {"concept":"We begin with knowledge-intensive reasoning tasks like multi-hop question answering and fact verification.","note":"We begin with knowledge-intensive reasoning tasks like multi-hop question answering and fact verification. As shown in Figure 1(1d), by interacting with a Wiki…"}
- {"concept":"Domains We consider two datasets challenging knowledge retrieval and reasoning: (1) Hot- PotQA (Yang et al., 2018), a m…","note":"Domains We consider two datasets challenging knowledge retrieval and reasoning: (1) Hot- PotQA (Yang et al., 2018), a multi-hop question answering benchmark th…"}
- {"concept":"We also test ReAct on two language-based interactive decision-making tasks, ALFWorld and WebShop, both of which feature…","note":"We also test ReAct on two language-based interactive decision-making tasks, ALFWorld and WebShop, both of which feature complex environments that require agent…"}
- {"concept":"Both shortcomings can be addressed in the ReAct paradigm.","note":"Both shortcomings can be addressed in the ReAct paradigm. More details about ReAct-IM is in Appendix B.2. An example prompt for ReAct-IM can be found in Append…"}
- {"concept":"E.1 SUCCESS AND FAILURE MODES ANALYSIS We provide some examples corresponding to the success and error mode analysis gi…","note":"E.1 SUCCESS AND FAILURE MODES ANALYSIS We provide some examples corresponding to the success and error mode analysis given in Sec. 3.3."}
- {"concept":"Answer: Psych (label: Psych is an American detective comedy-drama) 33","note":"Answer: Psych (label: Psych is an American detective comedy-drama) 33"}
## 二、标准流程
- {"stage":"1. Action Space We design a simple Wikipedia web API with three types of actions to support interactive information retrie…","input":"（草案·需人工确认）","action":"Action Space We design a simple Wikipedia web API with three types of actions to support interactive information retrieval: (1) search[entity], which returns t…","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"2. Similar to Figure 1(d), each trajectory consists of multiple thought-action-observation steps (i.e.","input":"（草案·需人工确认）","action":"Similar to Figure 1(d), each trajectory consists of multiple thought-action-observation steps (i.e. dense thought), where free-form thoughts are used for vario…","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"3. Figure 2: PaLM-540B prompting results with respect to a HotpotQA EM is 27.1, 28.9, 33.8 for Standard, CoT, number of Co…","input":"（草案·需人工确认）","action":"Figure 2: PaLM-540B prompting results with respect to a HotpotQA EM is 27.1, 28.9, 33.8 for Standard, CoT, number of CoT-SC samples used.","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"4. Finetuning Due to the challenge of manually annotating reasoning traces and actions at scale, we consider a bootstrapin…","input":"（草案·需人工确认）","action":"Finetuning Due to the challenge of manually annotating reasoning traces and actions at scale, we consider a bootstraping approach similar to Zelikman et al. (2…","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"5. We have proposed ReAct – a simple yet effective method for synergizing reasoning and acting in large language models.","input":"（草案·需人工确认）","action":"We have proposed ReAct – a simple yet effective method for synergizing reasoning and acting in large language models. Through a diverse set of experiments on m…","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
## 三、方法→工具映射
## 四、常见失败模式
## 五、术语消歧
## 六、证据索引
- {"claim":"While large language models (LLMs) have demonstrated impressive performance across tasks in language understanding and…","noteId":"arxiv:2210.03629#p1#fb8757"}
- {"claim":"We may also act (open a cookbook to read the recipe, open the fridge, check ingredients) to support the reasoning and t…","noteId":"arxiv:2210.03629#p1#eef101"}
- {"claim":"Consider a general setup of an agent interacting with an environment for task solving.","noteId":"arxiv:2210.03629#p3#8b8ae0"}
- {"claim":"We begin with knowledge-intensive reasoning tasks like multi-hop question answering and fact verification.","noteId":"arxiv:2210.03629#p4#aedaf7"}
- {"claim":"Domains We consider two datasets challenging knowledge retrieval and reasoning: (1) Hot- PotQA (Yang et al., 2018), a m…","noteId":"arxiv:2210.03629#p4#a1af71"}
- {"claim":"ReAct outperforms Act consistently Table 1 shows HotpotQA and Fever results using PaLM- 540B as the base model with dif…","noteId":"arxiv:2210.03629#p5#724067"}
- {"claim":"As all prompting methods are still significantly far from domain-specific state-of-the-art approaches (Table 1), we bel…","noteId":"arxiv:2210.03629#p6#e09658"}
- {"claim":"We also test ReAct on two language-based interactive decision-making tasks, ALFWorld and WebShop, both of which feature…","noteId":"arxiv:2210.03629#p7#5e9e7a"}
- {"claim":"Both shortcomings can be addressed in the ReAct paradigm.","noteId":"arxiv:2210.03629#p8#e63ac8"}
- {"claim":"On HotpotQA, we randomly sample a subset of 500 validation questions.","noteId":"arxiv:2210.03629#p14#8cc8f1"}
- {"claim":"This paradigm is also more than human dialogue to update the goal or subgoal as in Huang et al.","noteId":"arxiv:2210.03629#p15#8c53d4"}
- {"claim":"B.1 HOTPOTQA FINETUNING DETAILS For all finetuning we use a batch size of 64.","noteId":"arxiv:2210.03629#p15#4d2718"}
- {"claim":"B.2 ALFWORLD IM-STYLE DETAILS For the IM-style ablation, the same expert trajectories used in ReAct are reannotated wit…","noteId":"arxiv:2210.03629#p15#354bcd"}
- {"claim":"E.1 SUCCESS AND FAILURE MODES ANALYSIS We provide some examples corresponding to the success and error mode analysis gi…","noteId":"arxiv:2210.03629#p32#d4ef35"}
- {"claim":"Answer: Psych (label: Psych is an American detective comedy-drama) 33","noteId":"arxiv:2210.03629#p33#9816ce"}
## 七、负向约束
