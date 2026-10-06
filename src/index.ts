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
  /**
   * 判定の前に空白を正規化する（前後を trim し、半角・全角スペースの連続を全角スペース 1 個にする）。既定 true。
   * 「姓 名」（半角）や「姓　　名」（全角 2 個）が姓名形として当たるようになる。false で従来どおり全角 1 個だけを区切りとみなす
   */
  normalizeSpaces?: boolean;
  /**
   * 空白なしの名前（例: 姓 2 字＋名 2 字の漢字 4 字）を、姓 1〜4 字＋名 1〜6 字のすべての分割で試し、
   * 姓・名の両方が辞書にある分割があれば個人名とみなす（規則 split-dictionary-match）。既定 false。
   * 出典が「氏名を載せる」と分かっている行にだけ使うこと。屋号（地名・商品名）が姓＋名に分割できてしまうことがあり、
   * 実測では屋号 491 件中 6 件が当たった（出典リスト内の屋号 438 件では 1 件）。pattern 方式では使えない（辞書が要る）
   */
  splitNoSpace?: boolean;
  /**
   * Jev（TypeSafe の判定専用モデル）で迷う行を判定し直す。省略時は使わない（同期の判定のみ）。
   * 使うときは explainAsync / looksLikePersonNameAsync を呼ぶ（explain / looksLikePersonName は変わらない）
   */
  jev?: JevOptions;
}

/** Jev に渡す文脈。施設名以外の手がかり（任意）。住所・電話などの個人情報は渡さない */
export interface JevContext {
  /** 業種（例: 飲食店営業）。あると判定がやや安定する */
  businessType?: string;
  /** 都道府県名 */
  prefecture?: string;
}

