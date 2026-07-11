const NODE_SIZE = {
  start: { width: 36, height: 36 },
  end: { width: 36, height: 36 },
  gateway: { width: 50, height: 50 },
  task: { width: 100, height: 80 }
};

const COLUMN_SPACING = 170;
const LANE_HEIGHT = 160;
const MARGIN_LEFT = 60;
const MARGIN_TOP = 40;
const LANE_HEADER_WIDTH = 30;
const UNCATEGORIZED_LANE = '（未分類）';

function laneName(node) {
  return typeof node.lane === 'string' && node.lane.trim() ? node.lane : UNCATEGORIZED_LANE;
}

function computeDepths(flow) {
  const nodeIds = new Set(flow.nodes.map((node) => node.id));
  const adjacency = new Map(flow.nodes.map((node) => [node.id, []]));
  const incomingCount = new Map(flow.nodes.map((node) => [node.id, 0]));
  const processedIncoming = new Map(flow.nodes.map((node) => [node.id, 0]));
  const depths = new Map();

  for (const edge of flow.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    adjacency.get(edge.from).push(edge.to);
    incomingCount.set(edge.to, incomingCount.get(edge.to) + 1);
  }

  const queue = flow.nodes.filter((node) => node.type === 'start').map((node) => node.id);
  for (const id of queue) depths.set(id, 0);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const currentDepth = depths.get(current) ?? 0;

    for (const next of adjacency.get(current) ?? []) {
      depths.set(next, Math.max(depths.get(next) ?? 0, currentDepth + 1));
      processedIncoming.set(next, processedIncoming.get(next) + 1);

      if (processedIncoming.get(next) >= incomingCount.get(next)) {
        queue.push(next);
      }
    }
  }

  for (const node of flow.nodes) {
    if (!depths.has(node.id)) depths.set(node.id, 0);
  }

  return depths;
}

function resolveCollisions(flow, depths) {
  for (let pass = 0; pass < flow.nodes.length; pass += 1) {
    const occupied = new Set();
    let changed = false;

    for (const node of flow.nodes) {
      let depth = depths.get(node.id) ?? 0;
      const lane = laneName(node);
      const key = `${depth}\u0000${lane}`;

      if (occupied.has(key)) {
        depth += 1;
        depths.set(node.id, depth);
        changed = true;
      }

      occupied.add(`${depth}\u0000${lane}`);
    }

    if (!changed) break;
  }
}

/**
 * @typedef {{ id: string, x: number, y: number, width: number, height: number }} PositionedNode
 * @typedef {{ id: string, name: string, x: number, y: number, width: number, height: number, nodeIds: string[] }} LaneBand
 * @typedef {{ edgeId: string, from: string, to: string, waypoints: {x:number,y:number}[] }} PositionedEdge
 *
 * @param {import('./schema.js').Flow} flow
 * @returns {{ nodes: PositionedNode[], lanes: LaneBand[], edges: PositionedEdge[] }}
 */
export function computeLaneLayout(flow) {
  const depths = computeDepths(flow);
  resolveCollisions(flow, depths);

  const laneOrder = [];
  const laneIndexByName = new Map();
  for (const node of flow.nodes) {
    const lane = laneName(node);
    if (!laneIndexByName.has(lane)) {
      laneIndexByName.set(lane, laneOrder.length);
      laneOrder.push(lane);
    }
  }

  const positionedNodes = flow.nodes.map((node) => {
    const size = NODE_SIZE[node.type] ?? NODE_SIZE.task;
    const row = laneIndexByName.get(laneName(node)) ?? 0;
    const laneTop = MARGIN_TOP + row * LANE_HEIGHT;

    return {
      id: node.id,
      x: MARGIN_LEFT + (depths.get(node.id) ?? 0) * COLUMN_SPACING,
      y: laneTop + (LANE_HEIGHT - size.height) / 2,
      width: size.width,
      height: size.height
    };
  });

  const maxColumn = Math.max(0, ...Array.from(depths.values()));
  const laneWidth = MARGIN_LEFT + (maxColumn + 1) * COLUMN_SPACING + MARGIN_LEFT;
  const lanes = laneOrder.map((name, index) => ({
    id: `Lane_${index}`,
    name,
    x: 0,
    y: MARGIN_TOP - 20 + index * LANE_HEIGHT,
    width: laneWidth,
    height: LANE_HEIGHT,
    nodeIds: flow.nodes.filter((node) => laneName(node) === name).map((node) => node.id)
  }));

  const nodeById = new Map(positionedNodes.map((node) => [node.id, node]));
  const edges = flow.edges.flatMap((edge, index) => {
    const source = nodeById.get(edge.from);
    const target = nodeById.get(edge.to);
    if (!source || !target) return [];

    const sourceRight = { x: source.x + source.width, y: source.y + source.height / 2 };
    const targetLeft = { x: target.x, y: target.y + target.height / 2 };
    const waypoints =
      sourceRight.y === targetLeft.y
        ? [sourceRight, targetLeft]
        : [
            sourceRight,
            {
              x: targetLeft.x > sourceRight.x ? sourceRight.x + (targetLeft.x - sourceRight.x) / 2 : sourceRight.x + 40,
              y: sourceRight.y
            },
            {
              x: targetLeft.x > sourceRight.x ? sourceRight.x + (targetLeft.x - sourceRight.x) / 2 : sourceRight.x + 40,
              y: targetLeft.y
            },
            targetLeft
          ];

    return [
      {
        edgeId: `Flow_${index + 1}_${edge.from}_${edge.to}`,
        from: edge.from,
        to: edge.to,
        waypoints
      }
    ];
  });

  void LANE_HEADER_WIDTH;

  return { nodes: positionedNodes, lanes, edges };
}
