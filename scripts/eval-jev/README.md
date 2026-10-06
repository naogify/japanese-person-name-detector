# Jev 検証（scripts/eval-jev）

issue #2 の検証スクリプト。JFF（Japan Food Facilities）の `facilities-all.csv` を 6 つの層に分け、
層ごとの無作為標本を [Jev](https://docs.typesafe.ai/introduction/quickstart)（TypeSafe の判定専用モデル）に
投げて、現行の判定（姓名形・辞書）との食い違いを測る。結果は `RESULTS.md`（件数のみ）。

## 層

| 層 | 意味 |
|---|---|
| `L_pat_dict` | 出典リスト内 ∧ 姓名形 ∧ 姓・名が辞書にある |
| `L_pat_nodict` | 出典リスト内 ∧ 姓名形 ∧ 辞書に無い |
| `L_nopat` | 出典リスト内 ∧ 姓名形でない |
| `N_pat_dict` | 出典リスト外 ∧ 姓名形 ∧ 辞書にある |
| `N_pat_nodict` | 出典リスト外 ∧ 姓名形 ∧ 辞書に無い |
| `N_nopat` | 出典リスト外 ∧ 姓名形でない |

出典リスト＝「name 欄に許可を受けた本人の氏名を載せる自治体」の出典名の前方一致リスト
（geosearch-poi の `config/jff-personal-name-sources.json`）。

## 使い方

```bash
# 1. 層別に標本を取る（全行を流し読み。氏名は out/ にだけ書く）
node scripts/eval-jev/sample.mjs ~/facilities-all.csv --sources <jff-personal-name-sources.json> --per-stratum 500 --seed 1

# 2. Jev に投げる（応答は out/ にキャッシュ。費用の上限は --max-usd）
TYPESAFE_API_KEY=... node scripts/eval-jev/run.mjs --concurrency 8 --max-usd 20
```

- `out/` は git に入れない（氏名を含む）。`summary.json` と `strata.json` の件数だけを `RESULTS.md` に転記する
- Jev に渡すのは施設名・業種・都道府県だけ。住所・電話・許可番号は渡さない
- 質問は `lib.mjs` の `QUESTIONS`（個人名そのものか／氏名を含むか／種別の 3 問）。本番のオプション（`src/index.ts`）は
  1 問目だけを使う。1 問だけでも確率はほぼ同じことを確かめてある（RESULTS.md）
