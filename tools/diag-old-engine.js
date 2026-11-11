// =============================================
//  エンピツライフ  動きの計算（決まった答え）
//  ・1/120秒ずつ進める。同じ層・同じ鉛筆・同じ操作なら、どの端末でも必ず同じ結果
//    （Math.sin などは使わず、表をひいて計算する。乱数も使わない）
//  ・鉛筆の上に立って、引っぱって飛ぶ。放物線で飛び、空中ではほんの少しだけ動かせる
//  ・鉛筆の上に落ちると、カチッとはまって、もう一度飛べる
//  ・地面に落ちると、芯を上にしてそこに刺さる（死ぬ）。その鉛筆は、みんなの足場になる
//  ・壁や天井、鉛筆の横にぶつかると、真下に落ちて刺さる（下が鉛筆なら上に積み重なる）
//  ・トゲ・刃・鉛筆けずり・紙ひこうきに当たると砕けて消える。のり・修正液の上では沈んで消える
//  ・積める高さには上限がある（赤い線）。こえる鉛筆ははじかれて消える
// =============================================
(function (G) {
  const FT = G.FT = G.FT || {};
  const DT = FT.DT = 1 / 120;
  // ---------- 決まった答えの sin（表）。p：1で1周 ----------
  const SIN = new Float64Array(1024);
  for (let i = 0; i < 1024; i++) { let x = i / 1024 * 6.283185307179586; if (x > 3.141592653589793) x -= 6.283185307179586; const x2 = x * x; SIN[i] = x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110 * (1 - x2 / 156)))))); }
  const dsin = p => SIN[((Math.floor(p * 1024) % 1024) + 1024) % 1024];
  const dcos = p => dsin(p + 0.25);
  FT.dsin = dsin; FT.dcos = dcos;
  const tri = v => { const f = v - Math.floor(v); return f < .5 ? f * 2 : 2 - f * 2; };
  FT.tri = tri;
  // ---------- マスの種類 ----------
  //  BLOCK：ポッチのあるブロック（地面）  BOOK：教科書・定規の壁（地面と同じ固さ）
  //  SPIKE：コンパスの針・画びょう（砕ける）  GLUE：のり・修正液（上に落ちると沈んで消える）
  const T = FT.T = { AIR: 0, BLOCK: 1, BOOK: 2, SPIKE: 3, GLUE: 4 };
  // ---------- 決まった数（マス・秒） ----------
  const GRAV = 30;            // 重さ
  const VMAX = 21;            // いちばん強く飛んだときの速さ（真上なら約7.3マス上がる）
  const PMIN = 0.12;          // いちばん弱く飛んだとき
  const AMAX = 60;            // 角度の上限（真上から左右に60度まで）
  const STEER = 2.4, SMAX = 1.3;   // 空中で動かせる量（加速・最初の速さからの差の上限）
  const HB = 0.18;            // 飛んでいる鉛筆の当たりの半分の大きさ
  const CW = 0.5;             // 鉛筆1本の列の幅（1マスに2列）
  const PH = 0.9;             // 鉛筆1本の高さ
  const CATCH = 0.3;          // 鉛筆の上に落ちたとき、少しずれても吸いつく幅（左右それぞれ）
  const FALLMAX = 26;
  const GRABD = 0.6;          // 鉛筆の山の横に当たっても、上の角からこれより上なら乗れる
  FT.PHYS = { GRAV, VMAX, PMIN, AMAX, HB, CW, PH, CATCH, GRABD };
  // 鉛筆の場所の番号：その面の高さ（マス）× 4096 ＋ 列の番号
  const KC = 4096;
  const ck = (sy, col) => sy * KC + col;
  FT.ckey = ck;
  FT.kcol = k => k % KC; FT.ksy = k => Math.floor(k / KC);
  FT.colX = col => col * CW + CW / 2;   // 列のまん中
  FT.colOf = x => Math.floor(x / CW);
  // ---------- 角度と強さ（操作の記録に入る形） ----------
  //  a：角度の番号 0〜240（0.5度きざみ、120がまっすぐ上）  p：強さ 0〜1000
  FT.aIdx = deg => Math.max(0, Math.min(240, Math.round((deg + AMAX) * 2)));
  FT.aDeg = i => i / 2 - AMAX;
  FT.launchV = (ai, pw) => {
    const deg = FT.aDeg(Math.max(0, Math.min(240, ai | 0))), pp = PMIN + (1 - PMIN) * Math.max(0, Math.min(1000, pw | 0)) / 1000, v = VMAX * pp, t = deg / 360;
    return { vx: dsin(t) * v, vy: -dcos(t) * v };
  };
  // ---------- 動く仕掛けの位置（時刻だけで決まる） ----------
  //  plane：紙ひこうき { x1, x2, y, per：往復の秒, off }
  FT.planeAt = (e, s) => ({ x: e.x1 + (e.x2 - e.x1) * tri(s / e.per + (e.off || 0)), y: e.y + dsin(s / 1.7 + (e.off || 0)) * 0.25, dir: (((s / e.per + (e.off || 0)) % 1) + 1) % 1 < .5 ? 1 : -1 });
  //  sharp：鉛筆けずり（回る刃） { x, y, r }   blade：カッターの刃 { x, y, w, h }   fan：扇風機の風 { x, y, w, h, f：横の強さ（+右）}
  //  eraser：上下に動く消しゴム { x, y1, y2, w, h, per, off }
  FT.eraserAt = (e, s) => ({ x: e.x, y: e.y1 + (e.y2 - e.y1) * tri(s / e.per + (e.off || 0)), w: e.w, h: e.h });
  // ---------- 層 ----------
  //  lv：{ f, w, h, tiles(Uint8Array w*h), cap(Int8Array w：その列に積める本数。0 は残らない), start:[x, y], goal:[x, y, w, h], ents:[] }
  // ---------- 1回の挑戦 ----------
  //  cor：Map(場所の番号 → { n：積み重なった本数, ... })
  class Run {
    constructor(lv, cor) {
      this.lv = lv; this.W = lv.w; this.H = lv.h; this.tiles = lv.tiles; this.cap = lv.cap;
      this.cor = cor;
      // 列ごとの鉛筆の山（ぶつかりの計算を軽くする）
      this.cols = new Map();
      for (const [k, c] of cor) { const col = FT.kcol(k), sy = FT.ksy(k), n = Math.min(c.n | 0, 30); if (n <= 0) continue; let a = this.cols.get(col); if (!a) this.cols.set(col, a = []); a.push({ k, sy, n, top: sy - n * PH }); }
      this.t = 0; this.over = false; this.clear = false; this.dead = null; this.place = null;
      // 立っている（stand：立っている山。null はスタートの台）
      const st = lv.start;
      this.p = { x: st[0], y: st[1] - HB, vx: 0, vy: 0, fly: false, vx0: 0, on: -1, ang: 0, hops: 0, maxX: st[0] };
      this.events = [];
      this.trail = [];
    }
    ev(k, a) { this.events.push({ k, t: this.t, a }); }
    tile(x, y) { if (x < 0 || x >= this.W) return T.BLOCK; if (y < 0) return T.AIR; if (y >= this.H) return T.AIR; return this.tiles[y * this.W + x]; }
    solidT(c) { return c === T.BLOCK || c === T.BOOK || c === T.GLUE; }
    solid(tx, ty) { return this.solidT(this.tile(tx, ty)); }
    capAt(tx) { return tx >= 0 && tx < this.W ? this.cap[tx] : 0; }
    // 箱が固いマスに重なるか
    boxHitsTile(x, y) {
      const x0 = Math.floor(x - HB), x1 = Math.floor(x + HB - 1e-9), y0 = Math.floor(y - HB), y1 = Math.floor(y + HB - 1e-9);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.solid(tx, ty)) return true;
      return false;
    }
    // 箱が鉛筆の山に重なるか（重なった山を返す）
    boxHitsStack(x, y) {
      const c0 = FT.colOf(x - HB), c1 = FT.colOf(x + HB - 1e-9);
      for (let c = c0; c <= c1; c++) { const a = this.cols.get(c); if (!a) continue; for (const s of a) if (y + HB > s.top && y - HB < s.sy) return s; }
      return null;
    }
    // ---------- 1つ進める ----------
    //  inp：{ L：0/1 左へ, R：0/1 右へ, go：[角度の番号, 強さ]（飛ぶ瞬間だけ） }
    step(inp) {
      if (this.over) return;
      this.t++;
      const p = this.p, lv = this.lv, s = this.t * DT;
      if (!p.fly) {
        if (inp && inp.go) {
          const v = FT.launchV(inp.go[0], inp.go[1]);
          p.vx = v.vx; p.vy = v.vy; p.vx0 = v.vx; p.fly = true; p.hops++;
          p.y -= 0.02;   // 足もとの鉛筆から少しはなす
          this.ev('go', inp.go);
        }
        return;
      }
      // 空中：重さ・風・ほんの少しの操作
      const dir = inp ? ((inp.R ? 1 : 0) - (inp.L ? 1 : 0)) : 0;
      p.vy = Math.min(FALLMAX, p.vy + GRAV * DT);
      if (dir) { p.vx += dir * STEER * DT; if (p.vx > p.vx0 + SMAX) p.vx = p.vx0 + SMAX; if (p.vx < p.vx0 - SMAX) p.vx = p.vx0 - SMAX; }
      for (const e of lv.ents) if (e.k === 'fan' && p.x > e.x && p.x < e.x + e.w && p.y > e.y && p.y < e.y + e.h) { p.vx += e.f * DT; p.vx0 += e.f * DT; }
      const nx = p.x + p.vx * DT, ny0 = p.y + p.vy * DT;
      // 鉛筆の山の上に落ちた：乗れる（少しずれても吸いつく）。横にぶつかるより先に調べる
      if (p.vy > 0) {
        const b0 = p.y + HB, b1 = ny0 + HB;
        const c0 = FT.colOf(nx - CATCH - CW / 2), c1 = FT.colOf(nx + CATCH + CW / 2);
        let best = null, bd = 1e9;
        for (let c = c0; c <= c1; c++) {
          const a = this.cols.get(c); if (!a) continue;
          for (const st of a) {
            if (b0 > st.top + 1e-6 || b1 < st.top) continue;
            const d = Math.abs(FT.colX(c) - nx);
            if (d > CW / 2 + CATCH) continue;
            if (d < bd) { bd = d; best = st; }
          }
        }
        if (best) return this.land(best);
      }
      // 横に動かす
      if (this.boxHitsTile(nx, p.y)) return this.crash('wall');
      { const hs = this.boxHitsStack(nx, p.y); if (hs) { if (this.grab(hs)) return this.land(hs); return this.crash('side'); } }
      p.x = nx;
      if (p.x > p.maxX) p.maxX = p.x;
      // 縦に動かす
      const ny = p.y + p.vy * DT;
      if (p.vy > 0) {
        // 地面（マスの上）に落ちた
        const b0 = p.y + HB, b1 = ny + HB;
        const ty = Math.floor(b1 - 1e-9);
        const x0 = Math.floor(p.x - HB), x1 = Math.floor(p.x + HB - 1e-9);
        for (let tx = x0; tx <= x1; tx++) {
          if (!this.solid(tx, ty)) continue;
          if (b0 <= ty + 1e-6) { p.y = ty - HB; return this.ground(); }
          return this.crash('wall');
        }
      } else {
        if (this.boxHitsTile(p.x, ny)) return this.crash('ceil');
      }
      { const hs = this.boxHitsStack(p.x, ny); if (hs) { if (this.grab(hs)) return this.land(hs); return this.crash('side'); } }
      p.y = ny;
      // 当たると砕けるもの
      const k = this.hazard(s); if (k) return this.shatter(k);
      // ゴール（鉛筆立て）
      const g = lv.goal;
      if (p.x > g[0] && p.x < g[0] + g[2] && p.y > g[1] && p.y < g[1] + g[3]) { this.clear = true; this.over = true; this.ev('clear'); return; }
      // 外へ落ちた
      if (p.y > this.H + 2) { this.over = true; this.dead = 'out'; this.place = { k: -1, why: 'out' }; this.ev('die', 'out'); return; }
    }
    // 鉛筆の山の上の角に、横から少し低く当たったとき：落ちていく途中なら、上に吸いついて乗れる
    grab(st) { const p = this.p; return p.vy > 0 && p.y + HB - st.top < GRABD; }
    // 鉛筆の上に乗った：もう一度飛べる
    land(st) {
      const p = this.p;
      p.x = FT.colX(FT.kcol(st.k)); p.y = st.top - HB; p.vx = 0; p.vy = 0; p.fly = false; p.on = st.k;
      this.ev('land', st.k);
    }
    hazard(s) {
      const p = this.p, lv = this.lv;
      // トゲのマス
      const x0 = Math.floor(p.x - HB), x1 = Math.floor(p.x + HB - 1e-9), y0 = Math.floor(p.y - HB), y1 = Math.floor(p.y + HB - 1e-9);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.tile(tx, ty) === T.SPIKE) {
        // トゲはマスの下半分にある
        if (p.y + HB > ty + 0.45) return 'spike';
      }
      const hit = (x, y, w, h) => p.x + HB > x && p.x - HB < x + w && p.y + HB > y && p.y - HB < y + h;
      for (const e of lv.ents) {
        if (e.k === 'sharp') { const dx = p.x - e.x, dy = p.y - e.y, r = e.r + HB * .8; if (dx * dx + dy * dy < r * r) return 'sharp'; }
        else if (e.k === 'blade') { if (hit(e.x, e.y, e.w, e.h)) return 'blade'; }
        else if (e.k === 'plane') { const q = FT.planeAt(e, s); if (hit(q.x - .55, q.y - .2, 1.1, .4)) return 'plane'; }
        else if (e.k === 'eraser') { const q = FT.eraserAt(e, s); if (hit(q.x, q.y, q.w, q.h)) return 'eraser'; }
      }
      return null;
    }
    // ---------- 死ぬ ----------
    // 砕けた：何も残らない
    shatter(kind) { this.over = true; this.dead = kind; this.place = { k: -1, why: 'shatter' }; this.ev('die', kind); return this.place; }
    // 地面に刺さった
    ground() {
      const p = this.p, col = FT.colOf(p.x), tx = Math.floor(p.x), ty = Math.round(p.y + HB);
      this.over = true; this.dead = 'ground';
      if (this.tile(tx, ty) === T.GLUE || this.capAt(Math.floor(FT.colX(col))) <= 0) { this.place = { k: -1, why: 'sink', x: p.x, y: ty }; this.ev('die', 'sink'); return this.place; }
      this.place = { k: ck(ty, col), n: 1, why: 'ground' };
      this.ev('die', 'ground');
      return this.place;
    }
    // 壁・天井・鉛筆の横にぶつかった：その場から真下に落ちて、下が地面なら刺さり、鉛筆なら上に積み重なる
    crash(kind) {
      const p = this.p; this.over = true; this.dead = kind;
      this.place = this.dropFrom(p.x, p.y, kind);
      this.ev('die', kind);
      return this.place;
    }
    dropFrom(x, y, kind) {
      // 列のまん中が壁の中なら、少しもどす
      let col = FT.colOf(x);
      if (this.solid(Math.floor(FT.colX(col)), Math.floor(y))) { const alt = FT.colX(col) > x ? col - 1 : col + 1; col = alt; }
      const cx = FT.colX(col), tx = Math.floor(cx);
      // 落ちる先：鉛筆の山の上か、マスの上の、どちらか近い方
      let top = Infinity, st = null;
      const a = this.cols.get(col) || [];
      for (const s of a) if (s.top >= y - 0.05 && s.top < top) { top = s.top; st = s; }
      let ty = Math.max(0, Math.floor(y + HB));
      while (ty < this.H && !this.solid(tx, ty)) ty++;
      if (ty >= this.H) { if (!st) return { k: -1, why: 'out', kind }; }
      if (st && st.top <= ty) {
        const capN = this.capAt(Math.floor(cx));
        if (st.n >= capN) return { k: -1, why: 'cap', kind, x: cx, y: st.top };   // 赤い線をこえる：はじかれる
        return { k: st.k, n: st.n + 1, why: 'stack', kind };
      }
      if (this.tile(tx, ty) === T.GLUE || this.capAt(tx) <= 0) return { k: -1, why: 'sink', kind, x: cx, y: ty };
      // ほかの面の上に、もう山があるか（同じ面）
      const key = ck(ty, col);
      for (const s of a) if (s.k === key) { if (s.n >= this.capAt(tx)) return { k: -1, why: 'cap', kind, x: cx, y: s.top }; return { k: key, n: s.n + 1, why: 'stack', kind }; }
      return { k: key, n: 1, why: 'ground', kind };
    }
  }
  FT.Run = Run;
  // ---------- 飛ぶ前の予測線（重さだけ。いちばん高い所まで） ----------
  FT.predict = function (x, y, ai, pw) {
    const v = FT.launchV(ai, pw); let vx = v.vx, vy = v.vy; const out = [[x, y]];
    for (let i = 0; i < 600; i++) { vy += GRAV * DT; x += vx * DT; y += vy * DT; if (i % 4 === 3) out.push([x, y]); if (vy >= 0) break; }
    out.push([x, y]);
    return out;
  };
  // ---------- 操作の記録 ----------
  //  飛ぶ：t.g.角度.強さ  空中の左右：t.s.0〜3（変わったときだけ）  を36進数で並べる
  FT.Rec = class {
    constructor() { this.a = []; this.last = 0; }
    go(t, ai, pw) { this.a.push(t.toString(36) + 'g' + (ai | 0).toString(36) + 'p' + (pw | 0).toString(36)); }
    steer(t, b) { if (b !== this.last) { this.a.push(t.toString(36) + 's' + b); this.last = b; } }
    str() { return this.a.join('.'); }
    static parse(s) {
      const go = new Map(), st = [];
      for (const v of String(s || '').split('.')) {
        let m = /^([0-9a-z]+)g([0-9a-z]+)p([0-9a-z]+)$/.exec(v);
        if (m) { go.set(parseInt(m[1], 36), [parseInt(m[2], 36), parseInt(m[3], 36)]); continue; }
        m = /^([0-9a-z]+)s([0-3])$/.exec(v);
        if (m) st.push(parseInt(m[1], 36), +m[2]);
      }
      let i = 0, cur = 0;
      return t => { while (i < st.length && st[i] <= t) { cur = st[i + 1]; i += 2; } const g = go.get(t); return { L: cur & 1, R: (cur >> 1) & 1, go: g || null }; };
    }
  };
  // ---------- 鉛筆の一覧を文字にする（その挑戦の始まりの鉛筆） ----------
  //  1つの山：場所×31＋本数（30本まで） を36進数で
  FT.corStr = cor => { const a = []; for (const [k, c] of cor) a.push(k * 31 + Math.min(30, c.n | 0 || 1)); return a.sort((x, y) => x - y).map(v => v.toString(36)).join('.'); };
  FT.corParse = s => { const m = new Map(); for (const v of String(s || '').split('.')) { if (!v) continue; const n = parseInt(v, 36); if (!(n >= 0)) continue; m.set(Math.floor(n / 31), { n: n % 31 || 1, name: '' }); } return m; };
  // 記録を再生する
  FT.replay = function (lv, cor, recStr, lim) {
    const r = new Run(lv, cor), inp = FT.Rec.parse(recStr);
    while (!r.over && r.t < lim) r.step(inp(r.t + 1));
    return r;
  };
  // ---------- 層の形をほどく ----------
  FT.rleDecode = function (s, n) {
    const out = new Uint8Array(n); let i = 0, j = 0;
    while (i < s.length && j < n) { const ch = s[i++]; let num = ''; while (i < s.length && s[i] >= '0' && s[i] <= '9') num += s[i++]; const c = ch.charCodeAt(0) - 97, k = num ? +num : 1; for (let q = 0; q < k && j < n; q++) out[j++] = c; }
    return out;
  };
  FT.rleEncode = function (arr) {
    let s = '', i = 0;
    while (i < arr.length) { const c = arr[i]; let k = 1; while (i + k < arr.length && arr[i + k] === c && k < 999) k++; s += String.fromCharCode(97 + c) + (k > 1 ? k : ''); i += k; }
    return s;
  };
  FT.makeLevel = function (r) {
    return { f: r.f, name: r.n, theme: Math.ceil(r.f / 10) - 1, w: r.w, h: r.h, tiles: FT.rleDecode(r.t, r.w * r.h), cap: Int8Array.from(String(r.c).split('').map(ch => parseInt(ch, 36) || 0)), start: r.s, goal: r.g, ents: r.e || [], need: r.need || 0 };
  };
})(typeof window !== 'undefined' ? window : globalThis);
