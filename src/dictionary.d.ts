// ============================================================================
// src/dictionary.d.ts
// ----------------------------------------------------------------------------
// @naogify/japanese-person-name-dictionary は型定義を持たない素の ESM（.mjs）なので、
// このモジュールが使う範囲だけここで型を宣言する。
// 公開する dist/index.d.ts からは辞書パッケージの型を参照しないので、利用側にこの宣言は不要。
// ============================================================================
declare module '@naogify/japanese-person-name-dictionary' {
  /**
   * 同梱の姓・名の辞書（畳み込み済み）を Set として読み込む。
   * @returns 姓の集合と名の集合
   */
  export function loadDictionary(): { surnames: Set<string>; givenNames: Set<string> };
  /**
   * 文字列を辞書照合用に畳み込む（NFKC → 異体字を代表字へ。全角スペースの区切りは保つ）。
   * @param s 畳み込み前の文字列
   * @returns 畳み込み後の文字列
   */
  export function fold(s: string): string;
}
