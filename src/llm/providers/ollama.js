export const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5:7b-instruct';

/**
 * @param {string} host
 * @param {string} path
 */
function urlFor(host, path) {
  return `${host.replace(/\/$/, '')}${path}`;
}

/**
 * @param {unknown} response
 * @returns {string[]}
 */
function extractModelNames(response) {
  const models = response && typeof response === 'object' && Array.isArray(response.models)
    ? response.models
    : [];
  return models.map((model) => {
    if (!model || typeof model !== 'object') return '';
    const name = /** @type {{ name?: unknown, model?: unknown }} */ (model).name ?? /** @type {{ name?: unknown, model?: unknown }} */ (model).model;
    return typeof name === 'string' ? name : '';
  }).filter(Boolean);
}

/**
 * @param {{ host?: string, model?: string }} [options]
 */
export async function checkOllama({ host = DEFAULT_OLLAMA_HOST, model = DEFAULT_OLLAMA_MODEL } = {}) {
  let response;
  try {
    response = await fetch(urlFor(host, '/api/tags'), { method: 'GET' });
  } catch (error) {
    throw new Error(`Ollamaに接続できません。Ollamaを起動してから再実行してください（例: \`ollama serve\`）。接続先: ${host}`);
  }

  if (!response.ok) {
    throw new Error(`Ollamaの起動確認に失敗しました（HTTP ${response.status}）。Ollamaを起動してから再実行してください。`);
  }

  const body = await response.json();
  const modelNames = extractModelNames(body);
  if (!modelNames.includes(model)) {
    throw new Error(`モデル未導入です。\`ollama pull ${model}\` を実行してください。`);
  }

  return { ok: true, host, model };
}

/**
 * @param {{ host?: string, model?: string, prompt: string, schema: unknown, signal?: AbortSignal }} options
 */
export async function generate({ host = DEFAULT_OLLAMA_HOST, model = DEFAULT_OLLAMA_MODEL, prompt, schema, signal }) {
  let response;
  try {
    response = await fetch(urlFor(host, '/api/generate'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        format: schema,
        options: { temperature: 0 },
        stream: false
      }),
      signal
    });
  } catch (error) {
    throw new Error(`Ollama生成APIに接続できません。Ollamaを起動し、接続先 ${host} を確認してください。`);
  }

  if (!response.ok) {
    throw new Error(`Ollama生成APIが失敗しました（HTTP ${response.status}）。モデル \`${model}\` が使える状態か確認してください。`);
  }

  const body = await response.json();
  return body && typeof body === 'object' && typeof body.response === 'string' ? body.response : '';
}

export function defaultModel() {
  return DEFAULT_OLLAMA_MODEL;
}

export function needsApiKey() {
  return false;
}

export function label() {
  return 'ローカル Ollama';
}
