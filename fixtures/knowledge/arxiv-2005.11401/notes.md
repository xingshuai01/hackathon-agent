---
paperId: "arxiv:2005.11401"
title: Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks
notes: 20
updated_at: 2026-10-31T05:01:08.893Z
---

# Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks

## p1 · 3fc8f6

- noteId: "arxiv:2005.11401#p1#3fc8f6"
- paperId: "arxiv:2005.11401"
- page: 1
- kind: result
- confidence: high
- created_at: 2026-10-31T05:01:08.891Z

**描述**：Large pre-trained language models have been shown to store factual knowledge in their parameters, and achieve state-of-…

**证据**（p1）：

> Large pre-trained language models have been shown to store factual knowledge in their parameters, and achieve state-of-the-art results when fine-tuned on down- stream NLP tasks. However, their ability to access and precisely manipulate knowl- edge is still limited, and hence on knowledge-intensive tasks, their performance lags behind task-specific architectures. Additionally, providing provenance for their decisions and updating their world knowledge remain open research problems. Pre- trained models with a differentiable access mechanism to explicit non-parametric memory have so far been only investigated for extractive downstream tasks. We explore a general-purpose fine-tuning recipe for retrieval-augmented generation (RAG) — models which combine pre-trained parametric and non-parametric mem- ory for language generation.

## p1 · 9b3aca

- noteId: "arxiv:2005.11401#p1#9b3aca"
- paperId: "arxiv:2005.11401"
- page: 1
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:08.891Z

**描述**：Pre-trained neural language models have been shown to learn a substantial amount of in-depth knowl- edge from data [47].

**证据**（p1）：

> Pre-trained neural language models have been shown to learn a substantial amount of in-depth knowl- edge from data [47]. They can do so without any access to an external memory, as a parameterized implicit knowledge base [51, 52]. While this development is exciting, such models do have down- sides: They cannot easily expand or revise their memory, can’t straightforwardly provide insight into their predictions, and may produce “hallucinations” [38]. Hybrid models that combine parametric memory with non-parametric (i.e., retrieval-based) memories [20, 26, 48] can address some of these issues because knowledge can be directly revised and expanded, and accessed knowledge can be inspected and interpreted.

## p3 · 3d5afb

- noteId: "arxiv:2005.11401#p3#3d5afb"
- paperId: "arxiv:2005.11401"
- page: 3
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:08.891Z

**描述**：To train the retriever and generator end-to-end, we treat the retrieved document as a latent variable.

**证据**（p3）：

> To train the retriever and generator end-to-end, we treat the retrieved document as a latent variable.

## p3 · 5863dc

- noteId: "arxiv:2005.11401#p3#5863dc"
- paperId: "arxiv:2005.11401"
- page: 3
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:08.891Z

**描述**：We propose two models that marginalize over the latent documents in different ways to produce a distribution over gener…

**证据**（p3）：

> We propose two models that marginalize over the latent documents in different ways to produce a distribution over generated text. In one approach, RAG-Sequence, the model uses the same document to predict each target token. The second approach, RAG-Token, can predict each target token based on a different document. In the following, we formally introduce both models and then describe the pη and pθ components, as well as the training and decoding procedure.

## p3 · f174ee

- noteId: "arxiv:2005.11401#p3#f174ee"
- paperId: "arxiv:2005.11401"
- page: 3
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:08.891Z

**描述**：RAG-Sequence Model The RAG-Sequence model uses the same retrieved document to generate the complete sequence.

**证据**（p3）：

> RAG-Sequence Model The RAG-Sequence model uses the same retrieved document to generate the complete sequence. Technically, it treats the retrieved document as a single latent variable that is marginalized to get the seq2seq probability p(y|x) via a top-K approximation. Concretely, the top K documents are retrieved using the retriever, and the generator produces the output sequence probability for each document, which are then marginalized, ∑ ∑ ∏N pRAG-Sequence(y|x) ≈ pη (z|x)pθ (y|x, z) = pη (z|x) pθ (yi|x, z, y1:i−1) z∈top-k(p(·|x)) z∈top-k(p(·|x)) i RAG-Token Model In the RAG-Token model we can draw a different latent document for each target token and marginalize accordingly. This allows the generator to choose content from several documents when producing an answer.

