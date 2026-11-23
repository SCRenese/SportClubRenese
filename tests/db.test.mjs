// Test del database su Postgres reale (PGlite). Esecuzione: node tests/db.test.mjs
// Richiede @electric-sql/pglite (npm i --no-save @electric-sql/pglite).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
const SQL = readFileSync(new URL('../supabase-setup.sql', import.meta.url), 'utf8');
await db.exec(SQL);
await db.exec(SQL); // idempotente: la seconda esecuzione non deve dare errori

const id = n => `00000000-0000-0000-0000-00000000000${n}`;
const [S, J, I, A, B, M, N] = [1, 2, 3, 4, 5, 6, 7].map(id);
const user = (u, email, meta = {}) => db.query(
  `insert into auth.users values ($1,$2,$3)`, [u, email, JSON.stringify(meta)]);
await user(S, 's@x.it', { nome: 'Sara', cognome: 'Senior', data_nascita: '1980-01-01' });
await user(J, 'j@x.it', { nome: 'Jo', cognome: 'Junior', data_nascita: '1985-01-01' });
await user(I, 'i@x.it', { nome: 'Ida', cognome: 'Iscrizioni', data_nascita: '1985-01-01' });
await user(A, 'a@x.it', { nome: 'Anna', cognome: 'Atleta', tipo: 'atleta', data_nascita: '1990-01-01' });
await user(B, 'b@x.it', { nome: 'Bruno', cognome: 'Atleta', tipo: 'atleta', data_nascita: '1991-01-01' });
await user(M, 'm@x.it', { nome: 'Mia', cognome: 'Minore', tipo: 'atleta', data_nascita: '2015-05-05', tutore_nome: 'Genitore', privacy_versione: '1.0' });
await user(N, 'n@x.it', { nome: 'Nico', cognome: 'SenzaData', data_nascita: 'non-una-data' });

let ok = 0, ko = 0;
const check = (nome, cond, extra = '') => { cond ? ok++ : ko++; console.log(`${cond ? '✓' : '✗'} ${nome}${cond ? '' : ' ' + extra}`); };

// come superuser (SQL Editor): imposta i ruoli
await db.exec(`
  update profili set ruolo='senior', stato='attivo' where id='${S}';
  update profili set ruolo='junior', stato='attivo', gest_allenamenti=true where id='${J}';
  update profili set ruolo='junior', stato='attivo', gest_iscrizioni=true where id='${I}';
  update profili set stato='attivo', perm_allenamenti=true where id in ('${A}','${B}');
`);

const as = async (uid, role, sql, params) => {
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid || '']);
  try { const r = await db.query(sql, params); return { rows: r.rows, n: r.affectedRows }; }
  catch (e) { return { err: e.message }; }
  finally { await db.exec(`reset role`); await db.query(`select set_config('request.jwt.claim.sub','',false)`); }
};
const u = (uid, sql, p) => as(uid, 'authenticated', sql, p);

// 1. nessun auto-senior, dati dai metadata
const prof = (await db.query(`select * from profili where id=$1`, [M])).rows[0];
check('registrazione: socio in attesa, mai senior', prof.ruolo === 'socio' && prof.stato === 'in_attesa');
check('registrazione: tutore e privacy salvati', prof.tutore_nome === 'Genitore' && prof.privacy_versione === '1.0' && prof.privacy_il);
check('registrazione: data non valida non blocca', (await db.query(`select data_nascita from profili where id=$1`, [N])).rows[0].data_nascita === null);

// 2. privacy lettura profili
let r = await u(A, `select id from profili`);
check('socio vede solo il proprio profilo completo', r.rows?.length === 1 && r.rows[0].id === A, JSON.stringify(r));
r = await u(A, `select id, nome from profili_pub`);
check('socio vede i soci attivi nella vista pubblica', r.rows?.length === 5 && !r.rows.some(x => x.id === M), JSON.stringify(r));
r = await u(A, `select email from profili_pub`);
check('la vista pubblica non espone email', !!r.err);
r = await u(A, `select telefono, data_nascita from profili_pub`);
check('la vista pubblica non espone telefono/nascita', !!r.err);
r = await u(I, `select id from profili`);
check('chi gestisce le iscrizioni vede tutti i profili', r.rows?.length === 7, JSON.stringify(r));
r = await u(J, `select id from profili`);
check('junior senza iscrizioni vede solo sé', r.rows?.length === 1);
r = await as('', 'anon', `select id from profili`);
check('anon non legge profili', !!r.err);
r = await as('', 'anon', `select id from profili_pub`);
check('anon non legge la vista', !!r.err);
r = await as('', 'anon', `select public.e_senior()`);
check('anon non può eseguire le funzioni di permesso', !!r.err);

