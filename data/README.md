# data/

本目录默认被 `.gitignore` 排除(`/data/*`),用于放**体积大、可重建、或含敏感信息**的中间产物。

## 例外(会入库)

| 路径 | 用途 |
|---|---|
| `data/README.md` | 本文件 |
| `data/fixtures/` | **demo 固定样例,必须入库** —— 现场演示靠它保证可复现 |

## 约定

- 真实数据集、模型权重、数据库文件 → 放 `data/` 下,**不入库**
- 演示用的固定输入(小体积 JSON / 文本 / 录制好的 API 响应)→ 放 `data/fixtures/` 或根目录 `fixtures/`,**入库**
- 需要复现某次运行,靠 `fixtures/` + `DEMO_MODE=replay`(见 `.env.example`)
