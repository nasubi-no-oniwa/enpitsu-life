// =============================================
//  エンピツライフ  ずる対策の確かめ（ゲームの端末・裏の計算役・GitHubのまとめ役で同じ計算）
//   ・鉛筆：死んだ挑戦の操作を、その挑戦の始まりの鉛筆で再生して、本当にその場所に刺さる（積み重なる）ものだけ数える
//     （始まりの鉛筆は、そのときまでに確かめた鉛筆の中にあること。本数も、確かめた本数以下であること）
//   ・越えた記録：操作を再生して、本当に鉛筆立てに入るものだけ認める
// =============================================
(function (G) {
  const FT = G.FT;
  const V = FT.V = {};
  V.DMAX = 120 * 60 * 6;   // 1つの挑戦を再生する長さの上限（6分）
  // 始まりの鉛筆が、確かめた鉛筆の中にあるか（present：{ 場所: 本数 }）
  //  赤い線より上の分は数えない（同時に積まれて、端末にはそれより多く見えていたことがあるため）
  function snapOk(snap, present, lv) {
    for (const [k, c] of snap) { const need = Math.min(c.n, FT.capOf(lv, k)); if (need <= 0) continue; const q = present[k]; if (!q || need > q) return false; }
    return true;
  }
  V.snapOk = snapOk;
  // 1つの鉛筆の記録：'ok' / 'snap' / 'replay' / 'long' / 'nodata' / 'cap'
  V.verifyDeath = function (lv, it, present) {
    if (!it || typeof it.r !== 'string' || typeof it.c !== 'string' || !(it.k >= 1) || typeof it.p !== 'string') return 'nodata';
    if (it.k > V.DMAX) return 'long';
    const snap = FT.corParse(it.c);
    if (!snapOk(snap, present, lv)) return 'snap';
    const r = FT.replay(lv, snap, it.r, (it.k | 0) + 2);
    if (!(r.over && !r.clear && r.place && r.place.k >= 0 && String(r.place.k) === it.p)) return 'replay';
    // 積み重ねる上限（赤い線）をこえていないか
    const tx = Math.floor(FT.colX(FT.kcol(r.place.k)));
    if ((present[it.p] || 0) + 1 > Math.max(1, lv.cap[tx] | 0)) return 'cap';
    return 'ok';
  };
  // まとめて確かめる。budget：計算する動きの量
  V.verifyDeaths = function (lv, items, present, bad, budget) {
    const add = [], badInc = {}; let i = 0;
    present = Object.assign({}, present);
    for (; i < items.length; i++) {
      const it = items[i];
      if (((bad[it.u] || 0) + (badInc[it.u] || 0)) >= 3) continue;
      if (budget <= 0) break;
      if (!(it.k <= V.DMAX)) continue;
      budget -= Math.max(1, it.k | 0);
      const res = V.verifyDeath(lv, it, present);
      if (res === 'ok') { present[it.p] = (present[it.p] || 0) + 1; add.push(it.p); }
      else if (res === 'replay') badInc[it.u] = (badInc[it.u] || 0) + 1;
    }
    return { done: i, add, badInc };
  };
  // 越えた記録が本当か
  V.verifyClear = function (lv, c, present) {
    if (!c || typeof c.r !== 'string' || typeof c.c !== 'string' || typeof c.t !== 'number' || !(c.k >= 1)) return false;
    const snap = FT.corParse(c.c);
    if (!snapOk(snap, present, lv)) return false;
    const r = FT.replay(lv, snap, c.r, Math.min(120 * 60 * 10, (c.k | 0) + 2));
    return r.clear;
  };
  // ---------- 1つの層の確かめの状態 ----------
  //  st：{ t：どこまで確かめたか, ti：その時刻で終えた記録, P：{場所: 確かめた本数}, bad：{匿名ID: だめな数} }
  V.newState = () => ({ t: 0, ti: [], P: {}, bad: {} });
  // 確かめた鉛筆（present の形：{ 場所: 本数 }）。データベースの本数より多くはしない
  V.presentOf = (st, raw) => { const o = {}; for (const k in st.P) { const c = raw[k]; if (c) o[k] = Math.min(30, st.P[k], c.n | 0 || 1); } return o; };
  // 時刻の順に、確かめる（getRec：drec を読む関数）
  V.advance = async function (lv, st, raw, items, getRec, opt) {
    opt = opt || {};
    const until = Date.now() + (opt.ms || 6000);
    let i = 0;
    while (i < items.length) {
      let part = items.slice(i, i + 200);
      const need = part.filter(d => (st.bad[d.u] || 0) < 3 && d.r === undefined && !d._got);
      const miss = new Set();
      for (let j = 0; j < need.length; j += 24) await Promise.all(need.slice(j, j + 24).map(d => getRec(d.id).then(x => { d._got = 1; if (x && typeof x === 'object') { d.r = x.r; d.c = x.c; d.k = x.k; } }).catch(() => miss.add(d.id))));
      if (miss.size) { const cut = part.findIndex(d => miss.has(d.id)); part = part.slice(0, cut); if (!part.length) break; }
      const present = V.presentOf(st, raw);
      const res = opt.run ? await opt.run(lv, part, present, st.bad, 120 * 60 * 20) : V.verifyDeaths(lv, part, present, st.bad, 120 * 60 * 20);
      if (!res || !(res.done >= 0)) break;
      for (const u in res.badInc) st.bad[u] = (st.bad[u] || 0) + res.badInc[u];
      for (const p of res.add) st.P[p] = (st.P[p] || 0) + 1;
      for (let j = 0; j < res.done; j++) { const d = part[j]; if (d.t !== st.t) { st.t = d.t; st.ti = []; } st.ti.push(d.id); }
      i += res.done;
      if (opt.save) opt.save(st);
      if (miss.size || res.done === 0 || Date.now() > until) break;
    }
    return { more: i < items.length, rest: items.slice(i) };
  };
  // 新しい記録だけにしぼる（前に確かめた所より後）
  V.newItems = (st, v) => Object.entries(v || {}).map(([id, d]) => Object.assign({ id }, d)).filter(d => d && d.v === 1 && typeof d.t === 'number' && (d.t > st.t || (d.t === st.t && !st.ti.includes(d.id))) && typeof d.p === 'string' && typeof d.u === 'string').sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : 1));
  // 見せる鉛筆：確かめた鉛筆 ＋ まだ確かめていない鉛筆（だめな記録の多いIDの分は見せない）
  V.shown = (st, raw, rest, lv) => {
    const out = new Map();
    const pend = {};
    for (const d of rest || []) if ((st.bad[d.u] || 0) < 3) pend[d.p] = (pend[d.p] || 0) + 1;
    const keys = new Set([...Object.keys(st.P), ...Object.keys(pend)]);
    for (const k of keys) { const c = raw[k]; if (!c) continue; const n = Math.min(30, c.n | 0 || 1, (st.P[k] || 0) + (pend[k] || 0), FT.capOf(lv, +k)); if (n > 0) out.set(+k, { n, name: String(c.l || '名無し').slice(0, 12), t: c.t || 0 }); }
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
