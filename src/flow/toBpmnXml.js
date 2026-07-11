import BpmnModdle from 'bpmn-moddle';
import { computeLaneLayout } from './laneLayout.js';
import { validateFlow } from './validate.js';

const BPMN_TYPE_BY_FLOW_TYPE = {
  start: 'bpmn:StartEvent',
  task: 'bpmn:Task',
  gateway: 'bpmn:ExclusiveGateway',
  end: 'bpmn:EndEvent'
};

function createBounds(moddle, bounds) {
  return moddle.create('dc:Bounds', bounds);
}

function createPoint(moddle, point) {
  return moddle.create('dc:Point', { x: point.x, y: point.y });
}

function createShape(moddle, semantic, bounds, attrs = {}) {
  return moddle.create('bpmndi:BPMNShape', {
    bpmnElement: semantic,
    bounds: createBounds(moddle, bounds),
    ...attrs
  });
}

function createEdge(moddle, semantic, waypoints) {
  return moddle.create('bpmndi:BPMNEdge', {
    bpmnElement: semantic,
    waypoint: waypoints.map((point) => createPoint(moddle, point))
  });
}

/**
 * @param {import('./schema.js').Flow} flow
 * @returns {Promise<string>}
 */
export async function flowToBpmnXml(flow) {
  const validation = validateFlow(flow);
  const fatalMessages = validation.messages.filter((message) => message.level === 'fatal');
  if (fatalMessages.length) {
    throw new Error(`BPMN XMLを生成できません: ${fatalMessages.map((message) => message.text).join(' / ')}`);
  }

  const moddle = new BpmnModdle();
  const layout = computeLaneLayout(flow);
  const process = moddle.create('bpmn:Process', {
    id: 'Process_1',
    isExecutable: false,
    flowElements: []
  });

  const nodeById = new Map();
  for (const node of flow.nodes) {
    const bpmnType = BPMN_TYPE_BY_FLOW_TYPE[node.type];
    const element = moddle.create(bpmnType, {
      id: node.id,
      name: node.label || undefined,
      incoming: [],
      outgoing: []
    });
    nodeById.set(node.id, element);
    process.flowElements.push(element);
  }

  const sequenceFlowById = new Map();
  for (const [index, edge] of flow.edges.entries()) {
    const sourceRef = nodeById.get(edge.from);
    const targetRef = nodeById.get(edge.to);
    const id = `Flow_${index + 1}_${edge.from}_${edge.to}`;
    const sequenceFlow = moddle.create('bpmn:SequenceFlow', {
      id,
      name: edge.label || undefined,
      sourceRef,
      targetRef
    });
    sourceRef.outgoing.push(sequenceFlow);
    targetRef.incoming.push(sequenceFlow);
    sequenceFlowById.set(id, sequenceFlow);
    process.flowElements.push(sequenceFlow);
  }

  const laneById = new Map();
  const laneSet = moddle.create('bpmn:LaneSet', {
    id: 'LaneSet_1',
    lanes: layout.lanes.map((band) => {
      const lane = moddle.create('bpmn:Lane', {
        id: band.id,
        name: band.name,
        flowNodeRef: band.nodeIds.map((id) => nodeById.get(id)).filter(Boolean)
      });
      laneById.set(band.id, lane);
      return lane;
    })
  });
  process.laneSets = [laneSet];

  const definitions = moddle.create('bpmn:Definitions', {
    id: 'Definitions_1',
    targetNamespace: 'https://mamagotolab.example/bpmn-generator',
    rootElements: [process]
  });

  const plane = moddle.create('bpmndi:BPMNPlane', {
    id: 'BPMNPlane_1',
    bpmnElement: process,
    planeElement: [
      ...layout.lanes.map((lane) =>
        createShape(
          moddle,
          laneById.get(lane.id),
          { x: lane.x, y: lane.y, width: lane.width, height: lane.height },
          { isHorizontal: true }
        )
      ),
      ...layout.nodes.map((node) =>
        createShape(moddle, nodeById.get(node.id), {
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height
        })
      ),
      ...layout.edges.map((edge) => createEdge(moddle, sequenceFlowById.get(edge.edgeId), edge.waypoints))
    ]
  });
  const diagram = moddle.create('bpmndi:BPMNDiagram', {
    id: 'BPMNDiagram_1',
    plane
  });
  definitions.diagrams = [diagram];

  const { xml } = await moddle.toXML(definitions, { format: true });
  return xml;
}
