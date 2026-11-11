// =============================================
//  確かめで鉛筆が数えられない理由を調べる（GitHub Actions の「diag」を手で動かす。結果はログに出すだけ）
//   node tools/diag.js   （EL_DIAG_F：層の番号）
//  ・記録を古い順に、ゲームと同じ計算で確かめて、だめになった理由を数える
//  ・再生が合わない記録は、前の版の動きの計算（tools/diag-old-engine.js）でも再生して、どちらで合うかを見る
// =============================================
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
global.window = global;
require(path.join(ROOT, 'js/engine.js')); require(path.join(ROOT, 'js/verify.js'));
const FT = global.FT, V = FT.V;
// 前の版の動きの計算を、別の入れ物で読む
const octx = { window: {}, Math, Map, Set, Int8Array, Uint8Array, Array, Object, String, Number, JSON, parseInt, Infinity };
octx.window = octx; vm.createContext(octx); vm.runInContext(fs.readFileSync(path.join(__dirname, 'diag-old-engine.js'), 'utf8'), octx);
const OFT = octx.FT;
const cctx = { window: {} }; vm.createContext(cctx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8'), cctx); const CFG = cctx.window.EL_CONFIG;
async function rest(p, q) {
  const qs = Object.entries(q || {}).map(([k, v]) => k + '=' + encodeURIComponent(/^(limitTo|shallow)/.test(k) ? String(v) : JSON.stringify(v)));
  if (CFG.ns) qs.push('ns=' + CFG.ns);
  const url = CFG.databaseURL.replace(/\/$/, '') + '/el/' + p + '.json' + (qs.length ? '?' + qs.join('&') : '');
  for (let i = 0; i < 3; i++) { try { const r = await fetch(url); if (r.ok) return r.json(); } catch (e) { } await new Promise(r => setTimeout(r, 1000 * (i + 1))); }
  throw new Error('読めません ' + p);
}
const add = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
(async () => {
  const F = +(process.env.EL_DIAG_F || 1);
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/levels.json')))[F - 1];
  const lv = FT.makeLevel(raw), olv = OFT.makeLevel(raw);
  const cells = (await rest('cells/' + F)) || {};
  const items = V.newItems(V.newState(), await rest('dlog/' + F));
  for (let j = 0; j < items.length; j += 24) await Promise.all(items.slice(j, j + 24).map(d => rest('drec/' + F + '/' + d.id).then(x => { if (x && typeof x === 'object') { d.r = x.r; d.c = x.c; d.k = x.k; } }).catch(() => { })));
  console.log(`第${F}層 記録 ${items.length}件　データベースの山 ${Object.keys(cells).length}`);
  const present = {}, bad = {}, cnt = {}, keyRes = {}, snapWhy = {}, rep = [], t0 = items.length ? items[0].t : 0, buckets = {};
  const users = new Set(items.map(d => d.u));
  let phantom = 0, hangP = 0, overSnap = 0, hangSnap = 0;
  for (const it of items) {
    const snap = FT.corParse(it.c || '');
    for (const [k] of snap) if (!cells[k]) { phantom++; break; }
    if (!FT.keyOk(lv, +it.p)) hangP++;
    let os = false, hs = false; for (const [k, c] of snap) { if (c.n > FT.capOf(lv, k)) os = true; if (!FT.keyOk(lv, k)) hs = true; } if (os) overSnap++; if (hs) hangSnap++;
    let res;
    if ((bad[it.u] || 0) >= 3) res = 'skip-bad';
    else res = V.verifyDeath(lv, it, present);
    add(cnt, res);
    const b = Math.floor((it.t - t0) / 1800000); buckets[b] = buckets[b] || {}; add(buckets[b], res === 'ok' ? 'ok' : 'ng');
    (keyRes[it.p] = keyRes[it.p] || []).push({ res, u: it.u });
    if (res === 'ok') add(present, it.p);
    else if (res === 'replay') add(bad, it.u);
    if (res === 'snap') {
      // どの山が足りなかったか
      for (const [k, c] of snap) {
        if (!FT.keyOk(lv, k)) continue; const need = Math.min(c.n, FT.capOf(lv, k)); if (need <= 0) continue; const q = present[k] || 0;
        if (need > q) { const h = keyRes[k] || []; const why = !h.length ? 'その山の記録がない' : !h.some(x => x.res === 'ok') ? 'その山の記録がぜんぶだめ(' + [...new Set(h.map(x => x.res))].join(',') + ')' : '本数が足りない(' + q + '/' + need + ')'; add(snapWhy, why + (h.some(x => x.u === it.u && x.res !== 'ok') ? '・自分の鉛筆' : '')); break; }
      }
    }
    if ((res === 'replay' || res === 'old') && rep.length < 400) {
      const r = FT.replay(lv, snap, it.r, (it.k | 0) + 2);
      let o = null; try { const or = OFT.replay(olv, snap, it.r, (it.k | 0) + 2); o = or.place ? String(or.place.k) : 'なし'; } catch (e) { o = 'err'; }
      rep.push({ res, p: it.p, now: r.place ? r.place.k + ':' + r.place.why : (r.clear ? 'clear' : 'なし'), old: o, oldOk: o === it.p, t: r.t, k: it.k, os, hs, hp: !FT.keyOk(lv, +it.p) });
    }
  }
  let pv = 0; for (const k in present) pv += present[k];
  console.log('結果：', JSON.stringify(cnt));
  console.log(`確かめ済みの鉛筆 ${pv}本　人 ${users.size}　だめ3回以上 ${Object.values(bad).filter(v => v >= 3).length}人`);
  console.log(`始まりにデータベースにない山がある記録 ${phantom}　はみ出し場所に刺さった記録 ${hangP}　始まりに赤い線こえの山 ${overSnap}　始まりにはみ出しの山 ${hangSnap}`);
  console.log('始まりの鉛筆が足りなかった理由：'); for (const [k, v] of Object.entries(snapWhy).sort((a, b) => b[1] - a[1])) console.log('  ' + v + '　' + k);
  const rs = {}; for (const x of rep) add(rs, `${x.res} 前の動きでは${x.oldOk ? '合う' : '合わない'} 赤線こえ${x.os ? 'あり' : 'なし'} はみ出し${x.hs || x.hp ? 'あり' : 'なし'}`);
  console.log('再生が合わない記録：'); for (const [k, v] of Object.entries(rs).sort((a, b) => b[1] - a[1])) console.log('  ' + v + '　' + k);
  console.log('合わない記録の例：'); for (const x of rep.filter(x => !x.oldOk).slice(0, 25)) console.log('  ', JSON.stringify(x));
  console.log('30分ごと（ok/だめ）：' + Object.keys(buckets).sort((a, b) => a - b).map(b => `${b}:${buckets[b].ok || 0}/${buckets[b].ng || 0}`).join(' '));
})().catch(e => { console.error(e); process.exit(1); });
