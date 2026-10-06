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
 * 判定器を作る。辞書を渡さなければ既定辞書（@naogify/japanese-person-name-dictionary）を使う。
 * @param options 姓・名の辞書、判定方式、畳み込み
 * @returns 判定器
 * @throws 辞書が必要な方式で、姓・名の辞書の片方だけが渡されたときは例外（既定辞書と自前辞書の混在は認めない）
 */
export declare function createDetector(options?: DetectorOptions): Detector;
/**
 * name が「姓＋全角スペース＋名」の姓名形で、法人語・屋号語を含まず、姓・名が既定辞書にあるかを判定する。
 * options を渡すと createDetector(options) と同じ判定になる。
 * @param name 判定対象の文字列
 * @param options 辞書と判定方式（省略時は既定辞書の both 方式）
 * @returns 個人の氏名と見られるなら true
 */
export declare function looksLikePersonName(name: string | null | undefined, options?: DetectorOptions): boolean;
/**
 * 判定とその理由を返す（既定辞書の both 方式。別の辞書・方式は createDetector(...).explain を使う）。
 * @param name 判定対象の文字列
 * @returns 判定結果と規則
 */
export declare function explain(name: string | null | undefined): Explanation;
