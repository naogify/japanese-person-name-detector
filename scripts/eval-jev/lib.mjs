// ============================================================================
// scripts/eval-jev/lib.mjs
// ----------------------------------------------------------------------------
// Jev 検証（issue #2）で使う純粋関数。CSV の 1 行の分解、層の分類、集計。
// ネットワークもファイルも触らない（テストしやすくするため）。
// ============================================================================

/**
 * CSV の 1 レコード分の文字列を、引用符を考慮してフィールド配列に分解する。
 * geosearch-poi の sources/jff/extract.mjs と同じ規則（引用符内の "" は " のエスケープ）。
 * 引用符内の改行は扱わない（facilities-all.csv には無い前提）。
 * @param {string} s CSV の 1 行
 * @returns {string[]} フィールドの配列
 */
export function parseCsvRecord(s) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        // "" はエスケープされた "。それ以外の " は引用の終わり
        if (s[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** facilities-all.csv の列名 → 添字（ヘッダ行から作る） */
export function headerIndex(headerFields) {
  const idx = {};
  headerFields.forEach((h, i) => {
    idx[h.trim()] = i;
  });
  for (const col of ['prefecture', 'name', 'business_type', 'sources']) {
    if (!(col in idx)) throw new Error(`CSV のヘッダに ${col} 列が無い`);
  }
  return idx;
}

/**
 * 出典（sources 列）が「氏名を載せる出典」の前方一致リストに当たるか。
 * @param {string} sources CSV の sources 列
 * @param {string[]} prefixes 出典名の前方一致リスト
 * @returns {boolean} 当たれば true
 */
export function isListedSource(sources, prefixes) {
  const s = (sources || '').trim();
  return prefixes.some((p) => s.startsWith(p));
}

/** 層の名前。L=出典リスト内、N=リスト外。pat=姓名形、dict=姓・名が辞書にある */
export const STRATA = ['L_pat_dict', 'L_pat_nodict', 'L_nopat', 'N_pat_dict', 'N_pat_nodict', 'N_nopat'];

/**
 * 1 行を層に分類する。
 * @param {{listed: boolean, pattern: boolean, dictionary: boolean}} v 出典がリスト内か、姓名形か、辞書一致か
 * @returns {string} 層の名前（STRATA のどれか）
 */
export function classifyStratum({ listed, pattern, dictionary }) {
  const src = listed ? 'L' : 'N';
  if (!pattern) return `${src}_nopat`;
  return `${src}_${dictionary ? 'pat_dict' : 'pat_nodict'}`;
}

/**
 * 現行の判定（geosearch-poi）での「除外されるか」。
 * A: 出典リスト内 ∧ 姓名形。A∪G: A または（リスト外 ∧ 姓名形 ∧ 辞書一致）（PR #307）。
 * @param {string} stratum 層の名前
 * @returns {{A: boolean, AG: boolean}} それぞれの方式で除外されるなら true
 */
export function currentDecision(stratum) {
  const A = stratum === 'L_pat_dict' || stratum === 'L_pat_nodict';
  const AG = A || stratum === 'N_pat_dict';
  return { A, AG };
}

/**
 * 乱数（mulberry32）。seed を固定すると標本が再現できる。
 * @param {number} seed 種
 * @returns {() => number} [0, 1) の乱数を返す関数
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 貯水池サンプリング（Algorithm R）。層ごとに k 件を等確率で残す。
 * @param {number} k 残す件数
 * @param {() => number} rand 乱数
 * @returns {{push: (item: unknown) => void, items: unknown[], seen: number}} 貯水池
 */
export function reservoir(k, rand) {
  const items = [];
  const r = {
    items,
    seen: 0,
    push(item) {
      r.seen++;
      if (items.length < k) items.push(item);
      else {
        // seen 件目を確率 k/seen で採用し、既存のどれかと入れ替える
        const j = Math.floor(rand() * r.seen);
        if (j < k) items[j] = item;
      }
    },
  };
  return r;
}

/**
 * Jev へ渡す state（文脈）を作る。住所・電話・許可番号は渡さない（判定に不要で、個人情報を外に出さない）。
 * @param {{name: string, business_type?: string, prefecture?: string}} r 1 行
 * @returns {string} state
 */
export function buildState(r) {
  return `施設名: ${r.name}\n業種: ${r.business_type || '不明'}\n都道府県: ${r.prefecture || '不明'}`;
}

/** Jev に投げる質問（固定。全層で同じ質問にして比較できるようにする） */
export const QUESTIONS = {
  is_person_name: {
    type: 'noul',
    instructions:
      '施設名は、屋号・店名・法人名・施設名ではなく、個人の氏名（人の姓名）そのものである。姓名の表記は漢字・ひらがな・カタカナ・全角スペース区切り・区切りなしのどれでもよい',
  },
  contains_person_name: {
    type: 'noul',
    instructions: '施設名の中に、個人の氏名（姓名）が含まれている（氏名そのものの場合も、屋号や業種語と組み合わさっている場合も含む）',
  },
  kind: {
    type: 'choice',
    instructions: '施設名は次のどれに当たるか',
    criteria: {
      person_name: '個人の氏名そのもの（姓と名、または姓のみ・名のみ）',
      shop_name: '屋号・店名（人名を含む屋号や、人名＋業種語・店舗語も含む）',
      organization: '法人・団体・学校・病院などの組織名や施設名',
      other: 'どれでもない、または判断できない',
    },
  },
};

/**
 * Jev の応答から、この検証で使う値だけを取り出す。
 * @param {{answers: object, usage?: {input_tokens?: number}}} res API の応答
 * @returns {{p_person: number, p_contains: number, kind: string, kind_conf: number, input_tokens: number}} 要約
 */
export function pickAnswer(res) {
  const a = res.answers || {};
  return {
    p_person: Number(a.is_person_name?.noul ?? NaN),
    p_contains: Number(a.contains_person_name?.noul ?? NaN),
    kind: String(a.kind?.choice ?? ''),
    kind_conf: Number(a.kind?.confidence ?? NaN),
    input_tokens: Number(res.usage?.input_tokens ?? 0),
  };
}

/**
 * 結果を層ごとに集計する（氏名は含めない）。
 * @param {Array<{stratum: string, p_person: number, kind: string}>} rows Jev の結果つきの標本
 * @param {number[]} thresholds 個人名とみなす確率の閾値
 * @returns {Record<string, {n: number, mean: number, atThreshold: Record<string, number>, kinds: Record<string, number>, hist: number[]}>} 層ごとの集計
 */
export function summarize(rows, thresholds = [0.5, 0.7, 0.9]) {
  const out = {};
  for (const r of rows) {
    const s = (out[r.stratum] ||= { n: 0, mean: 0, atThreshold: {}, kinds: {}, hist: new Array(10).fill(0) });
    s.n++;
    s.mean += r.p_person;
    for (const t of thresholds) s.atThreshold[t] = (s.atThreshold[t] || 0) + (r.p_person >= t ? 1 : 0);
    s.kinds[r.kind] = (s.kinds[r.kind] || 0) + 1;
    // 確率のヒストグラム（0.1 刻み。1.0 は最後の箱）
    s.hist[Math.min(9, Math.floor(r.p_person * 10))]++;
  }
  for (const s of Object.values(out)) s.mean = s.n ? s.mean / s.n : 0;
  return out;
}
