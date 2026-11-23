/* Statistiche, record personali e grafici della scheda atleta.
   Funzioni pure (niente accesso al DOM): si testano con node tests/stat.test.mjs.
   I grafici sono SVG con una sola serie ciascuno, nel blu del club; ogni punto ha un
   tooltip (<title>) e sotto ogni grafico c'è la tabella dei dati. */
(function (root) {
  const DAY = 864e5;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = v => (v === null || v === undefined || v === '' || isNaN(+v)) ? null : +v;
  const it = (n, d) => n.toFixed(d === undefined ? 1 : d).replace('.', ',');

  // "1:52.4" -> 112.4 · "45:00" -> 2700 (m:ss) · "1:05:00" -> 3900 (h:mm:ss)
  function sec(p) {
    if (!p) return null;
    const parti = String(p).trim().replace(',', '.').split(':');
    if (parti.length < 2 || parti.length > 3 || parti.some(x => !/^\d+(\.\d+)?$/.test(x))) return null;
    return parti.reduce((t, x) => t * 60 + parseFloat(x), 0);
  }
  function fmt(s, dec) {
    if (s === null || s === undefined) return '—';
    const d = dec === undefined ? (Math.abs(s - Math.round(s)) > 0.001 ? 1 : 0) : dec;
    s = Math.round(s * Math.pow(10, d)) / Math.pow(10, d);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s - h * 3600 - m * 60;
    const rs = (r < 10 ? '0' : '') + r.toFixed(d);
    return (h ? h + ':' + (m < 10 ? '0' : '') + m : m) + ':' + rs;
  }
  const dmy = k => { const p = String(k).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
  const dbreve = k => { const p = String(k).slice(0, 10).split('-'); return p[2] + '/' + p[1]; };
  const t0 = k => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  const iso = t => new Date(t).toISOString().slice(0, 10);
  function lunedi(k) { const t = t0(k), g = (new Date(t).getUTCDay() + 6) % 7; return iso(t - g * DAY); }

  function migliore(righe, valore, versoAlto) {
    let best = null;
    righe.forEach(r => { const v = valore(r); if (v === null || v === undefined) return; if (!best || (versoAlto ? v > best.v : v < best.v)) best = { v, r }; });
    return best;
  }

  /* ---------- record e totali ---------- */
  function records(reso, ris) {
    const a = {};
    const p = migliore(reso, r => sec(r.passo_500), false);
    if (p) a.passo = { testo: fmt(p.v, 1) + ' /500 m', data: p.r.data, lavoro: p.r.lavoro, id: p.r.id };
    const d = migliore(reso, r => num(r.distanza_m), true);
    if (d && d.v > 0) a.distanza = { testo: d.v >= 1000 ? it(d.v / 1000) + ' km' : d.v + ' m', data: d.r.data, lavoro: d.r.lavoro, id: d.r.id };
    const t = migliore(reso, r => sec(r.durata), true);
    if (t) a.durata = { testo: fmt(t.v), data: t.r.data, lavoro: t.r.lavoro, id: t.r.id };
    const w = migliore(reso, r => num(r.peso_kg), true);
    if (w && w.v > 0) a.peso = { testo: it(w.v) + ' kg', data: w.r.data, lavoro: w.r.lavoro, id: w.r.id };

    const gruppi = {};
    ris.forEach(r => {
      const v = sec(r.tempo); if (v === null) return;
      const k = [r.specialita, r.barca].filter(Boolean).join(' · ') || 'Gara';
      if (!gruppi[k] || v < gruppi[k].v) gruppi[k] = { v, r, n: 0 };
      gruppi[k].n++;
    });
    const gare = Object.keys(gruppi).sort().map(k => ({ chiave: k, testo: fmt(gruppi[k].v, 1), data: gruppi[k].r.data, gara: gruppi[k].r.gara, n: gruppi[k].n, id: gruppi[k].r.id }));
    const pos = ris.map(r => num(r.posizione)).filter(x => x);
    const tot = { gare: ris.length, ori: pos.filter(x => x === 1).length, podi: pos.filter(x => x <= 3).length, migliorPos: pos.length ? Math.min.apply(null, pos) : null };
    return { allenamenti: a, gare, tot };
  }

  /* ---------- serie temporali ---------- */
  function settimane(reso, n, oggi) {
    const fine = lunedi(oggi || iso(Date.now())), out = [];
    for (let i = n - 1; i >= 0; i--) out.push({ k: iso(t0(fine) - i * 7 * DAY), km: 0, sedute: 0 });
    const idx = {}; out.forEach((s, i) => { idx[s.k] = i; });
    reso.forEach(r => { const i = idx[lunedi(String(r.data).slice(0, 10))]; if (i === undefined) return; out[i].km += (num(r.distanza_m) || 0) / 1000; out[i].sedute++; });
    return out;
  }
  const serie = (righe, f) => righe.map(r => ({ k: String(r.data).slice(0, 10), v: f(r), r })).filter(x => x.v !== null && x.v !== undefined).sort((a, b) => a.k < b.k ? -1 : 1);

  /* ---------- grafici SVG ---------- */
  const W = 320, H = 170, L = 38, R = 10, T = 12, B = 24;
  function passoNice(max) { const e = Math.pow(10, Math.floor(Math.log10(max || 1))), f = max / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; }
  const asse = (ticks, y, f) => ticks.map(v => '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" class="g"/><text x="' + (L - 6) + '" y="' + (y(v) + 3).toFixed(1) + '" text-anchor="end">' + esc(f(v)) + '</text>').join('');
  const svg = (titolo, corpo) => '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(titolo) + '">' + corpo + '</svg>';

  // barre con base a zero, estremità arrotondata di 4 px, 2 px di spazio fra le barre
  function barre(punti, titolo, fv, ft) {
    const max = passoNice(Math.max.apply(null, punti.map(p => p.v).concat([0.1])) * 1.05);
    const y = v => H - B - (v / max) * (H - B - T), w = (W - L - R) / punti.length;
    const bw = Math.max(2, w - 2);
    let s = asse([0, max / 2, max], y, v => fv(v));
    punti.forEach((p, i) => {
      const x = L + i * w + 1, h = Math.max(0, H - B - y(p.v));
      if (h > 0) { const r = Math.min(4, bw / 2, h); s += '<path class="b" d="M' + x.toFixed(1) + ',' + (H - B) + 'V' + (y(p.v) + r).toFixed(1) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',-' + r + 'h' + (bw - 2 * r).toFixed(1) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + 'V' + (H - B) + 'z"/>'; }
      s += '<rect x="' + x.toFixed(1) + '" y="' + T + '" width="' + bw.toFixed(1) + '" height="' + (H - B - T) + '" fill="transparent"><title>' + esc(ft(p)) + '</title></rect>';
      if (i % Math.ceil(punti.length / 6) === 0) s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' + esc(dbreve(p.k)) + '</text>';
    });
    return svg(titolo, s);
  }

  // linea da 2 px, punti da 8 px con anello di 2 px, bersaglio di tocco più largo, etichetta diretta solo sul record
  function linea(punti, titolo, fv, ft, versoAlto) {
    const vs = punti.map(p => p.v), mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs), pad = (mx - mn) * 0.15 || mx * 0.05 || 1;
    const lo = mn - pad, hi = mx + pad, y = v => H - B - ((v - lo) / (hi - lo)) * (H - B - T);
    const a = t0(punti[0].k), b = t0(punti[punti.length - 1].k), x = k => punti.length === 1 || a === b ? (L + W - R) / 2 : L + ((t0(k) - a) / (b - a)) * (W - L - R);
    let s = asse([lo + pad * 0.3, (lo + hi) / 2, hi - pad * 0.3], y, fv);
    s += '<polyline class="l" points="' + punti.map(p => x(p.k).toFixed(1) + ',' + y(p.v).toFixed(1)).join(' ') + '"/>';
    const best = punti.reduce((m, p) => (versoAlto ? p.v > m.v : p.v < m.v) ? p : m, punti[0]);
    punti.forEach(p => {
      s += '<circle class="p' + (p === best ? ' pr' : '') + '" cx="' + x(p.k).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="4"/>' +
        '<circle cx="' + x(p.k).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="12" fill="transparent"><title>' + esc(ft(p)) + '</title></circle>';
    });
    const bx = x(best.k), anc = bx > W - 70 ? 'end' : bx < L + 40 ? 'start' : 'middle';
    s += '<text class="d" x="' + bx.toFixed(1) + '" y="' + (y(best.v) - 9).toFixed(1) + '" text-anchor="' + anc + '">Record ' + esc(fv(best.v)) + '</text>';
    s += '<text x="' + L + '" y="' + (H - 7) + '" text-anchor="start">' + esc(dbreve(punti[0].k)) + '</text>';
    if (punti.length > 1) s += '<text x="' + (W - R) + '" y="' + (H - 7) + '" text-anchor="end">' + esc(dbreve(punti[punti.length - 1].k)) + '</text>';
    return svg(titolo, s);
  }

  const tabella = (intest, righe) => '<details class="dati"><summary>Vedi i dati</summary><div class="table-wrap"><table><tr>' + intest.map((h, i) => '<th' + (i ? ' class="num"' : '') + '>' + esc(h) + '</th>').join('') + '</tr>' +
    righe.map(r => '<tr>' + r.map((c, i) => '<td' + (i ? ' class="num"' : '') + '>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</table></div></details>';
  const grafico = (titolo, nota, corpo, tab) => '<div class="card chart"><h3>' + esc(titolo) + '</h3>' + (nota ? '<p class="small muted" style="margin:0 0 6px">' + esc(nota) + '</p>' : '') + corpo + tab + '</div>';
  const tile = (valore, etichetta, sotto) => '<div class="stat"><b>' + esc(valore) + '</b><span>' + esc(etichetta) + '</span>' + (sotto ? '<small class="muted">' + esc(sotto) + '</small>' : '') + '</div>';

  /* ---------- pagina "Statistiche" ---------- */
  function html(reso, ris, oggi) {
    if (!reso.length && !ris.length) return '<div class="empty">Quando ci saranno resoconti e risultati di gara, qui compariranno statistiche, grafici e record personali.</div>';
    const rc = records(reso, ris), a = rc.allenamenti;
    let o = '<h3 style="margin:14px 0 8px">Record personali · allenamenti</h3>';
    const ta = [];
    if (a.passo) ta.push(tile(a.passo.testo, 'Miglior passo', dmy(a.passo.data)));
    if (a.distanza) ta.push(tile(a.distanza.testo, 'Seduta più lunga', dmy(a.distanza.data)));
    if (a.durata) ta.push(tile(a.durata.testo, 'Durata massima', dmy(a.durata.data)));
    if (a.peso) ta.push(tile(a.peso.testo, 'Peso massimo', dmy(a.peso.data)));
    o += ta.length ? '<div class="grid2">' + ta.join('') + '</div>' : '<p class="muted small">Registra distanza, tempo, passo o peso nei resoconti per vedere i record.</p>';

    o += '<h3 style="margin:18px 0 8px">Record personali · gare</h3>';
    if (rc.tot.gare) {
      o += '<div class="grid2">' + tile(String(rc.tot.gare), 'Gare disputate') + tile(rc.tot.ori + ' · ' + rc.tot.podi, 'Vittorie · podi') + '</div>';
      if (rc.gare.length) o += '<div class="table-wrap" style="margin-top:10px"><table><tr><th>Specialità / barca</th><th class="num">Miglior tempo</th><th class="num">Data</th></tr>' +
        rc.gare.map(g => '<tr><td>' + esc(g.chiave) + '<br><small class="muted">' + esc(g.gara) + '</small></td><td class="num"><b>' + esc(g.testo) + '</b></td><td class="num">' + dmy(g.data) + '</td></tr>').join('') + '</table></div>';
    } else o += '<p class="muted small">Nessun risultato di gara registrato.</p>';

    o += '<h3 style="margin:18px 0 8px">Progressi</h3><div class="stack">';
    const sett = settimane(reso, 12, oggi);
    if (sett.some(s => s.km > 0)) o += grafico('Chilometri a settimana', 'Ultime 12 settimane',
      barre(sett.map(s => ({ k: s.k, v: s.km, sedute: s.sedute })), 'Chilometri a settimana', v => it(v, v < 10 && v % 1 ? 1 : 0), p => 'Settimana dal ' + dmy(p.k) + ': ' + it(p.v) + ' km, ' + p.sedute + ' sedute'),
      tabella(['Settimana dal', 'Km', 'Sedute'], sett.map(s => [dmy(s.k), it(s.km), String(s.sedute)])));
    const sp = serie(reso, r => sec(r.passo_500));
    if (sp.length) o += grafico('Passo /500 m', 'Più basso = più veloce',
      linea(sp, 'Passo ogni 500 metri', v => fmt(v), p => dmy(p.k) + ' · ' + fmt(p.v) + ' /500 m' + (p.r.lavoro ? ' · ' + p.r.lavoro : ''), false),
      tabella(['Data', 'Passo /500 m'], sp.map(p => [dmy(p.k), fmt(p.v)])));
    const sw = serie(reso, r => num(r.peso_kg) || null);
    if (sw.length) o += grafico('Peso / carico', 'Chilogrammi registrati nei resoconti',
      linea(sw, 'Peso o carico in chilogrammi', v => it(v), p => dmy(p.k) + ' · ' + it(p.v) + ' kg' + (p.r.lavoro ? ' · ' + p.r.lavoro : ''), true),
      tabella(['Data', 'Kg'], sw.map(p => [dmy(p.k), it(p.v)])));
    const sd = serie(reso, r => num(r.distanza_m) ? num(r.distanza_m) / 1000 : null);
    if (sd.length > 1) o += grafico('Distanza per seduta', 'Chilometri',
      linea(sd, 'Distanza per seduta in chilometri', v => it(v), p => dmy(p.k) + ' · ' + it(p.v) + ' km', true),
      tabella(['Data', 'Km'], sd.map(p => [dmy(p.k), it(p.v)])));
    return o + '</div>';
  }

  root.STAT = { sec, fmt, records, settimane, serie, barre, linea, html };
})(typeof window !== 'undefined' ? window : globalThis);
