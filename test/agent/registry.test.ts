import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { z } from 'zod'

import { createToolRegistry, probeInput, zodToParameters } from '../../src/agent/registry.ts'
import { buildTool, toolOk } from '../../src/tools/types.ts'

function toolWithSchema<In>(schema: z.ZodType<In>, description?: (input: In) => string) {
  return buildTool<In>({
    name: 'probe_target',
    description: description ?? (() => '演示用'),
    inputSchema: schema,
    async call() {
      return toolOk(null, 'ok')
    },
  })
}

describe('registry · 元信息探测入参', () => {
  it('全可选字段直接给空对象 —— 拿到的是真实合法入参', () => {
    const tool = toolWithSchema(z.strictObject({ limit: z.number().optional() }))
    assert.deepEqual(probeInput(tool), {})
  })

  it('必填字符串合成占位值,能过 min(1)', () => {
    const tool = toolWithSchema(z.strictObject({ query: z.string().min(1).max(300) }))
    assert.deepEqual(probeInput(tool), { query: 'x' })
  })

  it('必填数字给 1,能过 positive()', () => {
    const tool = toolWithSchema(z.strictObject({ topK: z.number().int().positive() }))
    assert.deepEqual(probeInput(tool), { topK: 1 })
  })

  it('布尔 / 数组 / 对象都给出形状对的值', () => {
    const tool = toolWithSchema(
      z.strictObject({
        dryRun: z.boolean(),
        tags: z.array(z.string()),
        meta: z.object({}).optional(),
      }),
    )
    const probe = probeInput(tool)
    assert.equal(probe?.dryRun, false)
    assert.deepEqual(probe?.tags, [])
  })

  it('有 default 时优先用 default,不用占位值', () => {
    const tool = toolWithSchema(z.strictObject({ mode: z.string().default('fast') }))
    assert.equal(probeInput(tool)?.mode, 'fast')
  })

  it('枚举取第一个值,否则占位值过不了 enum 校验', () => {
    const tool = toolWithSchema(z.strictObject({ kind: z.enum(['claim', 'method']) }))
    assert.equal(probeInput(tool)?.kind, 'claim')
  })

  it('探不出来时返回 undefined,由调用方兜底', () => {
    const tool = toolWithSchema(z.custom<string>(() => false))
    assert.equal(probeInput(tool), undefined)
  })
})

describe('registry · 描述渲染', () => {
  it('description 读入参也不会崩 —— 这是 sciencepal_query 曾经踩的坑', async () => {
    const tool = toolWithSchema(
      z.strictObject({ agentId: z.string().optional(), task: z.string().min(1) }),
      (input) => `任务:${input.task}(agent=${input.agentId ?? '默认'})`,
    )
    const registry = createToolRegistry()
    registry.register(tool)

    const schemas = await registry.schemas()
    assert.equal(schemas.length, 1)
    // 关键:不是退化后的工具名
    assert.match(schemas[0]?.function.description ?? '', /任务:x/)
  })

  it('schema 转 JSON Schema 时剥掉 $schema(DeepSeek 不认)', () => {
    const params = zodToParameters(z.strictObject({ q: z.string() }))
    assert.equal('$schema' in params, false)
    assert.deepEqual((params['properties'] as Record<string, unknown>)['q'], { type: 'string' })
  })
})
