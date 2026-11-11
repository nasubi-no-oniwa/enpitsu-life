// 確かめ済みの鉛筆だけで再生する試験：node test/trust-test.mjs
import fs from 'fs';
const G = globalThis; eval(fs.readFileSync(new URL('../js/engine.js', import.meta.url), 'utf8')); eval(fs.readFileSync(new URL('../js/verify.js', import.meta.url), 'utf8'));
const FT = G.FT, V = FT.V;
let ng = 0; const ok = (c, m) => { if (!c) { ng++; console.log('NG', m); } else console.log('ok', m); };
const W = 40, H = 20, tiles = new Uint8Array(W * H);
for (let y = 15; y < H; y++) for (let x = 0; x < W; x++) tiles[y * W + x] = 1;
const lv = { f: 1, w: W, h: H, tiles, cap: Int8Array.from({ length: W }, () => 5), start: [2, 15], goal: [38, 10, 1, 4], ents: [] };
// その場で遊んで記録を作る（cor：その人に見えていた鉛筆）
function play(cor, acts) {
  const r = new FT.Run(lv, cor), rec = new FT.Rec(); let ai = 0;
  for (let t = 1; t < 5000 && !r.over; t++) {
    let inp = null;
    if (!r.p.fly && ai < acts.length) { const a = acts[ai]; if (t >= (a.at || 1) && (a.wait === undefined || t >= r._landT + a.wait)) { inp = { go: a.go }; rec.go(t, a.go[0], a.go[1]); ai++; } }
    const was = r.p.fly; r.step(inp); if (was && !r.p.fly) r._landT = t;
  }
  return { run: r, rec: rec.str() };
}
// 1. 遠くに確かめていない鉛筆があっても、触れていなければ通る
const far = FT.ckey(15, FT.colOf(30.25));
const a = play(new Map([[far, { n: 3 }]]), [{ go: [100, 500] }]);
ok(a.run.over && a.run.place.k >= 0, '地面に刺さった ' + JSON.stringify(a.run.place));
const it1 = { r: a.rec, c: FT.corStr(new Map([[far, { n: 3 }]])), k: a.run.t, p: String(a.run.place.k), u: 'a' };
ok(V.verifyDeath(lv, it1, {}) === 'ok', '確かめていない鉛筆が遠くにあっても通る（前は通らなかった）');
// 2. 確かめていない鉛筆を足場にした記録は通らない（だめの数には入れない）
const land = a.run.place.k;   // さっき刺さった所に、確かめていない鉛筆があったことにする
const b = play(new Map([[land, { n: 1 }]]), [{ go: [100, 500] }, { go: [130, 600], wait: 20 }]);
ok(b.run.over && b.run.place.k >= 0 && b.run.place.k !== land, '鉛筆に乗ってもう一度飛んだ ' + JSON.stringify(b.run.place));
const it2 = { r: b.rec, c: FT.corStr(new Map([[land, { n: 1 }]])), k: b.run.t, p: String(b.run.place.k), u: 'b' };
ok(V.verifyDeath(lv, it2, {}) === 'snap', '確かめていない鉛筆を足場にしたら通らない ' + V.verifyDeath(lv, it2, {}));
const res = V.verifyDeaths(lv, [it2, it2, it2], {}, {}, 1e6);
ok(!res.badInc.b, 'だめの数には入らない');
// 3. その足場の鉛筆が確かめ済みなら通る
ok(V.verifyDeath(lv, it2, { [land]: 1 }) === 'ok', '足場が確かめ済みなら通る');
// 4. ずる：見えていなかった鉛筆を足して記録を作っても、確かめていなければ使えない
ok(V.verifyDeath(lv, Object.assign({}, it2, { u: 'c' }), {}) !== 'ok', 'ずるで足した鉛筆は使えない');
// 5. 越えた記録も同じ（確かめていない鉛筆が関係なければ通る）
console.log(ng ? '失敗 ' + ng : 'すべて通った'); process.exit(ng ? 1 : 0);
