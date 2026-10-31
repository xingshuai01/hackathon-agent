---
paperId: "arxiv:1810.04805"
title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding"
notes: 20
updated_at: 2026-10-31T05:01:08.426Z
---

# BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding

## p1 · 32d83b

- noteId: "arxiv:1810.04805#p1#32d83b"
- paperId: "arxiv:1810.04805"
- page: 1
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:08.424Z

**描述**：The fine-tuning approach, such as train deep bidirectional representations from the Generative Pre-trained Transformer…

**证据**（p1）：

> The fine-tuning approach, such as train deep bidirectional representations from the Generative Pre-trained Transformer (OpenAI unlabeled text by jointly conditioning on both GPT) (Radford et al., 2018), introduces minimal left and right context in all layers. As a re- task-specific parameters, and is trained on the sult, the pre-trained BERT model can be fine- downstream tasks by simply fine-tuning all pre- tuned with just one additional output layer to create state-of-the-art models for a wide trained parameters. The two approaches share the range of tasks, such as question answering and same objective function during pre-training, where language inference, without substantial task- they use unidirectional language models to learn specific architecture modifications.

## p1 · 39e799

- noteId: "arxiv:1810.04805#p1#39e799"
- paperId: "arxiv:1810.04805"
- page: 1
- kind: result
- confidence: high
- created_at: 2026-10-31T05:01:08.424Z

