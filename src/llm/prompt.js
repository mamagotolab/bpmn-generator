/**
 * @param {string} text
 * @param {string[]} [validationMessages]
 */
export function buildFlowPrompt(text, validationMessages = []) {
  const retryText = validationMessages.length
    ? `\n前回の出力には以下の検証NGがありました。必ず修正してください。\n${validationMessages.map((message) => `- ${message}`).join('\n')}\n`
    : '';

  return `あなたは業務フロー抽出エンジンです。日本語の業務説明を読み、BPMN用の中間JSONだけを出力してください。説明文・コードブロック記号は一切不要です。

JSONスキーマ:
{
  "nodes": [
    {"id": "n1", "type": "start|task|gateway|end", "label": "表示名", "lane": "担当者/部署名"}
  ],
  "edges": [
    {"from": "n1", "to": "n2", "label": "分岐条件(あれば)"}
  ]
}

ルール:
- 必ず start で始まり end で終わる
- 判断・分岐は type: "gateway" とし、出て行く edge に条件ラベルを付ける
- lane は説明文に登場する担当者・部署をそのまま使う
- 出力はJSONのみ${retryText}

業務説明:
${text}`;
}
