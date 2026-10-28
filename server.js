// Konfigurator AI Kontakt-Simon – puszki podłogowe i osprzęt elektroinstalacyjny
// Start: npm start  →  http://localhost:3490
const express = require('express');
const fs = require('fs');
const path = require('path');
const { parseCennik } = require('./lib/cennik');
const { stan, infoProduktu } = require('./lib/kontakt-simon');
const { ofertaXlsx } = require('./lib/oferta-xlsx');
const ai = require('./lib/ai');
const konta = require('./lib/konta');
const poczta = require('./lib/poczta');
const uwagi = require('./lib/uwagi');
const reguly = require('./lib/reguly');
const uzycieAi = require('./lib/ai-uzycie');
const osprzetSlownik = require('./lib/osprzet-slownik');
const osprzetDobor = require('./lib/osprzet-dobor');
const osprzetLista = require('./lib/osprzet-lista');
const aiOsprzet = require('./lib/ai-osprzet');
const podobneProdukty = require('./lib/podobne');
const aiWskazowki = require('./lib/ai-wskazowki');
const Anthropic = require('@anthropic-ai/sdk');

const PORT = process.env.PORT || 3490;
// Na serwerze (deploy/konfigurator.env): KONFIGURATOR_PRODUKCJA=1, ADRES_APLIKACJI=https://…ts.net
const PRODUKCJA = process.env.KONFIGURATOR_PRODUKCJA === '1';
const ADRES = (process.env.ADRES_APLIKACJI || '').replace(/\/+$/, '');
const HOST = process.env.HOST || (PRODUKCJA ? '127.0.0.1' : undefined); // za tunelem – tylko lokalnie
const DATA = path.join(__dirname, 'data');
const KATALOGI = path.join(DATA, 'katalogi');
fs.mkdirSync(KATALOGI, { recursive: true });

const czytaj = (plik, dom) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, plik), 'utf8')); } catch { return dom; } };
const zapisz = (plik, obj) => fs.writeFileSync(path.join(DATA, plik), JSON.stringify(obj, null, 1));
const bezpiecznaNazwa = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(0, 80);

const app = express();
app.set('trust proxy', 'loopback'); // Tailscale Funnel / Cloudflare Tunnel łączą się z 127.0.0.1
app.use(express.json({ limit: '50mb' })); // załączniki PDF/JPG do analizy AI przychodzą jako base64
// no-cache: przeglądarka przy każdym wejściu sprawdza (ETag), czy pliki się zmieniły – po aktualizacji serwera
// użytkownicy od razu dostają nową wersję, bez Ctrl+F5
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: res => res.setHeader('Cache-Control', 'no-cache') }));
app.use('/katalogi', express.static(KATALOGI));

// ---------- Sesja i uprawnienia ----------
const COOKIE = 'kai_sesja'; // inna nazwa niż w konfiguratorze puszek – przeglądarka nie rozróżnia ciasteczek po porcie
function token(req) {
  const c = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='));
  return c ? decodeURIComponent(c.slice(COOKIE.length + 1)) : null;
}
app.use((req, res, next) => { req.konto = konta.kontoZSesji(token(req)); next(); });

// wymagaj() – dowolne zalogowane konto; wymagaj('admin','pracownik') – konkretne role
const wymagaj = (...role) => (req, res, next) => {
  if (!req.konto) return res.status(401).json({ blad: 'Zaloguj się, aby skorzystać z tej funkcji.' });
  if (role.length && !role.includes(req.konto.rola)) return res.status(403).json({ blad: 'Brak uprawnień.' });
  next();
};
const personel = wymagaj('admin', 'pracownik');
const tylkoAdmin = wymagaj('admin'); // cennik, katalogi i ustawienia AI
const obsluz = fn => async (req, res) => {
  try { res.json(await fn(req, res)); }
  catch (e) { res.status(e.status || 500).json({ blad: e.message, kod: e.kod }); }
};

// Adres aplikacji do linków w mailach (np. http://localhost:3480 albo ADRES_APLIKACJI na serwerze)
const adresAplikacji = req => ADRES || `${req.protocol}://${req.get('host')}`;
const COOKIE_OPCJE = `HttpOnly; SameSite=Lax; Path=/${ADRES.startsWith('https:') ? '; Secure' : ''}`;

async function wyslijLinkPotwierdzajacy(req, konto, token) {
  const url = `${adresAplikacji(req)}/api/konto/potwierdz?token=${token}`;
  const { html, tekst } = poczta.szablon('Potwierdź adres e-mail', [
    `Dzień dobry${konto.imie ? ' ' + konto.imie : ''},`,
    `dziękujemy za rejestrację w konfiguratorze puszek podłogowych Kontakt-Simon (konto: ${konto.rolaNazwa}).`,
    'Aby aktywować logowanie, potwierdź swój adres e-mail – link jest ważny 48 godzin.',
    ...(konto.status === 'oczekuje' ? [konto.rola === 'hurtownia' ? 'Po potwierdzeniu adresu Twoje konto zaakceptuje wybrany opiekun z Kontakt-Simon.' : 'Po potwierdzeniu adresu Twoje konto zaakceptuje administrator.'] : []),
    'Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.'
  ], { url, tekst: 'Potwierdź adres e-mail' });
  try { return { wyslano: true, ...(await poczta.wyslij({ do: konto.email, temat: 'Potwierdź adres e-mail – konfigurator puszek Kontakt-Simon', html, tekst })) }; }
  catch (e) { console.error('Błąd wysyłki e-maila:', e.message); return { wyslano: false, blad: e.message }; }
}

