// Konta użytkowników, sesje, zapisane wyceny, zapytania o rabat i powiadomienia (pliki JSON w data/)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = path.join(__dirname, '..', 'data');
const plik = n => path.join(DATA, n);
const czytaj = (n, dom) => { try { return JSON.parse(fs.readFileSync(plik(n), 'utf8')); } catch { return dom; } };
const zapisz = (n, obj) => fs.writeFileSync(plik(n), JSON.stringify(obj, null, 1));

// ---------- Słowniki ----------
const ROLE = {
  admin: 'Administrator',
  pracownik: 'Pracownik Kontakt-Simon',
  hurtownia: 'Hurtownia',
  instalator: 'Instalator / biuro projektowe',
  klient: 'Klient indywidualny'
};
const STANOWISKA_KS = [
  'Doradca techniczno-handlowy',
  'Doradca techniczno-handlowy ds. systemów (inteligentny dom)',
  'Doradca Biura Obsługi Projektów',
  'Przedstawiciel Handlowy'
];
const RODZAJE_INSTALATORA = ['instalator', 'biuro projektowe'];
// kto może pytać kogo o rabat
const ADRESACI = { klient: ['hurtownia', 'instalator'], instalator: ['hurtownia'], hurtownia: ['pracownik'] };

const personel = k => k && ['admin', 'pracownik'].includes(k.rola) && k.status === 'aktywne';
function blad(tekst, status = 400) { const e = new Error(tekst); e.status = status; return e; }
const tekst = (v, max = 200) => String(v || '').trim().slice(0, max);

