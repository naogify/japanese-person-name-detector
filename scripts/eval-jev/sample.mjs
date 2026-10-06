// ============================================================================
// scripts/eval-jev/sample.mjs
// ----------------------------------------------------------------------------
// JFF の facilities-all.csv を流し読みし、各行を 6 つの層（出典リスト内/外 × 姓名形 × 辞書一致）に
// 分類して、層ごとに無作為標本を取る。全行の層別件数も出す（氏名は出さない）。
//
//   node scripts/eval-jev/sample.mjs <facilities-all.csv> --sources <出典リストの JSON> \
//        [--per-stratum 500] [--seed 1] [--out scripts/eval-jev/out]
//
// 出典リストの JSON は geosearch-poi の config/jff-personal-name-sources.json（sourcePrefixes 配列）。
// 出力:
//   out/sample.ndjson  標本（氏名を含む。git には入れない）
//   out/strata.json    層ごとの全件数と標本数
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createDetector } from '../../dist/index.js';
import { parseCsvRecord, headerIndex, isListedSource, classifyStratum, STRATA, mulberry32, reservoir } from './lib.mjs';

/** 引数を読む（--key value の形） */
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1], i++;
    else args._.push(argv[i]);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const csvPath = args._[0];
if (!csvPath || !args.sources) {
  console.error('使い方: node scripts/eval-jev/sample.mjs <csv> --sources <json> [--per-stratum N] [--seed S] [--out DIR]');
  process.exit(2);
}
const perStratum = Number(args['per-stratum'] || 500);
const seed = Number(args.seed || 1);
const outDir = args.out || path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
fs.mkdirSync(outDir, { recursive: true });

const { sourcePrefixes } = JSON.parse(fs.readFileSync(args.sources, 'utf-8'));
// 姓名形だけ（辞書なし）と、姓名形かつ辞書（既定）の 2 つの判定器
const pattern = createDetector({ mode: 'pattern' });
const both = createDetector();

const rand = mulberry32(seed);
const pools = Object.fromEntries(STRATA.map((s) => [s, reservoir(perStratum, rand)]));
const counts = Object.fromEntries(STRATA.map((s) => [s, 0]));
let total = 0;
let emptyName = 0;
let idx = null;

const rl = readline.createInterface({ input: fs.createReadStream(csvPath), crlfDelay: Infinity });
for await (const line of rl) {
  const f = parseCsvRecord(line);
  if (!idx) {
    idx = headerIndex(f);
    continue;
  }
  total++;
  const name = (f[idx.name] || '').trim();
  // 空の施設名は判定の対象外（名前が無いので個人名でも屋号でもない）
  if (!name) {
    emptyName++;
    continue;
  }
  const listed = isListedSource(f[idx.sources], sourcePrefixes);
  const pat = pattern.looksLikePersonName(name);
  const dict = pat && both.looksLikePersonName(name);
  const stratum = classifyStratum({ listed, pattern: pat, dictionary: dict });
  counts[stratum]++;
  pools[stratum].push({
    stratum,
    name,
    business_type: f[idx.business_type] || '',
    prefecture: f[idx.prefecture] || '',
    sources: f[idx.sources] || '',
    rule: both.explain(name).rule,
  });
}

// 標本を書き出す（層の順に並べる）
const outSample = path.join(outDir, 'sample.ndjson');
const ws = fs.createWriteStream(outSample);
for (const s of STRATA) for (const r of pools[s].items) ws.write(JSON.stringify(r) + '\n');
ws.end();

const strata = {
  csv: path.basename(csvPath),
  generatedAt: new Date().toISOString().slice(0, 10),
  seed,
  perStratum,
  totalRows: total,
  emptyName,
  strata: Object.fromEntries(STRATA.map((s) => [s, { population: counts[s], sampled: pools[s].items.length }])),
};
fs.writeFileSync(path.join(outDir, 'strata.json'), JSON.stringify(strata, null, 2) + '\n');
console.log(`rows=${total} emptyName=${emptyName}`);
for (const s of STRATA) console.log(`${s.padEnd(14)} population=${String(counts[s]).padStart(8)} sampled=${pools[s].items.length}`);
console.log(`→ ${outSample}`);