// ---------- Konta ----------
// Bez skonfigurowanej poczty nowe konta akceptuje administrator (zamiast linku w mailu)
const bezMaila = () => !poczta.statusPoczty().skonfigurowana;
app.get('/api/konto', (req, res) => res.json({
  konto: konta.publiczne(req.konto), pierwszeKonto: konta.czyPusto(), role: konta.ROLE,
  stanowiska: konta.STANOWISKA_KS, rodzajeInstalatora: konta.RODZAJE_INSTALATORA, bezMaila: bezMaila(),
  noweUwagi: req.konto && req.konto.rola === 'admin' ? uwagi.noweIle() : 0
}));
// listy do formularza rejestracji: opiekunowie (dla hurtowni) i hurtownie (dla instalatorów)
app.get('/api/konto/pracownicy', (req, res) => res.json(konta.listaPracownikow()));
app.get('/api/konto/hurtownie', (req, res) => res.json(konta.listaHurtowni()));
app.post('/api/konto/rejestracja', obsluz(async req => {
  const { konto, pierwsze, token, akceptacja } = konta.rejestruj(req.body || {}, { bezMaila: bezMaila() });
  const mail = token ? await wyslijLinkPotwierdzajacy(req, konto, token) : null;
  return { konto, pierwsze, mail, akceptacja }; // token nigdy nie trafia do przeglądarki
}));
// Link z maila: potwierdza adres i przekierowuje na ekran logowania z komunikatem
app.get('/api/konto/potwierdz', (req, res) => {
  try {
    const k = konta.potwierdzEmail(String(req.query.token || ''));
    res.redirect(`/?potwierdzenie=ok&status=${encodeURIComponent(k.status)}&rola=${encodeURIComponent(k.rola)}`);
  } catch (e) { res.redirect(`/?potwierdzenie=blad&komunikat=${encodeURIComponent(e.message)}`); }
});
app.post('/api/konto/wyslij-link', obsluz(async req => {
  const r = konta.nowyTokenPotwierdzenia(req.body.email);
  if (r) await wyslijLinkPotwierdzajacy(req, r.konto, r.token);
  return { ok: true }; // ta sama odpowiedź niezależnie od tego, czy konto istnieje
}));

// Poczta (administrator): ustawienia SMTP, test, skrzynka testowa
app.get('/api/poczta', tylkoAdmin, (req, res) => res.json({ ...poczta.statusPoczty(), skrzynka: poczta.skrzynkaTestowa() }));
app.post('/api/poczta', tylkoAdmin, obsluz(req => { poczta.zapiszSmtp(req.body && req.body.usun ? null : req.body); return poczta.statusPoczty(); }));
app.post('/api/poczta/test', tylkoAdmin, obsluz(async req => {
  const { html, tekst } = poczta.szablon('Test poczty', ['To jest testowa wiadomość z konfiguratora puszek podłogowych Kontakt-Simon. Wysyłka e-maili działa.']);
  return poczta.wyslij({ do: String(req.body.do || req.konto.login), temat: 'Test poczty – konfigurator puszek', html, tekst });
}));
app.delete('/api/poczta/skrzynka', tylkoAdmin, (req, res) => { poczta.wyczyscSkrzynke(); res.json({ ok: true }); });
app.post('/api/konto/hurtownie', wymagaj('instalator'), obsluz(req => konta.dodajHurtownie(req.konto, req.body.hurtownia)));
// Ochrona przed zgadywaniem haseł: max 10 nieudanych prób na 15 minut dla danego konta z jednego adresu
// (klucz z e-mailem – za tunelem wszyscy mogą mieć ten sam adres 127.0.0.1)
const PROBY = new Map();
const kluczProby = req => `${req.ip}|${String((req.body || {}).email || '').trim().toLowerCase()}`;
function limitLogowania(req) {
  const teraz = Date.now(), klucz = kluczProby(req), p = PROBY.get(klucz);
  if (p && teraz - p.od < 15 * 60 * 1000 && p.ile >= 10) throw Object.assign(new Error('Zbyt wiele nieudanych prób logowania – spróbuj za kilkanaście minut.'), { status: 429 });
  return () => { const q = PROBY.get(klucz); PROBY.set(klucz, q && teraz - q.od < 15 * 60 * 1000 ? { od: q.od, ile: q.ile + 1 } : { od: teraz, ile: 1 }); };
}
app.post('/api/konto/logowanie', obsluz((req, res) => {
  const nieudana = limitLogowania(req);
  let wynik;
  try { wynik = konta.zaloguj(req.body.email, req.body.haslo, { bezMaila: bezMaila() }); }
  catch (e) { if (e.kod !== 'niepotwierdzony') nieudana(); throw e; }
  PROBY.delete(kluczProby(req));
  res.setHeader('Set-Cookie', `${COOKIE}=${wynik.token}; ${COOKIE_OPCJE}; Max-Age=${60 * 60 * 24 * 14}`);
  return { konto: wynik.konto };
}));
app.post('/api/konto/wylogowanie', (req, res) => {
  konta.wyloguj(token(req));
  res.setHeader('Set-Cookie', `${COOKIE}=; ${COOKIE_OPCJE}; Max-Age=0`);
  res.json({ ok: true });
});
app.get('/api/powiadomienia', wymagaj(), (req, res) => res.json(konta.powiadomienia(req.konto.login)));
app.post('/api/powiadomienia/przeczytane', wymagaj(), (req, res) => { konta.oznaczPrzeczytane(req.konto.login); res.json({ ok: true }); });

// Konta: admin – wszystkie; pracownik – jego hurtownie; hurtownia – jej instalatorzy/projektanci
app.get('/api/konta', wymagaj('admin', 'pracownik', 'hurtownia'), (req, res) => res.json(konta.listaKont(req.konto)));
app.post('/api/konta/:login', wymagaj('admin', 'pracownik', 'hurtownia'), obsluz(req => konta.zmienKonto(req.konto, req.params.login, req.body || {})));
app.delete('/api/konta/:login', wymagaj('admin'), obsluz(req => { konta.usunKonto(req.konto, req.params.login); return { ok: true }; }));

// ---------- Wyceny ----------
app.get('/api/wyceny', wymagaj(), (req, res) => res.json(konta.listaWycen(req.konto, String(req.query.zakres || ''))));
app.post('/api/wyceny', wymagaj(), obsluz(req => {
  const w = konta.zapiszWycene(req.konto, { kod: req.body.kod, oferta: req.body.oferta || {}, cennik: czytaj('produkty.json', { meta: {} }).meta.cennik });
  return konta.pobierzWycene(req.konto, w.kod);
}));
app.get('/api/wyceny/:kod', wymagaj(), obsluz(req => konta.pobierzWycene(req.konto, req.params.kod)));
app.delete('/api/wyceny/:kod', wymagaj(), obsluz(req => { konta.usunWycene(req.konto, req.params.kod); return { ok: true }; }));

