const DEFAULT_MODEL = 'claude-opus-4-8';

/**
 * @param {{ apiKey?: string, model?: string, prompt: string, schema: unknown, signal?: AbortSignal }} options
 */
export async function generate({ apiKey, model = DEFAULT_MODEL, prompt, schema, signal }) {
  if (!apiKey) {
    throw new Error('AnthropicのAPIキーを入力してください。');
  }

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        output_config: {
          format: {
            type: 'json_schema',
            schema
          }
        }
      }),
      signal
    });
  } catch (error) {
    throw new Error('Anthropic APIに接続できません。ネットワーク接続とAPIキーを確認してください。');
  }

  if (!response.ok) {
    throw new Error(`Anthropic APIが失敗しました（HTTP ${response.status}）。モデルIDとAPIキーを確認してください。`);
  }

  const data = await response.json();
  if (data?.stop_reason === 'refusal') {
    throw new Error('モデルが生成を拒否しました。表現を変えて再試行してください。');
  }

  const text = data?.content?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Anthropic APIの応答から中間JSONを取得できませんでした。');
  }
  return text;
}

export function defaultModel() {
  return DEFAULT_MODEL;
}

export function needsApiKey() {
  return true;
}

export function label() {
  return 'Anthropic (api.anthropic.com)';
}
