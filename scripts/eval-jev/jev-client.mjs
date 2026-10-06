// ============================================================================
// scripts/eval-jev/jev-client.mjs
// ----------------------------------------------------------------------------
// TypeSafe の System One API（Jev）を呼ぶ薄いクライアント。
// - 応答はローカルのキャッシュ（NDJSON）に貯め、同じ入力は二度と送らない
// - 入力トークン数から費用を見積もり、上限を超えそうなら止める（誤って回し続けない）
// - 429 / 5xx は待って再試行する
// API キーは環境変数 TYPESAFE_API_KEY からだけ読む（引数・ファイルには書かない）。
// ============================================================================
import fs from 'node:fs';

/** Jev の入力トークン単価（USD / 100 万トークン）。出力は無料。2026-10 時点の公開情報 */
export const DEFAULT_PRICE_PER_MILLION = 0.042;

/**
 * クライアントを作る。
 * @param {object} opts
 * @param {string} opts.apiKey API キー
 * @param {string} [opts.model] モデル名（既定 jev-latest）
 * @param {string} [opts.cachePath] 応答キャッシュ（NDJSON）のパス
 * @param {number} [opts.maxUsd] この実行で使ってよい上限（USD）。超えそうなら例外
 * @param {number} [opts.pricePerMillion] 入力トークン単価（USD / 1M）
 * @param {typeof fetch} [opts.fetchImpl] fetch の差し替え（テスト用）
 * @param {string} [opts.endpoint] エンドポイント
 * @returns {{judge: (key: string, state: string, questions: object) => Promise<object>, stats: () => {calls: number, cached: number, inputTokens: number, usd: number}}} クライアント
 */
export function createJevClient({
  apiKey,
  model = 'jev-latest',
  cachePath,
  maxUsd = 20,
  pricePerMillion = DEFAULT_PRICE_PER_MILLION,
  fetchImpl = fetch,
  endpoint = 'https://api.typesafe.ai/v1/systemone',
}) {
  if (!apiKey) throw new Error('TYPESAFE_API_KEY が無い');
  // キャッシュを読む（キー → 応答）
  const cache = new Map();
  if (cachePath && fs.existsSync(cachePath)) {
    for (const line of fs.readFileSync(cachePath, 'utf-8').split('\n')) {
      if (!line) continue;
      const { key, res } = JSON.parse(line);
      cache.set(key, res);
    }
  }
  const stats = { calls: 0, cached: 0, inputTokens: 0, usd: 0 };

  /**
   * 1 件判定する。キャッシュにあればそれを返す。
   * @param {string} key キャッシュの鍵（入力を一意に表す文字列）
   * @param {string} state 文脈
   * @param {object} questions 質問
   * @returns {Promise<object>} API の応答（answers / usage）
   */
  async function judge(key, state, questions) {
    const hit = cache.get(key);
    if (hit) {
      stats.cached++;
      return hit;
    }
    // 上限ガード: ここまでの実測から 1 件あたりの平均を出し、次の 1 件で超えるなら止める
    const avg = stats.calls ? stats.inputTokens / stats.calls : 600;
    if (stats.usd + (avg / 1e6) * pricePerMillion > maxUsd) {
      throw new Error(`費用の上限 ${maxUsd} USD に達する見込み（これまで ${stats.usd.toFixed(4)} USD）`);
    }
    const body = JSON.stringify({ model, state, questions });
    let res;
    // 429 / 5xx は指数バックオフで最大 6 回
    for (let attempt = 0; ; attempt++) {
      const r = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body,
      });
      if (r.ok) {
        res = await r.json();
        break;
      }
      const text = await r.text().catch(() => '');
      if ((r.status === 429 || r.status >= 500) && attempt < 6) {
        await new Promise((ok) => setTimeout(ok, 500 * 2 ** attempt));
        continue;
      }
      throw new Error(`Jev API ${r.status}: ${text.slice(0, 200)}`);
    }
    stats.calls++;
    const tokens = Number(res.usage?.input_tokens ?? 0);
    stats.inputTokens += tokens;
    stats.usd += (tokens / 1e6) * pricePerMillion;
    cache.set(key, res);
    if (cachePath) fs.appendFileSync(cachePath, JSON.stringify({ key, res }) + '\n');
    return res;
  }

  return { judge, stats: () => ({ ...stats }) };
}

/**
 * 配列を並列度を制限して処理する。
 * @template T, R
 * @param {T[]} items 入力
 * @param {number} concurrency 同時に走らせる数
 * @param {(item: T, i: number) => Promise<R>} fn 1 件の処理
 * @returns {Promise<R[]>} 入力と同じ順の結果
 */
export async function mapLimit(items, concurrency, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}