// ---------- Zapytania o rabat ----------
app.get('/api/adresaci', wymagaj('klient', 'instalator', 'hurtownia'), (req, res) => res.json(konta.adresaci(req.konto)));
app.post('/api/wyceny/:kod/zapytania', wymagaj('klient', 'instalator', 'hurtownia'), obsluz(req => { konta.wyslijZapytanie(req.konto, req.params.kod, req.body || {}); return konta.pobierzWycene(req.konto, req.params.kod); }));
app.get('/api/zapytania', wymagaj('admin', 'pracownik', 'hurtownia', 'instalator'), (req, res) => res.json(konta.mojeZapytania(req.konto)));
app.post('/api/wyceny/:kod/zapytania/:id', wymagaj('admin', 'pracownik', 'hurtownia', 'instalator'), obsluz(req => konta.odpowiedz(req.konto, req.params.kod, req.params.id, req.body || {})));

// ---------- Dane aplikacji ----------
app.get('/api/dane', (req, res) => {
  res.json({ ...czytaj('produkty.json', { meta: {}, produkty: {} }), reguly: czytaj('reguly.json', {}), katalogi: czytaj('katalogi.json', []) });
});
app.get('/api/ciekawostki', (req, res) => res.json(czytaj('ciekawostki.json', [])));

// ---------- AI (tylko po zalogowaniu; na serwerze testowym – tylko administrator) ----------
// Dostęp: 'admin' – tylko administrator; 'wybrani' – administrator + konta z włączonym AI (Konta); 'wszyscy' – każde konto
const DOSTEP_AI = ['wszyscy', 'wybrani', 'admin'];
// kurs USD→PLN do przeliczania kosztu AI (Dane → AI, domyślnie 3,65)
const kursUsd = () => { const k = Number(ai.ustawienia().kursUsd); return k > 0 ? k : 3.65; };
const dostepAi = () => ai.ustawienia().dostepAi || (PRODUKCJA ? 'admin' : 'wszyscy');
const mozeAi = konto => !!konto && (konto.rola === 'admin' || dostepAi() === 'wszyscy' || (dostepAi() === 'wybrani' && konto.ai === true));
// Administrator – tryb z Dane (subskrypcja albo klucz API); pozostali zawsze przez klucz API
// (subskrypcja Claude jest osobista i nie może obsługiwać innych użytkowników)
const trybAiDla = konto => konto && konto.rola === 'admin' ? ai.tryb() : 'api';
// miesięczny limit analiz konta (Konta → limit; puste = bez limitu)
function limitAi(konto) {
  const limit = konto && konto.rola !== 'admin' && Number(konto.limitAi) > 0 ? Number(konto.limitAi) : null;
  const uzyte = konto ? uzycieAi.podsumowanie({ login: konto.login }).suma.analizy : 0;
  return { limit, uzyte, pozostalo: limit == null ? null : Math.max(0, limit - uzyte) };
}
const wymagajAi = (req, res, next) => {
  if (!req.konto) return res.status(401).json({ blad: 'Zaloguj się, aby skorzystać z AI.' });
  if (!mozeAi(req.konto)) return res.status(403).json({ blad: 'Analiza AI nie jest włączona dla Twojego konta – użyj trybu ręcznego (claude.ai) albo „Dobierz bez AI”.' });
  const l = limitAi(req.konto);
  if (l.limit != null && l.pozostalo <= 0) return res.status(429).json({ blad: `Wykorzystano miesięczny limit analiz AI (${l.limit}). Skontaktuj się z administratorem albo użyj trybu ręcznego.` });
  if (trybAiDla(req.konto) === 'api' && !ai.klucz()) return res.status(503).json({ blad: 'AI dla użytkowników działa przez klucz API, a nie został jeszcze dodany – daj znać administratorowi.' });
  next();
};
async function statusAi(req) {
  const sub = await ai.statusSubskrypcji();
  const tryb = trybAiDla(req.konto);
  return {
    tryb: ai.tryb(),       // tryb administratora (ustawienie w Dane)
    mojTryb: tryb,         // tryb, którym analizuje zalogowane konto
    dostepAi: dostepAi(),
    kursUsd: kursUsd(),
    mojeAi: mozeAi(req.konto),
    mojLimit: req.konto ? limitAi(req.konto) : null,
    aiSkonfigurowane: tryb === 'api' ? !!ai.klucz() : sub.zalogowany,
    kluczApi: !!ai.klucz(),
    zeZmiennejSrodowiskowej: !!process.env.ANTHROPIC_API_KEY,
    subskrypcja: sub,
    model: tryb === 'api' ? ai.MODEL : 'Claude (subskrypcja)'
  };
}
app.get('/api/ustawienia', async (req, res) => res.json(await statusAi(req)));
app.post('/api/ustawienia', tylkoAdmin, async (req, res) => {
  const b = req.body || {};
  if (b.dostepAi) {
    if (!DOSTEP_AI.includes(b.dostepAi)) return res.status(400).json({ blad: 'Nieznane ustawienie dostępu do AI.' });
    ai.zapiszUstawienie('dostepAi', b.dostepAi);
  }
  if ('kursUsd' in b) {
    const k = Number(String(b.kursUsd).replace(',', '.'));
    if (!(k > 0 && k < 100)) return res.status(400).json({ blad: 'Podaj kurs USD w złotych, np. 3,65.' });
    ai.zapiszUstawienie('kursUsd', k);
  }
  if (b.tryb) {
    if (!['api', 'subskrypcja'].includes(b.tryb)) return res.status(400).json({ blad: 'Nieznany tryb AI.' });
    ai.ustawTryb(b.tryb);
  }
  if ('apiKey' in b) {
    const k = String(b.apiKey || '').trim();
    if (k && !/^sk-ant-/.test(k)) return res.status(400).json({ blad: 'To nie wygląda na klucz API Anthropic (powinien zaczynać się od „sk-ant-”).' });
    ai.zapiszKlucz(k || null);
  }
  res.json({ ok: true, ...(await statusAi(req)) });
});
app.post('/api/ai/zaloguj', tylkoAdmin, (req, res) => {
  if (process.platform !== 'win32') return res.status(400).json({ blad: 'Na serwerze zaloguj Claude Code w konsoli kontenera: polecenie „claude”, potem /login (instrukcja w deploy/INSTRUKCJA.md).' });
  ai.zalogujSubskrypcje(); res.json({ ok: true });
});
app.post('/api/ai/polecenie', wymagaj(), (req, res) => {
  // tryb ręczny (claude.ai) – bez kosztu po naszej stronie, liczymy tylko użycia
  uzycieAi.zapisz({ login: req.konto.login, rola: req.konto.rola, tryb: 'reczny' });
  res.json({ polecenie: ai.polecenieReczne(czytaj('reguly.json', {}), (req.body || {}).tekst || '', zadanieZapytania()) });
});
// tryb ręczny: część „osprzet” z odpowiedzi wklejonej z claude.ai → pozycje doboru (bez wywołania AI)
app.post('/api/ai/osprzet-z-odpowiedzi', wymagaj(), (req, res) => {
  try { res.json(osprzetZOdpowiedzi((req.body || {}).osprzet)); }
  catch (e) { res.status(e.status || 500).json({ blad: e.message }); }
});
// Zużycie AI: administrator – wszystkie konta, pozostali – własne
app.get('/api/ai/uzycie', wymagaj(), (req, res) => {
  const p = uzycieAi.podsumowanie({ miesiac: String(req.query.miesiac || ''), login: req.konto.rola === 'admin' ? null : req.konto.login });
  const k = konta.listaKont({ rola: 'admin' });
  p.konta.forEach(x => { const a = k.find(y => y.login === x.login); x.nazwa = a ? a.nazwa : x.login; x.rolaNazwa = a ? a.rolaNazwa : '(konto usunięte)'; });
  res.json({ ...p, kursUsd: kursUsd() });
});