// 3. escalation
r = await u(A, `update profili set ruolo='senior' where id=$1`, [A]);
check('socio non si promuove senior', !!r.err);
r = await u(A, `update profili set stato='attivo', scadenza='2099-01-01' where id=$1`, [A]);
check('socio non cambia stato/scadenza da solo', !!r.err);
r = await u(I, `update profili set stato='sospeso' where id=$1`, [S]);
check('junior non modifica un senior', /senior/i.test(r.err || ''), JSON.stringify(r));
r = await u(A, `update profili set telefono='1' where id=$1`, [B]);
check('socio non modifica un altro socio', !r.err && r.n === 0, JSON.stringify(r));
r = await u(A, `update profili set telefono='333' where id=$1`, [A]);
check('socio modifica i propri dati', !r.err && r.n === 1, JSON.stringify(r));

// 4. minorenni
r = await u(I, `update profili set stato='attivo' where id=$1`, [M]);
check('minorenne non attivabile senza consenso', /minorenne/i.test(r.err || ''), JSON.stringify(r));
r = await u(M, `update profili set consenso_tutore_il=now() where id=$1`, [M]);
check('il minorenne non può darsi il consenso', !!r.err);
r = await u(I, `update profili set stato='attivo' where id=$1`, [N]);
check('senza data di nascita non si attiva', /data di nascita/i.test(r.err || ''), JSON.stringify(r));
r = await u(I, `update profili set consenso_tutore_il=now(), stato='attivo' where id=$1`, [M]);
check('con consenso registrato il minorenne si attiva', !r.err && r.n === 1, JSON.stringify(r));

r = await u(A, `update profili set data_nascita='2012-01-01' where id=$1`, [A]);
check('socio attivo non cambia la propria data di nascita', !!r.err, JSON.stringify(r));

// 5. resoconti
await db.query(`insert into resoconti (atleta_id, lavoro) values ($1,'6x500')`, [A]);
check('resoconto: lo vede l\'atleta', (await u(A, `select 1 from resoconti`)).rows.length === 1);
check('resoconto: non lo vede un altro socio', (await u(B, `select 1 from resoconti`)).rows.length === 0);
check('resoconto: lo vede chi gestisce gli allenamenti', (await u(J, `select 1 from resoconti`)).rows.length === 1);
check('resoconto: non lo vede un junior delle sole iscrizioni', (await u(I, `select 1 from resoconti`)).rows.length === 0);

// 6. posti
const att = (await db.query(`insert into attivita (tipo, ambiente, titolo, inizio, posti) values ('allenamento','indoor','Test', now() + interval '1 day', 1) returning id`)).rows[0].id;
r = await u(A, `insert into partecipazioni (attivita_id, user_id, risposta) values ($1,$2,'si')`, [att, A]);
check('prima iscrizione ok', !r.err, JSON.stringify(r));
r = await u(B, `insert into partecipazioni (attivita_id, user_id, risposta) values ($1,$2,'si')`, [att, B]);
check('posti esauriti oltre il limite', /Posti esauriti/.test(r.err || ''), JSON.stringify(r));
check('la funzione blocca la riga attività (for update)', /for update/i.test((await db.query(`select pg_get_functiondef('public.controlla_partecipazione'::regproc) d`)).rows[0].d));

const att2 = (await db.query(`insert into attivita (tipo, ambiente, titolo, inizio) values ('allenamento','indoor','Altro', now() + interval '2 day') returning id`)).rows[0].id;
r = await u(A, `update partecipazioni set attivita_id=$1 where user_id=$2`, [att2, A]);
check('non si sposta una partecipazione per aggirare i posti', /spostare/.test(r.err || ''), JSON.stringify(r));
await db.exec(`update profili set tutore_nome='Genitore', consenso_tutore_il=now() where id='${M}'`);
r = await u(M, `update profili set tutore_nome='Altro' where id=$1`, [M]);
check('dopo il consenso il socio non cambia il tutore', !!r.err, JSON.stringify(r));
await user('00000000-0000-0000-0000-000000000008', 'old@x.it');
await db.exec(`create policy "vecchia leggi tutti" on profili for select to authenticated using (true)`);
await db.exec(SQL);
check('la migrazione toglie le policy vecchie', (await db.query(`select 1 from pg_policies where policyname='vecchia leggi tutti'`)).rows.length === 0);

// 6b. sprint 2: note, risultati, autore
const att3 = (await db.query(`insert into attivita (tipo, ambiente, titolo, inizio) values ('allenamento','indoor','Note','2030-01-01') returning id`)).rows[0].id;
await db.exec(`insert into partecipazioni (attivita_id, user_id, risposta, nota) values ('${att3}','${A}','si','nota privata di Anna')`);
r = await u(B, `select * from partecipazioni where attivita_id=$1`, [att3]);
check('un altro socio non legge le note altrui dalla tabella', r.rows?.length === 0, JSON.stringify(r));
r = await u(A, `select nota from partecipazioni where attivita_id=$1`, [att3]);
check('l’interessato legge la propria nota', r.rows?.[0]?.nota === 'nota privata di Anna', JSON.stringify(r));
r = await u(J, `select nota from partecipazioni where attivita_id=$1`, [att3]);
check('il gestore della sezione legge le note', r.rows?.[0]?.nota === 'nota privata di Anna', JSON.stringify(r));
r = await u(B, `select * from partecipazioni_pub where attivita_id=$1`, [att3]);
check('la vista pubblica mostra la risposta ma non la nota', r.rows?.length === 1 && !('nota' in r.rows[0]), JSON.stringify(r));

