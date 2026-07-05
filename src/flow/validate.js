import { NODE_TYPES } from './schema.js';

const LEVELS = {
  fatal: new Set([1, 2, 3, 4, 5, 7, 9]),
  fixable: new Set([6, 10, 11])
};

const MESSAGE_TEXT = {
  1: '業務が読み取れませんでした。説明を具体的にしてください',
  2: '工程のつながりが読み取れませんでした',
  3: '工程IDが重複しています。自動再生成してください',
  4: '開始点が不明です。最初の工程を指定してください',
  5: '終了点が不明です',
  6: '判断・分岐が図に反映されていません',
  7: '工程種別が不正です。自動再生成してください',
  8: '担当者の区別がありません',
  9: '存在しない工程への線があります',
  10: '分岐の条件が空です。「はい/いいえ」等を入れてください',
  11: 'どこにも繋がっていない工程があります。線を引いて接続してください'
};

const CHECK_NAMES = {
  1: 'nodes配列あり',
  2: 'edges配列あり',
  3: 'id重複なし',
  4: 'startあり',
  5: 'endあり',
  6: 'gatewayあり(分岐業務なので必須)',
  7: 'typeが規定値のみ',
  8: 'lane情報あり',
  9: 'エッジ参照が全て有効',
  10: 'gateway分岐に条件ラベル',
  11: '全ノード到達可能'
};

/**
 * @param {number} id
 * @returns {'fatal'|'fixable'|'warn'}
 */
function levelFor(id) {
  if (LEVELS.fatal.has(id)) return 'fatal';
  if (LEVELS.fixable.has(id)) return 'fixable';
  return 'warn';
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function asId(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * @param {import('./schema.js').Flow|unknown} flow
 */
export function validateFlow(flow) {
  const data = flow && typeof flow === 'object' ? /** @type {{ nodes?: unknown, edges?: unknown }} */ (flow) : {};
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const edges = Array.isArray(data.edges) ? data.edges : [];
  const checks = [];
  const messages = [];

  /**
   * @param {number} id
   * @param {boolean} passed
   * @param {string} [detail]
   * @param {string[]} [nodeIds]
   * @param {string} [text]
   */
  function addCheck(id, passed, detail = '', nodeIds, text) {
    const level = levelFor(id);
    checks.push({ id, name: CHECK_NAMES[id], level, passed, detail });
    if (!passed) {
      messages.push({ level, text: text || MESSAGE_TEXT[id], ...(nodeIds && nodeIds.length ? { nodeIds } : {}) });
    }
  }

  addCheck(1, nodes.length > 0, `${nodes.length}個`);
  addCheck(2, edges.length > 0, `${edges.length}個`);

  const ids = nodes.map((node) => asId(node && typeof node === 'object' ? /** @type {{ id?: unknown }} */ (node).id : ''));
  const duplicateIds = ids.filter((id, index) => id && ids.indexOf(id) !== index);
  addCheck(3, ids.length === new Set(ids).size, duplicateIds.length ? `重複: ${[...new Set(duplicateIds)].join(', ')}` : '');

  const typedNodes = nodes.map((node) => (node && typeof node === 'object' ? /** @type {{ id?: unknown, type?: unknown, label?: unknown, lane?: unknown }} */ (node) : {}));
  const types = typedNodes.map((node) => node.type);
  addCheck(4, types.includes('start'));
  addCheck(5, types.includes('end'));
  addCheck(6, types.includes('gateway'));

  const badTypes = types.filter((type) => typeof type !== 'string' || !NODE_TYPES.includes(type));
  addCheck(7, badTypes.length === 0, badTypes.length ? `不正: ${badTypes.map(String).join(', ')}` : '');

  const lanes = new Set(typedNodes.map((node) => (typeof node.lane === 'string' ? node.lane : '')).filter(Boolean));
  addCheck(8, lanes.size >= 2, `lane: ${JSON.stringify([...lanes].sort())}`);

  const idSet = new Set(ids);
  const typedEdges = edges.map((edge) => (edge && typeof edge === 'object' ? /** @type {{ from?: unknown, to?: unknown, label?: unknown }} */ (edge) : {}));
  const dangling = typedEdges.filter((edge) => !idSet.has(asId(edge.from)) || !idSet.has(asId(edge.to)));
  addCheck(9, dangling.length === 0, dangling.length ? `迷子エッジ: ${JSON.stringify(dangling)}` : '');

  const gatewayIds = new Set(typedNodes.filter((node) => node.type === 'gateway').map((node) => asId(node.id)));
  const gatewayOut = typedEdges.filter((edge) => gatewayIds.has(asId(edge.from)));
  const unlabeledGatewayTargets = gatewayOut.filter((edge) => typeof edge.label !== 'string' || edge.label.trim() === '').map((edge) => asId(edge.to)).filter(Boolean);
  addCheck(
    10,
    gatewayOut.length >= 2 && unlabeledGatewayTargets.length === 0,
    `${gatewayOut.length - unlabeledGatewayTargets.length}/${gatewayOut.length}本にラベル`,
    unlabeledGatewayTargets
  );

  const adj = new Map();
  for (const edge of typedEdges) {
    const from = asId(edge.from);
    const to = asId(edge.to);
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from).push(to);
  }
  const stack = typedNodes.filter((node) => node.type === 'start').map((node) => asId(node.id));
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    for (const next of adj.get(current) || []) stack.push(next);
  }
  const unreachable = [...idSet].filter((id) => id && !seen.has(id)).sort();
  const unreachableLabels = typedNodes
    .filter((node) => unreachable.includes(asId(node.id)))
    .map((node) => (typeof node.label === 'string' && node.label ? `「${node.label}」` : asId(node.id)));
  addCheck(
    11,
    unreachable.length === 0,
    unreachable.length ? `孤立: ${unreachable.join(', ')}` : '',
    unreachable,
    unreachableLabels.length
      ? `${unreachableLabels.join('、')}がどこにも繋がっていません。線を引いて接続してください`
      : MESSAGE_TEXT[11]
  );

  return {
    ok: checks.filter((check) => check.level === 'fatal' && !check.passed).length === 0,
    checks,
    messages
  };
}
