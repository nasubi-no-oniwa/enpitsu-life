// 操作の記録の読み方の試験（前の形「時刻g角度p強さ」は、角度に g・強さに p が入ると読みまちがえていた）：node test/rec-test.mjs
import fs from 'fs';
const G = globalThis; eval(fs.readFileSync(new URL('../js/engine.js', import.meta.url), 'utf8'));
const FT = G.FT; let ng = 0; const ok = (c, m) => { if (!c) { ng++; console.log('NG', m); } else console.log('ok', m); };
const J = x => JSON.stringify(x);
ok(J(FT.Rec.tokens('2dsg3vpp0')[0].c) === J([[3088, 139, 900]]), '強さ900（p0）を正しく読む ' + J(FT.Rec.tokens('2dsg3vpp0')));
ok(J(FT.Rec.tokens('6zg3gp4m')[0].c) === J([[251, 124, 166]]), '角度124（3g）を正しく読む ' + J(FT.Rec.tokens('6zg3gp4m')));
ok(J(FT.Rec.tokens('2ds_3v_p0')[0].c) === J([[3088, 139, 900]]), '新しい形（_ で区切る）を読む');
ok(FT.Rec.tokens('1g3gpp0')[0].c.length === 2, '本当にあいまいなときは、読み方を2つ出す ' + J(FT.Rec.tokens('1g3gpp0')));
ok(J(FT.Rec.tokens('2ges1')[0]) === J({ k: 's', t: 3182, b: 1 }), '左右の記録はそのまま');
// 前の形で書いた記録を再生して、その場で動かしたのと同じになるか（角度・強さに g と p が入る飛び方ばかり）
const W = 60, H = 20, tiles = new Uint8Array(W * H); for (let y = 15; y < H; y++) for (let x = 0; x < W; x++) tiles[y * W + x] = 1;
for (let x = 6; x < W; x += 5) for (let y = 11; y < 15; y++) tiles[y * W + x] = 1;
const lv = { f: 1, w: W, h: H, tiles, cap: Int8Array.from({ length: W }, () => 5), start: [2, 15], goal: [58, 8, 1, 4], ents: [] };
const old = (t, ai, pw) => t.toString(36) + 'g' + ai.toString(36) + 'p' + pw.toString(36);
let same = 0, all = 0;
for (const [ai, pw] of [[124, 900], [124, 925], [88, 905], [160, 930], [124, 61], [139, 900], [52, 97]]) {
  const r = new FT.Run(lv, new Map()); r.step({ go: [ai, pw] }); while (!r.over && r.t < 900) r.step(null);
  const rec = old(1, ai, pw), q = FT.replay(lv, new Map(), rec, r.t + 2);
  all++; if (q.t === r.t && q.p.x === r.p.x && q.p.y === r.p.y && String(q.place && q.place.k) === String(r.place && r.place.k)) same++;
}
ok(same === all, `前の形の記録でも、同じ動きに再生できる ${same}/${all}`);
// 新しい形で書いて、読みなおして同じ
const rc = new FT.Rec(); rc.go(5, 124, 925); rc.steer(9, 1); rc.steer(20, 0);
ok(/_/.test(rc.str()) && J(FT.Rec.tokens(rc.str()).map(x => x.c || [x.t, x.b])) === J([[[5, 124, 925]], [9, 1], [20, 0]]), '新しい形で書いて読みなおせる ' + rc.str());
console.log(ng ? '失敗 ' + ng : 'すべて通った'); process.exit(ng ? 1 : 0);