// Analiza zapytania klienta przez AI – puszki podłogowe i osprzęt w jednym wywołaniu
// (tekst + pliki PDF / JPG / PNG / DWG / DXF / EML / TXT; rysunki CAD zamieniane na zestawienie bloków)
app.post('/api/ai/analiza', wymagajAi, async (req, res) => {
  try {
    const b = req.body || {};
    const { pliki, cad } = aiOsprzet.przygotujPliki((b.pliki || []).slice(0, 10));
    const wynik = await ai.zapytaj({ tekst: String(b.tekst || '').slice(0, 50000), pliki }, zadanieZapytania(), trybAiDla(req.konto));
    zapiszZuzycie(req, wynik.zuzycie, { pliki: pliki.length });
    wynik.osprzet = osprzetZOdpowiedzi(await dokladnyDobor(wynik.osprzet, req));
    wynik.cad = cad;
    res.json(wynik);
  } catch (e) { bladAi(e, res); }
});

// Poprawka propozycji AI (uwaga #22): zapytanie + poprzednia odpowiedź + uwaga doradcy → poprawiony wynik
// i (opcjonalnie) ogólna wskazówka, która trafia do instrukcji AI przy kolejnych analizach
app.post('/api/ai/popraw', wymagajAi, async (req, res) => {
  try {
    const b = req.body || {};
    const poprawka = String(b.poprawka || '').trim().slice(0, 3000);
    if (poprawka.length < 3) throw Object.assign(new Error('Napisz, co AI ma poprawić.'), { status: 400 });
    const { pliki, cad } = aiOsprzet.przygotujPliki((b.pliki || []).slice(0, 10));
    const poprzedni = JSON.stringify(b.poprzedni || {}).slice(0, 60000);
    const tekst = `${String(b.tekst || '').slice(0, 50000)}

=== Twoja poprzednia odpowiedź (JSON) ===
${poprzedni}

=== Poprawka doradcy ===
${poprawka}`;
    const zadanie = zadanieZapytania();
    const wynik = await ai.zapytaj({ tekst, pliki }, { system: zadanie.system + aiOsprzet.POPRAWKA, schemat: aiOsprzet.SCHEMAT_POPRAWKI }, trybAiDla(req.konto));
    zapiszZuzycie(req, wynik.zuzycie, { pliki: pliki.length, rodzaj: 'poprawka' });
    wynik.zapamietano = wynik.wskazowka ? aiWskazowki.dodaj({ tekst: wynik.wskazowka, login: req.konto.login, poprawka }) : null;
    wynik.osprzet = osprzetZOdpowiedzi(await dokladnyDobor(wynik.osprzet, req));
    wynik.cad = cad;
    res.json(wynik);
  } catch (e) { bladAi(e, res); }
});
// wskazówki dla AI – przegląd i usuwanie (administrator)
app.get('/api/ai/wskazowki', tylkoAdmin, (req, res) => res.json(aiWskazowki.lista()));
app.delete('/api/ai/wskazowki/:id', tylkoAdmin, (req, res) => { aiWskazowki.usun(req.params.id); res.json({ ok: true }); });

function zapiszZuzycie(req, zuzycie, extra = {}) {
  if (!zuzycie) return;
  try { uzycieAi.zapisz({ login: req.konto.login, rola: req.konto.rola, ...zuzycie, ...extra }); }
  catch (e) { console.error('Zapis zużycia AI:', e.message); }
}

// Dokładny dobór (uwaga #21): pozycje „same mechanizmy”, „same pokrywy/plakietki”, nietypowe (ramki GK…) – AI wybiera
// konkretne symbole z cennika serii; pozycja zamienia się w pozycje z kodem (jedna na produkt)
const dokladnyDobor = (o, req) => aiOsprzet.dokladnyDobor(o, {
  trybAi: trybAiDla(req.konto),
  zuzycie: z => zapiszZuzycie(req, z, { rodzaj: 'dobor-dokladny', pomocnicze: true })
});

