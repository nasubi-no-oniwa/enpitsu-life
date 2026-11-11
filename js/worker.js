// 鉛筆と越えた記録の確かめを、遊びの手を止めずに別の所で計算する
const V = ((self.location && self.location.search || '').match(/v=([^&]+)/) || [])[1] || '0';
importScripts('engine.js?v=' + V, 'verify.js?v=' + V);
onmessage = function (ev) {
  const d = ev.data, FT = self.FT;
  try {
    if (d.type === 'deaths') postMessage({ id: d.id, res: FT.V.verifyDeaths(d.lv, d.items, d.present, d.bad, d.budget) });
    else if (d.type === 'clear') postMessage({ id: d.id, res: !!FT.V.verifyClear(d.lv, d.c, d.present) });
    else if (d.type === 'stuck') { importScripts('stuck.js?v=' + V); postMessage({ id: d.id, res: FT.stuckCheck(d.lv, d.cor, d.opt) }); }
  } catch (e) { postMessage({ id: d.id, err: String(e) }); }
};
