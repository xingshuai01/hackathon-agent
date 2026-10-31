The JSON is valid. Here is the atomic claim list for the paper.

```json
{
  "paperTitle": "Attention Is All You Need",
  "methodName": "Transformer",
  "claims": [
    {
      "claim": "Transformer 完全摒弃循环与卷积,仅依赖注意力机制建立输入输出间的全局依赖。",
      "page": 1,
      "section": "1 Introduction",
      "type": "method",
      "quote": "relying entirely on an attention mechanism to draw global dependencies"
    },
    {
      "claim": "编码器由 N=6 个相同层堆叠而成,每层含多头自注意力与逐位置前馈网络,并带残差连接与层归一化。",
      "page": 2,
      "section": "3.1",
      "type": "method",
      "quote": "The encoder is composed of a stack of N = 6 identical layers"
    },
    {
      "claim": "解码器自注意力子层被掩码,使位置 i 的预测只能依赖小于 i 的已知输出,以保持自回归性质。",
      "page": 2,
      "section": "3.1",
      "type": "method",
      "quote": "prevent positions from attending to subsequent positions"
    },
    {
      "claim": "缩放点积注意力定义为 Attention(Q,K,V)=softmax(QK^T/√dk)V。",
      "page": 3,
      "section": "3.2.1",
      "type": "method",
      "quote": "divide each by √dk, and apply a softmax function"
    },
    {
      "claim": "对点积除以 1/√dk 进行缩放,以抵消大 dk 下点积幅值增大导致 softmax 梯度极小的问题。",
      "page": 3,
      "section": "3.2.1",
      "type": "method",
      "quote": "we scale the dot products by 1/√dk"
    },
    {
      "claim": "模型采用 h=8 个并行注意力头,每头维度 dk=dv=dmodel/h=64。",
      "page": 4,
      "section": "3.2.2",
      "type": "method",
      "quote": "we employ h = 8 parallel attention layers, or heads"
    },
    {
      "claim": "前馈网络由两个线性变换夹一个 ReLU 激活构成,内层维度 dff=2048。",
      "page": 4,
      "section": "3.3",
      "type": "method",
      "quote": "two linear transformations with a ReLU activation in between"
    },
    {
      "claim": "位置编码采用不同频率的正弦余弦函数 PE(pos,2i)=sin(pos/10000^(2i/dmodel))。",
      "page": 5,
      "section": "3.5",
      "type": "method",
      "quote": "we use sine and cosine functions of different frequencies"
    },
    {
      "claim": "自注意力层以常数数量的顺序操作连接所有位置,而循环层需 O(n) 次顺序操作。",
      "page": 5,
      "section": "4 / Table 1",
      "type": "method",
      "quote": "a self-attention layer connects all positions with a constant number of sequentially executed operations"
    },
    {
      "claim": "在 WMT 2014 英德任务上,big 模型以 28.4 BLEU 超过此前最佳(含集成)2.0 以上 BLEU。",
      "page": 7,
      "section": "6.1",
      "type": "result",
      "quote": "outperforms the best previously reported models (including ensembles) by more than 2.0 BLEU"
    },
    {
      "claim": "在 WMT 2014 英法任务上,big 模型达到 41.0 BLEU,超过此前所有单模型。",
      "page": 7,
      "section": "6.1",
      "type": "result",
      "quote": "our big model achieves a BLEU score of 41.0"
    },
    {
      "claim": "base 模型在 8 块 P100 GPU 上训练 100,000 步(约 12 小时)。",
      "page": 6,
      "section": "5.2",
      "type": "result",
      "quote": "trained the base models for a total of 100,000 steps or 12 hours"
    },
    {
      "claim": "优化器为 Adam,β1=0.9,β2=0.98,ϵ=10^-9,warmup_steps=4000。",
      "page": 6,
      "section": "5.3",
      "type": "method",
      "quote": "We used the Adam optimizer with β1 = 0.9, β2 = 0.98 and ϵ = 10−9"
    },
    {
      "claim": "base 模型使用 dropout 率 Pdrop=0.1 与标签平滑 ϵls=0.1。",
      "page": 7,
      "section": "5.4",
      "type": "method",
      "quote": "we use a rate of Pdrop = 0.1"
    },
    {
      "claim": "推理时使用束宽 4 的束搜索与长度惩罚 α=0.6,base 模型平均最后 5 个检查点。",
      "page": 7,
      "section": "6.1",
      "type": "method",
      "quote": "We used beam search with a beam size of 4 and length penalty α = 0.6"
    },
    {
      "claim": "单头注意力比最优设置差 0.9 BLEU,且头数过多时质量同样下降。",
      "page": 8,
      "section": "6.2",
      "type": "result",
      "quote": "single-head attention is 0.9 BLEU worse than the best setting"
    },
    {
      "claim": "用学习式位置嵌入替换正弦位置编码,结果与 base 模型几乎相同。",
      "page": 8,
      "section": "6.2",
      "type": "result",
      "quote": "observe nearly identical results to the base model"
    },
    {
      "claim": "4 层 Transformer 在半监督设置下于 WSJ Section 23 达到 92.7 F1,优于除 RNN Grammar 外的所有此前模型。",
      "page": 9,
      "section": "6.3",
      "type": "result",
      "quote": "Transformer (4 layers) semi-supervised 92.7"
    }
  ],
  "extra": {
    "pageUnavailable": false,
    "pageConvention": "printed page numbers (PDF page N = printed page N-1)"
  },
  "software": [
    "tensor2tensor",
    "TensorFlow"
  ]
}
```

**页码说明**:论文正文使用印刷页码(第 1 页起于 Introduction 所在 PDF 页),即 **PDF 页码 = 印刷页码 + 1**。以上 `page` 字段均为印刷页码,已在 `extra.pageConvention` 中标注。

**两点需要你注意的原文细节**:
- 英法 BLEU 在摘要中写为 **41.8**,而 §6.1 正文写为 **41.0**。我按 §6.1 正文取 41.0 作为该条论断;若你希望以摘要口径为准,可改为 41.8(页码 1, Abstract)。
- `software` 字段:论文正文仅明确提到代码库 **tensor2tensor**(结论段,印刷页 9)及其 GitHub 仓库,底层框架为 TensorFlow;未给出版本号。