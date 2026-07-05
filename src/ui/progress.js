export function startProgress(container, message = 'ローカルAIが業務を読み取っています（30秒〜2分ほど）') {
  const startedAt = Date.now();
  container.hidden = false;
  container.replaceChildren();

  const spinner = document.createElement('span');
  spinner.className = 'spinner';
  const text = document.createElement('span');
  text.textContent = message;
  const seconds = document.createElement('span');
  seconds.className = 'elapsed';

  container.append(spinner, text, seconds);
  const update = () => {
    seconds.textContent = `${Math.floor((Date.now() - startedAt) / 1000)}秒`;
  };
  update();
  const timer = globalThis.setInterval(update, 1000);
  return () => {
    globalThis.clearInterval(timer);
    container.hidden = true;
  };
}
