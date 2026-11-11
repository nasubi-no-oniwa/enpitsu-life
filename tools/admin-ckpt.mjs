// =============================================
//  管理人の「ここまでを本物として確かめ済みにする」を、GitHub の上から行う（GitHub Actions の admin を手で動かす）
//   node tools/admin-ckpt.mjs 2   → 第2層までを確かめ済みにする（全員に次の層が開く）
//  ・いまの値より小さい番号にはしない（下げない）
// =============================================
import { token, api } from './fb.mjs';
const f = +process.argv[2];
if (!(Number.isInteger(f) && f >= 1 && f <= 100)) throw new Error('層の番号がおかしい：' + process.argv[2]);
const tk = await token();
const cur = JSON.parse(await api('GET', '/el/ckpt.json', undefined, tk));
const op = JSON.parse(await api('GET', '/el/open.json?shallow=true', undefined, tk)) || {};
console.log('いま：確かめ済み ' + cur + '　開いた印のある層 ' + Object.keys(op).sort((a, b) => a - b).join(','));
for (let i = 1; i <= f; i++) if (!op[i]) throw new Error('第' + i + '層には、まだ開いた印（越えた人）がありません');
if (typeof cur === 'number' && cur >= f) { console.log('もう第' + cur + '層まで確かめ済みです'); process.exit(0); }
await api('PUT', '/el/ckpt.json', f, tk);
console.log('第' + f + '層までを確かめ済みにしました');
