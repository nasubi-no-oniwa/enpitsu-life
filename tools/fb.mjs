// ft-blue に管理者として話しかける道具（GitHub の上でだけ使う。鍵は FT_BLUE_SERVICE_ACCOUNT）
import { createRequire } from 'module';
const require = createRequire(process.env.RUNNER_TEMP + '/x/');
const { GoogleAuth } = require('google-auth-library');
export const DBURL = 'https://ft-blue-default-rtdb.asia-southeast1.firebasedatabase.app';
// 鍵の中身を読む（最初の { や最後の } が抜けて貼られていても読めるようにする）
function readKey() {
  const raw = require('fs').readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8').trim();
  const tries = [raw, '{' + raw + '}', '{' + raw, raw + '}', '{' + raw.replace(/,\s*$/, '') + '}'];
  for (const x of tries) { try { const o = JSON.parse(x); if (o && o.private_key && o.client_email) return o; } catch (e) { } }
  throw new Error('鍵の中身が読めません（FT_BLUE_SERVICE_ACCOUNT を貼りなおしてください）');
}
export async function token() {
  const auth = new GoogleAuth({ credentials: readKey(), scopes: ['https://www.googleapis.com/auth/firebase.database', 'https://www.googleapis.com/auth/userinfo.email'] });
  const c = await auth.getClient(); const t = await c.getAccessToken(); return t.token || t;
}
export async function api(method, path, body, tk) {
  const r = await fetch(DBURL + path + (path.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(tk), { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const text = await r.text();
  if (!r.ok) throw new Error(method + ' ' + path.split('?')[0] + ' ' + r.status + ' ' + text.slice(0, 300));
  return text;
}
