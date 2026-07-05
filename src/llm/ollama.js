import { generateFlow as dispatchGenerateFlow } from './index.js';
import { DEFAULT_OLLAMA_HOST, DEFAULT_OLLAMA_MODEL } from './providers/ollama.js';
export { checkOllama, DEFAULT_OLLAMA_HOST, DEFAULT_OLLAMA_MODEL } from './providers/ollama.js';

/**
 * @param {{ host?: string, model?: string, text: string, maxRetries?: number }} options
 */
export async function generateFlow({ host = DEFAULT_OLLAMA_HOST, model = DEFAULT_OLLAMA_MODEL, text, maxRetries = 2 }) {
  return dispatchGenerateFlow({ provider: 'ollama', host, model, text, maxRetries });
}
