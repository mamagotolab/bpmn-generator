#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { checkOllama, generateFlow } from '../src/llm/ollama.js';
import { flowToBpmnXml } from '../src/flow/toBpmnXml.js';

const inputPath = process.argv[2];

if (!inputPath) {
  console.error('使い方: node scripts/demo.mjs test/manual/sample_juchu.txt');
  process.exit(1);
}

try {
  const text = await readFile(inputPath, 'utf8');
  await checkOllama({});
  const { flow, validation, attempts } = await generateFlow({ text });
  const xml = await flowToBpmnXml(flow);

  await mkdir('out', { recursive: true });
  const xmlPath = resolve('out', `${basename(inputPath).replace(/\.[^.]+$/, '')}.bpmn`);
  await writeFile(xmlPath, xml, 'utf8');
  await writeFile(resolve('out', 'preview.html'), buildPreviewHtml(xml), 'utf8');

  console.log('--- 中間JSON ---');
  console.log(JSON.stringify(flow, null, 2));
  console.log('\n--- 検証結果 ---');
  console.log(JSON.stringify({ attempts, validation }, null, 2));
  console.log('\n--- BPMN XML ---');
  console.log(xml);
  console.error(`\n保存しました: ${xmlPath}`);
  console.error('確認用HTML: out/preview.html');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

/**
 * @param {string} xml
 */
function buildPreviewHtml(xml) {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>BPMN Preview</title>
  <link rel="stylesheet" href="../node_modules/bpmn-js/dist/assets/diagram-js.css">
  <link rel="stylesheet" href="../node_modules/bpmn-js/dist/assets/bpmn-font/css/bpmn.css">
  <style>
    html, body, #canvas { width: 100%; height: 100%; margin: 0; }
  </style>
</head>
<body>
  <div id="canvas"></div>
  <script src="../node_modules/bpmn-js/dist/bpmn-navigated-viewer.production.min.js"></script>
  <script>
    const xml = ${JSON.stringify(xml)};
    const viewer = new BpmnJS({ container: '#canvas' });
    viewer.importXML(xml).then(() => viewer.get('canvas').zoom('fit-viewport')).catch((error) => {
      document.body.textContent = 'BPMNの描画に失敗しました: ' + error.message;
      console.error(error);
    });
  </script>
</body>
</html>
`;
}