const gara = (await db.query(`insert into attivita (tipo, titolo, inizio) values ('gara','Regata','2030-02-01') returning id`)).rows[0].id;
r = await u(A, `insert into risultati (atleta_id, attivita_id, gara, posizione, tempo) values ($1,$2,'Regata',1,'4:00.0')`, [A, gara]);
check('l’atleta non inventa un risultato', !!r.err, JSON.stringify(r));
r = await u(J, `insert into risultati (atleta_id, attivita_id, gara, posizione) values ($1,$2,'Regata',1)`, [A, gara]);
check('un junior senza gestione gare non inserisce risultati', !!r.err, JSON.stringify(r));
r = await u(S, `insert into risultati (atleta_id, attivita_id, gara, posizione, tempo, autore_id) values ($1,$2,'Regata',2,'4:10.0',$3) returning autore_id`, [A, gara, B]);
check('il senior inserisce il risultato e l’autore non si falsifica', r.rows?.[0]?.autore_id === S, JSON.stringify(r));
const risId = (await db.query(`select id from risultati limit 1`)).rows[0].id;
r = await u(A, `update risultati set posizione=1 where id=$1`, [risId]);
check('l’atleta non modifica la propria posizione', !r.err && r.n === 0, JSON.stringify(r));
r = await u(S, `update risultati set autore_id=$2 where id=$1 returning autore_id`, [risId, B]);
check('l’autore non si cambia in modifica', r.rows?.[0]?.autore_id === S, JSON.stringify(r));
r = await u(A, `insert into resoconti (atleta_id, lavoro, autore_id) values ($1,'6x500',$2) returning autore_id`, [A, B]);
check('resoconto: autore forzato a chi inserisce', r.rows?.[0]?.autore_id === A, JSON.stringify(r));
r = await u(J, `insert into attivita (tipo, ambiente, titolo, inizio, creato_da) values ('allenamento','indoor','X','2030-03-01',$1) returning creato_da`, [B]);
check('attività: creato_da forzato a chi crea', r.rows?.[0]?.creato_da === J, JSON.stringify(r));

// 6c. accettazione dell'informativa e peso nei resoconti
r = await u(A, `update profili set privacy_versione='2.0' where id=$1 returning privacy_versione, privacy_il`, [A]);
check('il socio accetta la nuova informativa e la data la mette il database', r.rows?.[0]?.privacy_versione === '2.0' && !!r.rows?.[0]?.privacy_il, JSON.stringify(r));
r = await u(A, `update profili set privacy_il='2000-01-01' where id=$1 returning privacy_il`, [A]);
check('la data di accettazione non si riscrive', r.rows?.[0]?.privacy_il && new Date(r.rows[0].privacy_il).getFullYear() > 2000, JSON.stringify(r));
r = await u(B, `update profili set privacy_versione='9.9' where id=$1`, [A]);
check('nessuno accetta l’informativa al posto di un altro', !!r.err || r.n === 0, JSON.stringify(r));
r = await u(A, `insert into resoconti (atleta_id, lavoro, peso_kg) values ($1,'Squat',62.5) returning peso_kg`, [A]);
check('l’atleta registra il peso/carico', Number(r.rows?.[0]?.peso_kg) === 62.5, JSON.stringify(r));
r = await u(A, `insert into resoconti (atleta_id, lavoro, peso_kg) values ($1,'Squat',900)`, [A]);
check('peso fuori limite rifiutato', !!r.err, JSON.stringify(r));
r = await u(A, `insert into resoconti (atleta_id, lavoro, distanza_m, durata, passo_500) values ($1,'6x500',3000,'12:30','1:52.4') returning id`, [A]);
check('l’atleta inserisce il proprio resoconto (tempi, distanze)', !!r.rows?.[0]?.id, JSON.stringify(r));
r = await u(B, `select id from resoconti where atleta_id=$1`, [A]);
check('un altro atleta non legge i resoconti altrui', r.rows?.length === 0, JSON.stringify(r));

// 7. dati pubblici
const cj = JSON.parse(readFileSync(new URL('../data/classifiche.json', import.meta.url), 'utf8'));
check('classifiche.json senza numeri di tessera', !JSON.stringify(cj).includes('"tessera"'));

console.log(`\n${ok} ok, ${ko} falliti`);
process.exit(ko ? 1 : 0);
