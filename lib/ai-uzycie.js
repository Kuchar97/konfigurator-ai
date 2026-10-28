// Zużycie AI na konto: każda analiza (API lub subskrypcja Claude Code) i użycie trybu ręcznego → data/ai-uzycie.json
const fs = require('fs');
const path = require('path');

const PLIK = path.join(__dirname, '..', 'data', 'ai-uzycie.json');
const MAKS_WPISOW = 50000;

// Cennik API Anthropic w USD za milion tokenów [wejście, wyjście]; zapis do cache = 1,25× wejścia, odczyt z cache = 0,1× wejścia.
// Nieznany model liczony jak claude-opus-5 (oznaczony jako szacunek).
const CENY = {
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-fable-5-1': [10, 50],
  'claude-fable-5': [10, 50],
  'claude-opus-4-8': [5, 25],
  'claude-haiku-4-5': [1, 5]
};

const czytaj = () => { try { return JSON.parse(fs.readFileSync(PLIK, 'utf8')); } catch { return []; } };

function cenaModelu(model) {
  const m = String(model || '');
  const klucz = Object.keys(CENY).sort((a, b) => b.length - a.length).find(k => m.startsWith(k));
  return klucz ? { ceny: CENY[klucz], szacunek: false } : { ceny: CENY['claude-opus-5'], szacunek: true };
}

// koszt w USD z tokenów (tryb API)
function kosztZTokenow(model, t) {
  const { ceny: [we, wy], szacunek } = cenaModelu(model);
  const usd = ((t.wejscie || 0) * we + (t.cacheZapis || 0) * we * 1.25 + (t.cacheOdczyt || 0) * we * 0.1 + (t.wyjscie || 0) * wy) / 1e6;
  return { usd: Math.round(usd * 1e6) / 1e6, szacunek };
}

// ujednolicenie „usage” z API Anthropic i z Claude Code
function tokenyZUsage(u = {}) {
  return {
    wejscie: u.input_tokens || 0,
    wyjscie: u.output_tokens || 0,
    cacheZapis: u.cache_creation_input_tokens || 0,
    cacheOdczyt: u.cache_read_input_tokens || 0
  };
}

function zapisz(wpis) {
  const l = czytaj();
  l.push({ data: new Date().toISOString(), ...wpis });
  fs.writeFileSync(PLIK, JSON.stringify(l.slice(-MAKS_WPISOW)));
}

// Podsumowanie na konto za okres: miesiac = „2026-09”, „wszystko” albo pusty (bieżący miesiąc)
function podsumowanie({ miesiac, login } = {}) {
  const m = miesiac === 'wszystko' ? null : (miesiac || new Date().toISOString().slice(0, 7));
  const wpisy = czytaj().filter(w => (!m || w.data.startsWith(m)) && (!login || w.login === login));
  const konta = {};
  const suma = { analizy: 0, reczne: 0, wejscie: 0, wyjscie: 0, cache: 0, usd: 0, szacunek: false };
  for (const w of wpisy) {
    const k = konta[w.login] = konta[w.login] || { login: w.login, analizy: 0, reczne: 0, wejscie: 0, wyjscie: 0, cache: 0, usd: 0, api: 0, subskrypcja: 0, ostatnio: null, szacunek: false };
    for (const cel of [k, suma]) {
      if (w.tryb === 'reczny') { cel.reczne++; continue; }
      // wywołanie pomocnicze (dokładny dobór w ramach tej samej analizy) – koszt liczymy, analizy do limitu nie
      if (!w.pomocnicze) cel.analizy++;
      cel.wejscie += w.wejscie || 0; cel.wyjscie += w.wyjscie || 0; cel.cache += (w.cacheZapis || 0) + (w.cacheOdczyt || 0);
      cel.usd += w.usd || 0;
      if (w.szacunek) cel.szacunek = true;
    }
    if (w.tryb === 'api') k.api++;
    if (w.tryb === 'subskrypcja') k.subskrypcja++;
    if (!k.ostatnio || w.data > k.ostatnio) k.ostatnio = w.data;
  }
  const miesiace = [...new Set(czytaj().map(w => w.data.slice(0, 7)))].sort().reverse();
  return { miesiac: m || 'wszystko', miesiace, suma, konta: Object.values(konta).sort((a, b) => b.usd - a.usd || b.analizy - a.analizy) };
}

module.exports = { zapisz, podsumowanie, kosztZTokenow, tokenyZUsage, CENY };
