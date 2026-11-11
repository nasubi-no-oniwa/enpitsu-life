// =============================================
//  エンピツライフ  100層を作る（node tools/genlevels.mjs [はじめの層] [おわりの層]）
//   ・部品（平ら・段差・壁・のり・トゲ・天井・紙ひこうき・鉛筆けずり・扇風機・消しゴム）を、層が上がるほど難しく組み合わせる
//   ・作った層は、越えられるかを計算で確かめる（tools/solver.mjs）。越えられない層は作りなおす
//   ・できた層は data/levels.json に書く（すでにある層は、指定した範囲だけ書きかえる）
// =============================================
import fs from 'fs';
import { makeSolver } from './solver.mjs';
const G = globalThis; eval(fs.readFileSync(new URL('../js/engine.js', import.meta.url), 'utf8'));
const FT = G.FT, T = FT.T, S = makeSolver(FT);
const OUT = process.env.OUT ? new URL('file://' + process.env.OUT) : new URL('../data/levels.json', import.meta.url);
const H = 24, GY = 18;
export const THEMES = ['ノートのすみっこ', '方眼紙の原っぱ', '黒板のがけ', 'テスト用紙の谷', '絵の具のぬま', '習字の半紙', '図工室の工場', '夜の教室', '受験の塔', '卒業の空'];
// 決まった乱数（層の番号とためし番号から）
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function build(f, tryN) {
  const R = rng(f * 7919 + tryN * 104729 + 13), ri = (a, b) => a + Math.floor(R() * (b - a + 1)), pick = a => a[Math.floor(R() * a.length)];
  const d = (f - 1) / 99;
  const W = Math.round(70 + f * 3.4 + ri(0, 10));
  const tiles = new Uint8Array(W * H), cap = new Int8Array(W).fill(2), ents = [];
  const set = (x, y, v) => { if (x >= 0 && x < W && y >= 0 && y < H) tiles[y * W + x] = v; };
  const fillCol = (x, top, v) => { for (let y = top; y < H; y++) set(x, y, v); };
  let g = GY, x = 0;
  // スタート：筆箱の上
  for (let i = 0; i < 3; i++) { fillCol(i, g, T.BLOCK); for (let y = g - 2; y < g; y++) set(i, y, T.BOOK); cap[i] = 0; }
  const start = [1.75, g - 2];
  x = 3;
  const flat = n => { for (let i = 0; i < n && x < W; i++, x++) fillCol(x, g, T.BLOCK); };
  flat(ri(3, 5));
  const goalW = 6;
  // 使える部品（層が上がると増える）
  const parts = ['flat', 'step', 'glue'];
  parts.push('wall');
  if (f >= 6) parts.push('spike');
  if (f >= 12) parts.push('ceil');
  if (f >= 15) parts.push('plane');
  if (f >= 20) parts.push('sharp');
  if (f >= 25) parts.push('fan');
  if (f >= 35) parts.push('eraser');
  if (f >= 50) parts.push('wall', 'glue');
  let last = '';
  while (x < W - goalW - 4) {
    let k = pick(parts); if (k === last && k !== 'flat') k = 'flat'; last = k;
    if (k === 'flat') flat(ri(1, 5 - Math.round(d * 2)));
    else if (k === 'step') {
      const up = R() < .55 || g > GY + 1, h = ri(1, 2 + Math.round(d * 3));
      g = Math.max(8, Math.min(GY + 3, g + (up ? -h : h)));
      flat(ri(2, 4));
    } else if (k === 'glue' || k === 'spike') {
      const n = ri(3 + Math.round(d * 3), 4 + Math.round(d * 8));
      for (let i = 0; i < n && x < W - goalW - 3; i++, x++) { fillCol(x, g, T.BLOCK); if (k === 'glue') set(x, g, T.GLUE); else { set(x, g - 1, T.SPIKE); } cap[x] = 0; }
      flat(ri(2, 3));
    } else if (k === 'wall') {
      const hw = ri(6 + Math.round(d * 3), 8 + Math.round(d * 7)), th = ri(1, 2);
      // 壁の前は、積める本数を多めにする（壁の上まで届くように）
      const needN = Math.max(2, Math.ceil((hw - 3.2) / FT.PHYS.PH) + 1);
      flat(1); cap[x - 1] = needN; if (x >= 2) cap[x - 2] = Math.max(cap[x - 2], Math.ceil(needN / 2));
      for (let i = 0; i < th; i++, x++) { fillCol(x, g, T.BLOCK); for (let y = g - hw; y < g; y++) set(x, y, T.BOOK); cap[x] = 2; }
      // 壁の上は高くなったまま進むか、おりるか
      if (R() < .4) { g = g - hw; flat(ri(2, 3)); } else flat(ri(2, 4));
      g = Math.max(8, g);
    } else if (k === 'ceil') {
      const n = ri(5, 9), ch = ri(4, 5);
      for (let i = 0; i < n && x < W - goalW - 3; i++, x++) { fillCol(x, g, T.BLOCK); set(x, g - ch - 1, T.BLOCK); if (R() < .5) set(x, g - ch - 2, T.BLOCK); cap[x] = 2; }
      flat(2);
    } else if (k === 'plane' || k === 'sharp' || k === 'fan' || k === 'eraser') {
      // のりの池の上に仕掛け
      const n = ri(4, 4 + Math.round(d * 4)), x0 = x;
      for (let i = 0; i < n && x < W - goalW - 3; i++, x++) { fillCol(x, g, T.BLOCK); set(x, g, T.GLUE); cap[x] = 0; }
      const x1 = x;
      if (k === 'plane') ents.push({ k: 'plane', x1: x0 - 1, x2: x1 + 1, y: g - ri(3, 6) + .5, per: pick([2, 4]), off: Math.round(R() * 100) / 100 });
      if (k === 'sharp') ents.push({ k: 'sharp', x: (x0 + x1) / 2, y: g - ri(3, 6) + .5, r: .55 });
      if (k === 'fan') ents.push({ k: 'fan', x: x0, y: g - 9, w: x1 - x0, h: 9, f: (R() < .5 ? -1 : 1) * (3 + Math.round(d * 4)) });
      if (k === 'eraser') ents.push({ k: 'eraser', x: (x0 + x1) / 2 - .6, y1: g - 8, y2: g - 2.5, w: 1.2, h: 1.6, per: pick([2, 4]), off: Math.round(R() * 100) / 100 });
      flat(ri(2, 3));
    }
  }
  // ゴール：鉛筆立て
  while (x < W - goalW) { fillCol(x, g, T.BLOCK); x++; }
  const gx = x + 1;
  for (; x < W; x++) fillCol(x, g, T.BLOCK);
  for (let i = gx; i < gx + 3; i++) { for (let y = g - 3; y < g; y++) set(i, y, T.BOOK); cap[i] = 0; }
  const goal = [gx - 0.2, g - 6, 3.4, 2.7];
  return { f, n: THEMES[Math.ceil(f / 10) - 1], w: W, h: H, t: FT.rleEncode(tiles), c: Array.from(cap).map(v => Math.max(0, Math.min(35, v)).toString(36)).join(''), s: start, g: goal, e: ents };
}
// ---------- 作って確かめる ----------
const from = +(process.argv[2] || 1), to = +(process.argv[3] || 100);
const all = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
// 必要な鉛筆の数の目安（層が上がるほど多く）。少なすぎる・多すぎる層は作りなおす
const want = f => [Math.round(9 + f * 0.9), Math.round(30 + f * 3)];
for (let f = from; f <= to; f++) {
  let best = null;
  for (let tryN = 0; tryN < 5; tryN++) {
    const r = build(f, tryN), lv = FT.makeLevel(r);
    const res = S.solve(lv, null, { max: want(f)[1] + 40, ms: 70000 });
    const [lo, hi] = want(f);
    const line = `第${f}層 ためし${tryN}：幅${r.w} ${res.ok ? '越えられる' : '越えられない(' + res.why + ' ' + res.far.toFixed(0) + ')'} 必要な鉛筆 ${res.need}（目安 ${lo}〜${hi}） ${res.ms}ms`;
    console.log(line);
    if (res.ok) { r.need = res.need; r.sol = res.log.map(a => a.slice(0, 2)); if (res.need >= lo && res.need <= hi) { best = r; break; } if (!best || Math.abs(res.need - (lo + hi) / 2) < Math.abs(best.need - (lo + hi) / 2)) best = r; }
  }
  if (!best) { console.log(`第${f}層：越えられる形が作れませんでした`); process.exitCode = 1; continue; }
  all[f - 1] = best;
  fs.mkdirSync(new URL('./', OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(all));
}
