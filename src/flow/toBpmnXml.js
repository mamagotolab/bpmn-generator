import BpmnModdle from 'bpmn-moddle';
import { layoutProcess } from 'bpmn-auto-layout';
import { validateFlow } from './validate.js';

const BPMN_TYPE_BY_FLOW_TYPE = {
  start: 'bpmn:StartEvent',
  task: 'bpmn:Task',
  gateway: 'bpmn:ExclusiveGateway',
  end: 'bpmn:EndEvent'
};

/**
 * laneはDay 2では描画しない。情報保全のため各BPMN要素のdocumentationへ残す。
 *
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
      outgoing: [],
      documentation: [
        moddle.create('bpmn:Documentation', {
          text: `lane: ${node.lane}`
        })
      ]
    });
    nodeById.set(node.id, element);
    process.flowElements.push(element);
  }

  for (const [index, edge] of flow.edges.entries()) {
    const sourceRef = nodeById.get(edge.from);
    const targetRef = nodeById.get(edge.to);
    const sequenceFlow = moddle.create('bpmn:SequenceFlow', {
      id: `Flow_${index + 1}_${edge.from}_${edge.to}`,
      name: edge.label || undefined,
      sourceRef,
      targetRef
    });
    sourceRef.outgoing.push(sequenceFlow);
    targetRef.incoming.push(sequenceFlow);
    process.flowElements.push(sequenceFlow);
  }

  const definitions = moddle.create('bpmn:Definitions', {
    id: 'Definitions_1',
    targetNamespace: 'https://mamagotolab.example/bpmn-generator',
    rootElements: [process]
  });

  const { xml } = await moddle.toXML(definitions, { format: true });
  return layoutProcess(xml);
}
