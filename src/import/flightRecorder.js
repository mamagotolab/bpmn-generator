import { NODE_TYPES } from '../flow/schema.js';
import { validateFlow } from '../flow/validate.js';

const FLIGHT_RECORDER_FORMAT = 'workflow-flight-recorder';
const XML_SAFE_ID = /^[A-Za-z_][A-Za-z0-9._-]*$/;
const RESERVED_ID_PREFIXES = ['Process_', 'Definitions_', 'BPMNPlane_', 'BPMNDiagram_', 'LaneSet_', 'Lane_', 'Flow_'];

function fail(message) {
  throw new Error(`取込ファイルを読み込めません。${message}`);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, allowed, required = allowed) {
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key)) && keys.every((key) => allowed.includes(key));
}

function validateGraph(nodes, edges) {
  const starts = nodes.filter((node) => node.type === 'start');
  const ends = nodes.filter((node) => node.type === 'end');
  if (starts.length !== 1) fail('開始工程は1つだけにしてください。');
  if (ends.length !== 1) fail('終了工程は1つだけにしてください。');
  if (edges.some((edge) => edge.to === starts[0].id)) fail('開始工程へ入る線は指定できません。');
  if (edges.some((edge) => edge.from === ends[0].id)) fail('終了工程から出る線は指定できません。');

  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    incoming.set(edge.to, incoming.get(edge.to) + 1);
    outgoing.get(edge.from).push(edge.to);
  }
  const queue = nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
  let processed = 0;
  for (let index = 0; index < queue.length; index += 1) {
    processed += 1;
    for (const next of outgoing.get(queue[index])) {
      incoming.set(next, incoming.get(next) - 1);
      if (incoming.get(next) === 0) queue.push(next);
    }
  }
  if (processed !== nodes.length) fail('工程の循環は指定できません。線のつながりを確認してください。');
}

function validateStructure(data) {
  if (!hasExactKeys(data, ['format', 'version', 'title', 'flow'])) fail('許可されていない項目があります。');
  if (data.version !== 1) fail('対応しているversionは1です。');
  if (typeof data.title !== 'string' || !data.title.trim()) fail('業務名を入力してください。');
  if (!isObject(data.flow)) fail('flowはJSONオブジェクトで指定してください。');

  const { nodes, edges } = data.flow;
  if (!hasExactKeys(data.flow, ['nodes', 'edges'])) fail('flowに許可されていない項目があります。');
  if (!Array.isArray(nodes)) fail('flow.nodesは配列で指定してください。');
  if (!Array.isArray(edges)) fail('flow.edgesは配列で指定してください。');

  const ids = new Set();
  for (const node of nodes) {
    if (!isObject(node)) fail('各nodeはJSONオブジェクトで指定してください。');
    if (!hasExactKeys(node, ['id', 'type', 'label', 'lane'])) fail('nodeに許可されていない項目があります。');
    if (typeof node.id !== 'string' || !node.id.trim()) fail('各nodeのidは空でない文字列にしてください。');
    if (!XML_SAFE_ID.test(node.id) || RESERVED_ID_PREFIXES.some((prefix) => node.id.startsWith(prefix))) {
      fail('nodeのIDはXMLで安全な未予約の値にしてください。');
    }
    if (ids.has(node.id)) fail('nodeのidが重複しています。');
    ids.add(node.id);
    if (!NODE_TYPES.includes(node.type)) fail('nodeのtypeが不正です。');
    if (typeof node.label !== 'string') fail('nodeのlabelは文字列にしてください。');
    if (typeof node.lane !== 'string' || !node.lane.trim()) fail('nodeのlaneは空でない文字列にしてください。');
  }

  for (const edge of edges) {
    if (!isObject(edge)) fail('各edgeはJSONオブジェクトで指定してください。');
    if (!hasExactKeys(edge, ['from', 'to', 'label'], ['from', 'to'])) fail('edgeに許可されていない項目があります。');
    if (typeof edge.from !== 'string' || !edge.from.trim() || typeof edge.to !== 'string' || !edge.to.trim()) {
      fail('edgeのfromとtoは空でない文字列にしてください。');
    }
    if (Object.prototype.hasOwnProperty.call(edge, 'label') && typeof edge.label !== 'string') {
      fail('edgeのlabelは文字列にしてください。');
    }
    if (!ids.has(edge.from) || !ids.has(edge.to)) fail('edgeが存在しないnodeを参照しています。');
  }
  validateGraph(nodes, edges);
}

export function parseImportEnvelope(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail('JSONの形式を確認してください。');
  }

  if (isObject(data) && Object.prototype.hasOwnProperty.call(data, 'format')) {
    if (data.format !== FLIGHT_RECORDER_FORMAT) fail('対応していないファイル形式です。');
    return { kind: 'flight-recorder', data };
  }
  return { kind: 'backup', data };
}

export async function importFlightRecorderData(data, { convert, save }) {
  if (!isObject(data) || data.format !== FLIGHT_RECORDER_FORMAT) fail('フライトレコーダー形式ではありません。');
  validateStructure(data);

  const validation = validateFlow(data.flow);
  if (!validation.ok) fail('業務フローの検証で重大な問題が見つかりました。');

  const flow = structuredClone(data.flow);
  const xml = await convert(structuredClone(flow));
  if (typeof xml !== 'string' || !xml.trim()) fail('BPMN XMLへ変換できませんでした。');
  const record = await save({ title: data.title.trim(), category: '', xml });
  return { record, flow, xml };
}

export async function importFlightRecorder(text, dependencies) {
  const envelope = parseImportEnvelope(text);
  if (envelope.kind !== 'flight-recorder') fail('フライトレコーダー形式ではありません。');
  return importFlightRecorderData(envelope.data, dependencies);
}
