// Realtime Database のルールを、まねて判定する小さな道具（テスト用）
const vm = require('vm');
const ctx = vm.createContext({});
vm.runInContext("String.prototype.matches=function(re){return re.test(String(this));};String.prototype.contains=function(s){return String(this).indexOf(s)>=0;};String.prototype.beginsWith=function(s){return String(this).startsWith(s);};", ctx);
const fnCache = new Map();
function compile(expr, vars) {
  const key = expr + '|' + vars.join(',');
  if (!fnCache.has(key)) fnCache.set(key, vm.runInContext(`(function(${vars.join(',')}){ return (${expr}); })`, ctx));
  return fnCache.get(key);
}
const clone = v => v === undefined ? null : JSON.parse(JSON.stringify(v));
function getAt(obj, parts) { let o = obj; for (const p of parts) { if (o === null || typeof o !== 'object' || !(p in o)) return null; o = o[p]; } return o === undefined ? null : o; }
function setAt(obj, parts, val) {
  if (!parts.length) return clone(val);
  obj = (obj && typeof obj === 'object') ? obj : {};
  const [h, ...t] = parts; const nv = setAt(obj[h], t, val);
  if (nv === null || (typeof nv === 'object' && Object.keys(nv).length === 0)) delete obj[h]; else obj[h] = nv;
  return obj;
}
class Snap {
  constructor(root, parts) { this._root = root; this._p = parts; }
  _v() { return getAt(this._root, this._p); }
  val() { const v = this._v(); return v; }
  exists() { return this._v() !== null; }
  child(path) { return new Snap(this._root, this._p.concat(String(path).split('/').filter(Boolean))); }
  parent() { return new Snap(this._root, this._p.slice(0, -1)); }
  hasChild(k) { return this.child(k).exists(); }
  hasChildren(arr) { const v = this._v(); if (!v || typeof v !== 'object') return false; if (!arr) return Object.keys(v).length > 0; return arr.every(k => this.child(k).exists()); }
  isNumber() { return typeof this._v() === 'number'; }
  isString() { return typeof this._v() === 'string'; }
  isBoolean() { return typeof this._v() === 'boolean'; }
}
function evalRule(rule, env) {
  if (rule === true || rule === false) return rule;
  const names = Object.keys(env);
  try { return !!compile(rule, names)(...names.map(n => env[n])); } catch (e) { return false; }
}
// ルールの木で、parts に合う枝をたどる（$変数を集める）
function walk(rules, parts) {
  const out = [{ node: rules, vars: {}, depth: 0 }]; let node = rules, vars = {};
  for (let i = 0; i < parts.length; i++) {
    if (!node) { out.push({ node: null, vars, depth: i + 1 }); continue; }
    const p = parts[i];
    if (node[p] !== undefined && typeof node[p] === 'object') node = node[p];
    else { const w = Object.keys(node).find(k => k[0] === '$'); if (w) { vars = Object.assign({}, vars, { [w]: p }); node = node[w]; } else node = null; }
    out.push({ node, vars, depth: i + 1 });
  }
  return out;
}
class DB {
  constructor(rules) { this.rules = rules.rules; this.data = {}; this.now = 1e12; }
  env(parts, vars, auth, newRoot) {
    return Object.assign({ auth: auth || null, now: this.now, root: new Snap(this.data, []), data: new Snap(this.data, parts), newData: new Snap(newRoot, parts) }, vars);
  }
  canRead(path, auth) {
    const parts = path.split('/').filter(Boolean);
    for (const s of walk(this.rules, parts)) if (s.node && s.node['.read'] !== undefined && evalRule(s.node['.read'], this.env(parts.slice(0, s.depth), s.vars, auth, this.data))) return true;
    return false;
  }
  // update：{ 'a/b': v, ... } をまとめて書く（PATCH と同じ）。成功なら true
  update(obj, auth) {
    // データベース側の＋1（{".sv":{"increment":n}}）を、いまの値に足す
    const res = (v, parts) => { if (v && typeof v === 'object') { if (v['.sv'] && typeof v['.sv'] === 'object' && 'increment' in v['.sv']) { const cur = getAt(this.data, parts); return typeof cur === 'number' ? cur + v['.sv'].increment : v['.sv'].increment; } const o = {}; for (const k in v) o[k] = res(v[k], parts.concat(k)); return o; } return v; };
    obj = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, res(v, k.split('/').filter(Boolean))]));
    let newRoot = clone(this.data) || {};
    for (const k in obj) newRoot = setAt(newRoot, k.split('/').filter(Boolean), obj[k]) || {};
    for (const k in obj) {
      const parts = k.split('/').filter(Boolean);
      // .write：その場所かその上のどこかで true
      let ok = false;
      for (const s of walk(this.rules, parts)) if (s.node && s.node['.write'] !== undefined && evalRule(s.node['.write'], this.env(parts.slice(0, s.depth), s.vars, auth, newRoot))) { ok = true; break; }
      if (!ok) return { ok: false, why: 'write ' + k };
      // .validate：書いた場所より上（値が変わる所）と、書いた中身のすべて
      const chain = walk(this.rules, parts);
      for (const s of chain) { const p2 = parts.slice(0, s.depth); if (!s.node || s.node['.validate'] === undefined) continue; if (getAt(newRoot, p2) === null) continue; if (!evalRule(s.node['.validate'], this.env(p2, s.vars, auth, newRoot))) return { ok: false, why: 'validate ' + p2.join('/') }; }
      const last = chain[chain.length - 1];
      const sub = (node, vars, p2) => {
        const v = getAt(newRoot, p2); if (v === null || typeof v !== 'object') return null;
        for (const ck of Object.keys(v)) {
          let cn = null, cv = vars;
          if (node) { if (node[ck] !== undefined && typeof node[ck] === 'object') cn = node[ck]; else { const w = Object.keys(node).find(x => x[0] === '$'); if (w) { cn = node[w]; cv = Object.assign({}, vars, { [w]: ck }); } } }
          const p3 = p2.concat(ck);
          if (cn && cn['.validate'] !== undefined && !evalRule(cn['.validate'], this.env(p3, cv, auth, newRoot))) return 'validate ' + p3.join('/');
          const r = sub(cn, cv, p3); if (r) return r;
        }
        return null;
      };
      const r = sub(last.node, last.vars, parts); if (r) return { ok: false, why: r };
    }
    this.data = newRoot; return { ok: true };
  }
  get(path) { return getAt(this.data, path.split('/').filter(Boolean)); }
}
module.exports = { DB };
