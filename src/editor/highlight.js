const ISSUE_MARKER = 'issue';

export function clearHighlights(modeler) {
  const elementRegistry = modeler.get('elementRegistry');
  const canvas = modeler.get('canvas');
  elementRegistry.forEach((element) => {
    canvas.removeMarker(element, ISSUE_MARKER);
  });
}

export function highlightIssues(modeler, messages) {
  clearHighlights(modeler);
  const elementRegistry = modeler.get('elementRegistry');
  const canvas = modeler.get('canvas');
  const ids = new Set(messages.flatMap((message) => message.nodeIds || []));
  for (const id of ids) {
    const element = elementRegistry.get(id);
    if (element) canvas.addMarker(element, ISSUE_MARKER);
  }
}
