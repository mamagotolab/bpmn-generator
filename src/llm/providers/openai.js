const DEFAULT_MODEL = 'gpt-5.6';

/**
 * @param {{ apiKey?: string, model?: string, prompt: string, schema: unknown, signal?: AbortSignal }} options
 */
export async function generate({ apiKey, model = DEFAULT_MODEL, prompt, schema, signal }) {
  if (!apiKey) {
    throw new Error('OpenAIのAPIキーを入力してください。');
  }

  let response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'bpmn_flow',
            schema,
            strict: true
          }
        }
      }),
      signal
    });
  } catch (error) {
    throw new Error('OpenAI APIに接続できません。ネットワーク接続とAPIキーを確認してください。');
  }

  if (!response.ok) {
    throw new Error(`OpenAI APIが失敗しました（HTTP ${response.status}）。モデルIDとAPIキーを確認してください。`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenAI APIの応答から中間JSONを取得できませんでした。');
  }
  return content;
}

export function defaultModel() {
  return DEFAULT_MODEL;
}

export function needsApiKey() {
  return true;
}

export function label() {
  return 'OpenAI (api.openai.com)';
}