/** Jev の設定。API キーは環境変数などから呼び出し側が渡す（このモジュールは環境変数を読まない） */
export interface JevOptions {
  /** TypeSafe の API キー */
  apiKey: string;
  /** モデル名。本番では版を固定する（例: 'jev-1.13.0'）。既定は 'jev-latest' */
  model?: string;
  /** エンドポイント。既定は TypeSafe の System One API */
  endpoint?: string;
  /** fetch の差し替え（テスト・プロキシ用）。既定はグローバルの fetch */
  fetch?: typeof fetch;
  /**
   * 同期の判定が「個人名でない」のとき、Jev の確率がこれ以上なら個人名に覆す。既定 0.8。
   * 実測（issue #2）では 0.8 で屋号を個人名と誤る例が無かった
   */
  acceptAbove?: number;
  /**
   * 同期の判定が「個人名」のとき、Jev の確率がこれ未満なら個人名でないに覆す。既定 0.5。
   * 実測では辞書一致の屋号（地名＋語、業種語＋名など）の大半が 0.5 未満だった
   */
  rejectBelow?: number;
  /**
   * Jev に問い合わせる同期の規則。これ以外の規則で決まった行は Jev を呼ばない（費用と時間の節約、
   * および法人語・屋号語尾の除外を Jev に覆させないため）。
   * 既定: pattern-match / dictionary-match / surname-not-in-dictionary / given-name-not-in-dictionary /
   *       not-name-shape / not-splittable
   */
  consult?: Rule[];
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
  | 'dictionary-match' // 姓も名も辞書にある（辞書のみの方式、または both で姓名形も辞書も当たった）
  | 'split-dictionary-match' // 空白なしの名前を姓＋名に分割したら両方辞書にあった（splitNoSpace）
  | 'jev-person' // 同期の判定は個人名でなかったが、Jev の確率が acceptAbove 以上
  | 'jev-not-person'; // 同期の判定は個人名だったが、Jev の確率が rejectBelow 未満

/** explain() の結果 */
export interface Explanation {
  /** 判定結果（looksLikePersonName と同じ） */
  result: boolean;
  /** 結果を決めた規則 */
  rule: Rule;
  /** Jev に問い合わせたときだけ入る（同期の判定や、問い合わせなかったときは無い） */
  jev?: {
    /** 「個人の氏名そのものである」確率（0〜1） */
    probability: number;
    /** 実際に使われたモデルの版（例: jev-1.13.0） */
    model: string;
  };
}

/** 判定器 */
export interface Detector {
  /** 個人の氏名に見えるなら true */
  looksLikePersonName(name: string | null | undefined): boolean;
  /** 判定とその理由を返す（デバッグ・監査用） */
  explain(name: string | null | undefined): Explanation;
  /**
   * 同期の判定に加えて、jev オプションがあれば迷う行だけ Jev に問い合わせて判定する。
   * jev オプションが無ければ explain() と同じ結果を返す。
   */
  explainAsync(name: string | null | undefined, context?: JevContext): Promise<Explanation>;
  /** explainAsync().result */
  looksLikePersonNameAsync(name: string | null | undefined, context?: JevContext): Promise<boolean>;
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
 * 判定前の空白の正規化。前後の空白を取り、半角・全角スペース（タブ等も）の連続を全角スペース 1 個にする。
 * 食品営業許可データでは「姓 名」（半角）や「姓　　名」（全角 2 個）の氏名が実在し、正規化しないと取りこぼす。
 * @param name 判定対象の文字列
 * @returns 正規化後の文字列
 */
export function normalizeName(name: string | null | undefined): string {
  return (name || '').trim().replace(/[\s\u3000]+/gu, SEPARATOR);
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

  const normalizeSpaces = options.normalizeSpaces ?? true;
  const splitNoSpace = options.splitNoSpace ?? false;
  if (splitNoSpace && mode === 'pattern') throw new Error('splitNoSpace は辞書が要る（mode=pattern では使えない）');

  /**
   * 空白なしの名前を姓＋名に分割して辞書を引く。姓 1〜4 字・名 1〜6 字のすべての分割を試す。
   * both 方式では、分割した形が姓名形の規則（文字種・法人語・屋号語尾）にも当たることを求める。
   * @param n 正規化済みの名前（区切りを含まない）
   * @param surnames 姓の辞書
   * @param givenNames 名の辞書
   * @returns 当たれば split-dictionary-match、当たらなければ null
   */
  const explainSplit = (n: string, surnames: ReadonlySet<string>, givenNames: ReadonlySet<string>): Explanation | null => {
    const chars = [...n];
    // 2 字（姓 1＋名 1）は屋号・一般語と見分けがつかないので分割しない
    if (chars.length < 3) return null;
    for (let i = 1; i <= Math.min(4, chars.length - 1); i++) {
      const a = chars.slice(0, i).join('');
      const b = chars.slice(i).join('');
      if (chars.length - i > 6) continue;
      // both では「姓　名」の形が姓名形の規則を通ることも求める（名が屋号語尾なら除外、など）
      if (mode === 'both' && !explainPattern(`${a}${SEPARATOR}${b}`).result) continue;
      if (surnames.has(fold ? fold(a) : a) && givenNames.has(fold ? fold(b) : b)) return { result: true, rule: 'split-dictionary-match' };
    }
    return null;
  };

  /** 方式に応じた判定とその理由 */
  const explain = (rawName: string | null | undefined): Explanation => {
    // 空白を正規化してから判定する（半角スペース・全角 2 個の区切りを全角 1 個に）
    const name = normalizeSpaces ? normalizeName(rawName) : rawName;
    if (mode === 'pattern') return explainPattern(name);
    const { surnames, givenNames } = dictionary ?? getDictionary();
    const trimmed = (name || '').trim();
    // 空白なしの名前は（オプションがあれば）分割して辞書を引く
    const noSeparator = trimmed !== '' && !trimmed.includes(SEPARATOR);
    if (mode === 'dictionary') {
      const d = explainDictionary(name, surnames, givenNames, fold);
      if (!d.result && splitNoSpace && noSeparator) return explainSplit(trimmed, surnames, givenNames) ?? d;
      return d;
    }
    // both: 姓名形（除外規則込み）に当たり、かつ姓・名が辞書にある
    const p = explainPattern(name);
    if (!p.result) {
      if (splitNoSpace && noSeparator && p.rule === 'not-name-shape') return explainSplit(trimmed, surnames, givenNames) ?? p;
      return p;
    }
    return explainDictionary(name, surnames, givenNames, fold);
  };
  const jev = options.jev ? createJevJudge(options.jev) : undefined;

  /**
   * 同期の判定をし、jev があって規則が consult に含まれるときだけ Jev に問い合わせて覆す。
   * @param name 判定対象の文字列
   * @param context 業種・都道府県などの手がかり
   * @returns 判定結果と規則（Jev を使ったときは jev フィールドつき）
   */
  const explainAsync = async (name: string | null | undefined, context: JevContext = {}): Promise<Explanation> => {
    const sync = explain(name);
    if (!jev || !jev.consult.has(sync.rule)) return sync;
    const { probability, model } = await jev.ask((name || '').trim(), context);
    const info = { probability, model };
    // 同期が「個人名でない」→ 十分高ければ個人名に。同期が「個人名」→ 十分低ければ個人名でないに
    if (!sync.result && probability >= jev.acceptAbove) return { result: true, rule: 'jev-person', jev: info };
    if (sync.result && probability < jev.rejectBelow) return { result: false, rule: 'jev-not-person', jev: info };
    return { ...sync, jev: info };
  };

  return {
    looksLikePersonName: (name) => explain(name).result,
    explain,
    explainAsync,
    looksLikePersonNameAsync: async (name, context) => (await explainAsync(name, context)).result,
  };
}

// ----------------------------------------------------------------------------
// Jev（TypeSafe System One API）
// ----------------------------------------------------------------------------

/** Jev に投げる質問。実測（scripts/eval-jev）と同じ文面にしてある。変えるときは再計測する */
const JEV_QUESTION = {
  is_person_name: {
    type: 'noul',
    instructions:
      '施設名は、屋号・店名・法人名・施設名ではなく、個人の氏名（人の姓名）そのものである。姓名の表記は漢字・ひらがな・カタカナ・全角スペース区切り・区切りなしのどれでもよい',
  },
};

/** 既定で Jev に問い合わせる同期の規則 */
const JEV_DEFAULT_CONSULT: Rule[] = [
  'pattern-match',
  'dictionary-match',
  'split-dictionary-match',
  'surname-not-in-dictionary',
  'given-name-not-in-dictionary',
  'not-name-shape',
  'not-splittable',
];

/**
 * Jev へ渡す state（文脈）を作る。名前・業種・都道府県だけで、住所などは含めない。
 * @param name 施設名
 * @param context 手がかり
 * @returns state 文字列
 */
export function buildJevState(name: string, context: JevContext = {}): string {
  return `施設名: ${name}\n業種: ${context.businessType || '不明'}\n都道府県: ${context.prefecture || '不明'}`;
}

/**
 * Jev に 1 件問い合わせる関数と設定を組み立てる。
 * @param opts Jev の設定
 * @returns 問い合わせ関数と、閾値・対象規則
 */
function createJevJudge(opts: JevOptions) {
  if (!opts.apiKey) throw new Error('jev.apiKey が無い');
  const model = opts.model ?? 'jev-latest';
  const endpoint = opts.endpoint ?? 'https://api.typesafe.ai/v1/systemone';
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch が無い（Node 18+ か、jev.fetch を渡す）');
  const acceptAbove = opts.acceptAbove ?? 0.8;
  const rejectBelow = opts.rejectBelow ?? 0.5;
  const consult = new Set<Rule>(opts.consult ?? JEV_DEFAULT_CONSULT);

  /**
   * 1 件問い合わせる。HTTP エラーや形の違う応答は例外にする（黙って同期の結果に倒すと取りこぼしに気づけない）。
   * @param name 施設名（trim 済み）
   * @param context 手がかり
   * @returns 個人名である確率と、使われたモデル名
   */
  const ask = async (name: string, context: JevContext): Promise<{ probability: number; model: string }> => {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, state: buildJevState(name, context), questions: JEV_QUESTION }),
    });
    if (!res.ok) throw new Error(`Jev API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    const json = (await res.json()) as { model?: string; answers?: { is_person_name?: { noul?: number } } };
    const p = json.answers?.is_person_name?.noul;
    if (typeof p !== 'number' || Number.isNaN(p)) throw new Error('Jev の応答に is_person_name.noul が無い');
    return { probability: p, model: String(json.model ?? model) };
  };
  return { ask, acceptAbove, rejectBelow, consult };
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
