---
paperId: "arxiv:1706.03762"
title: Attention Is All You Need
notes: 20
updated_at: 2026-10-31T05:01:10.993Z
---

# Attention Is All You Need

## p1 · 6a9ef8

- noteId: "arxiv:1706.03762#p1#6a9ef8"
- paperId: "arxiv:1706.03762"
- page: 1
- kind: result
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include…

**证据**（p1）：

> The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train. Our model achieves 28.4 BLEU on the WMT 2014 English- to-German translation task, improving over the existing best results, including ensembles, by over 2 BLEU.

## p2 · 5d37e9

- noteId: "arxiv:1706.03762#p2#5d37e9"
- paperId: "arxiv:1706.03762"
- page: 2
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：Recurrent neural networks, long short-term memory [13] and gated recurrent [7] neural networks in particular, have been…

**证据**（p2）：

> Recurrent neural networks, long short-term memory [13] and gated recurrent [7] neural networks in particular, have been firmly established as state of the art approaches in sequence modeling and transduction problems such as language modeling and machine translation [35, 2, 5]. Numerous efforts have since continued to push the boundaries of recurrent language models and encoder-decoder architectures [38, 24, 15].

## p2 · 1ef8e4

- noteId: "arxiv:1706.03762#p2#1ef8e4"
- paperId: "arxiv:1706.03762"
- page: 2
- kind: definition
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：The goal of reducing sequential computation also forms the foundation of the Extended Neural GPU [16], ByteNet [18] and…

**证据**（p2）：

> The goal of reducing sequential computation also forms the foundation of the Extended Neural GPU [16], ByteNet [18] and ConvS2S [9], all of which use convolutional neural networks as basic building block, computing hidden representations in parallel for all input and output positions. In these models, the number of operations required to relate signals from two arbitrary input or output positions grows in the distance between positions, linearly for ConvS2S and logarithmically for ByteNet. This makes it more difficult to learn dependencies between distant positions [12]. In the Transformer this is reduced to a constant number of operations, albeit at the cost of reduced effective resolution due to averaging attention-weighted positions, an effect we counteract with Multi-Head Attention as described in section 3.2.

## p2 · a72981

- noteId: "arxiv:1706.03762#p2#a72981"
- paperId: "arxiv:1706.03762"
- page: 2
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：Most competitive neural sequence transduction models have an encoder-decoder structure [5, 2, 35].

**证据**（p2）：

> Most competitive neural sequence transduction models have an encoder-decoder structure [5, 2, 35].

## p2 · 6a7e71

- noteId: "arxiv:1706.03762#p2#6a7e71"
- paperId: "arxiv:1706.03762"
- page: 2
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：Here, the encoder maps an input sequence of symbol representations (x1, ..., xn) to a sequence of continuous representa…

**证据**（p2）：

> Here, the encoder maps an input sequence of symbol representations (x1, ..., xn) to a sequence of continuous representations z = (z1, ..., zn). Given z, the decoder then generates an output sequence (y1, ..., ym) of symbols one element at a time. At each step the model is auto-regressive [10], consuming the previously generated symbols as additional input when generating the next.

## p3 · 77621e

- noteId: "arxiv:1706.03762#p3#77621e"
- paperId: "arxiv:1706.03762"
- page: 3
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：The Transformer follows this overall architecture using stacked self-attention and point-wise, fully connected layers f…

**证据**（p3）：

> The Transformer follows this overall architecture using stacked self-attention and point-wise, fully connected layers for both the encoder and decoder, shown in the left and right halves of Figure 1, respectively.

## p3 · 3e040b

- noteId: "arxiv:1706.03762#p3#3e040b"
- paperId: "arxiv:1706.03762"
- page: 3
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：Encoder: The encoder is composed of a stack of N = 6 identical layers.

**证据**（p3）：

