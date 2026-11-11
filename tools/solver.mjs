// =============================================
//  エンピツライフ  越えられるかを計算で確かめる（層づくり・詰みの判定で使う）
//   ・スタートと、すべての鉛筆の上から、角度と強さを少しずつ変えて飛ばしてみる
//   ・乗れた鉛筆からも、また飛ばす（1回の命で何本も乗りつげる）
//   ・ゴールに届かなければ、死んだときにできる鉛筆の中から「いちばん先へ進めそうなもの」を1本足して、やりなおす
//   ・ゴールに届くまでに足した鉛筆の数が、その層の「必要な鉛筆の数」（目安）
// =============================================
export function makeSolver(FT) {
  const A_STEP = 6, P_STEP = 77, LIM = 720;
  const launches = [];
  for (let ai = 0; ai <= 240; ai += A_STEP) for (let pw = 0; pw <= 1000; pw += P_STEP) launches.push([ai, pw]);
  for (let pw = 40; pw <= 1000; pw += P_STEP) launches.push([120, pw]);
  // まっすぐ上に近い飛び方は、空中で左右に動かす形も試す（壁ぎわの鉛筆から壁の上へ）
  for (let ai = 102; ai <= 138; ai += 6) for (let pw = 300; pw <= 1000; pw += P_STEP) { launches.push([ai, pw, 2]); launches.push([ai, pw, 1]); }
  const moving = lv => lv.ents.some(e => e.k === 'plane' || e.k === 'eraser');
  // 1つの飛び方を試す
  const SI = [null, { L: 1, R: 0 }, { L: 0, R: 1 }];
  function tryOne(run, x, y, t0, ai, pw, sv) {
    run.over = false; run.clear = false; run.dead = null; run.place = null; run.events.length = 0; run.t = t0;
    run.p = { x, y, vx: 0, vy: 0, fly: false, vx0: 0, on: -1, hops: 0, maxX: x };
    run.step({ go: [ai, pw] });
    const end = t0 + LIM;
    const si = SI[sv | 0];
    while (!run.over && run.p.fly && run.t < end) run.step(si);
    if (run.clear) return { clear: true };
    if (!run.over && !run.p.fly) return { land: run.p.on };
    if (run.over) return { place: run.place };
    return null;
  }
  // 立てる場所：スタートと鉛筆の山の上
  function points(lv, run) {
    const HB = FT.PHYS.HB, out = [{ id: 'S', x: lv.start[0], y: lv.start[1] - HB }];
    for (const [col, a] of run.cols) for (const s of a) out.push({ id: s.k, x: FT.colX(col), y: s.top - HB });
    return out;
  }
  // 1つの場所から飛べるすべての結果
  function fromPoint(lv, run, p, waits) {
    const res = { lands: new Set(), cands: [], clear: null };
    for (const w of waits) {
      for (const [ai, pw, sv] of launches) {
        const r = tryOne(run, p.x, p.y, w, ai, pw, sv); if (!r) continue;
        if (r.clear) { res.clear = { from: p.id, ai, pw, w, sv }; return res; }
        if (r.land !== undefined && r.land !== -1) { res.lands.add(String(r.land)); continue; }
        if (r.place && r.place.k >= 0) res.cands.push({ k: r.place.k, n: r.place.n, from: p.id, ai, pw, w, sv, why: r.place.why });
      }
    }
    return res;
  }
  // cor のときに、スタートから行ける場所と、作れる鉛筆（cache：前の結果。変わった所の近くだけ計算しなおす）
  function explore(lv, cor, cache) {
    cache = cache || new Map();
    const run = new FT.Run(lv, cor);
    const pts = new Map(points(lv, run).map(p => [String(p.id), p]));
    const waits = moving(lv) ? [0, 90, 180, 270] : [0];
    const seen = new Set(['S']), q = ['S'], cands = new Map();
    let clear = null;
    while (q.length && !clear) {
      const id = q.shift(), p = pts.get(id); if (!p) continue;
      let c = cache.get(id);
      if (!c || c.x !== p.x || c.y !== p.y) { c = fromPoint(lv, run, p, waits); c.x = p.x; c.y = p.y; cache.set(id, c); }
      if (c.clear) { clear = c.clear; break; }
      for (const k of c.lands) if (!seen.has(k) && pts.has(k)) { seen.add(k); q.push(k); }
      for (const cd of c.cands) { const prev = cands.get(cd.k); if (!prev || prev.n < cd.n) cands.set(cd.k, cd); }
    }
    return { clear, seen, cands, run, cache };
  }
  // いちばん先へ進めそうな鉛筆：右へ遠いほど、高いほどよい
  const score = (k, n) => FT.colX(FT.kcol(k)) + 1.25 * (24 - (FT.ksy(k) - n * FT.PHYS.PH));
  // 解く：ゴールまでに必要な鉛筆の数を返す
  function solve(lv, cor0, opt) {
    opt = opt || {};
    const cor = new Map(cor0 || []);
    const max = opt.max || 300, t0 = Date.now(), log = [];
    const cache = new Map();
    for (let added = 0; added <= max; added++) {
      const e = explore(lv, cor, cache);
      if (e.clear) return { ok: true, need: added, cor, log, ms: Date.now() - t0, reach: e.seen.size, last: e.clear };
      let best = null, bs = -1e9;
      for (const c of e.cands.values()) {
        const cur = cor.get(c.k); if (cur && cur.n >= c.n) continue;
        const sc = score(c.k, c.n); if (sc > bs) { bs = sc; best = c; }
      }
      if (!best) return { ok: false, need: added, cor, log, ms: Date.now() - t0, why: 'nocand', far: farthest(cor) };
      cor.set(best.k, { n: best.n });
      log.push([best.k, best.n, best.why]);
      // 新しい鉛筆の近くから飛ぶ結果は変わるので、忘れる
      const x0 = FT.colX(FT.kcol(best.k));
      for (const [id, c] of cache) if (Math.abs(c.x - x0) < 17) cache.delete(id);
      if (opt.ms && Date.now() - t0 > opt.ms) return { ok: false, need: added + 1, cor, log, ms: Date.now() - t0, why: 'time', far: farthest(cor) };
    }
    return { ok: false, need: max, cor, log, ms: Date.now() - t0, why: 'max', far: farthest(cor) };
  }
  const farthest = cor => { let m = 0; for (const k of cor.keys()) m = Math.max(m, FT.colX(FT.kcol(k))); return m; };
  return { solve, explore, fromPoint, launches };
}
