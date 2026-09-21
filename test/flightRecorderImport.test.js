import { describe, expect, it, vi } from 'vitest';
import { importFlightRecorder, parseImportEnvelope } from '../src/import/flightRecorder.js';
import { sampleFlow } from './fixtures.js';

function recorder(overrides = {}) {
  return {
    format: 'workflow-flight-recorder',
    version: 1,
    title: '  受注確認  ',
    flow: structuredClone(sampleFlow),
    ...overrides
  };
}

describe('parseImportEnvelope', () => {
  it('legacy配列とversion 1 backupをbackupとして判定する', () => {
    expect(parseImportEnvelope('[]')).toEqual({ kind: 'backup', data: [] });
    const backup = { version: 1, flows: [{ id: 'a' }] };
    expect(parseImportEnvelope(JSON.stringify(backup))).toEqual({ kind: 'backup', data: backup });
  });

  it('flight recorder形式を判定する', () => {
    const data = recorder();
    expect(parseImportEnvelope(JSON.stringify(data))).toEqual({ kind: 'flight-recorder', data });
  });

  it('不明な宣言済みformatを拒否する', () => {
    expect(() => parseImportEnvelope(JSON.stringify({ format: 'unknown', version: 1, flows: [] })))
      .toThrow(/形式/);
  });

  it('壊れたJSONを内容を漏らさない明確なエラーで拒否する', () => {
    expect(() => parseImportEnvelope('{secret'))
      .toThrow(/JSON/);
  });
});

