<!--
  技能草案 · 自动生成,未经人工审核。
  生成时间:2026-10-31T05:01:08.430Z

  ★ 状态固定为 needs_review。补齐下面几项后才能进技能库:
    - 第 3 节「三、方法→工具映射」为空:需要 B 模块的真实工具名清单才能填,生成器不猜工具名
    - 第 4 节「四、常见失败模式」为空:知识页里没有对应内容,需人工补写
    - 第 7 节「七、负向约束」为空:知识页里没有对应内容,需人工补写

  审核方式:补齐后运行
    node src/main.ts skills promote paper-arxiv-1810.04805
  校验不通过会被拒绝写入,并列出还差什么。
-->
---
skillId: paper-arxiv-1810.04805
name: BERT: Pre-training of Deep Bidirectional Transformers for L…
domain: 待人工填写
version: 0.1.0
description: 从《BERT: Pre-training of Deep Bidirectional Transformers for L…》抽取的方法草案(需跨论文比对后合并)
whenToUse: 当任务涉及 BERT: Pre-training of Deep Bidirectional Transformers for L… 所描述的方法、指标或结论时使用
loadWhen: {"keywords":[],"taskTypes":[]}
allowedTools: []
status: needs_review
---

## 一、领域地图
- {"concept":"most widely-used approaches in this section.","note":"most widely-used approaches in this section."}
- {"concept":"decades, including non-neural (Brown et al., 1992; More recently, sentence or document encoders Ando and Zhang, 2005; B…","note":"decades, including non-neural (Brown et al., 1992; More recently, sentence or document encoders Ando and Zhang, 2005; Blitzer et al., 2006) and which produce c…"}
- {"concept":"Pre-trained word embeddings fine-tuned for a supervised downstream task (Dai are an integral part of modern NLP systems…","note":"2014) methods. Pre-trained word embeddings fine-tuned for a supervised downstream task (Dai are an integral part of modern NLP systems, of- and Le, 2015; Howar…"}
- {"concept":"We introduce BERT and its detailed implementa- We primarily report results on two model sizes:","note":"We introduce BERT and its detailed implementa- We primarily report results on two model sizes:"}
- {"concept":"ablation studies can be found in Appendix C.","note":"ablation studies can be found in Appendix C."}
- {"concept":"In this section, we explore the effect of model size","note":"In this section, we explore the effect of model size"}
- {"concept":"All of the BERT results presented so far have used the fine-tuning approach, where a simple classifi- cation layer is a…","note":"All of the BERT results presented so far have used the fine-tuning approach, where a simple classifi- cation layer is added to the pre-trained model, and layer…"}
- {"concept":"The best performing method concatenates the by applying BERT to the CoNLL-2003 Named token representations from the top…","note":"performs competitively with state-of-the-art meth- In this section, we compare the two approaches ods. The best performing method concatenates the by applying …"}
- {"concept":"use a case-preserving WordPiece model, and we demonstrates that BERT is effective for both fine- include the maximal do…","note":"use a case-preserving WordPiece model, and we demonstrates that BERT is effective for both fine- include the maximal document context provided tuning and featu…"}
- {"concept":"Following standard practice, we for- mulate this as a tagging task but do not use a CRF","note":"by the data. Following standard practice, we for- mulate this as a tagging task but do not use a CRF"}
- {"concept":"B Detailed Experimental Setup The most comparable existing pre-training method to BERT is OpenAI GPT, which trains a B.…","note":"B Detailed Experimental Setup The most comparable existing pre-training method to BERT is OpenAI GPT, which trains a B.1 Detailed Descriptions for the GLUE lef…"}
- {"concept":"• GPT used the same learning rate of 5e-5 for tion, sentence) pairs which do contain the correct all fine-tuning experi…","note":"• GPT used the same learning rate of 5e-5 for tion, sentence) pairs which do contain the correct all fine-tuning experiments; BERT chooses a answer, and the ne…"}
- {"concept":"The fine-tuning approach, such as train deep bidirectional representations from the Generative Pre-trained Transformer…","note":"The fine-tuning approach, such as train deep bidirectional representations from the Generative Pre-trained Transformer (OpenAI unlabeled text by jointly condit…"}
- {"concept":"E[CLS] E1 ...","note":"E[CLS] E1 ... EN E[SEP] E1’ ... EM’ E[CLS] E1 ... EN E[SEP] E1’ ... EM’ [CLS] Tok 1 ... Tok N [SEP] Tok 1 ... TokM [CLS] Tok 1 ... Tok N [SEP] Tok 1 ... TokM M…"}
- {"concept":"S·C + E·C to the score of the best non-null span In this section, we perform ablation experiments 12 The TriviaQA data…","note":"S·C + E·C to the score of the best non-null span In this section, we perform ablation experiments 12 The TriviaQA data we used consists of paragraphs from over…"}
- {"concept":"both left and right context at every layer.","note":"both left and right context at every layer."}
## 二、标准流程
- {"stage":"1. most widely-used approaches in this section.","input":"（草案·需人工确认）","action":"most widely-used approaches in this section.","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"2. decades, including non-neural (Brown et al., 1992; More recently, sentence or document encoders Ando and Zhang, 2005; B…","input":"（草案·需人工确认）","action":"decades, including non-neural (Brown et al., 1992; More recently, sentence or document encoders Ando and Zhang, 2005; Blitzer et al., 2006) and which produce c…","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"3. Pre-trained word embeddings fine-tuned for a supervised downstream task (Dai are an integral part of modern NLP systems…","input":"（草案·需人工确认）","action":"2014) methods. Pre-trained word embeddings fine-tuned for a supervised downstream task (Dai are an integral part of modern NLP systems, of- and Le, 2015; Howar…","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"4. We introduce BERT and its detailed implementa- We primarily report results on two model sizes:","input":"（草案·需人工确认）","action":"We introduce BERT and its detailed implementa- We primarily report results on two model sizes:","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"5. ablation studies can be found in Appendix C.","input":"（草案·需人工确认）","action":"ablation studies can be found in Appendix C.","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"6. In this section, we explore the effect of model size","input":"（草案·需人工确认）","action":"In this section, we explore the effect of model size","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"7. All of the BERT results presented so far have used the fine-tuning approach, where a simple classifi- cation layer is a…","input":"（草案·需人工确认）","action":"All of the BERT results presented so far have used the fine-tuning approach, where a simple classifi- cation layer is added to the pre-trained model, and layer…","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"8. The best performing method concatenates the by applying BERT to the CoNLL-2003 Named token representations from the top…","input":"（草案·需人工确认）","action":"performs competitively with state-of-the-art meth- In this section, we compare the two approaches ods. The best performing method concatenates the by applying …","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"9. use a case-preserving WordPiece model, and we demonstrates that BERT is effective for both fine- include the maximal do…","input":"（草案·需人工确认）","action":"use a case-preserving WordPiece model, and we demonstrates that BERT is effective for both fine- include the maximal document context provided tuning and featu…","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"10. Following standard practice, we for- mulate this as a tagging task but do not use a CRF","input":"（草案·需人工确认）","action":"by the data. Following standard practice, we for- mulate this as a tagging task but do not use a CRF","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"11. B Detailed Experimental Setup The most comparable existing pre-training method to BERT is OpenAI GPT, which trains a B.…","input":"（草案·需人工确认）","action":"B Detailed Experimental Setup The most comparable existing pre-training method to BERT is OpenAI GPT, which trains a B.1 Detailed Descriptions for the GLUE lef…","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"12. • GPT used the same learning rate of 5e-5 for tion, sentence) pairs which do contain the correct all fine-tuning experi…","input":"（草案·需人工确认）","action":"• GPT used the same learning rate of 5e-5 for tion, sentence) pairs which do contain the correct all fine-tuning experiments; BERT chooses a answer, and the ne…","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
## 三、方法→工具映射
## 四、常见失败模式
## 五、术语消歧
- {"term":"There is a long history of pre-training general lan- guage representations, and we briefly review the","disambiguation":"els. There is a long history of pre-training general lan- guage representations, and we briefly review the"}
## 六、证据索引
- {"claim":"The fine-tuning approach, such as train deep bidirectional representations from the Generative Pre-trained Transformer…","noteId":"arxiv:1810.04805#p1#32d83b"}
- {"claim":"These include sentence-level tasks such as In this paper, we improve the fine-tuning based natural language inference (…","noteId":"arxiv:1810.04805#p1#39e799"}
- {"claim":"E[CLS] E1 ...","noteId":"arxiv:1810.04805#p3#3771a1"}
- {"claim":"In this section, we present BERT fine-tuning re-","noteId":"arxiv:1810.04805#p5#e733b6"}
- {"claim":"S·C + E·C to the score of the best non-null span In this section, we perform ablation experiments 12 The TriviaQA data…","noteId":"arxiv:1810.04805#p7#a2ae70"}
- {"claim":"both left and right context at every layer.","noteId":"arxiv:1810.04805#p8#e5c5fa"}
- {"claim":"Hyperparams Dev Set Accuracy #L #H #A LM (ppl) MNLI-m MRPC SST-2 Recent empirical improvements due to transfer learning…","noteId":"arxiv:1810.04805#p9#cbbae5"}
## 七、负向约束
