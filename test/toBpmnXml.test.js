import BpmnModdle from 'bpmn-moddle';
import { describe, expect, it } from 'vitest';
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
    expect(xml).toContain('lane: 営業');

    const moddle = new BpmnModdle();
    const { rootElement } = await moddle.fromXML(xml);
    const process = rootElement.rootElements.find((element) => element.$type === 'bpmn:Process');
    expect(process.flowElements.filter((element) => element.$type === 'bpmn:StartEvent')).toHaveLength(1);
    expect(process.flowElements.filter((element) => element.$type === 'bpmn:EndEvent')).toHaveLength(1);
    expect(process.flowElements.filter((element) => element.$type === 'bpmn:ExclusiveGateway')).toHaveLength(1);
    expect(process.flowElements.filter((element) => element.$type === 'bpmn:SequenceFlow')).toHaveLength(sampleFlow.edges.length);
    expect(rootElement.diagrams).toHaveLength(1);
  });

  it('fatalな検証NGがある場合は投げる', async () => {
    const invalid = { ...sampleFlow, edges: [{ from: 'missing', to: 'n2', label: '' }] };
    await expect(flowToBpmnXml(invalid)).rejects.toThrow('BPMN XMLを生成できません');
  });
});
