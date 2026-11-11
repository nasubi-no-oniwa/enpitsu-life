// 鉛筆の輝き（死んだ回数の節目）が、見せる鉛筆に下から順につくかの試験：node test/shine-test.mjs
import fs from 'fs';
const G = globalThis; eval(fs.readFileSync(new URL('../js/engine.js', import.meta.url), 'utf8')); eval(fs.readFileSync(new URL('../js/verify.js', import.meta.url), 'utf8'));
const FT = G.FT, V = FT.V; let ng = 0; const ok = (c, m) => { if (!c) { ng++; console.log('NG', m); } else console.log('ok', m); };
const lv = FT.makeLevel(JSON.parse(fs.readFileSync(new URL('../data/levels.json', import.meta.url), 'utf8'))[0]);
let tx = -1; for (let x = 4; x < lv.w; x++) if (lv.cap[x] >= 4) { tx = x; break; }
let gy = 0; while (gy < lv.h && lv.tiles[gy * lv.w + tx] === 0) gy++;
const k = FT.ckey(gy, FT.colOf(tx + 0.25));
// 確かめた2本（輝き 3 と 0）＋確かめ中1本（輝き 8）
const st = { t: 0, ti: [], P: { [k]: 2 }, bad: {}, S: { [k]: '30' } };
const sh = V.shown(st, { [k]: { n: 3, l: 'a', t: 1 } }, [{ p: String(k), u: 'x', s: 8 }], lv).get(k);
ok(sh && sh.n === 3 && sh.sh === '308', '見せる鉛筆に、下から順の輝きがつく ' + JSON.stringify(sh));
// 前の版のまとめ（S がない）：輝きは0として数だけ
const sh2 = V.shown({ t: 0, ti: [], P: { [k]: 2 }, bad: {} }, { [k]: { n: 2, l: 'a', t: 1 } }, [], lv).get(k);
ok(sh2 && sh2.n === 2 && sh2.sh === '00', '輝きのない前のまとめでも動く ' + JSON.stringify(sh2));
console.log(ng ? '失敗 ' + ng : 'すべて通った'); process.exit(ng ? 1 : 0);