describe('importFlightRecorder', () => {
  it('version 1を検証・変換してtrim済みtitleで保存する', async () => {
    const order = [];
    const convert = vi.fn(async (flow) => {
      order.push('convert');
      expect(flow).toEqual(sampleFlow);
      return '<xml />';
    });
    const saved = { id: 'saved', title: '受注確認', category: '', xml: '<xml />' };
    const save = vi.fn((record) => {
      order.push('save');
      return saved;
    });

    const result = await importFlightRecorder(JSON.stringify(recorder()), { convert, save });

    expect(result).toEqual({ record: saved, flow: sampleFlow, xml: '<xml />' });
    expect(save).toHaveBeenCalledWith({ title: '受注確認', category: '', xml: '<xml />' });
    expect(order).toEqual(['convert', 'save']);
  });

  it('入力を一度だけparseする', async () => {
    const parse = vi.spyOn(JSON, 'parse');
    await importFlightRecorder(JSON.stringify(recorder()), {
      convert: async () => '<xml />',
      save: (record) => record
    });
    expect(parse).toHaveBeenCalledTimes(1);
    parse.mockRestore();
  });

  it.each([
    ['version欠落', { version: undefined }],
    ['未知version', { version: 2 }],
    ['空title', { title: '  ' }],
    ['flowが配列', { flow: [] }],
    ['nodes欠落', { flow: { edges: [] } }],
    ['edges欠落', { flow: { nodes: [] } }],
    ['nodeがnull', { flow: { nodes: [null], edges: [] } }],
    ['node idが空', { flow: { nodes: [{ id: '', type: 'start', label: '', lane: '担当' }], edges: [] } }],
    ['node typeが不正', { flow: { nodes: [{ id: 'n1', type: 'work', label: '', lane: '担当' }], edges: [] } }],
    ['node labelが非文字列', { flow: { nodes: [{ id: 'n1', type: 'start', label: null, lane: '担当' }], edges: [] } }],
    ['node laneが空', { flow: { nodes: [{ id: 'n1', type: 'start', label: '', lane: '' }], edges: [] } }],
    ['edgeがnull', { flow: { nodes: sampleFlow.nodes, edges: [null] } }],
    ['edge参照が空', { flow: { nodes: sampleFlow.nodes, edges: [{ from: '', to: 'n2' }] } }],
    ['edge labelが非文字列', { flow: { nodes: sampleFlow.nodes, edges: [{ from: 'n1', to: 'n2', label: null }] } }]
  ])('%sを変換前に拒否する', async (_name, overrides) => {
    const convert = vi.fn();
    const save = vi.fn();
    await expect(importFlightRecorder(JSON.stringify(recorder(overrides)), { convert, save })).rejects.toThrow();
    expect(convert).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('重複node IDを変換前に拒否する', async () => {
    const duplicate = structuredClone(sampleFlow);
    duplicate.nodes[1].id = duplicate.nodes[0].id;
    const convert = vi.fn();
    const save = vi.fn();
    await expect(importFlightRecorder(JSON.stringify(recorder({ flow: duplicate })), { convert, save }))
      .rejects.toThrow(/重複/);
    expect(convert).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('存在しないnodeを参照するedgeを変換前に拒否する', async () => {
    const dangling = structuredClone(sampleFlow);
    dangling.edges[0].to = 'missing';
    const convert = vi.fn();
    const save = vi.fn();
    await expect(importFlightRecorder(JSON.stringify(recorder({ flow: dangling })), { convert, save }))
      .rejects.toThrow(/参照/);
    expect(convert).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('fatalとなるstart欠落を変換前に拒否する', async () => {
    const noStart = structuredClone(sampleFlow);
    noStart.nodes = noStart.nodes.filter((node) => node.type !== 'start');
    noStart.edges = noStart.edges.filter((edge) => edge.from !== 'n1' && edge.to !== 'n1');
    const convert = vi.fn();
    const save = vi.fn();
    await expect(importFlightRecorder(JSON.stringify(recorder({ flow: noStart })), { convert, save }))
      .rejects.toThrow(/開始|検証/);
    expect(convert).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('変換失敗時は保存せず元flowを変更しない', async () => {
    const flow = structuredClone(sampleFlow);
    const before = structuredClone(flow);
    const save = vi.fn();
    await expect(importFlightRecorder(JSON.stringify(recorder({ flow })), {
      convert: async (value) => {
        value.nodes[0].label = '変換側の変更';
        throw new Error('conversion failed');
      },
      save
    })).rejects.toThrow('conversion failed');
    expect(save).not.toHaveBeenCalled();
    expect(flow).toEqual(before);
  });

  it('保存失敗を成功扱いしない', async () => {
    await expect(importFlightRecorder(JSON.stringify(recorder()), {
      convert: async () => '<xml />',
      save: async () => { throw new Error('storage failed'); }
    })).rejects.toThrow('storage failed');
  });

  it.each([
    ['startの自己ループ', [{ from: 'n1', to: 'n1', label: '' }, ...sampleFlow.edges]],
    ['到達可能な循環', sampleFlow.edges.map((edge) => edge.from === 'n3' ? { ...edge, to: 'n2' } : edge)],
  ])('%sを変換前に拒否する', async (_name, edges) => {
    const convert = vi.fn();
    const save = vi.fn();
    await expect(importFlightRecorder(JSON.stringify(recorder({
      flow: { nodes: structuredClone(sampleFlow.nodes), edges },
    })), { convert, save })).rejects.toThrow(/循環|開始/);
    expect(convert).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    ['startが複数', [...sampleFlow.nodes, { id: 'start2', type: 'start', label: '開始2', lane: '営業' }], sampleFlow.edges],
    ['endが複数', [...sampleFlow.nodes, { id: 'end2', type: 'end', label: '終了2', lane: '営業' }], sampleFlow.edges],
    ['startへのincoming', sampleFlow.nodes, [...sampleFlow.edges, { from: 'n2', to: 'n1', label: '' }]],
    ['endからのoutgoing', sampleFlow.nodes, [...sampleFlow.edges, { from: 'n10', to: 'n2', label: '' }]],
  ])('%sを変換前に拒否する', async (_name, nodes, edges) => {
    const convert = vi.fn();
    await expect(importFlightRecorder(JSON.stringify(recorder({ flow: { nodes, edges } })), {
      convert, save: vi.fn(),
    })).rejects.toThrow(/開始|終了/);
    expect(convert).not.toHaveBeenCalled();
  });

  it.each(['123', 'bad id', 'Process_1', 'Definitions_x', 'BPMNPlane_x', 'BPMNDiagram_x', 'LaneSet_x', 'Lane_x', 'Flow_x'])(
    'XMLで安全でない、またはconverter予約済みのnode IDを拒否する: %s',
    async (id) => {
      const flow = structuredClone(sampleFlow);
      const oldId = flow.nodes[1].id;
      flow.nodes[1].id = id;
      flow.edges = flow.edges.map((edge) => ({
        ...edge,
        from: edge.from === oldId ? id : edge.from,
        to: edge.to === oldId ? id : edge.to,
      }));
      await expect(importFlightRecorder(JSON.stringify(recorder({ flow })), {
        convert: vi.fn(), save: vi.fn(),
      })).rejects.toThrow(/ID/);
    },
  );

  it.each([
    ['wrapper', (value) => ({ ...value, rawTitle: 'SECRET' })],
    ['flow', (value) => ({ ...value, flow: { ...value.flow, rawFlow: 'SECRET' } })],
    ['node', (value) => ({ ...value, flow: { ...value.flow, nodes: value.flow.nodes.map((node, index) => index ? node : { ...node, rawNode: 'SECRET' }) } })],
    ['edge', (value) => ({ ...value, flow: { ...value.flow, edges: value.flow.edges.map((edge, index) => index ? edge : { ...edge, rawEdge: 'SECRET' }) } })],
  ])('%sのallow-list外プロパティを変換・保存前に拒否する', async (_name, alter) => {
    const convert = vi.fn();
    const save = vi.fn();
    await expect(importFlightRecorder(JSON.stringify(alter(recorder())), { convert, save })).rejects.toThrow(/項目/);
    expect(convert).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '', '   ', 42])('空でないXML文字列以外の変換結果を保存しない: %s', async (xml) => {
    const save = vi.fn();
    await expect(importFlightRecorder(JSON.stringify(recorder()), {
      convert: async () => xml, save,
    })).rejects.toThrow(/XML/);
    expect(save).not.toHaveBeenCalled();
  });
});