## p3 · a9b6ea

- noteId: "arxiv:2005.11401#p3#a9b6ea"
- paperId: "arxiv:2005.11401"
- page: 3
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:08.891Z

**描述**：Concretely, the top K documents are retrieved using the retriever, and then the generator produces a distribution for t…

**证据**（p3）：

> Concretely, the top K documents are retrieved using the retriever, and then the generator produces a distribution for the next output token for each document, before marginalizing, and repeating the process with the following output token, Formally, we define:

## p3 · 2c3b5f

- noteId: "arxiv:2005.11401#p3#2c3b5f"
- paperId: "arxiv:2005.11401"
- page: 3
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:08.891Z

**描述**：∏N ∑ pRAG-Token(y|x) ≈ pη (z|x)pθ (yi|x, z, y1:i−1) i z∈top-k(p(·|x)) Finally, we note that RAG can be used for sequenc…

**证据**（p3）：

> ∏N ∑ pRAG-Token(y|x) ≈ pη (z|x)pθ (yi|x, z, y1:i−1) i z∈top-k(p(·|x)) Finally, we note that RAG can be used for sequence classification tasks by considering the target class as a target sequence of length one, in which case RAG-Sequence and RAG-Token are equivalent.

## p3 · af1829

- noteId: "arxiv:2005.11401#p3#af1829"
- paperId: "arxiv:2005.11401"
- page: 3
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:08.891Z

**描述**：The retrieval component pη (z|x) is based on DPR [26].

**证据**（p3）：

> The retrieval component pη (z|x) is based on DPR [26]. DPR follows a bi-encoder architecture:

## p3 · bf2dcc

- noteId: "arxiv:2005.11401#p3#bf2dcc"
- paperId: "arxiv:2005.11401"
- page: 3
- kind: result
- confidence: high
- created_at: 2026-10-31T05:01:08.891Z

**描述**：The generator component pθ (yi|x, z, y1:i−1) could be modelled using any encoder-decoder.

**证据**（p3）：

> The generator component pθ (yi|x, z, y1:i−1) could be modelled using any encoder-decoder. We use BART-large [32], a pre-trained seq2seq transformer [58] with 400M parameters. To combine the input x with the retrieved content z when generating from BART, we simply concatenate them. BART was pre-trained using a denoising objective and a variety of different noising functions. It has obtained state-of-the-art results on a diverse set of generation tasks and outperforms comparably-sized T5 models [32]. We refer to the BART generator parameters θ as the parametric memory henceforth.

## p3 · ad313f

- noteId: "arxiv:2005.11401#p3#ad313f"
- paperId: "arxiv:2005.11401"
- page: 3
- kind: claim
- confidence: medium
- created_at: 2026-10-31T05:01:08.891Z

**描述**：We jointly train the retriever and generator components without any direct supervision on what document should be retri…

**证据**（p3）：

> We jointly train the retriever and generator components without any direct supervision on what document should be retrieved. Given a fine-tuning training corpus of input/output pairs (xj , yj ), we 3 ∑ minimize the negative marginal log-likelihood of each target, j − log p(yj |xj ) using stochastic gradient descent with Adam [28]. Updating the document encoder BERTd during training is costly as it requires the document index to be periodically updated as REALM does during pre-training [20].

## p4 · 9c9ab4

- noteId: "arxiv:2005.11401#p4#9c9ab4"
- paperId: "arxiv:2005.11401"
- page: 4
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:08.892Z

**描述**：At test time, RAG-Sequence and RAG-Token require different ways to approximate arg maxy p(y|x).

**证据**（p4）：

> At test time, RAG-Sequence and RAG-Token require different ways to approximate arg maxy p(y|x).

## p4 · 12f249

- noteId: "arxiv:2005.11401#p4#12f249"
- paperId: "arxiv:2005.11401"
- page: 4
- kind: result
- confidence: high
- created_at: 2026-10-31T05:01:08.892Z

