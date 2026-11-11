// =============================================
//  エンピツライフ  音（ぜんぶその場で作る。読み込みなし）
//  ・BGM：層の種類ごとに曲が変わる（ふつう・9種類・頂上）
//  ・効果音：跳ぶ・着地・つかまる・死んだ・水・技・越えた など
// =============================================
(function (G) {
  const FT = G.FT;
  let ac = null, master = null, bgmGain = null, seGain = null, noiseBuf = null;
  const S = FT.SND = { on: true, bgmVol: 0.5, seVol: 0.8, cur: null };
  try { const v = JSON.parse(localStorage.getItem('el_snd') || 'null'); if (v) Object.assign(S, v); } catch (e) { }
  S.save = () => { try { localStorage.setItem('el_snd', JSON.stringify({ on: S.on, bgmVol: S.bgmVol, seVol: S.seVol })); } catch (e) { } };
  S.unlock = function () {
    if (!ac) {
      const C = G.AudioContext || G.webkitAudioContext; if (!C) return;
      try { ac = new C(); } catch (e) { return; }
      master = ac.createGain(); master.gain.value = S.on ? 1 : 0; master.connect(ac.destination);
      bgmGain = ac.createGain(); bgmGain.gain.value = S.bgmVol * 0.32; bgmGain.connect(master);
      seGain = ac.createGain(); seGain.gain.value = S.seVol * 0.5; seGain.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate); const d = noiseBuf.getChannelData(0); let s = 7; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
    }
    if (ac.state === 'suspended') ac.resume();
  };
  S.setOn = v => { S.on = v; if (master) master.gain.value = v ? 1 : 0; S.save(); };
  S.setVol = (b, s) => { if (b !== undefined) S.bgmVol = b; if (s !== undefined) S.seVol = s; if (bgmGain) { bgmGain.gain.value = S.bgmVol * 0.32; seGain.gain.value = S.seVol * 0.5; } S.save(); };
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  // ---------- 1音 ----------
  function note(dst, t, m, d, type, v, opt) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(mtof(m), t);
    if (opt && opt.slide) o.frequency.exponentialRampToValueAtTime(mtof(m + opt.slide), t + d);
    if (opt && opt.vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 5.5; lg.gain.value = mtof(m) * 0.012; l.connect(lg); lg.connect(o.frequency); l.start(t + d * 0.3); l.stop(t + d + 0.05); }
    const a = (opt && opt.a) || 0.005, r = Math.min(d, (opt && opt.r) || d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.setValueAtTime(v, t + Math.max(a, d - r)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(dst); o.start(t); o.stop(t + d + 0.02);
  }
  function noise(dst, t, d, v, f, type) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; const fl = ac.createBiquadFilter(); fl.type = type || 'highpass'; fl.frequency.value = f || 6000; const g = ac.createGain();
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); s.connect(fl); fl.connect(g); g.connect(dst); s.start(t); s.stop(t + d + 0.02);
  }
  function kick(dst, t, v) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); o.connect(g); g.connect(dst); o.start(t); o.stop(t + 0.18); }
  // ---------- 曲の設計（20の景色＋番人2曲） ----------
  const MODES = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10], dor: [0, 2, 3, 5, 7, 9, 10], phr: [0, 1, 3, 5, 7, 8, 10], lyd: [0, 2, 4, 6, 7, 9, 11], mix: [0, 2, 4, 5, 7, 9, 10], hmin: [0, 2, 3, 5, 7, 8, 11] };
  // [テンポ, 調, 主音, 進行（音階の度数）, 旋律の音色, 伴奏, 太鼓の強さ, 旋律の密度]
  const SONGS = [
    [92, 'lyd', 62, [0, 4, 1, 4], 'sine', 'arp', 0.3, 0.45],        // ふつう（根の洞）
    [116, 'lyd', 67, [0, 1, 4, 3], 'triangle', 'arp', 0.5, 0.55],   // 吹き抜け（緑）
    [128, 'dor', 60, [0, 6, 3, 4], 'square', 'arp', 0.8, 0.55],     // 魔物（黄）
    [108, 'maj', 65, [0, 4, 5, 3], 'triangle', 'arp', 0.6, 0.55],   // 実（桃）
    [136, 'hmin', 52, [0, 5, 6, 4], 'square', 'arp', 1.0, 0.6],     // 炎（赤）
    [100, 'mix', 60, [0, 6, 3, 4], 'triangle', 'arp', 0.6, 0.5],    // 細い枝（茶）
    [80, 'lyd', 65, [0, 1, 0, 4], 'sine', 'pad', 0.0, 0.35],        // 何もない空（灰）
    [96, 'phr', 57, [0, 1, 0, 6], 'triangle', 'pad', 0.4, 0.4],     // 見えない棘（黒）
    [84, 'min', 57, [0, 5, 3, 4], 'sine', 'pad', 0.3, 0.35],        // 水（青）
    [72, 'phr', 52, [0, 1, 0, 1], 'triangle', 'pad', 0.25, 0.25],   // 闇（紫）
    [120, 'maj', 64, [0, 4, 5, 3], 'square', 'arp', 0.8, 0.6],      // 頂上
  ];
  const BOSS_SONG = [158, 'hmin', 52, [0, 1, 0, 6], 'square', 'arp', 1.0, 0.7];
  const GATE_SONG = [150, 'phr', 50, [0, 1, 5, 4], 'sawtooth', 'arp', 1.0, 0.75];
  // 旋律は決まった乱数で作る（毎回同じ曲になる）
  function makeSong(def, seed) {
    let s = seed * 9301 + 49297; const R = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const [bpm, mode, root, prog, lead, acc, drum, dens] = def, sc = MODES[mode];
    const deg = (d, oct) => root + sc[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + (oct || 0));
    // 2小節のモチーフを作り、少し変えながら8小節に
    const motif = []; let cur = 4;
    for (let i = 0; i < 16; i++) { if (R() < dens || i === 0) { cur += Math.round((R() - 0.5) * 4); cur = Math.max(0, Math.min(11, cur)); motif.push([i, cur, R() < 0.3 ? 2 : 1]); } }
    const bars = [];
    for (let b = 0; b < 8; b++) {
      const ch = prog[b % prog.length], notes = [];
      for (const [i, d, len] of motif) { if (b % 2 === 1 && i < 8) continue; let dd = d + (b >= 4 ? (b % 2 ? 2 : 0) : 0); if (i === 0) dd = ch + 7; notes.push([i + (b % 2 === 1 ? 0 : 0), deg(dd, 0), len]); }
      if (b % 2 === 1) for (const [i, d, len] of motif) if (i < 8) notes.push([i + 8 > 15 ? i : i, deg(d + ch - prog[0] + 2, 0), len]);
      bars.push({ ch, notes });
    }
    return { bpm, deg, sc, root, lead, acc, drum, bars };
  }
  // ---------- 流す（少し先まで予約していく） ----------
  let timer = null, pos = 0, nextT = 0, song = null, songKey = '';
  function schedule() {
    if (!ac || !song) return;
    const st = 60 / song.bpm / 4; // 16分音符
    while (nextT < ac.currentTime + 0.25) {
      const bar = Math.floor(pos / 16) % song.bars.length, i = pos % 16, B = song.bars[bar], t = nextT;
      // 伴奏
      const chord = [0, 2, 4].map(k => song.deg(B.ch + k, -1));
      if (song.acc === 'arp') { if (i % 2 === 0) note(bgmGain, t, chord[(i / 2) % 3] + (i >= 8 ? 12 : 0), st * 1.6, 'square', 0.035, { r: st }); }
      else if (i === 0) for (const m of chord) note(bgmGain, t, m, st * 15, 'triangle', 0.05, { a: 0.3, r: st * 6 });
      // ベース
      if (i % 4 === 0) note(bgmGain, t, song.deg(B.ch, -2), st * (i % 8 === 0 ? 3 : 2), 'triangle', 0.16, { r: st });
      // 旋律
      for (const [k, m, len] of B.notes) if (k === i) note(bgmGain, t, m + 12, st * 2 * len * 0.95, song.lead, song.lead === 'sine' ? 0.09 : 0.045, { vib: len > 1, r: st });
      // 太鼓
      if (song.drum > 0) {
        if (i % 8 === 0) kick(bgmGain, t, 0.35 * song.drum);
        if (i % 8 === 4) noise(bgmGain, t, 0.12, 0.08 * song.drum, 1800, 'bandpass');
        if (i % 2 === 0) noise(bgmGain, t, 0.03, 0.025 * song.drum, 8000);
      }
      pos++; nextT += st;
    }
  }
  // which：景色の番号（0〜19）／'boss'／'gate'／null で止める
  S.bgm = function (which) {
    const key = String(which); if (key === songKey && timer) return; songKey = key;
    if (timer) { clearInterval(timer); timer = null; }
    if (which === null || which === undefined || !ac) { song = null; S.cur = null; return; }
    const def = which === 'boss' ? BOSS_SONG : which === 'gate' ? GATE_SONG : SONGS[which % SONGS.length];
    song = makeSong(def, typeof which === 'number' ? which + 3 : which === 'boss' ? 77 : 99); S.cur = which;
    pos = 0; nextT = ac.currentTime + 0.08; schedule(); timer = setInterval(schedule, 60);
  };
  S.restart = () => { const k = songKey; songKey = ''; S.bgm(k === 'boss' || k === 'gate' ? k : (k === 'null' ? null : Number(k))); };
  // ---------- 効果音 ----------
  S.se = function (k, a) {
    if (!ac || !S.on) return; const t = ac.currentTime, d = seGain;
    switch (k) {
      case 'jump': note(d, t, 74, 0.1, 'triangle', 0.1, { slide: 7 }); break;
      case 'bounce': note(d, t, 72, 0.18, 'square', 0.07, { slide: 19 }); break;
      case 'flap': noise(d, t, 0.04, 0.03, 3000, 'bandpass'); break;
      case 'land': noise(d, t, 0.05, 0.07, 900, 'lowpass'); break;
      case 'grab': note(d, t, 79, 0.08, 'sine', 0.1); note(d, t + 0.06, 86, 0.1, 'sine', 0.08); break;
      case 'die': note(d, t, 76, 0.5, 'sine', 0.12, { slide: -24 }); noise(d, t, 0.25, 0.06, 2400, 'bandpass'); break;
      case 'pile': [84, 88, 91].forEach((m, i) => note(d, t + 0.1 + i * 0.05, m, 0.3, 'sine', 0.05)); break;
      case 'merge': [79, 83, 86, 91].forEach((m, i) => note(d, t + 0.1 + i * 0.05, m, 0.35, 'sine', 0.05)); break;
      case 'splash': noise(d, t, 0.25, 0.12, 1200, 'lowpass'); break;
      case 'leap': noise(d, t, 0.15, 0.08, 2000, 'bandpass'); note(d, t, 70, 0.12, 'sine', 0.06, { slide: 12 }); break;
      case 'freeze': [96, 91, 88].forEach((m, i) => note(d, t + i * 0.05, m, 0.25, 'sine', 0.06)); break;
      case 'block': note(d, t, 45, 0.15, 'square', 0.12); noise(d, t, 0.1, 0.1, 600, 'lowpass'); break;
      case 'clear': [72, 76, 79, 84, 88].forEach((m, i) => note(d, t + i * 0.09, m, 0.32, 'triangle', 0.09)); note(d, t + 0.45, 96, 0.8, 'sine', 0.1, { vib: 1 }); break;
      case 'open': [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => note(d, t + i * 0.07, m, 0.5, 'triangle', 0.08)); break;
      case 'tap': note(d, t, 84, 0.05, 'sine', 0.06); break;
      case 'warn': note(d, t, 88, 0.06, 'square', 0.03); break;
      case 'fire': noise(d, t, 0.3, 0.06, 900, 'bandpass'); break;
      case 'ui': note(d, t, 79, 0.07, 'sine', 0.05); note(d, t + 0.04, 86, 0.12, 'sine', 0.04); noise(d, t, 0.12, 0.02, 4000, 'bandpass'); break;
      case 'close': note(d, t, 84, 0.06, 'sine', 0.04); note(d, t + 0.04, 77, 0.1, 'sine', 0.035); break;
      case 'flip': noise(d, t, 0.09, 0.05, 2600, 'bandpass'); note(d, t + 0.08, 88, 0.18, 'triangle', 0.05); note(d, t + 0.12, 95, 0.25, 'sine', 0.035); break;
      case 'banner': note(d, t, 48, 2.2, 'sine', 0.09, { a: 0.02, r: 1.8 }); note(d, t, 60, 1.8, 'triangle', 0.035, { a: 0.02, r: 1.5 }); note(d, t + 0.02, 67, 1.6, 'sine', 0.03, { a: 0.03, r: 1.4, vib: 1 }); noise(d, t, 0.6, 0.03, 500, 'lowpass'); break;
      case 'start': [55, 62, 67, 74, 79].forEach((m, i) => note(d, t + i * 0.12, m, 1.6 - i * 0.15, 'sine', 0.05, { a: 0.02, r: 1.2 })); noise(d, t, 1.2, 0.025, 1800, 'bandpass'); break;
      case 'pause': note(d, t, 72, 0.12, 'sine', 0.05); note(d, t + 0.07, 67, 0.2, 'sine', 0.04); break;
      case 'fall': noise(d, t, 0.6, 0.05, 300, 'lowpass'); note(d, t, 43, 0.7, 'sine', 0.08, { slide: -7 }); break;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
