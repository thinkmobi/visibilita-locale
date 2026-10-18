/* Visibilità locale: gestione prospect, giro e stampe. Dati in un repository GitHub privato,
   copia locale in IndexedDB per lavorare offline. Nessun dato vive nel repository dell'app. */
'use strict';
const VERSIONE = '1.7.0';
const STATI = ['Da contattare', 'Contattato', 'In attesa di risposta', 'Visita fissata', 'Visita fatta', 'Proposta inviata', 'Trattativa', 'Chiuso vinto', 'Chiuso perso', 'Scartato'];
const CHIUSI = ['Chiuso vinto', 'Chiuso perso', 'Scartato'];
const CANALI = ['Telefono', 'Passaggio in agenzia', 'Visita', 'WhatsApp', 'Email', 'LinkedIn'];
const ESITI = ['Nessuna risposta', 'Segreteria', 'Richiamare', 'Report consegnato', 'Interessato', 'Appuntamento fissato', 'Proposta inviata', 'Obiezione', 'Non interessato', 'Firmato'];
const ESITO_STATO = { 'Nessuna risposta': 'Contattato', 'Segreteria': 'Contattato', 'Richiamare': 'Contattato', 'Report consegnato': 'Contattato',
  'Interessato': 'In attesa di risposta', 'Appuntamento fissato': 'Visita fissata', 'Proposta inviata': 'Proposta inviata', 'Obiezione': 'Trattativa',
  'Non interessato': 'Chiuso perso', 'Firmato': 'Chiuso vinto' };
const ESITO_AZIONE = { 'Nessuna risposta': ['Richiamare', 1], 'Segreteria': ['Richiamare', 1], 'Richiamare': ['Richiamare', 2],
  'Report consegnato': ["Telefonare per fissare l'incontro", 3], 'Interessato': ["Fissare l'incontro", 2], 'Appuntamento fissato': ["Incontro: presentare l'analisi completa", 0],
  'Proposta inviata': ['Sentire per la decisione sulla proposta', 4], 'Obiezione': ["Rispondere all'obiezione", 2] };
const PRIORITA = ['1 Caldo', '2 Tiepido', '0 Invisibile', '3 Rete'];   // ordine di lavoro: prima i caldi
const PRODOTTI = ['GBP SEO', 'SEO locale', 'AI SEO', 'InRete', 'Scheda PagineGialle', 'PgCasa', 'TuttoCittà', 'Display', 'Pacchetto misto'];
const RETI = /tecnocasa|gabetti|tempocasa|re\/?max|engel|century ?21|grimaldi|coldwell|toscano|professionecasa|frimm|soloaffitti|fondocasa|affiliato|franchising/i;
const MOTORE = ['motore/report.py', 'motore/importa.py', 'motore/siti.py', 'motore/requirements.txt',
  ...['PlexCond-Bold', 'PlexCond-SemiBold', 'PlexMono-Bold', 'PlexMono-Medium', 'PlexMono-Regular', 'PlexSans-Bold', 'PlexSans-Medium', 'PlexSans-Regular', 'PlexSans-SemiBold', 'DejaVuSans'].map((f) => `motore/fonts/${f}.ttf`)];
const WORKFLOW = { 'motore/workflows/report.yml': '.github/workflows/report.yml', 'motore/workflows/importa.yml': '.github/workflows/importa.yml', 'motore/workflows/siti.yml': '.github/workflows/siti.yml' };

const ST = { cfg: {}, zone: {}, conf: { firma: {} }, sync: { stato: 'loc', msg: 'Locale' }, f: { stato: 'aperti', prio: '', zona: '', q: '', kpi: '', pg: '' }, giroData: null, timer: {} };

