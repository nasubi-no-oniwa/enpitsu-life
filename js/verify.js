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
    const r = FT.replay(lv, ts.m, it.r, (it.k | 0) + 2, q => q.over && !q.clear && q.place && String(q.place.k) === it.p);
    // 合わない：確かめていない鉛筆を足場にしていた（'snap'）・前の版のはみ出し（'old'）は、だめの数に入れない
    if (!(r.over && !r.clear && r.place && r.place.k >= 0 && String(r.place.k) === it.p)) return ts.cut ? 'snap' : (V.oldRec(lv, snap, it.p) ? 'old' : 'replay');
    // 積み重ねる上限（赤い線）をこえていないか
    const tx = Math.floor(FT.colX(FT.kcol(r.place.k)));
    if ((present[it.p] || 0) + 1 > Math.max(1, lv.cap[tx] | 0)) return 'cap';
    return 'ok';
  };
  // 足りなかった山（{場所: 要る本数} の組）：始まりに見えていた本数に、確かめ済みが届いていない所
  V.lackOf = (lv, it, present) => { const out = []; for (const [k, c] of FT.corParse(it.c || '')) { if (!FT.keyOk(lv, k)) continue; const need = Math.min(c.n, FT.capOf(lv, k)); if (need > (present[k] || 0)) out.push([k, need]); } return out; };
  // 待ちの記録を、どれだけの間・何件まで取っておくか
  V.WAIT_MS = 15 * 60000; V.WAIT_MAX = 150;
  // まとめて確かめる。budget：計算する動きの量
  //  wait：足場の鉛筆がまだ確かめられていなくて通らなかった記録（'snap'）。あとからその鉛筆が確かめられたら、もう一度確かめる
  //  （記録の届く順番が、実際に刺さった順番と入れかわることがある。前は、そのまま後ろの記録まで連鎖して数えられなかった）
  V.verifyDeaths = function (lv, items, present, bad, budget, wait) {
    const add = [], addS = [], badInc = {}; let i = 0, lastT = 0;
    present = Object.assign({}, present);
    const W = (wait || []).filter(w => w && Array.isArray(w.lack)).map(w => Object.assign({}, w));
    const okNow = it => { present[it.p] = (present[it.p] || 0) + 1; add.push(it.p); addS.push(Math.max(0, Math.min(8, it.s | 0))); };
    // 確かめ済みが増えた山を足場にして待っていた記録を、もう一度確かめる（それで通った鉛筆が、また別の待ちを通すことがある）
    const wake = key => {
      const q = [String(key)];
      while (q.length && W.length) {
        const k = q.shift();
        for (let j = 0; j < W.length; j++) {
          const w = W[j];
          if (!w.lack.some(x => String(x[0]) === k)) continue;
          if (!w.lack.every(x => (present[x[0]] || 0) >= x[1])) continue;
          if (budget <= 0) return;
          budget -= Math.max(1, w.k | 0); w.n = (w.n | 0) + 1;
          const res = V.verifyDeath(lv, w, present);
          if (res === 'ok') { W.splice(j, 1); j--; okNow(w); q.push(String(w.p)); }
          else if (res === 'snap' && w.n < 6) w.lack = V.lackOf(lv, w, present);
          else { W.splice(j, 1); j--; }
        }
      }
    };
    for (; i < items.length; i++) {
      const it = items[i];
      lastT = Math.max(lastT, it.t || 0);
      if (((bad[it.u] || 0) + (badInc[it.u] || 0)) >= 3) continue;
      if (budget <= 0) break;
      if (!(it.k <= V.DMAX)) continue;
      budget -= Math.max(1, it.k | 0);
      const res = V.verifyDeath(lv, it, present);
      if (res === 'ok') { okNow(it); wake(it.p); }
      else if (res === 'replay') badInc[it.u] = (badInc[it.u] || 0) + 1;
      else if (res === 'snap') { const lack = V.lackOf(lv, it, present); if (lack.length) W.push({ id: it.id, p: it.p, u: it.u, t: it.t, r: it.r, c: it.c, k: it.k, s: it.s | 0, lack, n: 0 }); }
    }
    // 古すぎる待ちは捨てる（ずっと足場が確かめられないものは、本当に足場がなかった）
    const keep = W.filter(w => !lastT || w.t >= lastT - V.WAIT_MS).slice(-V.WAIT_MAX);
    return { done: i, add, addS, badInc, wait: keep };
  };
  // データベースにある鉛筆の数（{ 場所: 本数 }・30本まで）
  V.dbOf = raw => { const o = {}; for (const k in raw || {}) { const c = raw[k]; if (c) o[k] = Math.min(30, c.n | 0 || 1); } return o; };
  // 越えた記録が本当か：まず確かめ済みの鉛筆だけで再生し、届かなければ、データベースにある鉛筆（その人に見えていた本数まで・赤い線まで）で再生する
  //  （確かめ済みの鉛筆だけにすると、ほかの人の記録のずれにつられて、正しく越えた記録まで通らず、次の層が開かないことがあった）
  V.verifyClear = function (lv, c, present, raw) {
    if (!c || typeof c.r !== 'string' || typeof c.c !== 'string' || typeof c.t !== 'number' || !(c.k >= 1)) return false;
    const snap = FT.corParse(c.c), lim = Math.min(120 * 60 * 10, (c.k | 0) + 2);
    if (FT.replay(lv, V.trustSnap(lv, snap, present).m, c.r, lim, q => q.clear).clear) return true;
    return !!raw && FT.replay(lv, V.trustSnap(lv, snap, V.dbOf(raw)).m, c.r, lim, q => q.clear).clear;
  };
  // 越えた記録がどれも再生で合わなくても、ちがう人が3人以上越えていれば、その層は越えられたとみなす（管理人が確かめなくても先へ進めるように）
  V.CLEAR_PEOPLE = 3;
  V.manyClears = list => new Set((list || []).filter(c => c && typeof c.u === 'string' && typeof c.t === 'number').map(c => c.u)).size >= V.CLEAR_PEOPLE;
  // ---------- 1つの層の確かめの状態 ----------
  //  st：{ t：どこまで確かめたか, ti：その時刻で終えた記録, P：{場所: 確かめた本数}, bad：{匿名ID: だめな数} }
  V.newState = () => ({ t: 0, ti: [], P: {}, bad: {}, W: [] });
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
      const res = opt.run ? await opt.run(lv, part, present, st.bad, 120 * 60 * 20, st.W || []) : V.verifyDeaths(lv, part, present, st.bad, 120 * 60 * 20, st.W || []);
      if (!res || !(res.done >= 0)) break;
      for (const u in res.badInc) st.bad[u] = (st.bad[u] || 0) + res.badInc[u];
      if (Array.isArray(res.wait)) st.W = res.wait;
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
