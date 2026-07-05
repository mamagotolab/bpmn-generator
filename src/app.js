import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import './editor/highlight.css';
import './app.css';

import { flowToBpmnXml } from './flow/toBpmnXml.js';
import { bpmnXmlToFlow } from './flow/fromBpmnXml.js';
import { validateFlow } from './flow/validate.js';
import { checkOllama } from './llm/ollama.js';
import { generateFlow, providerInfo } from './llm/index.js';
import { createModeler, getXml, loadXml } from './editor/modeler.js';
import { highlightIssues } from './editor/highlight.js';
import { flowToCsvRows, encodeCsv } from './export/csv.js';
import { startProgress } from './ui/progress.js';
import { renderValidationPanel, selectAndCenter } from './ui/panel.js';
import {
  bulkConvertCategory,
  exportAllJson,
  importJson,
  saveFlow,
  searchFlows
} from './store/flowStore.js';

const $ = (id) => document.getElementById(id);

const els = {
  status: $('ollamaStatus'),
  businessText: $('businessText'),
  sample: $('sampleButton'),
  provider: $('providerSelect'),
  warning: $('providerWarning'),
  hostField: $('hostField'),
  host: $('hostInput'),
  modelSelect: $('modelSelect'),
  customModelField: $('customModelField'),
  model: $('modelInput'),
  apiKeyField: $('apiKeyField'),
  apiKey: $('apiKeyInput'),
  apiKeyNote: $('apiKeyNote'),
  generate: $('generateButton'),
  progress: $('progressPanel'),
  title: $('titleInput'),
  category: $('categoryInput'),
  save: $('saveButton'),
  revalidate: $('revalidateButton'),
  search: $('searchInput'),
  searchButton: $('searchButton'),
  searchResults: $('searchResults'),
  bulkFrom: $('bulkFromInput'),
  bulkTo: $('bulkToInput'),
  bulkConvert: $('bulkConvertButton'),
  csvUtf8: $('csvUtf8Button'),
  csvSjis: $('csvSjisButton'),
  jsonExport: $('jsonExportButton'),
  jsonImport: $('jsonImportInput'),
  modeler: $('modeler'),
  validation: $('validationPanel')
};

const CUSTOM_MODEL = '__custom__';

// 担当者・分岐・合流が揃ったお手本（見て真似してもらう用）
const SAMPLE_TEXT =
  '顧客からメールで注文が届く。営業担当が注文内容を確認し、在庫を調べる。' +
  '在庫があれば、営業担当が出荷指示書を作成し、倉庫担当が商品を発送して完了する。' +
  '在庫がなければ、営業担当が顧客に納期遅延を連絡し、仕入担当が発注する。入荷したら倉庫担当が発送して完了する。';