> Encoder: The encoder is composed of a stack of N = 6 identical layers. Each layer has two sub-layers. The first is a multi-head self-attention mechanism, and the second is a simple, position- wise fully connected feed-forward network. We employ a residual connection [11] around each of the two sub-layers, followed by layer normalization [1]. That is, the output of each sub-layer is LayerNorm(x + Sublayer(x)), where Sublayer(x) is the function implemented by the sub-layer itself. To facilitate these residual connections, all sub-layers in the model, as well as the embedding layers, produce outputs of dimension dmodel = 512.

## p3 · 07a894

- noteId: "arxiv:1706.03762#p3#07a894"
- paperId: "arxiv:1706.03762"
- page: 3
- kind: claim
- confidence: medium
- created_at: 2026-10-31T05:01:10.989Z

**描述**：An attention function can be described as mapping a query and a set of key-value pairs to an output, where the query, k…

**证据**（p3）：

> An attention function can be described as mapping a query and a set of key-value pairs to an output, where the query, keys, values, and output are all vectors. The output is computed as a weighted sum 3 Scaled Dot-Product Attention Multi-Head Attention Figure 2: (left) Scaled Dot-Product Attention. (right) Multi-Head Attention consists of several attention layers running in parallel.

## p4 · 8eef71

- noteId: "arxiv:1706.03762#p4#8eef71"
- paperId: "arxiv:1706.03762"
- page: 4
- kind: definition
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：We call our particular attention "Scaled Dot-Product Attention" (Figure 2).

**证据**（p4）：

> We call our particular attention "Scaled Dot-Product Attention" (Figure 2). The input consists of queries and keys of dimension dk, and values of dimension dv . We compute the dot products of the √ query with all keys, divide each by dk, and apply a softmax function to obtain the weights on the values.

## p4 · a59107

- noteId: "arxiv:1706.03762#p4#a59107"
- paperId: "arxiv:1706.03762"
- page: 4
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：Instead of performing a single attention function with dmodel-dimensional keys, values and queries, we found it benefic…

**证据**（p4）：

> Instead of performing a single attention function with dmodel-dimensional keys, values and queries, we found it beneficial to linearly project the queries, keys and values h times with different, learned linear projections to dk, dk and dv dimensions, respectively. On each of these projected versions of queries, keys and values we then perform the attention function in parallel, yielding dv -dimensional 4 To illustrate why the dot products get large, assume that the components of q and k are independent random Pd variables with mean 0 and variance 1. Then their dot product, q · k = ki=1 qiki, has mean 0 and variance dk .

## p5 · 3a881c

- noteId: "arxiv:1706.03762#p5#3a881c"
- paperId: "arxiv:1706.03762"
- page: 5
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：The Transformer uses multi-head attention in three different ways:

**证据**（p5）：

> The Transformer uses multi-head attention in three different ways:

## p5 · caefbc

- noteId: "arxiv:1706.03762#p5#caefbc"
- paperId: "arxiv:1706.03762"
- page: 5
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：• The encoder contains self-attention layers.

**证据**（p5）：

> • The encoder contains self-attention layers. In a self-attention layer all of the keys, values and queries come from the same place, in this case, the output of the previous layer in the encoder. Each position in the encoder can attend to all positions in the previous layer of the encoder.

## p5 · ab9b49

- noteId: "arxiv:1706.03762#p5#ab9b49"
- paperId: "arxiv:1706.03762"
- page: 5
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：• Similarly, self-attention layers in the decoder allow each position in the decoder to attend to all positions in the…

**证据**（p5）：

> • Similarly, self-attention layers in the decoder allow each position in the decoder to attend to all positions in the decoder up to and including that position. We need to prevent leftward information flow in the decoder to preserve the auto-regressive property. We implement this inside of scaled dot-product attention by masking out (setting to −∞) all values in the input of the softmax which correspond to illegal connections. See Figure 2.

## p5 · 0602d0

- noteId: "arxiv:1706.03762#p5#0602d0"
- paperId: "arxiv:1706.03762"
- page: 5
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：In addition to attention sub-layers, each of the layers in our encoder and decoder contains a fully connected feed-forw…

