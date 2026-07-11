import BpmnModdle from 'bpmn-moddle';
import { describe, expect, it } from 'vitest';
import { bpmnXmlToFlow } from '../src/flow/fromBpmnXml.js';
import { flowToBpmnXml } from '../src/flow/toBpmnXml.js';
import { sampleFlow } from './fixtures.js';

describe('flowToBpmnXml', () => {
  it('中間JSONをDI付きBPMN XMLへ変換し、再パースできる', async () => {
    const xml = await flowToBpmnXml(sampleFlow);

    expect(xml).toContain('<bpmn:startEvent');
    expect(xml).toContain('<bpmn:endEvent');
    expect(xml).toContain('<bpmn:exclusiveGateway');
    expect(xml.match(/<bpmn:sequenceFlow/g)).toHaveLength(sampleFlow.edges.length);
    expect(xml).toContain('<bpmndi:BPMNDiagram');
    expect(xml).toContain('<bpmn:laneSet');
    expect(xml).not.toContain('lane: 営業');

    const moddle = new BpmnModdle();
    const { rootElement } = await moddle.fromXML(xml);
    const process = rootElement.rootElements.find((element) => element.$type === 'bpmn:Process');
    expect(process.flowElements.filter((element) => element.$type === 'bpmn:StartEvent')).toHaveLength(1);
    expect(process.flowElements.filter((element) => element.$type === 'bpmn:EndEvent')).toHaveLength(1);
    expect(process.flowElements.filter((element) => element.$type === 'bpmn:ExclusiveGateway')).toHaveLength(1);
    expect(process.flowElements.filter((element) => element.$type === 'bpmn:SequenceFlow')).toHaveLength(sampleFlow.edges.length);
    expect(rootElement.diagrams).toHaveLength(1);
  });

  it('LaneSetとレーン・ノード分のBPMNShapeを生成し、laneを往復できる', async () => {
    const flow = {
      nodes: [
        { id: 'n1', type: 'start', label: '開始', lane: '営業' },
        { id: 'n2', type: 'task', label: '案件取得', lane: '営業' },
        { id: 'n3', type: 'task', label: '登録', lane: '営業事務' },
        { id: 'n4', type: 'end', label: '終了', lane: '営業事務' }
      ],
      edges: [
        { from: 'n1', to: 'n2', label: '' },
        { from: 'n2', to: 'n3', label: '' },
        { from: 'n3', to: 'n4', label: '' }
      ]
    };

    const xml = await flowToBpmnXml(flow);
    const moddle = new BpmnModdle();
    const { rootElement } = await moddle.fromXML(xml);
    const process = rootElement.rootElements.find((element) => element.$type === 'bpmn:Process');
    const lanes = process.laneSets[0].lanes;

    expect(lanes).toHaveLength(2);
    expect(lanes.find((lane) => lane.name === '営業').flowNodeRef.map((node) => node.id)).toEqual(['n1', 'n2']);
    expect(lanes.find((lane) => lane.name === '営業事務').flowNodeRef.map((node) => node.id)).toEqual(['n3', 'n4']);

    const shapes = rootElement.diagrams[0].plane.planeElement.filter((element) => element.$type === 'bpmndi:BPMNShape');
    expect(shapes).toHaveLength(flow.nodes.length + lanes.length);

    const roundTripped = await bpmnXmlToFlow(xml);
    expect(roundTripped.nodes.map((node) => [node.id, node.lane])).toEqual(flow.nodes.map((node) => [node.id, node.lane]));
  });

  it('fatalな検証NGがある場合は投げる', async () => {
    const invalid = { ...sampleFlow, edges: [{ from: 'missing', to: 'n2', label: '' }] };
    await expect(flowToBpmnXml(invalid)).rejects.toThrow('BPMN XMLを生成できません');
  });
});
