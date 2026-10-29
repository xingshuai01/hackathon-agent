<!--
  技能草案 · 自动生成,未经人工审核。
  生成时间:2026-10-29T19:37:47.114Z

  ★ 状态固定为 needs_review。补齐下面几项后才能进技能库:
    - 第 3 节「三、方法→工具映射」为空:需要 B 模块的真实工具名清单才能填,生成器不猜工具名
    - 第 4 节「四、常见失败模式」为空:知识页里没有对应内容,需人工补写
    - 第 7 节「七、负向约束」为空:知识页里没有对应内容,需人工补写

  审核方式:补齐后运行
    node src/main.ts skills promote paper-arxiv-1706.03762
  校验不通过会被拒绝写入,并列出还差什么。
-->
---
skillId: paper-arxiv-1706.03762
name: Attention Is All You Need
domain: 待人工填写
version: 0.1.0
description: 从《Attention Is All You Need》抽取的方法草案(需跨论文比对后合并)
whenToUse: 当任务涉及 Attention Is All You Need 所描述的方法、指标或结论时使用
loadWhen: {"keywords":[],"taskTypes":[]}
allowedTools: []
status: needs_review
---

## 一、领域地图
- {"concept":"Most competitive neural sequence transduction models have an encoder-decoder structure [5, 2, 35].","note":"Most competitive neural sequence transduction models have an encoder-decoder structure [5, 2, 35]."}
- {"concept":"Here, the encoder maps an input sequence of symbol representations (x1, ..., xn) to a sequence of continuous representa…","note":"Here, the encoder maps an input sequence of symbol representations (x1, ..., xn) to a sequence of continuous representations z = (z1, ..., zn). Given z, the de…"}
- {"concept":"The Transformer follows this overall architecture using stacked self-attention and point-wise, fully connected layers f…","note":"The Transformer follows this overall architecture using stacked self-attention and point-wise, fully connected layers for both the encoder and decoder, shown i…"}
- {"concept":"The Transformer uses multi-head attention in three different ways:","note":"The Transformer uses multi-head attention in three different ways:"}
- {"concept":"• The encoder contains self-attention layers.","note":"• The encoder contains self-attention layers. In a self-attention layer all of the keys, values and queries come from the same place, in this case, the output …"}
- {"concept":"• Similarly, self-attention layers in the decoder allow each position in the decoder to attend to all positions in the…","note":"• Similarly, self-attention layers in the decoder allow each position in the decoder to attend to all positions in the decoder up to and including that positio…"}
- {"concept":"Similarly to other sequence transduction models, we use learned embeddings to convert the input tokens and output token…","note":"Similarly to other sequence transduction models, we use learned embeddings to convert the input tokens and output tokens to vectors of dimension dmodel. We als…"}
- {"concept":"Since our model contains no recurrence and no convolution, in order for the model to make use of the order of the seque…","note":"Since our model contains no recurrence and no convolution, in order for the model to make use of the order of the sequence, we must inject some information abo…"}
- {"concept":"To evaluate the importance of different components of the Transformer, we varied our base model in different ways, meas…","note":"To evaluate the importance of different components of the Transformer, we varied our base model in different ways, measuring the change in performance on Engli…"}
- {"concept":"In Table 3 rows (B), we observe that reducing the attention key size dk hurts model quality.","note":"In Table 3 rows (B), we observe that reducing the attention key size dk hurts model quality. This suggests that determining compatibility is not easy and that …"}
- {"concept":"Provided proper attribution is provided, Google hereby grants permission to reproduce the tables and figures in this pa…","note":"Provided proper attribution is provided, Google hereby grants permission to reproduce the tables and figures in this paper solely for use in journalistic or sc…"}
- {"concept":"Recurrent neural networks, long short-term memory [13] and gated recurrent [7] neural networks in particular, have been…","note":"Recurrent neural networks, long short-term memory [13] and gated recurrent [7] neural networks in particular, have been firmly established as state of the art …"}
- {"concept":"Encoder: The encoder is composed of a stack of N = 6 identical layers.","note":"Encoder: The encoder is composed of a stack of N = 6 identical layers. Each layer has two sub-layers. The first is a multi-head self-attention mechanism, and t…"}
- {"concept":"An attention function can be described as mapping a query and a set of key-value pairs to an output, where the query, k…","note":"An attention function can be described as mapping a query and a set of key-value pairs to an output, where the query, keys, values, and output are all vectors.…"}
- {"concept":"Instead of performing a single attention function with dmodel-dimensional keys, values and queries, we found it benefic…","note":"Instead of performing a single attention function with dmodel-dimensional keys, values and queries, we found it beneficial to linearly project the queries, key…"}
- {"concept":"In addition to attention sub-layers, each of the layers in our encoder and decoder contains a fully connected feed-forw…","note":"In addition to attention sub-layers, each of the layers in our encoder and decoder contains a fully connected feed-forward network, which is applied to each po…"}
- {"concept":"In this work, we presented the Transformer, the first sequence transduction model based entirely on attention, replacin…","note":"In this work, we presented the Transformer, the first sequence transduction model based entirely on attention, replacing the recurrent layers most commonly use…"}
## 二、标准流程
- {"stage":"1. Most competitive neural sequence transduction models have an encoder-decoder structure [5, 2, 35].","input":"（草案·需人工确认）","action":"Most competitive neural sequence transduction models have an encoder-decoder structure [5, 2, 35].","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"2. Here, the encoder maps an input sequence of symbol representations (x1, ..., xn) to a sequence of continuous representa…","input":"（草案·需人工确认）","action":"Here, the encoder maps an input sequence of symbol representations (x1, ..., xn) to a sequence of continuous representations z = (z1, ..., zn). Given z, the de…","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"3. The Transformer follows this overall architecture using stacked self-attention and point-wise, fully connected layers f…","input":"（草案·需人工确认）","action":"The Transformer follows this overall architecture using stacked self-attention and point-wise, fully connected layers for both the encoder and decoder, shown i…","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"4. The Transformer uses multi-head attention in three different ways:","input":"（草案·需人工确认）","action":"The Transformer uses multi-head attention in three different ways:","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"5. • The encoder contains self-attention layers.","input":"（草案·需人工确认）","action":"• The encoder contains self-attention layers. In a self-attention layer all of the keys, values and queries come from the same place, in this case, the output …","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"6. • Similarly, self-attention layers in the decoder allow each position in the decoder to attend to all positions in the…","input":"（草案·需人工确认）","action":"• Similarly, self-attention layers in the decoder allow each position in the decoder to attend to all positions in the decoder up to and including that positio…","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"7. Similarly to other sequence transduction models, we use learned embeddings to convert the input tokens and output token…","input":"（草案·需人工确认）","action":"Similarly to other sequence transduction models, we use learned embeddings to convert the input tokens and output tokens to vectors of dimension dmodel. We als…","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"8. Since our model contains no recurrence and no convolution, in order for the model to make use of the order of the seque…","input":"（草案·需人工确认）","action":"Since our model contains no recurrence and no convolution, in order for the model to make use of the order of the sequence, we must inject some information abo…","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"9. To evaluate the importance of different components of the Transformer, we varied our base model in different ways, meas…","input":"（草案·需人工确认）","action":"To evaluate the importance of different components of the Transformer, we varied our base model in different ways, measuring the change in performance on Engli…","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
- {"stage":"10. In Table 3 rows (B), we observe that reducing the attention key size dk hurts model quality.","input":"（草案·需人工确认）","action":"In Table 3 rows (B), we observe that reducing the attention key size dk hurts model quality. This suggests that determining compatibility is not easy and that …","criteria":"知识页给不出本阶段的通过判据,审核人必须补一条可判断的标准 （草案·需人工确认）"}
## 三、方法→工具映射
## 四、常见失败模式
## 五、术语消歧
- {"term":"The goal of reducing sequential computation also forms the foundation of the Extended Neural GPU [16], ByteNet [18] and…","disambiguation":"The goal of reducing sequential computation also forms the foundation of the Extended Neural GPU [16], ByteNet [18] and ConvS2S [9], all of which use convoluti…"}
- {"term":"We call our particular attention \"Scaled Dot-Product Attention\" (Figure 2).","disambiguation":"We call our particular attention \"Scaled Dot-Product Attention\" (Figure 2). The input consists of queries and keys of dimension dk, and values of dimension dv …"}
## 六、证据索引
- {"claim":"Provided proper attribution is provided, Google hereby grants permission to reproduce the tables and figures in this pa…","noteId":"arxiv:1706.03762#p1#f247d4"}
- {"claim":"The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include…","noteId":"arxiv:1706.03762#p1#6a9ef8"}
- {"claim":"Recurrent neural networks, long short-term memory [13] and gated recurrent [7] neural networks in particular, have been…","noteId":"arxiv:1706.03762#p2#5d37e9"}
- {"claim":"Encoder: The encoder is composed of a stack of N = 6 identical layers.","noteId":"arxiv:1706.03762#p3#3e040b"}
- {"claim":"An attention function can be described as mapping a query and a set of key-value pairs to an output, where the query, k…","noteId":"arxiv:1706.03762#p3#07a894"}
- {"claim":"Instead of performing a single attention function with dmodel-dimensional keys, values and queries, we found it benefic…","noteId":"arxiv:1706.03762#p4#a59107"}
- {"claim":"In addition to attention sub-layers, each of the layers in our encoder and decoder contains a fully connected feed-forw…","noteId":"arxiv:1706.03762#p5#0602d0"}
- {"claim":"In this work, we presented the Transformer, the first sequence transduction model based entirely on attention, replacin…","noteId":"arxiv:1706.03762#p10#0d4fc1"}
## 七、负向约束
