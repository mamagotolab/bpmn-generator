import Encoding from 'encoding-japanese';
import { describe, expect, it } from 'vitest';
import { encodeCsv, flowToCsvRows } from '../src/export/csv.js';
import { sampleFlow } from './fixtures.js';

describe('csv export', () => {
  it('ノード表とエッジ表の行を作る', () => {
    const rows = flowToCsvRows(sampleFlow);
    expect(rows[0]).toEqual(['ノード表']);
    expect(rows[1]).toEqual(['id', '種別', 'ラベル', '担当lane']);
    expect(rows).toContainEqual(['エッジ表']);
    expect(rows).toContainEqual(['n1', 'start', '注文受付', '顧客']);
    expect(rows).toContainEqual(['n4', 'n5', '在庫あり']);
  });

  it('UTF-8 BOM付きでエンコードする', () => {
    const bytes = encodeCsv([['注文受付']], { encoding: 'utf8-bom' });
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toContain('注文受付');
  });

  it('Shift-JISへ変換する', () => {
    const bytes = encodeCsv([['営業', '倉庫']], { encoding: 'shift-jis' });
    expect([...bytes.slice(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
    const unicode = Encoding.convert([...bytes], { to: 'UNICODE', from: 'SJIS', type: 'string' });
    expect(unicode).toBe('営業,倉庫');
  });
});
