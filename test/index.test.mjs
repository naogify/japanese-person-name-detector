// 個人名判定のテスト。氏名はすべて架空の定型例（実在の個人名は書かない）。
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikePersonName, createDetector, splitName, explain } from '../dist/index.js';

// 姓名形（正規表現）だけを見る判定器。辞書に無い架空の姓でも形が合えば true
const pattern = createDetector({ mode: 'pattern' });

// ----------------------------------------------------------------------------
// 既定（辞書なしで呼ぶ）: 既定辞書 @naogify/japanese-person-name-dictionary の both 方式
// ----------------------------------------------------------------------------

test('既定: 姓名形で、姓・名が既定辞書にあれば個人名と判定する', () => {
  assert.equal(looksLikePersonName('山田　太郎'), true); // よくある姓・名（辞書にある）
  assert.equal(looksLikePersonName('山田　花子'), true);
  assert.equal(looksLikePersonName('山田　さくら'), true); // 名がひらがな
  assert.equal(looksLikePersonName('山田　ハナ'), true); // 名がカタカナ
  assert.equal(looksLikePersonName('  山田　太郎  '), true); // 前後の空白は無視
  assert.deepEqual(explain('山田　太郎'), { result: true, rule: 'dictionary-match' });
});

test('既定: 姓名形でも姓・名が既定辞書に無ければ個人名と判定しない', () => {
  assert.equal(looksLikePersonName('試験　さくら'), false); // 「試験」は姓として辞書に無い
  assert.deepEqual(explain('試験　太郎'), { result: false, rule: 'surname-not-in-dictionary' });
  assert.deepEqual(explain('山田　あいうえお'), { result: false, rule: 'given-name-not-in-dictionary' });
});

test('既定: 異体字は畳み込んでから辞書を引く（髙→高）', () => {
  assert.equal(looksLikePersonName('髙橋　太郎'), true); // 辞書は「高橋」で持っているが、入力は「髙橋」
  assert.equal(looksLikePersonName('高橋　太郎'), true);
});

test('既定: 辞書に載っていても姓名形の除外規則（法人語・屋号語）は効く', () => {
  assert.equal(looksLikePersonName('山田　大学'), false); // 「大学」は名として辞書にあるが法人語
  assert.deepEqual(explain('山田　大学'), { result: false, rule: 'organization-word' });
  assert.deepEqual(explain('株式会社　見本'), { result: false, rule: 'organization-word' });
  assert.deepEqual(explain('架空　食堂'), { result: false, rule: 'shop-suffix' });
});

test('既定: 空・形の合わないものは個人名と判定しない', () => {
  assert.deepEqual(explain(''), { result: false, rule: 'empty' });
  assert.deepEqual(explain('   '), { result: false, rule: 'empty' });
  assert.deepEqual(explain('架空商店'), { result: false, rule: 'not-name-shape' });
  assert.equal(looksLikePersonName(undefined), false);
  assert.equal(looksLikePersonName(null), false);
  assert.equal(looksLikePersonName('山田 太郎'), false); // 半角スペースは対象外
});

test('既定: createDetector() は引数なしでも既定辞書の both 方式になる', () => {
  const d = createDetector();
  assert.equal(d.looksLikePersonName('山田　太郎'), true);
  assert.equal(d.looksLikePersonName('試験　太郎'), false);
  assert.deepEqual(d.explain('試験　太郎'), { result: false, rule: 'surname-not-in-dictionary' });
  // mode だけ指定して辞書を省略しても既定辞書を使う
  const dict = createDetector({ mode: 'dictionary' });
  assert.deepEqual(dict.explain('山田　太郎'), { result: true, rule: 'dictionary-match' });
});

// ----------------------------------------------------------------------------
// mode=pattern: 姓名形（正規表現）のみ。辞書は見ない
// ----------------------------------------------------------------------------

test('pattern: 姓名形（全角スペース区切り・漢字/かな）は個人名と判定する', () => {
  assert.equal(pattern.looksLikePersonName('山田　太郎'), true); // 姓＋名（漢字）
  assert.equal(pattern.looksLikePersonName('試験　さくら'), true); // 名がひらがな（辞書に無い姓でも形で当たる）
  assert.equal(pattern.looksLikePersonName('見本　ハナ'), true); // 名がカタカナ
  assert.equal(pattern.looksLikePersonName('仮名　花子'), true);
  assert.equal(pattern.looksLikePersonName('  山田　太郎  '), true); // 前後の空白は無視
  assert.deepEqual(pattern.explain('試験　さくら'), { result: true, rule: 'pattern-match' });
});

