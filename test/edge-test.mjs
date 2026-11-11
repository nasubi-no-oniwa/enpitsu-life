// ブロックの端からはみ出す鉛筆の試験：node test/edge-test.mjs
import fs from 'fs';
const G = globalThis; eval(fs.readFileSync(new URL('../js/engine.js', import.meta.url), 'utf8')); eval(fs.readFileSync(new URL('../js/verify.js', import.meta.url), 'utf8'));
const FT = G.FT, V = FT.V;
let ng = 0; const ok = (c, m) => { if (!c) { ng++; console.log('NG', m); } else console.log('ok', m); };
// 小さな層：下の地面（15行目から下）と、x=10〜12 の高い台（12〜14行目）
const W = 24, H = 20, tiles = new Uint8Array(W * H);
for (let y = 15; y < H; y++) for (let x = 0; x < W; x++) tiles[y * W + x] = 1;
for (let y = 12; y < 15; y++) for (let x = 10; x <= 12; x++) tiles[y * W + x] = 1;
const lv = { f: 1, w: W, h: H, tiles, cap: Int8Array.from({ length: W }, () => 5), start: [2, 15], goal: [22, 10, 1, 4], ents: [] };
const drop = (x, y, cor) => { const r = new FT.Run(lv, cor || new Map()); const p = r.p; p.x = x; p.y = y; p.vx = 0; p.vy = 2; p.vx0 = 0; p.fly = true; for (let i = 0; i < 600 && !r.over; i++) r.step(null); return r; };
// 1. 鉛筆の真ん中が空中で、角だけ台に当たった：台の上の列に寄せて刺さる
let r = drop(9.9, 10.5);
ok(r.over && r.place && r.place.k >= 0, '角に当たって刺さった ' + JSON.stringify(r.place));
ok(FT.keyOk(lv, r.place.k), '刺さった場所は台の上（宙に浮かない） 列のまん中 x=' + FT.colX(FT.kcol(r.place.k)));
ok(FT.ksy(r.place.k) === 12 && FT.colX(FT.kcol(r.place.k)) > 10, '台の左はしの列 ' + FT.colX(FT.kcol(r.place.k)));
// 右の角も同じ
r = drop(13.1, 10.5);
ok(r.place && r.place.k >= 0 && FT.keyOk(lv, r.place.k) && FT.colX(FT.kcol(r.place.k)) < 13, '右の角も台の上に寄る ' + FT.colX(FT.kcol(r.place.k)));
// 2. ふつうに台の上に落ちたときは、これまでと同じ列
r = drop(10.4, 10.5);
ok(r.place && r.place.k === FT.ckey(12, FT.colOf(10.4)), 'ふつうの着地は同じ列');
// 3. はみ出した場所（列のまん中が空中）は正しくない場所
const hang = FT.ckey(12, FT.colOf(9.9));
ok(!FT.keyOk(lv, hang), 'はみ出した場所は正しくない');
ok(FT.keyOk(lv, FT.ckey(15, FT.colOf(5.2))), '地面の上はふつうに正しい');
// 4. はみ出した山は、動きの計算に入らない（足場にならない）・見せない
const run = new FT.Run(lv, new Map([[hang, { n: 3 }]]));
ok(!run.cols.get(FT.kcol(hang)), 'はみ出した山は足場にならない');
const sh = V.shown({ t: 0, ti: [], P: { [hang]: 3 }, bad: {} }, { [hang]: { n: 3, l: 'a', t: 1 } }, [], lv);
ok(!sh.has(hang), 'はみ出した山は見せない');
ok(V.snapOk(new Map([[hang, { n: 3 }]]), {}, lv) === true, 'はみ出した山が始まりにあっても、確かめで止まらない');
// 5. はみ出した場所に刺さった前の版の記録は、数えないが「だめ」の数にも入れない
const rec = new FT.Rec(); const it = { r: rec.str(), c: '', k: 50, p: String(hang), u: 'x' };
ok(V.verifyDeath(lv, it, {}) === 'old', '前の版のはみ出し記録は old ' + V.verifyDeath(lv, it, {}));
const res = V.verifyDeaths(lv, [it, it, it, it], {}, {}, 1e6);
ok(!res.badInc.x && res.add.length === 0, 'だめの数に入らず、鉛筆も数えない');
console.log(ng ? '失敗 ' + ng : 'すべて通った'); process.exit(ng ? 1 : 0);
