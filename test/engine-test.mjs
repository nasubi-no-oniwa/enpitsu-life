// 動きの計算の試験：node test/engine-test.mjs
import fs from 'fs';
globalThis.window = undefined;
const G = globalThis; eval(fs.readFileSync(new URL('../js/engine.js', import.meta.url), 'utf8'));
const FT = G.FT, T = FT.T;
let ng = 0; const ok = (c, m) => { if (!c) { ng++; console.log('NG', m); } else console.log('ok', m); };
// 試しの層：幅40・高さ20。地面は y=15 から下。x=12〜13 に高さ4の壁、x=6〜7 はのり
function mk() {
  const w = 40, h = 20, t = new Uint8Array(w * h);
  for (let y = 15; y < h; y++) for (let x = 0; x < w; x++) t[y * w + x] = T.BLOCK;
  for (let y = 11; y < 15; y++) for (let x = 12; x < 14; x++) t[y * w + x] = T.BOOK;
  for (let x = 6; x < 8; x++) t[15 * w + x] = T.GLUE;
  t[14 * w + 33] = T.SPIKE;
  const cap = new Int8Array(w).fill(3); for (let x = 6; x < 8; x++) cap[x] = 0;
  return { f: 1, w, h, tiles: t, cap, start: [2.25, 14], goal: [37, 10, 2, 5], ents: [] };
}
const run = (lv, cor, ai, pw, steer) => { const r = new FT.Run(lv, cor); r.step({ go: [ai, pw] }); while (!r.over && r.t < 2000) { r.step({ L: steer < 0 ? 1 : 0, R: steer > 0 ? 1 : 0 }); if (!r.p.fly && r.t > 2) break; } return r; };
const lv = mk();
// 1. 右ななめに飛ぶと地面に刺さる
let r = run(lv, new Map(), FT.aIdx(25), 480, 0);
ok(r.over && r.dead === 'ground' && r.place.k >= 0 && FT.ksy(r.place.k) === 15, '地面に刺さる ' + JSON.stringify(r.place) + ' x=' + r.p.x.toFixed(2));
const k1 = r.place.k, x1 = FT.colX(FT.kcol(k1));
// 2. 同じ操作をすると、今度は鉛筆の上に乗れる（もう一度飛べる）
let cor = new Map([[k1, { n: 1 }]]);
r = run(lv, cor, FT.aIdx(25), 480, 0);
console.log('  2:', r.over, r.dead, JSON.stringify(r.place), r.p.fly, r.p.on, k1);
ok(!r.over && !r.p.fly && r.p.on === k1, '鉛筆の上に乗れる x=' + r.p.x.toFixed(2) + ' y=' + r.p.y.toFixed(2));
// 3. 決まった答え：同じ操作は何度やっても同じ
const a = run(lv, new Map(), FT.aIdx(20), 730, 1), b = run(lv, new Map(), FT.aIdx(20), 730, 1);
ok(a.t === b.t && a.p.x === b.p.x && JSON.stringify(a.place) === JSON.stringify(b.place), '同じ操作は同じ結果');
// 4. 壁の横の鉛筆：壁にぶつかると、真下の鉛筆の上に積み重なる
const kw = FT.ckey(15, FT.colOf(11.75));
cor = new Map([[kw, { n: 1 }]]);
let found = null;
for (let ai = 120; ai <= 240 && !found; ai += 2) for (let pw = 100; pw <= 1000 && !found; pw += 20) { const q = run(lv, cor, ai, pw, 0); if (q.over && q.dead === 'wall' && q.place.why === 'stack') found = [ai, pw, q.place]; }
if (!found) { const c = {}; for (let ai = 120; ai <= 240; ai += 2) for (let pw = 100; pw <= 1000; pw += 20) { const q = run(lv, cor, ai, pw, 0); const key = (q.dead||'land') + '/' + (q.place ? q.place.why : '-'); c[key] = (c[key] || 0) + 1; } console.log(c); }
ok(found && found[2].k === kw && found[2].n === 2, '壁にぶつかると積み重なる ' + JSON.stringify(found));
// 5. 上限（3本）に来ると、はじかれる
cor = new Map([[kw, { n: 3 }]]);
let capHit = false;
for (let ai = 120; ai <= 240 && !capHit; ai += 2) for (let pw = 100; pw <= 1000 && !capHit; pw += 20) { const q = run(lv, cor, ai, pw, 0); if (q.over && q.place.why === 'cap') capHit = true; }
ok(capHit, '上限の鉛筆の上には積めず、はじかれる');
// 6. のりの上は沈んで消える
let sink = false;
for (let pw = 100; pw <= 1000 && !sink; pw += 10) for (let ai = 130; ai <= 230 && !sink; ai += 4) { const q = run(lv, new Map(), ai, pw, 0); if (q.over && q.place.why === 'sink') sink = true; }
ok(sink, 'のりの上は沈んで消える');
// 7. 記録して再生すると、同じ結果
const rec = new FT.Rec(); const live = new FT.Run(lv, new Map());
live.step({ go: [FT.aIdx(30), 820] }); rec.go(1, FT.aIdx(30), 820);
for (let t = 2; !live.over && t < 2000; t++) { const b = t > 30 && t < 60 ? 2 : 0; rec.steer(t, b); live.step({ L: b & 1, R: (b >> 1) & 1 }); if (!live.p.fly) break; }
const rp = FT.replay(lv, new Map(), rec.str(), live.t + 2);
ok(rp.t === live.t && JSON.stringify(rp.place) === JSON.stringify(live.place), '記録の再生が同じ ' + rec.str());
// 8. 文字にした鉛筆の一覧が戻る
const cs = FT.corStr(new Map([[kw, { n: 3 }], [k1, { n: 1 }]])), back = FT.corParse(cs);
ok(back.get(kw).n === 3 && back.get(k1).n === 1, '鉛筆の一覧の文字');
// 9. 予測線は上に向かって終わる
const pr = FT.predict(2.25, 14, 120, 1000); ok(Math.abs(pr[pr.length - 1][1] - (14 - 21 * 21 / 60)) < 0.3, '真上・全力の高さ 約' + (14 - pr[pr.length - 1][1]).toFixed(2) + 'マス');
// 10. 最大の飛距離
let far = 0; for (let ai = 120; ai <= 240; ai++) { const q = run(lv, new Map(), ai, 1000, 0); if (q.place && q.place.k >= 0) far = Math.max(far, FT.colX(FT.kcol(q.place.k)) - 2.25); }
ok(far > 8, '平らな所でのいちばん遠い距離 約' + far.toFixed(1) + 'マス');
console.log(ng ? '失敗 ' + ng : 'すべて通った');
process.exit(ng ? 1 : 0);
