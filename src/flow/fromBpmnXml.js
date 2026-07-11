import BpmnModdle from 'bpmn-moddle';

const FLOW_TYPE_BY_BPMN_TYPE = {
  'bpmn:StartEvent': 'start',
  'bpmn:Task': 'task',
  'bpmn:ExclusiveGateway': 'gateway',
  'bpmn:EndEvent': 'end'
};

function refId(ref) {
  if (typeof ref === 'string') return ref;
  if (ref && typeof ref === 'object' && typeof ref.id === 'string') return ref.id;
  return '';
}

function mapLaneByNodeId(process) {
  const laneByNodeId = new Map();
  const laneSets = Array.isArray(process?.laneSets) ? process.laneSets : Array.isArray(process?.laneSet) ? process.laneSet : [];
  const lanes = Array.isArray(laneSets[0]?.lanes) ? laneSets[0].lanes : [];

  for (const lane of lanes) {
    const flowNodeRefs = Array.isArray(lane.flowNodeRef) ? lane.flowNodeRef : [];
    for (const flowNodeRef of flowNodeRefs) {
      const id = refId(flowNodeRef);
      if (id) laneByNodeId.set(id, lane.name || '');
    }
  }

  return laneByNodeId;
}

/**
 * BPMN XMLをDay 2の中間JSONへ戻す。GUI編集後の再検証で使う。
 *
 * @param {string} xml
 * @returns {Promise<import('./schema.js').Flow>}
 */
export async function bpmnXmlToFlow(xml) {
  const moddle = new BpmnModdle();
  const { rootElement } = await moddle.fromXML(xml);
  const process = rootElement.rootElements?.find((element) => element.$type === 'bpmn:Process');
  const flowElements = Array.isArray(process?.flowElements) ? process.flowElements : [];
  const laneByNodeId = mapLaneByNodeId(process);

  const nodes = flowElements
    .filter((element) => Object.prototype.hasOwnProperty.call(FLOW_TYPE_BY_BPMN_TYPE, element.$type))
    .map((element) => ({
      id: element.id,
      type: FLOW_TYPE_BY_BPMN_TYPE[element.$type],
      label: element.name || '',
      lane: laneByNodeId.get(element.id) || ''
    }));

  const edges = flowElements
    .filter((element) => element.$type === 'bpmn:SequenceFlow')
    .map((element) => ({
      from: refId(element.sourceRef),
      to: refId(element.targetRef),
      label: element.name || ''
    }));

  return { nodes, edges };
}