/* ---------- utilità ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ora = () => Date.now();
const iso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
/* data e ora sempre di Roma, formato 24 ore, qualunque sia il fuso o il formato impostato sul telefono */
const TZ = 'Europe/Rome';
const oggi = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const oraRoma = (d, opz = {}) => new Date(d).toLocaleString('it-IT', { timeZone: TZ, hourCycle: 'h23', ...opz });
const ORARI = (() => { const o = []; for (let m = 7 * 60; m <= 21 * 60; m += 15) o.push(`${String(m / 60 | 0).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`); return o; })();
const sceltaOra = (attr, val) => `<select class="btn mini ora" ${attr} aria-label="Orario"><option value="">--:--</option>${(val && !ORARI.includes(val) ? [val, ...ORARI] : ORARI).map((o) => `<option${o === val ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
const piuGiorni = (n, da) => { const d = da ? new Date(da + 'T12:00') : new Date(oggi() + 'T12:00'); d.setDate(d.getDate() + n); return iso(d); };
const giorni = (s) => (s ? Math.round((new Date(s + 'T12:00') - new Date(oggi() + 'T12:00')) / 864e5) : null);
const gg = (s) => { if (!s) return ''; const [a, m, d] = s.split('-'); return `${d}/${m}`; };
const ggLungo = (s) => (s ? new Date(s + 'T12:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
const uid = () => ora().toString(36) + Math.random().toString(36).slice(2, 6);
const slug = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const tel = (t) => (t || '').replace(/[^\d+]/g, '');
const wa = (t) => { let n = tel(t).replace(/^\+/, ''); if (!n.startsWith('39')) n = '39' + n; return n; };
const aperto = (p) => !CHIUSI.includes(p.stato);
function toast(m, ms = 2600) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(ST.timer.t); ST.timer.t = setTimeout(() => (t.hidden = true), ms); }

/* ---------- archivio locale (IndexedDB, con ripiego in memoria) ---------- */
const DB = (() => {
  let dbp; const mem = {};
  const open = () => dbp || (dbp = new Promise((ok, ko) => { const r = indexedDB.open('visibilita', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }));
  const tx = async (modo, fn) => { const db = await open(); return new Promise((ok, ko) => { const t = db.transaction('kv', modo); const req = fn(t.objectStore('kv')); t.oncomplete = () => ok(req && req.result); t.onerror = () => ko(t.error); }); };
  return {
    get: async (k) => { try { return await tx('readonly', (s) => s.get(k)); } catch { return mem[k]; } },
    set: async (k, v) => { try { await tx('readwrite', (s) => s.put(v, k)); } catch { mem[k] = v; } },
    del: async (k) => { try { await tx('readwrite', (s) => s.delete(k)); } catch { delete mem[k]; } },
    keys: async () => { try { return await tx('readonly', (s) => s.getAllKeys()); } catch { return Object.keys(mem); } },
  };
})();

/* ---------- GitHub ---------- */
const GH = {
  ok: () => !!(ST.cfg.owner && ST.cfg.repo && ST.cfg.token),
  url: (p) => `https://api.github.com/repos/${ST.cfg.owner}/${ST.cfg.repo}/contents/${p.split('/').map(encodeURIComponent).join('/')}`,
  async req(p, opz = {}, accept = 'application/vnd.github+json') {
    const r = await fetch(GH.url(p), { cache: 'no-store', ...opz, headers: { Authorization: `Bearer ${ST.cfg.token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', ...(opz.headers || {}) } });
    if (r.status === 404) return null;
    if (!r.ok) { const e = new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 160)}`); e.status = r.status; throw e; }
    return r;
  },
  async list(p) { const r = await GH.req(p); return r ? r.json() : []; },
  async getText(p) {
    const r = await GH.req(p); if (!r) return null;
    const j = await r.json();
    if (j.content) return { text: b64dec(j.content), sha: j.sha };
    const raw = await GH.req(p, {}, 'application/vnd.github.raw+json'); // file oltre 1 MB
    return { text: await raw.text(), sha: j.sha };
  },
  async getJSON(p) { const t = await GH.getText(p); return t && { data: JSON.parse(t.text), sha: t.sha }; },
  async getBlob(p) { const r = await GH.req(p, {}, 'application/vnd.github.raw+json'); return r && r.blob(); },
  async sha(p) { const r = await GH.req(p); return r ? (await r.json()).sha : null; },
  async put(p, b64, sha, msg) {
    const r = await GH.req(p, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg, content: b64, ...(sha ? { sha } : {}) }) });
    return (await r.json()).content.sha;
  },
  putJSON: (p, data, sha, msg) => GH.put(p, b64enc(JSON.stringify(data)), sha, msg),
};
function b64enc(str) { const b = new TextEncoder().encode(str); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
function b64dec(b64) { const s = atob(b64.replace(/\n/g, '')); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return new TextDecoder().decode(b); }
async function bufB64(buf) { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }

/* ---------- sincronizzazione ---------- */
function statoSync(stato, msg) { ST.sync = { stato, msg }; const b = $('#sync'); b.className = 'sync ' + stato; $('#syncTxt').textContent = msg; }
const piuRecente = (a, b) => ((a && a.u || 0) >= (b && b.u || 0) ? a : b);
function unisci(loc, rem) {
  // record per record vince la modifica più recente; nessuna cancellazione fisica (campo del)
  const z = JSON.parse(JSON.stringify(rem));
  z.meta = piuRecente(loc.meta, rem.meta);
  for (const k of ['prospect', 'registro']) {
    z[k] = { ...(rem[k] || {}) };
    for (const [id, v] of Object.entries(loc[k] || {})) z[k][id] = piuRecente(v, z[k][id]);
  }
  for (const [pid, a] of Object.entries(loc.attivita || {})) if (z.attivita[pid] && (a.u || 0) > (z.attivita[pid].u || 0)) z.attivita[pid] = a;
  return z;
}
async function salvaLocale(id) { const s = ST.zone[id]; await DB.set('zona:' + id, { z: s.z, sha: s.sha, dirty: s.dirty, siti: s.siti, sitiSha: s.sitiSha }); }
function modificato(id) {
  const s = ST.zone[id]; s.dirty = true; s.z.u = ora();
  salvaLocale(id); statoSync('att', 'Da salvare');
  clearTimeout(ST.timer['p' + id]); ST.timer['p' + id] = setTimeout(() => invia(id), 1500);
}
async function invia(id, tentativi = 3) {
  const s = ST.zone[id];
  if (!s.dirty) return;
  if (!GH.ok()) { statoSync('loc', 'Solo su questo dispositivo'); return; }
  if (!navigator.onLine) { statoSync('att', 'Offline: in coda'); return; }
  try {
    statoSync('att', 'Salvo…');
    const snap = JSON.stringify(s.z);
    const sha = await GH.putJSON(`zone/${id}/zona.json`, s.z, s.sha, `Aggiorna ${id}`);
    s.sha = sha; if (JSON.stringify(s.z) === snap) s.dirty = false;
    await salvaLocale(id); statoSync('ok', 'Salvato');
    if (s.dirty) invia(id);
  } catch (e) {
    if ((e.status === 409 || e.status === 422) && tentativi > 0) { // modificato da un altro dispositivo
      const r = await GH.getJSON(`zone/${id}/zona.json`);
      if (r) { s.z = unisci(s.z, r.data); s.sha = r.sha; }
      return invia(id, tentativi - 1);
    }
    statoSync('err', e.status === 401 ? 'Token non valido' : 'Errore: riprovo');
    console.error(e);
    ST.timer['p' + id] = setTimeout(() => invia(id), 30000);
  }
}
async function scarica() {
  if (!GH.ok() || !navigator.onLine) { statoSync(GH.ok() ? 'att' : 'loc', GH.ok() ? 'Offline' : 'Solo su questo dispositivo'); return; }
  try {
    statoSync('att', 'Aggiorno…');
    const conf = await GH.getJSON('config.json'); if (conf) { ST.conf = conf.data; ST.confSha = conf.sha; DB.set('conf', ST.conf); }
    const dirs = (await GH.list('zone')).filter((d) => d.type === 'dir');
    for (const d of dirs) {
      const id = d.name;
      const elenco = await GH.list(`zone/${id}`);
      const file = elenco.find((f) => f.name === 'zona.json');
      if (!file) continue;
      const fs = elenco.find((f) => f.name === 'siti.json');
      if (fs && ST.zone[id] && ST.zone[id].sitiSha !== fs.sha) {
        const r = await GH.getJSON(`zone/${id}/siti.json`).catch(() => null);
        if (r) { ST.zone[id].siti = r.data; ST.zone[id].sitiSha = fs.sha; await salvaLocale(id); }
      }
      const loc = ST.zone[id];
      if (loc && loc.sha === file.sha && !loc.dirty) continue;
      const r = await GH.getJSON(`zone/${id}/zona.json`);
      if (loc && loc.dirty) { ST.zone[id] = { ...loc, z: unisci(loc.z, r.data), sha: r.sha, dirty: true }; }
      else ST.zone[id] = { z: r.data, sha: r.sha, dirty: false, siti: loc && loc.siti, sitiSha: loc && loc.sitiSha };
      if (!ST.zone[id].siti && fs) { const rs = await GH.getJSON(`zone/${id}/siti.json`).catch(() => null); if (rs) { ST.zone[id].siti = rs.data; ST.zone[id].sitiSha = fs.sha; } }
      await salvaLocale(id);
      if (ST.zone[id].dirty) invia(id);
    }
    statoSync('ok', 'Aggiornato ' + oraRoma(Date.now(), { hour: '2-digit', minute: '2-digit' }));
    ST.ultimo = ora();
    render();
  } catch (e) { console.error(e); statoSync('err', e.status === 401 ? 'Token non valido' : 'Non raggiungibile'); }
}

/* ---------- accesso ai dati ---------- */
const tutti = () => Object.entries(ST.zone).flatMap(([zid, s]) => Object.values(s.z.prospect || {}).filter((p) => !p.del).map((p) => ({ zid, z: s.z, p })));
const registro = (zid, pid) => Object.values(ST.zone[zid].z.registro || {}).filter((r) => !r.del && r.p === pid).sort((a, b) => (b.data + b.u > a.data + a.u ? 1 : -1));
const ultimoContatto = (zid, pid) => (registro(zid, pid)[0] || {}).data || '';
function aggiorna(zid, pid, campi) { const p = ST.zone[zid].z.prospect[pid]; Object.assign(p, campi, { u: ora() }); modificato(zid); }
function urgenza(p) { if (!aperto(p) || !p.data_prossima) return null; return giorni(p.data_prossima); }
function classeCard(p) { if (p.stato === 'Chiuso vinto') return 'vinto'; if (!aperto(p)) return 'chiuso'; const g = urgenza(p); if (g == null) return ''; return g < 0 ? 'scad' : g <= 2 ? 'vic' : ''; }
const prioClasse = (p) => 'p' + (p.priorita || '9')[0];
/* 🟢 caldo, 🟠 tiepido, 🔵 invisibile (categoria a sé), ⚪ rete (franchising, gestione separata) */
const PALLINO = { 1: '🟢', 0: '🔵', 2: '🟠', 3: '⚪' };
const ORDINE_PRIO = { 1: 0, 2: 1, 0: 2, 3: 3 };
const prioRank = (p) => ORDINE_PRIO[(p.priorita || '9')[0]] ?? 9;
const prioTesto = (pr) => (pr ? `${PALLINO[pr[0]] || '⚪'} ${pr}` : '—');   // solo dove serve testo puro (menu a tendina)
const pallino = (pr) => (pr ? `<i class="pt pt${pr[0]}" aria-hidden="true"></i>` : '');   // pallino piccolo disegnato in CSS
const prioHtml = (pr) => (pr ? `${pallino(pr)}${esc(pr)}` : '—');

/* ---------- router ---------- */
const VISTE = { oggi: vOggi, prospect: vProspect, giro: vGiro, zone: vZone, cruscotto: vCruscotto, altro: vAltro };
const TITOLI = { oggi: 'Oggi', prospect: 'Prospect', giro: 'Giro', zone: 'Zone', cruscotto: 'Numeri', altro: 'Profilo' };
function render() {
  const [vista, a, b] = (location.hash.slice(1) || 'oggi').split('/');
  document.querySelectorAll('.tab a').forEach((x) => x.classList.toggle('on', x.dataset.t === vista));
  $('#titolo').textContent = TITOLI[vista] || 'Visibilità';
  if (VISTE[vista]) { const scroll = window.scrollY; $('#vista').innerHTML = VISTE[vista](); legaVista(vista); if (ST.restaScroll) window.scrollTo(0, scroll); }
  ST.restaScroll = false;
  if (vista === 'p' && a && b) apriProspect(a, b);
  if (vista === 'z' && a) apriZona(a);
}
window.addEventListener('hashchange', (e) => { const da = (e.oldURL.split('#')[1] || 'oggi'); if (VISTE[da.split('/')[0]]) ST.indietro = '#' + da; if (!/^#(p|z)\//.test(location.hash)) chiudiFoglio(); render(); });

/* ---------- vista: oggi ---------- */
/* anteprima della heat map: griglia di pallini come nelle slide, anello blu sul punto più vicino alla sede */
const COL_RANK = (r) => (!r ? '#C5221F' : r === 1 ? '#1E8E3E' : r === 2 ? '#34A853' : r === 3 ? '#6CC24A' : r <= 6 ? '#F6C026' : r <= 10 ? '#F29529' : '#E8603C');
const _righe = new WeakMap();
function righeGriglia(z) {
  if (_righe.has(z.punti)) return _righe.get(z.punti);
  const n = z.meta.griglia || Math.round(Math.sqrt(z.punti.length));
  const idx = z.punti.map((pt, i) => i).sort((a, b) => (z.punti[b][0] - z.punti[a][0]) || (z.punti[a][1] - z.punti[b][1]));
  const rows = []; for (let i = 0; i < idx.length; i += n) rows.push(idx.slice(i, i + n).sort((a, b) => z.punti[a][1] - z.punti[b][1]));
  _righe.set(z.punti, rows); return rows;
}
function miniMappa(z, p, px = 54) {
  if (!p.pid || !z.punti || !z.attivita[p.pid]) return `<span class="mini vuota" style="width:${px}px;height:${px}px" title="Non presente nella scansione"></span>`;
  const rows = righeGriglia(z); const n = rows.length; const c = px / n; const r = c * 0.42;
  const ranks = L.metriche(z, p.pid).ranks; const vic = L.puntiOrdinati(z, p)[0].i;
  let dots = '';
  rows.forEach((row, y) => row.forEach((i, x) => {
    const cx = (x + .5) * c, cy = (y + .5) * c;
    dots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${COL_RANK(ranks[i])}"/>`;
    if (i === vic) dots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r + 1.3).toFixed(1)}" fill="none" stroke="#1A73E8" stroke-width="1.4"/>`;
  }));
  return `<svg class="mini" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" role="img" aria-label="Mappa di visibilità">${dots}</svg>`;
}
/* stato del sito: dominio proprio, solo portale o social, sito Google dismesso, nessun sito */
const PORTALI = /(^|\.)(immobiliare\.it|idealista\.it|casa\.it|wikicasa\.it|subito\.it|trovacasa\.net|paginegialle\.it|tripadvisor\.|thefork\.|booking\.com|miodottore\.it|treatwell\.it)$/i;
const SOCIAL = /(^|\.)(facebook\.com|fb\.com|instagram\.com|linktr\.ee|wa\.me|tiktok\.com|linkedin\.com)$/i;
const chiaveSito = (u) => (u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
const STATO_SITO = { ssl: () => 'Sito con certificato non valido', parcheggiato: () => 'Dominio in vendita o scaduto', costruzione: () => 'Sito in costruzione', errore: (v) => `Sito in errore${v.codice ? ' ' + v.codice : ''}`, irraggiungibile: (v) => (v.nota && v.nota.startsWith('dominio') ? 'Dominio inesistente o scaduto' : 'Sito non raggiungibile') };
function verificaSito(z, url) { const s = z && z.id && ST.zone[z.id] && ST.zone[z.id].siti; return s && s.siti ? s.siti[chiaveSito(url)] : null; }
function sitoInfo(z, p) {
  const url = (p.sito || (z.attivita[p.pid] || {}).w || '').trim();
  if (!url) return { k: 'no', label: 'Nessun sito' };
  const host = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].toLowerCase();
  const href = /^https?:/i.test(url) ? url : 'https://' + url;
  if (/\.business\.site$/.test(host)) return { k: 'morto', label: 'Sito Google dismesso', href };
  if (SOCIAL.test(host)) return { k: 'social', label: 'Solo social: ' + host.split('.')[0], href };
  if (PORTALI.test(host)) return { k: 'portale', label: 'Solo portale: ' + host, href };
  const ver = verificaSito(z, url);
  if (ver && STATO_SITO[ver.stato]) return { k: 'rotto', label: STATO_SITO[ver.stato](ver), href, ver };
  return { k: 'ok', label: host + (ver ? (ver.stato === 'ok' ? ' ✓' : ' ?') : ''), href, ver };
}
function badgeSito(z, p) {
  const s = sitoInfo(z, p);
  const icona = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/></svg>';
  return `<span class="badge-sito s-${s.k}" ${s.href ? `data-href="${esc(s.href)}"` : ''}>${icona}${esc(s.label)}</span>`;
}
/* presenza su PagineGialle: verifica manuale dal telefono (PagineGialle blocca i server GitHub) */
const PG = { assente: 'Assente su PG', base: 'PG base', evoluta: 'PG evoluta' };
const urlPG = (z, p) => `https://www.paginegialle.it/ricerca/${encodeURIComponent(p.nome || '')}/${encodeURIComponent(z.meta.citta || '')}`;
const badgePG = (p) => (PG[p.pg] ? `<span class="badge-pg pg-${p.pg}"><b>PG</b>${esc(PG[p.pg])}</span>` : '');
const nonRiv = (z, p) => !!(p.pid && z.attivita && z.attivita[p.pid] && z.attivita[p.pid].c === false);
function testoProspect(z, p, extra = '') {
  const g = urgenza(p);
  const quando = p.data_prossima ? (g < 0 ? `<span class="data c-neg">scaduta ${gg(p.data_prossima)}</span>` : g === 0 ? '<span class="data c-low">oggi</span>' : `<span class="data">${gg(p.data_prossima)}</span>`) : '';
  return `<div class="riga"><span class="nome">${esc(p.nome)}</span>${quando}</div>
    <div class="riga"><span class="sub">${esc(p.stato)} · ${esc(z.meta.quartiere)}</span><span class="pill ${prioClasse(p)}">${prioHtml(p.priorita)}</span></div>
    ${p.prossima ? `<div class="az">→ ${esc(p.prossima)}</div>` : aperto(p) ? '<div class="az c-low">Nessuna prossima azione</div>' : ''}
    <div class="badges">${badgeSito(z, p)}${badgePG(p)}${nonRiv(z, p) ? '<span class="badge-nr"><svg viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.5"/></svg>Scheda non rivendicata</span>' : ''}</div>${extra}`;
}
function cardProspect({ zid, z, p }, extra = '') {
  return `<a class="card con-mappa ${classeCard(p)}" href="#p/${zid}/${p.id}">${miniMappa(z, p)}<div class="card-testo">${testoProspect(z, p, extra)}</div></a>`;
}
function vOggi() {
  const tt = tutti(); const ap = tt.filter((x) => aperto(x.p));
  const scad = ap.filter((x) => urgenza(x.p) < 0), vic = ap.filter((x) => { const g = urgenza(x.p); return g != null && g >= 0 && g <= 2; });
  const senza = ap.filter((x) => !x.p.prossima || !x.p.data_prossima), mai = tt.filter((x) => !registro(x.zid, x.p.id).length && aperto(x.p));
  if (!tt.length) return benvenuto();
  const K = { scad: [scad, 'Azioni scadute', 'c-neg'], vic: [vic, 'Entro 2 giorni', 'c-mid'], senza: [senza, 'Senza prossima azione', 'c-low'], mai: [mai, 'Mai contattati', ''] };
  const sel = ST.f.kpi && K[ST.f.kpi];
  const kpi = `<div class="kpi">${Object.entries(K).map(([k, [arr, lab, c]]) => `<button data-kpi="${k}" class="${ST.f.kpi === k ? 'sel' : ''}"><b class="${c}">${arr.length}</b><span>${lab}</span></button>`).join('')}</div>`;
  if (sel) return `${kpi}<div class="eb">${esc(sel[1])}</div><div class="lista">${sel[0].map((x) => cardProspect(x)).join('') || '<div class="vuoto">Nessun prospect in questa lista.</div>'}</div>`;
  // vista predefinita: il giro della data odierna, nell'ordine delle tappe
  const giro = tt.filter((x) => x.p.giro && x.p.giro.data === oggi()).sort((a, b) => (a.zid + String(a.p.giro.ordine || 99).padStart(3, '0')).localeCompare(b.zid + String(b.p.giro.ordine || 99).padStart(3, '0')));
  const fatte = giro.filter((x) => x.p.giro.fatto).length;
  const tappa = (x) => `<div class="riga" style="margin-top:4px"><span class="sub">${esc(x.p.giro.orario || '')}${x.p.giro.orario ? ' · ' : ''}tappa ${x.p.giro.ordine || ''}</span>${x.p.giro.fatto ? '<span class="stato-tappa consegnata">✓ Consegnato</span>' : '<span class="stato-tappa">Da visitare</span>'}</div>`;
  return `${kpi}
  <div class="eb">Giro di oggi · ${ggLungo(oggi())}${giro.length ? ` · ${giro.length} tappe · ${fatte} consegnate` : ''}</div>
  ${giro.length ? `<div class="row" style="margin-bottom:8px"><a class="btn mini" href="#giro">Apri il giro</a></div>` : ''}
  <div class="lista">${giro.map((x) => cardProspect(x, tappa(x))).join('') || '<div class="vuoto">Nessun giro previsto per oggi.</div>'}</div>`;
}
function benvenuto() {
  return `<div class="box"><h2>Benvenuto</h2><p>Nessun dato su questo dispositivo.</p>
  <p>${GH.ok() ? 'Il repository dati è collegato ma non contiene ancora zone: importa la prima da <b>Zone</b>.' : 'Collega il repository dati da <b>Profilo → Collegamento GitHub</b>, poi importa la prima zona.'}</p>
  <a class="btn pri" href="#${GH.ok() ? 'zone' : 'altro'}">${GH.ok() ? 'Vai a Zone' : 'Collega GitHub'}</a></div>`;
}

/* ---------- vista: prospect ---------- */
function vProspect() {
  const f = ST.f; const zoneIds = Object.keys(ST.zone);
  let tt = tutti();
  if (f.stato === 'aperti') tt = tt.filter((x) => aperto(x.p)); else if (f.stato) tt = tt.filter((x) => x.p.stato === f.stato);
  if (f.prio) tt = tt.filter((x) => x.p.priorita === f.prio);
  if (f.zona) tt = tt.filter((x) => x.zid === f.zona);
  if (f.nr) tt = tt.filter((x) => nonRiv(x.z, x.p));
  if (f.ns) tt = tt.filter((x) => sitoInfo(x.z, x.p).k !== 'ok');
  if (f.pg === 'assente') tt = tt.filter((x) => x.p.pg === 'assente'); else if (f.pg === 'verifica') tt = tt.filter((x) => !x.p.pg);
  if (f.q) { const q = f.q.toLowerCase(); tt = tt.filter((x) => (x.p.nome + ' ' + x.p.referente + ' ' + x.p.indirizzo + ' ' + x.p.note).toLowerCase().includes(q)); }
  tt.sort((a, b) => prioRank(a.p) - prioRank(b.p) || (a.p.data_prossima || '9').localeCompare(b.p.data_prossima || '9'));
  const chip = (campo, val, lab, html) => `<button class="chip ${f[campo] === val ? 'on' : ''}" data-f="${campo}" data-v="${esc(val)}">${html || esc(lab)}</button>`;
  return `<input class="cerca" id="q" placeholder="Cerca nome, referente, via…" value="${esc(f.q)}">
  <div class="filtri">${chip('stato', 'aperti', 'Aperti')}${chip('stato', '', 'Tutti')}${STATI.map((s) => chip('stato', s, s)).join('')}</div>
  <div class="filtri"><button class="chip chip-nr ${f.nr ? 'on' : ''}" id="filtroNR">Non rivendicate (${tutti().filter((x) => aperto(x.p) && nonRiv(x.z, x.p)).length})</button><button class="chip chip-ns ${f.ns ? 'on' : ''}" id="filtroNS">Senza sito proprio (${tutti().filter((x) => aperto(x.p) && sitoInfo(x.z, x.p).k !== 'ok').length})</button><button class="chip chip-pg ${f.pg === 'assente' ? 'on' : ''}" data-fpg="assente">Assenti su PG (${tutti().filter((x) => aperto(x.p) && x.p.pg === 'assente').length})</button><button class="chip ${f.pg === 'verifica' ? 'on' : ''}" data-fpg="verifica">PG da verificare (${tutti().filter((x) => aperto(x.p) && !x.p.pg).length})</button>${chip('prio', '', 'Ogni priorità')}${PRIORITA.map((s) => chip('prio', s, s, prioHtml(s))).join('')}${zoneIds.length > 1 ? chip('zona', '', 'Tutte le zone') + zoneIds.map((z) => chip('zona', z, ST.zone[z].z.meta.quartiere)).join('') : ''}</div>
  <div class="sub" style="margin:4px 0 8px">${tt.length} prospect</div>
  <div class="lista">${tt.map((x) => cardProspect(x)).join('') || '<div class="vuoto">Nessun prospect con questi filtri.</div>'}</div>`;
}

/* ---------- scheda prospect ---------- */
const ICO = {
  tel: '<path d="M5 3.5h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.8 6.8l1.4-2.2 4.3 1.7V19a1.5 1.5 0 0 1-1.6 1.5C10.5 20 4 13.5 3.5 5.1A1.5 1.5 0 0 1 5 3.5z"/>',
  wa: '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19l-4 1z"/><path d="M9 9.5c.3 2 2.6 4.3 4.6 4.6l1.1-1.2 1.6.8c-.2 1.2-1.1 1.8-2.2 1.7-3-.3-6.4-3.7-6.6-6.6-.1-1.1.5-2 1.7-2.2l.8 1.6L9 9.5z"/>',
  map: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  web: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>',
};
const ico = (k) => `<svg viewBox="0 0 24 24">${ICO[k]}</svg>`;
function apriFoglio(titolo, html, onClose) {
  const f = $('#foglio');
  f.innerHTML = `<div class="testa"><button id="chiudi" aria-label="Chiudi">←</button><h2>${esc(titolo)}</h2></div><div class="corpo">${html}</div>`;
  f.hidden = false; document.body.style.overflow = 'hidden';
  $('#chiudi').onclick = () => { if (onClose) onClose(); else history.back(); };
  return f;
}
function chiudiFoglio() { const f = $('#foglio'); f.hidden = true; f.innerHTML = ''; document.body.style.overflow = ''; }
function minigriglia(z, pid) {
  const m = L.metriche(z, pid); const n = z.meta.griglia || Math.round(Math.sqrt(m.N));
  // punti ordinati da nord-ovest a sud-est per la visualizzazione
  const idx = z.punti.map((pt, i) => i).sort((a, b) => (z.punti[b][0] - z.punti[a][0]) || (z.punti[a][1] - z.punti[b][1]));
  const rows = []; for (let i = 0; i < idx.length; i += n) rows.push(idx.slice(i, i + n).sort((a, b) => z.punti[a][1] - z.punti[b][1]));
  const cl = (r) => (!r ? 'g-no' : r === 1 ? 'g-1' : r === 2 ? 'g-2' : r === 3 ? 'g-3' : r <= 6 ? 'g-y' : r <= 10 ? 'g-o' : 'g-r');
  return `<div class="griglia" style="grid-template-columns:repeat(${n},1fr)">${rows.flat().map((i) => { const r = m.ranks[i]; return `<i class="${cl(r)}">${r || ''}</i>`; }).join('')}</div>` + `<div class="griglia-legenda"><span><i style="background:var(--g1)"></i>1-3 visibile</span><span><i style="background:var(--y)"></i>4-10 poco visibile</span><span><i style="background:var(--r1)"></i>11-20 invisibile</span><span><i style="background:var(--r2)"></i>assente</span></div>`;
}
function apriProspect(zid, id) {
  const s = ST.zone[zid]; if (!s || !s.z.prospect[id]) { location.hash = '#prospect'; return; }
  const z = s.z, p = z.prospect[id], a = z.attivita[p.pid] || {};
  const m = p.pid && z.punti && z.attivita[p.pid] ? L.metriche(z, p.pid) : null;
  const reg = registro(zid, id);
  const t = p.telefono || a.t, sito = p.sito || a.w;
  const nav = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent((p.indirizzo || a.a || p.nome))}`;
  const an = m ? L.analisi(z, p) : null;
  const sel = (campo, opz, val, et = (o) => o) => `<select data-c="${campo}">${['', ...opz].map((o) => `<option value="${esc(o)}" ${o === val ? 'selected' : ''}>${esc(o ? et(o) : '')}</option>`).join('')}</select>`;
  const inp = (campo, lab, tipo = 'text') => `<label class="f">${lab}<input data-c="${campo}" type="${tipo}" value="${esc(p[campo] ?? '')}"></label>`;
  const html = `
  <div class="riga"><span class="pill ${prioClasse(p)}">${prioHtml(p.priorita)}</span><span class="sub">${esc(z.meta.quartiere)} · ${esc(p.segmento || '')} · ${esc(p.id)}</span></div>
  <div class="badges">${badgeSito(z, p)}${badgePG(p)}</div>
  <div class="box pg-box"><div class="riga"><b>PagineGialle</b><a class="btn mini" href="${urlPG(z, p)}" target="_blank" rel="noopener">Cerca su PagineGialle ↗</a></div>
  <div class="scelte">${Object.entries(PG).map(([k, v]) => `<button class="chip ${p.pg === k ? 'on' : ''}" data-pg="${k}">${k === 'assente' ? 'Assente' : k === 'base' ? 'Scheda base' : 'Scheda evoluta'}</button>`).join('')}</div></div>
  ${a.c === false ? `<div class="allerta"><svg viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.5"/></svg><div><b>Scheda Google non rivendicata dal titolare</b><span>Nessuno la gestisce: non può rispondere alle recensioni né correggere orari e categoria. È il primo gancio da usare.</span></div></div>` : ''}
  <div class="azioni">
    <a class="btn" ${t ? `href="tel:${tel(t)}"` : 'disabled'}>${ico('tel')}Chiama</a>
    <a class="btn" ${t ? `href="https://wa.me/${wa(t)}" target="_blank" rel="noopener"` : 'disabled'}>${ico('wa')}WhatsApp</a>
    <a class="btn" href="${nav}" target="_blank" rel="noopener">${ico('map')}Naviga</a>
    <a class="btn" ${sito ? `href="${/^https?:/.test(sito) ? esc(sito) : 'https://' + esc(sito)}" target="_blank" rel="noopener"` : 'disabled'}>${ico('web')}Sito</a>
  </div>
  <button class="btn pri" style="width:100%" id="registra">Registra contatto</button>
  <div class="box">
    <div class="eb" style="margin-top:0">Prossima azione</div>
    <label class="f">Stato${sel('stato', STATI, p.stato)}</label>
    <label class="f">Cosa fare<input data-c="prossima" value="${esc(p.prossima)}"></label>
    <div class="due"><label class="f">Entro il<input data-c="data_prossima" type="date" value="${esc(p.data_prossima)}"></label>
    <label class="f">Priorità${sel('priorita', PRIORITA, p.priorita, prioTesto)}</label></div>
    <div class="scelte">${[0, 1, 3, 7].map((n) => `<button class="chip" data-quando="${n}">${n === 0 ? 'Oggi' : n === 1 ? 'Domani' : '+' + n + ' gg'}</button>`).join('')}</div>
  </div>
  ${m ? `<div class="eb">Visibilità su «${esc(z.meta.keyword)}»</div>
  <div class="stat"><div><b class="c-${L.colorePct(Math.round(m.top3 / m.N * 100))}">${m.top3}/${m.N}</b><span>tra le prime 3</span></div>
  <div><b class="c-${L.colorePct(Math.round(m.top20 / m.N * 100))}">${m.top20}/${m.N}</b><span>tra le prime 20</span></div>
  <div><b>${m.atrp ? L.virgola(m.atrp) : '—'}</b><span>posizione media</span></div><div><b>${a.rv ?? '—'}</b><span>recensioni ${L.virgola(a.r)}</span></div></div>
  <div class="mt">${minigriglia(z, p.pid)}</div>
  ${an ? `<div class="box classifica"><b>${esc(an.list_title)}</b><table class="cl">${an.list.map(([r, n, rv, me]) => `<tr class="${me ? 'me' : ''}"><td>${r || '20+'}</td><td>${esc(n)}</td><td style="text-align:right" class="mono">${esc(rv)}</td></tr>`).join('')}</table></div>` : ''}` : '<div class="avviso mt">Attività non presente nella scansione della zona: niente metriche né report.</div>'}
  <div class="eb">Registro (${reg.length})</div>
  ${reg.map((r) => `<div class="reg"><div class="riga"><b>${esc(r.esito || r.canale)}</b><span class="data">${gg(r.data)} · ${esc(r.canale)}</span></div>
     ${r.interlocutore ? `<div class="sub">con ${esc(r.interlocutore)}</div>` : ''}${r.emerso ? `<div>${esc(r.emerso)}</div>` : ''}${r.prossima ? `<div class="sub">→ ${esc(r.prossima)} ${r.entro ? 'entro ' + gg(r.entro) : ''}</div>` : ''}</div>`).join('') || '<div class="sub">Nessun contatto registrato.</div>'}
  ${an ? `<div class="eb">Report da stampare</div>
  <label class="f"><input type="checkbox" data-r="includi" ${p.report && p.report.includi === false ? '' : 'checked'} style="display:inline;width:auto;margin-right:6px">Includi nella stampa del giro</label>
  <label class="f">Titolo<textarea data-r="titolo">${esc(an.title)}</textarea></label>
  <label class="f">Cosa vuol dire<textarea data-r="cosa" style="min-height:110px">${esc(an.cosa)}</textarea></label>
  <div class="row mt"><button class="btn mini" id="bozza">Rigenera bozza dai dati</button><span class="sub">sovrascrive titolo e testo</span></div>
  <div class="due"><label class="f">Nome breve in stampa<input id="breve" value="${esc(a.b || '')}"></label>
  <label class="f">Riferimento${sel('luogo', L.LUOGHI, (p.report && p.report.luogo) || z.meta.luogo || 'ufficio').replace('data-c="luogo"', 'data-r="luogo"')}</label></div>
  <label class="f">Sottotitolo<input data-r="sottotitolo" value="${esc(an.subtitle)}"></label>
  ` : ''}
  <div class="eb">Dati</div>
  ${inp('nome', 'Nome')}${inp('referente', 'Referente')}
  <div class="due">${inp('telefono', 'Telefono', 'tel')}${inp('email', 'Email', 'email')}</div>
  ${inp('indirizzo', 'Indirizzo')}${inp('sito', 'Sito')}
  <div class="due"><label class="f">Prodotto proposto${sel('prodotto', PRODOTTI, p.prodotto)}</label>${inp('valore', 'Valore proposta (€)', 'number')}</div>
  <div class="due"><label class="f">Segmento${sel('segmento', ['Indipendente', 'Franchising'], p.segmento)}</label>${inp('visita_entro', 'Visita entro', 'date')}</div>
  <label class="f">Gancio commerciale<textarea data-c="gancio">${esc(p.gancio)}</textarea></label>
  <label class="f">Note<textarea data-c="note">${esc(p.note)}</textarea></label>
  <div class="row mt"><button class="btn mini" id="elimina" style="color:var(--neg)">Elimina prospect</button></div>
  <div class="barra-salva"><button class="btn annulla" id="annulla">Annulla</button><button class="btn pri" id="salva" disabled>Salva</button></div>`;
  const D = {}, DR = {}; let DB = null, sporco = false;
  const segna = () => { sporco = true; $('#salva', f).disabled = false; $('#salva', f).textContent = 'Salva modifiche'; };
  const salva = () => {
    if (!sporco) return;
    const campi = { ...D }; if (Object.keys(DR).length) campi.report = { ...(p.report || {}), ...DR };
    aggiorna(zid, id, campi);
    if (DB !== null && z.attivita[p.pid]) { z.attivita[p.pid].b = DB; z.attivita[p.pid].u = ora(); modificato(zid); }
    sporco = false; toast('Salvato');
  };
  const esci = () => { location.hash = ST.indietro || '#prospect'; };
  const annulla = () => { if (sporco && !confirm('Annullare le modifiche non salvate?')) return; sporco = false; esci(); };
  const f = apriFoglio(p.nome, html, annulla);
  f.querySelectorAll('[data-c]').forEach((el) => el.addEventListener('input', () => {
    D[el.dataset.c] = el.type === 'number' ? Number(el.value || 0) : el.value; segna();
    if (el.dataset.c === 'nome') f.querySelector('.testa h2').textContent = el.value;
  }));
  f.querySelectorAll('[data-c]').forEach((el) => el.tagName === 'SELECT' && el.addEventListener('change', () => { D[el.dataset.c] = el.value; segna(); }));
  f.querySelectorAll('[data-r]').forEach((el) => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
    DR[el.dataset.r] = el.type === 'checkbox' ? el.checked : el.value; segna();
  }));
  f.querySelectorAll('[data-pg]').forEach((el) => (el.onclick = () => {
    const v = (D.pg ?? p.pg) === el.dataset.pg ? '' : el.dataset.pg;   // secondo tocco: torna da verificare
    D.pg = v; f.querySelectorAll('[data-pg]').forEach((b) => b.classList.toggle('on', b.dataset.pg === v)); segna();
  }));
  f.querySelectorAll('[data-quando]').forEach((el) => (el.onclick = () => { const d = piuGiorni(+el.dataset.quando); f.querySelector('[data-c=data_prossima]').value = d; D.data_prossima = d; segna(); }));
  const br = $('#breve', f); if (br) br.oninput = () => { DB = br.value; segna(); };
  const bz = $('#bozza', f); if (bz) bz.onclick = () => {
    const b = L.bozza(z, { ...p, report: { ...p.report, titolo: '', cosa: '' } });
    f.querySelector('[data-r=titolo]').value = b.titolo; f.querySelector('[data-r=cosa]').value = b.cosa;
    Object.assign(DR, { titolo: b.titolo, cosa: b.cosa, titolo_lista: '', punto: null }); segna(); toast('Bozza pronta: premi Salva per tenerla');
  };
  $('#salva', f).onclick = () => { salva(); esci(); };
  $('#annulla', f).onclick = annulla;
  $('#registra', f).onclick = () => { salva(); formContatto(zid, id); };
  $('#elimina', f).onclick = () => { if (confirm(`Eliminare ${p.nome}? Il registro resta nello storico del repository.`)) { sporco = false; aggiorna(zid, id, { del: true }); location.hash = '#prospect'; } };
}

/* ---------- registra contatto: un solo modulo aggiorna registro, stato e prossima azione ---------- */
function formContatto(zid, id, preset = {}) {
  const p = ST.zone[zid].z.prospect[id];
  const v = { canale: preset.canale || 'Telefono', esito: preset.esito || '', interlocutore: p.referente || '', emerso: '', prossima: '', entro: '', stato: p.stato, data: oggi() };
  if (ESITO_STATO[v.esito]) v.stato = ESITO_STATO[v.esito];
  if (ESITO_AZIONE[v.esito]) { v.prossima = ESITO_AZIONE[v.esito][0]; v.entro = piuGiorni(ESITO_AZIONE[v.esito][1], v.data); }
  const ch = (k, arr) => `<div class="scelte">${arr.map((o) => `<button class="chip ${v[k] === o ? 'on' : ''}" data-k="${k}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
  const disegna = () => {
    const f = apriFoglio('Contatto · ' + p.nome, `
    <label class="f">Canale</label>${ch('canale', CANALI)}
    <label class="f">Esito</label>${ch('esito', ESITI)}
    <div class="due"><label class="f">Data<input id="cData" type="date" value="${v.data}"></label><label class="f">Interlocutore<input id="cInt" value="${esc(v.interlocutore)}"></label></div>
    <label class="f">Cosa è emerso<textarea id="cEm">${esc(v.emerso)}</textarea></label>
    <div class="box"><div class="eb" style="margin-top:0">Dopo questo contatto</div>
    <label class="f">Prossima azione<input id="cPr" value="${esc(v.prossima)}"></label>
    <div class="due"><label class="f">Entro il<input id="cEn" type="date" value="${v.entro}"></label>
    <label class="f">Nuovo stato<select id="cSt">${STATI.map((s) => `<option ${s === v.stato ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div></div>
    <div class="barra-salva"><button class="btn annulla" id="annullaC">Annulla</button><button class="btn pri" id="salva">Salva contatto</button></div>`, () => apriProspect(zid, id));
    $('#annullaC').onclick = () => { if (preset.ritorno) { location.hash = preset.ritorno; chiudiFoglio(); render(); } else apriProspect(zid, id); };
    const leggi = () => { v.data = $('#cData').value; v.interlocutore = $('#cInt').value; v.emerso = $('#cEm').value; v.prossima = $('#cPr').value; v.entro = $('#cEn').value; v.stato = $('#cSt').value; };
    f.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => {
      leggi(); v[b.dataset.k] = b.dataset.v;
      if (b.dataset.k === 'esito') { // proposta automatica, modificabile
        if (ESITO_STATO[v.esito]) v.stato = ESITO_STATO[v.esito];
        const az = ESITO_AZIONE[v.esito]; if (az) { v.prossima = az[0]; v.entro = piuGiorni(az[1], v.data); } else { v.prossima = ''; v.entro = ''; }
      }
      disegna();
    }));
    $('#salva').onclick = () => {
      leggi(); if (!v.esito) { toast("Scegli un esito"); return; }
      const z = ST.zone[zid].z; const rid = uid();
      z.registro = z.registro || {};
      z.registro[rid] = { id: rid, p: id, data: v.data, canale: v.canale, interlocutore: v.interlocutore, esito: v.esito, emerso: v.emerso, prossima: v.prossima, entro: v.entro, u: ora() };
      const campi = { stato: v.stato, prossima: CHIUSI.includes(v.stato) ? '' : v.prossima, data_prossima: CHIUSI.includes(v.stato) ? '' : v.entro };
      if (v.interlocutore && !p.referente) campi.referente = v.interlocutore;
      if (preset.giro) campi.giro = { ...p.giro, fatto: true, fatto_il: v.data };
      aggiorna(zid, id, campi); toast('Contatto salvato');
      if (preset.ritorno) { location.hash = preset.ritorno; chiudiFoglio(); render(); } else apriProspect(zid, id);
    };
  };
  disegna();
}

/* ---------- vista: giro ---------- */
function vGiro() {
  const tt = tutti().filter((x) => x.p.giro && x.p.giro.data);
  const date = [...new Set(tt.map((x) => x.p.giro.data))].sort();
  if (!ST.giroData) ST.giroData = date.find((d) => d >= oggi()) || date[date.length - 1] || oggi();
  const d = ST.giroData;
  const tappe = tt.filter((x) => x.p.giro.data === d).sort((a, b) => (a.p.giro.ordine || 99) - (b.p.giro.ordine || 99));
  const perZona = {}; tappe.forEach((x) => (perZona[x.zid] = perZona[x.zid] || []).push(x));
  const indirizzi = tappe.filter((x) => !x.p.giro.fatto).map((x) => x.p.indirizzo || (x.z.attivita[x.p.pid] || {}).a).filter(Boolean);
  const percorso = (arr) => { const dest = arr[arr.length - 1]; const wp = arr.slice(0, -1).slice(0, 9); return `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${encodeURIComponent(dest)}${wp.length ? '&waypoints=' + encodeURIComponent(wp.join('|')) : ''}`; };
  return `<div class="barra-giro"><input type="date" id="gData" class="cerca" value="${d}"><button class="btn" id="gAgg">+ Tappa</button>${tappe.length ? '<button class="btn" id="gSposta">Sposta…</button>' : ''}</div>
  <div class="filtri mt">${date.map((x) => `<button class="chip ${x === d ? 'on' : ''}" data-gd="${x}">${ggLungo(x)}</button>`).join('')}</div>
  ${tappe.length ? `<div class="row mt"><a class="btn ink" href="${indirizzi.length ? percorso(indirizzi) : '#giro'}" target="_blank" rel="noopener">${ico('map')} Percorso a piedi (${indirizzi.length} da visitare)</a></div>
  ${indirizzi.length > 10 ? '<div class="avviso">Google Maps accetta al massimo 10 tappe per percorso: le altre si aprono dalla singola tappa.</div>' : ''}` : ''}
  ${Object.entries(perZona).map(([zid, arr]) => `
    <div class="eb">${esc(ST.zone[zid].z.meta.quartiere)} · ${arr.length} tappe pianificate · ${arr.filter((x) => x.p.giro.fatto).length} consegnate</div>
    <div class="lista">${arr.map((x, i) => {
      const ind = x.p.indirizzo || (x.z.attivita[x.p.pid] || {}).a || '';
      const ref = [x.p.referente, x.p.telefono].filter(Boolean).join(' · ');
      return `<div class="card tappa ${classeCard(x.p)} ${x.p.giro.fatto ? 'ok-fatto' : ''}">
      <div class="tappa-testa"><span class="num">${x.p.giro.fatto ? '✓' : i + 1}</span>
      ${x.p.giro.fatto ? `<span class="stato-tappa consegnata">✓ Report consegnato${x.p.giro.fatto_il ? ' il ' + gg(x.p.giro.fatto_il) : ''}</span>` : '<span class="stato-tappa">Da visitare</span>'}
      ${x.p.report && x.p.report.includi === false ? '<span class="sub">senza report</span>' : ''}
      ${sceltaOra(`data-ora="${zid}|${x.p.id}"`, x.p.giro.orario || '')}
      <span class="ordine"><button data-su="${zid}|${x.p.id}" aria-label="Su">↑</button><button data-giu="${zid}|${x.p.id}" aria-label="Giù">↓</button></span></div>
      <a class="con-mappa" href="#p/${zid}/${x.p.id}">${miniMappa(x.z, x.p)}<div class="card-testo">${testoProspect(x.z, x.p, `<div class="sub ind">${esc(ind.split(',').slice(0, 2).join(','))}${ref ? ' · ' + esc(ref) : ''}</div>`)}</div></a>
      <div class="row mt"><a class="btn mini" href="https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${encodeURIComponent(ind)}" target="_blank" rel="noopener">Naviga</a>
      ${x.p.giro.fatto ? `<button class="btn mini" data-annulla="${zid}|${x.p.id}">Riapri tappa</button>` : `<button class="btn mini segna" data-fatto="${zid}|${x.p.id}">Segna consegnato</button>`}
      <button class="btn mini" data-togli="${zid}|${x.p.id}" title="Togli dal giro">✕</button></div></div>`;
    }).join('')}</div>
    <div class="box"><div class="riga"><b>Stampa del giro</b><span class="sub">${arr.filter((x) => x.p.pid && !(x.p.report && x.p.report.includi === false)).length} analisi · ${Math.ceil(arr.filter((x) => x.p.pid && !(x.p.report && x.p.report.includi === false)).length / 2)} fogli A4</span></div>
    <div class="sub">Il PDF esce nell'ordine del giro: taglia la risma a metà e metti la pila inferiore sotto quella superiore.</div>
    <div class="row mt"><button class="btn pri" data-stampa="${zid}">Genera PDF</button><span id="st-${zid}" class="sub"></span></div></div>`).join('') || '<div class="vuoto">Nessuna tappa in questa data. Aggiungila con “+ Tappa”.</div>'}`;
}
/* sposta in blocco le tappe di un giro a un'altra data: tutte o solo quelle scelte */
function formSpostaGiro() {
  const da = ST.giroData;
  const tappe = tutti().filter((x) => x.p.giro && x.p.giro.data === da).sort((a, b) => (a.zid + String(a.p.giro.ordine).padStart(3, '0')).localeCompare(b.zid + String(b.p.giro.ordine).padStart(3, '0')));
  const f = apriFoglio('Sposta il giro del ' + ggLungo(da), `
  <label class="f">Nuova data<input type="date" id="sData" value="${piuGiorni(1, da > oggi() ? da : oggi())}"></label>
  <label class="f"><input type="checkbox" id="sAz" checked style="display:inline;width:auto;margin-right:6px">Sposta anche la prossima azione e la data "visita entro"</label>
  <div class="eb">Tappe da spostare</div>
  <div class="row" style="margin-bottom:6px"><button class="chip" id="sTutte">Tutte</button><button class="chip" id="sNessuna">Nessuna</button></div>
  <div class="lista">${tappe.map((x) => `<label class="card riga" style="cursor:pointer;opacity:${x.p.giro.fatto ? .55 : 1}"><span style="display:flex;gap:10px;align-items:center;min-width:0">
    <input type="checkbox" class="sCk" value="${x.zid}|${x.p.id}" ${x.p.giro.fatto ? 'disabled' : 'checked'} style="width:20px;height:20px">
    <span style="min-width:0"><span class="nome" style="display:block">${pallino(x.p.priorita)}${x.p.giro.ordine}. ${esc(x.p.nome)}</span><span class="sub">${esc(x.z.meta.quartiere)} · ${esc(x.p.giro.orario || '')}${x.p.giro.fatto ? ' · già consegnato' : ''}</span></span></span></label>`).join('')}</div>
  <div class="barra-salva"><button class="btn annulla" id="sAnn">Annulla</button><button class="btn pri" id="sOk">Sposta tappe</button></div>`, () => { chiudiFoglio(); render(); });
  const cks = () => [...f.querySelectorAll('.sCk:not(:disabled)')];
  $('#sTutte', f).onclick = () => cks().forEach((c) => (c.checked = true));
  $('#sNessuna', f).onclick = () => cks().forEach((c) => (c.checked = false));
  $('#sAnn', f).onclick = () => { chiudiFoglio(); render(); };
  $('#sOk', f).onclick = () => {
    const a = $('#sData', f).value; const scelte = cks().filter((c) => c.checked).map((c) => c.value.split('|'));
    if (!a || a === da) { toast('Scegli una data diversa'); return; }
    if (!scelte.length) { toast('Nessuna tappa selezionata'); return; }
    const delta = giorni(a) - giorni(da), conAz = $('#sAz', f).checked;
    const zone = new Set();
    for (const [zid, id] of scelte) {
      const z = ST.zone[zid].z, p = z.prospect[id];
      // le tappe spostate si accodano a quelle già previste nella nuova data
      const giaLi = Object.values(z.prospect).filter((q) => !q.del && q.giro && q.giro.data === a).length;
      p.giro = { ...p.giro, data: a, ordine: giaLi + 1 };
      if (conAz) {
        if (p.data_prossima === da) p.data_prossima = a;
        if (p.visita_entro) p.visita_entro = piuGiorni(delta, p.visita_entro);
      }
      p.u = ora(); zone.add(zid);
    }
    // rinumera le tappe rimaste nella data di partenza
    for (const zid of zone) {
      Object.values(ST.zone[zid].z.prospect).filter((q) => !q.del && q.giro && q.giro.data === da).sort((x, y) => x.giro.ordine - y.giro.ordine)
        .forEach((q, i) => { if (q.giro.ordine !== i + 1) { q.giro = { ...q.giro, ordine: i + 1 }; q.u = ora(); } });
      modificato(zid);
    }
    ST.giroData = a; toast(`${scelte.length} tappe spostate al ${gg(a)}`); chiudiFoglio(); render();
  };
}
function spostaTappa(zid, id, dir) {
  const d = ST.giroData;
  const arr = tutti().filter((x) => x.zid === zid && x.p.giro && x.p.giro.data === d).sort((a, b) => (a.p.giro.ordine || 99) - (b.p.giro.ordine || 99));
  const i = arr.findIndex((x) => x.p.id === id), j = i + dir; if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  arr.forEach((x, k) => { x.p.giro = { ...x.p.giro, ordine: k + 1 }; x.p.u = ora(); });
  modificato(zid); ST.restaScroll = true; render();
}
function scegliTappa() {
  const tt = tutti().filter((x) => aperto(x.p) && !(x.p.giro && x.p.giro.data === ST.giroData));
  const f = apriFoglio('Aggiungi al giro del ' + gg(ST.giroData), `<input class="cerca" id="tq" placeholder="Cerca…"><div class="lista mt" id="tl"></div>`, () => { chiudiFoglio(); render(); });
  const lista = () => { const q = $('#tq').value.toLowerCase(); $('#tl').innerHTML = tt.filter((x) => x.p.nome.toLowerCase().includes(q)).map((x) => `<button class="card" style="text-align:left" data-add="${x.zid}|${x.p.id}"><div class="nome">${esc(x.p.nome)}</div><div class="sub">${esc(x.p.stato)} · ${esc(x.z.meta.quartiere)}</div></button>`).join(''); };
  $('#tq').oninput = lista; lista();
  f.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]'); if (!b) return;
    const [zid, id] = b.dataset.add.split('|'); const n = tutti().filter((x) => x.zid === zid && x.p.giro && x.p.giro.data === ST.giroData).length;
    aggiorna(zid, id, { giro: { data: ST.giroData, ordine: n + 1, orario: '', fatto: false } }); b.remove(); toast('Aggiunto');
  });
}
async function generaPdf(zid) {
  const out = $('#st-' + zid);
  if (!GH.ok()) { toast('Serve il collegamento GitHub'); return; }
  const z = ST.zone[zid].z;
  const ps = tutti().filter((x) => x.zid === zid && x.p.giro && x.p.giro.data === ST.giroData && x.p.pid && z.attivita[x.p.pid] && !(x.p.report && x.p.report.includi === false))
    .sort((a, b) => (a.p.giro.ordine || 99) - (b.p.giro.ordine || 99)).map((x) => x.p);
  if (!ps.length) { toast('Nessuna analisi da stampare'); return; }
  const job = L.jobStampa(z, ps, { data: z.meta.data, firma: ST.conf.firma && ST.conf.firma.nome ? ST.conf.firma : null });
  try {
    out.textContent = 'Invio…';
    await invia(zid);
    const sha = await GH.sha(`zone/${zid}/stampa.json`);
    await GH.putJSON(`zone/${zid}/stampa.json`, job, sha, `Stampa giro ${ST.giroData}`);
    out.textContent = 'In generazione (circa un minuto)…';
    const t0 = ora();
    while (ora() - t0 < 6 * 60000) {
      await new Promise((r) => setTimeout(r, 12000));
      const e = await GH.getJSON(`zone/${zid}/stampa/esito.json`).catch(() => null);
      if (e && e.data.richiesta === job.richiesta) {
        if (e.data.errore) { out.innerHTML = `<span class="c-neg">${esc(e.data.errore)}</span>`; return; }
        const av = (e.data.avvisi || []).map((a) => `<div class="avviso">${esc(a)}</div>`).join('');
        out.innerHTML = `<button class="btn mini ink" data-pdf="${zid}|${esc(e.data.file)}">Apri ${esc(e.data.file.split('/').pop())}</button>${av}`;
        z.prospect && ps.forEach((p) => { if (!p.report_prodotto) { p.report_prodotto = oggi(); p.u = ora(); } }); modificato(zid);
        return;
      }
    }
    out.textContent = 'Ancora in coda: controlla tra poco da Zone → PDF.';
  } catch (e) { out.innerHTML = `<span class="c-neg">${esc(e.message)}</span>`; }
}
async function apriPdf(zid, file) {
  toast('Scarico il PDF…');
  try {
    const blob = await GH.getBlob(`zone/${zid}/${file}`); if (!blob) { toast('PDF non trovato'); return; }
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    const a = document.createElement('a'); a.href = url; a.download = file.split('/').pop(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { toast(e.message); }
}

/* ---------- vista: zone ---------- */
function vZone() {
  const ids = Object.keys(ST.zone).sort().reverse();
  return `<div class="row"><button class="btn pri" id="nuovaScan">Nuova zona da Local Falcon</button><label class="btn">Importa file zona<input type="file" id="impZona" accept=".json,.png" multiple hidden></label></div>
  <div class="lista mt">${ids.map((id) => { const z = ST.zone[id].z; const np = Object.values(z.prospect || {}).filter((p) => !p.del).length;
    return `<a class="card" href="#z/${id}"><div class="riga"><span class="nome">${esc(z.meta.quartiere)}, ${esc(z.meta.citta)}</span><span class="data">${gg(z.meta.data)}</span></div>
    <div class="sub">«${esc(z.meta.keyword)}» · ${z.punti ? z.punti.length : 0} punti · ${Object.keys(z.attivita || {}).length} attività · ${np} prospect</div></a>`; }).join('') || '<div class="vuoto">Nessuna zona.</div>'}</div>
  <div id="richieste"></div>`;
}
function apriZona(zid) {
  const s = ST.zone[zid]; if (!s) { location.hash = '#zone'; return; }
  const z = s.z; const giaP = new Set(Object.values(z.prospect || {}).filter((p) => !p.del).map((p) => p.pid));
  const ord = ST.f.ordZ || 'top20';
  const righe = Object.entries(z.attivita || {}).map(([pid, a]) => ({ pid, a, m: L.metriche(z, pid) }))
    .filter((r) => !ST.f.soloNuove || !giaP.has(r.pid))
    .sort((x, y) => ord === 'rv' ? (y.a.rv || 0) - (x.a.rv || 0) : ord === 'nome' ? x.a.n.localeCompare(y.a.n) : (y.m[ord] - x.m[ord]) || ((y.a.rv || 0) - (x.a.rv || 0)));
  const f = apriFoglio(`${z.meta.quartiere} · ${z.meta.keyword}`, `
  <div class="sub">Rilevazione del ${esc(z.meta.data_testo)} · griglia ${esc(z.meta.lato)} · ${z.punti.length} punti</div>
  <div class="sub mt">${s.siti && s.siti.aggiornato ? `Siti controllati il ${oraRoma(s.siti.aggiornato, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}: ${Object.values(s.siti.siti).filter((v) => STATO_SITO[v.stato]).length} non funzionanti su ${Object.keys(s.siti.siti).length}` : 'Siti non ancora controllati'}</div>
  <div class="row mt"><button class="btn mini" id="zSiti">Ricontrolla siti</button><button class="btn mini" id="zPdf">Ultimo PDF</button><button class="btn mini" id="zTesti">Testi della zona</button><button class="btn mini" id="zEsporta">Esporta CSV</button></div>
  <div class="eb">Attività trovate</div>
  <div class="filtri">${[['top20', 'Presenza'], ['top3', 'Top 3'], ['rv', 'Recensioni'], ['nome', 'Nome']].map(([k, l]) => `<button class="chip ${ord === k ? 'on' : ''}" data-ord="${k}">${l}</button>`).join('')}
  <button class="chip ${ST.f.soloNuove ? 'on' : ''}" id="soloNuove">Solo non in lista</button></div>
  <div class="lista">${righe.slice(0, 150).map(({ pid, a, m }) => `<div class="card"><div class="riga"><span class="nome">${esc(a.n)}</span>${giaP.has(pid) ? '<span class="pill">in lista</span>' : `<button class="btn mini" data-nuovo="${pid}">+ Prospect</button>`}</div>
    <div class="sub">${m.top3}/${m.N} top 3 · ${m.top20}/${m.N} top 20 · ${a.rv || 0} rec. ${L.virgola(a.r)}${a.c === false ? ' · <b class="c-neg">non rivendicata</b>' : ''}${(() => { const si = sitoInfo(z, { pid, sito: '' }); return si.k === 'ok' ? ' · ' + esc(si.label) : ' · <b class="c-mid">' + esc(si.label.toLowerCase()) + '</b>'; })()}${RETI.test(a.n) ? ' · rete' : ''}</div></div>`).join('')}</div>`,
  () => { location.hash = '#zone'; });
  f.querySelectorAll('[data-ord]').forEach((b) => (b.onclick = () => { ST.f.ordZ = b.dataset.ord; apriZona(zid); }));
  $('#soloNuove', f).onclick = () => { ST.f.soloNuove = !ST.f.soloNuove; apriZona(zid); };
  f.querySelectorAll('[data-nuovo]').forEach((b) => (b.onclick = () => nuovoProspect(zid, b.dataset.nuovo)));
  $('#zPdf', f).onclick = async () => { try { const e = await GH.getJSON(`zone/${zid}/stampa/esito.json`); if (e && e.data.file) apriPdf(zid, e.data.file); else toast('Nessun PDF ancora'); } catch (e) { toast(e.message); } };
  $('#zTesti', f).onclick = () => testiZona(zid);
  $('#zSiti', f).onclick = async () => {
    if (!GH.ok()) { toast('Serve il collegamento GitHub'); return; }
    try { await GH.putJSON(`zone/${zid}/siti-richiesta.json`, { creata: new Date().toISOString() }, await GH.sha(`zone/${zid}/siti-richiesta.json`), `Controllo siti ${zid}`);
      toast('Controllo avviato: 2-5 minuti, poi tocca il pallino in alto', 4500); } catch (e) { toast(e.message); }
  };
  $('#zEsporta', f).onclick = () => esportaCSV(zid);
}
function nuovoProspect(zid, pid) {
  const z = ST.zone[zid].z, a = z.attivita[pid], m = L.metriche(z, pid);
  const n = Object.keys(z.prospect || {}).map((k) => parseInt(k.slice(1), 10) || 0).reduce((x, y) => Math.max(x, y), 0) + 1;
  const id = 'P' + String(n).padStart(2, '0');
  const rete = RETI.test(a.n);
  // gli invisibili con almeno 20 recensioni tengono a Google: passano tra i caldi
  const prio = rete ? '3 Rete' : (a.rv || 0) >= 20 && (!m.top20 || !m.top3) ? '1 Caldo' : !m.top20 ? '0 Invisibile' : '2 Tiepido';
  const gancio = !m.top20 ? `Non compare tra i primi 20 in nessuno dei ${m.N} punti` : `${a.rv || 0} recensioni a ${L.virgola(a.r)}; nel top 3 in ${m.top3} punti su ${m.N}, presente in ${m.top20}`;
  z.prospect[id] = { id, pid, nome: a.n, priorita: prio, stato: 'Da contattare', prossima: rete ? 'Gestione separata franchising' : "Consegnare il report e proporre l'incontro", data_prossima: '',
    referente: '', telefono: a.t || '', email: '', sito: a.w || '', indirizzo: a.a || '', gancio, prodotto: '', valore: 0, segmento: rete ? 'Franchising' : 'Indipendente', note: '',
    giro: {}, report: { includi: !rete, luogo: rete ? 'agenzia' : undefined }, u: ora() };
  modificato(zid); toast('Aggiunto ' + a.n); apriZona(zid);
}
function testiZona(zid) {
  const z = ST.zone[zid].z, m = z.meta, pp = m.prossimo_passo;
  const f = apriFoglio('Testi della zona', `
  <div class="due"><label class="f">Quartiere<input data-m="quartiere" value="${esc(m.quartiere)}"></label><label class="f">Città<input data-m="citta" value="${esc(m.citta)}"></label></div>
  <div class="due"><label class="f">Categoria (nome file)<input data-m="categoria" value="${esc(m.categoria)}"></label><label class="f">Centrata… (es. sulla Crocetta)<input data-m="centrata" value="${esc(m.centrata)}"></label></div>
  <label class="f">Chi cerca… (es. un'agenzia immobiliare)<input data-m="frase_kw" value="${esc(m.frase_kw)}"></label>
  <div class="eb">Il prossimo passo</div>
  <label class="f">Introduzione<textarea data-pp="intro">${esc(pp.intro)}</textarea></label>
  <label class="f">Invito<textarea data-pp="outro">${esc(pp.outro)}</textarea></label>`, () => apriZona(zid));
  const salva = () => { m.u = ora(); modificato(zid); };
  f.querySelectorAll('[data-m]').forEach((el) => (el.onchange = () => { m[el.dataset.m] = el.value; salva(); }));
  f.querySelectorAll('[data-pp]').forEach((el) => (el.onchange = () => { pp[el.dataset.pp] = el.value; salva(); }));
  f.querySelectorAll('[data-it]').forEach((el) => (el.onchange = () => { const [i, j] = el.dataset.it.split('|'); pp.items[i][j] = el.value; salva(); }));
}
function formScansione() {
  const f = apriFoglio('Nuova zona da Local Falcon', `
  <p class="sub">Esegui la scansione su Local Falcon (griglia 7×7 centrata sul quartiere, keyword = sola categoria), poi incolla qui la chiave del report: l'import gira su GitHub, senza consumare Claude.</p>
  <label class="f">Report key (15 caratteri, dall'URL del report)<input id="nk" placeholder="es. e01e001722b17ba" autocapitalize="off"></label>
  <div class="due"><label class="f">Quartiere<input id="nq" placeholder="San Salvario"></label><label class="f">Città<input id="nc" value="Torino"></label></div>
  <div class="due"><label class="f">Categoria per il nome file<input id="ncat" placeholder="Farmacie"></label><label class="f">Riferimento<select id="nl">${L.LUOGHI.map((l) => `<option>${l}</option>`).join('')}</select></label></div>
  <label class="f">Chi cerca… (frase nei titoli)<input id="nf" placeholder="una farmacia"></label>
  <label class="f">Griglia centrata… <input id="nce" placeholder="su San Salvario"></label>
  <button class="btn pri mt" style="width:100%" id="nInvia">Importa</button><div id="nEsito" class="mt sub"></div>`, () => { chiudiFoglio(); render(); });
  $('#nInvia', f).onclick = async () => {
    const k = $('#nk').value.trim().toLowerCase(); const q = $('#nq').value.trim();
    if (!/^[a-f0-9]{15}$/.test(k)) { toast('La report key ha 15 caratteri esadecimali'); return; }
    if (!q || !GH.ok()) { toast(GH.ok() ? 'Manca il quartiere' : 'Serve il collegamento GitHub'); return; }
    const cat = $('#ncat').value.trim() || 'Analisi';
    const id = `${oggi().replace(/-/g, '').slice(2)}-${slug(q)}-${slug(cat)}`;
    const rq = { report_key: k, quartiere: q, citta: $('#nc').value.trim(), categoria: cat.replace(/\s+/g, ''), frase_kw: $('#nf').value.trim(), centrata: $('#nce').value.trim() || `su ${q}`, luogo: $('#nl').value, creata: new Date().toISOString() };
    const out = $('#nEsito');
    try {
      await GH.putJSON(`zone/${id}/richiesta.json`, rq, await GH.sha(`zone/${id}/richiesta.json`), `Richiesta import ${id}`);
      out.textContent = 'Richiesta inviata. Import in corso su GitHub (1-3 minuti): puoi chiudere, la zona compare da sola.';
      attendiImport(id, k, out);
    } catch (e) { out.innerHTML = `<span class="c-neg">${esc(e.message)}</span>`; }
  };
}
async function attendiImport(id, k, out) {
  const t0 = ora();
  while (ora() - t0 < 12 * 60000) {
    await new Promise((r) => setTimeout(r, 15000));
    const e = await GH.getJSON(`zone/${id}/importa-esito.json`).catch(() => null);
    if (e && e.data.report_key === k) {
      if (e.data.stato === 'ok') {
        await scarica();
        const z = ST.zone[id]; if (z && !z.z.meta.luogo) { const rq = await GH.getJSON(`zone/${id}/richiesta.json`); z.z.meta.luogo = rq && rq.data.luogo || 'ufficio'; z.z.meta.u = ora(); modificato(id); }
        toast(`Zona importata: ${e.data.attivita} attività`); if (out) out.textContent = 'Fatto.'; return;
      }
      if (out) out.innerHTML = `<span class="c-neg">Import non riuscito: ${esc(e.data.messaggio)}</span>`; else toast('Import non riuscito: ' + e.data.messaggio, 6000);
      return;
    }
  }
}
async function importaFile(files) {
  const json = [...files].find((f) => f.name.endsWith('.json')), png = [...files].find((f) => f.name.endsWith('.png'));
  if (!json) { toast('Seleziona zona.json (e facoltativamente sfondo.png)'); return; }
  try {
    const z = JSON.parse(await json.text());
    if (!z.id || !z.meta || !z.punti) throw new Error('File non valido: manca id, meta o punti');
    const esist = ST.zone[z.id];
    if (esist && !confirm(`La zona ${z.id} esiste già. Unire i dati del file con quelli presenti?`)) return;
    ST.zone[z.id] = esist ? { ...esist, z: unisci(z, esist.z) } : { z, sha: null, dirty: true };
    if (GH.ok()) {
      ST.zone[z.id].sha = ST.zone[z.id].sha || await GH.sha(`zone/${z.id}/zona.json`);
      if (png) await GH.put(`zone/${z.id}/sfondo.png`, await bufB64(await png.arrayBuffer()), await GH.sha(`zone/${z.id}/sfondo.png`), `Sfondo ${z.id}`);
    }
    modificato(z.id); await invia(z.id); toast('Zona importata'); render();
  } catch (e) { toast(e.message, 5000); }
}

/* ---------- vista: numeri ---------- */
function vCruscotto() {
  const tt = tutti(); const regs = Object.values(ST.zone).flatMap((s) => Object.values(s.z.registro || {}).filter((r) => !r.del));
  const vinti = tt.filter((x) => x.p.stato === 'Chiuso vinto'), persi = tt.filter((x) => x.p.stato === 'Chiuso perso');
  const eur = (n) => (n || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const max = Math.max(1, ...STATI.map((s) => tt.filter((x) => x.p.stato === s).length));
  const sett = piuGiorni(-7);
  return `<div class="kpi">
    <button><b>${tt.length}</b><span>Prospect</span></button>
    <button><b>${regs.length}</b><span>Contatti registrati</span></button>
    <button><b>${regs.filter((r) => r.data >= sett).length}</b><span>Contatti ultimi 7 gg</span></button>
    <button><b>${regs.filter((r) => r.esito === 'Appuntamento fissato').length}</b><span>Appuntamenti fissati</span></button>
    <button><b class="c-top">${vinti.length}</b><span>Chiusi vinti</span></button>
    <button><b>${vinti.length + persi.length ? Math.round(vinti.length / (vinti.length + persi.length) * 100) + '%' : '—'}</b><span>Tasso di chiusura</span></button>
    <button><b>${eur(vinti.reduce((s, x) => s + (+x.p.valore || 0), 0))}</b><span>Valore firmato</span></button>
    <button><b>${eur(tt.filter((x) => aperto(x.p)).reduce((s, x) => s + (+x.p.valore || 0), 0))}</b><span>Valore in proposta</span></button></div>
  <div class="eb">Imbuto per stato</div>
  <table class="funnel" style="width:100%">${STATI.map((s) => { const n = tt.filter((x) => x.p.stato === s); return `<tr><td style="width:42%">${s}</td><td style="width:34%"><div class="barra"><i style="width:${n.length / max * 100}%"></i></div></td><td class="mono" style="text-align:right">${n.length}</td><td class="mono" style="text-align:right">${n.length ? eur(n.reduce((a, x) => a + (+x.p.valore || 0), 0)) : ''}</td></tr>`; }).join('')}</table>
  <div class="eb">Aperti per priorità</div>
  <table class="funnel" style="width:100%">${PRIORITA.map((pr) => `<tr><td>${prioHtml(pr)}</td><td class="mono" style="text-align:right">${tt.filter((x) => x.p.priorita === pr && aperto(x.p)).length}</td></tr>`).join('')}</table>
  <div class="eb">Esiti dei contatti</div>
  <table class="funnel" style="width:100%">${ESITI.map((e) => [e, regs.filter((r) => r.esito === e).length]).filter((x) => x[1]).map(([e, n]) => `<tr><td>${e}</td><td class="mono" style="text-align:right">${n}</td></tr>`).join('') || '<tr><td class="sub">Ancora nessun contatto registrato.</td></tr>'}</table>`;
}

/* ---------- vista: altro ---------- */
function vAltro() {
  const c = ST.cfg, fi = ST.conf.firma || {};
  return `<div class="eb">Collegamento GitHub</div>
  <label class="f">Utente o organizzazione<input id="cOwner" value="${esc(c.owner || '')}" autocapitalize="off"></label>
  <label class="f">Repository dati (privato)<input id="cRepo" value="${esc(c.repo || 'visibilita-dati')}" autocapitalize="off"></label>
  <label class="f">Token (fine-grained, solo questo repository)<input id="cTok" type="password" value="${esc(c.token || '')}" autocomplete="off"></label>
  <div class="row mt"><button class="btn pri" id="cSalva">Salva e prova</button><button class="btn" id="cInit">Prepara / aggiorna repository</button></div>
  <div id="cEsito" class="sub mt"></div>
  <div class="eb">Firma sui report</div>
  <div class="due"><label class="f">Nome<input data-fi="nome" value="${esc(fi.nome || 'Hector Rinaldi')}"></label><label class="f">Ruolo<input data-fi="ruolo" value="${esc(fi.ruolo || 'Consulente visibilità locale')}"></label></div>
  <div class="due"><label class="f">Telefono<input data-fi="telefono" value="${esc(fi.telefono || '+39 351 894 2667')}"></label><label class="f">Email<input data-fi="email" value="${esc(fi.email || 'hector.rinaldi@italiaonline.it')}"></label></div>
  <div class="eb">Dati</div>
  <div class="row"><button class="btn" id="bkp">Scarica backup completo</button><button class="btn" id="csvAll">Esporta CSV (Excel)</button><button class="btn" id="aggiorna">Riscarica da GitHub</button></div>
  <p class="sub mt">Versione ${VERSIONE}. I dati restano nel repository privato e in questo dispositivo; il token è salvato solo qui. Su un telefono perso: revoca il token da GitHub → Settings → Developer settings.</p>
  <button class="btn mini" id="esci" style="color:var(--neg)">Scollega e cancella i dati da questo dispositivo</button>`;
}
async function preparaRepo(out) {
  if (!GH.ok()) { out.textContent = 'Compila prima utente, repository e token.'; return; }
  const file = [...MOTORE.map((p) => [p, p]), ...Object.entries(WORKFLOW)];
  let n = 0;
  try {
    for (const [src, dst] of file) {
      out.textContent = `Copio ${dst} (${++n}/${file.length + 1})…`;
      const buf = await (await fetch(src, { cache: 'no-store' })).arrayBuffer();
      const b64 = await bufB64(buf);
      const cur = await GH.req(dst); const curJ = cur && await cur.json();
      if (curJ && curJ.content && curJ.content.replace(/\n/g, '') === b64) continue;
      await GH.put(dst, b64, curJ && curJ.sha, `Motore: ${dst}`);
    }
    const conf = await GH.getJSON('config.json');
    if (!conf) await GH.putJSON('config.json', { firma: ST.conf.firma || {} }, null, 'Configurazione');
    out.innerHTML = '<span class="c-top">Repository pronto.</span> Ultimo passo: aggiungi il secret LOCALFALCON_API_KEY (vedi istruzioni).';
  } catch (e) {
    out.innerHTML = `<span class="c-neg">${esc(e.message)}</span>${e.status === 403 || e.status === 404 ? '<br>Controlla che il token abbia Contents e Workflows in lettura e scrittura.' : ''}`;
  }
}
function esportaCSV(zid) {
  const righe = [['Zona', 'ID', 'Priorità', 'Agenzia', 'Stato', 'Prossima azione', 'Data prossima azione', 'Ultimo contatto', 'N. contatti', 'Referente', 'Telefono', 'Email', 'Sito', 'PagineGialle', 'Indirizzo', 'Gancio', 'Prodotto', 'Valore', 'Segmento', 'Top 3', 'Top 20', 'Recensioni', 'Valutazione', 'Data giro', 'Ordine giro', 'Note']];
  tutti().filter((x) => !zid || x.zid === zid).forEach(({ zid: z0, z, p }) => {
    const a = z.attivita[p.pid] || {}; const m = a.n ? L.metriche(z, p.pid) : {};
    righe.push([z.meta.quartiere, p.id, p.priorita, p.nome, p.stato, p.prossima, p.data_prossima, ultimoContatto(z0, p.id), registro(z0, p.id).length, p.referente, p.telefono, p.email, p.sito, PG[p.pg] || 'da verificare', p.indirizzo, p.gancio, p.prodotto, p.valore, p.segmento, m.top3 ?? '', m.top20 ?? '', a.rv ?? '', a.r ?? '', (p.giro || {}).data || '', (p.giro || {}).ordine || '', p.note]);
  });
  const reg = [['Zona', 'Data', 'ID', 'Agenzia', 'Canale', 'Interlocutore', 'Esito', 'Cosa è emerso', 'Prossima azione', 'Entro il']];
  Object.entries(ST.zone).filter(([k]) => !zid || k === zid).forEach(([k, s]) => Object.values(s.z.registro || {}).filter((r) => !r.del).sort((a, b) => (a.data > b.data ? 1 : -1))
    .forEach((r) => reg.push([s.z.meta.quartiere, r.data, r.p, (s.z.prospect[r.p] || {}).nome, r.canale, r.interlocutore, r.esito, r.emerso, r.prossima, r.entro])));
  const csv = (rr) => '﻿' + rr.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  scaricaFile(csv(righe), `prospect-${zid || 'tutte'}-${oggi()}.csv`, 'text/csv');
  setTimeout(() => scaricaFile(csv(reg), `registro-${zid || 'tutte'}-${oggi()}.csv`, 'text/csv'), 600);
}
function scaricaFile(testo, nome, tipo) { const url = URL.createObjectURL(new Blob([testo], { type: tipo })); const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }

/* ---------- eventi delle viste ---------- */
function legaVista(v) {
  const V = $('#vista');
  if (v === 'oggi') V.querySelectorAll('[data-kpi]').forEach((b) => (b.onclick = () => { ST.f.kpi = ST.f.kpi === b.dataset.kpi ? '' : b.dataset.kpi; render(); }));
  if (v === 'prospect') {
    V.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { ST.f[b.dataset.f] = b.dataset.v; render(); }));
    $('#filtroNR').onclick = () => { ST.f.nr = !ST.f.nr; render(); };
    $('#filtroNS').onclick = () => { ST.f.ns = !ST.f.ns; render(); };
    V.querySelectorAll('[data-fpg]').forEach((b) => (b.onclick = () => { ST.f.pg = ST.f.pg === b.dataset.fpg ? '' : b.dataset.fpg; render(); }));
    const q = $('#q'); q.oninput = () => { ST.f.q = q.value; clearTimeout(ST.timer.q); ST.timer.q = setTimeout(() => { render(); const n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  }
  if (v === 'giro') {
    $('#gData').onchange = (e) => { ST.giroData = e.target.value; render(); };
    $('#gAgg').onclick = scegliTappa;
    const gs = $('#gSposta'); if (gs) gs.onclick = formSpostaGiro;
    V.querySelectorAll('[data-gd]').forEach((b) => (b.onclick = () => { ST.giroData = b.dataset.gd; render(); }));
    V.querySelectorAll('[data-su],[data-giu]').forEach((b) => (b.onclick = () => { const [zid, id] = (b.dataset.su || b.dataset.giu).split('|'); spostaTappa(zid, id, b.dataset.su ? -1 : 1); }));
    V.querySelectorAll('[data-ora]').forEach((el) => (el.onchange = () => { const [zid, id] = el.dataset.ora.split('|'); const p = ST.zone[zid].z.prospect[id]; aggiorna(zid, id, { giro: { ...p.giro, orario: el.value } }); }));
    V.querySelectorAll('[data-fatto]').forEach((b) => (b.onclick = () => { const [zid, id] = b.dataset.fatto.split('|'); formContatto(zid, id, { canale: 'Passaggio in agenzia', esito: 'Report consegnato', giro: true, ritorno: '#giro' }); }));
    V.querySelectorAll('[data-annulla]').forEach((b) => (b.onclick = () => { const [zid, id] = b.dataset.annulla.split('|'); const p = ST.zone[zid].z.prospect[id]; aggiorna(zid, id, { giro: { ...p.giro, fatto: false, fatto_il: '' } }); ST.restaScroll = true; render(); }));
    V.querySelectorAll('[data-togli]').forEach((b) => (b.onclick = () => { const [zid, id] = b.dataset.togli.split('|'); aggiorna(zid, id, { giro: {} }); ST.restaScroll = true; render(); }));
    V.querySelectorAll('[data-stampa]').forEach((b) => (b.onclick = () => generaPdf(b.dataset.stampa)));
  }
  if (v === 'zone') {
    $('#nuovaScan').onclick = formScansione;
    $('#impZona').onchange = (e) => importaFile(e.target.files);
  }
  if (v === 'altro') {
    $('#cSalva').onclick = async () => {
      ST.cfg = { owner: $('#cOwner').value.trim(), repo: $('#cRepo').value.trim(), token: $('#cTok').value.trim() };
      await DB.set('cfg', ST.cfg); const out = $('#cEsito');
      try { const r = await fetch(`https://api.github.com/repos/${ST.cfg.owner}/${ST.cfg.repo}`, { cache: 'no-store', headers: { Authorization: `Bearer ${ST.cfg.token}` } });
        if (!r.ok) throw new Error(r.status === 404 ? 'Repository non trovato o token senza accesso' : r.status === 401 ? 'Token non valido' : 'GitHub ' + r.status);
        const j = await r.json(); out.innerHTML = `<span class="c-top">Collegato a ${esc(j.full_name)}</span>${j.private ? '' : ' <span class="c-neg">ATTENZIONE: il repository è pubblico. Rendilo privato.</span>'}`; scarica();
      } catch (e) { out.innerHTML = `<span class="c-neg">${esc(e.message)}</span>`; }
    };
    $('#cInit').onclick = () => preparaRepo($('#cEsito'));
    $('#vista').querySelectorAll('[data-fi]').forEach((el) => (el.onchange = async () => {
      ST.conf.firma = { ...(ST.conf.firma || {}), [el.dataset.fi]: el.value }; DB.set('conf', ST.conf);
      if (GH.ok()) try { const s = await GH.sha('config.json'); await GH.putJSON('config.json', ST.conf, s, 'Firma'); toast('Firma salvata'); } catch (e) { toast(e.message); }
    }));
    $('#bkp').onclick = () => scaricaFile(JSON.stringify(Object.fromEntries(Object.entries(ST.zone).map(([k, s]) => [k, s.z]))), `backup-visibilita-${oggi()}.json`, 'application/json');
    $('#csvAll').onclick = () => esportaCSV();
    $('#aggiorna').onclick = () => { Object.values(ST.zone).forEach((s) => { if (!s.dirty) s.sha = null; }); scarica(); };
    $('#esci').onclick = async () => {
      if (Object.values(ST.zone).some((s) => s.dirty) && !confirm('Ci sono modifiche non ancora salvate su GitHub. Cancellare comunque?')) return;
      if (!confirm('Cancellare token e dati da questo dispositivo? Il repository GitHub non viene toccato.')) return;
      for (const k of await DB.keys()) await DB.del(k); location.reload();
    };
  }
}

/* ---------- avvio ---------- */
(async function avvio() {
  ST.cfg = (await DB.get('cfg')) || {};
  ST.conf = (await DB.get('conf')) || { firma: {} };
  for (const k of await DB.keys()) if (String(k).startsWith('zona:')) ST.zone[k.slice(5)] = await DB.get(k);
  statoSync(GH.ok() ? 'att' : 'loc', GH.ok() ? 'Avvio…' : 'Solo su questo dispositivo');
  render();
  $('#sync').onclick = async () => { for (const id of Object.keys(ST.zone)) await invia(id); scarica(); };
  window.addEventListener('online', () => { Object.keys(ST.zone).forEach((id) => invia(id)); scarica(); });
  window.addEventListener('offline', () => statoSync('att', 'Offline'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ora() - (ST.ultimo || 0) > 60000) scarica(); });
  document.addEventListener('click', (e) => { const sb = e.target.closest('.badge-sito[data-href]'); if (sb) { e.preventDefault(); e.stopPropagation(); window.open(sb.dataset.href, '_blank', 'noopener'); } }, true);
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-pdf]'); if (b) { const [zid, f] = b.dataset.pdf.split('|'); apriPdf(zid, f); } });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  Object.keys(ST.zone).forEach((id) => { if (ST.zone[id].dirty) invia(id); });
  scarica();
})();