// prompt i schemat zapytania łączonego – z aktualnymi seriami, kolorami modułów i liniami ramek osprzętu
function zadanieZapytania() {
  const s = osprzetSlownik.slownik(), R = osprzetDobor.regulyOsprzetu();
  const serie = s ? (R.serie || []).filter(g => s.grupy[g]) : [];
  const koloryModulow = Object.fromEntries(serie.map(g => [g, osprzetDobor.koloryModulow(g, s.grupy[g], R)]));
  return { system: aiOsprzet.promptSystemowy(czytaj('reguly.json', {}), { serie, koloryModulow, linieRamek: R.linieRamek || {} }), schemat: aiOsprzet.SCHEMAT };
}

// część „osprzet” odpowiedzi AI → pozycje doboru: kod z cennika (dokładnie ten produkt) albo nazwa rozpoznawana przez reguły;
// seria wskazana przez klienta, z kodów produktów albo ta z największym pokryciem pozycji
function osprzetZOdpowiedzi(o) {
  const s = osprzetSlownik.slownik();
  const puste = { pozycje: [], serie: [], seria: null, kolor: null, liniaRamek: null, nierozpoznane: [], uwagi: (o && o.uwagi) || '' };
  if (!o || !Array.isArray(o.pozycje) || !o.pozycje.length || !s) return puste;
  const R = osprzetDobor.regulyOsprzetu(), fold = osprzetLista.fold;
  // symbol od klienta – także niepełny („cgz1c” → CGZ1C.01/11); nigdy nie zamieniany na inny produkt
  const kody = {};
  for (const p of o.pozycje) {
    const prod = p.kod ? osprzetDobor.kodZWpisu(String(p.kod).trim(), p.kolor || o.kolor) : null;
    if (prod) kody[prod.symbol] = prod;
    p._kod = prod ? prod.symbol : null;
  }
  const nierozpoznane = [];
  const pozycje = o.pozycje.filter(p => Number(p.ilosc) > 0).slice(0, 500).map(p => {
    const kod = p._kod;
    let nazwa = String(p.nazwa || '').trim();
    if (!kod && osprzetDobor.regulaDla(nazwa, R) === undefined) {
      const zCytatu = osprzetLista.normalizuj(`${nazwa} ${p.cytat || ''}`);
      if (zCytatu) nazwa = zCytatu; else nierozpoznane.push(`${nazwa} (${p.ilosc})`);
    }
    return {
      zrodlo: String(p.cytat || nazwa).slice(0, 300), nazwa: kod ? kody[kod].nazwa : nazwa, ilosc: Math.min(99999, Math.round(Number(p.ilosc))),
      kolor: p.kolor || o.kolor || '', ...(kod ? { kod } : {}), doSprawdzenia: p.pewnosc === 'do_sprawdzenia', uwagi: p.uwagi || ''
    };
  });
  const serie = osprzetDobor.serieZPokryciem(pozycje);
  const naSerie = x => x && serie.find(z => fold(x) === fold(z.seria) || fold(x).startsWith(fold(z.seria) + ' '));
  const zKodu = Object.values(kody).map(p => naSerie(p.grupa)).find(Boolean);
  const seria = (naSerie(o.seria) || zKodu || [...serie].sort((a, b) => b.pokryte - a.pokryte)[0] || {}).seria || null;
  const linie = ((R.linieRamek || {})[seria] || []).map(l => l.nazwa);
  const liniaRamek = (o.linia_ramek && linie.find(l => fold(l) === fold(o.linia_ramek))) || null;
  return { pozycje, serie, seria, serieZTekstu: o.seria, kolor: o.kolor || null, liniaRamek, nierozpoznane, uwagi: o.uwagi || '' };
}
function bladAi(e, res) {
  if (e instanceof Anthropic.AuthenticationError) return res.status(401).json({ blad: 'Nieprawidłowy klucz API Anthropic – sprawdź go w zakładce Dane.' });
  if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ blad: 'Przekroczono limit zapytań do AI – spróbuj za chwilę.' });
  if (e instanceof Anthropic.BadRequestError) return res.status(400).json({ blad: 'AI nie przyjęło materiałów: ' + e.message });
  if (e instanceof Anthropic.APIConnectionError) return res.status(502).json({ blad: 'Brak połączenia z API Anthropic – sprawdź internet.' });
  if (e instanceof Anthropic.APIError) return res.status(502).json({ blad: `Błąd API Anthropic (${e.status}): ${e.message}` });
  res.status(e.status || 500).json({ blad: e.message });
}

// ---------- Reguły doboru – plik wgrywany w panelu Dane (administrator) ----------
const produktyCennika = () => czytaj('produkty.json', { produkty: {} }).produkty;
const zBledami = fn => async (req, res) => {
  try { res.json(await fn(req, res)); }
  catch (e) { res.status(e.status || 500).json({ blad: e.message, bledy: e.bledy }); }
};
const bezR = ({ R, ...o }) => o;
app.get('/api/reguly/stan', tylkoAdmin, (req, res) => res.json(reguly.stan()));
app.get('/api/reguly/plik', tylkoAdmin, (req, res) => {
  const w = (czytaj('reguly.json', {})._wersja || 'obecne').replace(/[^\w.-]/g, '_');
  res.set('Content-Disposition', `attachment; filename="reguly-${w}.json"`).type('application/json').send(fs.readFileSync(reguly.PLIK));
});
app.post('/api/reguly/sprawdz', tylkoAdmin, zBledami(req => bezR(reguly.ocen(req.body.zAktualizacji ? reguly.tekstZAktualizacji() : req.body.tekst, produktyCennika()))));
app.post('/api/reguly', tylkoAdmin, zBledami(req => ({ ok: true, ...bezR(reguly.wgraj(req.body.tekst, produktyCennika(), req.konto)) })));
app.get('/api/reguly/kopie/:nazwa', tylkoAdmin, (req, res) => {
  try { res.download(reguly.bezpiecznaKopia(req.params.nazwa)); }
  catch (e) { res.status(e.status || 500).json({ blad: e.message }); }
});
app.post('/api/reguly/przywroc', tylkoAdmin, zBledami(req => { reguly.przywroc(req.body.nazwa, produktyCennika(), req.konto); return { ok: true }; }));
app.post('/api/reguly/aktualizacja', tylkoAdmin, zBledami(req => ({ ok: true, ...bezR(reguly.zastosujZAktualizacji(produktyCennika(), req.konto)) })));
app.delete('/api/reguly/aktualizacja', tylkoAdmin, (req, res) => { reguly.odrzucZAktualizacji(); res.json({ ok: true }); });
app.get('/api/reguly/aktualizacja/plik', tylkoAdmin, (req, res) => {
  try { res.set('Content-Disposition', 'attachment; filename="reguly-z-aktualizacji.json"').type('application/json').send(reguly.tekstZAktualizacji()); }
  catch (e) { res.status(e.status || 500).json({ blad: e.message }); }
});

