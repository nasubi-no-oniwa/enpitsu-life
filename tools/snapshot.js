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
  const idx = { at, top: Math.min(101, mTop + 1), end: end && typeof end === 'object' ? end : null, ckpt: typeof ckpt === 'number' ? ckpt : null, open: {}, stat: STAT, ok: {}, floors: Object.assign({}, prevIdx.floors || {}), vc: Object.assign({}, prevIdx.vc || {}) };
  for (const f in OPEN) idx.open[f] = { t: OPEN[f].t, n: String(OPEN[f].n || '').slice(0, 12), x: String(OPEN[f].x || '').slice(0, 15), id: OPEN[f].id };
  const top = Math.min(100, idx.top), states = {};
  for (let f = 1; f <= top; f++) {
    const file = path.join(OUT, 'f' + f + '.json'), prev = readJ(file, null);
    const rmKey = ((RM[f] && RM[f].t) || 0) + '_' + ((RS[f] && RS[f].t) || 0);
    let raw = {}, st = V.newState(), since = 0;
    if (prev && prev.rmKey === rmKey) { raw = prev.raw || {}; st = prev.st || st; since = Math.max(0, (prev.at || 0) - 120000); }
    const active = !prev || prev.rmKey !== rmKey || ((STAT[f] && STAT[f].d) || 0) !== (prev.d || 0) || f === top;
    if (active && Date.now() - T0 < LIMIT) {
      const v = since ? await rest('cells/' + f, { orderBy: 't', startAt: since }) : await rest('cells/' + f);
      for (const k in v || {}) if (v[k]) raw[k] = { n: v[k].n, l: v[k].l, t: v[k].t };
      const items = V.newItems(st, await rest('dlog/' + f, { orderBy: 't', startAt: st.t }));
      await V.advance(floors[f - 1], st, raw, items, id => rest('drec/' + f + '/' + id), { ms: Math.max(1000, LIMIT - (Date.now() - T0)) });
      const out = { at, f, rmKey, d: (STAT[f] && STAT[f].d) || 0, raw, st: { t: st.t, ti: st.ti, P: st.P, bad: st.bad } };
      fs.writeFileSync(file, JSON.stringify(out)); idx.floors[f] = at;
      states[f] = { st, raw };
    } else if (prev) states[f] = { st: prev.st, raw: prev.raw };
  }
  // 越えた記録を確かめる：下の層から順に
  const prevOk = prevIdx.ok || {};
  for (let f = 1; f <= 100; f++) {
    const o = idx.open[f]; if (!o) break;
    if (idx.ckpt !== null && f <= idx.ckpt) { idx.ok[f] = { t: o.t, id: o.id, n: o.n, x: o.x }; continue; }
    if (prevOk[f] && prevOk[f].t === o.t) { idx.ok[f] = Object.assign({}, prevOk[f], { x: prevOk[f].id === o.id ? o.x : prevOk[f].x }); continue; }
    const S = states[f]; if (!S) break;
    const present = V.presentOf(S.st, S.raw);
    let cur = idx.vc[f] && idx.vc[f].k === o.t ? idx.vc[f].t : 0, found = null;
    for (let page = 0; page < 30 && !found && Date.now() - T0 < LIMIT; page++) {
      const v = await rest('clear/' + f, { orderBy: 't', startAt: cur + 1, limitToFirst: 10 });
      const list = Object.entries(v || {}).map(([id, c]) => Object.assign({ id }, c)).filter(c => typeof c.t === 'number' && c.t > cur).sort((a, b) => a.t - b.t);
      if (!list.length) break;
      for (const c of list) { if (V.verifyClear(floors[f - 1], c, present)) { found = c; break; } cur = c.t; }
      if (list.length < 10) break;
    }
    idx.vc[f] = { t: cur, k: o.t };
    if (!found) break;
    idx.ok[f] = { t: o.t, id: found.id, n: String(found.n || '名無し').slice(0, 12), x: String(found.x || '').slice(0, 15) };
  }
  let L = 1; while (L <= 100 && idx.ok[L]) L++; idx.vtop = Math.min(101, L);
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(idx));
  console.log('確かめ済みの高さ', idx.vtop, '開いた', Object.keys(idx.open).length, '層ファイル', Object.keys(idx.floors).length, 'かかった時間', ((Date.now() - T0) / 1000).toFixed(1) + '秒');
})().catch(e => { console.error(e); process.exit(1); });
