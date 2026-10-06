# THIRD_PARTY_NOTICES

このリポジトリのコード（`src/`・`dist/`）は MIT（`LICENSE`）です。**辞書データはこのリポジトリに含まれません。**
既定辞書は依存パッケージ [`@naogify/japanese-person-name-dictionary`](https://github.com/naogify/japanese-person-name-dictionary)（`package.json` で commit SHA 固定）から読み込みます。
その辞書は下の出典の姓・名を含み、各出典の条件に従います。`LICENSES/` は辞書リポジトリの `LICENSES/`（各出典のライセンス全文。原文のまま）の写しです。
出典ごとの名称・URL・版・ライセンス・守る義務の最新の表は、辞書リポジトリの `THIRD_PARTY_NOTICES.md` が正です（以下は同じ内容の写し）。

## 出典ごとの表

| 出典 | URL | 版・SHA | ライセンス | 同梱した表示物 | 守る義務 |
|---|---|---|---|---|---|
| **Mozc**（Google Inc.）の OSS 辞書 `src/data/dictionary_oss/dictionary00〜09.txt` の人名（姓・名） | https://github.com/google/mozc | コミット `60fe4012e5eaa26805dbbb8e5548cbe6db4aaf98`（各ファイルの sha256 は `data/sources.json`） | リポジトリ全体: Google の3条項BSD。`src/data/dictionary*`: NAIST 条項＋ICOT Free Software 条項＋沖縄辞書（パブリックドメイン） | `LICENSES/Mozc-LICENSE.txt`（LICENSE 全文。BSD-3＋NAIST/ICOT＋沖縄辞書の 4 節） | 著作権表示・条件・免責の保持／**Google Inc. とその貢献者の名前を宣伝・販促に使わない**／NAIST 条項の著作権表示と免責の同梱／ICOT 条項の無保証（"NO WARRANTY"）の同梱 |
| **SudachiDict**（Works Applications Co., Ltd.）の `core_lex.csv`・`notcore_lex.csv` の人名（姓・名） | https://github.com/WorksApplications/SudachiDict | 版 `20260723`（zip の sha256 は `data/sources.json`）。文書は SudachiDict `develop` の `3e49051e71011cac7d74df779e80ef1dab818e56` | Apache License 2.0。LEGAL により NEologd（Apache-2.0）の一部を含む | `LICENSES/SudachiDict-LICENSE-2.0.txt`、`LICENSES/SudachiDict-LEGAL.txt`（UniDic の BSD と NEologd の COPYING を含む） | Apache-2.0 §4: ライセンスの写しを渡す／改変の明示／元の著作権・帰属表示の保持／NOTICE 相当（LEGAL）の保持。**Works Applications の名前・商標を宣伝・販促に使わない**（§6） |
| **NEologd**（SudachiDict の core/notcore が含む部分）の COPYING | https://github.com/neologd/mecab-unidic-neologd ／ https://github.com/neologd/mecab-ipadic-neologd | `mecab-unidic-neologd` `22895c054014393307967eddcd351c69e1fd57af`、`mecab-ipadic-neologd` `abc61e33d8be3d0ead202e6b1df064c72d5ccf11`（`COPYING`） | Apache-2.0（COPYING に材料 5 項の出典も記載） | `LICENSES/NEologd-unidic-COPYING.txt`、`LICENSES/NEologd-ipadic-COPYING.txt` | 帰属表示（COPYING の保持）。**注意**: SudachiDict の LEGAL は `mecab-unidic-neologd`、README は `mecab-ipadic-neologd` を指していて食い違うため、両方の COPYING を同梱している（2 つの違いは URL の行だけ） |
| **UniDic small**（SudachiDict `small_lex.csv` 経由。UniDic Consortium / 国立国語研究所）の人名（姓・名） | https://clrd.ninjal.ac.jp/unidic/ | SudachiDict 版 `20260723` の `small_lex.zip` | 修正BSD（3条項）。SudachiDict の配布物として Apache-2.0 | `LICENSES/SudachiDict-LEGAL.txt`（small_lex に対応する BSD。"Copyright (c) 2011-2013, The UniDic Consortium"）、`LICENSES/UniDic-202512-BSD.txt`・`LICENSES/UniDic-202512-COPYING.txt`（unidic-cwj-202512.zip の `license/BSD`・`license/COPYING`。sha256 `d94216b589d15d05c408ed59abc5259086703ebbac14e225b5314e4cd106c4db`） | 著作権表示・条件・免責の保持／**UniDic Consortium・国立国語研究所の名前を宣伝・販促に使わない**。UniDic の `AUTHORS` ファイルは現行配布物（unidic-cwj-202512）に無いため同梱していない |
| **mecab-ipadic**（NAIST・ICOT）の `Noun.name.csv` の人名（姓・名） | https://sourceforge.net/projects/mecab/files/mecab-ipadic/2.7.0-20070801/ | `2.7.0-20070801`（tar.gz の sha256 は `data/sources.json`） | NAIST 条項＋ICOT Free Software 条項 | `LICENSES/mecab-ipadic-COPYING.txt`（tar.gz 内の `COPYING`） | 著作権表示と免責の同梱／ICOT 条項の無保証の同梱／**奈良先端科学技術大学院大学（NAIST）の名前を宣伝・販促に使わない**（免責条項による） |
| **Wikidata**（Wikimedia Foundation）の日本語ラベル（姓・名） | https://www.wikidata.org/ | SPARQL スナップショット（`data/wikidata/`、日付は `data/sources.json`） | CC0 1.0（"All structured data … is released into the public domain under Creative Commons Zero"、https://www.wikidata.org/wiki/Wikidata:Licensing） | `LICENSES/CC0-1.0.txt`（https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt） | 義務なし（出典を明記する運用） |

## 「名前を宣伝に使わない」対象

Google Inc.（Mozc の貢献者を含む）、奈良先端科学技術大学院大学（NAIST）、Works Applications Co., Ltd.、UniDic Consortium・国立国語研究所。
この辞書やそれを使う製品の宣伝・販促で、これらの名前を、書面による事前の許可なしに、推奨・保証の意味で使いません。出典の**表示**（この文書・README）は宣伝ではありません。

## 1 つの出典を外すには

`data/by-source/<出典>/` を消して `scripts/build.mjs` の該当出典を外し、`npm run build:offline` で統合版を作り直します。`data/sources.json` の `sources[].id` と `data/by-source/` のディレクトリ名は一致しています。