test('pattern: 屋号・法人・単語名は個人名と判定しない（誤除外の防止）', () => {
  assert.equal(pattern.looksLikePersonName('株式会社　架空商事'), false); // 法人語
  assert.equal(pattern.looksLikePersonName('有限会社　見本'), false);
  assert.equal(pattern.looksLikePersonName('架空　食堂'), false); // 名側が屋号の末尾語
  assert.equal(pattern.looksLikePersonName('鮨　見本屋'), false);
  assert.equal(pattern.looksLikePersonName('架空商店'), false); // 全角スペース無し
  assert.equal(pattern.looksLikePersonName('山田 太郎'), false); // 半角スペースは対象外
  assert.equal(pattern.looksLikePersonName('山田　太郎　商店'), false); // 3語
  assert.equal(pattern.looksLikePersonName('Ｐｕｂｌｉｃ　Ｓｑｕａｒｅ'), false); // 英字
  assert.equal(pattern.looksLikePersonName('ＡＢ　ＣＤ'), false);
  assert.equal(pattern.looksLikePersonName('１２　３４'), false); // 数字
  assert.equal(pattern.looksLikePersonName('架空　ＡＢ'), false); // 名が英字
  assert.equal(pattern.looksLikePersonName('極味'), false);
  assert.equal(pattern.looksLikePersonName('漢字五文字姓　太郎'), false); // 姓が5字以上
  assert.equal(pattern.looksLikePersonName('山田　あいうえおかき'), false); // 名が7字以上
  assert.equal(pattern.looksLikePersonName(''), false);
  assert.equal(pattern.looksLikePersonName(undefined), false);
  assert.equal(pattern.looksLikePersonName(null), false);
});

test('pattern: 姓側に屋号語と同じ字を含んでも（園・屋 など）、個人名は判定できる', () => {
  assert.equal(pattern.looksLikePersonName('園田　太郎'), true);
  assert.equal(pattern.looksLikePersonName('長屋　花子'), true);
  // 既定辞書にもある姓なので、既定の判定でも true
  assert.equal(looksLikePersonName('園田　太郎'), true);
  assert.equal(looksLikePersonName('長屋　花子'), true);
});

test('pattern: 法人語はそれぞれ単独で判定を覆す', () => {
  for (const w of ['株式', '有限', '合同', '会社', '法人', '組合', '協会', '協同', '学校', '病院', 'センター', '生協', '農協', '漁協', '大学', '㈱', '㈲']) {
    assert.equal(pattern.looksLikePersonName(`山田　${w}`), false, w);
  }
});

test('pattern: 屋号の末尾語は名の側だけを見る', () => {
  for (const c of '店屋堂館軒亭庵園商会社所院場舗苑宿荘座楼') {
    assert.equal(pattern.looksLikePersonName(`山田　太${c}`), false, c);
  }
  assert.equal(pattern.looksLikePersonName('山田　太郎'), true);
});

test('pattern: explain はどの規則で決まったかを返す', () => {
  assert.deepEqual(pattern.explain('山田　太郎'), { result: true, rule: 'pattern-match' });
  assert.deepEqual(pattern.explain(''), { result: false, rule: 'empty' });
  assert.deepEqual(pattern.explain('架空商店'), { result: false, rule: 'not-name-shape' });
  assert.deepEqual(pattern.explain('株式会社　見本'), { result: false, rule: 'organization-word' });
  assert.deepEqual(pattern.explain('架空　食堂'), { result: false, rule: 'shop-suffix' });
});

test('pattern: looksLikePersonName(name, { mode: "pattern" }) は辞書を見ない', () => {
  assert.equal(looksLikePersonName('試験　さくら', { mode: 'pattern' }), true);
  assert.equal(looksLikePersonName('試験　さくら'), false);
});

// ----------------------------------------------------------------------------
// splitName
// ----------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------
// 自前の辞書を差し込む
// ----------------------------------------------------------------------------

