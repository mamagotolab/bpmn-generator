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

function laneFromDocumentation(documentation) {
  const docs = Array.isArray(documentation) ? documentation : [];
  for (const doc of docs) {
    const text = doc && typeof doc === 'object' && typeof doc.text === 'string' ? doc.text : '';
    const match = text.match(/(?:^|\n)\s*lane:\s*(.+?)\s*$/m);
    if (match) return match[1].trim();
  }
  return '';
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

  const nodes = flowElements
    .filter((element) => Object.prototype.hasOwnProperty.call(FLOW_TYPE_BY_BPMN_TYPE, element.$type))
    .map((element) => ({
      id: element.id,
      type: FLOW_TYPE_BY_BPMN_TYPE[element.$type],
      label: element.name || '',
      lane: laneFromDocumentation(element.documentation)
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
