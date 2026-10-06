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
export type Rule = 'empty' | 'not-name-shape' | 'organization-word' | 'shop-suffix' | 'pattern-match' | 'not-splittable' | 'surname-not-in-dictionary' | 'given-name-not-in-dictionary' | 'dictionary-match' | 'jev-person' | 'jev-not-person';
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
 * Jev へ渡す state（文脈）を作る。名前・業種・都道府県だけで、住所などは含めない。
 * @param name 施設名
 * @param context 手がかり
 * @returns state 文字列
 */
export declare function buildJevState(name: string, context?: JevContext): string;
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
