// ============================================================================
// scripts/check-publish.mjs
// ----------------------------------------------------------------------------
// npm に公開する前の確認（prepublishOnly から呼ぶ）。次のどれかに当たれば公開を止める。
//   1. dependencies に GitHub・git・ファイル参照がある
//      （利用者の環境で GitHub から取りに行くことになる。辞書を npm に公開してから semver の範囲に切り替える）
//   2. dist/ が無い、または src/ より古い（ビルドし忘れ）
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));

/**
 * 依存の指定がレジストリ以外（GitHub・git・URL・ファイル）を指しているか。
 * @param {string} spec package.json の依存のバージョン指定
 * @returns {boolean} レジストリ以外なら true
 */
export function isNonRegistrySpec(spec) {
  return /^(github:|git\+|git:|https?:|file:|link:|[\w.-]+\/[\w.-]+(#.*)?$)/.test(spec);
}

const problems = [];
// 1. 依存がすべて npm レジストリの semver 指定であること
for (const [name, spec] of Object.entries(pkg.dependencies ?? {})) {
  if (isNonRegistrySpec(spec)) problems.push(`dependencies.${name} がレジストリ以外を指している: ${spec}`);
}
// 2. dist/ が src/ より新しいこと
const newest = (dir, ext) =>
  Math.max(0, ...fs.readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => fs.statSync(path.join(dir, f)).mtimeMs));
const distFile = path.join(root, 'dist', 'index.js');
if (!fs.existsSync(distFile)) problems.push('dist/index.js が無い（npm run build）');
else if (fs.statSync(distFile).mtimeMs < newest(path.join(root, 'src'), '.ts')) problems.push('dist/ が src/ より古い（npm run build）');

// 直接実行されたときだけ結果を出して終了コードを返す（テストからは関数だけ使う）
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (problems.length) {
    for (const p of problems) console.error(`公開できない: ${p}`);
    process.exit(1);
  }
  console.error('公開前の確認: OK');
}
