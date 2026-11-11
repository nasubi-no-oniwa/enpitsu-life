// いま ft-blue に入っているルールを読み、el の部分（エンピツライフ）だけを差しかえて戻す（ほかのゲームの部分はそのまま）
import fs from 'fs';
import { token, api } from './fb.mjs';
// ルールの文字から // と /* */ のコメントを取る（文字列の中はさわらない）
function strip(s) {
  let o = '', i = 0, q = null;
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (q) { o += c; if (c === '\\') { o += n; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'") { q = c; o += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue; }
    o += c; i++;
  }
  return o.replace(/,(\s*[}\]])/g, '$1');
}
const tk = await token();
const cur = await api('GET', '/.settings/rules.json', undefined, tk);
let obj;
try { obj = JSON.parse(cur); } catch (e) { obj = JSON.parse(strip(cur)); }
if (!obj || !obj.rules || typeof obj.rules !== 'object') throw new Error('いまのルールが読めませんでした');
const keys = Object.keys(obj.rules);
console.log('いまのルール：', keys.length, '個の場所', keys.join(' '));
fs.writeFileSync(process.env.RUNNER_TEMP + '/before.json', cur);
const hj = JSON.parse(fs.readFileSync('database.rules.el.json', 'utf8'));
const had = 'el' in obj.rules;
obj.rules.el = hj;
await api('PUT', '/.settings/rules.json', JSON.stringify(obj, null, 2), tk);
const at = await api('GET', '/.settings/rules.json', undefined, tk);
let after; try { after = JSON.parse(at); } catch (e) { after = JSON.parse(strip(at)); }
const ok = Object.keys(after.rules).length === keys.length + (had ? 0 : 1) && JSON.stringify(after.rules.el) === JSON.stringify(hj);
console.log(ok ? '反映しました（el を' + (had ? '差しかえ' : '追加') + '）' : '反映のあとの確認が合いません');
if (!ok) process.exit(1);