// ---------- Uwagi testerów („Zgłoś uwagę”) ----------
// Zgłaszać może każdy (także gość) – limit na godzinę: 20 na konto, 15 dla gości z jednego adresu
// (za tunelem goście mogą mieć wspólny adres 127.0.0.1, dlatego zalogowani liczeni są osobno)
const ZGLOSZENIA = new Map();
app.post('/api/uwagi', obsluz(async req => {
  const klucz = req.konto ? 'konto:' + req.konto.login : 'ip:' + req.ip;
  const teraz = Date.now(), z = (ZGLOSZENIA.get(klucz) || []).filter(t => teraz - t < 60 * 60 * 1000);
  if (z.length >= (req.konto ? 20 : 15)) throw Object.assign(new Error('Wysłano już dużo uwag – spróbuj za godzinę.'), { status: 429 });
  const autor = req.konto ? { ...req.konto, nazwa: konta.nazwaKonta(req.konto) } : null;
  const u = uwagi.dodaj(req.body || {}, autor);
  ZGLOSZENIA.set(klucz, [...z, teraz]);
  const kto = autor ? `${autor.nazwa} (${autor.login})` : `gość${u.autor.email ? ' ' + u.autor.email : ''}`;
  konta.powiadomRole(['admin'], { typ: 'uwaga', tytul: `Nowa uwaga #${u.numer}: ${uwagi.TYPY[u.typ]}`, tresc: `${kto}: ${u.tekst.slice(0, 200)}` });
  // e-mail do administratora – tylko gdy poczta jest skonfigurowana (bez zapychania skrzynki testowej)
  if (poczta.statusPoczty().skonfigurowana) {
    const admin = konta.listaKont({ rola: 'admin' }).find(k => k.rola === 'admin');
    if (admin) {
      const { html, tekst } = poczta.szablon(`Nowa uwaga #${u.numer} – ${uwagi.TYPY[u.typ]}`, [`Od: ${kto}`, u.tekst], { url: `${adresAplikacji(req)}/?widok=uwagi`, tekst: 'Otwórz listę uwag' });
      poczta.wyslij({ do: admin.email, temat: `Uwaga #${u.numer} (${uwagi.TYPY[u.typ]}) – konfigurator puszek`, html, tekst }).catch(e => console.error('Mail o uwadze:', e.message));
    }
  }
  return { ok: true, numer: u.numer };
}));
app.get('/api/uwagi', tylkoAdmin, (req, res) => res.json(uwagi.lista()));
app.get('/api/uwagi/moje', wymagaj(), (req, res) => res.json(uwagi.moje(req.konto.login)));
app.get('/api/uwagi/eksport.md', tylkoAdmin, (req, res) => {
  res.type('text/markdown; charset=utf-8').send(uwagi.eksportMd(req.query.wszystkie !== '1'));
});
app.get('/api/uwagi/:id/zdjecie', tylkoAdmin, (req, res) => {
  const p = uwagi.sciezkaZdjecia(uwagi.znajdz(req.params.id));
  if (!p || !fs.existsSync(p)) return res.status(404).json({ blad: 'Brak zrzutu ekranu.' });
  res.sendFile(p);
});
app.post('/api/uwagi/:id', tylkoAdmin, obsluz(req => {
  const { uwaga, przed } = uwagi.zmien(req.params.id, req.body || {});
  // autor (zalogowany) dostaje powiadomienie o odpowiedzi albo zmianie statusu
  if (uwaga.autor.login && (uwaga.odpowiedz !== przed.odpowiedz || uwaga.status !== przed.status)) {
    konta.powiadom(uwaga.autor.login, {
      typ: 'uwaga', tytul: `Twoja uwaga #${uwaga.numer}: ${uwagi.STATUSY[uwaga.status]}`,
      tresc: uwaga.odpowiedz ? `Odpowiedź: ${uwaga.odpowiedz}` : `„${uwaga.tekst.slice(0, 120)}”`
    });
  }
  return uwaga;
}));
app.delete('/api/uwagi/:id', tylkoAdmin, obsluz(req => { uwagi.usun(req.params.id); return { ok: true }; }));

// ---------- Produkty ----------
app.get('/api/stan', async (req, res) => {
  try { res.json(await stan(String(req.query.symbol || ''))); }
  catch (e) { res.status(502).json({ blad: 'Nie udało się połączyć z monitorem stanów: ' + e.message }); }
});
// produkty podobne do brakującego na magazynie – tylko te, które są dostępne (stan sprawdzany na żywo)
app.get('/api/podobne', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || ''), potrzeba = Math.max(1, Number(req.query.potrzeba) || 1);
    const { produkt, kandydaci } = podobneProdukty.podobne(symbol, 8);
    if (!produkt) return res.json({ produkt: null, podobne: [] });
    const stany = await Promise.all(kandydaci.map(p => stan(p.symbol).catch(() => null)));
    const podobne = kandydaci.map((p, i) => ({ ...p, stan: stany[i] }))
      .filter(p => p.stan && p.stan.znaleziono && p.stan.ilosc > 0)
      .sort((a, b) => (b.stan.ilosc >= potrzeba) - (a.stan.ilosc >= potrzeba) || b.podobienstwo - a.podobienstwo)
      .slice(0, 5);
    res.json({ produkt, podobne, sprawdzono: kandydaci.length });
  } catch (e) { res.status(502).json({ blad: 'Nie udało się sprawdzić podobnych produktów: ' + e.message }); }
});
app.get('/api/produkt', async (req, res) => {
  const symbol = String(req.query.symbol || '');
  const p = czytaj('produkty.json', { produkty: {} }).produkty[symbol];
  try { res.json(await infoProduktu(symbol, p && p.link)); }
  catch (e) { res.status(502).json({ blad: e.message }); }
});

