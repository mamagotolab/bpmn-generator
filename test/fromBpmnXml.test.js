import { describe, expect, it } from 'vitest';
import { bpmnXmlToFlow } from '../src/flow/fromBpmnXml.js';
import { flowToBpmnXml } from '../src/flow/toBpmnXml.js';
import { sampleFlow } from './fixtures.js';

describe('bpmnXmlToFlow', () => {
  it('既知XMLから中間JSONを復元する', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="test">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="n1" name="開始"><bpmn:documentation>lane: 営業</bpmn:documentation><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="n2" name="確認"><bpmn:documentation>lane: 営業</bpmn:documentation><bpmn:incoming>f1</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing></bpmn:task>
    <bpmn:exclusiveGateway id="n3" name="判断"><bpmn:documentation>lane: 営業</bpmn:documentation><bpmn:incoming>f2</bpmn:incoming><bpmn:outgoing>f3</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:endEvent id="n4" name="終了"><bpmn:documentation>lane: 倉庫</bpmn:documentation><bpmn:incoming>f3</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="f1" sourceRef="n1" targetRef="n2" />
    <bpmn:sequenceFlow id="f2" sourceRef="n2" targetRef="n3" />
    <bpmn:sequenceFlow id="f3" name="はい" sourceRef="n3" targetRef="n4" />
  </bpmn:process>
</bpmn:definitions>`;

    const flow = await bpmnXmlToFlow(xml);
    expect(flow.nodes).toEqual([
      { id: 'n1', type: 'start', label: '開始', lane: '営業' },
      { id: 'n2', type: 'task', label: '確認', lane: '営業' },
      { id: 'n3', type: 'gateway', label: '判断', lane: '営業' },
      { id: 'n4', type: 'end', label: '終了', lane: '倉庫' }
    ]);
    expect(flow.edges).toEqual([
      { from: 'n1', to: 'n2', label: '' },
      { from: 'n2', to: 'n3', label: '' },
      { from: 'n3', to: 'n4', label: 'はい' }
    ]);
  });

  it('toBpmnXmlとの往復でノードとエッジを保つ', async () => {
    const xml = await flowToBpmnXml(sampleFlow);
    const flow = await bpmnXmlToFlow(xml);

    expect(flow.nodes).toHaveLength(sampleFlow.nodes.length);
    expect(flow.edges).toHaveLength(sampleFlow.edges.length);
    expect(flow.nodes).toEqual(expect.arrayContaining(sampleFlow.nodes));
    expect(flow.edges).toEqual(expect.arrayContaining(sampleFlow.edges));
  });
});
