// Jev オプション（非同期・任意）のテスト。ネットワークは使わず fetch を差し替える。
// 氏名はすべて架空の定型例。
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDetector, buildJevState } from '../dist/index.js';

/**
 * 施設名 → 確率 の表から応答を返す偽の fetch を作る。呼び出し内容も記録する。
 * @param {Record<string, number>} table 施設名ごとの「個人名である」確率
 * @param {{status?: number}} [opts] 常にこのステータスで失敗させる
 */
function fakeFetch(table, opts = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, body });
    if (opts.status) return { ok: false, status: opts.status, text: async () => 'boom' };
    const name = body.state.match(/^施設名: (.*)$/m)[1];
    const p = table[name];
    if (p === undefined) return { ok: true, status: 200, json: async () => ({ model: 'jev-test', answers: {} }) };
    return { ok: true, status: 200, json: async () => ({ model: 'jev-test', answers: { is_person_name: { type: 'noul', noul: p } } }) };
  };
  return { fetchImpl, calls };
}

// 既定辞書に無い架空の姓・名だけを使う小辞書
const SURNAMES = ['試験', '架空'];
const GIVEN = ['太郎', '見本'];

test('jev なし: explainAsync は explain と同じ結果を返し、fetch を呼ばない', async () => {
  const d = createDetector({ surnames: SURNAMES, givenNames: GIVEN });
  assert.deepEqual(await d.explainAsync('試験　太郎'), { result: true, rule: 'dictionary-match' });
  assert.deepEqual(await d.explainAsync('山田　太郎'), { result: false, rule: 'surname-not-in-dictionary' });
  assert.equal(await d.looksLikePersonNameAsync('試験　太郎'), true);
});

test('jev: 同期が「個人名」でも確率が rejectBelow 未満なら覆す（辞書一致の屋号を残す）', async () => {
  const { fetchImpl, calls } = fakeFetch({ '試験　太郎': 0.12 });
  const d = createDetector({ surnames: SURNAMES, givenNames: GIVEN, jev: { apiKey: 'k', fetch: fetchImpl } });
  const r = await d.explainAsync('試験　太郎', { businessType: '飲食店営業', prefecture: '大阪府' });
  assert.deepEqual(r, { result: false, rule: 'jev-not-person', jev: { probability: 0.12, model: 'jev-test' } });
  assert.equal(await d.looksLikePersonNameAsync('試験　太郎'), false);
  // 同期の判定は変わらない
  assert.equal(d.looksLikePersonName('試験　太郎'), true);
  // 送った内容: 名前・業種・都道府県だけ。API キーは Authorization ヘッダ
  assert.equal(calls[0].headers.Authorization, 'Bearer k');
  assert.equal(calls[0].body.state, '施設名: 試験　太郎\n業種: 飲食店営業\n都道府県: 大阪府');
  assert.equal(calls[0].body.model, 'jev-latest');
  assert.ok(calls[0].body.questions.is_person_name);
});

test('jev: 同期が「個人名でない」でも確率が acceptAbove 以上なら覆す（取りこぼしを拾う）', async () => {
  const { fetchImpl } = fakeFetch({ 山田太郎: 0.9, '山田　太郎': 0.8, '見本　ハナ': 0.79 });
  const d = createDetector({ surnames: SURNAMES, givenNames: GIVEN, jev: { apiKey: 'k', fetch: fetchImpl } });
  // 空白なし（not-name-shape）でも Jev が高ければ個人名
  assert.deepEqual(await d.explainAsync('山田太郎'), { result: true, rule: 'jev-person', jev: { probability: 0.9, model: 'jev-test' } });
  // ちょうど閾値は含む
  assert.equal((await d.explainAsync('山田　太郎')).rule, 'jev-person');
  // 閾値未満なら同期の結果のまま（jev の情報は付く）
  assert.deepEqual(await d.explainAsync('見本　ハナ'), {
    result: false,
    rule: 'surname-not-in-dictionary',
    jev: { probability: 0.79, model: 'jev-test' },
  });
});

