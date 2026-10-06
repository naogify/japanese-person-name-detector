// ============================================================================
// @naogify/japanese-person-name-detector
// ----------------------------------------------------------------------------
// 文字列が「日本の個人の氏名（姓＋全角スペース＋名）」に見えるかを判定する。
// 責務はこの判定だけ。どの出典（データソース）に適用するかはここでは決めない。
// 姓名の辞書は既定で @naogify/japanese-person-name-dictionary を使う。
// 利用者が createDetector() に別の辞書を渡して差し替えることもできる。
// ============================================================================

import { loadDictionary, fold as dictionaryFold } from '@naogify/japanese-person-name-dictionary';

// 漢字（々・〆・ヶ・﨑等の互換漢字・異体字セレクタ込み）。姓は漢字のみ
const KANJI =
  '[\\u4e00-\\u9fff\\u3005\\u3006\\u30f6\\ufa0e-\\ufa29\\u{20000}-\\u{2fa1f}\\ufe00-\\ufe0f\\u{e0100}-\\u{e01ef}]';
// 名は漢字・ひらがな・カタカナ（長音符含む）
const MEI_CHAR = `(?:${KANJI}|[\\u3041-\\u309f\\u30a1-\\u30fa\\u30fc])`;

/** 姓名形: 姓（漢字1〜4字）＋全角スペース1個＋名（漢字・かな1〜6字）。全体が一致したときだけ当たる */
const PERSON_NAME_RE = new RegExp(`^${KANJI}{1,4}\\u3000${MEI_CHAR}{1,6}$`, 'u');

/** 法人・団体・施設を表す語。含まれていれば個人名ではないとみなす */
const ORGANIZATION_RE =
  /株式|有限|合同|会社|法人|組合|協会|協同|学校|病院|センター|生協|農協|漁協|大学|㈱|㈲|\(株\)|\(有\)/;

/** 屋号の末尾に付きやすい文字。名の部分がこれで終わるなら屋号とみなす（姓側は見ない。「園田」「長屋」等の姓があるため） */
const SHOP_SUFFIX_RE = /[店屋堂館軒亭庵園商会社所院場舗苑宿荘座楼]$/u;

/** 姓と名の区切り（全角スペース） */
const SEPARATOR = '　';

/** 判定方式。pattern=正規表現（姓名形）、dictionary=辞書のみ、both=姓名形かつ辞書 */
export type Mode = 'pattern' | 'dictionary' | 'both';

/** 辞書照合の前に判定対象へかける畳み込み関数 */
export type Fold = (s: string) => string;

/** createDetector / looksLikePersonName に渡すオプション */
export interface DetectorOptions {
  /** 姓の辞書。省略時は同梱の既定辞書（@naogify/japanese-person-name-dictionary）を使う */
  surnames?: Iterable<string>;
  /** 名の辞書。省略時は同梱の既定辞書（@naogify/japanese-person-name-dictionary）を使う */
  givenNames?: Iterable<string>;
  /** 判定方式。省略時は 'both'（姓名形かつ辞書） */
  mode?: Mode;
  /**
   * 辞書照合の前に判定対象へかける畳み込み。既定は既定辞書の fold（NFKC＋異体字を代表字へ）。
   * 既定辞書は畳み込み済みで保存されているので、照合する側も同じ畳み込みを通す必要がある。
   * 自前の辞書を渡すときに畳み込みが不要なら null を渡す
   */
  fold?: Fold | null;
}

/** 分割結果 */
export interface SplitName {
  surname: string;
  givenName: string;
}

/** どの規則で判定が決まったか */
export type Rule =
  | 'empty' // 空・空白のみ
  | 'not-name-shape' // 姓名形（漢字1〜4字＋全角スペース＋漢字かな1〜6字）でない
  | 'organization-word' // 法人語を含む
  | 'shop-suffix' // 名の部分が屋号の末尾語で終わる
  | 'pattern-match' // 姓名形に当たり、除外規則にも当たらない
  | 'not-splittable' // 全角スペースで姓と名の2語に分けられない（辞書判定）
  | 'surname-not-in-dictionary' // 姓が辞書に無い
  | 'given-name-not-in-dictionary' // 名が辞書に無い
  | 'dictionary-match'; // 姓も名も辞書にある（辞書のみの方式、または both で姓名形も辞書も当たった）