// プロバイダごとの候補モデル。IDは変わりうるので「カスタム（自由入力）」も併設。
const MODEL_OPTIONS = {
  ollama: [
    { value: 'qwen2.5:7b-instruct', label: 'qwen2.5:7b-instruct（推奨）' },
    { value: 'qwen2.5:3b-instruct', label: 'qwen2.5:3b-instruct（軽量）' }
  ],
  anthropic: [
    { value: 'claude-opus-4-8', label: 'Claude Opus 4.8（高精度）' },
    { value: 'claude-sonnet-5', label: 'Claude Sonnet 5（バランス）' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5（低コスト）' }
  ],
  openai: [
    { value: 'gpt-5.5', label: 'gpt-5.5' }
  ],
  gemini: [
    { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash（高速）' },
    { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro（高精度）' }
  ]
};

const modeler = createModeler(els.modeler);
let currentFlow = null;
let currentRecordId = null;
let previousProvider = 'ollama';

// 選択中モデル名（プルダウン or 自由入力）
function currentModel() {
  if (els.modelSelect.value === CUSTOM_MODEL) return els.model.value.trim();
  return els.modelSelect.value;
}

// プロバイダの候補でプルダウンを組み直し、selectedを選ぶ（候補外はカスタム扱い）
function populateModelOptions(provider, selected) {
  const options = MODEL_OPTIONS[provider] || [];
  els.modelSelect.replaceChildren();
  for (const opt of options) {
    const el = document.createElement('option');
    el.value = opt.value;
    el.textContent = opt.label;
    els.modelSelect.append(el);
  }
  const customOption = document.createElement('option');
  customOption.value = CUSTOM_MODEL;
  customOption.textContent = 'カスタム（自由入力）';
  els.modelSelect.append(customOption);

  const known = options.some((opt) => opt.value === selected);
  if (selected && !known) {
    els.modelSelect.value = CUSTOM_MODEL;
    els.model.value = selected;
    els.customModelField.hidden = false;
  } else {
    els.modelSelect.value = selected || (options[0] && options[0].value) || CUSTOM_MODEL;
    els.customModelField.hidden = els.modelSelect.value !== CUSTOM_MODEL;
    if (els.modelSelect.value === CUSTOM_MODEL) els.model.value = selected || '';
  }
}

function setStatus(text, type = 'info') {
  els.status.textContent = text;
  els.status.className = `status-banner ${type}`;
}

function setControlsEnabled(enabled) {
  for (const button of [els.generate, els.save, els.revalidate, els.searchButton, els.bulkConvert, els.csvUtf8, els.csvSjis, els.jsonExport]) {
    button.disabled = !enabled;
  }
}

async function showFlow(flow, xml) {
  currentFlow = flow;
  await loadXml(modeler, xml);
  const validation = validateFlow(flow);
  renderValidationPanel(els.validation, validation, {
    onSelectNode: (nodeIds) => selectAndCenter(modeler, nodeIds)
  });
  highlightIssues(modeler, validation.messages);
  return validation;
}

function download(filename, bytes, type) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderSearchResults(results) {
  els.searchResults.replaceChildren();
  for (const result of results) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    const hits = result.matchedNodes.map((node) => node.label || node.id).join(' / ');
    button.textContent = hits
      ? `${result.flow.title}（${result.flow.category || 'カテゴリなし'}）: ${hits}`
      : `${result.flow.title}（${result.flow.category || 'カテゴリなし'}）`;
    button.addEventListener('click', async () => {
      currentRecordId = result.flow.id;
      els.title.value = result.flow.title || '';
      els.category.value = result.flow.category || '';
      const flow = await bpmnXmlToFlow(result.flow.xml);
      await showFlow(flow, result.flow.xml);
    });
    item.append(button);
    els.searchResults.append(item);
  }
  if (!results.length) {
    const item = document.createElement('li');
    item.textContent = '一致する業務フローはありません。';
    els.searchResults.append(item);
  }
}

async function checkLocalOllama() {
  if (els.provider.value !== 'ollama') return;
  try {
    await checkOllama({ host: els.host.value, model: currentModel() });
    setStatus('Ollamaに接続できました。', 'ok');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'warn');
  }
}

function apiKeyStorageKey(provider) {
  return `bpmn:apikey:${provider}`;
}

function modelStorageKey(provider) {
  return `bpmn:model:${provider}`;
}

function selectedProviderInfo() {
  return providerInfo(els.provider.value);
}

function saveCurrentProviderSettings() {
  const provider = previousProvider;
  localStorage.setItem(modelStorageKey(provider), currentModel());
  if (provider !== 'ollama') {
    localStorage.setItem(apiKeyStorageKey(provider), els.apiKey.value);
  }
}

function applyProviderSettings() {
  const info = selectedProviderInfo();
  const provider = info.id;
  const online = info.needsApiKey;
  const savedModel = localStorage.getItem(modelStorageKey(provider));

  populateModelOptions(provider, savedModel || info.defaultModel);
  els.hostField.hidden = provider !== 'ollama';
  els.apiKeyField.hidden = !online;
  els.apiKeyNote.hidden = !online;
  els.warning.hidden = !online;
  els.apiKey.value = online ? localStorage.getItem(apiKeyStorageKey(provider)) || '' : '';

  if (online) {
    els.warning.textContent = `この業務説明は ${info.label} に送信されます。機密情報を含む場合はローカルを選んでください。`;
    setStatus('オンラインAIを選択中です。Ollama接続チェックは実行しません。', 'info');
  } else {
    els.warning.textContent = '';
    checkLocalOllama();
  }

  previousProvider = provider;
}

els.generate.addEventListener('click', async () => {
  const text = els.businessText.value.trim();
  if (!text) {
    setStatus('業務説明を入力してください。', 'warn');
    return;
  }

  setControlsEnabled(false);
  const stopProgress = startProgress(els.progress);
  try {
    const provider = els.provider.value;
    const model = currentModel();
    localStorage.setItem(modelStorageKey(provider), model);
    if (provider !== 'ollama') {
      localStorage.setItem(apiKeyStorageKey(provider), els.apiKey.value);
    }

    const result = await generateFlow({
      provider,
      host: provider === 'ollama' ? els.host.value : undefined,
      apiKey: provider !== 'ollama' ? els.apiKey.value : undefined,
      model,
      text
    });
    const flow = result.flow;
    const validation = validateFlow(flow);
    const xml = await flowToBpmnXml(flow);
    await showFlow(flow, xml);
    currentRecordId = null;
    setStatus(validation.messages.length ? '生成しました。検証メッセージを確認してください。' : '生成しました。', validation.messages.length ? 'warn' : 'ok');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    stopProgress();
    setControlsEnabled(true);
  }
});

els.revalidate.addEventListener('click', async () => {
  try {
    const xml = await getXml(modeler);
    const flow = await bpmnXmlToFlow(xml);
    const validation = await showFlow(flow, xml);
    setStatus(validation.messages.length ? '再検証しました。修正が必要な箇所があります。' : '再検証しました。問題はありません。', validation.messages.length ? 'warn' : 'ok');
  } catch (error) {
    setStatus(`再検証できませんでした。${error instanceof Error ? error.message : String(error)}`, 'error');
  }
});

els.save.addEventListener('click', async () => {
  try {
    const xml = await getXml(modeler);
    const record = saveFlow({
      id: currentRecordId || undefined,
      title: els.title.value.trim() || '無題の業務',
      category: els.category.value.trim(),
      xml
    });
    currentRecordId = record.id;
    setStatus(`保存しました: ${record.title}`, 'ok');
  } catch (error) {
    setStatus(`保存できませんでした。${error instanceof Error ? error.message : String(error)}`, 'error');
  }
});

els.searchButton.addEventListener('click', async () => {
  const results = await searchFlows(els.search.value);
  renderSearchResults(results);
});

els.bulkConvert.addEventListener('click', () => {
  const count = bulkConvertCategory(els.bulkFrom.value.trim(), els.bulkTo.value.trim());
  setStatus(`${count}件のカテゴリを変換しました。`, count ? 'ok' : 'warn');
});

async function exportCurrentCsv(encoding) {
  try {
    const xml = await getXml(modeler);
    const flow = await bpmnXmlToFlow(xml);
    const bytes = encodeCsv(flowToCsvRows(flow), { encoding });
    download(`flow-${encoding}.csv`, bytes, encoding === 'shift-jis' ? 'text/csv;charset=shift_jis' : 'text/csv;charset=utf-8');
  } catch (error) {
    setStatus(`CSVを書き出せませんでした。${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

els.csvUtf8.addEventListener('click', () => exportCurrentCsv('utf8-bom'));
els.csvSjis.addEventListener('click', () => exportCurrentCsv('shift-jis'));

els.jsonExport.addEventListener('click', () => {
  download('bpmn-flows.json', new TextEncoder().encode(exportAllJson()), 'application/json;charset=utf-8');
});

els.jsonImport.addEventListener('change', async () => {
  const file = els.jsonImport.files?.[0];
  if (!file) return;
  try {
    const count = importJson(await file.text());
    setStatus(`${count}件のJSONを読み込みました。`, 'ok');
  } catch (error) {
    setStatus(`JSONを読み込めませんでした。${error instanceof Error ? error.message : String(error)}`, 'error');
  } finally {
    els.jsonImport.value = '';
  }
});

els.sample.addEventListener('click', () => {
  els.businessText.value = SAMPLE_TEXT;
  els.businessText.focus();
});

els.provider.addEventListener('change', () => {
  saveCurrentProviderSettings();
  applyProviderSettings();
});

els.modelSelect.addEventListener('change', () => {
  els.customModelField.hidden = els.modelSelect.value !== CUSTOM_MODEL;
  if (els.modelSelect.value === CUSTOM_MODEL) els.model.focus();
  localStorage.setItem(modelStorageKey(els.provider.value), currentModel());
});

els.model.addEventListener('input', () => {
  localStorage.setItem(modelStorageKey(els.provider.value), currentModel());
});

els.apiKey.addEventListener('input', () => {
  if (els.provider.value !== 'ollama') {
    localStorage.setItem(apiKeyStorageKey(els.provider.value), els.apiKey.value);
  }
});

applyProviderSettings();
