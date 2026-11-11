// テスト用の小さな Firebase のまね（Realtime Database の REST と、匿名ログイン）
//  node tools/fakefb.js 9300 → http://127.0.0.1:9300/{パス}.json?ns=g
//  ルールは rules/ft_rules.json をまねて判定する（tools/rtdb.js）
const http = require('http'), fs = require('fs'), path = require('path');
const { DB } = require('./rtdb.js');
const rules = process.env.FAKE_RULES ? JSON.parse(fs.readFileSync(process.env.FAKE_RULES)) : JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rules', 'ft_rules.json')));
const dbs = {}; const getDb = ns => { if (!dbs[ns]) { dbs[ns] = new DB(rules); dbs[ns].data = { ft_admin: { key: 'KEY' } }; } return dbs[ns]; };
let seq = 0; const users = {};
const port = +(process.argv[2] || 9300);
const hdr = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,PATCH,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' };
const stats = { read: 0, write: 0, bytes: 0, reqs: 0 };
http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const u = new URL(req.url, 'http://x'); stats.reqs++;
    if (req.method === 'OPTIONS') { res.writeHead(204, hdr); return res.end(); }
    const send = (code, v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); stats.bytes += s.length; res.writeHead(code, hdr); res.end(s); };
    if (u.pathname === '/__stats') return send(200, stats);
    if (u.pathname.startsWith('/static/') && process.env.FAKE_STATIC) { const fp = path.join(process.env.FAKE_STATIC, u.pathname.slice(8)); if (fs.existsSync(fp)) { res.writeHead(200, Object.assign({}, hdr, { 'Content-Type': fp.endsWith('.json') ? 'application/json' : fp.endsWith('.js') ? 'text/javascript' : fp.endsWith('.html') ? 'text/html' : 'application/octet-stream' })); return res.end(fs.readFileSync(fp)); } res.writeHead(404, hdr); return res.end('{}'); }
    if (u.pathname === '/__dump') return send(200, getDb(u.searchParams.get('ns') || 'g').data);
    if (u.pathname === '/__reset') { for (const k in dbs) delete dbs[k]; return send(200, true); }
    if (u.pathname === '/auth/up') { const uid = 'u' + (++seq) + 'x' + Math.random().toString(36).slice(2, 8); users['rt_' + uid] = uid; return send(200, { idToken: 'tok_' + uid, localId: uid, refreshToken: 'rt_' + uid, expiresIn: '3600' }); }
    if (u.pathname === '/auth/ref') { const rt = new URLSearchParams(body).get('refresh_token'); const uid = users[rt] || (rt && rt.startsWith('rt_') ? rt.slice(3) : null); if (!uid) return send(400, { error: 'bad' }); return send(200, { id_token: 'tok_' + uid, user_id: uid, refresh_token: rt, expires_in: '3600' }); }
    const db = getDb(u.searchParams.get('ns') || 'g'); db.now = Date.now();
    const p = decodeURIComponent(u.pathname.replace(/\.json$/, '').replace(/^\//, ''));
    const tokq = u.searchParams.get('auth'), auth = tokq ? { uid: tokq.replace(/^tok_/, '') } : null;
    if (req.method === 'GET') {
      stats.read++;
      if (!db.canRead(p, auth)) return send(401, { error: 'Permission denied' });
      let v = db.get(p);
      if (u.searchParams.get('shallow') === 'true' && v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = true; return send(200, o); }
      const ob = u.searchParams.get('orderBy');
      if (ob && v && typeof v === 'object') {
        const key = JSON.parse(ob), sa = u.searchParams.get('startAt'), lf = u.searchParams.get('limitToFirst'), ll = u.searchParams.get('limitToLast');
        let ents = Object.entries(v).filter(([, x]) => x && typeof x === 'object').sort((a, b) => (a[1][key] || 0) - (b[1][key] || 0));
        if (sa !== null) ents = ents.filter(([, x]) => (x[key] || 0) >= JSON.parse(sa));
        if (lf) ents = ents.slice(0, +lf); if (ll) ents = ents.slice(-ll);
        v = Object.fromEntries(ents);
      }
      return send(200, JSON.stringify(v === undefined ? null : v));   // 文字の値も、本物と同じく JSON で返す
    }
    stats.write++;
    let val; try { val = JSON.parse(String(body).replace(/\{"\.sv":"timestamp"\}/g, String(db.now))); } catch (e) { return send(400, { error: 'json' }); }
    const up = req.method === 'PATCH' ? Object.fromEntries(Object.entries(val).map(([k, x]) => [(p ? p + '/' : '') + k, x])) : { [p]: val };
    const r = db.update(up, auth);
    if (!r.ok) { if (process.env.V) console.log('断られた', r.why); return send(401, { error: 'Permission denied' }); }
    if (u.searchParams.get('print') === 'silent') { res.writeHead(204, hdr); return res.end(); }
    return send(200, val);
  });
}).listen(port, () => console.log('fakefb', port));