**证据**（p5）：

> In addition to attention sub-layers, each of the layers in our encoder and decoder contains a fully connected feed-forward network, which is applied to each position separately and identically. This consists of two linear transformations with a ReLU activation in between.

## p5 · baf5b2

- noteId: "arxiv:1706.03762#p5#baf5b2"
- paperId: "arxiv:1706.03762"
- page: 5
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：Similarly to other sequence transduction models, we use learned embeddings to convert the input tokens and output token…

**证据**（p5）：

> Similarly to other sequence transduction models, we use learned embeddings to convert the input tokens and output tokens to vectors of dimension dmodel. We also use the usual learned linear transfor- mation and softmax function to convert the decoder output to predicted next-token probabilities. In our model, we share the same weight matrix between the two embedding layers and the pre-softmax √ linear transformation, similar to [30]. In the embedding layers, we multiply those weights by dmodel.

## p6 · bd9803

- noteId: "arxiv:1706.03762#p6#bd9803"
- paperId: "arxiv:1706.03762"
- page: 6
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：Since our model contains no recurrence and no convolution, in order for the model to make use of the order of the seque…

**证据**（p6）：

> Since our model contains no recurrence and no convolution, in order for the model to make use of the order of the sequence, we must inject some information about the relative or absolute position of the tokens in the sequence. To this end, we add "positional encodings" to the input embeddings at the bottoms of the encoder and decoder stacks. The positional encodings have the same dimension dmodel as the embeddings, so that the two can be summed. There are many choices of positional encodings, learned and fixed [9].

## p6 · f16fa9

- noteId: "arxiv:1706.03762#p6#f16fa9"
- paperId: "arxiv:1706.03762"
- page: 6
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：In this section we compare various aspects of self-attention layers to the recurrent and convolu- tional layers commonl…

**证据**（p6）：

> In this section we compare various aspects of self-attention layers to the recurrent and convolu- tional layers commonly used for mapping one variable-length sequence of symbol representations d (x1, ..., xn) to another sequence of equal length (z1, ..., zn), with xi, zi ∈ R , such as a hidden layer in a typical sequence transduction encoder or decoder. Motivating our use of self-attention we consider three desiderata.

## p8 · 473384

- noteId: "arxiv:1706.03762#p8#473384"
- paperId: "arxiv:1706.03762"
- page: 8
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：To evaluate the importance of different components of the Transformer, we varied our base model in different ways, meas…

**证据**（p8）：

> To evaluate the importance of different components of the Transformer, we varied our base model in different ways, measuring the change in performance on English-to-German translation on the 5 We used values of 2.8, 3.7, 6.0 and 9.5 TFLOPS for K80, K40, M40 and P100, respectively.

## p9 · 91ed0c

- noteId: "arxiv:1706.03762#p9#91ed0c"
- paperId: "arxiv:1706.03762"
- page: 9
- kind: method
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：In Table 3 rows (B), we observe that reducing the attention key size dk hurts model quality.

**证据**（p9）：

> In Table 3 rows (B), we observe that reducing the attention key size dk hurts model quality. This suggests that determining compatibility is not easy and that a more sophisticated compatibility function than dot product may be beneficial. We further observe in rows (C) and (D) that, as expected, bigger models are better, and dropout is very helpful in avoiding over-fitting. In row (E) we replace our sinusoidal positional encoding with learned positional embeddings [9], and observe nearly identical results to the base model.

## p10 · 0d4fc1

- noteId: "arxiv:1706.03762#p10#0d4fc1"
- paperId: "arxiv:1706.03762"
- page: 10
- kind: claim
- confidence: high
- created_at: 2026-10-31T05:01:10.989Z

**描述**：In this work, we presented the Transformer, the first sequence transduction model based entirely on attention, replacin…

**证据**（p10）：

> In this work, we presented the Transformer, the first sequence transduction model based entirely on attention, replacing the recurrent layers most commonly used in encoder-decoder architectures with multi-headed self-attention.