**描述**：We experiment with RAG in a wide range of knowledge-intensive tasks.

**证据**（p4）：

> We experiment with RAG in a wide range of knowledge-intensive tasks. For all experiments, we use a single Wikipedia dump for our non-parametric knowledge source. Following Lee et al. [31] and Karpukhin et al. [26], we use the December 2018 dump. Each Wikipedia article is split into disjoint 100-word chunks, to make a total of 21M documents. We use the document encoder to compute an embedding for each document, and build a single MIPS index using FAISS [23] with a Hierarchical Navigable Small World approximation for fast retrieval [37]. During training, we retrieve the top k documents for each query. We consider k ∈ {5, 10} for training and set k for test time using dev data. We now discuss experimental details for each task.

## p4 · 515169

- noteId: "arxiv:2005.11401#p4#515169"
- paperId: "arxiv:2005.11401"
- page: 4
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:08.892Z

**描述**：Open-domain question answering (QA) is an important real-world application and common testbed for knowledge-intensive t…

**证据**（p4）：

> Open-domain question answering (QA) is an important real-world application and common testbed for knowledge-intensive tasks [20]. We treat questions and answers as input-output text pairs (x, y) and train RAG by directly minimizing the negative log-likelihood of answers. We compare RAG to the popular extractive QA paradigm [5, 7, 31, 26], where answers are extracted spans from retrieved documents, relying primarily on non-parametric knowledge. We also compare to “Closed-Book QA” approaches [52], which, like RAG, generate answers, but which do not exploit retrieval, instead relying purely on parametric knowledge. We consider four popular open-domain QA datasets: Natural Questions (NQ) [29], TriviaQA (TQA) [24]. WebQuestions (WQ) [3] and CuratedTrec (CT) [2]. As CT and WQ are small, we follow DPR [26] by initializing CT and WQ models with our NQ RAG model.

## p4 · 284f7c

- noteId: "arxiv:2005.11401#p4#284f7c"
- paperId: "arxiv:2005.11401"
- page: 4
- kind: claim
- confidence: medium
- created_at: 2026-10-31T05:01:08.892Z

**描述**：RAG models can go beyond simple extractive QA and answer questions with free-form, abstractive text generation.

**证据**（p4）：

> RAG models can go beyond simple extractive QA and answer questions with free-form, abstractive text generation. To test RAG’s natural language generation (NLG) in a knowledge-intensive setting, we use the MSMARCO NLG task v2.1 [43]. The task consists of questions, ten gold passages retrieved from a search engine for each question, and a full sentence answer annotated from the retrieved passages. We do not use the supplied passages, only the questions and answers, to treat 4 MSMARCO as an open-domain abstractive QA task. MSMARCO has some questions that cannot be answered in a way that matches the reference answer without access to the gold passages, such as “What is the weather in Volcano, CA?” so performance will be lower without using gold passages.

## p5 · 81b395

- noteId: "arxiv:2005.11401#p5#81b395"
- paperId: "arxiv:2005.11401"
- page: 5
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:08.892Z

**描述**：To evaluate RAG’s generation abilities in a non-QA setting, we study open-domain question gen- eration.

**证据**（p5）：

> To evaluate RAG’s generation abilities in a non-QA setting, we study open-domain question gen- eration. Rather than use questions from standard open-domain QA tasks, which typically consist of short, simple questions, we propose the more demanding task of generating Jeopardy questions.

## p5 · 66255e

- noteId: "arxiv:2005.11401#p5#66255e"
- paperId: "arxiv:2005.11401"
- page: 5
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:08.892Z

**描述**：FEVER [56] requires classifying whether a natural language claim is supported or refuted by Wikipedia, or whether there…

**证据**（p5）：

