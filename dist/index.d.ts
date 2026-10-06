/** 判定方式。pattern=正規表現（姓名形）、dictionary=辞書のみ、both=姓名形かつ辞書 */
export type Mode = 'pattern' | 'dictionary' | 'both';
/** createDetector / looksLikePersonName に渡すオプション */
export interface DetectorOptions {
    /** 姓の辞書（利用者が用意する。同梱しない） */
    surnames?: Iterable<string>;
    /** 名の辞書（利用者が用意する。同梱しない） */
    givenNames?: Iterable<string>;
    /** 判定方式。省略時は辞書があれば 'both'、無ければ 'pattern' */
    mode?: Mode;
}
/** 分割結果 */
export interface SplitName {
    surname: string;
    givenName: string;
}
/** どの規則で判定が決まったか */
export type Rule = 'empty' | 'not-name-shape' | 'organization-word' | 'shop-suffix' | 'pattern-match' | 'not-splittable' | 'surname-not-in-dictionary' | 'given-name-not-in-dictionary' | 'dictionary-match';
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
/**
 * 全角スペース1個で「姓」と「名」に分ける。分けられなければ null。
 * 前後の空白は取り除いてから分ける。辞書判定やマスク用途に使う。
 * @param name 判定対象の文字列
 * @returns 姓と名。2語でない・どちらかが空なら null
 */
export declare function splitName(name: string | null | undefined): SplitName | null;
/**
 * 判定器を作る。辞書を渡すと辞書判定が使える。辞書はモジュールに同梱されない。
 * @param options 姓・名の辞書と判定方式
 * @returns 判定器
 * @throws 辞書が必要な方式なのに姓・名の辞書が揃っていない、または辞書だけ渡して方式が pattern のときは例外
 */
export declare function createDetector(options?: DetectorOptions): Detector;
/**
 * name が「姓＋全角スペース＋名」の姓名形で、法人語・屋号語を含まないかを判定する。
 * options を渡すと createDetector(options) と同じ判定になる。
 * @param name 判定対象の文字列
 * @param options 辞書と判定方式（省略時は正規表現方式）
 * @returns 個人の氏名と見られるなら true
 */
export declare function looksLikePersonName(name: string | null | undefined, options?: DetectorOptions): boolean;
/**
 * 判定とその理由を返す（正規表現方式。辞書つきは createDetector(...).explain を使う）。
 * @param name 判定対象の文字列
 * @returns 判定結果と規則
 */
export declare function explain(name: string | null | undefined): Explanation;
