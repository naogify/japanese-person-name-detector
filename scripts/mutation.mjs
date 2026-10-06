// 変異注入: dist/index.js の規則を1つずつ壊し、テストが落ちる（変異を検出できる）ことを確認する。
//   npm run build && node scripts/mutation.mjs
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const FILE = new URL('../dist/index.js', import.meta.url);
const original = fs.readFileSync(FILE, 'utf-8');

/** [名前, 置換前, 置換後] */
const MUTATIONS = [
  ['姓名形の判定を外す', 'if (!PERSON_NAME_RE.test(n))', 'if (false)'],
  ['法人語の除外を外す', 'if (ORGANIZATION_RE.test(n))', 'if (false)'],
  ['屋号語尾の除外を外す', 'if (SHOP_SUFFIX_RE.test(given))', 'if (false)'],
  ['法人語「大学」を外す', '|大学|', '|'],
  ['屋号語尾「楼」を外す', '座楼]', '座]'],
  ['姓の長さ上限を緩める', '{1,4}', '{1,5}'],
  ['姓の辞書チェックを外す', 'if (!surnames.has(surname))', 'if (false)'],
  ['名の辞書チェックを外す', 'if (!givenNames.has(givenName))', 'if (false)'],
  ['both で姓名形を見ない', 'if (!p.result) {', 'if (false) {'],
  ['splitName が3語を許す', 'parts.length !== 2', 'parts.length < 2'],
  ['辞書照合前の畳み込みを外す', 'fold ? fold(parts.surname) : parts.surname', 'parts.surname'],
  ['Jev の acceptAbove を含まない比較にする', 'probability >= jev.acceptAbove', 'probability > jev.acceptAbove'],
  ['Jev の rejectBelow を含む比較にする', 'probability < jev.rejectBelow', 'probability <= jev.rejectBelow'],
  ['Jev の consult を無視する', '!jev.consult.has(sync.rule)', 'false'],
  ['空白の正規化を外す', 'normalizeSpaces ? normalizeName(rawName) : rawName', 'rawName'],
  ['分割照合で 2 字も分割する', 'if (chars.length < 3)\n            return null;', 'if (false)\n            return null;'],
  ['分割照合で姓名形の規則を見ない', "mode === 'both' && !explainPattern(`${a}${SEPARATOR}${b}`).result", 'false'],
];

let survived = 0;
for (const [name, from, to] of MUTATIONS) {
  if (!original.includes(from)) {
    console.log(`SKIP（置換対象が見つからない）: ${name}`);
    survived++;
    continue;
  }
  fs.writeFileSync(FILE, original.replace(from, to));
  const r = spawnSync('node', ['--test', 'test/'], { encoding: 'utf-8' });
  const killed = r.status !== 0;
  console.log(`${killed ? 'KILLED  ' : 'SURVIVED'}: ${name}`);
  if (!killed) survived++;
}
// 必ず元に戻す
fs.writeFileSync(FILE, original);
console.log(survived === 0 ? `全 ${MUTATIONS.length} 変異を検出` : `${survived} 件が生き残り`);
process.exit(survived === 0 ? 0 : 1);
