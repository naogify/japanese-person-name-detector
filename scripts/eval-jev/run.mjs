// ============================================================================
// scripts/eval-jev/run.mjs
// ----------------------------------------------------------------------------
// sample.mjs の標本を Jev に投げ、層ごとの判定分布と、現行判定（A / A∪G）との不一致を出す。
//
//   TYPESAFE_API_KEY=... node scripts/eval-jev/run.mjs [--out scripts/eval-jev/out] \
//        [--concurrency 8] [--max-usd 20] [--model jev-latest]
//
// 出力（氏名を含むものは out/ の下だけ。git には入れない）:
//   out/results.ndjson   標本 + Jev の答え
//   out/review.tsv       現行判定と Jev が食い違う行（目視用）
//   out/summary.json     層ごとの集計（氏名なし。RESULTS.md に転記する）
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { createJevClient, mapLimit } from './jev-client.mjs';
import { buildState, QUESTIONS, pickAnswer, summarize, currentDecision, STRATA } from './lib.mjs';

/** 引数を読む（--key value の形） */
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  return args;
}
const args = parseArgs(process.argv.slice(2));
const outDir = args.out || path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
const concurrency = Number(args.concurrency || 8);
const maxUsd = Number(args['max-usd'] || 20);
const model = args.model || 'jev-latest';

const sample = fs
  .readFileSync(path.join(outDir, 'sample.ndjson'), 'utf-8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const client = createJevClient({
  apiKey: process.env.TYPESAFE_API_KEY,
  model,
  cachePath: path.join(outDir, `jev-cache.${model}.ndjson`),
  maxUsd,
});

let done = 0;
const started = Date.now();
const results = await mapLimit(sample, concurrency, async (r) => {
  const key = `${model}\t${r.name}\t${r.business_type}\t${r.prefecture}`;
  const res = await client.judge(key, buildState(r), QUESTIONS);
  done++;
  if (done % 200 === 0) {
    const s = client.stats();
    console.error(`${done}/${sample.length} calls=${s.calls} cached=${s.cached} usd=${s.usd.toFixed(4)} ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  return { ...r, ...pickAnswer(res), model: res.model };
});

// 結果（氏名を含む）
const ws = fs.createWriteStream(path.join(outDir, 'results.ndjson'));
for (const r of results) ws.write(JSON.stringify(r) + '\n');
ws.end();

// 現行判定との不一致（目視用）。Jev は閾値 0.5 で「個人名」とみなす
const header = ['stratum', 'name', 'business_type', 'prefecture', 'sources', 'rule', 'p_person', 'p_contains', 'kind', 'kind_conf', 'excluded_A', 'excluded_AG', 'jev_person'];
const review = [header.join('\t')];
for (const r of results) {
  const cur = currentDecision(r.stratum);
  const jev = r.p_person >= 0.5;
  if (jev !== cur.AG) {
    review.push(
      [r.stratum, r.name, r.business_type, r.prefecture, r.sources, r.rule, r.p_person, r.p_contains, r.kind, r.kind_conf, cur.A, cur.AG, jev].join('\t'),
    );
  }
}
fs.writeFileSync(path.join(outDir, 'review.tsv'), review.join('\n') + '\n');

// 集計（氏名なし）
const summary = summarize(results);
const stats = client.stats();
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ model, stats, summary }, null, 2) + '\n');
console.log(`model=${results[0]?.model} calls=${stats.calls} cached=${stats.cached} inputTokens=${stats.inputTokens} usd=${stats.usd.toFixed(4)}`);
console.log('stratum        n    mean  >=0.5  >=0.7  >=0.9  kinds');
for (const s of STRATA) {
  const v = summary[s];
  if (!v) continue;
  const k = Object.entries(v.kinds).map(([a, b]) => `${a}=${b}`).join(' ');
  console.log(`${s.padEnd(13)} ${String(v.n).padStart(4)}  ${v.mean.toFixed(2)}  ${String(v.atThreshold[0.5]).padStart(5)}  ${String(v.atThreshold[0.7]).padStart(5)}  ${String(v.atThreshold[0.9]).padStart(5)}  ${k}`);
  console.log(`   hist(0.0-1.0, 0.1刻み): ${v.hist.join(' ')}`);
}
console.log(`disagreements (Jev@0.5 vs A∪G): ${review.length - 1} → ${path.join(outDir, 'review.tsv')}`);
