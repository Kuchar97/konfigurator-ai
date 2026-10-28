// Wskazówki dla AI zapisane przez zespół (uwaga #22): z poprawek do propozycji AI powstaje ogólna reguła,
// która trafia do instrukcji AI przy każdej kolejnej analizie. Administrator przegląda i usuwa je w Dane → AI.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PLIK = path.join(__dirname, '..', 'data', 'ai-wskazowki.json');
const MAKS = 100;

function lista() { try { return JSON.parse(fs.readFileSync(PLIK, 'utf8')); } catch { return []; } }
function zapisz(l) { fs.writeFileSync(PLIK, JSON.stringify(l, null, 1)); }

function dodaj({ tekst, login, poprawka }) {
  const t = String(tekst || '').trim().slice(0, 400);
  if (t.length < 5) return null;
  const l = lista();
  // ta sama reguła drugi raz – nie dublujemy
  if (l.some(w => w.tekst.toLowerCase() === t.toLowerCase())) return null;
  const w = { id: crypto.randomBytes(5).toString('hex'), data: new Date().toISOString(), login: login || '', tekst: t, poprawka: String(poprawka || '').slice(0, 500) };
  zapisz([...l, w].slice(-MAKS));
  return w;
}
function usun(id) { zapisz(lista().filter(w => w.id !== id)); }

// fragment instrukcji AI
function doPromptu() {
  const l = lista();
  return l.length ? `\n\nWskazówki od zespołu Kontakt-Simon (zebrane z poprawek – stosuj je zawsze, mają pierwszeństwo przed zasadami ogólnymi):\n${l.map(w => '- ' + w.tekst).join('\n')}` : '';
}

module.exports = { lista, dodaj, usun, doPromptu };
