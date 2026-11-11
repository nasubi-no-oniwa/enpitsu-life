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
    for (const [k, c] of snap) { if (!FT.keyOk(lv, k)) continue; const need = Math.min(c.n, FT.capOf(lv, k)); if (need <= 0) continue; const q = present[k]; if (!q || need > q) return false; }
    return true;
  }
  V.snapOk = snapOk;
  // 再生に使う鉛筆：始まりの鉛筆のうち、確かめ済みの本数まで（赤い線まで・はみ出した山は除く）
  //  確かめていない鉛筆は再生に入れない（ずるで足した鉛筆は使えない）。それでも同じ場所に刺されば、その記録は本物
  //  （前は、始まりの鉛筆が1本でも確かめ済みでないと記録ごと通らず、それを足場にしていない記録までつられて通らなかった）
  V.trustSnap = (lv, snap, present) => {
    const m = new Map(); let cut = false;
    for (const [k, c] of snap) {
      if (!FT.keyOk(lv, k)) { cut = true; continue; }
      const n = Math.min(c.n, FT.capOf(lv, k), present[k] || 0);
      if (n < c.n) cut = true;
      if (n > 0) m.set(k, { n, name: '' });
    }
    return { m, cut };
  };
  // 前の版の決まりが関わる記録か（赤い線より上の鉛筆・はみ出した鉛筆が始まりにある、またははみ出した場所に刺さった）
  //  今の決まりで再生すると合わないことがあるが、ずるではないので「だめ」の数には入れない（その鉛筆は数えない）
  V.oldRec = (lv, snap, p) => { if (!FT.keyOk(lv, +p)) return true; for (const [k, c] of snap) if (c.n > FT.capOf(lv, k) || !FT.keyOk(lv, k)) return true; return false; };
  // 1つの鉛筆の記録：'ok' / 'snap'（確かめていない鉛筆を足場にしていた） / 'replay' / 'long' / 'nodata' / 'cap' / 'old'（前の版のはみ出し）
  V.verifyDeath = function (lv, it, present) {
    if (!it || typeof it.r !== 'string' || typeof it.c !== 'string' || !(it.k >= 1) || typeof it.p !== 'string') return 'nodata';
    if (it.k > V.DMAX) return 'long';
    const snap = FT.corParse(it.c), ts = V.trustSnap(lv, snap, present);
    const r = FT.replay(lv, ts.m, it.r, (it.k | 0) + 2);
    // 合わない：確かめていない鉛筆を足場にしていた（'snap'）・前の版のはみ出し（'old'）は、だめの数に入れない
    if (!(r.over && !r.clear && r.place && r.place.k >= 0 && String(r.place.k) === it.p)) return ts.cut ? 'snap' : (V.oldRec(lv, snap, it.p) ? 'old' : 'replay');
    // 積み重ねる上限（赤い線）をこえていないか
    const tx = Math.floor(FT.colX(FT.kcol(r.place.k)));
    if ((present[it.p] || 0) + 1 > Math.max(1, lv.cap[tx] | 0)) return 'cap';
    return 'ok';
  };
  // まとめて確かめる。budget：計算する動きの量
  V.verifyDeaths = function (lv, items, present, bad, budget) {
    const add = [], addS = [], badInc = {}; let i = 0;
    present = Object.assign({}, present);
    for (; i < items.length; i++) {
      const it = items[i];
      if (((bad[it.u] || 0) + (badInc[it.u] || 0)) >= 3) continue;
      if (budget <= 0) break;
      if (!(it.k <= V.DMAX)) continue;
      budget -= Math.max(1, it.k | 0);
      const res = V.verifyDeath(lv, it, present);
      if (res === 'ok') { present[it.p] = (present[it.p] || 0) + 1; add.push(it.p); addS.push(Math.max(0, Math.min(8, it.s | 0))); }
      else if (res === 'replay') badInc[it.u] = (badInc[it.u] || 0) + 1;
    }
    return { done: i, add, addS, badInc };
  };
  // データベースにある鉛筆の数（{ 場所: 本数 }・30本まで）
  V.dbOf = raw => { const o = {}; for (const k in raw || {}) { const c = raw[k]; if (c) o[k] = Math.min(30, c.n | 0 || 1); } return o; };
  // 越えた記録が本当か：まず確かめ済みの鉛筆だけで再生し、届かなければ、データベースにある鉛筆（その人に見えていた本数まで・赤い線まで）で再生する
  //  （確かめ済みの鉛筆だけにすると、ほかの人の記録のずれにつられて、正しく越えた記録まで通らず、次の層が開かないことがあった）
  V.verifyClear = function (lv, c, present, raw) {
    if (!c || typeof c.r !== 'string' || typeof c.c !== 'string' || typeof c.t !== 'number' || !(c.k >= 1)) return false;
    const snap = FT.corParse(c.c), lim = Math.min(120 * 60 * 10, (c.k | 0) + 2);
    if (FT.replay(lv, V.trustSnap(lv, snap, present).m, c.r, lim).clear) return true;
    return !!raw && FT.replay(lv, V.trustSnap(lv, snap, V.dbOf(raw)).m, c.r, lim).clear;
  };
  // 越えた記録がどれも再生で合わなくても、ちがう人が3人以上越えていれば、その層は越えられたとみなす（管理人が確かめなくても先へ進めるように）
  V.CLEAR_PEOPLE = 3;
  V.manyClears = list => new Set((list || []).filter(c => c && typeof c.u === 'string' && typeof c.t === 'number').map(c => c.u)).size >= V.CLEAR_PEOPLE;
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
      // 確かめた鉛筆の数と、それぞれの輝き（S：場所ごとに、下から順の輝きの文字列。0〜8）
      st.S = st.S || {};
      res.add.forEach((p, j) => { st.P[p] = (st.P[p] || 0) + 1; st.S[p] = ((st.S[p] || '') + ((res.addS && res.addS[j]) | 0).toString(36)).slice(0, 30); });
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
    const pend = {}, pendS = {};
    for (const d of rest || []) if ((st.bad[d.u] || 0) < 3) { pend[d.p] = (pend[d.p] || 0) + 1; pendS[d.p] = (pendS[d.p] || '') + (Math.max(0, Math.min(8, d.s | 0))).toString(36); }
    const keys = new Set([...Object.keys(st.P), ...Object.keys(pend)]);
    for (const k of keys) {
      const c = raw[k]; if (!c || !FT.keyOk(lv, +k)) continue;
      const n = Math.min(30, c.n | 0 || 1, (st.P[k] || 0) + (pend[k] || 0), FT.capOf(lv, +k));
      // sh：下から順の、鉛筆ごとの輝き（確かめた分のあとに、確かめ中の分）
      const sh = (((st.S && st.S[k]) || '').padEnd(st.P[k] || 0, '0') + (pendS[k] || '')).slice(0, n);
      if (n > 0) out.set(+k, { n, name: String(c.l || '名無し').slice(0, 12), t: c.t || 0, sh });
    }
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
