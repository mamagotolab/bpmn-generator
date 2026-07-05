import { describe, expect, it, vi } from 'vitest';
import { FLOW_JSON_SCHEMA } from '../src/flow/schema.js';
import { generateFlowWithProvider, parseFlowResponse, providerInfo } from '../src/llm/index.js';
import { sampleFlow } from './fixtures.js';

describe('LLM共通後処理', () => {
  it('コードブロックや前後説明からJSONを抽出する', () => {
    const parsed = parseFlowResponse(`説明\n\`\`\`json\n${JSON.stringify(sampleFlow)}\n\`\`\``);
    expect(parsed.parseError).toBe('');
    expect(parsed.flow.nodes).toHaveLength(sampleFlow.nodes.length);
  });

  it('normalizeJapaneseを適用してから検証する', async () => {
    const rawFlow = {
      ...sampleFlow,
      nodes: sampleFlow.nodes.map((node) => node.id === 'n6' ? { ...node, label: '发送', lane: '倉库' } : node)
    };
    const providerModule = {
      generate: vi.fn().mockResolvedValue(JSON.stringify(rawFlow)),
      defaultModel: () => 'mock-model',
      needsApiKey: () => false,
      label: () => 'Mock'
    };

    const result = await generateFlowWithProvider({ providerModule, text: '受注業務' });

    expect(result.flow.nodes.find((node) => node.id === 'n6')).toMatchObject({ label: '発送', lane: '倉庫' });
    expect(result.validation.ok).toBe(true);
    expect(providerModule.generate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'mock-model',
      schema: FLOW_JSON_SCHEMA
    }));
  });

  it('fatal検証NG時だけリトライする', async () => {
    const invalidFlow = { ...sampleFlow, edges: [{ from: 'missing', to: 'n2', label: '' }] };
    const providerModule = {
      generate: vi.fn()
        .mockResolvedValueOnce(JSON.stringify(invalidFlow))
        .mockResolvedValueOnce(JSON.stringify(sampleFlow)),
      defaultModel: () => 'mock-model',
      needsApiKey: () => false,
      label: () => 'Mock'
    };

    const result = await generateFlowWithProvider({ providerModule, text: '受注業務', maxRetries: 2 });

    expect(result.attempts).toBe(2);
    expect(providerModule.generate).toHaveBeenCalledTimes(2);
    expect(providerModule.generate.mock.calls[1][0].prompt).toContain('前回の出力');
  });

  it('プロバイダ情報を返す', () => {
    expect(providerInfo('ollama')).toMatchObject({ defaultModel: 'qwen2.5:7b-instruct', needsApiKey: false });
    expect(providerInfo('openai')).toMatchObject({ defaultModel: 'gpt-5.5', needsApiKey: true });
    expect(providerInfo('gemini')).toMatchObject({ defaultModel: 'gemini-2.5-flash', needsApiKey: true });
    expect(providerInfo('anthropic')).toMatchObject({ defaultModel: 'claude-opus-4-8', needsApiKey: true });
  });
});
