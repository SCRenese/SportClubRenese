// Test di statistiche, record e grafici. Esecuzione: node tests/stat.test.mjs
import '../js/statistiche.js';
const S = globalThis.STAT;
let ok = 0, ko = 0;
const check = (nome, cond, extra = '') => { cond ? ok++ : ko++; console.log(`${cond ? '✓' : '✗'} ${nome}${cond ? '' : ' ' + extra}`); };

check('sec: m:ss.d', S.sec('1:52.4') === 112.4);
check('sec: m:ss con virgola', S.sec('1:52,4') === 112.4);
check('sec: h:mm:ss', S.sec('1:05:00') === 3900);
check('sec: 45:00 sono 45 minuti', S.sec('45:00') === 2700);
check('sec: testo non valido', S.sec('abc') === null && S.sec('') === null && S.sec(null) === null);
check('fmt: passo', S.fmt(112.4) === '1:52.4');
check('fmt: secondi interi', S.fmt(2700) === '45:00');
check('fmt: ore', S.fmt(3900) === '1:05:00');
check('fmt: secondi sotto il minuto', S.fmt(65.2) === '1:05.2');

const reso = [
  { id: 'a', data: '2026-11-02', lavoro: '6x500', distanza_m: 3000, durata: '12:30', passo_500: '1:55.0', peso_kg: null },
  { id: 'b', data: '2026-11-09', lavoro: '2000 m test', distanza_m: 2000, durata: '7:10', passo_500: '1:47.5', peso_kg: null },
  { id: 'c', data: '2026-11-16', lavoro: 'Fondo', distanza_m: 10000, durata: '45:00', passo_500: '2:10.0', peso_kg: null },
  { id: 'd', data: '2026-11-18', lavoro: 'Squat', distanza_m: null, durata: null, passo_500: null, peso_kg: 62.5 },
  { id: 'e', data: '2026-11-20', lavoro: 'Squat', distanza_m: null, durata: null, passo_500: null, peso_kg: 65 }
];
const ris = [
  { id: 'r1', data: '2026-09-20', gara: 'Regata A', specialita: 'Elba', barca: 'Singolo', posizione: 1, tempo: '4:58.2' },
  { id: 'r2', data: '2026-10-11', gara: 'Regata B', specialita: 'Elba', barca: 'Singolo', posizione: 3, tempo: '4:55.0' },
  { id: 'r3', data: '2026-10-25', gara: 'Regata C', specialita: 'Jole', barca: 'Doppio', posizione: 6, tempo: '5:10.0' },
  { id: 'r4', data: '2026-11-01', gara: 'Regata D', specialita: null, barca: null, posizione: null, tempo: null }
];
const rc = S.records(reso, ris);
check('record: miglior passo', rc.allenamenti.passo.testo === '1:47.5 /500 m' && rc.allenamenti.passo.data === '2026-11-09', JSON.stringify(rc.allenamenti.passo));
check('record: seduta più lunga', rc.allenamenti.distanza.testo === '10,0 km', JSON.stringify(rc.allenamenti.distanza));
check('record: durata massima', rc.allenamenti.durata.testo === '45:00', JSON.stringify(rc.allenamenti.durata));
check('record: peso massimo', rc.allenamenti.peso.testo === '65,0 kg', JSON.stringify(rc.allenamenti.peso));
check('record gare: miglior tempo per specialità/barca', rc.gare.find(g => g.chiave === 'Elba · Singolo')?.testo === '4:55.0' && rc.gare.length === 2, JSON.stringify(rc.gare));
check('gare: totali, ori e podi', rc.tot.gare === 4 && rc.tot.ori === 1 && rc.tot.podi === 2 && rc.tot.migliorPos === 1, JSON.stringify(rc.tot));
const vuoto = S.records([], []);
check('nessun dato: nessun record e nessun errore', Object.keys(vuoto.allenamenti).length === 0 && vuoto.gare.length === 0 && vuoto.tot.gare === 0);

const sett = S.settimane(reso, 4, '2026-11-20');
check('settimane: 4 voci dal lunedì', sett.length === 4 && sett[3].k === '2026-11-16' && sett[0].k === '2026-10-26', JSON.stringify(sett.map(s => s.k)));
check('settimane: somma dei km', sett[3].km === 10 && sett[2].km === 2 && sett[1].km === 3 && sett[0].km === 0, JSON.stringify(sett));

const html = S.html(reso, ris, '2026-11-20');
check('pagina: contiene grafici e record', (html.match(/<svg/g) || []).length >= 3 && html.includes('Record personali') && html.includes('Vedi i dati'));
check('pagina: niente "undefined" o NaN', !/undefined|NaN/.test(html), (html.match(/.{20}(undefined|NaN).{20}/) || [])[0]);
check('pagina vuota: messaggio', /empty/.test(S.html([], [])));
const unico = S.html([reso[1]], []);
check('un solo punto non rompe i grafici', !/undefined|NaN/.test(unico) && unico.includes('<svg'));
const xss = S.html([{ id: 'x', data: '2026-11-01', lavoro: '<img src=x onerror=alert(1)>', distanza_m: 1000, passo_500: '2:00.0' }], []);
check('il testo dell’utente nei tooltip è sempre escapato', !xss.includes('<img'));

console.log(`\n${ok} ok, ${ko} falliti`);
process.exit(ko ? 1 : 0);