// ---------- Hasła ----------
function hashuj(haslo) {
  const sol = crypto.randomBytes(16).toString('hex');
  return `${sol}:${crypto.scryptSync(haslo, sol, 64).toString('hex')}`;
}
function sprawdzHaslo(haslo, zapis) {
  const [sol, hash] = String(zapis).split(':');
  const a = Buffer.from(hash, 'hex'), b = crypto.scryptSync(haslo, sol, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- Konta ----------
// Identyfikatorem konta jest e-mail (małe litery), zapisany jako `login`
const konta = () => czytaj('konta.json', {});
const zapiszKonta = k => zapisz('konta.json', k);
const normEmail = e => String(e || '').trim().toLowerCase();

// Nazwa do wyświetlania: firma/hurtownia albo imię
function nazwaKonta(k) {
  if (!k) return '—';
  if (k.rola === 'hurtownia') return `${k.firma}${k.oddzial ? ' – ' + k.oddzial : ''}`;
  if (k.rola === 'instalator') {
    if (!k.jdg) return k.firma;
    return k.firma && k.firma !== k.imie ? `${k.firma} (${k.imie})` : `${k.imie || k.login} (JDG)`;
  }
  if (k.rola === 'klient') return `${k.imie || k.login}${k.miasto ? ' – ' + k.miasto : ''}`;
  return `${k.imie || k.login}`;
}

const publiczne = k => k && ({
  login: k.login, email: k.login, rola: k.rola, rolaNazwa: ROLE[k.rola], status: k.status, nazwa: nazwaKonta(k),
  imie: k.imie || '', stanowisko: k.stanowisko || '', firma: k.firma || '', oddzial: k.oddzial || '',
  rodzajFirmy: k.rodzajFirmy || null, jdg: !!k.jdg, telefon: k.telefon || '',
  miasto: k.miasto || '', adres: k.adres || '', kodPocztowy: k.kodPocztowy || '',
  opiekun: k.opiekun || null, hurtownie: k.hurtownie || [], rabat: k.rabat || 0, utworzono: k.utworzono,
  emailPotwierdzony: k.emailPotwierdzony !== false, region: k.region || null,
  ai: !!k.ai, limitAi: k.limitAi || null
});

// Publiczne listy do formularza rejestracji (bez adresów e-mail w nazwach)
function listaPracownikow() {
  return Object.values(konta()).filter(k => k.rola === 'pracownik' && k.status === 'aktywne')
    .map(k => ({ id: k.login, nazwa: k.imie || k.login, opis: [k.stanowisko, k.region ? `region ${k.region}` : null].filter(Boolean).join(', '), stanowisko: k.stanowisko || '', region: k.region || null }));
}
// Regiony przedstawicieli (reguly.json → regiony): „01”…„12”
const regionPoprawny = r => { const x = String(r || ''); return !x.startsWith('_') && !!(czytaj('reguly.json', {}).regiony || {})[x]; };
function listaHurtowni() {
  return Object.values(konta()).filter(k => k.rola === 'hurtownia' && k.status === 'aktywne')
    .map(k => ({ id: k.login, nazwa: nazwaKonta(k), opis: '' }));
}

// opcje.bezMaila – poczta nie jest skonfigurowana: zamiast linku w mailu każde nowe konto akceptuje administrator
function rejestruj(d, opcje = {}) {
  const k = konta();
  const pierwsze = Object.keys(k).length === 0;
  const email = normEmail(d.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw blad('Podaj poprawny adres e-mail.');
  if (k[email]) throw blad('Konto z tym adresem e-mail już istnieje.');
  if (String(d.haslo || '').length < 8) throw blad('Hasło musi mieć co najmniej 8 znaków.');
  const typ = pierwsze ? 'admin' : d.typ;
  if (!pierwsze && !['pracownik', 'hurtownia', 'instalator', 'klient'].includes(typ)) throw blad('Wybierz rodzaj konta.');

  const konto = { login: email, haslo: hashuj(d.haslo), rola: typ, status: 'aktywne', rabat: 0, utworzono: new Date().toISOString(), telefon: tekst(d.telefon, 30) };
  const wymagaj = (pole, opis) => { const v = tekst(d[pole]); if (!v) throw blad(`Uzupełnij pole: ${opis}.`); return v; };

  if (typ === 'admin') {
    konto.imie = tekst(d.imie); konto.firma = tekst(d.firma) || 'Kontakt-Simon S.A.';
  } else if (typ === 'pracownik') {
    konto.imie = wymagaj('imie', 'imię i nazwisko');
    if (!STANOWISKA_KS.includes(d.stanowisko)) throw blad('Wybierz stanowisko w Kontakt-Simon.');
    konto.stanowisko = d.stanowisko; konto.firma = 'Kontakt-Simon S.A.';
    konto.status = 'oczekuje';
    if (regionPoprawny(d.region)) konto.region = String(d.region); // przedstawiciel regionalny
  } else if (typ === 'hurtownia') {
    konto.firma = wymagaj('firma', 'nazwa hurtowni');
    konto.oddzial = wymagaj('oddzial', 'oddział');
    konto.imie = wymagaj('imie', 'imię i nazwisko');
    konto.stanowisko = wymagaj('stanowisko', 'stanowisko');
    const op = k[normEmail(d.opiekun)];
    if (!op || op.rola !== 'pracownik' || op.status !== 'aktywne') throw blad('Wybierz opiekuna z Kontakt-Simon.');
    konto.opiekun = op.login;
    konto.status = 'oczekuje'; // aktywuje opiekun
  } else if (typ === 'instalator') {
    if (!RODZAJE_INSTALATORA.includes(d.rodzajFirmy)) throw blad('Wybierz: instalator czy biuro projektowe.');
    konto.rodzajFirmy = d.rodzajFirmy;
    konto.jdg = !!d.jdg;
    konto.imie = wymagaj('imie', 'imię i nazwisko');
    konto.firma = konto.jdg ? (tekst(d.firma) || konto.imie) : wymagaj('firma', 'nazwa firmy');
    konto.stanowisko = konto.jdg ? 'Właściciel (jednoosobowa działalność)' : wymagaj('stanowisko', 'stanowisko w firmie');
    const hurtownie = [...new Set((Array.isArray(d.hurtownie) ? d.hurtownie : [d.hurtownie]).map(normEmail).filter(Boolean))];
    if (!hurtownie.length) throw blad('Wybierz co najmniej jedną hurtownię.');
    for (const h of hurtownie) if (!k[h] || k[h].rola !== 'hurtownia' || k[h].status !== 'aktywne') throw blad('Wybrana hurtownia nie istnieje.');
    konto.hurtownie = hurtownie.map(h => ({ login: h, status: 'oczekuje', rabat: 0 }));
    konto.miasto = tekst(d.miasto);
  } else if (typ === 'klient') {
    konto.miasto = wymagaj('miasto', 'miasto inwestycji');
    konto.adres = tekst(d.adres); konto.kodPocztowy = tekst(d.kodPocztowy, 10); konto.imie = tekst(d.imie);
  }

  // region przedstawiciela wynikający z miasta (klient, instalator, hurtownia) – podpowiedź z formularza
  if (typ !== 'pracownik' && typ !== 'admin' && regionPoprawny(d.region)) konto.region = String(d.region);

  // Adres e-mail trzeba potwierdzić linkiem z wiadomości (poza pierwszym kontem – administratorem).
  // Bez poczty: konto od razu czeka na akceptację administratora (hurtownię może też zaakceptować opiekun).
  let token = null;
  if (pierwsze) konto.emailPotwierdzony = true;
  else if (opcje.bezMaila) { konto.emailPotwierdzony = true; konto.weryfikacja = 'administrator'; konto.status = 'oczekuje'; }
  else { konto.emailPotwierdzony = false; token = ustawToken(konto); }

  k[email] = konto;
  zapiszKonta(k);
  if (pierwsze || opcje.bezMaila) powiadomPoPotwierdzeniu(konto);
  return { konto: publiczne(konto), pierwsze, token, akceptacja: !pierwsze && !!opcje.bezMaila };
}

// ---------- Potwierdzanie adresu e-mail ----------
const hashTokenu = t => crypto.createHash('sha256').update(String(t)).digest('hex');
function ustawToken(konto) {
  const token = crypto.randomBytes(32).toString('hex');
  konto.tokenHash = hashTokenu(token);
  konto.tokenWygasa = Date.now() + 1000 * 60 * 60 * 48; // 48 godzin
  konto.tokenWyslano = Date.now();
  return token;
}

// Powiadomienia wysyłane dopiero po potwierdzeniu adresu (prośby o akceptację, nowa współpraca)
function powiadomPoPotwierdzeniu(konto) {
  const kto = `${nazwaKonta(konto)} (${konto.login})`;
  if (konto.rola === 'pracownik') powiadomRole(['admin'], { typ: 'akceptacja', tytul: 'Nowe konto pracownika do akceptacji', tresc: `${kto}, ${konto.stanowisko}.`, login: konto.login });
  if (konto.rola === 'hurtownia') {
    const p = { typ: 'akceptacja', tytul: 'Hurtownia prosi o przypisanie do Ciebie', tresc: `${kto} – ${konto.imie}, ${konto.stanowisko}. Zaakceptuj konto w panelu „Moje hurtownie”.`, login: konto.login };
    powiadom(konto.opiekun, p);
    powiadomRole(['admin'], { ...p, tytul: 'Nowe konto hurtowni' });
  }
  if (konto.rola === 'instalator') for (const h of konto.hurtownie || []) powiadom(h.login, { typ: 'akceptacja', tytul: 'Instalator/projektant przypisał się do Twojej hurtowni', tresc: `${kto} – ${konto.imie}, ${konto.stanowisko}. Potwierdź współpracę w panelu „Moi instalatorzy”.`, login: konto.login });
  // konta akceptowane przez administratora (tryb bez poczty)
  if (konto.weryfikacja === 'administrator' && ['instalator', 'klient'].includes(konto.rola)) {
    powiadomRole(['admin'], { typ: 'akceptacja', tytul: `Nowe konto do akceptacji: ${ROLE[konto.rola]}`, tresc: `${kto}${konto.miasto ? ', ' + konto.miasto : ''}.`, login: konto.login });
  }
}

function potwierdzEmail(token) {
  const k = konta(), h = hashTokenu(token);
  const x = Object.values(k).find(a => a.tokenHash && a.tokenHash === h);
  if (!x) throw blad('Link potwierdzający jest nieprawidłowy albo został już użyty.', 404);
  if (x.tokenWygasa < Date.now()) throw blad('Link potwierdzający wygasł – wyślij nowy z ekranu logowania.', 410);
  x.emailPotwierdzony = true;
  delete x.tokenHash; delete x.tokenWygasa; delete x.tokenWyslano;
  zapiszKonta(k);
  powiadomPoPotwierdzeniu(x);
  return publiczne(x);
}

// Nowy link potwierdzający (maks. raz na minutę); dla nieistniejących/potwierdzonych kont zwraca null bez błędu
function nowyTokenPotwierdzenia(email) {
  const k = konta(), x = k[normEmail(email)];
  if (!x || x.emailPotwierdzony !== false) return null;
  if (x.tokenWyslano && Date.now() - x.tokenWyslano < 60 * 1000) throw blad('Link został wysłany przed chwilą – odczekaj minutę.', 429);
  const token = ustawToken(x);
  zapiszKonta(k);
  return { token, konto: publiczne(x) };
}

const KOMUNIKAT_OCZEKUJE = rola => rola === 'hurtownia'
  ? 'Konto czeka na akceptację opiekuna z Kontakt-Simon lub administratora. Spróbuj zalogować się później.'
  : 'Konto czeka na akceptację administratora. Spróbuj zalogować się później.';

function zaloguj(email, haslo, opcje = {}) {
  const k = konta()[normEmail(email)];
  if (!k || !sprawdzHaslo(String(haslo || ''), k.haslo)) throw blad('Nieprawidłowy e-mail lub hasło.', 401);
  // konto założone, gdy poczta działała, a link nie dotarł – bez poczty akceptuje je administrator
  if (k.emailPotwierdzony === false && opcje.bezMaila) throw blad(KOMUNIKAT_OCZEKUJE('klient'), 403);
  if (k.emailPotwierdzony === false) throw Object.assign(blad('Potwierdź adres e-mail – kliknij link z wiadomości, którą wysłaliśmy przy rejestracji.', 403), { kod: 'niepotwierdzony' });
  if (k.status === 'oczekuje') throw blad(KOMUNIKAT_OCZEKUJE(k.rola), 403);
  if (k.status === 'zablokowane') throw blad('Konto jest zablokowane – skontaktuj się z administratorem.', 403);
  const token = crypto.randomBytes(32).toString('hex');
  const s = czytaj('sesje.json', {});
  s[token] = { login: k.login, wygasa: Date.now() + 1000 * 60 * 60 * 24 * 14 };
  for (const [t, v] of Object.entries(s)) if (v.wygasa < Date.now()) delete s[t];
  zapisz('sesje.json', s);
  return { token, konto: publiczne(k) };
}
function wyloguj(token) { const s = czytaj('sesje.json', {}); delete s[token]; zapisz('sesje.json', s); }
function kontoZSesji(token) {
  if (!token) return null;
  const s = czytaj('sesje.json', {})[token];
  if (!s || s.wygasa < Date.now()) return null;
  const k = konta()[s.login];
  return k && k.status === 'aktywne' ? k : null;
}

// Lista kont widoczna dla użytkownika: admin – wszystkie; pracownik – jego hurtownie; hurtownia – jej instalatorzy
function listaKont(kto) {
  const all = Object.values(konta());
  if (kto.rola === 'admin') return all.map(publiczne);
  if (kto.rola === 'pracownik') return all.filter(k => k.rola === 'hurtownia' && k.opiekun === kto.login).map(publiczne);
  if (kto.rola === 'hurtownia') return all.filter(k => k.rola === 'instalator' && (k.hurtownie || []).some(h => h.login === kto.login))
    .map(k => ({ ...publiczne(k), powiazanie: k.hurtownie.find(h => h.login === kto.login) }));
  return [];
}

// Zmiany kont
function zmienKonto(kto, login, zmiany) {
  const k = konta(), x = k[normEmail(login)];
  if (!x) throw blad('Nie ma takiego konta.', 404);
  const admin = kto.rola === 'admin';

  // Hurtownia: potwierdza współpracę z instalatorem i ustala mu rabat standardowy
  if (kto.rola === 'hurtownia') {
    const pow = x.rola === 'instalator' && (x.hurtownie || []).find(h => h.login === kto.login);
    if (!pow) throw blad('To konto nie jest przypisane do Twojej hurtowni.', 403);
    if ('powiazanie' in zmiany) {
      if (!['aktywne', 'odrzucone'].includes(zmiany.powiazanie)) throw blad('Nieznany status.');
      pow.status = zmiany.powiazanie;
      powiadom(x.login, { typ: 'info', tytul: zmiany.powiazanie === 'aktywne' ? 'Hurtownia potwierdziła współpracę' : 'Hurtownia odrzuciła współpracę', tresc: nazwaKonta(kto) });
    }
    if ('rabat' in zmiany) pow.rabat = sprawdzRabat(zmiany.rabat);
    zapiszKonta(k);
    return publiczne(x);
  }

  // Pracownik: akceptuje swoje hurtownie i ustala im rabat standardowy
  if (!admin) {
    if (kto.rola !== 'pracownik' || x.rola !== 'hurtownia' || x.opiekun !== kto.login) throw blad('Brak uprawnień.', 403);
    if (Object.keys(zmiany).some(z => !['status', 'rabat'].includes(z))) throw blad('Brak uprawnień.', 403);
    if ('status' in zmiany && !['aktywne', 'zablokowane'].includes(zmiany.status)) throw blad('Brak uprawnień.', 403);
  }

  if ('status' in zmiany) {
    if (!['aktywne', 'oczekuje', 'zablokowane'].includes(zmiany.status)) throw blad('Nieznany status.');
    if (x.login === kto.login && zmiany.status !== 'aktywne') throw blad('Nie możesz zablokować własnego konta.');
    const bylo = x.status; x.status = zmiany.status;
    // akceptacja przez administratora zastępuje potwierdzenie adresu e-mail
    if (admin && x.status === 'aktywne' && x.emailPotwierdzony === false) {
      x.emailPotwierdzony = true;
      delete x.tokenHash; delete x.tokenWygasa; delete x.tokenWyslano;
    }
    if (bylo === 'oczekuje' && x.status === 'aktywne') powiadom(x.login, { typ: 'info', tytul: 'Konto zaakceptowane', tresc: `${nazwaKonta(kto)} zaakceptował(a) Twoje konto – możesz się zalogować.` });
  }
  if ('rola' in zmiany) {
    if (!ROLE[zmiany.rola]) throw blad('Nieznana rola.');
    if (zmiany.rola === 'admin' && x.rola !== 'admin') throw blad('W systemie może być tylko jedno konto administratora.');
    if (x.rola === 'admin' && zmiany.rola !== 'admin') throw blad('Nie można odebrać roli jedynemu administratorowi.');
    x.rola = zmiany.rola;
  }
  if ('opiekun' in zmiany) {
    const op = zmiany.opiekun ? k[normEmail(zmiany.opiekun)] : null;
    if (zmiany.opiekun && (!op || op.rola !== 'pracownik')) throw blad('Opiekunem może być tylko pracownik Kontakt-Simon.');
    x.opiekun = op ? op.login : null;
    if (op) powiadom(op.login, { typ: 'info', tytul: 'Przypisano Ci hurtownię', tresc: `${nazwaKonta(x)} (${x.login}) – przypisanie przez administratora.` });
  }
  if ('rabat' in zmiany) x.rabat = sprawdzRabat(zmiany.rabat);
  if ('stanowisko' in zmiany && admin) x.stanowisko = tekst(zmiany.stanowisko);
  if ('region' in zmiany && admin) {
    if (zmiany.region && !regionPoprawny(zmiany.region)) throw blad('Nieznany region.');
    if (zmiany.region) x.region = String(zmiany.region); else delete x.region;
  }
  // dostęp do analizy AI (przez klucz API) i miesięczny limit analiz – ustawia administrator
  if ('ai' in zmiany && admin) {
    const wlacz = zmiany.ai === true || zmiany.ai === 'true';
    if (wlacz !== !!x.ai) powiadom(x.login, { typ: 'info', tytul: wlacz ? 'Włączono Ci analizę AI' : 'Wyłączono Ci analizę AI', tresc: wlacz ? 'Możesz wklejać zapytania klientów (tekst, PDF, zdjęcia) – AI dobierze puszki. Przycisk „Analizuj z AI” jest na stronie startowej.' : 'Nadal możesz korzystać z trybu ręcznego (claude.ai) i „Dobierz bez AI”.' });
    x.ai = wlacz;
  }
  if ('limitAi' in zmiany && admin) {
    const l = zmiany.limitAi === '' || zmiany.limitAi == null ? null : Math.floor(Number(zmiany.limitAi));
    if (l !== null && !(l >= 1 && l <= 100000)) throw blad('Limit analiz: liczba od 1 albo puste (bez limitu).');
    if (l === null) delete x.limitAi; else x.limitAi = l;
  }
  // administrator może ręcznie potwierdzić adres (np. gdy mail nie dotarł)
  if (zmiany.emailPotwierdzony === true && admin && x.emailPotwierdzony === false) {
    x.emailPotwierdzony = true; delete x.tokenHash; delete x.tokenWygasa; delete x.tokenWyslano;
    powiadomPoPotwierdzeniu(x);
  }
  if ('haslo' in zmiany && admin) {
    if (String(zmiany.haslo).length < 8) throw blad('Hasło musi mieć co najmniej 8 znaków.');
    x.haslo = hashuj(zmiany.haslo);
  }
  zapiszKonta(k);
  return publiczne(x);
}

// Instalator dopisuje kolejną hurtownię
function dodajHurtownie(kto, hurtownia) {
  const k = konta(), x = k[kto.login], h = k[normEmail(hurtownia)];
  if (x.rola !== 'instalator') throw blad('Tylko instalatorzy i biura projektowe przypisują się do hurtowni.', 403);
  if (!h || h.rola !== 'hurtownia' || h.status !== 'aktywne') throw blad('Nie ma takiej hurtowni.');
  x.hurtownie = x.hurtownie || [];
  if (x.hurtownie.some(p => p.login === h.login)) throw blad('Ta hurtownia jest już przypisana.');
  x.hurtownie.push({ login: h.login, status: 'oczekuje', rabat: 0 });
  zapiszKonta(k);
  powiadom(h.login, { typ: 'akceptacja', tytul: 'Instalator/projektant przypisał się do Twojej hurtowni', tresc: `${nazwaKonta(x)} (${x.login}) – ${x.imie}, ${x.stanowisko}.`, login: x.login });
  return publiczne(x);
}

// Maksymalny rabat (reguly.json → rabatMaks, domyślnie 45%)
const rabatMaks = () => { const m = Number(czytaj('reguly.json', {}).rabatMaks); return m >= 0 && m <= 100 ? m : 45; };
function sprawdzRabat(v) {
  const r = Number(v), maks = rabatMaks();
  if (!(r >= 0 && r <= maks)) throw blad(`Rabat musi być w zakresie 0–${maks}%.`);
  return r;
}

function usunKonto(kto, login) {
  login = normEmail(login);
  if (login === kto.login) throw blad('Nie możesz usunąć własnego konta.');
  const k = konta();
  if (!k[login]) throw blad('Nie ma takiego konta.', 404);
  delete k[login];
  for (const x of Object.values(k)) {
    if (x.opiekun === login) x.opiekun = null;
    if (x.hurtownie) x.hurtownie = x.hurtownie.filter(h => h.login !== login);
  }
  zapiszKonta(k);
}

// ---------- Powiadomienia ----------
function powiadom(login, p) {
  if (!login) return;
  const all = czytaj('powiadomienia.json', []);
  all.push({ id: crypto.randomBytes(6).toString('hex'), do: login, data: new Date().toISOString(), przeczytane: false, ...p });
  zapisz('powiadomienia.json', all.slice(-3000));
}
function powiadomRole(role, p) { for (const k of Object.values(konta())) if (role.includes(k.rola) && k.status === 'aktywne') powiadom(k.login, p); }
function powiadomienia(login) { return czytaj('powiadomienia.json', []).filter(p => p.do === login).reverse().slice(0, 100); }
function oznaczPrzeczytane(login) {
  const all = czytaj('powiadomienia.json', []);
  all.forEach(p => { if (p.do === login) p.przeczytane = true; });
  zapisz('powiadomienia.json', all);
}

// ---------- Wyceny ----------
const ALFABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function nowyKod(istniejace, prefiks = 'KS') {
  let kod;
  do { kod = prefiks + '-' + Array.from(crypto.randomBytes(8), b => ALFABET[b % ALFABET.length]).join('').replace(/(.{4})/, '$1-'); } while (istniejace[kod]);
  return kod;
}
const wyceny = () => czytaj('wyceny.json', {});
const mozeEdytowac = (kto, w) => kto.rola === 'admin' || w.wlasciciel === kto.login;

function zapiszWycene(kto, { kod, oferta, cennik }) {
  const all = wyceny();
  const teraz = new Date().toISOString();
  let w = kod && all[kod];
  if (w && !mozeEdytowac(kto, w)) throw blad('Nie możesz zmieniać tej wyceny – zapisz ją jako nową.', 403);
  if (!w) {
    kod = nowyKod(all);
    w = { kod, wlasciciel: kto.login, utworzono: teraz, historia: [{ data: teraz, kto: kto.login, co: 'Utworzono wycenę' }], zapytania: [] };
  } else w.historia.push({ data: teraz, kto: kto.login, co: 'Zaktualizowano wycenę' });
  w.projekt = tekst(oferta.projekt);
  w.klient = tekst(oferta.klient);
  w.zestawy = Array.isArray(oferta.zestawy) ? oferta.zestawy : [];
  w.netto = w.zestawy.reduce((a, z) => a + (Number(z.netto) || 0) * (Number(z.liczba) || 1), 0);
  w.rabat = Math.max(0, Math.min(rabatMaks(), Number(oferta.rabat) || 0));
  w.rabatZapytanie = oferta.rabatZapytanie || null; // id zapytania, z którego pochodzi zastosowany rabat
  w.cennik = cennik || '';
  w.zmieniono = teraz;
  all[w.kod] = w;
  zapisz('wyceny.json', all);
  return w;
}

// Zastosowany rabat jest „zatwierdzony”, jeśli pochodzi z przyznanego zapytania albo z rabatu standardowego
// (hurtownia – od Kontakt-Simon; instalator – od hurtowni) i ma tę samą wartość
function zatwierdzenie(w) {
  const k = konta(), wl = k[w.wlasciciel];
  // wycena administratora lub pracownika Kontakt-Simon – rabat zawsze zatwierdzony przez Kontakt-Simon
  if (wl && ['admin', 'pracownik'].includes(wl.rola) && w.rabat > 0) {
    return { rabat: w.rabat, przez: 'Kontakt-Simon', rolaPrzez: 'pracownik', osoba: [wl.imie, wl.rola === 'admin' ? null : wl.stanowisko].filter(Boolean).join(', ') || null, rodzaj: 'personel' };
  }
  if (w.rabatZapytanie === 'standard' && wl && wl.rola === 'hurtownia' && Number(wl.rabat) === Number(w.rabat) && w.rabat > 0) {
    const op = k[wl.opiekun];
    return { rabat: w.rabat, przez: 'Kontakt-Simon', rolaPrzez: 'pracownik', osoba: op ? `${op.imie}, ${op.stanowisko}` : null, rodzaj: 'standardowy' };
  }
  if (String(w.rabatZapytanie || '').startsWith('standard:') && wl && wl.rola === 'instalator') {
    const h = w.rabatZapytanie.slice(9), pow = (wl.hurtownie || []).find(p => p.login === h && p.status === 'aktywne');
    if (pow && Number(pow.rabat) === Number(w.rabat) && w.rabat > 0) return { rabat: w.rabat, przez: nazwaKonta(k[h]), rolaPrzez: 'hurtownia', rodzaj: 'standardowy' };
  }
  const z = (w.zapytania || []).find(q => q.id === w.rabatZapytanie && q.status === 'przyznany');
  if (!z || Number(z.rabat) !== Number(w.rabat)) return null;
  return { rabat: z.rabat, przez: z.doNazwa, rolaPrzez: z.doRola, osoba: z.odpowiedzialOsoba || null, data: z.odpowiedzData, zapytanie: z.id };
}

function widokWyceny(kto, w) {
  const k = konta();
  const wl = k[w.wlasciciel];
  return {
    ...w,
    wlascicielNazwa: nazwaKonta(wl), wlascicielRola: wl ? wl.rola : null,
    zatwierdzenie: zatwierdzenie(w),
    mozeEdytowac: mozeEdytowac(kto, w),
    // adresat widzi tylko zapytania skierowane do niego
    zapytania: (w.zapytania || []).filter(z => mozeEdytowac(kto, w) || z.do === kto.login || kto.rola === 'admin')
  };
}

function pobierzWycene(kto, kod) {
  const w = wyceny()[String(kod || '').trim().toUpperCase()];
  if (!w) throw blad('Nie znaleziono wyceny o tym kodzie.', 404);
  return widokWyceny(kto, w);
}

function podsumowanie(w, k) {
  const wl = k[w.wlasciciel];
  return {
    kod: w.kod, projekt: w.projekt, klient: w.klient, wlasciciel: w.wlasciciel, wlascicielNazwa: nazwaKonta(wl), wlascicielRola: wl ? wl.rola : null,
    netto: w.netto, zestawy: (w.zestawy || []).length, zmieniono: w.zmieniono, rabat: w.rabat || 0, zatwierdzenie: zatwierdzenie(w),
    zapytania: (w.zapytania || []).map(z => ({ id: z.id, do: z.do, doNazwa: z.doNazwa, status: z.status, rabat: z.rabat }))
  };
}

function listaWycen(kto, zakres) {
  const all = Object.values(wyceny()), k = konta();
  const lista = zakres === 'wszystkie' && kto.rola === 'admin' ? all : all.filter(w => w.wlasciciel === kto.login);
  return lista.sort((a, b) => b.zmieniono.localeCompare(a.zmieniono)).map(w => podsumowanie(w, k));
}

function usunWycene(kto, kod) {
  const all = wyceny(), w = all[kod];
  if (!w) throw blad('Nie znaleziono wyceny.', 404);
  if (!mozeEdytowac(kto, w)) throw blad('Brak uprawnień.', 403);
  delete all[kod];
  zapisz('wyceny.json', all);
}

// ---------- Zapytania o rabat ----------
// Adresaci, do których zalogowany może wysłać zapytanie
function adresaci(kto) {
  const role = ADRESACI[kto.rola] || [];
  const all = Object.values(konta()).filter(k => role.includes(k.rola) && k.status === 'aktywne' && k.login !== kto.login);
  return all.map(k => {
    let pow = null;
    if (kto.rola === 'instalator') pow = (kto.hurtownie || []).find(h => h.login === k.login) || null;
    return {
      id: k.login, nazwa: nazwaKonta(k), rola: k.rola, rolaNazwa: ROLE[k.rola],
      opis: k.rola === 'pracownik' ? k.stanowisko : (k.rola === 'instalator' ? `${k.rodzajFirmy || ''}${k.miasto ? ', ' + k.miasto : ''}` : ''),
      polecany: (kto.rola === 'hurtownia' && kto.opiekun === k.login) || (pow && pow.status === 'aktywne'),
      powiazanie: pow ? pow.status : null
    };
  }).sort((a, b) => (b.polecany - a.polecany) || a.nazwa.localeCompare(b.nazwa));
}

function wyslijZapytanie(kto, kod, { do: doKogo, wiadomosc, rabatProponowany }) {
  const all = wyceny(), w = all[kod], k = konta();
  if (!w) throw blad('Nie znaleziono wyceny.', 404);
  if (w.wlasciciel !== kto.login) throw blad('Możesz pytać o rabat tylko do własnej wyceny.', 403);
  const dozwolone = ADRESACI[kto.rola] || [];
  const lista = [...new Set((Array.isArray(doKogo) ? doKogo : [doKogo]).map(normEmail).filter(Boolean))];
  if (!lista.length) throw blad('Wybierz co najmniej jednego adresata.');
  const rp = rabatProponowany === '' || rabatProponowany == null ? null : sprawdzRabat(rabatProponowany);
  const teraz = new Date().toISOString();
  const nowe = [];
  for (const login of lista) {
    const a = k[login];
    if (!a || a.status !== 'aktywne' || !dozwolone.includes(a.rola)) throw blad(`Nie możesz wysłać zapytania do: ${login}.`, 403);
    const z = {
      id: crypto.randomBytes(5).toString('hex'), od: kto.login, odNazwa: nazwaKonta(k[kto.login]), do: login, doNazwa: nazwaKonta(a), doRola: a.rola,
      data: teraz, wiadomosc: tekst(wiadomosc, 2000), rabatProponowany: rp, status: 'oczekuje', netto: w.netto
    };
    w.zapytania = w.zapytania || [];
    w.zapytania.push(z);
    nowe.push(z);
    powiadom(login, { typ: 'zapytanie', tytul: `Zapytanie o rabat – wycena ${w.kod}`, tresc: `${z.odNazwa}: ${w.projekt || 'bez nazwy'}${z.wiadomosc ? ' – ' + z.wiadomosc.slice(0, 200) : ''}${rp != null ? ` (proponowany rabat ${rp}%)` : ''}`, kod: w.kod });
  }
  w.historia.push({ data: teraz, kto: kto.login, co: `Wysłano zapytanie o rabat do: ${nowe.map(z => z.doNazwa).join(', ')}` });
  zapisz('wyceny.json', all);
  return nowe;
}

// Zapytania skierowane do mnie
function mojeZapytania(kto) {
  const k = konta(), wynik = [];
  for (const w of Object.values(wyceny())) {
    for (const z of w.zapytania || []) {
      if (z.do === kto.login || (kto.rola === 'admin' && z.doRola === 'pracownik')) wynik.push({ ...z, kod: w.kod, projekt: w.projekt, zestawy: (w.zestawy || []).length, netto: w.netto, wlascicielRola: (k[w.wlasciciel] || {}).rola });
    }
  }
  return wynik.sort((a, b) => (a.status === 'oczekuje' ? -1 : 1) - (b.status === 'oczekuje' ? -1 : 1) || b.data.localeCompare(a.data));
}

function odpowiedz(kto, kod, id, { decyzja, rabat, komentarz }) {
  const all = wyceny(), w = all[kod];
  if (!w) throw blad('Nie znaleziono wyceny.', 404);
  const z = (w.zapytania || []).find(q => q.id === id);
  if (!z) throw blad('Nie znaleziono zapytania.', 404);
  if (!(z.do === kto.login || (kto.rola === 'admin' && z.doRola === 'pracownik'))) throw blad('To zapytanie nie jest skierowane do Ciebie.', 403);
  if (!['przyznany', 'odrzucony'].includes(decyzja)) throw blad('Wybierz: przyznaj lub odrzuć.');
  z.status = decyzja;
  z.rabat = decyzja === 'przyznany' ? sprawdzRabat(rabat) : null;
  z.komentarz = tekst(komentarz, 2000);
  z.odpowiedzData = new Date().toISOString();
  const k = konta();
  const osoba = k[kto.login];
  z.odpowiedzialOsoba = [osoba.imie, osoba.stanowisko].filter(Boolean).join(', ') || null;
  w.historia.push({ data: z.odpowiedzData, kto: kto.login, co: decyzja === 'przyznany' ? `${z.doNazwa} przyznał(a) rabat ${z.rabat}%` : `${z.doNazwa} odrzucił(a) zapytanie` });
  zapisz('wyceny.json', all);
  powiadom(w.wlasciciel, { typ: 'rabat', tytul: `Odpowiedź na zapytanie o rabat – ${w.kod}`, tresc: `${z.doNazwa}: ${decyzja === 'przyznany' ? `przyznano rabat ${z.rabat}%` : 'odrzucono zapytanie'}${z.komentarz ? ' – ' + z.komentarz : ''}`, kod: w.kod });
  return z;
}

module.exports = {
  ROLE, STANOWISKA_KS, RODZAJE_INSTALATORA, personel, rejestruj, potwierdzEmail, nowyTokenPotwierdzenia, zaloguj, wyloguj, kontoZSesji, publiczne, listaKont, zmienKonto, usunKonto,
  dodajHurtownie, listaPracownikow, listaHurtowni, powiadomienia, oznaczPrzeczytane, powiadom, powiadomRole, nazwaKonta,
  zapiszWycene, pobierzWycene, listaWycen, usunWycene, adresaci, wyslijZapytanie, mojeZapytania, odpowiedz,
  czyPusto: () => Object.keys(konta()).length === 0
};
