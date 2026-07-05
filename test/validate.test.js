import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { validateFlow } from '../src/flow/validate.js';
import { sampleFlow } from './fixtures.js';

describe('validateFlow', () => {
  it('正常なフローを通す', () => {
    const result = validateFlow(sampleFlow);
    expect(result.ok).toBe(true);
    expect(result.checks).toHaveLength(11);
    expect(result.checks.every((check) => check.passed)).toBe(true);
    expect(result.messages).toEqual([]);
  });

  it('迷子エッジをfatalとして検出する', () => {
    const flow = { ...sampleFlow, edges: [...sampleFlow.edges, { from: 'n999', to: 'n2', label: '' }] };
    const result = validateFlow(flow);
    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.id === 9)).toMatchObject({ level: 'fatal', passed: false });
    expect(result.messages.some((message) => message.text.includes('存在しない工程'))).toBe(true);
  });

  it('孤立ノードをfixableとしてnodeIds付きで検出する', () => {
    const flow = {
      ...sampleFlow,
      nodes: [...sampleFlow.nodes, { id: 'n99', type: 'task', label: '孤立作業', lane: '営業' }]
    };
    const result = validateFlow(flow);
    expect(result.ok).toBe(true);
    expect(result.checks.find((check) => check.id === 11)).toMatchObject({ level: 'fixable', passed: false });
    expect(result.messages.find((message) => message.level === 'fixable')?.nodeIds).toContain('n99');
  });

  it('start欠落をfatalとして検出する', () => {
    const flow = { ...sampleFlow, nodes: sampleFlow.nodes.filter((node) => node.type !== 'start') };
    const result = validateFlow(flow);
    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.id === 4)).toMatchObject({ level: 'fatal', passed: false });
  });

  it('end欠落をfatalとして検出する', () => {
    const flow = { ...sampleFlow, nodes: sampleFlow.nodes.filter((node) => node.type !== 'end') };
    const result = validateFlow(flow);
    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.id === 5)).toMatchObject({ level: 'fatal', passed: false });
  });

  it('不正typeをfatalとして検出する', () => {
    const flow = {
      ...sampleFlow,
      nodes: sampleFlow.nodes.map((node) => node.id === 'n2' ? { ...node, type: 'work' } : node)
    };
    const result = validateFlow(flow);
    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.id === 7)).toMatchObject({ level: 'fatal', passed: false });
  });

  it('gateway条件ラベル欠落をfixableとして検出する', () => {
    const flow = {
      ...sampleFlow,
      edges: sampleFlow.edges.map((edge) => edge.from === 'n4' ? { ...edge, label: '' } : edge)
    };
    const result = validateFlow(flow);
    expect(result.ok).toBe(true);
    expect(result.checks.find((check) => check.id === 10)).toMatchObject({ level: 'fixable', passed: false });
  });

  it('reference/3b_schema_output_sample.jsonで孤立ノードを検出する', async () => {
    const text = await readFile(new URL('../reference/3b_schema_output_sample.json', import.meta.url), 'utf8');
    const flow = JSON.parse(text);
    const result = validateFlow(flow);
    expect(result.ok).toBe(true);
    expect(result.checks.find((check) => check.id === 11)).toMatchObject({ passed: false });
    const reachabilityMessage = result.messages.find((message) => message.nodeIds?.length);
    expect(reachabilityMessage?.nodeIds).toEqual(expect.arrayContaining(['n6', 'n11']));
  });
});
