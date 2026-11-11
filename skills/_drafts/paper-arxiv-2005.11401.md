<!--
  技能草案 · 自动生成,未经人工审核。
  生成时间:2026-11-01T14:20:52.653Z

  ★ 状态固定为 needs_review。补齐下面几项后才能进技能库:
    - 第 3 节「三、方法→工具映射」为空:需要 B 模块的真实工具名清单才能填,生成器不猜工具名
    - 第 5 节「五、术语消歧」为空:知识页里没有对应内容,需人工补写
    - 第 4 节只有 1 条失败模式,少于 3 条下限:草案不足以拦截真实翻车

  审核方式:补齐后运行
    node src/main.ts skills promote paper-arxiv-2005.11401
  校验不通过会被拒绝写入,并列出还差什么。
-->
---
skillId: paper-arxiv-2005.11401
name: rag-2005.11401.pdf
domain: 待人工填写
version: 0.1.0
description: 从《rag-2005.11401.pdf》抽取的方法草案(需跨论文比对后合并)
whenToUse: 当任务涉及 rag-2005.11401.pdf 所描述的方法、指标或结论时使用
loadWhen: {"keywords":[],"taskTypes":[]}
allowedTools: []
status: needs_review
---

## 一、领域地图
- {"concept":"To train the retriever and generator end-to-end, we treat the retrieved document as a latent variable.","note":"To train the retriever and generator end-to-end, we treat the retrieved document as a latent variable."}
- {"concept":"We propose two models that marginalize over the latent documents in different ways to produce a distribution over gener…","note":"We propose two models that marginalize over the latent documents in different ways to produce a distribution over generated text. In one approach, RAG-Sequence…"}
- {"concept":"RAG-Sequence Model The RAG-Sequence model uses the same retrieved document to generate the complete sequence.","note":"RAG-Sequence Model The RAG-Sequence model uses the same retrieved document to generate the complete sequence. Technically, it treats the retrieved document as …"}
- {"concept":"Concretely, the top K documents are retrieved using the retriever, and then the generator produces a distribution for t…","note":"Concretely, the top K documents are retrieved using the retriever, and then the generator produces a distribution for the next output token for each document, …"}
- {"concept":"∏N ∑ pRAG-Token(y|x) ≈ pη (z|x)pθ (yi|x, z, y1:i−1) i z∈top-k(p(·|x)) Finally, we note that RAG can be used for sequenc…","note":"∏N ∑ pRAG-Token(y|x) ≈ pη (z|x)pθ (yi|x, z, y1:i−1) i z∈top-k(p(·|x)) Finally, we note that RAG can be used for sequence classification tasks by considering th…"}
- {"concept":"To evaluate RAG’s generation abilities in a non-QA setting, we study open-domain question gen- eration.","note":"To evaluate RAG’s generation abilities in a non-QA setting, we study open-domain question gen- eration. Rather than use questions from standard open-domain QA …"}
- {"concept":"Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks †‡ ?","note":"Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks †‡ ?"}
- {"concept":"Pre-trained neural language models have been shown to learn a substantial amount of in-depth knowl- edge from data [47].","note":"Pre-trained neural language models have been shown to learn a substantial amount of in-depth knowl- edge from data [47]. They can do so without any access to a…"}
- {"concept":"The retrieval component pη (z|x) is based on DPR [26].","note":"The retrieval component pη (z|x) is based on DPR [26]. DPR follows a bi-encoder architecture:"}
- {"concept":"We jointly train the retriever and generator components without any direct supervision on what document should be retri…","note":"We jointly train the retriever and generator components without any direct supervision on what document should be retrieved. Given a fine-tuning training corpu…"}
- {"concept":"At test time, RAG-Sequence and RAG-Token require different ways to approximate arg maxy p(y|x).","note":"At test time, RAG-Sequence and RAG-Token require different ways to approximate arg maxy p(y|x)."}
- {"concept":"Open-domain question answering (QA) is an important real-world application and common testbed for knowledge-intensive t…","note":"Open-domain question answering (QA) is an important real-world application and common testbed for knowledge-intensive tasks [20]. We treat questions and answer…"}
- {"concept":"RAG models can go beyond simple extractive QA and answer questions with free-form, abstractive text generation.","note":"RAG models can go beyond simple extractive QA and answer questions with free-form, abstractive text generation. To test RAG’s natural language generation (NLG)…"}
- {"concept":"FEVER [56] requires classifying whether a natural language claim is supported or refuted by Wikipedia, or whether there…","note":"FEVER [56] requires classifying whether a natural language claim is supported or refuted by Wikipedia, or whether there is not enough information to decide. Th…"}
## 二、标准流程
- {"stage":"1. To train the retriever and generator end-to-end, we treat the retrieved document as a latent variable.","input":"（草案·需人工确认）","action":"To train the retriever and generator end-to-end, we treat the retrieved document as a latent variable.","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"2. We propose two models that marginalize over the latent documents in different ways to produce a distribution over gener…","input":"（草案·需人工确认）","action":"We propose two models that marginalize over the latent documents in different ways to produce a distribution over generated text. In one approach, RAG-Sequence…","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"3. RAG-Sequence Model The RAG-Sequence model uses the same retrieved document to generate the complete sequence.","input":"（草案·需人工确认）","action":"RAG-Sequence Model The RAG-Sequence model uses the same retrieved document to generate the complete sequence. Technically, it treats the retrieved document as …","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"4. Concretely, the top K documents are retrieved using the retriever, and then the generator produces a distribution for t…","input":"（草案·需人工确认）","action":"Concretely, the top K documents are retrieved using the retriever, and then the generator produces a distribution for the next output token for each document, …","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"5. ∏N ∑ pRAG-Token(y|x) ≈ pη (z|x)pθ (yi|x, z, y1:i−1) i z∈top-k(p(·|x)) Finally, we note that RAG can be used for sequenc…","input":"（草案·需人工确认）","action":"∏N ∑ pRAG-Token(y|x) ≈ pη (z|x)pθ (yi|x, z, y1:i−1) i z∈top-k(p(·|x)) Finally, we note that RAG can be used for sequence classification tasks by considering th…","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"6. To evaluate RAG’s generation abilities in a non-QA setting, we study open-domain question gen- eration.","input":"（草案·需人工确认）","action":"To evaluate RAG’s generation abilities in a non-QA setting, we study open-domain question gen- eration. Rather than use questions from standard open-domain QA …","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
## 三、方法→工具映射
## 四、常见失败模式
- In this work, we presented hybrid generation models with access to parametric and non-parametric memory.:In this work, we presented hybrid generation models with access to parametric and non-parametric memory. We showed that our RAG models obtain state of the art …
## 五、术语消歧
## 六、证据索引
- {"claim":"Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks †‡ ?","noteId":"arxiv:2005.11401#p1#ada37c"}
- {"claim":"Large pre-trained language models have been shown to store factual knowledge in their parameters, and achieve state-of-…","noteId":"arxiv:2005.11401#p1#3fc8f6"}
- {"claim":"Pre-trained neural language models have been shown to learn a substantial amount of in-depth knowl- edge from data [47].","noteId":"arxiv:2005.11401#p1#9b3aca"}
- {"claim":"The retrieval component pη (z|x) is based on DPR [26].","noteId":"arxiv:2005.11401#p3#af1829"}
- {"claim":"The generator component pθ (yi|x, z, y1:i−1) could be modelled using any encoder-decoder.","noteId":"arxiv:2005.11401#p3#bf2dcc"}
- {"claim":"We jointly train the retriever and generator components without any direct supervision on what document should be retri…","noteId":"arxiv:2005.11401#p3#ad313f"}
- {"claim":"At test time, RAG-Sequence and RAG-Token require different ways to approximate arg maxy p(y|x).","noteId":"arxiv:2005.11401#p4#9c9ab4"}
- {"claim":"We experiment with RAG in a wide range of knowledge-intensive tasks.","noteId":"arxiv:2005.11401#p4#12f249"}
- {"claim":"Open-domain question answering (QA) is an important real-world application and common testbed for knowledge-intensive t…","noteId":"arxiv:2005.11401#p4#515169"}
- {"claim":"RAG models can go beyond simple extractive QA and answer questions with free-form, abstractive text generation.","noteId":"arxiv:2005.11401#p4#284f7c"}
- {"claim":"FEVER [56] requires classifying whether a natural language claim is supported or refuted by Wikipedia, or whether there…","noteId":"arxiv:2005.11401#p5#66255e"}
- {"claim":"Generation Diversity Section 4.3 shows that RAG models are more factual and specific than BART for Jeopardy question ge…","noteId":"arxiv:2005.11401#p7#35f8a0"}
- {"claim":"Effect of Retrieving more documents Models are trained with either 5 or 10 retrieved latent documents, and we do not ob…","noteId":"arxiv:2005.11401#p8#b47fdd"}
## 七、负向约束
- 不要忽略「In this work, we presented hybrid generation models with access to parametric and non-parametric memory.」这一已知局限,除非有新的证据
