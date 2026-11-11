// 赤い線（積める本数）をこえた鉛筆の試験：node test/cap-test.mjs
import fs from 'fs';
const G = globalThis; eval(fs.readFileSync(new URL('../js/engine.js', import.meta.url), 'utf8')); eval(fs.readFileSync(new URL('../js/verify.js', import.meta.url), 'utf8'));
const FT = G.FT, V = FT.V;
let ng = 0; const ok = (c, m) => { if (!c) { ng++; console.log('NG', m); } else console.log('ok', m); };
const lv = FT.makeLevel(JSON.parse(fs.readFileSync(new URL('../data/levels.json', import.meta.url), 'utf8'))[0]);
// 積める本数が2の列をさがす
let tx = -1; for (let x = 4; x < lv.w; x++) if (lv.cap[x] === 2) { tx = x; break; }
let gy = 0; while (gy < lv.h && lv.tiles[gy * lv.w + tx] === 0) gy++;
const col = FT.colOf(tx + 0.25), k = FT.ckey(gy, col);
ok(FT.capOf(lv, k) === 2, '列の積める本数 ' + FT.capOf(lv, k));
// 1. データベースには14本あっても、動きの計算では2本まで
const r = new FT.Run(lv, new Map([[k, { n: 14 }]]));
const st = r.cols.get(col)[0];
ok(st.n === 2 && Math.abs(st.top - (gy - 2 * FT.PHYS.PH)) < 1e-9, '動きの計算では2本 ' + st.n);
// 2. 見せる鉛筆も2本まで（確かめ済み1本＋確かめ中9本でも）
const sh = V.shown({ t: 0, ti: [], P: { [k]: 1 }, bad: {} }, { [k]: { n: 14, l: 'a', t: 1 } }, Array.from({ length: 9 }, (_, i) => ({ p: String(k), u: 'u' + i })), lv);
ok(sh.get(k).n === 2, '見せる鉛筆は2本 ' + sh.get(k).n);
// 3. 始まりの鉛筆に14本と書かれていても、確かめ済みが2本あれば通る（赤い線より上は数えない）
ok(V.snapOk(new Map([[k, { n: 14 }]]), { [k]: 2 }, lv) === true, '14本と書かれた記録も、2本確かめ済みなら通る');
ok(V.snapOk(new Map([[k, { n: 14 }]]), { [k]: 1 }, lv) === false, '確かめ済みが1本なら通らない');
// 4. 赤い線の上に乗った記録は、再生すると同じにならない（ずるにならない）
console.log(ng ? '失敗 ' + ng : 'すべて通った'); process.exit(ng ? 1 : 0);