test('jev: 確率が中間なら同期の結果を保つ', async () => {
  const { fetchImpl } = fakeFetch({ '試験　太郎': 0.5, '試験　見本': 0.49 });
  const d = createDetector({ surnames: SURNAMES, givenNames: GIVEN, jev: { apiKey: 'k', fetch: fetchImpl } });
  assert.equal((await d.explainAsync('試験　太郎')).rule, 'dictionary-match'); // 0.5 は rejectBelow(0.5) 未満ではない
  assert.equal((await d.explainAsync('試験　見本')).rule, 'jev-not-person'); // 0.49 は未満
});

test('jev: consult に無い規則（法人語・屋号語尾・空）は Jev を呼ばない', async () => {
  const { fetchImpl, calls } = fakeFetch({ '試験　太郎': 0.9 });
  const d = createDetector({ surnames: SURNAMES, givenNames: GIVEN, jev: { apiKey: 'k', fetch: fetchImpl } });
  assert.equal((await d.explainAsync('株式会社　見本')).rule, 'organization-word');
  assert.equal((await d.explainAsync('試験　食堂')).rule, 'shop-suffix');
  assert.equal((await d.explainAsync('')).rule, 'empty');
  assert.equal(calls.length, 0);
  // consult を絞れば、それ以外は呼ばない
  const narrow = createDetector({ surnames: SURNAMES, givenNames: GIVEN, jev: { apiKey: 'k', fetch: fetchImpl, consult: ['dictionary-match'] } });
  assert.equal((await narrow.explainAsync('山田太郎')).rule, 'not-name-shape');
  assert.equal(calls.length, 0);
  await narrow.explainAsync('試験　太郎');
  assert.equal(calls.length, 1);
});

test('jev: 閾値・モデル・エンドポイントを変えられる', async () => {
  const { fetchImpl, calls } = fakeFetch({ '試験　太郎': 0.6, 山田太郎: 0.6 });
  const d = createDetector({
    surnames: SURNAMES,
    givenNames: GIVEN,
    jev: { apiKey: 'k', fetch: fetchImpl, acceptAbove: 0.6, rejectBelow: 0.7, model: 'jev-1.13.0', endpoint: 'https://example.invalid/x' },
  });
  assert.equal((await d.explainAsync('試験　太郎')).rule, 'jev-not-person'); // 0.6 < 0.7
  assert.equal((await d.explainAsync('山田太郎')).rule, 'jev-person'); // 0.6 >= 0.6
  assert.equal(calls[0].url, 'https://example.invalid/x');
  assert.equal(calls[0].body.model, 'jev-1.13.0');
});

test('jev: pattern 方式でも使える（pattern-match を Jev が覆す）', async () => {
  const { fetchImpl } = fakeFetch({ '試験　さくら': 0.1 });
  const d = createDetector({ mode: 'pattern', jev: { apiKey: 'k', fetch: fetchImpl } });
  assert.equal(d.looksLikePersonName('試験　さくら'), true);
  assert.equal(await d.looksLikePersonNameAsync('試験　さくら'), false);
});

test('jev: HTTP エラーや形の違う応答は例外（黙って同期の結果に倒さない）', async () => {
  const bad = fakeFetch({}, { status: 500 });
  const d = createDetector({ surnames: SURNAMES, givenNames: GIVEN, jev: { apiKey: 'k', fetch: bad.fetchImpl } });
  await assert.rejects(() => d.explainAsync('試験　太郎'), /Jev API 500/);
  const empty = fakeFetch({}); // 表に無い名前 → answers が空
  const d2 = createDetector({ surnames: SURNAMES, givenNames: GIVEN, jev: { apiKey: 'k', fetch: empty.fetchImpl } });
  await assert.rejects(() => d2.explainAsync('試験　太郎'), /is_person_name/);
  // API キーが無ければ作る時点で例外
  assert.throws(() => createDetector({ jev: { apiKey: '' } }));
});

test('buildJevState: 名前・業種・都道府県だけを含み、無いものは「不明」', () => {
  assert.equal(buildJevState('試験　太郎'), '施設名: 試験　太郎\n業種: 不明\n都道府県: 不明');
  assert.equal(buildJevState('試験　太郎', { businessType: '菓子製造業' }), '施設名: 試験　太郎\n業種: 菓子製造業\n都道府県: 不明');
});
