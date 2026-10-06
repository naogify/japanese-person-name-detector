// scripts/eval-jev/lib.mjs（検証用の純粋関数）のテスト。氏名は架空の定型例。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvRecord, headerIndex, isListedSource, classifyStratum, currentDecision, mulberry32, reservoir, summarize, pickAnswer, buildState } from '../scripts/eval-jev/lib.mjs';

test('parseCsvRecord: 引用符と "" のエスケープを扱う', () => {
  assert.deepEqual(parseCsvRecord('a,"b,c","d""e",'), ['a', 'b,c', 'd"e', '']);
});

test('headerIndex: 必要な列が無ければ例外', () => {
  assert.deepEqual(headerIndex(['prefecture', 'name', 'business_type', 'sources']), { prefecture: 0, name: 1, business_type: 2, sources: 3 });
  assert.throws(() => headerIndex(['prefecture', 'name']));
});

test('isListedSource / classifyStratum / currentDecision', () => {
  assert.equal(isListedSource('鹿児島県 鹿児島県食品営業許可施設一覧（令和8年）', ['鹿児島県 鹿児島県食品営業許可施設一覧']), true);
  assert.equal(isListedSource('大阪市食品営業許可施設一覧', ['鹿児島県 鹿児島県食品営業許可施設一覧']), false);
  assert.equal(classifyStratum({ listed: true, pattern: true, dictionary: true }), 'L_pat_dict');
  assert.equal(classifyStratum({ listed: true, pattern: true, dictionary: false }), 'L_pat_nodict');
  assert.equal(classifyStratum({ listed: false, pattern: false, dictionary: false }), 'N_nopat');
  assert.deepEqual(currentDecision('L_pat_nodict'), { A: true, AG: true });
  assert.deepEqual(currentDecision('N_pat_dict'), { A: false, AG: true });
  assert.deepEqual(currentDecision('N_pat_nodict'), { A: false, AG: false });
});

test('reservoir: k 件を保ち、同じ seed なら同じ標本', () => {
  const run = () => {
    const r = reservoir(3, mulberry32(42));
    for (let i = 0; i < 100; i++) r.push(i);
    return r;
  };
  const a = run();
  assert.equal(a.items.length, 3);
  assert.equal(a.seen, 100);
  assert.deepEqual(a.items, run().items);
});

test('summarize / pickAnswer / buildState', () => {
  const rows = [
    { stratum: 'X', p_person: 0.95, kind: 'person_name' },
    { stratum: 'X', p_person: 0.6, kind: 'shop_name' },
    { stratum: 'Y', p_person: 0.1, kind: 'shop_name' },
  ];
  const s = summarize(rows);
  assert.equal(s.X.n, 2);
  assert.equal(s.X.atThreshold[0.9], 1);
  assert.equal(s.X.atThreshold[0.5], 2);
  assert.equal(s.X.hist[9], 1);
  assert.deepEqual(s.Y.kinds, { shop_name: 1 });
  assert.deepEqual(pickAnswer({ answers: { is_person_name: { noul: 0.7 }, contains_person_name: { noul: 0.8 }, kind: { choice: 'shop_name', confidence: 0.5 } }, usage: { input_tokens: 10 } }), {
    p_person: 0.7, p_contains: 0.8, kind: 'shop_name', kind_conf: 0.5, input_tokens: 10,
  });
  assert.equal(buildState({ name: '試験　太郎', business_type: '飲食店営業', prefecture: '東京都' }), '施設名: 試験　太郎\n業種: 飲食店営業\n都道府県: 東京都');
});
