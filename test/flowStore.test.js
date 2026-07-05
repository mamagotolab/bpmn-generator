import { describe, expect, it } from 'vitest';
import {
  bulkConvertCategory,
  exportAllJson,
  getFlow,
  importJson,
  listFlows,
  saveFlow,
  searchFlows
} from '../src/store/flowStore.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    key(index) {
      return [...map.keys()][index] || null;
    },
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    }
  };
}

const parser = async (xml) => JSON.parse(xml);

describe('flowStore', () => {
  it('CRUDできる', () => {
    const storage = createMemoryStorage();
    const record = saveFlow({ id: 'a', title: '受注', category: '営業', xml: '{"nodes":[],"edges":[]}' }, storage);

    expect(record.id).toBe('a');
    expect(getFlow('a', storage)).toMatchObject({ title: '受注', category: '営業' });
    expect(listFlows(storage)).toHaveLength(1);
  });

  it('title/category/node label/laneを横断検索する', async () => {
    const storage = createMemoryStorage();
    saveFlow({
      id: 'a',
      title: '受注業務',
      category: '営業',
      xml: JSON.stringify({ nodes: [{ id: 'n1', type: 'task', label: '在庫確認', lane: '倉庫' }], edges: [] })
    }, storage);
    saveFlow({
      id: 'b',
      title: '請求業務',
      category: '経理',
      xml: JSON.stringify({ nodes: [{ id: 'n2', type: 'task', label: '請求書発行', lane: '経理' }], edges: [] })
    }, storage);

    expect(await searchFlows('在庫', storage, parser)).toMatchObject([{ flow: { id: 'a' }, matchedNodes: [{ id: 'n1' }] }]);
    expect(await searchFlows('経理', storage, parser)).toHaveLength(1);
  });

  it('カテゴリ一括変換とJSON往復ができる', () => {
    const storage = createMemoryStorage();
    saveFlow({ id: 'a', title: 'A', category: '旧', xml: 'x' }, storage);
    saveFlow({ id: 'b', title: 'B', category: '旧', xml: 'y' }, storage);
    saveFlow({ id: 'c', title: 'C', category: '別', xml: 'z' }, storage);

    expect(bulkConvertCategory('旧', '新', storage)).toBe(2);
    expect(listFlows(storage).filter((record) => record.category === '新')).toHaveLength(2);

    const exported = exportAllJson(storage);
    const restored = createMemoryStorage();
    expect(importJson(exported, restored)).toBe(3);
    expect(listFlows(restored)).toHaveLength(3);
  });
});
