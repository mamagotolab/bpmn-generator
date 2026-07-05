import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLOW_JSON_SCHEMA } from '../src/flow/schema.js';
import * as openai from '../src/llm/providers/openai.js';
import * as gemini from '../src/llm/providers/gemini.js';
import * as anthropic from '../src/llm/providers/anthropic.js';
import * as ollama from '../src/llm/providers/ollama.js';
import { sampleFlow } from './fixtures.js';

function mockResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body)
  };
}

describe('LLMプロバイダ', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('OpenAIのリクエストを組み立てて中間JSONを返す', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse({ choices: [{ message: { content: JSON.stringify(sampleFlow) } }] }));

    await expect(openai.generate({ apiKey: 'sk-test', model: 'gpt-test', prompt: '業務説明', schema: FLOW_JSON_SCHEMA }))
      .resolves.toBe(JSON.stringify(sampleFlow));

    expect(fetchMock).toHaveBeenCalledWith('https://api.openai.com/v1/chat/completions', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        authorization: 'Bearer sk-test',
        'content-type': 'application/json'
      })
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('gpt-test');
    expect(body.response_format.json_schema).toMatchObject({ name: 'bpmn_flow', strict: true });
  });

  it('Geminiのリクエストを組み立てて中間JSONを返す', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(sampleFlow) }] } }] }));

    await expect(gemini.generate({ apiKey: 'gm-test', model: 'gemini-test', prompt: '業務説明', schema: FLOW_JSON_SCHEMA }))
      .resolves.toBe(JSON.stringify(sampleFlow));

    expect(fetchMock.mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent?key=gm-test');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.type).toBe('OBJECT');
  });

  it('Anthropicのブラウザ直叩き仕様でリクエストを組み立てる', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse({ stop_reason: 'end_turn', content: [{ text: JSON.stringify(sampleFlow) }] }));

    await expect(anthropic.generate({ apiKey: 'ant-test', model: 'claude-test', prompt: '業務説明', schema: FLOW_JSON_SCHEMA }))
      .resolves.toBe(JSON.stringify(sampleFlow));

    expect(fetchMock).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'x-api-key': 'ant-test',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      })
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('claude-test');
    expect(body.output_config.format).toMatchObject({ type: 'json_schema', schema: FLOW_JSON_SCHEMA });
    expect(body).not.toHaveProperty('thinking');
    expect(body).not.toHaveProperty('temperature');
  });

  it('Anthropic refusalを日本語エラーにする', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse({ stop_reason: 'refusal', content: [] }));

    await expect(anthropic.generate({ apiKey: 'ant-test', prompt: '業務説明', schema: FLOW_JSON_SCHEMA }))
      .rejects.toThrow('モデルが生成を拒否しました');
  });

  it('APIキー欠落を日本語エラーにする', async () => {
    await expect(openai.generate({ prompt: '業務説明', schema: FLOW_JSON_SCHEMA })).rejects.toThrow('APIキー');
    await expect(gemini.generate({ prompt: '業務説明', schema: FLOW_JSON_SCHEMA })).rejects.toThrow('APIキー');
    await expect(anthropic.generate({ prompt: '業務説明', schema: FLOW_JSON_SCHEMA })).rejects.toThrow('APIキー');
  });

  it('OllamaプロバイダはAPIキー不要で既存形式のリクエストを使う', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse({ response: JSON.stringify(sampleFlow) }));

    await expect(ollama.generate({ host: 'http://localhost:11434', model: 'qwen-test', prompt: '業務説明', schema: FLOW_JSON_SCHEMA }))
      .resolves.toBe(JSON.stringify(sampleFlow));

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/generate');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('qwen-test');
    expect(body.format).toEqual(FLOW_JSON_SCHEMA);
    expect(body.stream).toBe(false);
    expect(ollama.needsApiKey()).toBe(false);
  });
});
