/* Informativa privacy (art. 13 GDPR) — BOZZA da far validare al club.
   Completa i campi tra [parentesi quadre] prima della messa online e
   aumenta VERSIONE a ogni modifica sostanziale: gli utenti che si iscrivono
   registrano la versione che hanno letto. */
window.PRIVACY = {
  VERSIONE: '1.0-bozza',
  TITOLARE: 'ASD Sport Club Renese [ragione sociale e sede legale da completare]',
  CONTATTO: '[email del club per le richieste privacy — da completare]',
  testo() {
    const T = this.TITOLARE, C = this.CONTATTO;
    return '<div class="small" style="line-height:1.5">' +
      '<p><b>Titolare del trattamento:</b> ' + T + '. Contatto: ' + C + '.</p>' +
      '<p><b>Chi gestisce l’app:</b> lo sviluppatore dell’app opera per conto del club come responsabile del trattamento.</p>' +
      '<h3>Quali dati trattiamo</h3><p>Nome, cognome, email, telefono, data di nascita e numero di tessera (se li inserisci), tipo di socio (atleta o sostenitore), presenze e risposte agli allenamenti, gare ed eventi, risultati e resoconti di allenamento. Per i minori di 18 anni anche nome e contatto del genitore o tutore e la data del suo consenso.</p>' +
      '<h3>Perché e su quale base</h3><p>Per gestire l’iscrizione al club e le sue attività sportive (esecuzione del rapporto associativo) e per organizzare allenamenti, gare ed eventi. Per i minori la richiesta e il consenso sono dati dal genitore o tutore.</p>' +
      '<h3>Chi vede i tuoi dati</h3><p>Gli altri soci attivi vedono nome, cognome, tipo di socio e ruolo, e le risposte e presenze agli allenamenti, gare ed eventi (note comprese: non scriverci dati di salute) e i risultati di gara. Email, telefono, data di nascita, tessera e dati del tutore sono visibili solo a te e agli amministratori incaricati delle iscrizioni. I tuoi resoconti sono visibili a te e agli amministratori degli allenamenti.</p>' +
      '<h3>Dove sono conservati</h3><p>I dati sono archiviati su Supabase (fornitore del database) [regione dei server da verificare e indicare]. L’app è pubblicata su GitHub Pages. Non usiamo pubblicità né strumenti di tracciamento e non cediamo i dati a terzi.</p>' +
      '<h3>Classifiche pubbliche</h3><p>Le classifiche delle gare sono dati già pubblicati dalla federazione (FICSF) e riportano nome, società, categoria e punti. L’app non ne pubblica il numero di tessera.</p>' +
      '<h3>Per quanto tempo</h3><p>Finché sei socio e per il tempo necessario agli obblighi del club [periodo di conservazione da definire]. Poi i dati vengono cancellati o resi anonimi.</p>' +
      '<h3>I tuoi diritti</h3><p>Puoi chiedere accesso, rettifica, cancellazione, limitazione e portabilità dei dati, e opporti al trattamento, scrivendo a ' + C + '. Puoi anche proporre reclamo al Garante per la protezione dei dati personali (garanteprivacy.it).</p>' +
      '<p class="muted">Versione ' + this.VERSIONE + '</p></div>';
  }
};
