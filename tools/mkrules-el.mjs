// データベースのルールを作る → database.rules.el.json（ft-blue の中の el の下だけ。Fairies' Tower の部分にはさわらない）
//  もとは Fairies' Tower のルール（rules/ft_rules.json）。場所の名前を el の下に移し、要らない所を外し、詰みの知らせを足す
import fs from 'fs';
const src = JSON.parse(fs.readFileSync(new URL('../rules/ft_rules.json', import.meta.url), 'utf8')).rules;
const keep = ['ft_u', 'ft_cells', 'ft_dlog', 'ft_drec', 'ft_stat', 'ft_clear', 'ft_open', 'ft_end', 'ft_rm', 'ft_reset', 'ft_board', 'ft_board_r', 'ft_pin', 'ft_live', 'ft_ckpt'];
const fix = s => s
  .replace(/root\.child\('ft_admin\/key'\)/g, '@@KEY@@').replace(/root\.child\('ft_admins\//g, '@@ADM@@')
  .replace(/root\.child\('ft_/g, "root.child('el/")
  .replace(/child\('ft_/g, "child('")
  .replace(/@@KEY@@/g, "root.child('ft_admin/key')").replace(/@@ADM@@/g, "root.child('ft_admins/")
  .replace("newData.child('w').val().matches(/^(g|r|b)$/)", "newData.child('w').val() === 'b'");
const walk = o => { if (typeof o === 'string') return fix(o); if (Array.isArray(o)) return o.map(walk); if (o && typeof o === 'object') { const r = {}; for (const k in o) r[k] = walk(o[k]); return r; } return o; };
const el = {};
for (const k of keep) el[k.replace(/^ft_/, '')] = walk(src[k]);
const ADMIN = "(auth != null && root.child('ft_admin/key').exists() && root.child('ft_admins/' + auth.uid).val() === root.child('ft_admin/key').val())";
const OPEN = "!root.child('el/end').exists()";
// 鉛筆は30本まで積める（それより上は計算でもはじかれる）
el.cells.$f.$k['.validate'] = el.cells.$f.$k['.validate'].replace("newData.child('n').isNumber()", "newData.child('n').isNumber() && newData.child('n').val() <= 30");
// 詰みの知らせ：rep/{層}/{番号} { t, u, m：いちばん先まで行った割合, a：自動の判定, l：言葉 }。1人10秒に1回まで（u の r）
el.u.$uid.r = { '.write': `${OPEN} && auth != null && auth.uid === $uid && newData.exists()`, '.validate': "newData.isNumber() && newData.val() === now && (!data.exists() || now - data.val() >= 10000)" };
el.rep = {
  '.read': ADMIN,
  $f: {
    '.write': `!newData.exists() && ${ADMIN}`, '.validate': "$f.matches(/^([1-9]|[1-9][0-9]|100)$/)",
    $id: {
      '.write': `(${OPEN} && auth != null && !data.exists() && newData.exists() && newData.child('u').val() === auth.uid && newData.child('t').val() === now && newData.parent().parent().parent().child('u/' + auth.uid + '/r').val() === now) || (!newData.exists() && ${ADMIN})`,
      '.validate': "$id.matches(/^[A-Za-z0-9_-]{8,30}$/) && newData.hasChildren(['t', 'u', 'm', 'a'])",
      t: { '.validate': true }, u: { '.validate': 'newData.isString()' },
      m: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 1000' },
      a: { '.validate': "newData.isString() && newData.val().length <= 300" },
      l: { '.validate': "newData.isString() && newData.val().matches(/^(ja|en|zh|ko)$/)" },
      $other: { '.validate': false },
    },
  },
};
// 管理人への相談：ask/{番号} { t, u, m：文（300文字まで）, x：XのID, l：言葉, f：最前線の層 }。1人1分に1回まで（u の a）。ゲームが終わったあとも送れる
el.u.$uid.a = { '.write': "auth != null && auth.uid === $uid && newData.exists()", '.validate': "newData.isNumber() && newData.val() === now && (!data.exists() || now - data.val() >= 60000)" };
el.ask = {
  '.read': ADMIN, '.indexOn': ['t'],
  $id: {
    '.write': `(auth != null && !data.exists() && newData.exists() && newData.child('u').val() === auth.uid && newData.child('t').val() === now && newData.parent().parent().child('u/' + auth.uid + '/a').val() === now) || (!newData.exists() && ${ADMIN})`,
    '.validate': "$id.matches(/^[A-Za-z0-9_-]{8,30}$/) && newData.hasChildren(['t', 'u', 'm', 'x', 'l', 'f'])",
    t: { '.validate': true }, u: { '.validate': 'newData.isString()' },
    m: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 300' },
    x: { '.validate': "newData.isString() && newData.val().matches(/^[A-Za-z0-9_]{0,15}$/)" },
    l: { '.validate': "newData.isString() && newData.val().matches(/^(ja|en|zh|ko)$/)" },
    f: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 101' },
    $other: { '.validate': false },
  },
};
// 一番乗りノート：その層を越えた本人が、15分以内に1回だけ名前（w）を書ける。管理人は「名無し」にできる
const W_RULE = `(${OPEN} && auth != null && !data.exists() && newData.exists() && data.parent().child('u').val() === auth.uid && now - data.parent().child('t').val() < 900000) || (${ADMIN} && data.parent().exists() && newData.exists())`;
const W_VAL = "newData.isString() && newData.val().length >= 1 && newData.val().length <= 12";
el.open.$f.w = { '.write': W_RULE, '.validate': W_VAL };
el.clear.$f.$id.w = { '.write': W_RULE, '.validate': W_VAL };
// 卒業生（第100層を越えた人）の名前を管理人が消した印（まとめ作りがノートに反映する）
el.gb = { '.read': true, $id: { '.write': ADMIN, '.validate': "$id.matches(/^[A-Za-z0-9_-]{8,30}$/) && newData.val() === true" } };
// 管理人が見た印（詰みの知らせを読んだ）
el.repok = { '.read': ADMIN, $f: { '.write': ADMIN, '.validate': 'newData.isNumber()' } };
const out = JSON.stringify(el, null, 2);
if (/ft_(?!admin)/.test(out.replace(/ft_admins?/g, ''))) throw new Error('ft_ が残っています');
fs.writeFileSync(new URL('../database.rules.el.json', import.meta.url), out);
console.log('database.rules.el.json を作りました', Object.keys(el).join(' '));