**描述**：These include sentence-level tasks such as In this paper, we improve the fine-tuning based natural language inference (…

**证据**（p1）：

> 2018). These include sentence-level tasks such as In this paper, we improve the fine-tuning based natural language inference (Bowman et al., 2015; approaches by proposing BERT: Bidirectional Williams et al., 2018) and paraphrasing (Dolan Encoder Representations from Transformers.

## p2 · a61c82

- noteId: "arxiv:1810.04805#p2#a61c82"
- paperId: "arxiv:1810.04805"
- page: 2
- kind: definition
- confidence: high
- created_at: 2026-10-31T05:01:08.424Z

**描述**：There is a long history of pre-training general lan- guage representations, and we briefly review the

**证据**（p2）：

> els. There is a long history of pre-training general lan- guage representations, and we briefly review the

## p2 · 9e108e

- noteId: "arxiv:1810.04805#p2#9e108e"
- paperId: "arxiv:1810.04805"
- page: 2
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:08.424Z

**描述**：most widely-used approaches in this section.

**证据**（p2）：

> most widely-used approaches in this section.

## p2 · 9f448a

- noteId: "arxiv:1810.04805#p2#9f448a"
- paperId: "arxiv:1810.04805"
- page: 2
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:08.424Z

**描述**：decades, including non-neural (Brown et al., 1992; More recently, sentence or document encoders Ando and Zhang, 2005; B…

**证据**（p2）：

> decades, including non-neural (Brown et al., 1992; More recently, sentence or document encoders Ando and Zhang, 2005; Blitzer et al., 2006) and which produce contextual token representations neural (Mikolov et al., 2013; Pennington et al., have been pre-trained from unlabeled text and

## p2 · dfe2e6

- noteId: "arxiv:1810.04805#p2#dfe2e6"
- paperId: "arxiv:1810.04805"
- page: 2
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:08.424Z

**描述**：Pre-trained word embeddings fine-tuned for a supervised downstream task (Dai are an integral part of modern NLP systems…

**证据**（p2）：

> 2014) methods. Pre-trained word embeddings fine-tuned for a supervised downstream task (Dai are an integral part of modern NLP systems, of- and Le, 2015; Howard and Ruder, 2018; Radford fering significant improvements over embeddings et al., 2018). The advantage of these approaches learned from scratch (Turian et al., 2010). To pre- is that few parameters need to be learned from train word embedding vectors, left-to-right lan- scratch. At least partly due to this advantage, guage modeling objectives have been used (Mnih OpenAI GPT (Radford et al., 2018) achieved pre- and Hinton, 2009), as well as objectives to dis- viously state-of-the-art results on many sentence- criminate correct from incorrect words in left and level tasks from the GLUE benchmark (Wang right context (Mikolov et al., 2013).

## p3 · 3771a1

- noteId: "arxiv:1810.04805#p3#3771a1"
- paperId: "arxiv:1810.04805"
- page: 3
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:08.424Z

**描述**：E[CLS] E1 ...

**证据**（p3）：

> E[CLS] E1 ... EN E[SEP] E1’ ... EM’ E[CLS] E1 ... EN E[SEP] E1’ ... EM’ [CLS] Tok 1 ... Tok N [SEP] Tok 1 ... TokM [CLS] Tok 1 ... Tok N [SEP] Tok 1 ... TokM Masked Sentence A Masked Sentence B Question Paragraph Unlabeled Sentence A and B Pair Question Answer Pair Pre-training Fine-Tuning Figure 1: Overall pre-training and fine-tuning procedures for BERT. Apart from output layers, the same architec- tures are used in both pre-training and fine-tuning. The same pre-trained model parameters are used to initialize models for different down-stream tasks. During fine-tuning, all parameters are fine-tuned. [CLS] is a special symbol added in front of every input example, and [SEP] is a special separator token (e.g. separating ques- tions/answers).

## p3 · 65f2bd

- noteId: "arxiv:1810.04805#p3#65f2bd"
- paperId: "arxiv:1810.04805"
- page: 3
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:08.424Z

**描述**：We introduce BERT and its detailed implementa- We primarily report results on two model sizes:

**证据**（p3）：

> We introduce BERT and its detailed implementa- We primarily report results on two model sizes:

## p5 · e733b6

- noteId: "arxiv:1810.04805#p5#e733b6"
- paperId: "arxiv:1810.04805"
- page: 5
- kind: result
- confidence: high
- created_at: 2026-10-31T05:01:08.424Z

**描述**：In this section, we present BERT fine-tuning re-

**证据**（p5）：

> extract long contiguous sequences. In this section, we present BERT fine-tuning re-

## p7 · a2ae70

- noteId: "arxiv:1810.04805#p7#a2ae70"
- paperId: "arxiv:1810.04805"
- page: 7
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:08.424Z

**描述**：S·C + E·C to the score of the best non-null span In this section, we perform ablation experiments 12 The TriviaQA data…

**证据**（p7）：

> S·C + E·C to the score of the best non-null span In this section, we perform ablation experiments 12 The TriviaQA data we used consists of paragraphs from over a number of facets of BERT in order to better TriviaQA-Wiki formed of the first 400 tokens in documents, that contain at least one of the provided possible answers.

## p8 · e5c5fa

- noteId: "arxiv:1810.04805#p8#e5c5fa"
- paperId: "arxiv:1810.04805"
- page: 8
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:08.424Z

**描述**：both left and right context at every layer.

**证据**（p8）：

> both left and right context at every layer.

## p8 · 3844aa

- noteId: "arxiv:1810.04805#p8#3844aa"
- paperId: "arxiv:1810.04805"
- page: 8
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:08.424Z

**描述**：ablation studies can be found in Appendix C.

**证据**（p8）：

> ablation studies can be found in Appendix C.

## p8 · 89e822

- noteId: "arxiv:1810.04805#p8#89e822"
- paperId: "arxiv:1810.04805"
- page: 8
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:08.425Z

**描述**：In this section, we explore the effect of model size

**证据**（p8）：

> In this section, we explore the effect of model size

## p9 · 60569d

- noteId: "arxiv:1810.04805#p9#60569d"
- paperId: "arxiv:1810.04805"
- page: 9
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:08.425Z

**描述**：All of the BERT results presented so far have used the fine-tuning approach, where a simple classifi- cation layer is a…

**证据**（p9）：

> All of the BERT results presented so far have used the fine-tuning approach, where a simple classifi- cation layer is added to the pre-trained model, and layer in the output. We use the representation of all parameters are jointly fine-tuned on a down- the first sub-token as the input to the token-level stream task. However, the feature-based approach, classifier over the NER label set.

## p9 · fc604d

- noteId: "arxiv:1810.04805#p9#fc604d"
- paperId: "arxiv:1810.04805"
- page: 9
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:08.425Z

**描述**：The best performing method concatenates the by applying BERT to the CoNLL-2003 Named token representations from the top…

**证据**（p9）：

> performs competitively with state-of-the-art meth- In this section, we compare the two approaches ods. The best performing method concatenates the by applying BERT to the CoNLL-2003 Named token representations from the top four hidden lay- Entity Recognition (NER) task (Tjong Kim Sang ers of the pre-trained Transformer, which is only and De Meulder, 2003). In the input to BERT, we

## p9 · 8ba2c4

- noteId: "arxiv:1810.04805#p9#8ba2c4"
- paperId: "arxiv:1810.04805"
- page: 9
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:08.425Z

**描述**：use a case-preserving WordPiece model, and we demonstrates that BERT is effective for both fine- include the maximal do…

**证据**（p9）：

> use a case-preserving WordPiece model, and we demonstrates that BERT is effective for both fine- include the maximal document context provided tuning and feature-based approaches.

## p9 · 821e4f

- noteId: "arxiv:1810.04805#p9#821e4f"
- paperId: "arxiv:1810.04805"
- page: 9
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:08.425Z

**描述**：Following standard practice, we for- mulate this as a tagging task but do not use a CRF

**证据**（p9）：

> by the data. Following standard practice, we for- mulate this as a tagging task but do not use a CRF

## p9 · cbbae5

- noteId: "arxiv:1810.04805#p9#cbbae5"
- paperId: "arxiv:1810.04805"
- page: 9
- kind: result
- confidence: high
- created_at: 2026-10-31T05:01:08.425Z

**描述**：Hyperparams Dev Set Accuracy #L #H #A LM (ppl) MNLI-m MRPC SST-2 Recent empirical improvements due to transfer learning…

**证据**（p9）：

> Hyperparams Dev Set Accuracy #L #H #A LM (ppl) MNLI-m MRPC SST-2 Recent empirical improvements due to transfer learning with language models have demonstrated that rich, unsupervised pre-training is an integral part of many language understanding systems. In particular, these results enable even low-resource 24 1024 16 3.23 86.6 87.8 93.7 tasks to benefit from deep unidirectional architec- tures. Our major contribution is further general- Table 6: Ablation over BERT model size. #L = the izing these findings to deep bidirectional architec- number of layers; #H = hidden size; #A = number of at- tures, allowing the same pre-trained model to suc- tention heads. “LM (ppl)” is the masked LM perplexity cessfully tackle a broad set of NLP tasks. of held-out training data.

## p14 · af091e

- noteId: "arxiv:1810.04805#p14#af091e"
- paperId: "arxiv:1810.04805"
- page: 14
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:08.425Z

**描述**：B Detailed Experimental Setup The most comparable existing pre-training method to BERT is OpenAI GPT, which trains a B.…

**证据**（p14）：

> B Detailed Experimental Setup The most comparable existing pre-training method to BERT is OpenAI GPT, which trains a B.1 Detailed Descriptions for the GLUE left-to-right Transformer LM on a large text cor- Benchmark Experiments.

## p14 · c2bf8e

- noteId: "arxiv:1810.04805#p14#c2bf8e"
- paperId: "arxiv:1810.04805"
- page: 14
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:08.425Z

**描述**：• GPT used the same learning rate of 5e-5 for tion, sentence) pairs which do contain the correct all fine-tuning experi…

**证据**（p14）：

> • GPT used the same learning rate of 5e-5 for tion, sentence) pairs which do contain the correct all fine-tuning experiments; BERT chooses a answer, and the negative examples are (question, task-specific fine-tuning learning rate which sentence) from the same paragraph which do not performs the best on the development set. contain the answer.
