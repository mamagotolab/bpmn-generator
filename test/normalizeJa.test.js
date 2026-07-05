import { describe, expect, it } from 'vitest';
import { normalizeJapanese } from '../src/flow/normalizeJa.js';

describe('normalizeJapanese', () => {
  it('業務語に混じる簡体字を日本語へ寄せる', () => {
    expect(normalizeJapanese('营业が倉库へ发注し会议で确认する')).toBe('営業が倉庫へ発注し会議で確認する');
    expect(normalizeJapanese('客户へ发送し订单を处理')).toBe('顧客へ発送し注文を処理');
  });

  it('既に正しい日本語は不変', () => {
    expect(normalizeJapanese('営業が倉庫へ発注し会議で確認する')).toBe('営業が倉庫へ発注し会議で確認する');
  });
});