// ---------- Osprzęt elektroinstalacyjny (dobór z listy – logika z AI Takeoff) ----------
// wszystkie nazwy kolorów z cennika – do rozpoznawania koloru w liniach zapytania
let koloryCennika = null, koloryCzas = null;
function wszystkieKolory() {
  const s = osprzetSlownik.slownik();
  if (!s) return [];
  if (koloryCzas !== s.zbudowano) { koloryCennika = [...new Set(Object.values(s.grupy).flat().map(p => p.kolor).filter(Boolean))]; koloryCzas = s.zbudowano; }
  return koloryCennika;
}
const bladOsprzetu = fn => (req, res) => {
  try { res.json(fn(req)); } catch (e) { res.status(e.status || 500).json({ blad: e.message }); }
};
// lista z e-maila (bez AI) → pozycje + seria z treści + pokrycie w każdej serii
app.post('/api/osprzet/lista', bladOsprzetu(req => {
  const s = osprzetSlownik.slownik();
  if (!s) throw Object.assign(new Error('Brak słownika osprzętu – wgraj cennik w zakładce Dane.'), { status: 503 });
  const tekst = String((req.body || {}).tekst || '');
  if (tekst.trim().length < 3) throw Object.assign(new Error('Wklej listę pozycji, np. „Gniazdo – 12 szt”.'), { status: 400 });
  const lista = osprzetLista.parsuj(tekst, Object.keys(s.grupy), wszystkieKolory());
  // linie z kodem produktu („DR1/11 3szt”, „TGZ2MZP/142 – 3”) – dokładnie ten produkt z cennika
  const zKodem = [];
  for (const p of lista.pozycje) {
    // kod w dowolnym miejscu linii („Gniazdo 230 V cgz1c – 10”), także bez koloru; nie: IP44, RJ45, 16A, 230V, 2x…
    const slowa = String(p.zrodlo || '').split(/[\s,;()]+|[–—-]\s/).filter(w => /^[a-z]{1,8}\d[\w.\/-]*$/i.test(w) && !/^(ip\d+|rj ?\d+|kat\.?\d+|cat\d+|\d+[a-z]*)$/i.test(w));
    let prod = null;
    for (const w of slowa) { prod = osprzetDobor.kodZWpisu(w.replace(/[.,;]+$/, ''), p.kolor); if (prod) break; }
    if (prod) { p.kod = prod.symbol; p.nazwa = prod.nazwa; p.kolor = prod.kolor || ''; zKodem.push(prod); }
  }
  lista.nierozpoznane = lista.nierozpoznane.filter(l => !lista.pozycje.some(p => p.kod && p.zrodlo === l));
  // seria z treści (np. „Simon 55 GO” → Simon 55), z kodów produktów, a gdy brak – ta z największym pokryciem
  const serie = osprzetDobor.serieZPokryciem(lista.pozycje);
  const naSerie = g => g && serie.find(x => g === x.seria || g.startsWith(x.seria + ' '));
  const ileKodow = {};
  for (const p of zKodem) { const x = naSerie(p.grupa); if (x) ileKodow[x.seria] = (ileKodow[x.seria] || 0) + 1; }
  const zKodow = Object.entries(ileKodow).sort((a, b) => b[1] - a[1])[0];
  const bazowa = naSerie(lista.seria) || (zKodow && { seria: zKodow[0] });
  const seria = bazowa ? bazowa.seria : [...serie].sort((a, b) => b.pokryte - a.pokryte)[0]?.seria;
  return { ...lista, serie, seria, serieZTekstu: lista.seria };
}));
// zamiana serii: produkty wpisane kodem (np. DR1/11, SGZ1CM) → odpowiedniki w nowej serii, dobrane przez AI
// spośród produktów nowej serii w wybranym kolorze modułów i ramek (lista zawężona, żeby zapytanie było tanie)
app.post('/api/osprzet/zamienniki', wymagajAi, async (req, res) => {
  try {
    const wynik = await aiOsprzet.zamienniki(req.body || {}, trybAiDla(req.konto));
    if (wynik.zuzycie) {
      try { uzycieAi.zapisz({ login: req.konto.login, rola: req.konto.rola, ...wynik.zuzycie, pliki: 0, rodzaj: 'zamiana-serii' }); }
      catch (e) { console.error('Zapis zużycia AI:', e.message); }
    }
    res.json(wynik);
  } catch (e) { bladAi(e, res); }
});
// wyszukiwarka produktów w całym cenniku (pole „Dodaj produkt” i kod w wierszu) – po kodzie albo słowach nazwy
app.get('/api/osprzet/szukaj', bladOsprzetu(req => osprzetDobor.szukaj(String(req.query.q || '').slice(0, 100), {
  seria: String(req.query.seria || ''), kolor: String(req.query.kolor || ''), limit: Math.min(40, Number(req.query.limit) || 15)
})));
app.post('/api/osprzet/dobierz', bladOsprzetu(req => {
  const b = req.body || {};
  if (!Array.isArray(b.pozycje)) throw Object.assign(new Error('Brak pozycji.'), { status: 400 });
  return osprzetDobor.dobierz(b.pozycje.slice(0, 500), { seria: b.seria, kolor: b.kolor, liniaRamek: b.liniaRamek, kolorRamek: b.kolorRamek, ramki: typeof b.ramki === 'boolean' ? b.ramki : undefined });
}));
// podpowiedź dla opisu słownego („gniazdo podwójne czarne”) – produkt wg reguł doboru w serii i kolorze
app.post('/api/osprzet/podpowiedz', bladOsprzetu(req => {
  const s = osprzetSlownik.slownik(), b = req.body || {};
  const tekst = String(b.tekst || '').trim().slice(0, 200);
  if (!s || tekst.length < 3 || !b.seria) return { produkty: [] };
  const lista = osprzetLista.parsuj(`${tekst} – 1`, Object.keys(s.grupy), wszystkieKolory());
  const poz = lista.pozycje[0];
  if (!poz || lista.nierozpoznane.length) return { produkty: [] };
  // kolor z opisu po rdzeniu słowa: „czarne” → „czarny mat”, „białe” → „biały mat” (kolory modułów serii)
  const R = osprzetDobor.regulyOsprzetu(), fold = osprzetLista.fold, ft = fold(tekst);
  const koloryS = osprzetDobor.koloryModulow(b.seria, s.grupy[b.seria] || [], R);
  const kolorZOpisu = koloryS.find(k => fold(k) === fold(poz.kolor || '')) || koloryS
    .find(k => { const w1 = fold(k).split(/[\s,]+/)[0]; return w1.length >= 4 && ft.split(/\s+/).some(x => x.length >= 4 && x.slice(0, 4) === w1.slice(0, 4)); });
  const w = osprzetDobor.dobierz([{ ...poz, kolor: kolorZOpisu || b.kolor }], { seria: b.seria, kolor: b.kolor, ramki: false });
  return { typ: poz.nazwa, produkty: w.pozycje[0].skladniki.map(x => x.produkt).filter(Boolean) };
}));
app.get('/api/osprzet/serie', bladOsprzetu(() => {
  const s = osprzetSlownik.slownik(), R = osprzetDobor.regulyOsprzetu();
  return { cennik: s ? s.cennik : null, serie: (R.serie || []).filter(g => s && s.grupy[g]).map(g => ({ seria: g, kolory: osprzetDobor.koloryModulow(g, s.grupy[g], R) })) };
}));
app.get('/api/osprzet/produkty-serii', bladOsprzetu(req => osprzetDobor.produktySerii(String(req.query.seria || ''))));
app.get('/api/osprzet/produkty', bladOsprzetu(req => osprzetDobor.produktyPoSymbolach(String(req.query.symbole || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 1000))));

