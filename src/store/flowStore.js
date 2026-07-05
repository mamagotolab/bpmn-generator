const KEY_PREFIX = 'bpmn:flow:';

function resolveStorage(storage = globalThis.localStorage) {
  if (!storage) throw new Error('localStorageが利用できません');
  return storage;
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `flow-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function keyFor(id) {
  return `${KEY_PREFIX}${id}`;
}

function parseRecord(value) {
  if (typeof value !== 'string') return null;
  try {
    const record = JSON.parse(value);
    if (record && typeof record === 'object' && typeof record.id === 'string') return record;
  } catch {
    return null;
  }
  return null;
}

export function saveFlow(record, storage) {
  const store = resolveStorage(storage);
  const now = new Date().toISOString();
  const id = record.id || createId();
  const existing = getFlow(id, store);
  const saved = {
    id,
    title: record.title || existing?.title || '無題の業務',
    category: Object.prototype.hasOwnProperty.call(record, 'category') ? record.category || '' : existing?.category || '',
    xml: Object.prototype.hasOwnProperty.call(record, 'xml') ? record.xml || '' : existing?.xml || '',
    createdAt: record.createdAt || existing?.createdAt || now,
    updatedAt: now
  };
  store.setItem(keyFor(id), JSON.stringify(saved));
  return saved;
}

export function listFlows(storage) {
  const store = resolveStorage(storage);
  const records = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (!key?.startsWith(KEY_PREFIX)) continue;
    const record = parseRecord(store.getItem(key));
    if (record) records.push(record);
  }
  return records.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function getFlow(id, storage) {
  return parseRecord(resolveStorage(storage).getItem(keyFor(id)));
}

export function deleteFlow(id, storage) {
  resolveStorage(storage).removeItem(keyFor(id));
}

export function exportAllJson(storage) {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), flows: listFlows(storage) }, null, 2);
}

export function importJson(text, storage) {
  const data = JSON.parse(text);
  const flows = Array.isArray(data) ? data : Array.isArray(data.flows) ? data.flows : [];
  let count = 0;
  for (const flow of flows) {
    if (!flow || typeof flow !== 'object') continue;
    saveFlow(flow, storage);
    count += 1;
  }
  return count;
}

export async function searchFlows(query, storage, xmlParser) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const parse = xmlParser || (await import('../flow/fromBpmnXml.js')).bpmnXmlToFlow;
  const results = [];

  for (const record of listFlows(storage)) {
    const matchedNodes = [];
    const recordHit = [record.title, record.category].some((value) => String(value || '').toLowerCase().includes(q));
    let flow = { nodes: [], edges: [] };
    if (record.xml) {
      try {
        flow = await parse(record.xml);
      } catch {
        flow = { nodes: [], edges: [] };
      }
    }
    for (const node of flow.nodes) {
      if ([node.label, node.lane].some((value) => String(value || '').toLowerCase().includes(q))) {
        matchedNodes.push(node);
      }
    }
    if (recordHit || matchedNodes.length) results.push({ flow: record, matchedNodes });
  }

  return results;
}

export function bulkConvertCategory(from, to, storage) {
  let count = 0;
  for (const record of listFlows(storage)) {
    if (record.category === from) {
      saveFlow({ ...record, category: to }, storage);
      count += 1;
    }
  }
  return count;
}
