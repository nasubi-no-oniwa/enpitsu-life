// 通信とルールの試験：テスト用の Firebase のまね（fakefb.js）に el のルールを入れて、2人の端末をつないで動かす
//  node tools/eltest.js
const fs = require('fs'), vm = require('vm'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const PORT = 9300 + Math.floor(Math.random() * 500);
const el = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.el.json')));
const RULES = '/tmp/el_rules_test.json';
fs.writeFileSync(RULES, JSON.stringify({ rules: { '.read': false, '.write': false, ft_admin: { '.read': false, '.write': false }, ft_admins: { $uid: { '.read': false, '.write': "auth != null && auth.uid === $uid && root.child('ft_admin/key').exists() && newData.val() === root.child('ft_admin/key').val()" } }, el } }));
const srv = cp.spawn(process.execPath, [path.join(__dirname, 'fakefb.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'], env: Object.assign({}, process.env, { FAKE_RULES: RULES }) });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const levels = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/levels.json')));
function client(name) {
  const mem = {};
  const ctx = { console, Math, Map, Set, Array, Object, JSON, Number, String, Promise, Error, Date, URL, URLSearchParams, encodeURIComponent, decodeURIComponent, Infinity, isNaN, parseInt, Float64Array, Int16Array, Uint8Array, Int8Array, fetch, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: { getItem: k => mem[k] === undefined ? null : mem[k], setItem: (k, v) => { mem[k] = String(v); } } };
  ctx.globalThis = ctx; ctx.window = ctx;
  ctx.EL_CONFIG = { apiKey: 'test', databaseURL: `http://127.0.0.1:${PORT}`, ns: 'g' };
  ctx.FT_AUTHURL = { up: `http://127.0.0.1:${PORT}/auth/up`, ref: `http://127.0.0.1:${PORT}/auth/ref` }; ctx.EL_SNAPBASE = `http://127.0.0.1:${PORT}/nosnap/`;
  vm.createContext(ctx);
  for (const f of ['engine.js', 'verify.js', 'net.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx, { filename: f });
  return ctx;
}
const get = async p => (await fetch(`http://127.0.0.1:${PORT}/${p}.json?ns=g`)).json();
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ○', m); } else { fail++; console.log('  ×', m); } };
// 1回の命：ai, pw で飛んで、終わるまで
function life(FT, lv, cor, ai, pw) { const r = new FT.Run(lv, cor), rec = new FT.Rec(); r.step({ go: [ai, pw] }); rec.go(1, ai, pw); while (!r.over && r.t < 3000) { if (!r.p.fly) break; rec.steer(r.t + 1, 0); r.step({ L: 0, R: 0 }); } return { r, rec: rec.str() }; }
(async () => {
  await new Promise(r => srv.stdout.once('data', r));
  const A = client('A'), B = client('B'), FT = A.FT, NA = FT.NET, NB = B.FT.NET;
  console.log('1) Aが第1層で鉛筆を3本刺す（地面2本・積み重ね1本）');
  const lvA = FT.makeLevel(levels[0]); let cor = await NA.loadCells(lvA); ok(cor.size === 0, 'はじめは鉛筆がない');
  // 地面に刺さる飛び方をさがす
  let g1 = null; for (let pw = 300; pw <= 1000 && !g1; pw += 50) { const x = life(FT, lvA, new Map(), 150, pw); if (x.r.place && x.r.place.why === 'ground') g1 = { pw, x }; }
  ok(!!g1, '地面に刺さる飛び方 ' + (g1 && JSON.stringify(g1.x.r.place)));
  const st0 = FT.corStr(cor);
  const jobs = [NA.died({ f: 1, k: g1.x.r.place.k, n: 1, name: 'あかHB', rec: g1.x.rec, cor: st0, ticks: g1.x.r.t, m: 120 })];
  cor = new Map(cor); cor.set(g1.x.r.place.k, { n: 1 });
  // 別の場所
  let g2 = null; for (let pw = 1000; pw >= 300 && !g2; pw -= 50) { const x = life(FT, lvA, cor, 160, pw); if (x.r.place && x.r.place.why === 'ground' && x.r.place.k !== g1.x.r.place.k) g2 = x; }
  ok(!!g2, '2本目の場所 ' + (g2 && JSON.stringify(g2.r.place)));
  jobs.push(NA.died({ f: 1, k: g2.r.place.k, n: 1, name: 'あおB', rec: g2.rec, cor: FT.corStr(cor), ticks: g2.r.t, m: 200 }));
  cor.set(g2.r.place.k, { n: 1 });
  const res = await Promise.allSettled(jobs);
  ok(res.every(x => x.status === 'fulfilled' && x.value === true), 'まとめて送れた ' + res.map(x => x.status + (x.reason ? x.reason.message : '')).join(','));
  const cells = await get('el/cells/1');
  ok(cells && Object.keys(cells).length === 2, 'データベースに2つの山 ' + JSON.stringify(cells));
  // 積み重ね：同じ場所に、本数2として送る（ルールが1ずつ増えるのを許すか）
  await sleep(900);
  const k1 = String(g1.x.r.place.k);
  await NA.died({ f: 1, k: +k1, n: 2, name: 'きいろ2B', rec: g1.x.rec, cor: st0, ticks: g1.x.r.t, m: 120 }).then(() => ok(true, '積み重ねを送れた')).catch(e => ok(false, '積み重ねを送れない ' + e.message));
  const c2 = await get('el/cells/1/' + k1); ok(c2 && c2.n === 2, '本数が2になった ' + JSON.stringify(c2));
  console.log('2) Bが読むと、確かめた鉛筆が見える');
  const lvB = B.FT.makeLevel(levels[0]); const corB = await NB.loadCells(lvB);
  ok(corB.size === 2, 'Bに山が2つ見える');
  ok(corB.get(+k1) && corB.get(+k1).n === 2, '同じ場所に2人が刺さると、積み重なって2本（' + (corB.get(+k1) && corB.get(+k1).n) + '）');
  console.log('2b) まとめ作り（GitHub の上で15分ごとに動くもの）');
  { const dir = fs.mkdtempSync('/tmp/elsnap'); const out = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools/snapshot.js')], { env: Object.assign({}, process.env, { EL_CONFIG_JSON: JSON.stringify({ apiKey: 'test', databaseURL: `http://127.0.0.1:${PORT}`, ns: 'g' }), EL_SNAP_DIR: dir, EL_SNAP_MS: '20000' }), encoding: 'utf8' });
    ok(out.status === 0, 'まとめを作れた ' + (out.stdout || '').trim() + (out.stderr || '').slice(0, 300));
    const f1 = JSON.parse(fs.readFileSync(path.join(dir, 'f1.json'), 'utf8')); ok(f1.st && Object.keys(f1.st.P).length === 2, 'まとめに確かめ済みの鉛筆が2か所'); }
  console.log('3) 越えた記録・開いた印');
  const cl = await NA.clear(lvA, { name: 'あかHB', rec: '1g78p3e8', cor: FT.corStr(cor), ticks: 400 }).catch(e => ({ err: e.message }));
  ok(cl && cl.id && cl.opened, '越えた記録と、開いた印を書けた ' + JSON.stringify(cl));
  const op = await get('el/open/1'); ok(op && op.id === cl.id, '開いた印が入った');
  await NA.setXid(1, cl.id, 'nasubi', true).then(() => ok(true, 'XのIDを刻めた')).catch(e => ok(false, 'XのIDを刻めない ' + e.message));
  await NB.setFirst(1, cl.id, 'よこどり', '', true).then(() => ok(false, 'ほかの人が一番乗りの名前を書けてしまった')).catch(() => ok(true, 'ほかの人は一番乗りの名前を書けない'));
  await NA.setFirst(1, cl.id, 'なすび', '', true).then(r => ok(r.all, '一番乗りの名前をノートに書けた')).catch(e => ok(false, '名前を書けない ' + e.message));
  const op2 = await get('el/open/1'), cl2 = await get('el/clear/1/' + cl.id);
  ok(op2.w === 'なすび' && cl2.w === 'なすび', '開いた印と越えた記録の両方に名前が入った');
  await NA.setFirst(1, cl.id, 'かきなおし', '', true).then(() => ok(false, '名前を2回書けてしまった')).catch(() => ok(true, '名前を書けるのは1回だけ'));
  { const dir = fs.mkdtempSync('/tmp/elsnap'); const out = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools/snapshot.js')], { env: Object.assign({}, process.env, { EL_CONFIG_JSON: JSON.stringify({ apiKey: 'test', databaseURL: `http://127.0.0.1:${PORT}`, ns: 'g' }), EL_SNAP_DIR: dir, EL_SNAP_MS: '20000' }), encoding: 'utf8' });
    const ix = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')), gr = JSON.parse(fs.readFileSync(path.join(dir, 'grads.json'), 'utf8'));
    ok(out.status === 0 && ix.open[1] && ix.open[1].w === 'なすび', 'まとめに一番乗りの名前が入る');
    ok(Array.isArray(gr.list), 'まとめに卒業生の一覧ができる'); }
  const fc = await NB.firstClear(lvB); ok(fc === null, 'にせの越えた記録は、確かめで通らない');
  console.log('4) 掲示板・詰みの知らせ・ほかの人は管理できない');
  await NB.boardPost('all', { n: 'びーさん', m: 'がんばろう', l: 'ja', f: 1 }).then(() => ok(true, '掲示板に書けた')).catch(e => ok(false, '掲示板に書けない ' + e.message));
  const bd = await NB.boardRead('all', 0); ok(bd.length === 1 && bd[0].m === 'がんばろう', '掲示板を読めた');
  await NB.report(1, 300, '越えられる（あと2本で届いた）', 'ja').then(() => ok(true, '詰みの知らせを送れた')).catch(e => ok(false, '詰みの知らせを送れない ' + e.message));
  await NA.report(2, 500, '越えられない（max）', 'ja', { c: '1a.2b.3c', x: 12.34, y: 8.5 }).then(() => ok(true, '観戦用の中身つきの知らせを送れた')).catch(e => ok(false, '観戦用の中身つきの知らせを送れない ' + e.message));
  const rp = await fetch(`http://127.0.0.1:${PORT}/el/rep.json?ns=g`); ok(rp.status === 401, 'ふつうの人は、詰みの知らせを読めない');
  await NB.ask('第3層の右の壁が高すぎる気がします', 'nasubiP', 'ja', 3).then(() => ok(true, '管理人への相談を送れた')).catch(e => ok(false, '相談を送れない ' + e.message));
  await sleep(300);
  await NB.ask('もう1回', '', 'ja', 3).then(() => ok(false, '1分たたずに2回目の相談が送れてしまった')).catch(() => ok(true, '相談は1分に1回まで'));
  const ak = await fetch(`http://127.0.0.1:${PORT}/el/ask.json?ns=g`); ok(ak.status === 401, 'ふつうの人は、相談を読めない');
  await NB.resetFloor(1).then(() => ok(false, 'ふつうの人が層を消せてしまった')).catch(() => ok(true, 'ふつうの人は層を消せない'));
  await NB.liveAdd('だれか', 'https://example.com/x', '').then(() => ok(false, 'ふつうの人が配信中を書けてしまった')).catch(() => ok(true, 'ふつうの人は配信中を書けない'));
  console.log('4b) 通信が切れても鉛筆を捨てない・同じ鉛筆を2本にしない');
  {
    const lv2 = FT.makeLevel(levels[1]), spots = [];
    for (let pw = 300; pw <= 1000 && spots.length < 2; pw += 50) { const x = life(FT, lv2, new Map(), 150, pw); if (x.r.place && x.r.place.why === 'ground' && !spots.some(y => y.r.place.k === x.r.place.k)) spots.push(x); }
    // C：送ったが返事が来なかった（データベースには届いている）→ 届いていたと分かって送りなおさない
    const C = client('C'), NC = C.FT.NET, F0 = C.fetch; let cut = 1;
    C.fetch = async (u, o) => { const r = await F0(u, o); if (o && o.method === 'PATCH' && cut > 0) { cut--; throw new TypeError('network'); } return r; };
    await NC.loadCells(C.FT.makeLevel(levels[1]));
    const a = spots[0]; const ra = await Promise.race([NC.died({ f: 2, k: a.r.place.k, n: 1, name: 'しーHB', rec: a.rec, cor: '', ticks: a.r.t, m: 100 }).then(v => v, e => 'rej ' + e.message), (NC.flush(), sleep(20000).then(() => 'timeout'))]);
    const ca = await get('el/cells/2/' + a.r.place.k);
    ok(ra === true && ca && ca.n === 1, '返事が来なくても、同じ鉛筆を2本にしない ' + JSON.stringify([ra, ca && ca.n]));
    // D：送る前に通信が切れた → 捨てずに、あとで送りなおす
    const D = client('D'), ND = D.FT.NET, F1 = D.fetch; let cut2 = 1;
    D.fetch = async (u, o) => { if (o && o.method === 'PATCH' && cut2 > 0) { cut2--; throw new TypeError('offline'); } return F1(u, o); };
    await ND.loadCells(D.FT.makeLevel(levels[1]));
    const b2 = spots[1]; const rb = await Promise.race([ND.died({ f: 2, k: b2.r.place.k, n: 1, name: 'でぃーHB', rec: b2.rec, cor: '', ticks: b2.r.t, m: 100 }).then(v => v, e => 'rej ' + e.message), (ND.flush(), sleep(20000).then(() => 'timeout'))]);
    const cb = await get('el/cells/2/' + b2.r.place.k);
    ok(rb === true && cb && cb.n === 1, '通信が切れても、あとで送りなおして届く ' + JSON.stringify([rb, cb && cb.n]));
  }
  console.log('5) 管理人');
  await fetch(`http://127.0.0.1:${PORT}/ft_admin/key.json?ns=g`, { method: 'PUT', body: '"KEY"' });
  await NA.adminLogin('KEY').then(() => ok(true, '管理のかぎで入れた')).catch(e => ok(false, '管理のかぎで入れない ' + e.message));
  const asks = await NA.asks().catch(() => null); const aid = asks && Object.keys(asks)[0];
  ok(asks && Object.keys(asks).length === 1 && asks[aid].x === 'nasubiP' && asks[aid].f === 3, '管理人は相談を読める');
  await NA.askDel(aid).then(() => ok(true, '管理人は相談を消せる')).catch(e => ok(false, '相談を消せない ' + e.message));
  { await NB.ping(3); await sleep(200); const on = await NA.online(60000).catch(e => ({ err: e.message })); const v = on && Object.values(on); ok(v && v.length === 1 && v[0].f === 3, '同接：遊んでいる人と層が数えられる'); }
  { const r = await fetch(`http://127.0.0.1:${PORT}/el/on.json?ns=g`); ok(r.status === 401, 'ふつうの人は、同接を読めない'); }
  const reps = await NA.reports().catch(() => null); ok(reps && reps[1] && Object.keys(reps[1]).length === 1, '管理人は詰みの知らせを読める');
  { const r2 = reps && reps[2] && Object.values(reps[2])[0]; ok(r2 && r2.c === '1a.2b.3c' && r2.x === 12.34 && r2.y === 8.5, '観戦用の中身（鉛筆・立っていた所）が読める'); const r1 = reps && reps[1] && Object.values(reps[1])[0]; ok(r1 && r1.c === undefined, '前の形の知らせ（観戦用の中身なし）もそのまま'); }
  await NA.liveAdd('なすP', 'https://youtube.com/live/abc', 'いま配信中').then(() => ok(true, '配信中を書けた')).catch(e => ok(false, '配信中を書けない ' + e.message));
  const lv = await NB.live(); ok(lv.length === 1, 'みんなが配信中を読める');
  await NA.boardSetPin('all', 'お知らせです').then(() => ok(true, 'お知らせを書けた')).catch(e => ok(false, 'お知らせを書けない ' + e.message));
  await NA.resetFloor(2).then(() => ok(true, '管理人は層の記録を全部消せる')).catch(e => ok(false, '層の記録を消せない ' + e.message));
  await NA.blankName(1, cl.id).then(() => ok(true, '管理人は一番乗りの名前を名無しにできる')).catch(e => ok(false, '名無しにできない ' + e.message));
  const op3 = await get('el/open/1'); ok(op3.w === '名無し' && op3.n === '名無し' && op3.x === '', '名無しになった');
  const g = await NA.dlog(1); ok(g.length === 1 && g[0].n === 3, '鉛筆を置いた人の一覧');
  await NA.removeBy(1, g[0]).then(() => ok(true, 'その人の鉛筆を取り除けた')).catch(e => ok(false, '取り除けない ' + e.message));
  await NA.setEnd().then(() => ok(true, 'ゲームを終えられた')).catch(e => ok(false, '終えられない ' + e.message));
  await sleep(900);
  await NB.boardPost('all', { n: 'びーさん', m: 'まだ書ける？', l: 'ja', f: 1 }).then(() => ok(false, '終わったあとも書けてしまった')).catch(() => ok(true, '終わったあとは書けない'));
  await sleep(61000 - 300);
  await NB.ask('終わったあとの相談', '', 'ja', 101).then(() => ok(true, '終わったあとも相談は送れる')).catch(e => ok(false, '終わったあとに相談を送れない ' + e.message));
  console.log(`\n${pass} 通った / ${fail} だめ`);
  srv.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
