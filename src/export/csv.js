import Encoding from 'encoding-japanese';

export function flowToCsvRows(flow) {
  return [
    ['ノード表'],
    ['id', '種別', 'ラベル', '担当lane'],
    ...flow.nodes.map((node) => [node.id, node.type, node.label, node.lane]),
    [],
    ['エッジ表'],
    ['from', 'to', '条件'],
    ...flow.edges.map((edge) => [edge.from, edge.to, edge.label || ''])
  ];
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function stringifyCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function encodeCsv(rows, { encoding = 'utf8-bom' } = {}) {
  const csv = stringifyCsv(rows);
  if (encoding === 'shift-jis') {
    // Excelの古いShift-JIS(cp932)期待に合わせるため、この用途に限りencoding-japaneseを使う。
    return Uint8Array.from(Encoding.convert(csv, { to: 'SJIS', from: 'UNICODE', type: 'array' }));
  }
  return new TextEncoder().encode(`\uFEFF${csv}`);
}