/** explain() の結果 */
export interface Explanation {
  /** 判定結果（looksLikePersonName と同じ） */
  result: boolean;
  /** 結果を決めた規則 */
  rule: Rule;
}

/** 判定器 */
export interface Detector {
  /** 個人の氏名に見えるなら true */
  looksLikePersonName(name: string | null | undefined): boolean;
  /** 判定とその理由を返す（デバッグ・監査用） */
  explain(name: string | null | undefined): Explanation;
}

/** 既定辞書（読み込みは最初に必要になったときの 1 回だけ。以後は使い回す） */
let defaultDictionary: { surnames: ReadonlySet<string>; givenNames: ReadonlySet<string> } | undefined;

/**
 * 既定辞書（@naogify/japanese-person-name-dictionary）を返す。初回だけファイルから読み込む。
 * @returns 畳み込み済みの姓・名の集合
 */
function getDefaultDictionary(): { surnames: ReadonlySet<string>; givenNames: ReadonlySet<string> } {
  // 7 万語ほどあるので、pattern 方式しか使わない利用者が読み込みコストを払わないよう遅延して読む
  if (!defaultDictionary) defaultDictionary = loadDictionary();
  return defaultDictionary;
}

/**
 * 全角スペース1個で「姓」と「名」に分ける。分けられなければ null。
 * 前後の空白は取り除いてから分ける。辞書判定やマスク用途に使う。
 * @param name 判定対象の文字列
 * @returns 姓と名。2語でない・どちらかが空なら null
 */
export function splitName(name: string | null | undefined): SplitName | null {
  const n = (name || '').trim();
  const parts = n.split(SEPARATOR);
  // ちょうど2語（区切り1個）で、どちらも空でないときだけ分割できたとみなす
  if (parts.length !== 2 || parts[0] === '' || parts[1] === '') return null;
  return { surname: parts[0], givenName: parts[1] };
}

/**
 * 正規表現方式（姓名形＋除外語）の判定とその理由。
 * @param name 判定対象の文字列
 * @returns 判定結果と規則
 */
function explainPattern(name: string | null | undefined): Explanation {
  const n = (name || '').trim();
  if (n === '') return { result: false, rule: 'empty' };
  if (!PERSON_NAME_RE.test(n)) return { result: false, rule: 'not-name-shape' };
  // 法人語を含む場合は個人名ではない
  if (ORGANIZATION_RE.test(n)) return { result: false, rule: 'organization-word' };
  // 名の部分が屋号の末尾語で終わる場合は屋号とみなす（姓名形に当たっているので分割は必ず成功する）
  const given = n.split(SEPARATOR)[1];
  if (SHOP_SUFFIX_RE.test(given)) return { result: false, rule: 'shop-suffix' };
  return { result: true, rule: 'pattern-match' };
}

/**
 * 辞書方式の判定とその理由。
 * @param name 判定対象の文字列
 * @param surnames 姓の辞書
 * @param givenNames 名の辞書
 * @param fold 照合前に判定対象へかける畳み込み（null なら素のまま照合）
 * @returns 判定結果と規則
 */
function explainDictionary(
  name: string | null | undefined,
  surnames: ReadonlySet<string>,
  givenNames: ReadonlySet<string>,
  fold: Fold | null,
): Explanation {
  const parts = splitName(name);
  if (!parts) return { result: false, rule: (name || '').trim() === '' ? 'empty' : 'not-splittable' };
  // 辞書の見出し語と同じ畳み込みをかけてから引く（既定辞書は 髙→高 などを畳み込んで保存している）
  const surname = fold ? fold(parts.surname) : parts.surname;
  const givenName = fold ? fold(parts.givenName) : parts.givenName;
  if (!surnames.has(surname)) return { result: false, rule: 'surname-not-in-dictionary' };
  if (!givenNames.has(givenName)) return { result: false, rule: 'given-name-not-in-dictionary' };
  return { result: true, rule: 'dictionary-match' };
}

