// 個人名判定のテスト。氏名はすべて架空の定型例（実在の個人名は書かない）。
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikePersonName, createDetector, splitName, explain } from '../dist/index.js';

test('姓名形（全角スペース区切り・漢字/かな）は個人名と判定する', () => {
  assert.equal(looksLikePersonName('山田　太郎'), true); // 姓＋名（漢字）
  assert.equal(looksLikePersonName('試験　さくら'), true); // 名がひらがな
  assert.equal(looksLikePersonName('見本　ハナ'), true); // 名がカタカナ
  assert.equal(looksLikePersonName('仮名　花子'), true);
  assert.equal(looksLikePersonName('  山田　太郎  '), true); // 前後の空白は無視
});

test('屋号・法人・単語名は個人名と判定しない（誤除外の防止）', () => {
  assert.equal(looksLikePersonName('株式会社　架空商事'), false); // 法人語
  assert.equal(looksLikePersonName('有限会社　見本'), false);
  assert.equal(looksLikePersonName('架空　食堂'), false); // 名側が屋号の末尾語
  assert.equal(looksLikePersonName('鮨　見本屋'), false);
  assert.equal(looksLikePersonName('架空商店'), false); // 全角スペース無し
  assert.equal(looksLikePersonName('山田 太郎'), false); // 半角スペースは対象外
  assert.equal(looksLikePersonName('山田　太郎　商店'), false); // 3語
  assert.equal(looksLikePersonName('Ｐｕｂｌｉｃ　Ｓｑｕａｒｅ'), false); // 英字
  assert.equal(looksLikePersonName('ＡＢ　ＣＤ'), false);
  assert.equal(looksLikePersonName('１２　３４'), false); // 数字
  assert.equal(looksLikePersonName('架空　ＡＢ'), false); // 名が英字
  assert.equal(looksLikePersonName('極味'), false);
  assert.equal(looksLikePersonName('漢字五文字姓　太郎'), false); // 姓が5字以上
  assert.equal(looksLikePersonName('山田　あいうえおかき'), false); // 名が7字以上
  assert.equal(looksLikePersonName(''), false);
  assert.equal(looksLikePersonName(undefined), false);
  assert.equal(looksLikePersonName(null), false);
});

test('姓側に屋号語と同じ字を含んでも（園・屋 など）、個人名は判定できる', () => {
  assert.equal(looksLikePersonName('園田　太郎'), true);
  assert.equal(looksLikePersonName('長屋　花子'), true);
});

test('法人語はそれぞれ単独で判定を覆す', () => {
  for (const w of ['株式', '有限', '合同', '会社', '法人', '組合', '協会', '協同', '学校', '病院', 'センター', '生協', '農協', '漁協', '大学', '㈱', '㈲']) {
    assert.equal(looksLikePersonName(`山田　${w}`), false, w);
  }
});

test('屋号の末尾語は名の側だけを見る', () => {
  for (const c of '店屋堂館軒亭庵園商会社所院場舗苑宿荘座楼') {
    assert.equal(looksLikePersonName(`山田　太${c}`), false, c);
  }
  assert.equal(looksLikePersonName('山田　太郎'), true);
});

test('splitName: 全角スペース1個で姓と名に分ける', () => {
  assert.deepEqual(splitName('山田　太郎'), { surname: '山田', givenName: '太郎' });
  assert.deepEqual(splitName(' 山田　太郎 '), { surname: '山田', givenName: '太郎' });
  assert.equal(splitName('山田太郎'), null);
  assert.equal(splitName('山田 太郎'), null);
  assert.equal(splitName('山田　太郎　商店'), null);
  assert.equal(splitName('　太郎'), null); // 姓が空（trim で先頭の区切りが消えるため2語にならない）
  assert.equal(splitName(''), null);
  assert.equal(splitName(undefined), null);
});

test('explain: どの規則で決まったかを返す', () => {
  assert.deepEqual(explain('山田　太郎'), { result: true, rule: 'pattern-match' });
  assert.deepEqual(explain(''), { result: false, rule: 'empty' });
  assert.deepEqual(explain('架空商店'), { result: false, rule: 'not-name-shape' });
  assert.deepEqual(explain('株式会社　見本'), { result: false, rule: 'organization-word' });
  assert.deepEqual(explain('架空　食堂'), { result: false, rule: 'shop-suffix' });
});

// 辞書は利用者が渡す。テスト内の架空の姓・名だけ使う
const SURNAMES = ['山田', '架空'];
const GIVEN = ['太郎', '花子'];

test('createDetector: 辞書なしは pattern と同じ', () => {
  const d = createDetector();
  assert.equal(d.looksLikePersonName('山田　太郎'), true);
  assert.equal(d.looksLikePersonName('架空商店'), false);
});

test('createDetector: 辞書を渡すと both（姓名形かつ姓・名が辞書にある）になる', () => {
  const d = createDetector({ surnames: SURNAMES, givenNames: GIVEN });
  assert.equal(d.looksLikePersonName('山田　太郎'), true);
  assert.equal(d.looksLikePersonName('架空　花子'), true);
  assert.equal(d.looksLikePersonName('試験　さくら'), false); // 姓名形だが辞書に無い
  assert.deepEqual(d.explain('試験　太郎'), { result: false, rule: 'surname-not-in-dictionary' });
  assert.deepEqual(d.explain('山田　さくら'), { result: false, rule: 'given-name-not-in-dictionary' });
  // 辞書にあっても姓名形の除外規則（屋号語など）は効く
  const shop = createDetector({ surnames: SURNAMES, givenNames: ['食堂'] });
  assert.equal(shop.looksLikePersonName('山田　食堂'), false);
  assert.deepEqual(shop.explain('山田　食堂'), { result: false, rule: 'shop-suffix' });
});

test('createDetector: mode=dictionary は姓名形でなくても姓・名が辞書にあれば true', () => {
  const d = createDetector({ surnames: ['漢字五文字姓'], givenNames: ['太郎'], mode: 'dictionary' });
  assert.equal(d.looksLikePersonName('漢字五文字姓　太郎'), true); // 姓名形（1〜4字）の外でも辞書にあれば当たる
  assert.deepEqual(d.explain('漢字五文字姓　太郎'), { result: true, rule: 'dictionary-match' });
  assert.deepEqual(d.explain('漢字五文字姓太郎'), { result: false, rule: 'not-splittable' });
  assert.deepEqual(d.explain(''), { result: false, rule: 'empty' });
  assert.equal(createDetector({ surnames: SURNAMES, givenNames: GIVEN, mode: 'dictionary' }).looksLikePersonName('山田　花子'), true);
});

test('createDetector: 辞書は Set など Iterable で渡せ、同梱の辞書は無い', () => {
  const d = createDetector({ surnames: new Set(SURNAMES), givenNames: new Set(GIVEN) });
  assert.equal(d.looksLikePersonName('山田　花子'), true);
  // 辞書なしで dictionary / both を要求すると例外（暗黙の辞書は無い）
  assert.throws(() => createDetector({ mode: 'dictionary' }));
  assert.throws(() => createDetector({ mode: 'both', surnames: SURNAMES }));
  assert.throws(() => createDetector({ surnames: SURNAMES })); // 名の辞書が無い
});

test('looksLikePersonName(name, options): オプション付きは createDetector と同じ', () => {
  assert.equal(looksLikePersonName('山田　太郎', { surnames: SURNAMES, givenNames: GIVEN }), true);
  assert.equal(looksLikePersonName('試験　さくら', { surnames: SURNAMES, givenNames: GIVEN }), false);
});
