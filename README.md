# @naogify/japanese-person-name-detector

文字列が**日本の個人の氏名（姓＋全角スペース＋名）に見えるか**を判定する小さなモジュール。

- TypeScript / ESM（`type: module`）、Node 20+
- 姓・名の辞書は既定で [japanese-person-name-dictionary](https://github.com/naogify/japanese-person-name-dictionary) を使う（依存として同梱。差し替え可）
- npm には公開していない。GitHub の commit SHA を固定して読み込む（`"@naogify/japanese-person-name-detector": "github:naogify/japanese-person-name-detector#<sha>"`）

## 使い方

```ts
import { looksLikePersonName, createDetector, splitName, explain } from '@naogify/japanese-person-name-detector';

looksLikePersonName('山田　太郎'); // true  （姓名形で、姓・名とも既定辞書にある）
looksLikePersonName('試験　太郎'); // false （姓名形だが「試験」は姓として辞書に無い）
looksLikePersonName('株式会社　架空商事'); // false （法人語）
looksLikePersonName('架空　食堂'); // false （名の側が屋号の末尾語）

splitName('山田　太郎'); // { surname: '山田', givenName: '太郎' }
explain('試験　太郎'); // { result: false, rule: 'surname-not-in-dictionary' }
```

既定の判定は **`both` 方式**（姓名形の規則に当たり、かつ姓・名が既定辞書にある）。
既定辞書は最初に判定したときに 1 回だけ読み込む（約 7 万語）。

### 判定の規則（方式 A: 正規表現）

次をすべて満たすと姓名形とみなす。前後の空白は無視する。

1. 姓（漢字 1〜4 字）＋全角スペース 1 個＋名（漢字・ひらがな・カタカナ 1〜6 字）で、全体が一致する
2. 法人・団体を表す語（株式・有限・会社・法人・組合・学校・病院 など）を含まない
3. 名の部分が屋号の末尾語（店・屋・堂・館・軒 など）で終わらない（姓側は見ない。「園田」「長屋」等の姓があるため）

### 辞書（方式 G）

既定辞書は [japanese-person-name-dictionary](https://github.com/naogify/japanese-person-name-dictionary)
（UniDic small・mecab-ipadic・Wikidata 由来。出典とライセンスは同リポジトリの README を参照）。
辞書は NFKC＋異体字の畳み込み済みで保存されているので、判定対象も同じ `fold`（髙→高 など）を通してから引く。
これは既定で行われる。

```ts
const detector = createDetector(); // 既定辞書・both 方式
detector.looksLikePersonName('髙橋　太郎'); // true （「髙」は「高」に畳み込んで辞書を引く）

createDetector({ mode: 'pattern' }).looksLikePersonName('試験　太郎'); // true （辞書を見ない）
```

#### 自前の辞書に差し替える

```ts
const detector = createDetector({
  surnames: new Set(['試験']), // Iterable<string>
  givenNames: new Set(['太郎']),
  mode: 'both', // 'pattern' | 'dictionary' | 'both'
  fold: null, // 畳み込みを止める（省略時は既定辞書と同じ畳み込み。独自の (s) => string も渡せる）
});
detector.looksLikePersonName('試験　太郎'); // true
detector.explain('山田　太郎'); // { result: false, rule: 'surname-not-in-dictionary' }（既定辞書は使わない）
```

| オプション | 意味 |
| --- | --- |
| `surnames` / `givenNames` | 姓・名の辞書。省略時は既定辞書。差し替えるときは**両方**渡す（片方だけだと例外） |
| `mode` | `pattern`: 方式 A のみ（辞書不要）／ `dictionary`: 全角スペースで 2 語に分け、姓・名の両方が辞書にあれば `true`（姓名形の長さ制限や除外語は見ない）／ `both`: 方式 A に当たり、かつ姓・名が辞書にある（既定） |
| `fold` | 辞書を引く前に判定対象へかける畳み込み。省略時は既定辞書の `fold`、`null` で畳み込みなし |

`looksLikePersonName(name, options)` に同じ options を渡してもよい（毎回判定器を作るので、繰り返し使うなら `createDetector` を使う）。

### Jev で迷う行を判定し直す（任意）

[Jev](https://docs.typesafe.ai/introduction/quickstart)（TypeSafe の判定専用モデル。テキストを生成せず確率だけ返す）に、
同期の判定で迷う行だけを問い合わせる。**`jev` を渡さなければ何も変わらない**（同期の API はそのまま。非同期の API も同期と同じ結果を返す）。

```ts
const detector = createDetector({
  jev: {
    apiKey: process.env.TYPESAFE_API_KEY!, // キーは呼び出し側が渡す（このモジュールは環境変数を読まない）
    model: 'jev-1.13.0', // 本番では版を固定する（既定は 'jev-latest'）
    // acceptAbove: 0.8, rejectBelow: 0.5, consult: [...], endpoint, fetch も変えられる
  },
});
await detector.explainAsync('山田太郎', { businessType: '飲食店営業', prefecture: '鹿児島県' });
// { result: true, rule: 'jev-person', jev: { probability: 0.9, model: 'jev-1.13.0' } }
await detector.looksLikePersonNameAsync('神楽坂　和茶'); // false（辞書一致でも Jev が屋号と見れば jev-not-person）
```

- 同期の規則が `consult`（既定: `pattern-match` / `dictionary-match` / `surname-not-in-dictionary` / `given-name-not-in-dictionary` / `not-name-shape` / `not-splittable`）のときだけ問い合わせる。法人語・屋号語尾・空で決まった行は聞かない（費用の節約と、除外規則を覆させないため）
- 同期が「個人名でない」→ 確率が `acceptAbove`（既定 0.8）以上なら `jev-person`。同期が「個人名」→ 確率が `rejectBelow`（既定 0.5）未満なら `jev-not-person`。中間は同期の結果のまま（`jev` の確率は付く）
- Jev に渡すのは施設名・業種・都道府県だけ（住所・電話は渡さない）
- HTTP エラーや形の違う応答は例外にする（黙って同期の結果に倒さない）
- 実測（食品営業許可データ、`scripts/eval-jev/RESULTS.md`）: 辞書一致の屋号（地名＋語など）の誤除外が約 9% → 約 1% に減る。
  一方、**出典が氏名を載せると分かっている行（出典リスト内）には使わない**こと。珍しい姓名の約 8% を屋号と誤る
- 費用は入力トークンのみ（2026-10 時点 0.042 USD / 100 万トークン。1 件約 450 トークン）

### 空白の正規化と、空白なしの姓名の分割照合

- **空白の正規化（既定 on）**: 判定の前に、前後の空白を取り、半角・全角スペースの連続を全角スペース 1 個にする。
  「姓 名」（半角）や「姓　　名」（全角 2 個）が姓名形として当たる。`normalizeSpaces: false` で従来どおり全角 1 個だけを区切りとみなす。
  `splitName()` は正規化しない（純粋な分割関数のまま）
- **分割辞書照合（既定 off）**: `splitNoSpace: true` で、空白なしの名前（例: 漢字 4 字）を姓 1〜4 字＋名 1〜6 字のすべての分割で試し、
  姓・名の両方が辞書にある分割があれば個人名とみなす（規則 `split-dictionary-match`）。both 方式では分割した形が姓名形の規則（屋号語尾・法人語など）を通ることも求める。
  2 字は分割しない。**出典が「氏名を載せる」と分かっている行にだけ使うこと**。屋号（地名・商品名）が姓＋名に分割できてしまうため、
  食品営業許可データの全件実測では、リスト外の出典で 10,031 行が当たる（大半が屋号）一方、リスト内では 2,299 行（ほぼ氏名）だった

```ts
const detector = createDetector({ splitNoSpace: true });
detector.explain('山田太郎'); // { result: true, rule: 'split-dictionary-match' }
detector.explain('山田 太郎'); // { result: true, rule: 'dictionary-match' }（半角スペースを正規化）
```

### `explain(name)`

`{ result, rule }` を返す（デバッグ・監査用）。`rule` は
`empty` / `not-name-shape` / `organization-word` / `shop-suffix` / `pattern-match` /
`not-splittable` / `surname-not-in-dictionary` / `given-name-not-in-dictionary` / `dictionary-match` /
`split-dictionary-match`（`splitNoSpace`）/ `jev-person` / `jev-not-person`（後の 2 つは `explainAsync` で Jev が覆したとき）。
内部の正規表現そのものは公開しない。

## 何を判定しないか

このモジュールは「文字列の形」と「辞書にあるか」だけを見る。次は**判定しない・できない**。

- **出典の限定はしない。** どのデータソースの、どの欄に適用するかは呼び出し側が決める。
  屋号を全角スペースで区切る慣習のあるデータ（実在の店名が「姓名形」に見える）に全国一律で当てると、
  実在の店を誤って個人名と判定する。出典の絞り込みは利用側の責務
- **辞書に無い姓・名は既定では拾えない。** 珍しい姓名は `surname-not-in-dictionary` 等になる。
  取りこぼしより誤判定を避けたいときは既定のまま、網羅を優先するなら `mode: 'pattern'` を使う
- **空白なしの氏名は既定では拾えない**（例: 姓名を区切らず続けて書いたもの）。屋号と区別がつかないため、`splitNoSpace` は出典を限定して使う
- **外国籍の方の氏名は拾えない**（英字・カタカナの姓、姓が 5 字以上など。姓は漢字のみ・1〜4 字）
- **中黒区切りは対象外**（半角スペースは全角に正規化して扱う）
- **姓名形に見える屋号・店名を完全には除けない。** 法人語と屋号の末尾語で除くが、取りこぼし・誤判定は起こる
- 「個人を特定できるか」の判定ではない。あくまで「氏名の形に見えるか」

## 開発

```bash
npm install
npm test          # ビルド後に node --test
npm run mutation  # 変異注入（規則を 1 つずつ壊してテストが落ちることを確認）
```

Jev の検証スクリプトは `scripts/eval-jev/`（README と RESULTS.md を参照。出力の `out/` は氏名を含むので git に入れない）。

`dist/` はコミットしている（GitHub 参照で入れる利用側がビルドなしで使えるように）。
`src/` を変えたら `npm run build` して `dist/` も一緒にコミットする。
テストの氏名は架空の定型例のみ。実在の個人名は書かない。

既定辞書の版を上げるときは `package.json` の
`@naogify/japanese-person-name-dictionary` の commit SHA を更新して `npm install` する。

## ライセンス

コードは MIT。既定辞書のデータは [japanese-person-name-dictionary](https://github.com/naogify/japanese-person-name-dictionary) の各出典の条件に従う
（再配布するときは同リポジトリの `LICENSES/` を同梱する）。

## 第三者の辞書データの出典と表示

このリポジトリのコードは MIT。**辞書データは含まず**、既定辞書は依存の `japanese-person-name-dictionary` から読み込む。
その辞書は Mozc（Google）・SudachiDict（Works Applications。NEologd・UniDic を含む）・UniDic small・mecab-ipadic（NAIST・ICOT）・Wikidata の姓・名を含み、各出典の条件に従う。
出典・版・ライセンス・守る義務は [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)、ライセンス全文は `LICENSES/`（原文のまま）。
**Google・NAIST・Works Applications・UniDic Consortium／国立国語研究所の名前を宣伝・販促に使わない。** 条件は公開文書から読み取ったもので、法務の最終確認は別途。
