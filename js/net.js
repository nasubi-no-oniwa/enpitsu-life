// =============================================
//  エンピツライフ  みんなとつながる（Firebase ft-blue の el の下）
//
//  データの形（el/ の下）
//   cells/{層}/{場所}  : { n：積み重なった本数, s：0, l：最初に刺さった鉛筆の名前, t：時刻, g：記録の番号 }
//   dlog/{層}/{番号}   : { p：場所, u：匿名ID, t, v：1, s：0, b：0 }     だれがどこに鉛筆を置いたか（軽い）
//   drec/{層}/{番号}   : { r：操作の記録, c：始まりの鉛筆, k：死ぬまでの時間 }   再生用（重いので要る分だけ読む）
//   stat/{層}          : { d：死んだ数, c：越えた数, m：一番先まで行った割合（0〜1000） }
//   clear/{層}/{番号}  : { n：名前, x：XのID, t, r, c, k, u, s, b }   越えた記録
//   open/{層}          : { t, n, x, id, u, w：本人が書いた名前 }   その層をはじめて越えた（次の層が開いた）。一番乗りノートに載る
//   end                : { t, w }   ゲームの終わり（管理人が入れる。入ると書きこめなくなる）
//   u/{匿名ID}          : { c：最後に死んだ時刻, k：最後に越えた時刻, p：最後に書いた時刻, r：最後の詰みの知らせ, w/{層} }
//   rm/{層}・reset/{層} : { t }   管理人が鉛筆を取り除いた・層を消した時刻
//   board/{番号}       : 掲示板 { n, m, t, u, s：0, l：言葉, f：いちばん先の層 }   pin：管理人のお知らせ
//   live/{番号}        : 配信中の人   rep/{層}/{番号}：詰みの知らせ   ask/{番号}：管理人への相談（どちらも管理人だけ読める）
//   ckpt               : 管理人が「ここまでは本物」と確かめた層
//  管理のかぎは Fairies' Tower と同じ（ft_admin/key・ft_admins）
//
//  通信を減らす工夫
//   ・常時接続を使わない。死んだ記録はまとめて送る（最大6本・8秒ごと）
//   ・GitHub に置いた「まとめ」（data/snap/）を先に読み、データベースからは、それより新しい分だけ読む
//   ・遊んでいる間の読みなおしは20秒に1回、増えた分だけ
// =============================================
(function (G) {
  const FT = G.FT, V = FT.V;
  const N = FT.NET = {};
  const P = 'el/';
  const late = ms => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const store = (k, v) => { try { if (typeof localStorage === 'undefined') return null; if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } };
  N.store = store;
  N.frozen = false;
  const cfg = () => G.EL_CONFIG || null;
  N.ready = () => { const c = cfg(); return !!(c && c.apiKey && c.databaseURL); };
  const DB = () => cfg().databaseURL.replace(/\/$/, '');
  const NS = () => cfg().ns ? '&ns=' + cfg().ns : '';
  // ---------- 名乗り（匿名） ----------
  const AUTH = G.FT_AUTHURL || { up: 'https://identitytoolkit.googleapis.com/v1/accounts:signUp', ref: 'https://securetoken.googleapis.com/v1/token' };
  const T = {};
  async function signIn() {
    const key = cfg().apiKey, sk = 'el_auth', saved = store(sk);
    if (saved && saved.rt) {
      const r = await Promise.race([fetch(AUTH.ref + '?key=' + key, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(saved.rt) }), late(12000)]);
      if (r.ok) { const j = await r.json(); T.tok = j.id_token; T.exp = Date.now() + (Math.max(300, +j.expires_in || 3600) - 240) * 1000; T.uid = j.user_id; store(sk, { rt: j.refresh_token, uid: j.user_id }); return T.tok; }
      if (r.status !== 400 && r.status !== 403) throw new Error('auth ' + r.status);
      store(sk, { rt: '' });
    }
    const r = await Promise.race([fetch(AUTH.up + '?key=' + key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"returnSecureToken":true}' }), late(12000)]);
    if (!r.ok) throw new Error('auth ' + r.status);
    const j = await r.json(); T.tok = j.idToken; T.exp = Date.now() + (Math.max(300, +j.expiresIn || 3600) - 240) * 1000; T.uid = j.localId;
    store(sk, { rt: j.refreshToken, uid: j.localId });
    return T.tok;
  }
  N.token = function (force) {
    if (!force && T.tok && Date.now() < T.exp) return Promise.resolve(T.tok);
    if (!T.p) T.p = signIn().finally(() => { T.p = null; });
    return T.p;
  };
  N.uid = () => T.uid || null;
  N.warm = () => { if (N.ready()) N.token().catch(() => { }); };
  // ---------- 通信 ----------
  const q2s = q => q ? Object.entries(q).map(([k, v]) => k + '=' + encodeURIComponent(/^(limitTo|shallow)/.test(k) ? String(v) : JSON.stringify(v))).join('&') : '';
  async function rest(path, q, root) {
    const qs = q2s(q), url = DB() + '/' + (root ? '' : P) + path + '.json' + (qs || NS() ? '?' : '') + qs + (qs ? NS() : NS().slice(1));
    const r = await Promise.race([fetch(url, { cache: 'no-store' }), late(12000)]);
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }
  N.rest = rest;
  async function restWrite(method, path, val, root) {
    for (let i = 0; ; i++) {
      const t = await N.token(i > 0);
      const r = await Promise.race([fetch(DB() + '/' + (root ? '' : P) + path + '.json?print=silent&auth=' + encodeURIComponent(t) + NS(), { method, body: JSON.stringify(val), cache: 'no-store' }), late(12000)]);
      if (r.ok) return null;
      const txt = await r.text().catch(() => '');
      if (i === 0 && r.status === 401 && /token|auth/i.test(txt) && !/permission/i.test(txt)) continue;
      const e = new Error('http ' + r.status); if (r.status === 401 || r.status === 403) e.code = 'PERMISSION_DENIED'; else if (r.status === 400) e.code = 'BAD_REQUEST'; throw e;
    }
  }
  N.restWrite = restWrite;
  async function restMe(path) { const t = await N.token(false); const r = await Promise.race([fetch(DB() + '/' + P + path + '.json?auth=' + encodeURIComponent(t) + NS(), { cache: 'no-store' }), late(12000)]); if (!r.ok) throw new Error('http ' + r.status); return r.json(); }
  N.restMe = restMe;
  // まとめて書く（場所は el/ の下。管理のかぎだけは根から）
  const update = w => { const o = {}; for (const k in w) o[k.startsWith('/') ? k.slice(1) : P + k] = w[k]; return restWrite('PATCH', '', o, true); };
  N.update = update;
  const SV = { '.sv': 'timestamp' }, INC = n => ({ '.sv': { increment: n || 1 } });
  N.SV = SV;
  const perm = e => e && (e.code === 'PERMISSION_DENIED' || e.code === 'BAD_REQUEST');
  const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let seqN = 0;
  const pid = () => { let s = Date.now().toString(36) + (seqN++ % 1296).toString(36).padStart(2, '0'); for (let i = 0; i < 9; i++) s += AZ[Math.floor(Math.random() * AZ.length)]; return s; };
  N.pid = pid;
  N.cleanName = s => String(s || '').replace(/[<>&"'\\\/.#$\[\]\n\r\t]/g, '').slice(0, 12);
  N.cleanX = s => { s = String(s || '').trim().replace(/^@/, ''); return /^[A-Za-z0-9_]{1,15}$/.test(s) ? s : ''; };
  // ---------- GitHub のまとめ ----------
  N.SNAP = (G.EL_SNAPBASE !== undefined ? G.EL_SNAPBASE : 'data/snap/');
  let snapI = null;
  N.snapIndex = async function () {
    if (snapI && Date.now() - snapI.at < 300000) return snapI.v;
    let v = null; try { const r = await Promise.race([fetch(N.SNAP + 'index.json?t=' + Math.floor(Date.now() / 300000), { cache: 'no-cache' }), late(10000)]); if (r.ok) v = await r.json(); } catch (e) { v = null; }
    snapI = { at: Date.now(), v }; return v;
  };
  async function snapFloor(f, idx) {
    if (!idx || !idx.floors || !idx.floors[f]) return null;
    try { const r = await Promise.race([fetch(N.SNAP + 'f' + f + '.json?v=' + idx.floors[f], { cache: 'force-cache' }), late(15000)]); if (r.ok) return await r.json(); } catch (e) { }
    return null;
  }
  // =============================================
  //  全体：開いた層
  // =============================================
  N.overview = async function () {
    const out = { open: {}, stat: {}, ckpt: null, okSnap: {}, snapAt: 0, end: null, rawTop: 1 };
    const idx = await N.snapIndex();
    N.frozen = !!(idx && idx.end);
    if (idx) { out.open = idx.open || {}; out.stat = idx.stat || {}; out.okSnap = idx.ok || {}; out.snapAt = idx.at || 0; out.ckpt = idx.ckpt == null ? null : idx.ckpt; out.end = idx.end || null; }
    if (N.frozen || !N.ready()) return out;
    const [end, op, ck] = await Promise.all([rest('end').catch(() => null), rest('open', { shallow: true }).catch(() => null), rest('ckpt').catch(() => null)]);
    if (end && typeof end === 'object') out.end = end;
    if (typeof ck === 'number') out.ckpt = ck;
    if (op && typeof op === 'object') { let m = 0; for (const k in op) if (+k > m && +k <= 100) m = +k; out.rawTop = Math.min(101, m + 1); }
    // まとめより上の「開いた」だけ読む
    const okTop = Object.keys(out.okSnap).length ? Math.max(...Object.keys(out.okSnap).map(Number)) : 0;
    const need = []; for (let f = Math.max(1, okTop); f < out.rawTop && f <= 100; f++) if (!out.okSnap[f]) need.push(f);
    await Promise.all(need.slice(0, 30).map(f => rest('open/' + f).then(v => { if (v && typeof v === 'object') out.open[f] = v; }).catch(() => { })));
    // 層ごとの数（死んだ数など）は、まとめより新しいものを最新の数層だけ
    const st = await Promise.all([out.rawTop - 1, out.rawTop].filter(f => f >= 1 && f <= 100).map(f => rest('stat/' + f).then(v => [f, v]).catch(() => null)));
    for (const x of st) if (x && x[1]) out.stat[x[0]] = x[1];
    return out;
  };
  N.floorStat = f => rest('stat/' + f);
  N.totalDead = async function () { const idx = await N.snapIndex(); let n = 0; if (idx && idx.stat) for (const k in idx.stat) n += (idx.stat[k] && idx.stat[k].d) || 0; return n; };
  // =============================================
  //  鉛筆を読む（まとめ＋新しい分。確かめた鉛筆と、確かめ中の鉛筆）
  // =============================================
  const DV = () => store('el_dv3') || {};
  function dvSave(f, st) { const o = DV(); o[f] = st; for (const k of Object.keys(o)) if (Math.abs(+k - f) > 3) delete o[k]; store('el_dv3', o); }
  let worker = null, wid = 0; const wcb = {};
  function getWorker() {
    if (worker !== null) return worker;
    try { if (typeof Worker === 'undefined' || typeof document === 'undefined') return (worker = false); worker = new Worker('js/worker.js?v=' + (FT.VER || '0')); worker.onmessage = ev => { const f = wcb[ev.data.id]; if (f) { delete wcb[ev.data.id]; f(ev.data); } }; worker.onerror = () => { worker = false; for (const k in wcb) { const f = wcb[k]; delete wcb[k]; f({ err: 1 }); } }; } catch (e) { worker = false; }
    return worker;
  }
  function inWorker(type, payload, sync) {
    const w = getWorker(); if (!w) return Promise.resolve(sync());
    return new Promise(res => { const id = ++wid, tm = setTimeout(() => { if (wcb[id]) { delete wcb[id]; res(sync()); } }, 120000); wcb[id] = d => { clearTimeout(tm); res(d.err ? sync() : d.res); }; try { w.postMessage(Object.assign({ type, id }, payload)); } catch (e) { clearTimeout(tm); delete wcb[id]; res(sync()); } });
  }
  N.inWorker = inWorker;
  const plainLv = lv => ({ f: lv.f, w: lv.w, h: lv.h, tiles: lv.tiles, cap: lv.cap, start: lv.start, goal: lv.goal, ents: lv.ents });
  N.plainLv = plainLv;
  const runDeaths = (lv, items, present, bad, budget) => inWorker('deaths', { lv: plainLv(lv), items: items.map(d => ({ id: d.id, p: d.p, u: d.u, t: d.t, r: d.r, c: d.c, k: d.k })), present, bad, budget }, () => V.verifyDeaths(lv, items, present, bad, budget));
  N.verifyClearAsync = (lv, c, present, raw) => inWorker('clear', { lv: plainLv(lv), c: { t: c.t, r: c.r, c: c.c, k: c.k }, present, raw: raw ? V.dbOf(raw) : null }, () => V.verifyClear(lv, c, present, raw));
  async function floorState(lv) {
    const f = lv.f;
    if (lv._F) return lv._F;
    const F = { raw: {}, maxT: 0, st: null, rmKey: '', fullAt: 0, rest: [] };
    const [rm, rs] = N.ready() && !N.frozen ? await Promise.all([rest('rm/' + f + '/t').catch(() => null), rest('reset/' + f + '/t').catch(() => null)]) : [null, null];
    F.rmKey = (rm || 0) + '_' + (rs || 0); F.rmT = Math.max(rm || 0, rs || 0); F.rmAt = Date.now();
    const idx = await N.snapIndex(), sn = await snapFloor(f, idx);
    // まとめの確かめ方の版（sv）がちがう手元の記録は使わない（古い確かめ方の結果を引きずらない）
    F.sv = (sn && sn.ver) | 0;
    const c = DV()[f];
    if (sn && sn.at > F.rmT) { F.raw = sn.raw || {}; F.maxT = Math.max(0, (sn.at || 0) - 120000); F.st = sn.st || V.newState(); }
    else F.st = V.newState();
    if (c && c.key === F.rmKey && (c.sv | 0) === F.sv && c.st && c.st.t >= F.st.t) F.st = c.st;
    if (N.ready() && !N.frozen) {
      const v = F.maxT ? await rest('cells/' + f, { orderBy: 't', startAt: F.maxT }) : await rest('cells/' + f);
      for (const k in v || {}) if (v[k]) F.raw[k] = v[k];
      F.fullAt = Date.now();
    }
    for (const k in F.raw) if (F.raw[k] && F.raw[k].t > F.maxT) F.maxT = F.raw[k].t;
    lv._F = F; return F;
  }
  async function trust(lv, ms) {
    const F = await floorState(lv), f = lv.f;
    if (!N.ready() || N.frozen) return V.shown(F.st, F.raw, [], lv);
    if (Date.now() - F.rmAt > 300000) {
      F.rmAt = Date.now();
      const [rm, rs] = await Promise.all([rest('rm/' + f + '/t').catch(() => null), rest('reset/' + f + '/t').catch(() => null)]);
      const key = (rm || 0) + '_' + (rs || 0); if (key !== F.rmKey) { lv._F = null; return trust(lv, ms); }
    }
    if (Date.now() - F.fullAt > 3000) {
      try { const v = await rest('cells/' + f, { orderBy: 't', startAt: F.maxT + 1 }); for (const k in v || {}) { if (!v[k]) continue; F.raw[k] = v[k]; if (v[k].t > F.maxT) F.maxT = v[k].t; } F.fullAt = Date.now(); } catch (e) { }
    }
    let items = null;
    try { items = V.newItems(F.st, await rest('dlog/' + f, { orderBy: 't', startAt: F.st.t })); } catch (e) { items = null; }
    if (!items) { F.more = true; return V.shown(F.st, F.raw, F.rest, lv); }
    const res = await V.advance(lv, F.st, F.raw, items, id => rest('drec/' + f + '/' + id), { ms, run: runDeaths, save: st => dvSave(f, { key: F.rmKey, st, sv: F.sv }) });
    F.rest = res.rest; F.more = res.more;
    return V.shown(F.st, F.raw, F.rest, lv);
  }
  N.trust = (lv, ms) => { const p = (lv._tp || Promise.resolve()).catch(() => { }).then(() => trust(lv, ms)); lv._tp = p; return p; };
  N.loadCells = lv => N.trust(lv, 8000);
  // 20秒ごとの読みなおし：新しい鉛筆の場所と本数だけ（再生しての確かめは、層に入るときとまとめで行う）
  N.syncCells = async function (lv, mine) {
    const F = await floorState(lv);
    if (N.ready() && !N.frozen) {
      try { const v = await rest('cells/' + lv.f, { orderBy: 't', startAt: F.maxT + 1 }); for (const k in v || {}) { if (!v[k]) continue; F.raw[k] = v[k]; if (v[k].t > F.maxT) F.maxT = v[k].t; } } catch (e) { }
    }
    const m = V.shown(F.st, F.raw, F.rest, lv);
    for (const k in F.raw) { const c = F.raw[k]; if (c && c.t > (F.st.t || 0) - 1) { const n = Math.min(30, c.n | 0 || 1, FT.capOf(lv, +k)); if (n <= 0 || !FT.keyOk(lv, +k)) continue; const cur = m.get(+k); if (!cur || cur.n < n) m.set(+k, { n, name: String(c.l || '名無し').slice(0, 12), t: c.t || 0, sh: (cur && cur.sh) || (c.s ? (c.s | 0).toString(36) : '') }); } }
    for (const [k, c] of mine || []) { const n = Math.min(c.n | 0, FT.capOf(lv, k)); if (n <= 0 || !FT.keyOk(lv, k)) continue; const cur = m.get(k); if (!cur || cur.n < n) m.set(k, Object.assign({}, c, { n })); }
    return m;
  };
  N.present = lv => lv._F ? V.presentOf(lv._F.st, lv._F.raw) : {};
  N.more = lv => !!(lv._F && lv._F.more);
  // =============================================
  //  死んだ：まとめて送る
  // =============================================
  const Q = []; let qT = 0, qBusy = false, lastC = 0;
  N.pending = () => Q.length;
  N.died = function (e) {   // e：{ f, k, n：刺さったあとの本数, name, rec, cor, ticks, m（割合）}
    if (!N.ready() || N.frozen) return Promise.resolve(false);
    return new Promise((res, rej) => { e.res = res; e.rej = rej; Q.push(e); if (!qT) qT = setTimeout(flush, 8000); if (Q.length >= 6) { clearTimeout(qT); qT = 0; flush(); } });
  };
  N.flush = () => { if (qT) { clearTimeout(qT); qT = 0; } return flush(); };
  N.statOnly = function (f, m) { return N.died({ f, k: -1, m }); };
  async function flush() {
    qT = 0; if (qBusy || !Q.length) return; qBusy = true;
    let netFail = 0;
    try {
      const wait = lastC + 800 - Date.now(); if (wait > 0) await sleep(wait);
      await N.token();
      const uid = N.uid(), batch = [], seen = new Set();
      // 前に送ったのに返事が来なかった記録：もう届いていたら送りなおさない（同じ鉛筆が2本にならないように）
      for (const e of Q.slice(0, 12)) {
        if (!e.g || !(e.k >= 0)) continue;
        const u = await rest('dlog/' + e.f + '/' + e.g + '/u');   // 通信がまだだめなら、ここで外へ（あとで送りなおす）
        if (u === uid) { Q.splice(Q.indexOf(e), 1); e.res(true); } else e.g = null;
      }
      if (!Q.length) return;
      for (const e of Q) { if (batch.length >= 6) break; const key = e.f + ':' + e.k; if (e.k >= 0 && seen.has(key)) continue; seen.add(key); batch.push(e); }
      const w = { ['u/' + uid + '/c']: SV }, per = {};
      for (const e of batch) {
        per[e.f] = per[e.f] || { d: 0, m: 0 }; per[e.f].d++; per[e.f].m = Math.max(per[e.f].m, e.m | 0);
        if (e.k < 0) continue;
        const g = pid(), cp = 'cells/' + e.f + '/' + e.k; e.g = g;
        const sh = Math.max(0, Math.min(8, e.s | 0));   // 鉛筆の輝き（死んだ回数の節目）
        if (e.n > 1) { w[cp + '/n'] = INC(); w[cp + '/t'] = SV; w[cp + '/g'] = g; }
        else w[cp] = { n: INC(), s: sh, l: N.cleanName(e.name) || '名無し', t: SV, g };
        w['dlog/' + e.f + '/' + g] = { p: String(e.k), u: uid, t: SV, v: 1, s: sh, b: 0 };
        w['drec/' + e.f + '/' + g] = { r: String(e.rec || '').slice(0, 30000), c: String(e.cor || '').slice(0, 30000), k: Math.max(1, e.ticks | 0) };
      }
      for (const f in per) { w['stat/' + f + '/d'] = INC(per[f].d); if (per[f].m > (N.mKnown[f] || 0)) w['stat/' + f + '/m'] = Math.min(1000, per[f].m); }
      let ok = false, err = null;
      for (let i = 0; i < 4 && !ok; i++) {
        try { await update(w); ok = true; }
        catch (e) {
          err = e; if (!perm(e)) break;
          // 断られた：新しい山のつもりが、もうほかの人が刺していた → 積み重ねとして送りなおす
          await Promise.all(batch.filter(e2 => e2.k >= 0 && w['cells/' + e2.f + '/' + e2.k]).map(async e2 => { const cp = 'cells/' + e2.f + '/' + e2.k, v = w[cp]; const ex = await rest(cp + '/n').catch(() => null); if (typeof ex === 'number') { delete w[cp]; w[cp + '/n'] = INC(); w[cp + '/t'] = SV; w[cp + '/g'] = v.g; } }));
          // もう赤い線（またはデータベースの上限30本）まで積まれている山：この鉛筆は残らないので送らない（ほかの記録までまとめて断られないように）
          await Promise.all(batch.filter(e2 => e2.k >= 0 && !e2.drop).map(async e2 => { const cp = 'cells/' + e2.f + '/' + e2.k; const ex = await rest(cp + '/n').catch(() => null); if (typeof ex === 'number' && ex + 1 > Math.min(30, e2.cap || 30)) { e2.drop = true; for (const kk of Object.keys(w)) if (kk === cp || kk.startsWith(cp + '/')) delete w[kk]; const g = Object.keys(w).find(kk => kk.startsWith('dlog/' + e2.f + '/') && w[kk] && w[kk].p === String(e2.k)); if (g) { const id = g.split('/')[2]; delete w['dlog/' + e2.f + '/' + id]; delete w['drec/' + e2.f + '/' + id]; } } }));
          // 積み重ねのつもりが、その山がもうない（管理人が取り除いた）→ 新しい山として送る
          await Promise.all(batch.filter(e2 => e2.k >= 0 && w['cells/' + e2.f + '/' + e2.k + '/n']).map(async e2 => { const cp = 'cells/' + e2.f + '/' + e2.k; const ex = await rest(cp + '/n').catch(() => 1); if (ex === null) { const g = w[cp + '/g']; delete w[cp + '/n']; delete w[cp + '/t']; delete w[cp + '/g']; w[cp] = { n: INC(), s: Math.max(0, Math.min(8, e2.s | 0)), l: N.cleanName(e2.name) || '名無し', t: SV, g }; } }));
          for (const f in per) delete w['stat/' + f + '/m'];
          await sleep(900 + Math.random() * 600);
          w['u/' + uid + '/c'] = SV;
        }
      }
      lastC = Date.now();
      if (!ok && !perm(err)) {
        // 通信が切れた・返事が来ない：捨てずに、少し待って送りなおす（届いていたかは、次に送る前に確かめる）
        for (const e of batch) { e.tries = (e.tries || 0) + 1; if (e.tries >= 6) { Q.splice(Q.indexOf(e), 1); e.rej(err || new Error('send')); } }
        netFail = Math.max(1, ...batch.map(e => e.tries || 1));
      } else {
        for (const e of batch) { Q.splice(Q.indexOf(e), 1); if (ok) e.res(!e.drop); else e.rej(err || new Error('send')); }
        if (ok) for (const f in per) N.mKnown[f] = Math.max(N.mKnown[f] || 0, per[f].m);
      }
    } catch (e) {
      // 鍵が取れない・通信がだめ：これも、あとで送りなおす
      for (const x of Q.slice(0, 6)) { x.tries = (x.tries || 0) + 1; if (x.tries >= 6) { Q.splice(Q.indexOf(x), 1); x.rej(e); } }
      netFail = 3;
    } finally { qBusy = false; if (Q.length) qT = setTimeout(flush, netFail ? Math.min(30000, 1000 * Math.pow(2, netFail)) : 1000); }
  }
  N.mKnown = {};
  // =============================================
  //  越えた
  // =============================================
  let lastK = 0;
  N.clear = async function (lv, o) {   // o：{ name, rec, cor, ticks }
    const f = lv.f; await N.flush().catch(() => { });
    const wait = lastK + 4300 - Date.now(); if (wait > 0) await sleep(wait);
    await N.token(); const uid = N.uid();
    for (let i = 0; i < 5; i++) {
      const [op, wn] = await Promise.all([rest('open/' + f).catch(() => null), restMe('u/' + uid + '/w/' + f).catch(() => null)]);
      const full = !(+wn >= 3);
      const w = { ['u/' + uid + '/k']: SV, ['stat/' + f + '/c']: INC(), ['stat/' + f + '/m']: 1000 };
      let id = null, opened = false;
      if (full) {
        id = pid(); w['clear/' + f + '/' + id] = { n: N.cleanName(o.name) || '名無し', x: '', t: SV, r: o.rec, c: o.cor, k: o.ticks, u: uid, s: 0, b: 0 };
        w['u/' + uid + '/w/' + f] = (+wn || 0) + 1;
        if (!op) { w['open/' + f] = { t: SV, n: N.cleanName(o.name) || '名無し', x: '', id, u: uid }; opened = true; }
      }
      try { await update(w); lastK = Date.now(); return { id, opened }; }
      catch (e) { lastK = Date.now(); if (!perm(e)) throw e; await sleep(4400 + Math.random() * 800); }
    }
    throw new Error('混みあっています');
  };
  // 一番乗りノートに名前（w）とXのID（x）を書く。opened：その層をはじめて越えた（open にも書く）
  N.setFirst = async function (f, id, w, x, opened) {
    w = N.cleanName(w); x = N.cleanX(x);
    const jobs = [];
    if (w) jobs.push(update({ ['clear/' + f + '/' + id + '/w']: w }));
    if (x) jobs.push(update({ ['clear/' + f + '/' + id + '/x']: x }));
    if (opened && w) jobs.push(update({ ['open/' + f + '/w']: w }));
    if (opened && x) jobs.push(update({ ['open/' + f + '/x']: x }));
    if (!jobs.length) return { ok: 0 };
    const r = await Promise.allSettled(jobs), ok = r.filter(v => v.status === 'fulfilled').length;
    if (!ok) throw r[0].reason;
    return { ok, all: ok === jobs.length };
  };
  // 卒業生（第100層を越えた人。まとめ作りが15分ごとに確かめて作る）
  N.grads = async function () {
    try { const r = await Promise.race([fetch(N.SNAP + 'grads.json?t=' + Math.floor(Date.now() / 300000), { cache: 'no-cache' }), late(10000)]); if (r.ok) return await r.json(); } catch (e) { }
    return null;
  };
  N.setXid = async function (f, id, xid, open) {
    const jobs = [update({ ['clear/' + f + '/' + id + '/x']: xid })];
    if (open) jobs.push(update({ ['open/' + f + '/x']: xid }));
    const r = await Promise.allSettled(jobs); if (r[0].status !== 'fulfilled') throw r[0].reason;
  };
  // その層を本当に越えた一番早い記録
  const VC = () => store('el_vc3') || {};
  // 鉛筆の確かめはせずに、その層の鉛筆（データベースの数）だけ読む（越えた記録を確かめるため。軽い）
  N.cellsOnly = async function (lv) {
    const F = await floorState(lv);
    if (N.ready() && !N.frozen && Date.now() - F.fullAt > 3000) {
      try { const v = await rest('cells/' + lv.f, { orderBy: 't', startAt: F.maxT + 1 }); for (const k in v || {}) { if (!v[k]) continue; F.raw[k] = v[k]; if (v[k].t > F.maxT) F.maxT = v[k].t; } F.fullAt = Date.now(); } catch (e) { }
    }
    return F;
  };
  N.firstClear = async function (lv) {
    const f = lv.f;
    // 鉛筆の確かめが終わるのを待たない（越えた記録は、データベースにある鉛筆でも確かめられるので）
    const F = lv._F, rs = F ? F.rmKey : '', done = !N.more(lv);
    const sv = (F && F.sv) | 0, vc = VC(); let cur = vc[f] && vc[f].rs === rs && (vc[f].sv | 0) === sv ? vc[f].t : 0;
    let budget = 120 * 60 * 120;
    const present = N.present(lv);
    for (let page = 0; page < 30; page++) {
      const v = await rest('clear/' + f, { orderBy: 't', startAt: cur + 1, limitToFirst: 10 });
      const list = Object.entries(v || {}).map(([id, c]) => Object.assign({ id }, c)).filter(c => typeof c.t === 'number' && c.t > cur).sort((a, b) => a.t - b.t);
      if (!list.length) break;
      for (const c of list) {
        if (budget <= 0) return { wait: true };
        budget -= Math.min(120 * 60 * 10, Math.max(1, c.k | 0));
        if (await N.verifyClearAsync(lv, c, present, F && F.raw)) return c;
        cur = c.t; if (done) { const o = VC(); o[f] = { t: cur, rs, sv }; store('el_vc3', o); }   // 確かめが終わっていないときは、あとでもう一度見る
      }
      if (list.length < 10) break;
    }
    // どれも再生で合わなくても、ちがう人が3人以上越えていれば越えられたとみなす
    try { const all = await rest('clear/' + f, { orderBy: 't', limitToFirst: 60 }); const L = Object.values(all || {}); if (V.manyClears(L)) return L.sort((a, b) => a.t - b.t)[0]; } catch (e) { }
    return null;
  };
  // 卒業の碑（第100層を越えた人）
  // =============================================
  //  詰みの知らせ（自動で走らせた判定つき）
  // =============================================
  let lastR = 0;
  // e：観戦モード用（なくてもよい）{ c：見えていた鉛筆, x・y：立っていた所 }
  N.report = async function (f, m, a, l, e) {
    if (Date.now() - lastR < 10500) throw new Error('wait');
    await N.token(); const uid = N.uid();
    const o = { t: SV, u: uid, m: Math.max(0, Math.min(1000, m | 0)), a: String(a || '').slice(0, 300), l: l || 'ja' };
    if (e) {
      if (typeof e.c === 'string' && e.c) o.c = e.c.slice(0, 30000);
      if (Number.isFinite(e.x) && Number.isFinite(e.y)) { o.x = Math.round(Math.max(-10, Math.min(5000, e.x)) * 100) / 100; o.y = Math.round(Math.max(-50, Math.min(500, e.y)) * 100) / 100; }
    }
    try { await update({ ['u/' + uid + '/r']: SV, ['rep/' + f + '/' + pid()]: o }); }
    catch (err) {
      // データベースの決まりがまだ古いとき：観戦用の中身を外して送りなおす
      if (!perm(err) || (o.c === undefined && o.x === undefined)) throw err;
      delete o.c; delete o.x; delete o.y;
      await update({ ['u/' + uid + '/r']: SV, ['rep/' + f + '/' + pid()]: o });
    }
    lastR = Date.now();
  };
  // =============================================
  //  いま遊んでいる人（同接）：見えている間、1分ごとに on/{匿名ID} に「いる」と書く。管理画面で数える
  // =============================================
  let lastPing = 0;
  N.ping = async function (f) {
    if (!N.ready() || N.frozen || Date.now() - lastPing < 20500) return;
    lastPing = Date.now();
    try { await N.token(); const uid = N.uid(); await update({ ['on/' + uid]: { t: SV, f: Math.max(0, Math.min(101, f | 0)) } }); } catch (e) { }
  };
  // 管理人：ms より新しく「いる」と書いた人（{ 匿名ID: { t, f } }）
  N.online = async function (ms) {
    const t = await N.token(false), qs = q2s({ orderBy: 't', startAt: Date.now() - (ms || 150000) });
    const r = await Promise.race([fetch(DB() + '/' + P + 'on.json?auth=' + encodeURIComponent(t) + '&' + qs + NS(), { cache: 'no-store' }), late(12000)]);
    if (!r.ok) throw new Error('http ' + r.status);
    return (await r.json()) || {};
  };
  N.reports = async function () { const v = await restMe('rep'); return v || {}; };
  N.repSeen = (f, t) => update({ ['repok/' + f]: t });
  N.repDel = f => update({ ['rep/' + f]: null });
  // =============================================
  //  管理人への相談（ask/{番号}：{ t, u, m：文, x：XのID, l：言葉, f：最前線の層 }。読めるのは管理人だけ。1人1分に1回まで）
  // =============================================
  N.ask = async function (m, x, l, f) {
    await N.token(); const uid = N.uid();
    await update({ ['u/' + uid + '/a']: SV, ['ask/' + pid()]: { t: SV, u: uid, m: String(m || '').slice(0, 300), x: N.cleanX(x), l: l || 'ja', f: Math.max(0, Math.min(101, f | 0)) } });
  };
  N.asks = async function () { const v = await restMe('ask'); return v || {}; };
  N.askDel = id => update({ ['ask/' + id]: null });
  // =============================================
  //  配信中の人（live/{id}：{ n：名前, u：配信のURL, m：ひとこと, t }。書けるのは管理人だけ）
  // =============================================
  const liveTxt = (s, n) => String(s || '').replace(/[<>&"'\\\n\r\t]/g, '').trim().slice(0, n);
  const liveUrl = s => { s = String(s || '').trim(); return /^https:\/\/[^\s<>"']{3,300}$/.test(s) ? s : ''; };
  N.liveUrl = liveUrl;
  N.live = async function () {
    if (!N.ready()) return [];
    const v = await rest('live') || {};
    return Object.entries(v).filter(([, x]) => x && typeof x === 'object').map(([id, x]) => ({ id, n: liveTxt(x.n, 20), u: liveUrl(x.u), m: liveTxt(x.m, 30), t: +x.t || 0 }))
      .filter(x => x.n && x.u).sort((a, b) => b.t - a.t).slice(0, 10);
  };
  N.liveAdd = async function (n, u, m) { n = liveTxt(n, 20); u = liveUrl(u); m = liveTxt(m, 30); if (!n || !u) throw new Error('名前とURL（https://）を入れてください'); await restWrite('PUT', 'live/' + pid(), { n, u, m, t: SV }); };
  N.liveDel = id => update({ ['live/' + id]: null });
  // =============================================
  //  掲示板
  // =============================================
  N.boardReady = () => N.ready();
  N.boardRead = async function (kind, since) {
    const v = since ? await rest('board', { orderBy: 't', startAt: since + 1, limitToFirst: 60 }) : await rest('board', { orderBy: 't', limitToLast: 40 });
    return Object.entries(v || {}).map(([id, c]) => Object.assign({ id }, c)).filter(c => c && typeof c.m === 'string' && typeof c.t === 'number').sort((a, b) => a.t - b.t);
  };
  N.boardPin = () => rest('pin').catch(() => null);
  N.boardLast = () => rest('board', { orderBy: 't', limitToLast: 1 }).then(v => { let t = 0; for (const k in v || {}) if (v[k] && v[k].t > t) t = v[k].t; return t; }).catch(() => 0);
  N.boardPost = async function (kind, o) {   // o：{ n, m, l, f }
    await N.token(false); const uid = N.uid(), id = pid();
    const post = { n: N.cleanName(o.n) || '名無し', m: String(o.m).slice(0, 120), t: SV, u: uid, s: 0, l: o.l, f: Math.max(0, Math.min(101, o.f | 0)) };
    await update({ ['u/' + uid + '/p']: SV, ['board/' + id]: post });
    return id;
  };
  N.boardReport = async function (kind, id) {
    await N.token(false); const uid = N.uid();
    await update({ ['board_r/' + id + '/' + uid]: true, ['board/' + id + '/r']: INC() });
  };
  N.boardDel = (kind, id) => update({ ['board/' + id]: null });
  N.boardSetPin = (kind, text) => restWrite('PUT', 'pin', String(text || ''));
  N.boardUid = () => N.uid();
  // =============================================
  //  管理（管理のかぎを、この端末の匿名IDに登録してから）
  // =============================================
  N.adminLogin = async function (key) { await N.token(false); await restWrite('PUT', 'ft_admins/' + N.uid(), String(key), true); return N.uid(); };
  N.setCkpt = f => restWrite('PUT', 'ckpt', f);
  N.setEnd = () => restWrite('PUT', 'end', { t: SV, w: 'b' });
  // 層を消す：鉛筆・越えた記録・一番乗り・数をぜんぶ（層の形を作りなおしたときなど）
  N.resetFloor = f => update({ ['cells/' + f]: null, ['dlog/' + f]: null, ['drec/' + f]: null, ['clear/' + f]: null, ['open/' + f]: null, ['stat/' + f]: null, ['rm/' + f]: { t: SV }, ['reset/' + f]: { t: SV } });
  N.dlog = async function (f) {
    const v = await rest('dlog/' + f) || {}, by = new Map();
    for (const id in v) { const d = v[id]; if (!d || typeof d.u !== 'string') continue; const g = by.get(d.u) || { u: d.u, n: 0, first: Infinity, last: 0, ids: [], ps: [] }; g.n++; g.first = Math.min(g.first, d.t || 0); g.last = Math.max(g.last, d.t || 0); g.ids.push(id); g.ps.push(d.p); by.set(d.u, g); }
    return [...by.values()].sort((a, b) => b.n - a.n);
  };
  N.removeBy = async function (f, g) {
    const cells = await rest('cells/' + f) || {}, dec = {}, w = {};
    for (const p of g.ps) dec[p] = (dec[p] || 0) + 1;
    for (const p in dec) { const c = cells[p]; if (!c) continue; const n = (c.n | 0) - dec[p]; w['cells/' + f + '/' + p] = n >= 1 ? Object.assign({}, c, { n }) : null; }
    for (const id of g.ids) { w['dlog/' + f + '/' + id] = null; w['drec/' + f + '/' + id] = null; }
    w['rm/' + f] = { t: SV };
    const keys = Object.keys(w); for (let i = 0; i < keys.length; i += 400) { const part = {}; for (const k of keys.slice(i, i + 400)) part[k] = w[k]; await update(part); }
    return Object.keys(dec).length;
  };
  N.purge = async function (f, ids, openToo) {
    const w = {}; for (const id of ids) w['clear/' + f + '/' + id] = null;
    if (openToo) w['open/' + f] = null;
    if (Object.keys(w).length) await update(w);
  };
  N.blankName = async function (f, id) {
    const w = {}; if (id) { w['clear/' + f + '/' + id + '/n'] = '名無し'; w['clear/' + f + '/' + id + '/w'] = '名無し'; }
    const op = await rest('open/' + f).catch(() => null); if (op && (!id || op.id === id)) { w['open/' + f + '/n'] = '名無し'; w['open/' + f + '/w'] = '名無し'; w['open/' + f + '/x'] = ''; }
    if (id) w['clear/' + f + '/' + id + '/x'] = '';
    if (id && +f === 100) w['gb/' + id] = true;
    if (Object.keys(w).length) await update(w);
  };
})(typeof window !== 'undefined' ? window : globalThis);
