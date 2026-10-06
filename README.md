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

### `explain(name)`

`{ result, rule }` を返す（デバッグ・監査用）。`rule` は
`empty` / `not-name-shape` / `organization-word` / `shop-suffix` / `pattern-match` /
`not-splittable` / `surname-not-in-dictionary` / `given-name-not-in-dictionary` / `dictionary-match`。
内部の正規表現そのものは公開しない。

## 何を判定しないか

このモジュールは「文字列の形」と「辞書にあるか」だけを見る。次は**判定しない・できない**。

- **出典の限定はしない。** どのデータソースの、どの欄に適用するかは呼び出し側が決める。
  屋号を全角スペースで区切る慣習のあるデータ（実在の店名が「姓名形」に見える）に全国一律で当てると、
  実在の店を誤って個人名と判定する。出典の絞り込みは利用側の責務
- **辞書に無い姓・名は既定では拾えない。** 珍しい姓名は `surname-not-in-dictionary` 等になる。
  取りこぼしより誤判定を避けたいときは既定のまま、網羅を優先するなら `mode: 'pattern'` を使う
- **空白なしの氏名は拾えない**（例: 姓名を区切らず続けて書いたもの）。屋号と区別がつかない
- **外国籍の方の氏名は拾えない**（英字・カタカナの姓、姓が 5 字以上など。姓は漢字のみ・1〜4 字）
- **半角スペース・中黒区切りは対象外**
- **姓名形に見える屋号・店名を完全には除けない。** 法人語と屋号の末尾語で除くが、取りこぼし・誤判定は起こる
- 「個人を特定できるか」の判定ではない。あくまで「氏名の形に見えるか」

## 開発

```bash
npm install
npm test          # ビルド後に node --test
npm run mutation  # 変異注入（規則を 1 つずつ壊してテストが落ちることを確認）
```

`dist/` はコミットしている（GitHub 参照で入れる利用側がビルドなしで使えるように）。
`src/` を変えたら `npm run build` して `dist/` も一緒にコミットする。
テストの氏名は架空の定型例のみ。実在の個人名は書かない。

既定辞書の版を上げるときは `package.json` の
`@naogify/japanese-person-name-dictionary` の commit SHA を更新して `npm install` する。

## ライセンス

コードは MIT。既定辞書のデータは [japanese-person-name-dictionary](https://github.com/naogify/japanese-person-name-dictionary) の各出典の条件に従う
（再配布するときは同リポジトリの `LICENSES/` を同梱する）。
