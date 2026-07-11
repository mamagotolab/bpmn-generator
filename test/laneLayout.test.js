import { describe, expect, it } from 'vitest';
import { computeLaneLayout } from '../src/flow/laneLayout.js';

function nodeById(layout, id) {
  return layout.nodes.find((node) => node.id === id);
}

function centerY(node) {
  return node.y + node.height / 2;
}

describe('computeLaneLayout', () => {
  it('2レーンの直線フローを正しい行に置き、列を単調増加させる', () => {
    const layout = computeLaneLayout({
      nodes: [
        { id: 'start', type: 'start', label: '開始', lane: '営業' },
        { id: 'task1', type: 'task', label: '取得', lane: '営業' },
        { id: 'task2', type: 'task', label: '登録', lane: '営業事務' },
        { id: 'end', type: 'end', label: '終了', lane: '営業事務' }
      ],
      edges: [
        { from: 'start', to: 'task1', label: '' },
        { from: 'task1', to: 'task2', label: '' },
        { from: 'task2', to: 'end', label: '' }
      ]
    });

    expect(layout.lanes.map((lane) => lane.name)).toEqual(['営業', '営業事務']);
    expect(centerY(nodeById(layout, 'start'))).toBe(centerY(nodeById(layout, 'task1')));
    expect(centerY(nodeById(layout, 'task2'))).toBe(centerY(nodeById(layout, 'end')));
    expect(centerY(nodeById(layout, 'task2'))).toBeGreaterThan(centerY(nodeById(layout, 'task1')));
    expect(nodeById(layout, 'start').x).toBeLessThan(nodeById(layout, 'task1').x);
    expect(nodeById(layout, 'task1').x).toBeLessThan(nodeById(layout, 'task2').x);
    expect(nodeById(layout, 'task2').x).toBeLessThan(nodeById(layout, 'end').x);
  });

  it('分岐先をgatewayの次のdepthへ配置する', () => {
    const layout = computeLaneLayout({
      nodes: [
        { id: 'start', type: 'start', label: '開始', lane: '営業' },
        { id: 'gateway', type: 'gateway', label: '判断', lane: '営業' },
        { id: 'task1', type: 'task', label: 'A', lane: '営業' },
        { id: 'task2', type: 'task', label: 'B', lane: '倉庫' }
      ],
      edges: [
        { from: 'start', to: 'gateway', label: '' },
        { from: 'gateway', to: 'task1', label: '' },
        { from: 'gateway', to: 'task2', label: '' }
      ]
    });

    const gateway = nodeById(layout, 'gateway');
    expect(nodeById(layout, 'task1').x).toBe(gateway.x + 170);
    expect(nodeById(layout, 'task2').x).toBe(gateway.x + 170);
  });

  it('同じdepthかつ同じlaneの衝突を解消する', () => {
    const layout = computeLaneLayout({
      nodes: [
        { id: 'start', type: 'start', label: '開始', lane: '営業' },
        { id: 'gateway', type: 'gateway', label: '判断', lane: '営業' },
        { id: 'task1', type: 'task', label: 'A', lane: '営業' },
        { id: 'task2', type: 'task', label: 'B', lane: '営業' }
      ],
      edges: [
        { from: 'start', to: 'gateway', label: '' },
        { from: 'gateway', to: 'task1', label: '' },
        { from: 'gateway', to: 'task2', label: '' }
      ]
    });

    expect(nodeById(layout, 'task1').x).toBeLessThan(nodeById(layout, 'task2').x);
  });

  it('異なるレーンへのedgeは4点、同じレーン内のedgeは2点にする', () => {
    const layout = computeLaneLayout({
      nodes: [
        { id: 'start', type: 'start', label: '開始', lane: '営業' },
        { id: 'task1', type: 'task', label: '取得', lane: '営業' },
        { id: 'task2', type: 'task', label: '登録', lane: '営業事務' }
      ],
      edges: [
        { from: 'start', to: 'task1', label: '' },
        { from: 'task1', to: 'task2', label: '' }
      ]
    });

    expect(layout.edges.find((edge) => edge.from === 'start').waypoints).toHaveLength(2);
    expect(layout.edges.find((edge) => edge.from === 'task1').waypoints).toHaveLength(4);
  });

  it('gatewayから同レーン直進edgeと他レーンedgeが並ぶとき、他レーンedgeは送り元の直後で早めに折れる（経路の重なりでラベル衝突しないように）', () => {
    const layout = computeLaneLayout({
      nodes: [
        { id: 'start', type: 'start', label: '開始', lane: '営業' },
        { id: 'gateway', type: 'gateway', label: '判断', lane: '営業事務' },
        { id: 'same', type: 'task', label: '同レーン', lane: '営業事務' },
        { id: 'other', type: 'task', label: '他レーン', lane: '営業' }
      ],
      edges: [
        { from: 'start', to: 'gateway', label: '' },
        { from: 'gateway', to: 'same', label: '' },
        { from: 'gateway', to: 'other', label: '' }
      ]
    });

    const crossLaneEdge = layout.edges.find((edge) => edge.from === 'gateway' && edge.to === 'other');
    const sourceX = nodeById(layout, 'gateway').x + nodeById(layout, 'gateway').width;
    const bendX = crossLaneEdge.waypoints[1].x;
    // 中間地点（同レーンedgeの終点付近）まで水平に進んでから曲がるのではなく、
    // 送り元のすぐ近くで曲がることを固定化する。
    expect(bendX - sourceX).toBeLessThanOrEqual(30);
  });

  it('同レーン向けの兄弟edgeが2本とも直線だと完全に重なるため、上下にずらす', () => {
    const layout = computeLaneLayout({
      nodes: [
        { id: 'gateway', type: 'gateway', label: '判断', lane: '営業事務' },
        { id: 'near', type: 'task', label: '近い', lane: '営業事務' },
        { id: 'far', type: 'task', label: '遠い', lane: '営業事務' }
      ],
      edges: [
        { from: 'gateway', to: 'near', label: 'A' },
        { from: 'gateway', to: 'far', label: 'B' }
      ]
    });

    const edgeToNear = layout.edges.find((edge) => edge.to === 'near');
    const edgeToFar = layout.edges.find((edge) => edge.to === 'far');
    // どちらも起点直後の折れ曲がり位置のY座標が、送り元の中心Yから互いに逆方向へずれ、
    // 一致しないこと（完全に同じ経路を辿らない）。
    expect(edgeToNear.waypoints[1].y).not.toBe(edgeToFar.waypoints[1].y);
  });

  it('全レーンの幅を同じ値にする', () => {
    const layout = computeLaneLayout({
      nodes: [
        { id: 'start', type: 'start', label: '開始', lane: '営業' },
        { id: 'task1', type: 'task', label: '取得', lane: '営業事務' },
        { id: 'end', type: 'end', label: '終了', lane: '倉庫' }
      ],
      edges: [
        { from: 'start', to: 'task1', label: '' },
        { from: 'task1', to: 'end', label: '' }
      ]
    });

    expect(new Set(layout.lanes.map((lane) => lane.width)).size).toBe(1);
  });

  it('空文字のlaneを未分類レーンにまとめる', () => {
    const layout = computeLaneLayout({
      nodes: [{ id: 'start', type: 'start', label: '開始', lane: '' }],
      edges: []
    });

    expect(layout.lanes).toEqual([
      expect.objectContaining({
        name: '（未分類）',
        nodeIds: ['start']
      })
    ]);
  });
});
