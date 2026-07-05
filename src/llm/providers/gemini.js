const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * GeminiのresponseSchemaはOpenAPI寄りのJSON Schemaと差異があるため、
 * 追加プロパティ指定など互換性が不安定な項目だけ落として型名を大文字へ寄せる。
 *
 * @param {unknown} schema
 * @returns {unknown}
 */
function toGeminiSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;

  const source = /** @type {Record<string, unknown>} */ (schema);
  const converted = /** @type {Record<string, unknown>} */ ({});
  for (const [key, value] of Object.entries(source)) {
    if (key === 'additionalProperties') continue;
    converted[key] = key === 'type' && typeof value === 'string'
      ? value.toUpperCase()
      : toGeminiSchema(value);
  }
  return converted;
}

/**
 * @param {{ apiKey?: string, model?: string, prompt: string, schema: unknown, signal?: AbortSignal }} options
 */
export async function generate({ apiKey, model = DEFAULT_MODEL, prompt, schema, signal }) {
  if (!apiKey) {
    throw new Error('GeminiのAPIキーを入力してください。');
  }

  const encodedModel = encodeURIComponent(model);
  const encodedKey = encodeURIComponent(apiKey);
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent?key=${encodedKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: toGeminiSchema(schema)
        }
      }),
      signal
    });
  } catch (error) {
    throw new Error('Gemini APIに接続できません。ネットワーク接続とAPIキーを確認してください。');
  }

  if (!response.ok) {
    throw new Error(`Gemini APIが失敗しました（HTTP ${response.status}）。モデルIDとAPIキーを確認してください。`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Gemini APIの応答から中間JSONを取得できませんでした。');
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
  return 'Google Gemini (generativelanguage.googleapis.com)';
}
