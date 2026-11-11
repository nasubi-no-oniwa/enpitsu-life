// =============================================
//  掲示板に書いてはいけない言葉・リンク・連絡先（Fairies' Tower と同じ決まり）
// =============================================
(function (G) {
  const FT = G.FT, T = (s, ...a) => FT.tr(s, ...a);
  const MAXLEN = 120;
  // ---------- 書いてはいけない言葉 ----------
  //  くらべる前に：全角半角をそろえる・小文字・カタカナをひらがな・空白や記号をぬく（「し ね」「シ.ネ」も止める）
  const BAN = [
    // 日本語
    'しね', '氏ね', '死ね', 'ころす', '殺す', 'ぶっころ', 'きえろ', '消えろ', 'じさつ', '自殺', 'くびつれ', '首吊',
    'がいじ', 'ちしょう', '池沼', '知恵遅れ', 'きちがい', '基地外', '気違い', 'かたわ', 'めくら', 'つんぼ',
    'ちんこ', 'ちんぽ', 'まんこ', 'せっくす', 'れいぷ', '犯す', 'おかす', 'ふぇら', 'えろ動画', 'えろ画像', 'ぱいずり', 'なかだし', '中出し',
    'うりせん', '売春', '援交', '援助交際', 'ぱぱかつ', 'ぱぱ活', '出会い系', 'せふれ',
    '支那', 'しなじん', 'ざいにち', '在日', 'ぶらく', '部落', 'くろんぼ', '黒んぼ', 'にがー',
    'らいん交換', 'らいんこうかん', 'line交換', 'かかお', 'でぃすこ', 'いんすた', '連絡先', 'でんわばんごう', '電話番号', '住所',
    // 英語
    'fuck', 'fuk', 'fck', 'shit', 'bitch', 'cunt', 'dick', 'cocksuck', 'pussy', 'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut', 'raping', 'rapist', 'kys', 'killyourself', 'porn', 'nazi', 'hitler', 'sex', 'nude', 'onlyfans', 'snapchat', 'telegram', 'whatsapp', 'discord', 'instagram',
    // 中国語
    '幹你', '幹您', '干你', '操你', '肏', '他媽', '他妈', '傻逼', '傻屄', '雞巴', '鸡巴', '白癡', '白痴', '智障', '去死', '賤人', '贱人', '婊子', '屄', '黑鬼', '約炮', '约炮', '色情', '援交',
    // 韓国語
    '씨발', '시발', '씨팔', 'ㅅㅂ', '병신', 'ㅂㅅ', '좆', '개새끼', '새끼', '지랄', '미친놈', '미친년', '닥쳐', '꺼져', '섹스', '보지', '자지', '창녀', '느금마', '니애미', '자살',
  ].map(w => norm(w)).filter(Boolean);
  function norm(s) {
    s = String(s || '').normalize('NFKC').toLowerCase();
    s = s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));   // カタカナ → ひらがな
    return s.replace(/[\s　.,、。・!！?？~〜ー\-_*＊/\\|()（）「」『』\[\]{}<>＜＞'"`^:;]/g, '');
  }
  // リンク・メール・電話・SNSのID
  const PAT = [/https?:|www\.|\.(com|net|org|jp|io|gg|me|ly|tv|xyz|info|app|dev)\b/i, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, /(\d[\s-]?){10,}/, /@[a-z0-9_]{3,}/i, /(line|kakao|discord|tg)\s*(id|:|：)/i];
  function check(text) {
    const t = String(text || '').trim();
    if (!t) return T('文を入れてください');
    if (t.length > MAXLEN) return T('{0}文字までです', MAXLEN);
    if ((t.match(/\n/g) || []).length > 4) return T('改行が多すぎます');
    if (/(.)\1{9,}/.test(t)) return T('同じ文字が続きすぎています');
    for (const p of PAT) if (p.test(t)) return T('リンク・連絡先・IDは書けません');
    const n = norm(t); for (const w of BAN) if (n.includes(w)) return T('使えない言葉が入っています');
    return '';
  }
  const bad = text => { const n = norm(text); if (BAN.some(w => n.includes(w))) return true; return PAT.some(p => p.test(String(text || ''))); };
  FT.BOARD_CHECK = check; FT.BOARD_BAD = bad;
})(typeof window !== 'undefined' ? window : globalThis);
