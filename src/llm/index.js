import { FLOW_JSON_SCHEMA } from '../flow/schema.js';
import { normalizeJapanese } from '../flow/normalizeJa.js';
import { validateFlow } from '../flow/validate.js';
import { buildFlowPrompt } from './prompt.js';
import * as ollama from './providers/ollama.js';
import * as openai from './providers/openai.js';
import * as gemini from './providers/gemini.js';
import * as anthropic from './providers/anthropic.js';

export const PROVIDERS = {
  ollama,
  openai,
  gemini,
  anthropic
};

/**
 * @param {unknown} raw
 * @returns {{ flow: import('../flow/schema.js').Flow, parseError: string }}
 */
export function parseFlowResponse(raw) {
  if (raw && typeof raw === 'object') {
    return { flow: /** @type {import('../flow/schema.js').Flow} */ (raw), parseError: '' };
  }

  const text = typeof raw === 'string' ? raw.trim() : '';
  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(text.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    try {
      return { flow: JSON.parse(candidate), parseError: '' };
    } catch (error) {
      // Try the next extraction strategy.
    }
  }

  return { flow: { nodes: [], edges: [] }, parseError: 'JSONパースに失敗しました。モデルの出力形式を確認してください。' };
}

/**
 * @param {import('../flow/schema.js').Flow} flow
 * @returns {import('../flow/schema.js').Flow}
 */
export function normalizeFlow(flow) {
  return {
    nodes: Array.isArray(flow.nodes)
      ? flow.nodes.map((node) => ({
        ...node,
        label: normalizeJapanese(node.label),
        lane: normalizeJapanese(node.lane)
      }))
      : [],
    edges: Array.isArray(flow.edges)
      ? flow.edges.map((edge) => ({
        ...edge,
        label: normalizeJapanese(edge.label || '')
      }))
      : []
  };
}

/**
 * @param {string} provider
 */
export function getProvider(provider) {
  const selected = PROVIDERS[provider];
  if (!selected) {
    throw new Error(`未対応のAIプロバイダです: ${provider}`);
  }
  return selected;
}

/**
 * @param {{ providerModule: typeof ollama, apiKey?: string, model?: string, host?: string, text: string, maxRetries?: number, signal?: AbortSignal }} options
 */
export async function generateFlowWithProvider({ providerModule, apiKey, model, host, text, maxRetries = 2, signal }) {
  let validationMessages = [];
  let lastFlow = { nodes: [], edges: [] };
  let lastValidation = validateFlow(lastFlow);

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const prompt = buildFlowPrompt(text, validationMessages);
    const raw = await providerModule.generate({
      apiKey,
      model: model || providerModule.defaultModel(),
      host,
      prompt,
      schema: FLOW_JSON_SCHEMA,
      signal
    });
    const parsed = parseFlowResponse(raw);
    lastFlow = normalizeFlow(parsed.flow);
    lastValidation = validateFlow(lastFlow);

    if (parsed.parseError) {
      validationMessages = [parsed.parseError];
    } else if (lastValidation.ok) {
      return { flow: lastFlow, validation: lastValidation, attempts: attempt };
    } else {
      validationMessages = lastValidation.messages.filter((message) => message.level === 'fatal').map((message) => message.text);
    }
  }

  throw new Error(`中間JSONの検証に失敗しました。${validationMessages.join(' / ')} 入力文を具体化するか、生成後に手動で修正してください。`);
}

/**
 * @param {{ provider?: 'ollama'|'openai'|'gemini'|'anthropic'|string, apiKey?: string, model?: string, host?: string, text: string, maxRetries?: number, signal?: AbortSignal }} options
 */
export async function generateFlow({ provider = 'ollama', apiKey, model, host, text, maxRetries = 2, signal }) {
  return generateFlowWithProvider({
    providerModule: getProvider(provider),
    apiKey,
    model,
    host,
    text,
    maxRetries,
    signal
  });
}

/**
 * @param {string} provider
 */
export function providerInfo(provider) {
  const selected = getProvider(provider);
  return {
    id: provider,
    label: selected.label(),
    defaultModel: selected.defaultModel(),
    needsApiKey: selected.needsApiKey()
  };
}