> FEVER [56] requires classifying whether a natural language claim is supported or refuted by Wikipedia, or whether there is not enough information to decide. The task requires retrieving evidence from Wikipedia relating to the claim and then reasoning over this evidence to classify whether the claim is true, false, or unverifiable from Wikipedia alone. FEVER is a retrieval problem coupled with an challenging entailment reasoning task. It also provides an appropriate testbed for exploring the RAG models’ ability to handle classification rather than generation. We map FEVER class labels (supports, refutes, or not enough info) to single output tokens and directly train with claim-class pairs. Crucially, unlike most other approaches to FEVER, we do not use supervision on retrieved evidence.

## p5 · 22be42

- noteId: "arxiv:2005.11401#p5#22be42"
- paperId: "arxiv:2005.11401"
- page: 5
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:08.892Z

**描述**：Table 1 shows results for RAG along with state-of-the-art models.

**证据**（p5）：

> Table 1 shows results for RAG along with state-of-the-art models. On all four open-domain QA tasks, RAG sets a new state of the art (only on the T5-comparable split for TQA). RAG combines the generation flexibility of the “closed-book” (parametric only) approaches and the performance of "open-book" retrieval-based approaches. Unlike REALM and T5+SSM, RAG enjoys strong results without expensive, specialized “salient span masking” pre-training [20]. It is worth noting that RAG’s retriever is initialized using DPR’s retriever, which uses retrieval supervision on Natural Questions and TriviaQA. RAG compares favourably to the DPR QA system, which uses a BERT-based “cross- encoder” to re-rank documents, along with an extractive reader. RAG demonstrates that neither a re-ranker nor extractive reader is necessary for state-of-the-art performance.

## p7 · 35f8a0

- noteId: "arxiv:2005.11401#p7#35f8a0"
- paperId: "arxiv:2005.11401"
- page: 7
- kind: result
- confidence: high
- created_at: 2026-10-31T05:01:08.892Z

**描述**：Generation Diversity Section 4.3 shows that RAG models are more factual and specific than BART for Jeopardy question ge…

**证据**（p7）：

> Generation Diversity Section 4.3 shows that RAG models are more factual and specific than BART for Jeopardy question generation. Following recent work on diversity-promoting decoding [33, 59, 39], we also investigate generation diversity by calculating the ratio of distinct ngrams to total ngrams generated by different models. Table 5 shows that RAG-Sequence’s generations are more diverse than RAG-Token’s, and both are significantly more diverse than BART without needing any diversity-promoting decoding.

## p8 · b47fdd

- noteId: "arxiv:2005.11401#p8#b47fdd"
- paperId: "arxiv:2005.11401"
- page: 8
- kind: result
- confidence: high
- created_at: 2026-10-31T05:01:08.892Z

**描述**：Effect of Retrieving more documents Models are trained with either 5 or 10 retrieved latent documents, and we do not ob…

**证据**（p8）：

> Effect of Retrieving more documents Models are trained with either 5 or 10 retrieved latent documents, and we do not observe significant differences in performance between them. We have the flexibility to adjust the number of retrieved documents at test time, which can affect performance and runtime. Figure 3 (left) shows that retrieving more documents at test time monotonically improves Open-domain QA results for RAG-Sequence, but performance peaks for RAG-Token at 10 retrieved documents. Figure 3 (right) shows that retrieving more documents leads to higher Rouge-L for RAG-Token at the expense of Bleu-1, but the effect is less pronounced for RAG-Sequence.

## p9 · 1b6600

- noteId: "arxiv:2005.11401#p9#1b6600"
- paperId: "arxiv:2005.11401"
- page: 9
- kind: limitation
- confidence: high
- created_at: 2026-10-31T05:01:08.892Z

**描述**：In this work, we presented hybrid generation models with access to parametric and non-parametric memory.

**证据**（p9）：

> In this work, we presented hybrid generation models with access to parametric and non-parametric memory. We showed that our RAG models obtain state of the art results on open-domain QA. We found that people prefer RAG’s generation over purely parametric BART, finding RAG more factual and specific. We conducted an thorough investigation of the learned retrieval component, validating its effectiveness, and we illustrated how the retrieval index can be hot-swapped to update the model without requiring any retraining. In future work, it may be fruitful to investigate if the two components can be jointly pre-trained from scratch, either with a denoising objective similar to BART or some another objective.