// 既定辞書に無い架空の姓・名だけ使い、既定辞書が混ざっていないことを確かめる
const SURNAMES = ['試験', '架空'];
const GIVEN = ['太郎', '見本'];

test('自前辞書: 渡すと既定辞書の代わりに使い、both（姓名形かつ姓・名が辞書にある）になる', () => {
  const d = createDetector({ surnames: SURNAMES, givenNames: GIVEN });
  assert.equal(d.looksLikePersonName('試験　太郎'), true);
  assert.equal(d.looksLikePersonName('架空　見本'), true);
  assert.equal(d.looksLikePersonName('山田　太郎'), false); // 既定辞書にはあるが自前辞書に無い姓
  assert.deepEqual(d.explain('山田　太郎'), { result: false, rule: 'surname-not-in-dictionary' });
  assert.deepEqual(d.explain('試験　さくら'), { result: false, rule: 'given-name-not-in-dictionary' });
  // 辞書にあっても姓名形の除外規則（屋号語など）は効く
  const shop = createDetector({ surnames: SURNAMES, givenNames: ['食堂'] });
  assert.equal(shop.looksLikePersonName('試験　食堂'), false);
  assert.deepEqual(shop.explain('試験　食堂'), { result: false, rule: 'shop-suffix' });
});

test('自前辞書: mode=dictionary は姓名形でなくても姓・名が辞書にあれば true', () => {
  const d = createDetector({ surnames: ['漢字五文字姓'], givenNames: ['太郎'], mode: 'dictionary' });
  assert.equal(d.looksLikePersonName('漢字五文字姓　太郎'), true); // 姓名形（1〜4字）の外でも辞書にあれば当たる
  assert.deepEqual(d.explain('漢字五文字姓　太郎'), { result: true, rule: 'dictionary-match' });
  assert.deepEqual(d.explain('漢字五文字姓太郎'), { result: false, rule: 'not-splittable' });
  assert.deepEqual(d.explain(''), { result: false, rule: 'empty' });
  assert.equal(createDetector({ surnames: SURNAMES, givenNames: GIVEN, mode: 'dictionary' }).looksLikePersonName('架空　見本'), true);
});

test('自前辞書: Set など Iterable で渡せ、片方だけ渡すと例外（既定辞書との混在はしない）', () => {
  const d = createDetector({ surnames: new Set(SURNAMES), givenNames: new Set(GIVEN) });
  assert.equal(d.looksLikePersonName('架空　太郎'), true);
  assert.throws(() => createDetector({ surnames: SURNAMES })); // 名の辞書が無い
  assert.throws(() => createDetector({ givenNames: GIVEN, mode: 'dictionary' })); // 姓の辞書が無い
  // pattern 方式なら辞書は見ないので、片方だけでも例外にしない
  assert.equal(createDetector({ surnames: SURNAMES, mode: 'pattern' }).looksLikePersonName('山田　太郎'), true);
});

test('自前辞書: 既定では入力を畳み込んでから引く。fold: null で畳み込みを止められる', () => {
  // 既定の畳み込み（髙→高）が入力にかかるので、辞書は代表字で持てばよい
  const folded = createDetector({ surnames: ['高橋'], givenNames: GIVEN });
  assert.equal(folded.looksLikePersonName('髙橋　太郎'), true);
  // 畳み込みなし: 入力の「髙橋」は辞書の「高橋」と一致しない
  const raw = createDetector({ surnames: ['高橋'], givenNames: GIVEN, fold: null });
  assert.equal(raw.looksLikePersonName('髙橋　太郎'), false);
  assert.equal(raw.looksLikePersonName('高橋　太郎'), true);
  // 自前の畳み込み関数も渡せる
  const custom = createDetector({ surnames: ['たかはし'], givenNames: GIVEN, fold: (s) => (s === '高橋' ? 'たかはし' : s) });
  assert.equal(custom.looksLikePersonName('高橋　太郎'), true);
});

test('looksLikePersonName(name, options): オプション付きは createDetector と同じ', () => {
  assert.equal(looksLikePersonName('試験　太郎', { surnames: SURNAMES, givenNames: GIVEN }), true);
  assert.equal(looksLikePersonName('山田　太郎', { surnames: SURNAMES, givenNames: GIVEN }), false);
});