// ---------- Import danych (personel Kontakt-Simon) ----------
app.post('/api/import/cennik', tylkoAdmin, express.raw({ type: () => true, limit: '50mb' }), (req, res) => {
  try {
    const wynik = parseCennik(req.body);
    if (wynik.meta.liczba < 50) throw new Error(`Za mało produktów (${wynik.meta.liczba}) – to chyba nie jest cennik Kontakt-Simon.`);
    const stary = czytaj('produkty.json', null);
    if (stary) zapisz(`produkty-kopia-${Date.now()}.json`, stary);
    const nazwa = bezpiecznaNazwa(req.query.nazwa || 'cennik.xls');
    fs.mkdirSync(path.join(__dirname, 'dane', 'cenniki'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'dane', 'cenniki', `${Date.now()}_${nazwa}`), req.body);
    const nowe = Object.keys(wynik.produkty).filter(s => !stary || !stary.produkty[s]);
    const zmianyCen = stary ? Object.values(wynik.produkty).filter(p => stary.produkty[p.symbol] && stary.produkty[p.symbol].cena !== p.cena).length : 0;
    zapisz('produkty.json', wynik);
    // ten sam cennik → słownik osprzętu elektroinstalacyjnego (wszystkie serie)
    let osprzet = null;
    try { const s = osprzetSlownik.zbudujSlownik(req.body); osprzetSlownik.zapiszSlownik(s); osprzet = { pozycji: s.pozycji, grup: Object.keys(s.grupy).length }; }
    catch (e) { console.error('Słownik osprzętu:', e.message); }
    res.json({ ok: true, meta: wynik.meta, nowe: nowe.slice(0, 200), liczbaNowych: nowe.length, zmianyCen, osprzet });
  } catch (e) { res.status(400).json({ blad: e.message }); }
});
app.post('/api/import/katalog', tylkoAdmin, express.raw({ type: () => true, limit: '100mb' }), (req, res) => {
  if (!req.body || req.body.slice(0, 4).toString() !== '%PDF') return res.status(400).json({ blad: 'To nie jest plik PDF.' });
  const plik = `${Date.now()}_${bezpiecznaNazwa(req.query.nazwa || 'katalog.pdf')}`;
  fs.writeFileSync(path.join(KATALOGI, plik), req.body);
  const lista = czytaj('katalogi.json', []);
  lista.push({ seria: String(req.query.seria || 'inne'), nazwa: String(req.query.tytul || req.query.nazwa || plik), url: `/katalogi/${plik}`, dodano: new Date().toISOString() });
  zapisz('katalogi.json', lista);
  res.json({ ok: true, katalogi: lista });
});
app.delete('/api/import/katalog', tylkoAdmin, (req, res) => {
  const lista = czytaj('katalogi.json', []).filter(k => k.url !== req.query.url);
  zapisz('katalogi.json', lista);
  res.json({ ok: true, katalogi: lista });
});

// Edytowalna oferta Excel z formułą rabatu
app.post('/api/oferta.xlsx', async (req, res) => {
  try {
    const buf = await ofertaXlsx({ ...req.body, rabatMaks: czytaj('reguly.json', {}).rabatMaks });
    const nazwa = bezpiecznaNazwa(`oferta_${req.body.kod || req.body.projekt || 'puszki'}.xlsx`);
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nazwa}"` });
    res.send(Buffer.from(buf));
  } catch (e) { res.status(500).json({ blad: e.message }); }
});

app.listen(PORT, HOST, () => console.log(`Konfigurator puszek: http://localhost:${PORT}${ADRES ? ` · publicznie: ${ADRES}` : ''}${PRODUKCJA ? ` · tryb serwerowy, AI: ${dostepAi()}` : ''}`));
