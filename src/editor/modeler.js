import Modeler from 'bpmn-js/lib/Modeler';

/**
 * @param {HTMLElement} container
 */
export function createModeler(container) {
  return new Modeler({ container });
}

export async function loadXml(modeler, xml) {
  const result = await modeler.importXML(xml);
  modeler.get('canvas').zoom('fit-viewport', 'auto');
  return result;
}

export async function getXml(modeler) {
  const { xml } = await modeler.saveXML({ format: true });
  return xml || '';
}
