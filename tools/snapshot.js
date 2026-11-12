// =============================================
//  GitHub の「まとめ」を作る（GitHub Actions が15分ごとに動かす。手でも動かせる）
//   node tools/snapshot.js
//  ・データベースから、前のまとめより新しい分だけ読む
//  ・鉛筆と越えた記録を、ゲームと同じ計算で確かめて、確かめ済みのものだけ data/snap/ に書く
//  ・ゲームの端末は、まずこのまとめを読み、データベースからはそれより新しい分だけ読む（通信が大きく減る）
// =============================================
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
global.window = global;
require(path.join(ROOT, 'js/engine.js')); require(path.join(ROOT, 'js/verify.js'));
const FT = global.FT, V = FT.V;
let CFG;
if (process.env.EL_CONFIG_JSON) CFG = JSON.parse(process.env.EL_CONFIG_JSON);
else { const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8'), ctx); CFG = ctx.window.EL_CONFIG; }
const OUT = process.env.EL_SNAP_DIR || path.join(ROOT, 'data', 'snap');
const floors = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/levels.json'))).map(FT.makeLevel);
const T0 = Date.now(), LIMIT = +(process.env.EL_SNAP_MS || 8 * 60 * 1000);
// 確かめ方の版（変えたら、前のまとめの確かめをやりなおす）。2：赤い線より上の分は数えない　3：はみ出した鉛筆は数えない　4：確かめ済みの鉛筆だけで再生して合えば通す（つられて通らないのをなくす）
// 5：越えた記録は、データベースにある鉛筆でも再生する・ちがう人が3人以上越えていれば越えられたとみなす（管理人が確かめなくても先へ）
// 6：操作の記録の読みまちがい（角度に g・強さに p が入るとき）を直して、ぜんぶ確かめなおす
// 7：確かめ方を変えたときは、一番乗りも確かめなおす（6で、本当の一番乗りが前のまま別の人になっていた）
const SVER = 7;
async function rest(p, q) {
  const qs = Object.entries(q || {}).map(([k, v]) => k + '=' + encodeURIComponent(/^(limitTo|shallow)/.test(k) ? String(v) : JSON.stringify(v)));
  if (CFG.ns) qs.push('ns=' + CFG.ns);
  const url = CFG.databaseURL.replace(/\/$/, '') + '/el/' + p + '.json' + (qs.length ? '?' + qs.join('&') : '');
  for (let i = 0; i < 3; i++) { try { const r = await fetch(url); if (r.ok) return r.json(); } catch (e) { } await new Promise(r => setTimeout(r, 1000 * (i + 1))); }
  throw new Error('読めません ' + p);
}
const readJ = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return d; } };
const obj = v => { const o = {}; if (v && typeof v === 'object') for (const k in v) if (v[k] && typeof v[k] === 'object') o[k] = v[k]; return o; };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const prevIdx = readJ(path.join(OUT, 'index.json'), {});
  const at = Date.now() - 5000;
  const [open, stat, ckpt, rm, rs, end] = await Promise.all([rest('open'), rest('stat'), rest('ckpt').catch(() => null), rest('rm').catch(() => null), rest('reset').catch(() => null), rest('end').catch(() => null)]);
  const OPEN = obj(open), STAT = obj(stat), RM = obj(rm), RS = obj(rs);
  let mTop = 0; for (const k in OPEN) if (+k > mTop && +k <= 100) mTop = +k;
  const idx = { at, top: Math.min(101, mTop + 1), end: end && typeof end === 'object' ? end : null, ckpt: typeof ckpt === 'number' ? ckpt : null, open: {}, stat: STAT, ok: {}, floors: Object.assign({}, prevIdx.floors || {}), vc: prevIdx.ver === SVER ? Object.assign({}, prevIdx.vc || {}) : {}, ver: SVER };
  for (const f in OPEN) idx.open[f] = { t: OPEN[f].t, n: String(OPEN[f].n || '').slice(0, 12), w: String(OPEN[f].w || '').slice(0, 12), x: String(OPEN[f].x || '').slice(0, 15), id: OPEN[f].id };
  const top = Math.min(100, idx.top), states = {};
  for (let f = 1; f <= top; f++) {
    const file = path.join(OUT, 'f' + f + '.json'), prev = readJ(file, null);
    const rmKey = ((RM[f] && RM[f].t) || 0) + '_' + ((RS[f] && RS[f].t) || 0);
    let raw = {}, st = V.newState(), since = 0;
    if (prev && prev.rmKey === rmKey && prev.ver === SVER) { raw = prev.raw || {}; st = prev.st || st; since = Math.max(0, (prev.at || 0) - 120000); }
    const active = !prev || prev.rmKey !== rmKey || prev.ver !== SVER || ((STAT[f] && STAT[f].d) || 0) !== (prev.d || 0) || f === top;
    if (active && Date.now() - T0 < LIMIT) {
      const v = since ? await rest('cells/' + f, { orderBy: 't', startAt: since }) : await rest('cells/' + f);
      for (const k in v || {}) if (v[k]) raw[k] = { n: v[k].n, l: v[k].l, t: v[k].t };
      const items = V.newItems(st, await rest('dlog/' + f, { orderBy: 't', startAt: st.t }));
      await V.advance(floors[f - 1], st, raw, items, id => rest('drec/' + f + '/' + id), { ms: Math.max(1000, LIMIT - (Date.now() - T0)) });
      const out = { at, ver: SVER, f, rmKey, d: (STAT[f] && STAT[f].d) || 0, raw, st: { t: st.t, ti: st.ti, P: st.P, bad: st.bad, S: st.S || {} } };
      fs.writeFileSync(file, JSON.stringify(out)); idx.floors[f] = at;
      states[f] = { st, raw };
    } else if (prev) states[f] = { st: prev.st, raw: prev.raw };
  }
  // 越えた記録を確かめる：下の層から順に
  const prevOk = prevIdx.ver === SVER ? (prevIdx.ok || {}) : {};   // 確かめ方を変えたら、一番乗りも確かめなおす
  for (let f = 1; f <= 100; f++) {
    const o = idx.open[f]; if (!o) break;
    if (idx.ckpt !== null && f <= idx.ckpt) { idx.ok[f] = { t: o.t, id: o.id, n: o.n, w: o.w, x: o.x }; continue; }
    if (prevOk[f] && prevOk[f].t === o.t) {
      const same = prevOk[f].id === o.id, q = Object.assign({}, prevOk[f], same ? { n: o.n, w: o.w, x: o.x } : {});
      // 本当の一番乗りが「開いた印」を書いた人とちがうとき：書いて15分のあいだは、その人の名前を読みなおす
      if (!same && Date.now() - (q.ct || q.t) < 20 * 60000) { const c = await rest('clear/' + f + '/' + q.id).catch(() => null); if (c) { q.n = String(c.n || '名無し').slice(0, 12); q.w = String(c.w || '').slice(0, 12); q.x = String(c.x || '').slice(0, 15); } }
      idx.ok[f] = q; continue;
    }
    const S = states[f]; if (!S) break;
    const present = V.presentOf(S.st, S.raw);
    let cur = idx.vc[f] && idx.vc[f].k === o.t ? idx.vc[f].t : 0, found = null;
    for (let page = 0; page < 30 && !found && Date.now() - T0 < LIMIT; page++) {
      const v = await rest('clear/' + f, { orderBy: 't', startAt: cur + 1, limitToFirst: 10 });
      const list = Object.entries(v || {}).map(([id, c]) => Object.assign({ id }, c)).filter(c => typeof c.t === 'number' && c.t > cur).sort((a, b) => a.t - b.t);
      if (!list.length) break;
      for (const c of list) { if (V.verifyClear(floors[f - 1], c, present, S.raw)) { found = c; break; } cur = c.t; }
      if (list.length < 10) break;
    }
    if (!found) { const all = await rest('clear/' + f, { orderBy: 't', limitToFirst: 60 }).catch(() => null); const L = Object.entries(all || {}).map(([id, c]) => Object.assign({ id }, c)).filter(c => typeof c.t === 'number').sort((a, b) => a.t - b.t); if (V.manyClears(L)) found = L.find(c => c.id === o.id) || L[0]; }
    idx.vc[f] = { t: cur, k: o.t };
    if (!found) break;
    idx.ok[f] = { t: o.t, ct: found.t, id: found.id, n: String(found.n || '名無し').slice(0, 12), w: found.id === o.id ? o.w : String(found.w || '').slice(0, 12), x: found.id === o.id ? o.x : String(found.x || '').slice(0, 15) };
  }
  let L = 1; while (L <= 100 && idx.ok[L]) L++; idx.vtop = Math.min(101, L);
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(idx));
  // 卒業生：第100層を越えた記録を、古い順に再生して確かめ、本物だけ並べる（ノートの最後のページ）
  const gfile = path.join(OUT, 'grads.json'), G0 = readJ(gfile, { cur: 0, list: [] }), G = G0.ver === SVER ? G0 : { cur: 0, list: [], ver: SVER };
  if (states[100] && idx.ok[100]) {
    const present = V.presentOf(states[100].st, states[100].raw);
    for (let page = 0; page < 30 && Date.now() - T0 < LIMIT; page++) {
      const v = await rest('clear/100', { orderBy: 't', startAt: G.cur + 1, limitToFirst: 10 });
      const list = Object.entries(v || {}).map(([id, c]) => Object.assign({ id }, c)).filter(c => typeof c.t === 'number' && c.t > G.cur).sort((a, b) => a.t - b.t);
      if (!list.length) break;
      for (const c of list) { if (V.verifyClear(floors[99], c, present)) G.list.push({ id: c.id, t: c.t, n: String(c.n || '名無し').slice(0, 12), w: String(c.w || '').slice(0, 12), x: String(c.x || '').slice(0, 15) }); G.cur = c.t; }
      if (list.length < 10) break;
    }
    // 書いて15分のあいだは、名前とXのIDを読みなおす
    for (const g of G.list) if (Date.now() - g.t < 20 * 60000) { const [w, x] = await Promise.all([rest('clear/100/' + g.id + '/w').catch(() => null), rest('clear/100/' + g.id + '/x').catch(() => null)]); if (typeof w === 'string') g.w = w.slice(0, 12); if (typeof x === 'string') g.x = x.slice(0, 15); }
  }
  // 管理人が「名無し」にした卒業生
  const gb = await rest('gb').catch(() => null);
  for (const g of G.list) if (gb && gb[g.id]) { g.n = '名無し'; g.w = ''; g.x = ''; }
  G.at = at; fs.writeFileSync(gfile, JSON.stringify(G));
  console.log('確かめ済みの高さ', idx.vtop, '開いた', Object.keys(idx.open).length, '層ファイル', Object.keys(idx.floors).length, '卒業生', G.list.length, 'かかった時間', ((Date.now() - T0) / 1000).toFixed(1) + '秒');
})().catch(e => { console.error(e); process.exit(1); });
