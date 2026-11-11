// =============================================
//  エンピツライフ  画面・操作・絵（ノートの落書き風）
//  動きの計算は engine.js、通信は net.js。ここは見せ方と流れだけ
// =============================================
(function (G) {
  const FT = G.FT, N = FT.NET, SND = FT.SND, TT = FT.T, PH = FT.PHYS;
  const T = (s, ...a) => FT.tr(s, ...a);
  FT.VER = '11';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n || 0).toLocaleString(FT.LOCALE || 'ja-JP');
  const GAME_URL = 'https://nasubi-no-oniwa.github.io/enpitsu-life/', TAG = '#エンピツライフ';
  const OFFLINE = /[?&]offline=1/.test(location.search) || !N.ready();
  // ---------- 自分のこと（この端末だけ） ----------
  const ME = Object.assign({ dead: 0, best: 1, how: 0, xid: '', bname: '', bpost: 0, bhide: [], seen: 0 }, N.store('el_me') || {});
  if (!ME.bp || typeof ME.bp !== 'object') ME.bp = {};   // 層ごとの、自分がいちばん先まで行った割合（0〜1000）
  const saveMe = () => N.store('el_me', ME);
  // ---------- 鉛筆の名前 ----------
  const NAMES = {
    ja: [['ちびた', '折れた', 'とがった', 'まるい', 'かじられた', '名もなき', 'ねむい', 'いそぐ', 'やさしい', 'さびしい', '光る', '消えかけの', '二代目の', 'かしこい', 'ふるえる', 'がんばる', '迷子の', 'しずかな', '早起きの', 'おしゃべりな'], ['2B', 'HB', 'B', '4B', 'H', '赤えんぴつ', '青えんぴつ', '色えんぴつ', 'えんぴつ', 'シャー芯']],
    en: [['Tiny', 'Broken', 'Sharp', 'Dull', 'Sleepy', 'Brave', 'Lost', 'Shy', 'Lucky', 'Old', 'Bold', 'Quiet'], [' 2B', ' HB', ' 4B', ' Pencil', ' Lead', ' Crayon']],
    zh: [['短短的', '斷掉的', '尖尖的', '愛睏的', '勇敢的', '迷路的', '害羞的', '幸運的', '安靜的'], ['2B', 'HB', '鉛筆', '筆芯', '色鉛筆']],
    ko: [['몽당', '부러진', '뾰족한', '졸린', '용감한', '길잃은', '수줍은', '운좋은', '조용한'], [' 2B', ' HB', ' 연필', ' 샤프심', ' 색연필']],
  };
  const newName = () => { const L = NAMES[FT.LANG] || NAMES.ja; for (let i = 0; i < 20; i++) { const s = (L[0][Math.floor(Math.random() * L[0].length)] + L[1][Math.floor(Math.random() * L[1].length)]).slice(0, 12); if (N.cleanName(s) === s) return s; } return 'えんぴつ'; };
  // ---------- 層 ----------
  let LEVELS = null;
  const LV = {};
  const getLevel = f => { if (!LV[f]) LV[f] = FT.makeLevel(LEVELS[f - 1]); return LV[f]; };
  // ---------- 全体の状態 ----------
  const W = { open: {}, okSnap: {}, ckpt: null, okLocal: N.store('el_okf') || {}, stat: {}, latest: 1, end: null, rawTop: 1, dead: 0 };
  const okFloor = f => !!(W.okSnap[f] || (W.ckpt !== null && f <= W.ckpt) || (W.okLocal[f] && W.open[f] && W.okLocal[f] === W.open[f].t) || (OFFLINE && W.okLocal[f]));
  // その層の一番乗り（まとめで確かめた記録を先に、なければ確かめた「開いた」印）。名前は本人が書いた名前（w）を先に
  const firstOf = f => W.okSnap[f] || (okFloor(f) && W.open[f]) || null;
  const nameOf = o => N.cleanName((o && (o.w || o.n)) || '') || T('名無し');
  function computeLatest() { let L = 1; while (L <= 100 && okFloor(L)) L++; W.done = L > 100; W.latest = Math.min(100, L); }
  async function refreshWorld() {
    if (OFFLINE) { computeLatest(); return; }
    try { const o = await N.overview(); W.open = o.open; W.okSnap = o.okSnap; W.ckpt = o.ckpt; W.stat = o.stat; W.end = o.end; W.rawTop = o.rawTop; } catch (e) { }
    try { W.dead = await N.totalDead(); } catch (e) { }
    computeLatest();
    verifyChain();
  }
  // まだ確かめていない「開いた」を、下から順に確かめる（越えた記録を再生する）
  let chainBusy = false;
  async function verifyChain() {
    if (chainBusy || OFFLINE) return; chainBusy = true;
    try {
      for (let i = 0; i < 4; i++) {
        const f = W.latest; if (f > 100 || !W.open[f] || okFloor(f)) break;
        const lv = getLevel(f); await N.loadCells(lv);
        const c = await N.firstClear(lv);
        if (!c || c.wait) break;
        W.okLocal[f] = W.open[f].t; N.store('el_okf', W.okLocal); computeLatest(); paintTitle();
      }
    } catch (e) { } finally { chainBusy = false; }
  }
  // =============================================
  //  画面の切りかえ
  // =============================================
  const scr = id => { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id); $('hud').classList.toggle('on', id === 'game'); $('hFront').classList.toggle('on', id === 'game'); };
  const ov = (id, on) => $(id).classList.toggle('on', !!on);
  const anyOv = () => !!document.querySelector('.ov.on');
  let toastT = 0;
  function toast(a, b, ms) { const e = $('toast'); e.innerHTML = esc(a) + (b ? `<small>${esc(b)}</small>` : ''); e.classList.add('in'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('in'), ms || 2200); }
  function i18nAll() { for (const e of document.querySelectorAll('[data-t]')) e.textContent = T(e.dataset.t); document.title = T('エンピツライフ'); }
  // =============================================
  //  タイトル
  // =============================================
  function paintTitle() {
    $('tTop').textContent = W.done ? T('全100層 卒業') : T('第{0}層', W.latest);
    { const L = W.latest, ln = LEVELS && LEVELS[L - 1] ? T(LEVELS[L - 1].n) : '', fr = W.done ? 1000 : frontOf(L);
      $('tFrT').textContent = W.done ? T('全100層 卒業') : T('最前線 第{0}層', L); void ln;
      setBar('tFr', fr, W.done || ME.bp[L] === undefined ? -1 : ME.bp[L] | 0, T('先頭 {0}%', Math.floor(fr / 10))); }
    $('tDead').textContent = T('{0}本', fmt(W.dead));
    $('tMine').textContent = T('{0}本', fmt(ME.dead));
    $('tNote').textContent = OFFLINE ? T('いまは一人で遊んでいます（みんなの鉛筆は出ません）') : (W.end ? T('ゲームは終わりました。鉛筆はもう増えません') : T('鉛筆は20秒ごとに、みんなのものが届きます'));
    paintSnd();
    const box = $('langs'); box.innerHTML = '';
    for (const [k, name] of FT.LANGS) { const b = document.createElement('button'); b.textContent = name; b.className = k === FT.LANG ? 'on' : ''; b.onclick = () => FT.setLang(k); box.appendChild(b); }
  }
  function paintSnd() { const t = SND.on ? T('♪ 音あり') : T('♪ 音なし'); $('bSnd').textContent = t; $('mSnd').textContent = t; }
  // 配信中の人
  let liveAt = 0, liveList = [];
  async function loadLive(force) {
    if (OFFLINE || (!force && Date.now() - liveAt < 60000)) return paintLive();
    liveAt = Date.now();
    try { liveList = await N.live(); } catch (e) { liveList = []; }
    paintLive();
  }
  function paintLive() {
    const box = $('liveBox'); box.innerHTML = '';
    for (const x of liveList.slice(0, 3)) { const a = document.createElement('a'); a.className = 'live'; a.href = x.u; a.target = '_blank'; a.rel = 'noopener'; a.innerHTML = `${esc(T('配信中'))}：${esc(x.n)}<small>${esc(x.m || '')}</small>`; box.appendChild(a); }
    $('hLive').style.display = liveList.length ? 'block' : 'none';
  }
  // =============================================
  //  遊ぶ
  // =============================================
  const cv = $('c'), cx = cv.getContext('2d');
  let dpr = 1, VW = 0, VH = 0;
  function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); VW = window.innerWidth; VH = window.innerHeight; cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr); }
  window.addEventListener('resize', resize); resize();
  // S：いまの挑戦
  const S = { lv: null, cor: new Map(), mine: new Map(), run: null, rec: null, name: '', start: '', acc: 0, last: 0, mode: 'title', aim: null, steer: 0, cam: { x: 0, y: 0, z: 13 }, fx: [], shake: 0, syncAt: 0, deadInfo: null, startCor: null, paused: false, loading: false, life: 0 };
  async function enterFloor(f) {
    if (!LEVELS) return;
    f = Math.max(1, Math.min(W.latest, f | 0));
    S.loading = true;
    const lv = getLevel(f); S.lv = lv;
    S.cor = new Map(); S.mine = new Map();
    for (const ov2 of document.querySelectorAll('.ov')) ov2.classList.remove('on');
    scr('game'); hud(); hint(T('よみこみ中…'));
    if (!OFFLINE) { try { S.cor = await N.loadCells(lv); } catch (e) { toast(T('みんなの鉛筆を読めませんでした'), T('少したってから、もう一度')); } }
    else S.cor = localCor(f);
    S.syncAt = Date.now(); S.loading = false;
    document.body.classList.toggle('dark', lv.theme === 2 || lv.theme === 7);
    SND.bgm(Math.min(10, lv.theme));
    newLife();
  }
  function newLife() {
    const lv = S.lv;
    S.startCor = new Map([...S.cor].map(([k, c]) => [k, { n: c.n, name: c.name }]));
    S.run = new FT.Run(lv, S.startCor); S.rec = new FT.Rec(); S.name = newName(); S.start = FT.corStr(S.startCor);
    S.acc = 0; S.aim = null; S.steer = 0; S.deadInfo = null; S.life++;
    const p = S.run.p; S.cam.x = p.x + 3; S.cam.y = p.y - 2; S.cam.z = 13;
    S.mode = 'play'; S.paused = false;
    hud();
    hint(ME.how < 2 ? T('指を引っぱって、はなすと飛ぶ') : '');
  }
  function hud() {
    const lv = S.lv; if (!lv) return;
    const st = W.stat[lv.f] || {};
    const prog = Math.floor(progOf(S.run, lv) / 10);
    $('hFloor').innerHTML = `${esc(T('第{0}層', lv.f))} ${esc(T(lv.name))}<small>${esc(T('この層の鉛筆 {0}本', fmt(Math.max(st.d || 0, countPencils()))))} ・ ${esc(T('自分 {0}%', prog))}</small>`;
    paintFront();
  }
  // ---------- 先頭のバー（シインクラッドと同じ。みんなの中でいちばん先まで行った所を塗り、▼が自分） ----------
  const progOf = (r, lv) => r && lv ? Math.max(0, Math.min(1000, Math.round((r.p.maxX - lv.start[0]) / (lv.goal[0] - lv.start[0]) * 1000))) : 0;
  const frontOf = f => okFloor(f) ? 1000 : Math.max(0, Math.min(1000, (W.stat[f] && W.stat[f].m) | 0, 1000), ME.bp[f] | 0);
  function setBar(pre, front, me, label) {
    $(pre + 'I').style.width = (front / 10) + '%';
    const u = $(pre + 'U'); if (me >= 0) { u.style.display = 'block'; u.style.left = (me / 10) + '%'; } else u.style.display = 'none';
    $(pre + 'P').textContent = label;
  }
  let frontAt = 0;
  function paintFront() {
    const lv = S.lv; if (!lv) return; frontAt = Date.now();
    const me = S.mode === 'spec' && SP.d ? Math.max(0, Math.min(1000, SP.d.m | 0)) : progOf(S.run, lv), front = Math.max(frontOf(lv.f), me);
    setBar('hFr', front, me, Math.floor(front / 10) + '%');
  }
  const countPencils = () => { let n = 0; for (const c of S.cor.values()) n += c.n | 0; return n; };
  let hintT = 0;
  function hint(t) { const e = $('hint'); clearTimeout(hintT); if (!t) { e.classList.remove('on'); return; } e.textContent = t; e.classList.add('on'); }
  // ---------- 1回の命の終わり ----------
  function onOver() {
    const r = S.run, lv = S.lv;
    if (r.clear) return onClear();
    const pl = r.place || { k: -1, why: 'out' };
    ME.dead++; saveMe();
    const m = Math.max(0, Math.min(1000, Math.round((r.p.maxX - lv.start[0]) / (lv.goal[0] - lv.start[0]) * 1000)));
    if (m > (ME.bp[lv.f] | 0)) { ME.bp[lv.f] = m; saveMe(); }
    let count = (W.stat[lv.f] && W.stat[lv.f].d) || 0; count = Math.max(count, countPencils()) + 1;
    if (pl.k >= 0) {
      const c = { n: pl.n, name: S.name, t: Date.now() };
      S.cor.set(pl.k, c); S.mine.set(pl.k, c);
      if (OFFLINE) saveLocalCor(lv.f, S.cor);
      else N.died({ f: lv.f, k: pl.k, n: pl.n, cap: FT.capOf(lv, pl.k), name: S.name, rec: S.rec.str(), cor: S.start, ticks: r.t, m }).catch(() => { });
      fxStick(pl);
    } else {
      if (!OFFLINE) N.statOnly(lv.f, m).catch(() => { });
      fxBreak(r, pl);
    }
    W.stat[lv.f] = Object.assign({}, W.stat[lv.f] || {}, { d: count });
    S.deadInfo = { why: pl.why, kind: r.dead, k: pl.k, n: pl.n, count, name: S.name, f: lv.f, rec: S.rec.str(), start: S.start, ticks: r.t, startCor: S.startCor };
    S.mode = 'dead'; hud(); if (S.pvEv) S.pvEv.push(pl.k >= 0 ? 'stick' : 'break');
    SND.se(pl.k >= 0 ? (pl.why === 'stack' ? 'pile' : 'land') : (pl.why === 'sink' ? 'splash' : 'die'));
    setTimeout(showDead, pl.k >= 0 ? 650 : 800);
  }
  const WHY = {
    ground: '地面に刺さって、鉛筆になった。', stack: '鉛筆の上に積み重なった。', cap: '赤い線をこえて、はじかれた。', sink: 'のりに沈んで、消えた。', out: '下へ落ちて、消えた。',
    spike: '画びょうに当たって、砕けた。', sharp: '鉛筆けずりに、けずられた。', blade: 'カッターの刃で、砕けた。', plane: '紙ひこうきにぶつかって、砕けた。', eraser: '消しゴムに、消された。',
  };
  function showDead() {
    if (S.mode !== 'dead') return;
    const d = S.deadInfo; hint('');
    const made = d.k >= 0;
    $('dTitle').textContent = made ? T('第{0}層の{1}本目の鉛筆になった', d.f, fmt(d.count)) : T('鉛筆は残らなかった');
    $('dWhy').textContent = T(WHY[d.why === 'shatter' ? d.kind : d.why] || WHY.out);
    $('dName').innerHTML = `<b>${esc(d.name)}</b>`;
    $('dMore').textContent = made ? T('この鉛筆は、あとから来るだれかの足場になる。') : T('トゲ・刃・のりの上には、鉛筆が残りません。');
    ov('oDead', 1);
  }
  async function onClear() {
    const lv = S.lv, r = S.run;
    S.mode = 'clear'; SND.se('clear'); fxClear(); if (S.pvEv) S.pvEv.push('clear');
    if (S.lv) { ME.bp[S.lv.f] = 1000; saveMe(); }
    ME.how = Math.max(ME.how, 2);
    if (lv.f + 1 > ME.best) ME.best = Math.min(101, lv.f + 1);
    saveMe();
    $('cTitle').textContent = T('第{0}層を越えた！', lv.f);
    $('cWhy').textContent = T('鉛筆立てに入った。乗りついだ鉛筆 {0}本', r.p.hops - 1);
    $('cFirst').hidden = true; $('cNext').disabled = lv.f >= 100;
    $('cNext').textContent = lv.f >= 100 ? T('卒業！') : T('次の層へ');
    S.clearInfo = { f: lv.f, hops: r.p.hops - 1, id: null, opened: false };
    setTimeout(() => ov('oClear', 1), 700);
    if (OFFLINE) { W.okLocal[lv.f] = 1; N.store('el_okf', W.okLocal); computeLatest(); return; }
    try {
      const res = await N.clear(lv, { name: S.name, rec: S.rec.str(), cor: S.start, ticks: r.t });
      S.clearInfo.id = res.id; S.clearInfo.opened = res.opened;
      if (res.opened) { $('cWhy').textContent = lv.f >= 100 ? T('一番乗りで卒業！') : T('一番乗り！ 第{0}層が、みんなに開いた。', lv.f + 1); W.open[lv.f] = { t: Date.now(), n: S.name, x: '', id: res.id }; }
      if (res.id && (res.opened || lv.f >= 100)) {
        $('cFirstText').textContent = (res.opened ? T('一番乗りノートに名前が載ります。') : T('卒業生として、一番乗りノートの最後のページに名前が載ります。')) + T('好きな名前を書けます（12文字まで・15分以内に1回だけ）。書かなければ「{0}」で載ります。XのIDを入れると、名前のとなりに出ます（入れなくてもよい）。', S.name);
        $('cName').value = ''; $('cName').placeholder = S.name; $('cXid').value = ME.xid ? '@' + ME.xid : '';
        S.clearInfo.at = Date.now(); $('cFirst').hidden = false;
      }
      W.okLocal[lv.f] = (W.open[lv.f] && W.open[lv.f].t) || Date.now();
      // 自分で越えた層は、すぐ確かめて開く（越えた記録を再生）
      const okNow = await N.verifyClearAsync(lv, { t: 1, r: S.rec.str(), c: S.start, k: r.t }, N.present(lv)).catch(() => false);
      if (okNow) { const op = await N.rest('open/' + lv.f).catch(() => null); if (op) { const keep = W.open[lv.f]; W.open[lv.f] = Object.assign(op, keep && keep.id === op.id && keep.w ? { w: keep.w } : {}); W.okLocal[lv.f] = op.t; } N.store('el_okf', W.okLocal); }
      computeLatest();
    } catch (e) { toast(T('記録を送れませんでした'), T('少したってから、もう一度')); }
  }
  // ---------- 鉛筆（ひとりで遊ぶとき） ----------
  function localCor(f) { const v = N.store('el_local_' + f) || []; const m = new Map(); for (const [k, n, name] of v) m.set(k, { n, name }); return m; }
  function saveLocalCor(f, cor) { const a = []; for (const [k, c] of cor) a.push([k, c.n, c.name]); N.store('el_local_' + f, a.slice(-600)); }
  // ---------- 20秒ごとに、みんなの鉛筆を読みなおす ----------
  async function sync() {
    if (OFFLINE || !S.lv || S.loading) return;
    S.syncAt = Date.now();
    { const f = S.lv.f; N.floorStat(f).then(v => { if (v && typeof v === 'object') { const o = W.stat[f] || {}; W.stat[f] = Object.assign({}, o, v, { d: Math.max(v.d | 0, o.d | 0), m: Math.max(v.m | 0, o.m | 0) }); if (S.lv && S.lv.f === f) hud(); } }).catch(() => { }); }
    try {
      const m = await N.syncCells(S.lv, S.mine);
      const before = countPencils();
      S.cor = m;
      const add = countPencils() - before;
      if (add > 0 && S.mode === 'play') {
        // まだ飛んでいないなら、新しい鉛筆にすぐ乗れるようにする
        if (S.run && !S.run.p.fly && S.run.p.hops === 0) { const t = S.run.t; newLife(); S.run.t = t; }
        toast(T('みんなの鉛筆が {0}本 ふえた', add), '', 1400);
      }
      hud();
    } catch (e) { }
  }
  // =============================================
  //  操作
  // =============================================
  //  立っているとき：指を置いて引っぱる（引いた向きの反対へ飛ぶ）。はなすと飛ぶ
  //  飛んでいるとき：画面の左半分・右半分を押すと、ほんの少し左右に動く
  const ptr = new Map();
  let aimId = null;
  const aimFrom = (sx, sy, ex, ey) => {
    const dx = sx - ex, dy = sy - ey, len = Math.hypot(dx, dy), unit = Math.min(VW, VH) * 0.36;
    if (len < 14) return null;
    let deg = Math.atan2(dx, -dy) * 180 / Math.PI;
    if (dy > 0 && Math.abs(deg) > 90) deg = deg > 0 ? 60 : -60;   // 下向きに引けない（上へ引いたとき）
    deg = Math.max(-PH.AMAX, Math.min(PH.AMAX, deg));
    const pw = Math.round(Math.max(0, Math.min(1, (len - 14) / unit)) * 1000);
    return { ai: FT.aIdx(deg), pw, deg };
  };
  cv.addEventListener('pointerdown', e => {
    SND.unlock();
    if (S.mode === 'spec' && !anyOv()) { cv.setPointerCapture && cv.setPointerCapture(e.pointerId); SP.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); specPinch(); return; }
    if (S.mode !== 'play' || anyOv() || S.loading) return;
    cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (!S.run.p.fly && aimId === null) { aimId = e.pointerId; S.aim = null; }
    updSteer();
  });
  cv.addEventListener('pointermove', e => {
    if (S.mode === 'spec') {
      const q = SP.pts.get(e.pointerId); if (!q) return; const sc = VW / S.cam.z;
      if (SP.pts.size === 1) { S.cam.x -= (e.clientX - q.x) / sc; S.cam.y -= (e.clientY - q.y) / sc; }
      q.x = e.clientX; q.y = e.clientY;
      if (SP.pts.size === 2 && SP.pinch) { const [a, b] = [...SP.pts.values()]; S.cam.z = SP.pinch.z * SP.pinch.d / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)); }
      specCam(); return;
    }
    const q = ptr.get(e.pointerId); if (!q) return; q.x = e.clientX; q.y = e.clientY;
    if (e.pointerId === aimId && S.run && !S.run.p.fly) { S.aim = aimFrom(q.sx, q.sy, q.x, q.y); if (S.aim) hint(''); }
  });
  const up = e => {
    if (SP.pts.has(e.pointerId)) { SP.pts.delete(e.pointerId); specPinch(); return; }
    const q = ptr.get(e.pointerId); ptr.delete(e.pointerId);
    if (e.pointerId === aimId) {
      aimId = null;
      if (S.mode === 'play' && S.run && !S.run.p.fly && S.aim) { S.pendGo = [S.aim.ai, S.aim.pw]; ME.how = Math.max(ME.how, 1); saveMe(); }
      S.aim = null;
    }
    updSteer();
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  function specPinch() { if (SP.pts.size === 2) { const [a, b] = [...SP.pts.values()]; SP.pinch = { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), z: S.cam.z }; } else SP.pinch = null; }
  cv.addEventListener('wheel', e => { if (S.mode !== 'spec') return; e.preventDefault(); S.cam.z *= e.deltaY > 0 ? 1.12 : 1 / 1.12; specCam(); }, { passive: false });
  function updSteer() {
    let L = 0, R = 0;
    if (S.run && S.run.p.fly) for (const [id, q] of ptr) { if (id === aimId) continue; if (q.x < VW / 2) L = 1; else R = 1; }
    S.steer = (S.keyL || L ? 1 : 0) | (S.keyR || R ? 2 : 0);
  }
  // キーボード：←→で狙い、↑↓で強さ、スペースで飛ぶ。飛んでいる間は←→で少し動く
  const KA = { a: 0, p: 600 };
  window.addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (S.mode === 'dead' && (e.key === ' ' || e.key === 'Enter') && $('oDead').classList.contains('on')) { e.preventDefault(); retry(); return; }
    if (S.mode === 'spec' && !anyOv()) { const k = e.key; if (k === 'ArrowLeft' || k === 'a') S.cam.x -= 1.5; if (k === 'ArrowRight' || k === 'd') S.cam.x += 1.5; if (k === 'ArrowUp' || k === 'w') S.cam.y -= 1.5; if (k === 'ArrowDown' || k === 's') S.cam.y += 1.5; if (k === '+' || k === '=') S.cam.z /= 1.15; if (k === '-') S.cam.z *= 1.15; specCam(); return; }
    if (S.mode !== 'play' || anyOv()) return;
    const fly = S.run && S.run.p.fly;
    if (e.key === 'ArrowLeft' || e.key === 'a') { if (fly) S.keyL = 1; else { KA.a = Math.max(-60, KA.a - 3); S.aim = { ai: FT.aIdx(KA.a), pw: KA.p, deg: KA.a }; } }
    if (e.key === 'ArrowRight' || e.key === 'd') { if (fly) S.keyR = 1; else { KA.a = Math.min(60, KA.a + 3); S.aim = { ai: FT.aIdx(KA.a), pw: KA.p, deg: KA.a }; } }
    if (!fly && (e.key === 'ArrowUp' || e.key === 'w')) { KA.p = Math.min(1000, KA.p + 25); S.aim = { ai: FT.aIdx(KA.a), pw: KA.p, deg: KA.a }; }
    if (!fly && (e.key === 'ArrowDown' || e.key === 's')) { KA.p = Math.max(0, KA.p - 25); S.aim = { ai: FT.aIdx(KA.a), pw: KA.p, deg: KA.a }; }
    if (!fly && e.key === ' ') { e.preventDefault(); S.pendGo = [FT.aIdx(KA.a), KA.p]; S.aim = null; }
    if (e.key === 'Escape') openMenu();
    updSteer();
  });
  window.addEventListener('keyup', e => { if (e.key === 'ArrowLeft' || e.key === 'a') S.keyL = 0; if (e.key === 'ArrowRight' || e.key === 'd') S.keyR = 0; updSteer(); });
  // =============================================
  //  進める
  // =============================================
  function tick() {
    const r = S.run; if (!r || r.over) return;
    let inp = null;
    if (!r.p.fly) {
      if (S.pendGo) { inp = { go: S.pendGo }; S.rec.go(r.t + 1, S.pendGo[0], S.pendGo[1]); S.pendGo = null; S.rec.last = 0; }
    } else {
      const b = S.steer; S.rec.steer(r.t + 1, b); inp = { L: b & 1, R: (b >> 1) & 1 };
    }
    const wasFly = r.p.fly;
    r.step(inp);
    for (const e of r.events) {
      if (e.k === 'go') { SND.se('jump'); fxGo(); if (S.pvEv) S.pvEv.push('go'); }
      if (e.k === 'land') { SND.se('grab'); fxLand(); hud(); if (S.pvEv) S.pvEv.push('land'); }
    }
    r.events.length = 0;
    if (wasFly && !r.p.fly && !r.over) S.rec.steer(r.t + 1, 0);
    if (r.p.fly) S.trail.push([r.p.x, r.p.y]); if (S.trail.length > 40) S.trail.shift();
    if (r.over) onOver();
  }
  S.trail = [];
  function loop(now) {
    requestAnimationFrame(loop);
    if (S.pv) return;
    const dt = Math.min(0.1, (now - (S.last || now)) / 1000); S.last = now;
    if (S.mode === 'play' && !S.paused && !anyOv()) {
      S.acc += dt;
      while (S.acc >= FT.DT) { S.acc -= FT.DT; tick(); if (S.mode !== 'play') break; }
      if (Date.now() - S.syncAt > 20000) sync();
    }
    if (S.mode === 'watch' && !S.paused && !anyOv()) { S.acc += dt * WT.speed; let n = 0; while (S.acc >= FT.DT && n++ < 1200) { S.acc -= FT.DT; watchTick(); } }
    if (S.lv && (S.mode === 'play' || S.mode === 'dead' || S.mode === 'clear' || S.mode === 'watch' || S.mode === 'spec')) { if (S.mode === 'spec') specCam(); else camera(dt); draw(cx, VW, VH, dpr, S.cam, now / 1000); if (Date.now() - frontAt > 250) paintFront(); }
    else drawTitleBg(now / 1000);
  }
  // ---------- カメラ ----------
  function camera(dt) {
    const r = S.run, p = r.p, c = S.cam;
    const fly = p.fly, tz = fly ? 18 : (S.aim ? 16 : 13);
    const viewH = (VH / VW) * c.z;
    let tx = p.x + (fly ? Math.sign(p.vx) * 2.5 : 3), ty = p.y - viewH * (fly ? .08 : .14);
    if (S.aim && !fly) { const pr = FT.predict(p.x, p.y, S.aim.ai, S.aim.pw), e = pr[pr.length - 1]; tx = (p.x + e[0]) / 2; ty = Math.min(p.y - viewH * .14, (p.y + e[1]) / 2); }
    const k = 1 - Math.pow(0.02, dt);
    c.x += (tx - c.x) * k; c.y += (ty - c.y) * k; c.z += (tz - c.z) * (1 - Math.pow(0.1, dt));
    const half = c.z / 2;
    c.x = Math.max(half - 1, Math.min(S.lv.w - half + 1, c.x));
    c.y = Math.min(S.lv.h - viewH / 2 + 1, c.y);
  }
  // =============================================
  //  絵（ノートの落書き風）
  // =============================================
  //  景色ごとの色：[紙, 罫線, ブロックの色たち, 本の色たち, 文字の色]
  const THEME = [
    ['#f7f2e2', '#a9cbe9', ['#e65f4f', '#f2b134', '#4f9be0', '#5cbf6a'], ['#8d6e63', '#c0846a'], '#2b2b33', 'rule'],   // ノート
    ['#f3f7ec', '#b8d9b2', ['#58b368', '#f2c14e', '#e76f51', '#3d8ccf'], ['#6d8b74', '#a3b18a'], '#26332a', 'grid'],  // 方眼紙
    ['#24443a', '#3f6b5c', ['#f4f1de', '#f2cc8f', '#81b29a', '#e07a5f'], ['#d9cbb0', '#b5a68a'], '#f4f1de', 'board'],  // 黒板
    ['#fbfbf8', '#d7d7d0', ['#d1495b', '#edae49', '#00798c', '#30638e'], ['#5c5c5c', '#8a8a8a'], '#222', 'test'],    // テスト用紙
    ['#fdf6ee', '#f1d3c2', ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5'], ['#bc8a5f', '#d4a373'], '#2b2b33', 'paint'], // 絵の具
    ['#efe6cf', '#d8c7a3', ['#2b2b2b', '#b23a48', '#5c5c5c', '#8c6d46'], ['#5b4636', '#7a5c45'], '#1f1a14', 'washi'],  // 習字
    ['#e9d8bd', '#cdb28b', ['#e76f51', '#2a9d8f', '#e9c46a', '#264653'], ['#8a5a2b', '#a47148'], '#2b2016', 'wood'],    // 図工室
    ['#1d2440', '#2e3761', ['#ffd166', '#90a8ff', '#ef8fa8', '#7ad0c4'], ['#59607e', '#7b82a1'], '#e8ebff', 'night'],   // 夜の教室
    ['#eceff1', '#cfd8dc', ['#455a64', '#e53935', '#1e88e5', '#fdd835'], ['#78909c', '#546e7a'], '#1c262b', 'exam'],    // 受験
    ['#dff1ff', '#bfe2fb', ['#ff8fab', '#ffb3c6', '#a0c4ff', '#ffd6a5'], ['#cdb4db', '#bdb2ff'], '#2b2b44', 'sky'],      // 卒業
  ];
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const jit = (a, b, s) => (hash(a, b) - .5) * s;
  // ゆれた線（手描き）
  function sketchRect(g, x, y, w, h, seed, amp) {
    const a = amp || 1.2; g.beginPath();
    g.moveTo(x + jit(seed, 1, a), y + jit(seed, 2, a)); g.lineTo(x + w + jit(seed, 3, a), y + jit(seed, 4, a)); g.lineTo(x + w + jit(seed, 5, a), y + h + jit(seed, 6, a)); g.lineTo(x + jit(seed, 7, a), y + h + jit(seed, 8, a)); g.closePath();
  }
  function paper(g, W2, H2, th, ox, oy, s, t) {
    const P = THEME[th];
    g.fillStyle = P[0]; g.fillRect(0, 0, W2, H2);
    g.strokeStyle = P[1]; g.lineWidth = 1;
    const kind = P[5];
    if (kind === 'rule' || kind === 'test' || kind === 'exam') {
      const step = s * 0.9, y0 = ((-oy * s) % step + step) % step;
      g.beginPath(); for (let y = y0; y < H2; y += step) { g.moveTo(0, y); g.lineTo(W2, y); } g.stroke();
      if (kind === 'rule') { const mx = ((-ox * s * 0.4) % (W2 * 1.4)); g.strokeStyle = 'rgba(224,72,62,.45)'; g.beginPath(); g.moveTo(mx + 40, 0); g.lineTo(mx + 40, H2); g.stroke(); }
    } else if (kind === 'grid') {
      const step = s * 0.5, x0 = ((-ox * s) % step + step) % step, y0 = ((-oy * s) % step + step) % step;
      g.beginPath(); for (let x = x0; x < W2; x += step) { g.moveTo(x, 0); g.lineTo(x, H2); } for (let y = y0; y < H2; y += step) { g.moveTo(0, y); g.lineTo(W2, y); } g.stroke();
    } else if (kind === 'board') {
      g.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 14; i++) { const x = ((hash(i, 3) * 3000 - ox * s * .3) % (W2 + 300) + W2 + 300) % (W2 + 300) - 150, y = hash(i, 5) * H2; g.beginPath(); g.ellipse(x, y, 120, 40, hash(i, 9) * 3, 0, 7); g.fill(); }
    } else if (kind === 'paint') {
      for (let i = 0; i < 10; i++) { const x = ((hash(i, 3) * 3000 - ox * s * .3) % (W2 + 300) + W2 + 300) % (W2 + 300) - 150, y = hash(i, 5) * H2; g.fillStyle = THEME[4][2][i % 5] + '22'; g.beginPath(); g.arc(x, y, 50 + hash(i, 7) * 70, 0, 7); g.fill(); }
    } else if (kind === 'night') {
      g.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 60; i++) { const x = ((hash(i, 3) * 4000 - ox * s * .15) % W2 + W2) % W2, y = hash(i, 5) * H2 * .7; g.fillRect(x, y, 1.5, 1.5); }
    } else if (kind === 'sky') {
      g.fillStyle = 'rgba(255,175,200,.8)'; for (let i = 0; i < 26; i++) { const x = ((hash(i, 3) * 4000 - ox * s * .3 + t * 20 * (1 + hash(i, 4))) % W2 + W2) % W2, y = ((hash(i, 5) * H2 + t * 30 * (1 + hash(i, 6))) % H2); g.beginPath(); g.ellipse(x, y, 4, 2.5, t + i, 0, 7); g.fill(); }
    } else if (kind === 'washi') {
      g.strokeStyle = 'rgba(80,60,40,.08)'; g.lineWidth = s * .2; for (let i = 0; i < 6; i++) { const x = ((hash(i, 3) * 3000 - ox * s * .3) % (W2 + 400) + W2 + 400) % (W2 + 400) - 200; g.beginPath(); g.moveTo(x, H2 * .1); g.quadraticCurveTo(x + 80, H2 * .4, x - 30, H2 * .8); g.stroke(); }
    } else if (kind === 'wood') {
      g.strokeStyle = 'rgba(90,60,30,.12)'; const step = s * 1.4, y0 = ((-oy * s) % step + step) % step; g.beginPath(); for (let y = y0; y < H2; y += step) { g.moveTo(0, y); g.bezierCurveTo(W2 * .3, y + 8, W2 * .6, y - 8, W2, y + 3); } g.stroke();
    }
  }
  function draw(g, W2, H2, dp, cam, t, opt) {
    opt = opt || {};
    const lv = S.lv, r = S.run, th = Math.min(9, lv.theme), P = THEME[th];
    g.setTransform(dp, 0, 0, dp, 0, 0);
    let sh = S.shake > 0 ? S.shake : 0; S.shake = Math.max(0, S.shake - 0.6);
    const s = W2 / cam.z, ox = cam.x - W2 / s / 2 + jit(t * 60 | 0, 1, sh / s), oy = cam.y - H2 / s / 2 + jit(t * 60 | 0, 2, sh / s);
    paper(g, W2, H2, th, ox, oy, s, t);
    const X = x => (x - ox) * s, Y = y => (y - oy) * s;
    const x0 = Math.max(0, Math.floor(ox) - 1), x1 = Math.min(lv.w - 1, Math.ceil(ox + W2 / s) + 1), y0 = Math.max(0, Math.floor(oy) - 1), y1 = Math.min(lv.h - 1, Math.ceil(oy + H2 / s) + 1);
    const ink = th === 2 || th === 7 ? 'rgba(240,240,230,.9)' : 'rgba(43,43,51,.9)';
    // 鉛筆立て（ゴール）
    drawGoal(g, X, Y, s, lv, t, ink);
    // マス
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const c = lv.tiles[ty * lv.w + tx]; if (!c) continue;
      const above = ty > 0 ? lv.tiles[(ty - 1) * lv.w + tx] : 0;
      const px = X(tx), py = Y(ty);
      if (c === TT.BLOCK) {
        const col = P[2][Math.floor(hash(Math.floor(tx / 2), ty) * P[2].length)];
        g.fillStyle = col; sketchRect(g, px, py, s + .5, s + .5, tx * 31 + ty, .8); g.fill();
        g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(px, py + s * .78, s + .5, s * .22);
        if (!above || above === TT.SPIKE) { g.fillStyle = col; g.strokeStyle = ink; g.lineWidth = Math.max(1, s * .05); for (const k of [.28, .72]) { g.beginPath(); g.roundRect ? g.roundRect(px + s * k - s * .13, py - s * .14, s * .26, s * .17, s * .05) : g.rect(px + s * k - s * .13, py - s * .14, s * .26, s * .17); g.fill(); g.stroke(); } }
        g.strokeStyle = ink; g.lineWidth = Math.max(1, s * .045); sketchRect(g, px, py, s, s, tx * 17 + ty * 3, .9); g.stroke();
      } else if (c === TT.BOOK) {
        const col = P[3][(tx + ty) % 2]; g.fillStyle = col; sketchRect(g, px, py, s + .5, s + .5, tx * 7 + ty, .6); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = Math.max(1, s * .06); g.beginPath(); g.moveTo(px + s * .15, py + s * .25); g.lineTo(px + s * .85, py + s * .25); g.moveTo(px + s * .15, py + s * .75); g.lineTo(px + s * .85, py + s * .75); g.stroke();
        g.strokeStyle = ink; g.lineWidth = Math.max(1, s * .045); sketchRect(g, px, py, s, s, tx * 13 + ty * 5, .9); g.stroke();
      } else if (c === TT.GLUE) {
        g.fillStyle = P[2][0]; g.fillRect(px, py + s * .3, s + .5, s * .7);
        g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(px + s / 2, py + s * .3, s * .62, s * .22, 0, 0, 7); g.fill();
        g.strokeStyle = '#7fb3d5'; g.lineWidth = Math.max(1, s * .05); g.stroke();
        g.fillStyle = 'rgba(127,179,213,.7)'; const bb = (t * 1.3 + hash(tx, 1)) % 1; g.beginPath(); g.arc(px + s * (.3 + hash(tx, 2) * .4), py + s * (.3 - bb * .3), s * .06 * (1 - bb), 0, 7); g.fill();
      } else if (c === TT.SPIKE) {
        // 画びょう（下半分に針）
        const hx = px + s / 2, hy = py + s * .62;
        g.strokeStyle = ink; g.lineWidth = Math.max(1, s * .06); g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx, py + s * .98); g.stroke();
        g.fillStyle = P[2][(tx) % P[2].length]; g.beginPath(); g.ellipse(hx, hy, s * .32, s * .14, 0, 0, 7); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(hx - s * .12, hy); g.lineTo(hx, py + s * .3); g.lineTo(hx + s * .12, hy); g.fill(); g.stroke();
      }
    }
    // 仕掛け
    drawEnts(g, X, Y, s, lv, r, t, ink);
    // 鉛筆（赤い線は、山のある所だけ）
    const runCor = r ? r.cor : new Map();
    for (const [k, c] of S.cor) {
      if (!FT.keyOk(lv, k)) continue;   // はみ出して宙に浮いた鉛筆は描かない
      const col = FT.kcol(k), sy = FT.ksy(k), cxw = FT.colX(col);
      if (cxw < ox - 2 || cxw > ox + W2 / s + 2) continue;
      const ghost = r && !runCor.has(k) && (S.mode === 'play' || S.mode === 'watch');
      const capN = lv.cap[Math.floor(cxw)] | 0;
      for (let i = 0, nn = Math.min(30, c.n, FT.capOf(lv, k)); i < nn; i++) drawPencil(g, X(cxw), Y(sy - i * PH.PH), s, k * 7 + i, 0, ghost ? .35 : 1, ink, false);
      if (capN > 0 && c.n >= Math.max(1, capN - 1)) { const ly = Y(sy - capN * PH.PH); g.strokeStyle = c.n >= capN ? 'rgba(224,60,50,.95)' : 'rgba(224,60,50,.5)'; g.lineWidth = Math.max(2, s * .09); g.setLineDash([s * .16, s * .1]); g.beginPath(); g.moveTo(X(cxw - .45), ly); g.lineTo(X(cxw + .45), ly); g.stroke(); g.setLineDash([]); }
    }
    if (S.mode === 'spec' && SP.d) drawSpecMark(g, X, Y, s, ink, t);
    // 予測線
    if (r && !r.p.fly && S.aim && (S.mode === 'play' || S.mode === 'watch')) {
      const pr = FT.predict(r.p.x, r.p.y, S.aim.ai, S.aim.pw);
      g.strokeStyle = th === 2 || th === 7 ? 'rgba(255,240,180,.95)' : 'rgba(43,43,51,.75)'; g.lineWidth = Math.max(2, s * .08); g.setLineDash([s * .2, s * .16]);
      g.beginPath(); g.moveTo(X(pr[0][0]), Y(pr[0][1])); for (const q of pr) g.lineTo(X(q[0]), Y(q[1])); g.stroke(); g.setLineDash([]);
      const e = pr[pr.length - 1]; g.fillStyle = '#e0483e'; g.beginPath(); g.arc(X(e[0]), Y(e[1]), Math.max(4, s * .14), 0, 7); g.fill();
      // 強さのめもり
      const bx = X(r.p.x) - s * .9, by = Y(r.p.y) + s * .6; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(bx, by, s * 1.8, s * .22); g.fillStyle = S.aim.pw > 900 ? '#ff8c1a' : '#f2b134'; g.fillRect(bx, by, s * 1.8 * S.aim.pw / 1000, s * .22); g.strokeStyle = ink; g.lineWidth = 1.5; g.strokeRect(bx, by, s * 1.8, s * .22);
    }
    // 飛んだあとの線
    if (r && S.trail.length > 1 && (r.p.fly || S.mode !== 'play')) {
      g.strokeStyle = th === 2 || th === 7 ? 'rgba(255,255,255,.35)' : 'rgba(43,43,51,.25)'; g.lineWidth = Math.max(1, s * .05); g.beginPath(); g.moveTo(X(S.trail[0][0]), Y(S.trail[0][1])); for (const q of S.trail) g.lineTo(X(q[0]), Y(q[1])); g.stroke();
    }
    // 自分
    if (r && !(S.mode !== 'play' && r.place && r.place.k >= 0)) {
      const p = r.p; let ang = 0;
      if (p.fly) ang = Math.atan2(p.vx, -p.vy);
      else if (S.aim) ang = S.aim.deg * Math.PI / 180 * .5;
      if (S.mode === 'play' || S.mode === 'watch' || r.clear) drawPencil(g, X(p.x), Y(p.y + PH.HB), s, 999 + S.life, ang, 1, ink, true, p.fly ? t : 0);
    }
    // 演出
    drawFx(g, X, Y, s, t);
    if (opt.label) { g.setTransform(dp, 0, 0, dp, 0, 0); opt.label(g); }
  }
  // 鉛筆1本（下のはしを x, y に置く。ang：傾き。me：自分）
  function drawPencil(g, x, y, s, seed, ang, alpha, ink, me, fly) {
    const w = s * .34, h = s * PH.PH, cols = ['#f5c84c', '#4f9be0', '#e65f4f', '#5cbf6a', '#b07cd8', '#ff9f43', '#ff8fab', '#7ad0c4'];
    const col = me ? '#f5c84c' : cols[Math.floor(hash(seed, 3) * cols.length)];
    g.save(); g.globalAlpha = alpha; g.translate(x, y); g.rotate(ang);
    // 飛んでいる：うしろに削りカスの火花
    if (fly) { for (let i = 0; i < 5; i++) { const k = (fly * 7 + i * .2) % 1; g.fillStyle = i % 2 ? '#e0483e' : '#f2b134'; g.beginPath(); g.arc(jit(i, fly * 30 | 0, w), s * .1 + k * s * .5, (1 - k) * s * .09, 0, 7); g.fill(); } }
    // 体（透明なつつ）
    g.fillStyle = col; g.strokeStyle = ink; g.lineWidth = Math.max(1, s * .045);
    g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2, -h * .62); g.lineTo(w / 2, -h * .62); g.lineTo(w / 2, 0); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(-w / 2 + w * .14, -h * .58, w * .16, h * .5);
    // 木の部分と芯（上向き）
    g.fillStyle = '#f2d3a2'; g.beginPath(); g.moveTo(-w / 2, -h * .62); g.lineTo(0, -h); g.lineTo(w / 2, -h * .62); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#3a3a44'; g.beginPath(); g.moveTo(-w * .17, -h * .87); g.lineTo(0, -h); g.lineTo(w * .17, -h * .87); g.closePath(); g.fill();
    if (me && !fly) { g.fillStyle = ink; g.beginPath(); g.arc(-w * .14, -h * .36, s * .03, 0, 7); g.arc(w * .14, -h * .36, s * .03, 0, 7); g.fill(); }
    g.restore();
  }
  function drawGoal(g, X, Y, s, lv, t, ink) {
    const [gx, gy, gw, gh] = lv.goal, x = X(gx + .2), y = Y(gy + gh), w = 3 * s;
    // 中に入っている鉛筆
    for (let i = 0; i < 5; i++) { g.save(); g.translate(x + w * (.2 + i * .15), y + s * .2); g.rotate((i - 2) * .12); g.fillStyle = ['#e65f4f', '#4f9be0', '#5cbf6a', '#f5c84c', '#b07cd8'][i]; g.fillRect(-s * .12, -s * (1.2 + (i % 2) * .3), s * .24, s * (1.2 + (i % 2) * .3)); g.restore(); }
    // 旗
    const fx = X(gx + 1.7), fy = Y(gy - .3);
    g.strokeStyle = ink; g.lineWidth = Math.max(1, s * .05); g.beginPath(); g.moveTo(fx, y); g.lineTo(fx, fy); g.stroke();
    g.fillStyle = '#e0483e'; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + s * .9, fy + s * .25 + Math.sin(t * 4) * s * .05); g.lineTo(fx, fy + s * .5); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(245,200,76,.25)'; g.fillRect(X(gx), Y(gy), gw * s, gh * s);
    g.fillStyle = ink; g.font = `900 ${Math.max(11, s * .36)}px 'Zen Maru Gothic',sans-serif`; g.textAlign = 'center'; g.fillText(T('ゴール'), X(gx + gw / 2), Y(gy) - s * .1);
    // 一番乗りの名前
    if (!S.pv) {
      const o = firstOf(lv.f), txt = o ? T('一番乗り：{0}', nameOf(o)) : T('一番乗りは、まだいない');
      g.font = `400 ${Math.max(11, s * .32)}px 'Yomogi','Zen Maru Gothic',sans-serif`; g.lineWidth = Math.max(2, s * .1); g.strokeStyle = 'rgba(255,255,255,.85)';
      g.strokeText(txt, X(gx + gw / 2), Y(gy) - s * .8); g.fillStyle = o ? '#e0483e' : ink; g.fillText(txt, X(gx + gw / 2), Y(gy) - s * .8);
    }
  }
  function drawEnts(g, X, Y, s, lv, r, t, ink) {
    const sTime = r ? r.t * FT.DT : t;
    g.lineWidth = Math.max(1, s * .05); g.strokeStyle = ink;
    for (const e of lv.ents) {
      if (e.k === 'fan') {
        g.strokeStyle = 'rgba(79,155,224,.45)'; const dir = Math.sign(e.f);
        for (let i = 0; i < 7; i++) { const yy = e.y + (i + .5) * e.h / 7, ph = ((t * 1.5 * dir + i * .37) % 1 + 1) % 1, xx = e.x + ph * e.w; g.beginPath(); g.moveTo(X(xx), Y(yy)); g.lineTo(X(xx + dir * .8), Y(yy)); g.stroke(); }
        g.strokeStyle = ink; const fx = dir > 0 ? e.x - .3 : e.x + e.w + .3; g.beginPath(); g.arc(X(fx), Y(e.y + e.h - 1), s * .5, 0, 7); g.stroke();
        for (let i = 0; i < 3; i++) { const a = t * 12 + i * 2.1; g.beginPath(); g.moveTo(X(fx), Y(e.y + e.h - 1)); g.lineTo(X(fx) + Math.cos(a) * s * .45, Y(e.y + e.h - 1) + Math.sin(a) * s * .45); g.stroke(); }
      } else if (e.k === 'sharp') {
        // 鉛筆けずり（回る刃）
        g.save(); g.translate(X(e.x), Y(e.y)); g.rotate(sTime * 5);
        g.fillStyle = '#9aa7b0'; g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = (i % 2 ? .75 : 1) * e.r * s; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#3a3a44'; g.beginPath(); g.arc(0, 0, e.r * s * .3, 0, 7); g.fill(); g.restore();
      } else if (e.k === 'blade') {
        g.fillStyle = '#c9d1d6'; g.beginPath(); g.moveTo(X(e.x), Y(e.y + e.h)); g.lineTo(X(e.x + e.w), Y(e.y)); g.lineTo(X(e.x + e.w), Y(e.y + e.h)); g.closePath(); g.fill(); g.stroke();
      } else if (e.k === 'plane') {
        const q = FT.planeAt(e, sTime); g.save(); g.translate(X(q.x), Y(q.y)); g.scale(q.dir, 1);
        g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(s * .6, 0); g.lineTo(-s * .55, -s * .25); g.lineTo(-s * .3, 0); g.lineTo(-s * .55, s * .2); g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(s * .6, 0); g.lineTo(-s * .3, 0); g.stroke(); g.restore();
      } else if (e.k === 'eraser') {
        const q = FT.eraserAt(e, sTime); g.fillStyle = '#ffffff'; sketchRect(g, X(q.x), Y(q.y), q.w * s, q.h * s, 77, 1); g.fill(); g.stroke();
        g.fillStyle = '#4f9be0'; g.fillRect(X(q.x), Y(q.y + q.h * .35), q.w * s, q.h * s * .4); g.strokeRect(X(q.x), Y(q.y + q.h * .35), q.w * s, q.h * s * .4);
        g.fillStyle = '#fff'; g.font = `900 ${Math.max(9, s * .34)}px sans-serif`; g.textAlign = 'center'; g.fillText(T('消'), X(q.x + q.w / 2), Y(q.y + q.h * .66));
      }
    }
  }
  // ---------- 演出 ----------
  function fxGo() { const p = S.run.p; S.trail = []; for (let i = 0; i < 8; i++) S.fx.push({ k: 'dust', x: p.x, y: p.y + .2, vx: (Math.random() - .5) * 3, vy: Math.random() * -2, t: 0, d: .5 }); }
  function fxLand() { const p = S.run.p; S.fx.push({ k: 'ring', x: p.x, y: p.y + .2, t: 0, d: .35 }); }
  function fxStick(pl) { S.shake = 6; const p = S.run.p; S.fx.push({ k: 'pop', x: p.x, y: p.y, t: 0, d: .6, txt: pl.why === 'stack' ? T('積み重なった') : T('ささった') }); for (let i = 0; i < 10; i++) S.fx.push({ k: 'dust', x: p.x, y: p.y + .2, vx: (Math.random() - .5) * 4, vy: -Math.random() * 3, t: 0, d: .6 }); }
  function fxBreak(r, pl) { S.shake = 9; const p = r.p; for (let i = 0; i < 16; i++) S.fx.push({ k: 'chip', x: p.x, y: p.y, vx: (Math.random() - .5) * 9, vy: -Math.random() * 8, t: 0, d: 1, c: ['#f5c84c', '#f2d3a2', '#3a3a44'][i % 3] }); S.fx.push({ k: 'pop', x: p.x, y: p.y - .5, t: 0, d: .8, txt: pl.why === 'cap' ? T('はじかれた') : pl.why === 'sink' ? T('ずぶずぶ…') : T('くだけた') }); }
  function fxClear() { const p = S.run.p; for (let i = 0; i < 40; i++) S.fx.push({ k: 'chip', x: p.x, y: p.y, vx: (Math.random() - .5) * 12, vy: -Math.random() * 12, t: 0, d: 1.6, c: ['#e65f4f', '#f5c84c', '#4f9be0', '#5cbf6a'][i % 4] }); S.fx.push({ k: 'pop', x: p.x, y: p.y - 1, t: 0, d: 1.2, txt: T('ゴール！') }); }
  let fxLast = 0;
  function drawFx(g, X, Y, s, t) {
    const dt = Math.min(.05, t - (fxLast || t)); fxLast = t;
    S.fx = S.fx.filter(f => (f.t += dt) < f.d);
    for (const f of S.fx) {
      const k = f.t / f.d;
      if (f.k === 'dust' || f.k === 'chip') { f.vy += 20 * dt; f.x += f.vx * dt; f.y += f.vy * dt; g.fillStyle = f.c || 'rgba(140,120,90,.7)'; g.globalAlpha = 1 - k; g.fillRect(X(f.x) - s * .05, Y(f.y) - s * .05, s * .1, s * .1); g.globalAlpha = 1; }
      else if (f.k === 'ring') { g.strokeStyle = 'rgba(224,72,62,' + (1 - k) + ')'; g.lineWidth = 2; g.beginPath(); g.ellipse(X(f.x), Y(f.y), s * (.3 + k), s * (.1 + k * .3), 0, 0, 7); g.stroke(); }
      else if (f.k === 'pop') { g.globalAlpha = Math.min(1, (1 - k) * 2); g.font = `900 ${Math.max(16, s * .6)}px 'Yomogi','Zen Maru Gothic',sans-serif`; g.textAlign = 'center'; g.lineWidth = 5; g.strokeStyle = '#fff'; g.strokeText(f.txt, X(f.x), Y(f.y) - k * s); g.fillStyle = '#e0483e'; g.fillText(f.txt, X(f.x), Y(f.y) - k * s); g.globalAlpha = 1; }
    }
  }
  // タイトルの背景：ノートと、ゆっくり飛ぶ鉛筆
  function drawTitleBg(t) {
    const g = cx; g.setTransform(dpr, 0, 0, dpr, 0, 0); paper(g, VW, VH, 0, t * 2, 0, 30, t);
    for (let i = 0; i < 7; i++) { const ph = (t * .12 + i / 7) % 1, x = VW * (ph * 1.4 - .2), y = VH * (.25 + .55 * hash(i, 4)) - Math.sin(ph * Math.PI) * VH * .18; drawPencil(g, x, y, 34, i, Math.PI / 2 - .6 + ph * 1.2, .5, 'rgba(43,43,51,.7)', false, t + i); }
  }
  // =============================================
  //  画面のボタン
  // =============================================
  function retry() { ov('oDead', 0); S.trail = []; if (S.lv) newLife(); }
  let verNew = false, verAt = 0;
  async function checkVer() {
    if (Date.now() - verAt < 180000) return; verAt = Date.now();
    try { const r = await fetch('data/ver.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return; const v = await r.json(); if (v && +v.v > +FT.VER && !verNew) { verNew = true; if (S.mode === 'title') location.reload(); else toast(T('新しい版があります'), T('タイトルに戻ると読みこみ直します'), 4000); } } catch (e) { }
  }
  setInterval(checkVer, 60000);
  function toTitle() {
    if (verNew) { N.flush().catch(() => { }).finally(() => location.reload()); return; }
    for (const o of document.querySelectorAll('.ov')) o.classList.remove('on');
    $('specBar').classList.remove('on'); $('watchBar').classList.remove('on'); document.body.classList.remove('view');
    if (S.mode === 'spec') { SP.d = null; try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { } }
    S.mode = 'title'; S.lv = null; S.run = null; scr('title'); document.body.classList.remove('dark'); hint(''); N.flush().catch(() => { });
    SND.bgm(null); refreshWorld().then(paintTitle); loadLive();
  }
  function openMenu() { if (S.mode === 'play' || S.mode === 'dead') { S.paused = true; ov('oMenu', 1); } }
  $('bPlay').onclick = () => { SND.unlock(); SND.se('start'); enterFloor(W.latest); };
  $('bFloors').onclick = () => openFloors();
  $('bBoard').onclick = () => openBoard();
  $('bHow').onclick = () => openHow();
  $('bSnd').onclick = $('mSnd').onclick = () => { SND.unlock(); SND.setOn(!SND.on); paintSnd(); };
  $('hMenu').onclick = () => openMenu();
  $('hLive').onclick = () => { if (liveList[0]) window.open(liveList[0].u, '_blank', 'noopener'); };
  $('mResume').onclick = () => { ov('oMenu', 0); S.paused = false; };
  $('mFloors').onclick = () => { ov('oMenu', 0); openFloors(); };
  $('mBoard').onclick = () => { ov('oMenu', 0); openBoard(); };
  $('mHow').onclick = () => { ov('oMenu', 0); openHow(); };
  $('mTitle').onclick = () => toTitle();
  $('mStuck').onclick = () => { ov('oMenu', 0); openStuck(); };
  $('dRetry').onclick = () => retry();
  $('dTitleBtn').onclick = () => toTitle();
  $('dX').onclick = () => shareX(deadText());
  $('dVid').onclick = () => makeVideo();
  $('cNext').onclick = () => { ov('oClear', 0); if (S.clearInfo && S.clearInfo.f < 100) enterFloor(S.clearInfo.f + 1); };
  $('cTitleBtn').onclick = () => toTitle();
  $('cX').onclick = () => shareX(clearText());
  $('cXSave').onclick = async () => {
    const ci = S.clearInfo; if (!ci || !ci.id) return;
    const wr = $('cName').value.trim(), w = N.cleanName(wr), xr = $('cXid').value.trim(), x = xr ? N.cleanX(xr) : '';
    if (wr && !w) { toast(T('その名前は使えません')); return; }
    if (xr && !x) { toast(T('XのIDの形ではありません')); return; }
    if (!w && !x) { toast(T('名前かXのIDを入れてください')); return; }
    if (Date.now() - (ci.at || 0) > 15 * 60000) { toast(T('書けるのは、越えてから15分のあいだだけです')); return; }
    $('cXSave').disabled = true;
    try {
      const r = await N.setFirst(ci.f, ci.id, w, x, ci.opened);
      if (x) { ME.xid = x; saveMe(); }
      if (ci.opened && W.open[ci.f] && W.open[ci.f].id === ci.id) { if (w) W.open[ci.f].w = w; if (x) W.open[ci.f].x = x; }
      toast(T('ノートに書きました'), r.all ? '' : T('一部は書けませんでした（書けるのは1回だけです）'));
      $('cFirst').hidden = true;
    } catch (e) { toast(T('書けませんでした'), T('書けるのは1回だけ・15分以内です')); }
    $('cXSave').disabled = false;
  };
  // ---------- 層をえらぶ ----------
  function openFloors() {
    const box = $('flList'); box.innerHTML = '';
    for (let f = 1; f <= 100; f++) {
      const b = document.createElement('button'); b.textContent = f;
      if (f > W.latest) b.disabled = true; else if (f === W.latest && !W.done) b.className = 'top'; else b.className = 'done';
      b.onclick = () => { ov('oFloors', 0); enterFloor(f); };
      b.onmouseenter = b.onfocus = () => info(f);
      box.appendChild(b);
    }
    const info = f => { const o = firstOf(f); $('flInfo').textContent = T('第{0}層 {1}', f, T(LEVELS[f - 1].n)) + (o ? ' ・ ' + T('一番乗り：{0}', nameOf(o) + (o.x ? ' @' + o.x : '')) : ''); };
    info(W.latest);
    ov('oFloors', 1);
  }
  $('flClose').onclick = () => ov('oFloors', 0);
  // ---------- 一番乗りノート（1ページ10層・最後のページは卒業生） ----------
  const NB = { page: 0, grads: null };
  const when = t => t ? new Date(t).toLocaleString(FT.LOCALE, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  async function openNote() {
    if (!LEVELS) return;
    NB.page = Math.min(9, Math.floor((Math.min(100, W.latest) - 1) / 10)); paintNote(); ov('oNote', 1);
    if (!OFFLINE) { refreshWorld().then(paintNote).catch(() => { }); N.grads().then(g => { NB.grads = g; paintNote(); }).catch(() => { }); }
  }
  function paintNote() {
    const p = NB.page, box = $('nbList'); box.innerHTML = '';
    $('nbPrev').disabled = p <= 0; $('nbNext').disabled = p >= 10;
    if (p < 10) {
      $('nbTitle').innerHTML = esc(T('第{0}〜{1}層', p * 10 + 1, p * 10 + 10)) + '<small>' + esc(T(LEVELS[p * 10].n)) + '</small>';
      for (let f = p * 10 + 1; f <= p * 10 + 10; f++) {
        const o = firstOf(f), d = document.createElement('div');
        if (o) { d.className = 'nbr'; d.innerHTML = `<i>${esc(T('第{0}層', f))}</i><b>${esc(nameOf(o))}</b><span>${o.x ? '@' + esc(o.x) : ''}</span><em>${esc(when(o.t))}</em>` + (!OFFLINE && o.id ? `<button class="nbw" data-w="${f}">${esc(T('▶ 見る'))}</button>` : ''); }
        else if (f === W.latest && !W.done) { d.className = 'nbr front'; d.innerHTML = `<i>${esc(T('第{0}層', f))}</i><b>${esc(T('いまの最前線'))}</b>`; }
        else { d.className = 'nbr none'; d.innerHTML = `<i>${esc(T('第{0}層', f))}</i><b>……</b>`; }
        box.appendChild(d);
      }
      $('nbFoot').textContent = T('その層をはじめて越えた人の名前が、ここに書かれる。');
      for (const b of box.querySelectorAll('[data-w]')) b.onclick = () => watchClear(+b.dataset.w);
    } else {
      $('nbTitle').innerHTML = esc(T('卒業生')) + '<small>' + esc(T('第100層を越えた人')) + '</small>';
      const list = (NB.grads && NB.grads.list) || [];
      if (!list.length) { const d = document.createElement('div'); d.className = 'nbr none'; d.innerHTML = `<i></i><b>${esc(T('まだだれも卒業していない'))}</b>`; box.appendChild(d); }
      list.forEach((o, i) => { const d = document.createElement('div'); d.className = 'nbr'; d.innerHTML = `<i>${i + 1}</i><b>${esc(nameOf(o))}</b><span>${o.x ? '@' + esc(o.x) : ''}</span><em>${esc(when(o.t))}</em>`; box.appendChild(d); });
      $('nbFoot').textContent = T('卒業生は15分ごとに書き足されます。');
    }
    box.scrollTop = 0;
  }
  $('bNote').onclick = () => openNote();
  $('nbPrev').onclick = () => { NB.page = Math.max(0, NB.page - 1); paintNote(); };
  $('nbNext').onclick = () => { NB.page = Math.min(10, NB.page + 1); paintNote(); };
  $('nbClose').onclick = () => ov('oNote', 0);
  // ---------- あそびかた ----------
  function openHow() {
    const L = ['指を置いて引っぱり、はなすと鉛筆が飛ぶ。引いた向きの反対へ、引いた長さの強さで飛ぶ（真上から左右60度まで）。',
      '鉛筆の上に落ちると、カチッとはまって、もう一度飛べる。',
      '地面に落ちたら、その場で芯を上にして刺さる。その鉛筆は、みんなの足場になる。',
      '壁や天井、鉛筆の横にぶつかると、真下に落ちて刺さる。下が鉛筆なら、上に積み重なる。',
      '赤い線より高くは積めない（はじかれる）。画びょう・刃・鉛筆けずり・紙ひこうきでは砕け、のりの上では沈んで、鉛筆は残らない。',
      '飛んでいる間は、画面の左・右を押すと、ほんの少しだけ動ける。',
      '鉛筆立て（ゴール）に入れば、その層を越える。だれかが越えると、次の層がみんなに開く。全100層。',
      'みんなの鉛筆は20秒ごとに届く。詰んだと思ったら、メニューの「詰みを知らせる」から。'];
    $('howList').innerHTML = L.map(s => `<li>${esc(T(s))}</li>`).join('');
    ov('oHow', 1); S.paused = true;
  }
  $('howClose').onclick = () => { ov('oHow', 0); S.paused = false; };
  // ---------- 掲示板 ----------
  const B = { list: [], last: 0, timer: 0 };
  async function openBoard() {
    if (OFFLINE) { toast(T('つなぎ先がないので、掲示板は使えません')); return; }
    S.paused = true; ov('oBoard', 1);
    if (!ME.bname) { ME.bname = newName(); saveMe(); }
    $('bdName').value = ME.bname; $('bdName').placeholder = T('名前'); $('bdMsg').placeholder = T('ひとこと（120文字まで）');
    $('bdPin').hidden = true; N.boardPin().then(p => { if (p && typeof p === 'string') { $('bdPin').hidden = false; $('bdPin').textContent = p; } });
    B.list = []; B.last = 0; await readBoard(); clearInterval(B.timer); B.timer = setInterval(readBoard, 12000);
  }
  async function readBoard() {
    try { const v = await N.boardRead('all', B.last); for (const c of v) { if (!B.list.some(x => x.id === c.id)) B.list.push(c); if (c.t > B.last) B.last = c.t; } B.list = B.list.slice(-80); paintBoard(); } catch (e) { }
  }
  function paintBoard() {
    const box = $('bdList'), me = N.boardUid(), atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
    box.innerHTML = '';
    for (const c of B.list) {
      if ((c.r | 0) >= 3 || ME.bhide.includes(c.id)) continue;
      const hidden = FT.BOARD_BAD(c.m) || FT.BOARD_BAD(c.n);
      const d = document.createElement('div'); d.className = 'bd';
      const tm = new Date(c.t).toLocaleTimeString(FT.LOCALE, { hour: '2-digit', minute: '2-digit' });
      d.innerHTML = `<div class="bh"><b>${esc(hidden ? T('名無し') : N.cleanName(c.n))}</b><span>${esc(T('第{0}層', c.f || 1))}</span><span>${tm}</span>${c.u === me ? '' : `<button data-a="r">${esc(T('通報'))}</button>`}<button data-a="h">${esc(T('隠す'))}</button></div><div>${esc(hidden ? T('（見せられない言葉が入っていたので隠しました）') : c.m)}</div>`;
      d.onclick = async ev => {
        const a = ev.target.dataset && ev.target.dataset.a; if (!a) return;
        ME.bhide = ME.bhide.concat(c.id).slice(-300); saveMe(); paintBoard();
        if (a === 'r') { try { await N.boardReport('all', c.id); } catch (e) { } toast(T('通報しました。ありがとうございます')); } else toast(T('隠しました'));
      };
      box.appendChild(d);
    }
    if (!box.children.length) box.innerHTML = `<div class="bd small">${esc(T('まだ書きこみはありません'))}</div>`;
    if (atEnd) box.scrollTop = box.scrollHeight;
  }
  $('bdSend').onclick = async () => {
    const m = $('bdMsg').value.trim(), n = N.cleanName($('bdName').value.trim());
    const e1 = FT.BOARD_CHECK(m); if (e1) { toast(e1); return; }
    if (!n) { toast(T('名前を入れてください')); return; }
    if (FT.BOARD_BAD(n)) { toast(T('その名前は使えません')); return; }
    const wait = ME.bpost + 20000 - Date.now(); if (wait > 0) { toast(T('あと{0}秒まってください', Math.ceil(wait / 1000))); return; }
    ME.bname = n; ME.bpost = Date.now(); saveMe();
    try { await N.boardPost('all', { n, m, l: FT.LANG, f: W.latest }); $('bdMsg').value = ''; await readBoard(); } catch (e) { ME.bpost = Date.now() - 17000; saveMe(); toast(T('書きこめませんでした'), T('少し待ってもう一度')); }
  };
  $('bdClose').onclick = () => { ov('oBoard', 0); clearInterval(B.timer); S.paused = false; };
  // ---------- 詰みを知らせる ----------
  function openStuck() {
    if (!S.lv) return;
    $('stText').textContent = T('いまの鉛筆のままで第{0}層を越えられるかを、この端末で自動で調べてから管理人に届けます（30秒ほど）。', S.lv.f);
    $('stGo').disabled = false; ov('oStuck', 1); S.paused = true;
  }
  $('stClose').onclick = () => { ov('oStuck', 0); S.paused = false; };
  $('stGo').onclick = async () => {
    const lv = S.lv; if (!lv) return;
    $('stGo').disabled = true; $('stText').innerHTML = `<span class="spin"></span> ${esc(T('調べています…'))}`;
    const cor = [...S.cor].map(([k, c]) => [k, { n: c.n }]);
    let res = null;
    try { res = await N.inWorker('stuck', { lv: N.plainLv(lv), cor, opt: { ms: 25000, max: 40 } }, () => ({ ok: null, why: 'noworker' })); } catch (e) { res = { ok: null, why: 'err' }; }
    let a, msg;
    if (res && res.ok === true) { a = `越えられる（あと${res.need}本で届いた・${Math.round(res.ms / 1000)}秒）`; msg = res.need === 0 ? T('いまの鉛筆だけで、越えられる道が見つかりました。') : T('あと{0}本ほど鉛筆が増えれば、越えられそうです。', res.need); }
    else if (res && res.ok === false && (res.why === 'max' || res.why === 'time')) { a = `まだ足りないだけ（${res.why}・${res.need}本足してもまだ届かず・いちばん先 x=${Math.round(res.far || 0)}）`; msg = T('まだ鉛筆が足りないだけのようです（{0}本以上いりそうです）。管理人にも届けます。', res.need); }
    else if (res && res.ok === false) { a = `越えられない（${res.why}・${res.need}本足しても届かず・いちばん先 x=${Math.round(res.far || 0)}）`; msg = T('この形では越えられないかもしれません。管理人が確かめます。'); }
    else { a = '自動の判定ができなかった'; msg = T('この端末では調べられませんでした。そのまま管理人に届けます。'); }
    const m = S.run ? Math.round((S.run.p.maxX - lv.start[0]) / (lv.goal[0] - lv.start[0]) * 1000) : 0;
    const ex = { c: FT.corStr(S.cor) }; if (S.run) { ex.x = S.run.p.x; ex.y = S.run.p.y; }
    try { if (!OFFLINE) await N.report(lv.f, m, a, FT.LANG, ex); $('stText').textContent = msg + ' ' + T('管理人に届けました。ありがとうございます。'); }
    catch (e) { $('stText').textContent = msg + ' ' + T('届けられませんでした（10秒に1回まで）'); $('stGo').disabled = false; }
  };
  // ---------- 管理人への相談 ----------
  function openAsk() {
    if (OFFLINE) { toast(T('つなぎ先がないので、相談は送れません')); return; }
    $('askMsg').placeholder = T('相談したいこと（300文字まで）'); $('askX').placeholder = T('XのID（なくてもよい）');
    if (ME.xid && !$('askX').value) $('askX').value = '@' + ME.xid;
    $('askDone').hidden = true; $('askSend').disabled = false; ov('oAsk', 1); S.paused = true;
  }
  $('bAsk').onclick = () => openAsk();
  $('askClose').onclick = () => { ov('oAsk', 0); S.paused = false; };
  $('askSend').onclick = async () => {
    const m = $('askMsg').value.trim(), xr = $('askX').value.trim(), x = xr ? N.cleanX(xr) : '';
    if (!m) { toast(T('文を入れてください')); return; }
    if (m.length > 300) { toast(T('{0}文字までです', 300)); return; }
    if (xr && !x) { toast(T('XのIDの形ではありません')); return; }
    const wait = (ME.askT || 0) + 60000 - Date.now(); if (wait > 0) { toast(T('あと{0}秒まってください', Math.ceil(wait / 1000))); return; }
    $('askSend').disabled = true;
    try {
      await N.ask(m, x, FT.LANG, W.latest);
      ME.askT = Date.now(); if (x) ME.xid = x; saveMe();
      $('askMsg').value = ''; $('askDone').hidden = false; $('askDone').textContent = T('管理人に届けました。ありがとうございます。');
    } catch (e) { toast(T('送れませんでした'), T('少したってから、もう一度')); }
    $('askSend').disabled = false;
  };
  // ---------- 投稿 ----------
  function deadText() { const d = S.deadInfo; if (!d) return ''; return (d.k >= 0 ? T('エンピツライフ 第{0}層で{1}本目の鉛筆になった。名前は「{2}」', d.f, fmt(d.count), d.name) : T('エンピツライフ 第{0}層で「{1}」は砕けた', d.f, d.name)) + '\n' + GAME_URL + '\n' + TAG; }
  function clearText() { const c = S.clearInfo; if (!c) return ''; return (c.opened ? T('エンピツライフ 第{0}層を一番乗りで越えた！', c.f) : T('エンピツライフ 第{0}層を越えた！', c.f)) + '\n' + GAME_URL + '\n' + TAG; }
  function shareX(text) { window.open('https://x.com/intent/post?text=' + encodeURIComponent(text), '_blank', 'noopener'); }
  // =============================================
  //  観戦モード（管理画面の「詰みの知らせ」から開く：知らせた人に見えていた鉛筆と、立っていた所を見る）
  // =============================================
  const SP = { d: null, then: null, now: null, showNow: false, pts: new Map(), pinch: null };
  function specFromHash() { const m = /^#spec=(.+)$/.exec(location.hash || ''); if (!m) return null; try { const d = JSON.parse(decodeURIComponent(m[1])); return d && d.f >= 1 && d.f <= 100 ? d : null; } catch (e) { return null; } }
  async function startSpec(d) {
    const f = Math.max(1, Math.min(100, d.f | 0)), lv = getLevel(f);
    for (const o of document.querySelectorAll('.ov')) o.classList.remove('on');
    S.lv = lv; S.run = null; S.aim = null; S.trail = []; S.fx = []; S.mode = 'spec'; S.paused = false;
    SP.d = d; SP.then = d.c ? FT.corParse(d.c) : null; SP.now = null; SP.showNow = !SP.then; SP.pts.clear(); SP.pinch = null;
    S.cor = SP.then || new Map();
    scr('game'); document.body.classList.add('view'); document.body.classList.toggle('dark', lv.theme === 2 || lv.theme === 7); SND.bgm(null);
    $('watchBar').classList.remove('on'); $('specBar').classList.add('on'); specFocus(); specHud();
    if (SP.showNow) await specNow();
  }
  async function specNow() {
    const lv = S.lv; if (!lv) return;
    if (!SP.now) { hint(T('よみこみ中…')); try { SP.now = OFFLINE ? localCor(lv.f) : await N.loadCells(lv); } catch (e) { SP.now = new Map(); toast(T('みんなの鉛筆を読めませんでした')); } hint(''); }
    if (S.mode === 'spec' && SP.showNow) S.cor = SP.now;
    specHud();
  }
  // 印の場所（立っていた所。古い知らせは、いちばん先まで行った割合の所）
  function specPos() { const d = SP.d, lv = S.lv; if (Number.isFinite(d.x) && Number.isFinite(d.y)) return { x: d.x, y: d.y, exact: true }; return { x: lv.start[0] + (lv.goal[0] - lv.start[0]) * Math.max(0, Math.min(1000, d.m | 0)) / 1000, y: lv.start[1] - 2, exact: false }; }
  function specFocus() { const q = specPos(); S.cam.x = q.x; S.cam.y = q.y - 2; S.cam.z = 16; specCam(); }
  function specCam() { const lv = S.lv, c = S.cam; if (!lv) return; c.z = Math.max(6, Math.min(48, c.z)); const half = c.z / 2, viewH = (VH / VW) * c.z; c.x = Math.max(half - 2, Math.min(lv.w - half + 2, c.x)); c.y = Math.max(viewH / 2 - 4, Math.min(lv.h - viewH / 2 + 2, c.y)); }
  function specHud() {
    const d = SP.d, lv = S.lv; if (!d || !lv) return;
    $('hFloor').innerHTML = `${esc(T('観戦モード'))} ${esc(T('第{0}層', lv.f))} ${esc(T(lv.name))}<small>${esc(when(d.t))} ・ ${esc(T('いちばん先 {0}%', Math.floor((d.m | 0) / 10)))}${d.a ? ' ・ ' + esc(d.a) : ''}</small>`;
    $('spTog').textContent = SP.showNow ? T('知らせたときの鉛筆にする') : T('いまの鉛筆にする'); $('spTog').disabled = !SP.then;
    $('spNote').textContent = SP.showNow ? (SP.then ? T('いまの鉛筆を出しています') : T('この知らせには鉛筆の記録がないので、いまの鉛筆を出しています')) : T('知らせた人に見えていた鉛筆を出しています');
    paintFront();
  }
  $('spTog').onclick = () => { if (!SP.then) return; SP.showNow = !SP.showNow; if (SP.showNow) specNow(); else { S.cor = SP.then; specHud(); } };
  $('spFocus').onclick = () => specFocus();
  $('spClose').onclick = () => { if (window.opener && !window.opener.closed) { try { window.close(); } catch (e) { } } setTimeout(() => toTitle(), 150); };
  function drawSpecMark(g, X, Y, s, ink, t) {
    const q = specPos(), lv = S.lv, fs = Math.max(12, s * .42);
    g.font = `900 ${fs}px 'Zen Maru Gothic',sans-serif`; g.textAlign = 'center';
    if (q.exact) {
      drawPencil(g, X(q.x), Y(q.y + PH.HB), s, 999, 0, .9, ink, true, 0);
      g.strokeStyle = `rgba(224,72,62,${.5 + .4 * Math.sin(t * 4)})`; g.lineWidth = 3; g.beginPath(); g.arc(X(q.x), Y(q.y), s * (.95 + .15 * Math.sin(t * 4)), 0, 7); g.stroke();
      const label = T('ここで知らせた'), tx = X(q.x), ty = Y(q.y) - s * 1.4, w = g.measureText(label).width + fs, h = fs * 1.7;
      g.fillStyle = 'rgba(255,253,246,.96)'; g.strokeStyle = '#e0483e'; g.lineWidth = 2.5; g.beginPath(); if (g.roundRect) g.roundRect(tx - w / 2, ty - h, w, h, 7); else g.rect(tx - w / 2, ty - h, w, h); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(tx - 6, ty); g.lineTo(tx, ty + 8); g.lineTo(tx + 6, ty); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#e0483e'; g.textBaseline = 'middle'; g.fillText(label, tx, ty - h / 2); g.textBaseline = 'alphabetic';
    } else {
      g.strokeStyle = 'rgba(224,72,62,.85)'; g.lineWidth = 3; g.setLineDash([9, 7]); g.beginPath(); g.moveTo(X(q.x), Y(-2)); g.lineTo(X(q.x), Y(lv.h)); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#e0483e'; g.fillText(T('いちばん先 {0}%', Math.floor((SP.d.m | 0) / 10)), X(q.x), Y(q.y) - s);
    }
  }
  // =============================================
  //  動きを見る（その層をはじめて越えた人の動きを、その人に見えていた鉛筆のまま、同じ計算で再生する）
  // =============================================
  const WT = { c: null, f: 0, name: '', view: null, use: null, gos: [], inp: null, lim: 0, speed: 1, done: false };
  const parseGos = r => String(r || '').split('.').map(v => /^([0-9a-z]+)g([0-9a-z]+)p([0-9a-z]+)$/.exec(v)).filter(Boolean).map(m => [parseInt(m[1], 36), parseInt(m[2], 36), parseInt(m[3], 36)]);
  async function watchClear(f) {
    const o = firstOf(f);
    if (!o || !o.id || OFFLINE) { toast(T('記録が読めませんでした')); return; }
    toast(T('記録を読んでいます…'), '', 2500);
    let c = null; try { c = await N.rest('clear/' + f + '/' + o.id); } catch (e) { c = null; }
    if (!c || typeof c.r !== 'string') { toast(T('記録が読めませんでした')); return; }
    const lv = getLevel(f), view = FT.corParse(c.c || ''), lim = Math.min(120 * 60 * 10, (c.k | 0) + 2);
    let use = view;
    if (!FT.replay(lv, view, c.r, lim).clear) {
      // 見えていた鉛筆のままでは同じにならないとき：確かめ済みの鉛筆だけで（まとめの確かめと同じ形）
      try { await N.loadCells(lv); const ts = FT.V.trustSnap(lv, view, N.present(lv)); if (FT.replay(lv, ts.m, c.r, lim).clear) use = ts.m; } catch (e) { }
    }
    Object.assign(WT, { c, f, name: nameOf(o), view, use, gos: parseGos(c.r), lim });
    startWatch();
  }
  function startWatch() {
    const lv = getLevel(WT.f);
    for (const o of document.querySelectorAll('.ov')) o.classList.remove('on');
    S.lv = lv; S.cor = new Map(WT.view); S.run = new FT.Run(lv, WT.use); WT.inp = FT.Rec.parse(WT.c.r); WT.done = false;
    S.trail = []; S.fx = []; S.aim = null; S.acc = 0; S.shake = 0;
    const p = S.run.p; S.cam.x = p.x + 3; S.cam.y = p.y - 2; S.cam.z = 13;
    S.mode = 'watch'; S.paused = false;
    scr('game'); document.body.classList.add('view'); document.body.classList.toggle('dark', lv.theme === 2 || lv.theme === 7); SND.bgm(Math.min(10, lv.theme));
    $('specBar').classList.remove('on'); $('watchBar').classList.add('on'); $('wSpeed').textContent = '×' + WT.speed;
    $('hFloor').innerHTML = `▶ ${esc(T('第{0}層', lv.f))} ${esc(T(lv.name))}<small>${esc(T('一番乗り「{0}」の動き', WT.name))}</small>`;
    paintFront();
  }
  function watchTick() {
    const r = S.run; if (!r || r.over || WT.done) return;
    r.step(WT.inp(r.t + 1));
    for (const e of r.events) { if (e.k === 'go') { SND.se('jump'); fxGo(); } if (e.k === 'land') { SND.se('grab'); fxLand(); } }
    r.events.length = 0;
    if (r.p.fly) { S.trail.push([r.p.x, r.p.y]); if (S.trail.length > 40) S.trail.shift(); S.aim = null; }
    else { const g = WT.gos.find(q => q[0] > r.t); S.aim = g && g[0] - r.t <= 60 ? { ai: g[1], pw: g[2], deg: g[1] / 2 - PH.AMAX } : null; }
    if (r.over || r.t >= WT.lim) watchEnd();
  }
  function watchEnd() {
    const r = S.run; if (WT.done) return; WT.done = true; S.aim = null;
    if (r.clear) { fxClear(); SND.se('clear'); toast(T('鉛筆立てに入った！'), T('{0}秒', (r.t * FT.DT).toFixed(1)), 2600); return; }
    if (r.place && r.place.k >= 0) { S.cor.set(r.place.k, { n: r.place.n, name: '' }); fxStick(r.place); } else fxBreak(r, r.place || {});
    r.over = true; toast(T('再生がずれました'), T('この記録は、いまの鉛筆では同じ動きになりませんでした'), 3000);
  }
  $('wSpeed').onclick = () => { WT.speed = WT.speed === 1 ? 2 : WT.speed === 2 ? 4 : 1; $('wSpeed').textContent = '×' + WT.speed; };
  $('wAgain').onclick = () => { if (WT.c) startWatch(); };
  $('wClose').onclick = () => { toTitle(); openNote(); };
  // ---------- 動画（さいごの数秒を、同じ計算で再生して録画） ----------
  let vidBlob = null;
  async function makeVideo() {
    const d = S.deadInfo; if (!d) return;
    const M = typeof MediaRecorder !== 'undefined' ? MediaRecorder : null;
    const mime = M && ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => M.isTypeSupported && M.isTypeSupported(m));
    ov('oVid', 1); $('vPlay').hidden = true; $('vShare').hidden = true; $('vSave').hidden = true;
    if (!mime) { $('vText').textContent = T('この端末では動画を作れませんでした'); return; }
    $('vText').innerHTML = `<span class="spin"></span> ${esc(T('動画を作っています…'))}`;
    const vc = document.createElement('canvas'); vc.width = 720; vc.height = 1280; const g = vc.getContext('2d');
    const keep = { run: S.run, trail: S.trail, fx: S.fx, mode: S.mode, cam: S.cam, aim: S.aim, cor: S.cor };
    const lv = S.lv, run = new FT.Run(lv, d.startCor), inp = FT.Rec.parse(d.rec);
    const startT = Math.max(0, d.ticks - 120 * 5);
    while (run.t < startT && !run.over) run.step(inp(run.t + 1));
    S.run = run; S.trail = []; S.fx = []; S.mode = 'play'; S.aim = null; S.cam = { x: run.p.x + 2, y: run.p.y - 2, z: 15 }; S.cor = d.startCor;
    const stream = vc.captureStream(30), rec = new M(stream, { mimeType: mime, videoBitsPerSecond: 3500000 }), chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(res => rec.onstop = res);
    rec.start();
    const label = g2 => { g2.fillStyle = 'rgba(255,253,246,.9)'; g2.fillRect(0, 0, 360, 74); g2.fillStyle = '#2b2b33'; g2.font = "900 26px 'Zen Maru Gothic',sans-serif"; g2.textAlign = 'left'; g2.fillText(T('第{0}層 {1}', lv.f, T(lv.name)), 16, 34); g2.font = "500 18px 'Zen Maru Gothic',sans-serif"; g2.fillText('「' + d.name + '」', 16, 60); };
    const end = d.ticks + 120 * 2.2; let lastFrame = performance.now(), after = 0;
    await new Promise(res => {
      const step = () => {
        const now = performance.now(), dt = Math.min(.05, (now - lastFrame) / 1000); lastFrame = now;
        let n = Math.round(dt * 120);
        while (n-- > 0 && run.t < end) { if (!run.over) { run.step(inp(run.t + 1)); if (run.p.fly) S.trail.push([run.p.x, run.p.y]); if (run.over) { if (run.place && run.place.k >= 0) { S.cor = new Map(d.startCor); S.cor.set(run.place.k, { n: run.place.n, name: d.name }); fxStick(run.place); } else fxBreak(run, run.place || {}); S.mode = 'dead'; } } else { run.t++; after++; } }
        camera(dt); draw(g, 360, 640, 2, S.cam, now / 1000, { label });
        if (run.t >= end) {
          g.setTransform(2, 0, 0, 2, 0, 0); g.fillStyle = 'rgba(255,253,246,.94)'; g.fillRect(20, 430, 320, 150); g.strokeStyle = '#2b2b33'; g.lineWidth = 3; g.strokeRect(20, 430, 320, 150);
          g.fillStyle = '#2b2b33'; g.textAlign = 'center'; g.font = "900 22px 'Yomogi','Zen Maru Gothic',sans-serif";
          g.fillText(d.k >= 0 ? T('{0}本目の鉛筆になった', fmt(d.count)) : T('鉛筆は残らなかった'), 180, 470); g.font = "900 30px 'Yomogi',sans-serif"; g.fillText(T('エンピツライフ'), 180, 515); g.font = "500 15px sans-serif"; g.fillText('nasubi-no-oniwa.github.io/enpitsu-life', 180, 545); g.fillText(TAG, 180, 566);
          setTimeout(res, 1300); return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    rec.stop(); await done;
    Object.assign(S, keep);
    vidBlob = new Blob(chunks, { type: mime.split(';')[0] });
    const url = URL.createObjectURL(vidBlob); $('vPlay').src = url; $('vPlay').hidden = false; $('vPlay').play().catch(() => { });
    $('vText').textContent = T('約{0}秒の動画ができました', Math.round((end - startT) / 120 + 1.3));
    const file = new File([vidBlob], 'enpitsu-life.' + (mime.includes('mp4') ? 'mp4' : 'webm'), { type: vidBlob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { $('vShare').hidden = false; $('vShare').onclick = () => navigator.share({ files: [file], text: deadText() }).catch(() => { }); }
    $('vSave').hidden = false; $('vSave').onclick = () => { const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); };
  }
  $('vClose').onclick = () => { ov('oVid', 0); $('vPlay').pause(); };
  // =============================================
  //  はじまり
  // =============================================
  // いま遊んでいる人の数（管理画面の同接）：見えている間、1分ごとに「いる」と知らせる（タイトルは0、遊んでいる層の番号）
  const pingNow = () => { if (OFFLINE || document.hidden) return; N.ping(S.mode === 'title' || !S.lv ? 0 : S.lv.f); };
  setInterval(pingNow, 60000); setTimeout(pingNow, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(pingNow, 1500); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { N.flush().catch(() => { }); if (S.mode === 'play') S.paused = true; } else if (S.mode === 'play' && !anyOv()) S.paused = false; });
  window.addEventListener('pagehide', () => N.flush().catch(() => { }));
  i18nAll(); paintTitle();
  requestAnimationFrame(loop);
  fetch('data/levels.json?v=' + FT.VER).then(r => r.json()).then(v => { LEVELS = v; const sd = specFromHash(); if (sd) startSpec(sd); return refreshWorld(); }).then(() => { paintTitle(); loadLive(true); if (S.mode === 'spec') specHud(); }).catch(() => toast(T('読みこめませんでした'), T('読みこみ直してください')));
  if (!OFFLINE) N.warm();
  // 管理画面などから使う
  FT.APP = { S, W, ME, getLevel, draw, toast, tick, camera, newLife, enterFloor, drawTitleBg, drawPencil, paper, paintTitle, hud,
    // 試験用：越えた記録を、読みこまずにそのまま再生する
    watchRec: (f, c, name) => { const view = FT.corParse(c.c || ''); Object.assign(WT, { c, f, name: name || '', view, use: view, gos: parseGos(c.r), lim: Math.min(120 * 60 * 10, (c.k | 0) + 2) }); startWatch(); } };
})(window);