/**
 * 判定器を作る。辞書を渡さなければ既定辞書（@naogify/japanese-person-name-dictionary）を使う。
 * @param options 姓・名の辞書、判定方式、畳み込み
 * @returns 判定器
 * @throws 辞書が必要な方式で、姓・名の辞書の片方だけが渡されたときは例外（既定辞書と自前辞書の混在は認めない）
 */
export function createDetector(options: DetectorOptions = {}): Detector {
  const mode: Mode = options.mode ?? 'both';
  const hasSurnames = options.surnames !== undefined;
  const hasGivenNames = options.givenNames !== undefined;
  // 片方だけ渡されると「もう片方は既定辞書」という暗黙の混在になり、判定結果の出どころが分かりにくくなるので拒む
  if (mode !== 'pattern' && hasSurnames !== hasGivenNames) {
    throw new Error(`mode=${mode} で辞書を差し替えるときは surnames と givenNames の両方を渡す`);
  }
  // fold は undefined（省略）なら既定辞書の畳み込み、null なら畳み込みなし
  const fold: Fold | null = options.fold === undefined ? dictionaryFold : options.fold;

  /**
   * 照合に使う辞書を返す。自前辞書があればそれを Set にし、無ければ既定辞書を遅延読み込みする。
   * pattern 方式では呼ばれないので、辞書の読み込みコストは掛からない。
   * @returns 姓・名の集合
   */
  const getDictionary = (): { surnames: ReadonlySet<string>; givenNames: ReadonlySet<string> } =>
    hasSurnames
      ? { surnames: new Set(options.surnames), givenNames: new Set(options.givenNames) }
      : getDefaultDictionary();
  // 自前辞書は判定器を作った時点で Set に固める。既定辞書は最初の判定時に読む
  const dictionary = mode !== 'pattern' && hasSurnames ? getDictionary() : undefined;

  /** 方式に応じた判定とその理由 */
  const explain = (name: string | null | undefined): Explanation => {
    if (mode === 'pattern') return explainPattern(name);
    const { surnames, givenNames } = dictionary ?? getDictionary();
    if (mode === 'dictionary') return explainDictionary(name, surnames, givenNames, fold);
    // both: 姓名形（除外規則込み）に当たり、かつ姓・名が辞書にある
    const p = explainPattern(name);
    if (!p.result) return p;
    return explainDictionary(name, surnames, givenNames, fold);
  };
  return { looksLikePersonName: (name) => explain(name).result, explain };
}

/** 既定の判定器（既定辞書＋姓名形の both 方式）。最初に使うときに作る */
let defaultDetector: Detector | undefined;

/**
 * 既定の判定器を返す。初回だけ作る。
 * @returns 既定辞書を使う both 方式の判定器
 */
function getDefaultDetector(): Detector {
  if (!defaultDetector) defaultDetector = createDetector();
  return defaultDetector;
}

/**
 * name が「姓＋全角スペース＋名」の姓名形で、法人語・屋号語を含まず、姓・名が既定辞書にあるかを判定する。
 * options を渡すと createDetector(options) と同じ判定になる。
 * @param name 判定対象の文字列
 * @param options 辞書と判定方式（省略時は既定辞書の both 方式）
 * @returns 個人の氏名と見られるなら true
 */
export function looksLikePersonName(name: string | null | undefined, options?: DetectorOptions): boolean {
  return (options ? createDetector(options) : getDefaultDetector()).looksLikePersonName(name);
}

/**
 * 判定とその理由を返す（既定辞書の both 方式。別の辞書・方式は createDetector(...).explain を使う）。
 * @param name 判定対象の文字列
 * @returns 判定結果と規則
 */
export function explain(name: string | null | undefined): Explanation {
  return getDefaultDetector().explain(name);
}
