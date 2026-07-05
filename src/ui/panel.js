const LEVEL_LABEL = {
  fatal: '致命',
  fixable: '要修正',
  warn: '警告'
};

export function selectAndCenter(modeler, nodeIds) {
  const id = nodeIds[0];
  if (!id) return;
  const element = modeler.get('elementRegistry').get(id);
  if (!element) return;
  modeler.get('selection').select(element);
  modeler.get('canvas').zoom('fit-viewport', element);
}

export function renderValidationPanel(container, validation, options = {}) {
  container.replaceChildren();
  const title = document.createElement('h2');
  title.textContent = '検証結果';
  container.append(title);

  if (!validation.messages.length) {
    const ok = document.createElement('p');
    ok.className = 'validation-ok';
    ok.textContent = '問題は見つかりませんでした。';
    container.append(ok);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'validation-list';
  for (const message of validation.messages) {
    const item = document.createElement('li');
    item.className = `validation-item ${message.level}`;
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = LEVEL_LABEL[message.level];
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = message.text;
    button.disabled = !message.nodeIds?.length;
    button.addEventListener('click', () => options.onSelectNode?.(message.nodeIds || []));
    item.append(badge, button);
    list.append(item);
  }
  container.append(list);
}
