import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkOllama, generateFlow } from '../src/llm/ollama.js';
import { sampleFlow } from './fixtures.js';

function mockResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body)
  };
}

describe('Ollama連携', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('正常にモデル確認と生成を行う', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse({ models: [{ name: 'qwen2.5:7b-instruct' }] }))
      .mockResolvedValueOnce(mockResponse({ response: JSON.stringify(sampleFlow) }));

    await expect(checkOllama({})).resolves.toMatchObject({ ok: true });
    const result = await generateFlow({ text: '受注業務' });

    expect(result.attempts).toBe(1);
    expect(result.validation.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const generateBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(generateBody.stream).toBe(false);
    expect(generateBody.options.temperature).toBe(0);
    expect(generateBody.format).toMatchObject({ type: 'object' });
  });

  it('Ollama未起動を日本語メッセージで投げる', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('connect refused'));
    await expect(checkOllama({})).rejects.toThrow('Ollamaに接続できません');
  });

  it('モデル未導入を日本語メッセージで投げる', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse({ models: [{ name: 'qwen2.5:3b-instruct' }] }));
    await expect(checkOllama({ model: 'qwen2.5:7b-instruct' })).rejects.toThrow('ollama pull qwen2.5:7b-instruct');
  });

  it('1回fatal検証NGになった後にリトライ成功する', async () => {
    const invalidFlow = { ...sampleFlow, edges: [{ from: 'missing', to: 'n2', label: '' }] };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse({ response: JSON.stringify(invalidFlow) }))
      .mockResolvedValueOnce(mockResponse({ response: JSON.stringify(sampleFlow) }));

    const result = await generateFlow({ text: '受注業務', maxRetries: 2 });
    expect(result.attempts).toBe(2);
    expect(result.validation.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retryBody.prompt).toContain('前回の出力');
    expect(retryBody.prompt).toContain('存在しない工程');
  });
});
