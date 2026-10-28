/* Konta, wyceny, zapytania o rabat i administracja – część interfejsu konfiguratora */
'use strict';

let KONTO = null;            // zalogowane konto albo null (gość)
let PIERWSZE_KONTO = false;  // brak kont w systemie – pierwsze zostanie administratorem
let STANOWISKA_KS = [];
let RODZAJE_INSTALATORA = [];
let POWIADOMIENIA = [];
let BEZ_MAILA = false;       // poczta nieskonfigurowana – nowe konta akceptuje administrator
const KONTA_CACHE = {};      // dane widoków (klucz → tablica | 'laduje')

const zalogowany = () => !!KONTO;
const personelKS = () => !!KONTO && ['admin', 'pracownik'].includes(KONTO.rola);
const adminKS = () => !!KONTO && KONTO.rola === 'admin';
const odbieraZapytania = () => !!KONTO && ['admin', 'pracownik', 'hurtownia', 'instalator'].includes(KONTO.rola);
const pytaORabat = () => !!KONTO && ['klient', 'instalator', 'hurtownia'].includes(KONTO.rola);

async function api(url, opcje = {}) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opcje, body: opcje.body && typeof opcje.body !== 'string' ? JSON.stringify(opcje.body) : opcje.body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.blad || `Błąd ${r.status}`);
  return j;
}

async function wczytajKonto() {
  try {
    const j = await api('/api/konto');
    KONTO = j.konto; PIERWSZE_KONTO = j.pierwszeKonto; STANOWISKA_KS = j.stanowiska || []; RODZAJE_INSTALATORA = j.rodzajeInstalatora || [];
    NOWE_UWAGI = j.noweUwagi || 0;
    BEZ_MAILA = !!j.bezMaila;
  } catch { KONTO = null; }
  POWIADOMIENIA = [];
  if (KONTO) { try { POWIADOMIENIA = await api('/api/powiadomienia'); } catch { /* bez powiadomień */ } }
}

// Dane widoku ładowane w tle: pierwsze wywołanie zwraca null i po pobraniu ponownie renderuje
function daneWidoku(klucz, url) {
  if (KONTA_CACHE[klucz] && KONTA_CACHE[klucz] !== 'laduje') return KONTA_CACHE[klucz];
  if (KONTA_CACHE[klucz] !== 'laduje') {
    KONTA_CACHE[klucz] = 'laduje';
    api(url).then(d => { KONTA_CACHE[klucz] = d; render(); }).catch(e => { KONTA_CACHE[klucz] = []; toast(e.message); render(); });
  }
  return null;
}
const odswiezDane = (...klucze) => klucze.forEach(k => delete KONTA_CACHE[k]);
const odswiezWszystko = () => Object.keys(KONTA_CACHE).forEach(k => delete KONTA_CACHE[k]);
const ladowanieHtml = '<p class="muted">Wczytywanie…</p>';
const dataPl = d => d ? new Date(d).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const STATUS_ZAPYTANIA = { oczekuje: ['czeka na odpowiedź', 'pomaranczowa'], przyznany: ['rabat przyznany', 'zielona'], odrzucony: ['odrzucone', 'czerwona'] };
const plakietkaZapytania = s => { const [t, k] = STATUS_ZAPYTANIA[s] || [s, '']; return `<span class="plakietka ${k}">${esc(t)}</span>`; };

// ---------- Menu w nagłówku ----------
function menuKonta() {
  if (!KONTO) return `<button class="btn" data-akcja="konto-logowanie">Zaloguj</button><button class="btn btn-primary" data-akcja="konto-rejestracja">Załóż konto</button>`;
  const nowe = POWIADOMIENIA.filter(p => !p.przeczytane).length;
  const klienciEtykieta = KONTO.rola === 'pracownik' ? 'Moje hurtownie' : 'Moi instalatorzy';
  return `
    <button class="btn" data-akcja="idz" data-widok="powiadomienia" title="Powiadomienia">🔔${nowe ? ` <span class="licznik">${nowe}</span>` : ''}</button>
    <button class="btn" data-akcja="idz" data-widok="wyceny">Moje wyceny</button>
    ${odbieraZapytania() ? '<button class="btn" data-akcja="idz" data-widok="zapytania">Zapytania o rabat</button>' : ''}
    ${['pracownik', 'hurtownia'].includes(KONTO.rola) ? `<button class="btn" data-akcja="idz" data-widok="klienci">${klienciEtykieta}</button>` : ''}
    ${KONTO.rola === 'instalator' ? '<button class="btn" data-akcja="idz" data-widok="moje-hurtownie">Moje hurtownie</button>' : ''}
    ${adminKS() ? `<button class="btn" data-akcja="idz" data-widok="uwagi" title="Uwagi od testerów">Uwagi${NOWE_UWAGI ? ` <span class="licznik">${NOWE_UWAGI}</span>` : ''}</button><button class="btn" data-akcja="idz" data-widok="konta">Konta</button><button class="btn" data-akcja="admin" title="Cennik, katalogi, AI">Dane</button>` : ''}
    <span class="uzytkownik" title="${esc(KONTO.email)}">${esc(KONTO.imie || KONTO.nazwa || KONTO.email)}<small>${esc(KONTO.rolaNazwa)}</small></span>
    <button class="btn" data-akcja="konto-wyloguj">Wyloguj</button>`;
}

// ---------- Logowanie i rejestracja ----------
function widokLogowanie() {
  return `<section class="panel formularz">
    <h1>Logowanie</h1>
    ${S.komunikatLogowania ? `<p class="komunikat ${S.komunikatLogowaniaTyp || 'info'}">${esc(S.komunikatLogowania)}</p>` : ''}
    ${S.niepotwierdzony ? `<div class="komunikat">Adres <b>${esc(S.niepotwierdzony)}</b> nie jest jeszcze potwierdzony. Kliknij link z wiadomości wysłanej przy rejestracji (sprawdź też folder SPAM).
      <div style="margin-top:8px"><button class="btn btn-sm" data-akcja="konto-wyslij-link">Wyślij link ponownie</button></div></div>` : ''}
    <label>E-mail<input id="f-email" class="tekst" type="email" autocomplete="username" value="${esc(S.niepotwierdzony || S.ostatniEmail || '')}"></label>
    <label>Hasło<input id="f-haslo" class="tekst" type="password" autocomplete="current-password"></label>
    <button class="btn btn-primary" data-akcja="konto-zaloguj">Zaloguj →</button>
    <p class="small muted">Nie masz konta? <button class="btn-link" data-akcja="konto-rejestracja">Załóż konto</button></p>
  </section>`;
}

const pole = (id, etykieta, opcje = {}) => `<label>${etykieta}${opcje.wymagane ? ' *' : ''}<input class="tekst" data-pole="rej.${id}" data-bez-renderu value="${esc((S.rej || {})[id] || '')}" type="${opcje.typ || 'text'}" ${opcje.auto ? `autocomplete="${opcje.auto}"` : ''} placeholder="${esc(opcje.placeholder || '')}"></label>`;
const lista = (id, etykieta, elementy, opcje = {}) => `<label>${etykieta}${opcje.wymagane ? ' *' : ''}<select class="tekst" data-pole="rej.${id}" data-bez-renderu>
  <option value="">— wybierz —</option>${elementy.map(e => `<option value="${esc(e.id ?? e)}" ${(S.rej || {})[id] === (e.id ?? e) ? 'selected' : ''}>${esc(e.nazwa ?? e)}${e.opis ? ' – ' + esc(e.opis) : ''}</option>`).join('')}</select></label>`;

// ---------- Region przedstawiciela z miasta (reguly.json → regiony, miasta-pl.js) ----------
const regionyLista = () => Object.entries((R && R.regiony) || {}).filter(([k]) => !k.startsWith('_'))
  .map(([id, r]) => ({ id, nazwa: `Region ${id}`, opis: (r.wojewodztwa || []).join(', ') }));

// Kogo z Kontakt-Simon proponować zależnie od rodzaju konta:
// hurtownia → Przedstawiciel Handlowy; instalator → Doradca techniczno-handlowy;
// biuro projektowe / projektant → Doradca Biura Obsługi Projektów; klient indywidualny → Doradca techniczno-handlowy
function stanowiskoDoradcy() {
  if (S.rej.typ === 'hurtownia' || !S.rej.typ) return 'Przedstawiciel Handlowy';
  if (S.rej.typ === 'instalator' && S.rej.rodzajFirmy === 'biuro projektowe') return 'Doradca Biura Obsługi Projektów';
  return 'Doradca techniczno-handlowy';
}
// Pracownik z regionu na właściwym stanowisku (null, gdy takiego nie ma w systemie)
const doradcaZRegionu = (pracownicy, region, stanowisko) =>
  Array.isArray(pracownicy) && region ? pracownicy.find(p => p.region === region && p.stanowisko === stanowisko) || null : null;

function podpowiedzRegionu(miasto) {
  if (String(miasto || '').trim().length < 3) return '';
  const r = regionDlaMiasta(miasto, S.rej.woj);
  if (!r) return `<div class="komunikat" style="margin:0">Nie znamy tej miejscowości – wybierz województwo, a podpowiemy opiekuna z Kontakt-Simon:
    <select class="tekst" data-pole="rej.woj" style="margin-top:6px"><option value="">— województwo —</option>${WOJEWODZTWA.map(w => `<option ${S.rej.woj === w ? 'selected' : ''}>${w}</option>`).join('')}</select></div>`;
  const stanowisko = stanowiskoDoradcy();
  const doradca = doradcaZRegionu(KONTA_CACHE['rej-pracownicy'], r.id, stanowisko);
  const kontakt = `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a> · ${(r.telefony || []).map(t => `<a href="tel:${esc(t.replace(/\s/g, ''))}">${esc(t)}</a>`).join(', ')}`;
  return `<div class="komunikat info region-karta" style="margin:0">
    <b>Twój kontakt w Kontakt-Simon – ${esc(stanowisko)}, Region ${esc(r.id)}</b>${r.wojewodztwo ? ` <span class="small muted">(${esc(r.wojewodztwo)})</span>` : ''}
    <div class="small">${doradca ? `<b>${esc(doradca.nazwa)}</b> · ` : ''}${stanowisko === 'Przedstawiciel Handlowy' ? kontakt : `biuro regionu: ${kontakt}`}</div>
  </div>`;
}

// Opiekun hurtowni: pracownik z regionu miasta oddziału jest oznaczony i wybrany, jeśli nie wybrano innego
function poleOpiekuna(pracownicy) {
  if (!pracownicy.length) return '<p class="komunikat blad">Brak aktywnych pracowników Kontakt-Simon – rejestracja hurtowni będzie możliwa, gdy administrator ich zaakceptuje.</p>';
  const r = regionDlaMiasta(S.rej.oddzial, S.rej.woj);
  // hurtownia: Przedstawiciel Handlowy z regionu oddziału (a gdy go nie ma – ktokolwiek z regionu)
  const zRegionu = r ? (doradcaZRegionu(pracownicy, r.id, 'Przedstawiciel Handlowy') || pracownicy.find(p => p.region === r.id)) : null;
  if (zRegionu && !S.rej.opiekunWybrany) S.rej.opiekun = zRegionu.id;
  return `<label>Opiekun w Kontakt-Simon *<select class="tekst" data-pole="rej.opiekun" data-bez-renderu data-opiekun>
    <option value="">— wybierz —</option>${pracownicy.map(p => `<option value="${esc(p.id)}" ${S.rej.opiekun === p.id ? 'selected' : ''}>${esc(p.nazwa)}${p.opis ? ' – ' + esc(p.opis) : ''}${zRegionu && zRegionu.id === p.id ? ' ★ Twój region' : ''}</option>`).join('')}</select></label>`;
}

// odświeżenie podpowiedzi przy wpisywaniu miasta – bez przerysowania formularza
function odswiezRegion() {
  const el = document.getElementById('region-podpowiedz');
  if (el) el.innerHTML = podpowiedzRegionu(S.rej.miasto || S.rej.oddzial);
  const op = document.getElementById('rej-opiekun'), pr = KONTA_CACHE['rej-pracownicy'];
  if (op && Array.isArray(pr)) op.innerHTML = poleOpiekuna(pr);
}
document.addEventListener('input', e => {
  const p = e.target.dataset && e.target.dataset.pole;
  if (p !== 'rej.miasto' && p !== 'rej.oddzial') return;
  S.rej[p.slice(4)] = e.target.value; S.rej.woj = null;
  odswiezRegion();
});
document.addEventListener('change', e => {
  const p = e.target.dataset && e.target.dataset.pole;
  if (p === 'rej.woj') { S.rej.woj = e.target.value || null; odswiezRegion(); }
  if (e.target.dataset && e.target.dataset.opiekun !== undefined) S.rej.opiekunWybrany = true;
});

function widokRejestracja() {
  S.rej = S.rej || {};
  const typ = PIERWSZE_KONTO ? 'admin' : (S.rej.typ || 'hurtownia');
  const typy = [
    ['hurtownia', 'Hurtownia', BEZ_MAILA ? 'akceptuje opiekun z Kontakt-Simon lub administrator' : 'wymaga akceptacji opiekuna z Kontakt-Simon'],
    ['instalator', 'Instalator / biuro projektowe', BEZ_MAILA ? 'współpraca z hurtowniami, akceptuje administrator' : 'współpraca z hurtowniami'],
    ['klient', 'Klient indywidualny', BEZ_MAILA ? 'e-mail i miasto, akceptuje administrator' : 'inwestor – tylko e-mail i miasto'],
    ['pracownik', 'Pracownik Kontakt-Simon', 'wymaga akceptacji administratora']
  ];
  let pola = '';
  if (typ === 'admin') {
    pola = pole('imie', 'Imię i nazwisko', { auto: 'name' });
  } else if (typ === 'pracownik') {
    pola = pole('imie', 'Imię i nazwisko', { wymagane: 1, auto: 'name' }) + lista('stanowisko', 'Stanowisko', STANOWISKA_KS, { wymagane: 1 })
      + lista('region', 'Region (jeśli jesteś przedstawicielem regionalnym)', regionyLista())
      + '<p class="komunikat">Konto pracownika zostanie aktywowane po akceptacji administratora – prośba trafi do niego automatycznie.</p>';
  } else if (typ === 'hurtownia') {
    const pracownicy = daneWidoku('rej-pracownicy', '/api/konto/pracownicy');
    pola = pole('firma', 'Nazwa hurtowni', { wymagane: 1, auto: 'organization' }) + pole('oddzial', 'Oddział (miasto)', { wymagane: 1, placeholder: 'np. Katowice' })
      + `<div id="region-podpowiedz">${podpowiedzRegionu(S.rej.oddzial)}</div>`
      + pole('imie', 'Imię i nazwisko', { wymagane: 1, auto: 'name' }) + pole('stanowisko', 'Stanowisko', { wymagane: 1, placeholder: 'np. handlowiec, kierownik oddziału' })
      + pole('telefon', 'Telefon', { typ: 'tel', auto: 'tel' })
      + `<div id="rej-opiekun">${!pracownicy ? ladowanieHtml : poleOpiekuna(pracownicy)}</div>`
      + `<p class="komunikat">Konto hurtowni aktywuje wybrany opiekun z Kontakt-Simon${BEZ_MAILA ? ' lub administrator' : ''} – dostanie powiadomienie o Twojej rejestracji.</p>`;
  } else if (typ === 'instalator') {
    const hurtownie = daneWidoku('rej-hurtownie', '/api/konto/hurtownie');
    daneWidoku('rej-pracownicy', '/api/konto/pracownicy');
    const jdg = !!S.rej.jdg;
    const wybrane = S.rej.hurtownie || [];
    pola = `<div class="opcje">${RODZAJE_INSTALATORA.map(r => opcja('rej.rodzajFirmy', r, r === 'instalator' ? 'Instalator' : 'Biuro projektowe', null, S.rej.rodzajFirmy === r)).join('')}</div>
      <label class="check" style="font-weight:400"><input type="checkbox" data-pole="rej.jdg" data-typ="bool" ${jdg ? 'checked' : ''}><span>Prowadzę jednoosobową działalność gospodarczą</span></label>
      ${pole('imie', 'Imię i nazwisko', { wymagane: 1, auto: 'name' })}
      ${pole('firma', jdg ? 'Nazwa działalności (opcjonalnie)' : 'Nazwa firmy', { wymagane: !jdg, auto: 'organization' })}
      ${jdg ? '' : pole('stanowisko', 'Twoje stanowisko w firmie', { wymagane: 1, placeholder: 'np. projektant, kierownik robót' })}
      ${pole('miasto', 'Miasto (siedziba firmy)', { auto: 'address-level2', placeholder: 'np. Rzeszów' })}
      <div id="region-podpowiedz">${podpowiedzRegionu(S.rej.miasto)}</div>
      ${pole('telefon', 'Telefon', { typ: 'tel', auto: 'tel' })}
      <div><b style="font-size:13px">Hurtownie, z którymi współpracujesz *</b>
        ${!hurtownie ? ladowanieHtml : !hurtownie.length ? '<p class="komunikat blad" style="margin-top:6px">Brak aktywnych hurtowni w systemie.</p>' : `<div class="lista-wyboru">${hurtownie.map(h => `<label class="check"><input type="checkbox" data-rej-hurtownia="${esc(h.id)}" ${wybrane.includes(h.id) ? 'checked' : ''}><span>${esc(h.nazwa)}</span></label>`).join('')}</div>
        <p class="small muted" style="margin:4px 0 0">Każda wybrana hurtownia dostanie powiadomienie i potwierdzi współpracę. Kolejne dodasz później.</p>`}</div>`;
  } else if (typ === 'klient') {
    // podpowiedź przedstawiciela potrzebuje listy pracowników (opiekun z regionu)
    daneWidoku('rej-pracownicy', '/api/konto/pracownicy');
    pola = pole('miasto', 'Miasto inwestycji', { wymagane: 1, auto: 'address-level2' })
      + `<div id="region-podpowiedz">${podpowiedzRegionu(S.rej.miasto)}</div>`
      + pole('adres', 'Ulica i numer (opcjonalnie)', { auto: 'street-address' }) + pole('kodPocztowy', 'Kod pocztowy (opcjonalnie)', { auto: 'postal-code' });
  }
  return `<section class="panel formularz">
    <h1>Załóż konto</h1>
    ${PIERWSZE_KONTO ? '<p class="komunikat info">To pierwsze konto w systemie – otrzyma uprawnienia <b>administratora</b> (jedyne takie konto).</p>' : `<h3>Rodzaj konta</h3>
    <div class="opcje">${typy.map(([k, t, p]) => opcja('rej.typ', k, t, p, typ === k)).join('')}</div>`}
    ${pole('email', 'E-mail (służy do logowania)', { wymagane: 1, typ: 'email', auto: 'email' })}
    ${pola}
    ${BEZ_MAILA && !PIERWSZE_KONTO && ['klient', 'instalator'].includes(typ) ? '<p class="komunikat">Konto zostanie aktywowane po akceptacji administratora – potem zalogujesz się swoim e-mailem i hasłem.</p>' : ''}
    ${pole('haslo', 'Hasło (min. 8 znaków)', { wymagane: 1, typ: 'password', auto: 'new-password' })}
    ${pole('haslo2', 'Powtórz hasło', { wymagane: 1, typ: 'password', auto: 'new-password' })}
    <button class="btn btn-primary" data-akcja="konto-zarejestruj">Załóż konto →</button>
    <p class="small muted">Masz już konto? <button class="btn-link" data-akcja="konto-logowanie">Zaloguj się</button></p>
  </section>`;
}

// ---------- Moje wyceny ----------
function opisZapytan(w) {
  const z = w.zapytania || [];
  if (!z.length) return '<span class="muted small">—</span>';
  const n = s => z.filter(q => q.status === s).length;
  return [n('oczekuje') && `<span class="plakietka pomaranczowa">${n('oczekuje')} czeka</span>`, n('przyznany') && `<span class="plakietka zielona">${n('przyznany')} przyznane</span>`, n('odrzucony') && `<span class="plakietka czerwona">${n('odrzucony')} odrzucone</span>`].filter(Boolean).join(' ');
}

// ---------- Filtry „Moich wycen”: klient (firma / osoba), autor wyceny, wyszukiwanie ----------
const BEZ_KLIENTA = '__brak__';
const normTekst = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').trim();
const filtrWycen = () => (S.filtrWycen = S.filtrWycen || { tekst: '', klient: '', autor: '' });

function wycenyPoFiltrze(lista) {
  const f = filtrWycen(), t = normTekst(f.tekst);
  return lista.filter(w => {
    if (f.klient === BEZ_KLIENTA ? w.klient : f.klient && normTekst(w.klient) !== normTekst(f.klient)) return false;
    if (f.autor && w.wlasciciel !== f.autor) return false;
    if (!t) return true;
    const gdzie = [w.kod, w.projekt, w.klient, w.wlascicielNazwa, w.wlasciciel, ...(w.zapytania || []).map(z => z.doNazwa)].map(normTekst).join(' ');
    return t.split(/\s+/).every(slowo => gdzie.includes(slowo));
  });
}

// Klienci zgrupowani bez rozróżniania wielkości liter i polskich znaków; nazwa = najczęstsza pisownia
// (przy remisie – ta z wielkimi literami, np. „Elektro-Hurt Łódź” zamiast „elektro-hurt łódź”)
function klienciWycen(lista) {
  const grupy = new Map();
  for (const w of lista) if (w.klient) {
    const k = normTekst(w.klient), g = grupy.get(k) || { ile: 0, pisownie: {} };
    g.ile++; g.pisownie[w.klient] = (g.pisownie[w.klient] || 0) + 1; grupy.set(k, g);
  }
  const wielkie = s => (s.match(/\p{Lu}/gu) || []).length;
  return [...grupy.values()].map(g => ({ ile: g.ile, nazwa: Object.entries(g.pisownie).sort((a, b) => (b[1] - a[1]) || (wielkie(b[0]) - wielkie(a[0])))[0][0] }))
    .sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl'));
}

function filtryWycenHtml(lista, zakres) {
  const f = filtrWycen();
  const klienci = klienciWycen(lista);
  const bezKlienta = lista.filter(w => !w.klient).length;
  const autorzy = new Map();
  for (const w of lista) { const e = autorzy.get(w.wlasciciel) || { nazwa: w.wlascicielNazwa || w.wlasciciel, ile: 0 }; e.ile++; autorzy.set(w.wlasciciel, e); }
  return `<div class="filtry-wycen">
    <label class="pole">Szukaj <input class="tekst" type="search" data-filtr-wycen="tekst" value="${esc(f.tekst)}" placeholder="kod, projekt, klient, osoba…" style="width:240px"></label>
    <label class="pole">Klient (firma / osoba) <select class="tekst" data-filtr-wycen="klient">
      <option value="">wszyscy (${lista.length})</option>
      ${klienci.map(k => `<option value="${esc(k.nazwa)}" ${f.klient && normTekst(f.klient) === normTekst(k.nazwa) ? 'selected' : ''}>${esc(k.nazwa)} (${k.ile})</option>`).join('')}
      ${bezKlienta ? `<option value="${BEZ_KLIENTA}" ${f.klient === BEZ_KLIENTA ? 'selected' : ''}>— bez klienta (${bezKlienta})</option>` : ''}
    </select></label>
    ${zakres === 'wszystkie' && autorzy.size > 1 ? `<label class="pole">Utworzył(a) <select class="tekst" data-filtr-wycen="autor">
      <option value="">wszyscy</option>${[...autorzy.entries()].sort((a, b) => a[1].nazwa.localeCompare(b[1].nazwa, 'pl')).map(([login, a]) => `<option value="${esc(login)}" ${f.autor === login ? 'selected' : ''}>${esc(a.nazwa)} (${a.ile})</option>`).join('')}
    </select></label>` : ''}
    <button class="btn btn-sm" data-akcja="wyceny-filtr-czysc" ${f.tekst || f.klient || f.autor ? '' : 'hidden'}>Wyczyść filtry</button>
  </div>`;
}

// Podpowiedzi pola „Klient” w ofercie – nazwy z wcześniejszych wycen (ta sama pisownia = łatwe filtrowanie)
function listaKlientowHtml() {
  if (!KONTO) return '';
  const lista = daneWidoku('wyceny-moje', '/api/wyceny?zakres=moje');
  if (!Array.isArray(lista)) return '';
  return `<datalist id="lista-klientow">${klienciWycen(lista).map(k => `<option value="${esc(k.nazwa)}">`).join('')}</datalist>`;
}

function tabelaWycen(lista, zakres) {
  const widoczne = wycenyPoFiltrze(lista);
  if (!widoczne.length) return '<p class="muted">Żadna wycena nie pasuje do filtrów.</p>';
  return `<p class="small muted" style="margin:0 0 6px">Pokazano ${widoczne.length} z ${lista.length}</p>
    <div style="overflow-x:auto"><table class="tabela"><thead><tr><th>Kod</th><th>Projekt / klient</th>${zakres === 'wszystkie' ? '<th>Właściciel</th>' : ''}<th>Zapytania o rabat</th><th class="num">Zestawy</th><th class="num">Wartość kat. netto</th><th class="num">Rabat</th><th>Zmieniono</th><th></th></tr></thead>
    <tbody>${widoczne.map(w => `<tr>
      <td><span class="symbol">${esc(w.kod)}</span></td><td>${esc(w.projekt || '—')}${w.klient ? `<div class="small muted">${esc(w.klient)}</div>` : ''}</td>
      ${zakres === 'wszystkie' ? `<td>${esc(w.wlascicielNazwa)}<div class="small muted">${esc(w.wlasciciel)}</div></td>` : ''}
      <td>${opisZapytan(w)}</td><td class="num">${w.zestawy}</td><td class="num">${zl(w.netto)}</td>
      <td class="num">${w.rabat ? `${w.rabat}%${w.zatwierdzenie ? '<div class="small" style="color:var(--ok)">✓ zatwierdzony</div>' : '<div class="small muted">niepotwierdzony</div>'}` : '—'}</td>
      <td class="small">${dataPl(w.zmieniono)}</td>
      <td class="num"><button class="btn btn-sm" data-akcja="wycena-otworz" data-kod="${esc(w.kod)}">Otwórz</button> <button class="btn btn-sm" data-akcja="wycena-usun" data-kod="${esc(w.kod)}">Usuń</button></td>
    </tr>`).join('')}</tbody></table></div>`;
}

function widokWyceny() {
  if (!KONTO) return widokLogowanie();
  const zakres = adminKS() && S.zakresWycen === 'wszystkie' ? 'wszystkie' : 'moje';
  const lista = daneWidoku('wyceny-' + zakres, '/api/wyceny?zakres=' + zakres);
  const tresc = !lista ? ladowanieHtml : !lista.length ? '<p class="muted">Brak zapisanych wycen. Skonfiguruj puszki i dodaj je do oferty – wycena zapisze się automatycznie.</p>'
    : `${filtryWycenHtml(lista, zakres)}<div id="tabela-wycen">${tabelaWycen(lista, zakres)}</div>`;
  return `<section class="panel">
    <h1>Moje wyceny</h1>
    ${polePoKodzie()}
    ${adminKS() ? `<div class="opcje" style="margin-bottom:12px">${opcjaAkcja('wyceny-zakres', 'moje', 'Moje', null, zakres === 'moje')}${opcjaAkcja('wyceny-zakres', 'wszystkie', 'Wszystkie w systemie', null, zakres === 'wszystkie')}</div>` : ''}
    ${tresc}
  </section>`;
}

// filtr zmienia tylko tabelę – pole wyszukiwania nie traci kursora
function odswiezTabeleWycen() {
  const zakres = adminKS() && S.zakresWycen === 'wszystkie' ? 'wszystkie' : 'moje';
  const lista = KONTA_CACHE['wyceny-' + zakres], el = document.getElementById('tabela-wycen');
  if (!Array.isArray(lista) || !el) return;
  el.innerHTML = tabelaWycen(lista, zakres);
  const f = filtrWycen(), czysc = document.querySelector('[data-akcja="wyceny-filtr-czysc"]');
  if (czysc) czysc.hidden = !(f.tekst || f.klient || f.autor);
  zapisz();
}
['input', 'change'].forEach(typ => document.addEventListener(typ, e => {
  const pole = e.target.dataset && e.target.dataset.filtrWycen;
  if (!pole || (typ === 'input' && pole !== 'tekst')) return;
  filtrWycen()[pole] = e.target.value;
  odswiezTabeleWycen();
}));

function polePoKodzie() {
  return `<div class="po-kodzie">
    <span>Otwórz wycenę po kodzie:</span>
    <input id="kod-wyceny" class="tekst" placeholder="KS-XXXX-XXXX" style="width:170px;text-transform:uppercase">
    <button class="btn btn-sm" data-akcja="wycena-po-kodzie">Otwórz</button>
  </div>`;
}

// ---------- Zapytania o rabat skierowane do mnie ----------
function widokZapytania() {
  if (!odbieraZapytania()) return widokLogowanie();
  const lista = daneWidoku('zapytania', '/api/zapytania');
  const tresc = !lista ? ladowanieHtml : !lista.length ? '<p class="muted">Nie masz zapytań o rabat.</p>' : lista.map(z => `
    <div class="zapytanie ${z.status === 'oczekuje' ? 'nowe' : ''}">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div><b>${esc(z.odNazwa)}</b> <span class="small muted">${esc(z.od)}</span> · <span class="symbol">${esc(z.kod)}</span> ${plakietkaZapytania(z.status)}
          <div class="small muted">${esc(z.projekt || 'bez nazwy')} · ${z.zestawy} zestawów · ${zl(z.netto)} netto kat. · ${dataPl(z.data)}${adminKS() && z.do !== KONTO.login ? ` · do: ${esc(z.doNazwa)}` : ''}</div></div>
        <button class="btn btn-sm" data-akcja="wycena-otworz" data-kod="${esc(z.kod)}">Otwórz wycenę</button>
      </div>
      ${z.wiadomosc ? `<p style="margin:8px 0">„${esc(z.wiadomosc)}”</p>` : ''}
      ${z.rabatProponowany != null ? `<p class="small" style="margin:4px 0">Proponowany rabat: <b>${z.rabatProponowany}%</b></p>` : ''}
      ${z.status === 'oczekuje' ? `<div class="opcje" style="align-items:center;margin-top:8px">
          <label class="pole">Rabat <input type="number" min="0" max="${rabatMaks()}" step="0.5" id="rabat-${esc(z.id)}" value="${z.rabatProponowany ?? ''}"> %</label>
          <input class="tekst" id="kom-${esc(z.id)}" placeholder="Komentarz (opcjonalnie)" style="flex:1;min-width:220px">
          <button class="btn btn-primary btn-sm" data-akcja="zapytanie-odpowiedz" data-decyzja="przyznany" data-kod="${esc(z.kod)}" data-id="${esc(z.id)}">Przyznaj rabat</button>
          <button class="btn btn-sm" data-akcja="zapytanie-odpowiedz" data-decyzja="odrzucony" data-kod="${esc(z.kod)}" data-id="${esc(z.id)}">Odrzuć</button>
        </div>` : `<p class="small" style="margin:6px 0 0">${z.status === 'przyznany' ? `Przyznano <b>${z.rabat}%</b>` : 'Odrzucono'} · ${dataPl(z.odpowiedzData)}${z.komentarz ? ` · „${esc(z.komentarz)}”` : ''}</p>`}
    </div>`).join('');
  return `<section class="panel"><h1>Zapytania o rabat</h1><p class="muted" style="margin:0 0 12px">${
    KONTO.rola === 'hurtownia' ? 'Zapytania od instalatorów, biur projektowych i klientów indywidualnych.' :
    KONTO.rola === 'instalator' ? 'Zapytania od klientów indywidualnych.' : 'Zapytania od hurtowni.'}</p>${tresc}</section>`;
}

// ---------- Moi klienci: pracownik → hurtownie, hurtownia → instalatorzy ----------
function widokKlienci() {
  if (!KONTO || !['pracownik', 'hurtownia'].includes(KONTO.rola)) return widokLogowanie();
  const lista = daneWidoku('konta', '/api/konta');
  if (!lista) return `<section class="panel"><h1>Moi klienci</h1>${ladowanieHtml}</section>`;
  const prac = KONTO.rola === 'pracownik';
  const status = k => prac ? k.status : (k.powiazanie || {}).status;
  const oczek = lista.filter(k => status(k) === 'oczekuje');
  const wiersz = k => {
    const st = status(k), rabat = prac ? k.rabat : (k.powiazanie || {}).rabat || 0;
    return `<tr class="${st === 'oczekuje' ? 'oczekuje' : ''}">
      <td><b>${esc(k.nazwa)}</b><div class="small muted">${esc(k.imie)}${k.stanowisko ? ', ' + esc(k.stanowisko) : ''}</div></td>
      <td class="small"><a href="mailto:${esc(k.email)}">${esc(k.email)}</a>${k.telefon ? `<br>${esc(k.telefon)}` : ''}</td>
      <td>${k.emailPotwierdzony === false ? '<span class="plakietka">e-mail niepotwierdzony</span><br>' : ''}${st === 'aktywne' ? '<span class="plakietka zielona">aktywne</span>' : st === 'oczekuje' ? '<span class="plakietka pomaranczowa">czeka na Ciebie</span>' : `<span class="plakietka czerwona">${esc(st)}</span>`}</td>
      <td><span class="pole"><input type="number" min="0" max="${rabatMaks()}" step="0.5" id="rabatstd-${esc(k.login)}" value="${rabat}"> %
        <button class="btn btn-sm" data-akcja="klient-rabat" data-login="${esc(k.login)}">Zapisz</button></span></td>
      <td class="num">${st === 'oczekuje'
        ? `<button class="btn btn-sm btn-primary" data-akcja="klient-akceptuj" data-login="${esc(k.login)}">Akceptuj</button> <button class="btn btn-sm" data-akcja="klient-odrzuc" data-login="${esc(k.login)}">Odrzuć</button>`
        : st === 'aktywne' ? `<button class="btn btn-sm" data-akcja="klient-odrzuc" data-login="${esc(k.login)}">${prac ? 'Zablokuj' : 'Zakończ współpracę'}</button>` : `<button class="btn btn-sm" data-akcja="klient-akceptuj" data-login="${esc(k.login)}">Przywróć</button>`}</td>
    </tr>`;
  };
  return `<section class="panel">
    <h1>${prac ? 'Moje hurtownie' : 'Moi instalatorzy i projektanci'}</h1>
    <p class="muted" style="margin:0 0 12px">${prac ? 'Hurtownie, które wybrały Cię jako opiekuna. Akceptujesz ich konta i ustalasz rabaty standardowe (traktowane jako zatwierdzone przez Kontakt-Simon).' : 'Instalatorzy i biura projektowe przypisani do Twojej hurtowni. Potwierdzasz współpracę i ustalasz im rabaty standardowe.'}</p>
    ${oczek.length ? `<p class="komunikat"><b>${oczek.length}</b> ${oczek.length === 1 ? 'konto czeka' : 'konta czekają'} na Twoją akceptację.</p>` : ''}
    ${!lista.length ? '<p class="muted">Nikt jeszcze się do Ciebie nie przypisał.</p>' : `<div style="overflow-x:auto"><table class="tabela"><thead><tr><th>${prac ? 'Hurtownia' : 'Firma'}</th><th>Kontakt</th><th>Status</th><th>Rabat standardowy</th><th></th></tr></thead>
      <tbody>${[...oczek, ...lista.filter(k => status(k) !== 'oczekuje')].map(wiersz).join('')}</tbody></table></div>`}
  </section>`;
}

// ---------- Instalator: moje hurtownie ----------
function widokMojeHurtownie() {
  if (!KONTO || KONTO.rola !== 'instalator') return widokLogowanie();
  const wszystkie = daneWidoku('rej-hurtownie', '/api/konto/hurtownie');
  const moje = KONTO.hurtownie || [];
  const nazwa = id => ((wszystkie || []).find(h => h.id === id) || {}).nazwa || id;
  const wolne = (wszystkie || []).filter(h => !moje.some(m => m.login === h.id));
  return `<section class="panel">
    <h1>Moje hurtownie</h1>
    <table class="tabela"><thead><tr><th>Hurtownia</th><th>Współpraca</th><th class="num">Rabat standardowy</th><th></th></tr></thead>
      <tbody>${moje.map(m => `<tr><td>${esc(nazwa(m.login))}</td><td>${m.status === 'aktywne' ? '<span class="plakietka zielona">potwierdzona</span>' : m.status === 'oczekuje' ? '<span class="plakietka pomaranczowa">czeka na hurtownię</span>' : '<span class="plakietka czerwona">odrzucona</span>'}</td>
        <td class="num">${m.rabat ? m.rabat + '%' : '—'}</td>
        <td class="num">${m.status === 'aktywne' && m.rabat ? `<button class="btn btn-sm" data-akcja="zastosuj-standard" data-hurtownia="${esc(m.login)}" data-rabat="${m.rabat}">Zastosuj w ofercie</button>` : ''}</td></tr>`).join('')}</tbody></table>
    ${wolne.length ? `<div class="opcje" style="margin-top:14px;align-items:center"><select id="nowa-hurtownia" class="tekst"><option value="">— dodaj hurtownię —</option>${wolne.map(h => `<option value="${esc(h.id)}">${esc(h.nazwa)}</option>`).join('')}</select>
      <button class="btn btn-primary btn-sm" data-akcja="dodaj-hurtownie">Dodaj</button></div>` : ''}
  </section>`;
}

// ---------- Administracja kontami ----------
function opisKonta(k) {
  const reg = k.region && k.rola !== 'pracownik' ? `<br><span class="muted">region ${esc(k.region)}</span>` : '';
  if (k.rola === 'hurtownia') return `${esc(k.firma)} – ${esc(k.oddzial)}<br>${esc(k.imie)}, ${esc(k.stanowisko)}${reg}`;
  if (k.rola === 'instalator') return `${esc(k.firma)} (${esc(k.rodzajFirmy || '')}${k.jdg ? ', JDG' : ''})${k.miasto ? ', ' + esc(k.miasto) : ''}<br>${esc(k.imie)}, ${esc(k.stanowisko)}${reg}`;
  if (k.rola === 'klient') return `Inwestycja: ${esc([k.adres, k.kodPocztowy, k.miasto].filter(Boolean).join(', '))}${reg}`;
  return `${esc(k.imie)}${k.stanowisko ? `<br>${esc(k.stanowisko)}` : ''}`;
}

// Kolumna „AI” w Konta: przełącznik dostępu (tryb „Wybrane konta”), limit analiz / miesiąc i zużycie w bieżącym miesiącu
function polaAiKonta(k) {
  const uz = KONTA_CACHE['ai-uzycie-biezacy'];
  const moje = Array.isArray(uz && uz.konta) ? uz.konta.find(x => x.login === k.login) : null;
  const zuzycie = moje ? `<div class="small muted">${moje.analizy} ${moje.analizy === 1 ? 'analiza' : 'analiz'} · ${usd(moje.usd)}</div>` : '';
  if (k.rola === 'admin') return `<span class="small">zawsze</span>${zuzycie}`;
  const dostep = AI_STAN.dostepAi;
  const wlaczone = dostep === 'wszyscy' || (dostep === 'wybrani' && k.ai);
  return `<label class="check" style="display:flex;gap:6px;align-items:center" title="${dostep === 'wybrani' ? 'Włącz analizę AI dla tego konta' : dostep === 'wszyscy' ? 'W trybie „Wszyscy zalogowani” AI ma każde konto' : 'Przełącz w Dane → AI na „Wybrane konta”, aby to działało'}">
      <input type="checkbox" data-akcja-zmiana="konto-zmien" data-login="${esc(k.login)}" data-pole-konta="ai" ${k.ai || dostep === 'wszyscy' ? 'checked' : ''} ${dostep === 'wybrani' ? '' : 'disabled'}>
      <span class="small">${wlaczone ? 'włączone' : 'wyłączone'}</span></label>
    <label class="small muted" style="display:flex;gap:4px;align-items:center;margin-top:4px">limit
      <input type="number" min="1" class="tekst" style="width:62px;padding:2px 6px" placeholder="∞" value="${k.limitAi || ''}" data-akcja-zmiana="konto-zmien" data-login="${esc(k.login)}" data-pole-konta="limitAi" title="Maks. analiz AI w miesiącu – puste = bez limitu"> / mies.</label>
    ${zuzycie}`;
}

function widokKonta() {
  if (!adminKS()) return widokLogowanie();
  daneWidoku('ai-uzycie-biezacy', '/api/ai/uzycie'); // zużycie AI w bieżącym miesiącu (kolumna „AI”)
  const konta = daneWidoku('konta', '/api/konta');
  if (!konta) return `<section class="panel"><h1>Konta</h1>${ladowanieHtml}</section>`;
  const pracownicy = konta.filter(k => k.rola === 'pracownik' && k.status === 'aktywne');
  // bez poczty konto z niepotwierdzonym adresem też czeka na akceptację administratora
  const czeka = k => k.status === 'oczekuje' || (BEZ_MAILA && !k.emailPotwierdzony);
  const oczekujace = konta.filter(czeka);
  const filtr = S.filtrKont || 'wszystkie';
  const widoczne = konta.filter(k => filtr === 'wszystkie' || k.rola === filtr);
  const role = { pracownik: 'Pracownik Kontakt-Simon', hurtownia: 'Hurtownia', instalator: 'Instalator / biuro projektowe', klient: 'Klient indywidualny' };
  const wiersz = k => `<tr class="${czeka(k) ? 'oczekuje' : ''}">
    <td><b>${esc(k.email)}</b>${k.telefon ? `<div class="small muted">${esc(k.telefon)}</div>` : ''}</td>
    <td class="small">${opisKonta(k)}</td>
    <td>${k.rola === 'admin' ? '<b>Administrator</b>' : `<select class="kolor-select" data-akcja-zmiana="konto-zmien" data-login="${esc(k.login)}" data-pole-konta="rola">${Object.entries(role).map(([r, n]) => `<option value="${r}" ${k.rola === r ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`}
      ${k.rola === 'pracownik' ? `<select class="kolor-select" style="margin-top:4px;max-width:220px" data-akcja-zmiana="konto-zmien" data-login="${esc(k.login)}" data-pole-konta="stanowisko">${STANOWISKA_KS.map(s => `<option ${k.stanowisko === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        <select class="kolor-select" style="margin-top:4px" data-akcja-zmiana="konto-zmien" data-login="${esc(k.login)}" data-pole-konta="region" title="Region przedstawiciela – hurtownie z tego regionu dostaną go jako podpowiedź opiekuna"><option value="">bez regionu</option>${regionyLista().map(r => `<option value="${r.id}" ${k.region === r.id ? 'selected' : ''}>${r.nazwa}</option>`).join('')}</select>` : ''}</td>
    <td>${k.rola === 'admin' ? 'aktywne' : `<select class="kolor-select" data-akcja-zmiana="konto-zmien" data-login="${esc(k.login)}" data-pole-konta="status">${['aktywne', 'oczekuje', 'zablokowane'].map(s => `<option ${k.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`}</td>
    <td>${k.rola === 'hurtownia' ? `<select class="kolor-select" data-akcja-zmiana="konto-zmien" data-login="${esc(k.login)}" data-pole-konta="opiekun"><option value="">—</option>${pracownicy.map(p => `<option value="${esc(p.login)}" ${k.opiekun === p.login ? 'selected' : ''}>${esc(p.imie || p.email)}</option>`).join('')}</select>`
      : k.rola === 'instalator' ? `<span class="small">${(k.hurtownie || []).map(h => `${esc((konta.find(x => x.login === h.login) || {}).nazwa || h.login)} (${esc(h.status)})`).join('<br>') || '—'}</span>` : '<span class="muted">—</span>'}</td>
    <td>${k.rola === 'hurtownia' ? `${k.rabat || 0}%` : '—'}</td>
    <td class="konto-ai">${polaAiKonta(k)}</td>
    <td class="small">${dataPl(k.utworzono)}</td>
    <td class="num">${!k.emailPotwierdzony && !BEZ_MAILA ? `<span class="plakietka pomaranczowa">e-mail niepotwierdzony</span> <button class="btn btn-sm" data-akcja="konto-potwierdz-email" data-login="${esc(k.login)}">Potwierdź e-mail</button><br>` : ''}
      ${czeka(k) ? `<span class="plakietka pomaranczowa">czeka na akceptację</span> <button class="btn btn-sm btn-primary" data-akcja="konto-akceptuj" data-login="${esc(k.login)}">Akceptuj</button><br>` : ''}
      <button class="btn btn-sm" data-akcja="konto-haslo" data-login="${esc(k.login)}">Nowe hasło</button>
      ${k.login !== KONTO.login ? `<button class="btn btn-sm" data-akcja="konto-usun" data-login="${esc(k.login)}">Usuń</button>` : ''}</td>
  </tr>`;
  return `<section class="panel">
    <h1>Konta i uprawnienia</h1>
    ${oczekujace.length ? `<p class="komunikat"><b>${oczekujace.length}</b> ${oczekujace.length === 1 ? 'konto czeka' : 'konta czekają'} na akceptację.</p>` : ''}
    <div class="opcje" style="margin-bottom:10px">${[['wszystkie', 'Wszystkie'], ...Object.entries(role)].map(([r, n]) => opcjaAkcja('konta-filtr', r, n, `${r === 'wszystkie' ? konta.length : konta.filter(k => k.rola === r).length}`, filtr === r)).join('')}</div>
    <div style="overflow-x:auto"><table class="tabela"><thead><tr><th>E-mail</th><th>Dane</th><th>Rola</th><th>Status</th><th>Opiekun / hurtownie</th><th>Rabat</th><th title="Analiza AI przez klucz API i miesięczny limit analiz">AI</th><th>Utworzono</th><th></th></tr></thead>
      <tbody>${[...widoczne.filter(czeka), ...widoczne.filter(k => !czeka(k))].map(wiersz).join('')}</tbody></table></div>
    <p class="small muted" style="margin-top:10px">Administrator – jedno konto: wszystko, w tym Dane (cennik, katalogi, AI). Pracownik – akceptuje swoje hurtownie, ich rabaty i zapytania. Hurtownia – potwierdza instalatorów/projektantów i odpowiada na ich zapytania oraz zapytania klientów. Instalator/projektant – pyta hurtownie o rabat, odpowiada klientom. Klient indywidualny – pyta hurtownie i instalatorów. Gość – konfigurator bez AI i bez zapisu wycen.</p>
  </section>`;
}

// ---------- Zużycie AI na konto (panel Dane, administrator) ----------
const liczbaTok = n => n >= 1e6 ? (n / 1e6).toLocaleString('pl-PL', { maximumFractionDigits: 2 }) + ' mln' : n >= 1e3 ? Math.round(n / 1e3).toLocaleString('pl-PL') + ' tys.' : String(n || 0);
const usd = n => '$' + (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nazwaMiesiaca = m => m === 'wszystko' ? 'cały okres' : new Date(m + '-01T12:00:00').toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });

function sekcjaZuzyciaAi() {
  const m = S.miesiacAi || '';
  const d = daneWidoku('ai-uzycie-' + (m || 'biezacy'), '/api/ai/uzycie?miesiac=' + encodeURIComponent(m));
  if (!d) return `<h3 style="margin:18px 0 6px">Zużycie AI na konto</h3>${ladowanieHtml}`;
  const kurs = d.kursUsd, pln = v => zl(v * kurs);
  const miesiace = [...new Set([new Date().toISOString().slice(0, 7), ...d.miesiace])];
  const wiersz = k => `<tr>
    <td><b>${esc(k.nazwa)}</b><div class="small muted">${esc(k.rolaNazwa || '')}${k.login !== k.nazwa ? ' · ' + esc(k.login) : ''}</div></td>
    <td class="num">${k.analizy}${k.api && k.subskrypcja ? `<div class="small muted">API ${k.api} · sub. ${k.subskrypcja}</div>` : ''}</td>
    <td class="num">${k.reczne || '—'}</td>
    <td class="num">${liczbaTok(k.wejscie + k.cache)}</td>
    <td class="num">${liczbaTok(k.wyjscie)}</td>
    <td class="num"><b>${usd(k.usd)}</b>${k.szacunek ? ' <span title="Część analiz modelem spoza cennika – koszt szacunkowy">≈</span>' : ''}</td>
    <td class="num">${pln(k.usd)}</td>
    <td class="small">${dataPl(k.ostatnio)}</td>
  </tr>`;
  return `<h3 style="margin:18px 0 6px">Zużycie AI na konto</h3>
    <div class="opcje" style="align-items:flex-end;margin-bottom:10px">
      <label class="pole">Okres <select class="tekst" data-pole="miesiacAi">
        ${miesiace.map(x => `<option value="${x}" ${(m || miesiace[0]) === x ? 'selected' : ''}>${nazwaMiesiaca(x)}</option>`).join('')}
        <option value="wszystko" ${m === 'wszystko' ? 'selected' : ''}>cały okres</option>
      </select></label>
      <label class="pole">Kurs USD <span style="display:flex;gap:6px"><input id="kurs-usd" class="tekst" value="${String(kurs).replace('.', ',')}" style="width:80px"> zł <button class="btn btn-sm" data-akcja="zapisz-kurs">Zapisz</button></span></label>
    </div>
    ${d.konta.length ? `<div style="overflow-x:auto"><table class="tabela">
      <thead><tr><th>Konto</th><th class="num">Analizy AI</th><th class="num">Tryb ręczny</th><th class="num">Tokeny wejścia</th><th class="num">Tokeny wyjścia</th><th class="num">Koszt</th><th class="num">≈ PLN</th><th>Ostatnio</th></tr></thead>
      <tbody>${d.konta.map(wiersz).join('')}</tbody>
      <tfoot><tr><td>Razem – ${esc(nazwaMiesiaca(d.miesiac))}</td><td class="num">${d.suma.analizy}</td><td class="num">${d.suma.reczne || '—'}</td><td class="num">${liczbaTok(d.suma.wejscie + d.suma.cache)}</td><td class="num">${liczbaTok(d.suma.wyjscie)}</td><td class="num">${usd(d.suma.usd)}</td><td class="num">${pln(d.suma.usd)}</td><td></td></tr></tfoot>
    </table></div>` : `<p class="muted">Brak użycia AI – ${esc(nazwaMiesiaca(d.miesiac))}.</p>`}
    <p class="small muted" style="margin:8px 0 0">Koszt wg cennika API Anthropic (Claude Opus 5: $5 / $25 za mln tokenów wejścia / wyjścia). W trybie <b>subskrypcji</b> to równowartość podawana przez Claude Code – faktycznie rozliczana limitem Twojego planu, nie fakturą. Tryb ręczny (claude.ai) liczymy tylko jako liczbę użyć.</p>`;
}

// ---------- Wskazówki dla AI z poprawek doradców (panel Dane, administrator) ----------
function sekcjaWskazowekAi() {
  const l = daneWidoku('ai-wskazowki', '/api/ai/wskazowki');
  if (!l) return `<h3 style="margin:18px 0 6px">Wskazówki dla AI</h3>${ladowanieHtml}`;
  return `<h3 style="margin:18px 0 6px">Wskazówki dla AI <span class="small muted">(${l.length})</span></h3>
    <p class="small muted" style="margin:0 0 8px">Powstają z poprawek w widoku „Propozycja AI” – AI stosuje je przy każdej kolejnej analizie. Usuń wskazówkę, jeśli jest błędna albo zbyt szczegółowa.</p>
    ${l.length ? `<table class="tabela"><thead><tr><th>Wskazówka</th><th>Z poprawki</th><th>Kto, kiedy</th><th></th></tr></thead><tbody>
      ${l.slice().reverse().map(w => `<tr><td><b>${esc(w.tekst)}</b></td><td class="small muted">${esc(w.poprawka || '')}</td><td class="small">${esc(w.login)}<br>${dataPl(w.data)}</td>
        <td><button class="btn btn-sm" data-akcja="usun-wskazowke" data-id="${esc(w.id)}">Usuń</button></td></tr>`).join('')}
    </tbody></table>` : '<p class="muted">Brak wskazówek – pojawią się, gdy ktoś poprawi propozycję AI.</p>'}`;
}

// ---------- Poczta (panel Dane, administrator) ----------
function sekcjaPoczty() {
  const p = daneWidoku('poczta', '/api/poczta');
  if (!p) return `<section class="panel"><h2>Poczta e-mail</h2>${ladowanieHtml}</section>`;
  const linki = t => esc(t).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return `<section class="panel">
    <h2>Poczta e-mail</h2>
    <p class="muted">Wiadomości z linkiem potwierdzającym rejestrację. Status: ${p.skonfigurowana ? `<span class="plakietka zielona">SMTP: ${esc(p.host)}:${p.port}</span>` : '<span class="plakietka pomaranczowa">poczta nieskonfigurowana</span>'}</p>
    <p class="komunikat info" style="margin:0 0 10px">${p.skonfigurowana
      ? 'Nowi użytkownicy potwierdzają adres linkiem z maila.'
      : 'Bez poczty nowe konta <b>akceptujesz ręcznie</b> w zakładce <b>Konta</b> (dostajesz powiadomienie 🔔). Użytkownik po rejestracji widzi komunikat, że konto musi zaakceptować administrator. Po skonfigurowaniu SMTP wróci potwierdzanie linkiem z maila.'}</p>
    <div class="siatka-pol">
      <label class="pole">Serwer SMTP <input id="smtp-host" class="tekst" value="${esc(p.host || '')}" placeholder="np. smtp.kontakt-simon.com.pl"></label>
      <label class="pole">Port <input id="smtp-port" class="tekst" type="number" value="${p.port || 587}" style="width:80px"></label>
      <label class="check"><input id="smtp-secure" type="checkbox" ${p.secure ? 'checked' : ''}><span>SSL/TLS (port 465)</span></label>
      <label class="pole">Użytkownik <input id="smtp-user" class="tekst" value="${esc(p.user || '')}" autocomplete="off"></label>
      <label class="pole">Hasło <input id="smtp-pass" class="tekst" type="password" autocomplete="new-password" placeholder="${p.maHaslo ? 'bez zmian' : ''}"></label>
      <label class="pole">Nadawca <input id="smtp-nadawca" class="tekst" value="${esc(p.nadawca || '')}" placeholder="Konfigurator &lt;konfigurator@firma.pl&gt;" style="width:280px"></label>
    </div>
    <div class="opcje" style="margin-top:10px;align-items:center">
      <button class="btn btn-primary btn-sm" data-akcja="poczta-zapisz">Zapisz</button>
      ${p.skonfigurowana ? '<button class="btn btn-sm" data-akcja="poczta-usun">Usuń SMTP</button>' : ''}
      <input id="smtp-test" class="tekst" placeholder="adres do testu (domyślnie Twój)" style="width:240px"><button class="btn btn-sm" data-akcja="poczta-test">Wyślij test</button>
    </div>
    <h3 style="margin-top:16px">Skrzynka testowa ${p.skrzynka.length ? `(${p.skrzynka.length}) <button class="btn-link small" data-akcja="poczta-wyczysc">wyczyść</button>` : ''}</h3>
    ${!p.skrzynka.length ? '<p class="muted small">Pusta.</p>' : p.skrzynka.map(m => `<details class="mail-testowy"><summary><b>${esc(m.temat)}</b> → ${esc(m.do)} <span class="muted small">${dataPl(m.data)}</span></summary><pre>${linki(m.tekst)}</pre></details>`).join('')}
  </section>`;
}

// Parametry z linku w mailu (?potwierdzenie=ok|blad) – komunikat na ekranie logowania
function obsluzParametryUrl() {
  const q = new URLSearchParams(location.search);
  // link z maila o nowej uwadze
  if (q.get('widok') === 'uwagi') {
    if (adminKS()) S.widok = 'uwagi';
    else { S.komunikatLogowania = 'Zaloguj się jako administrator, aby zobaczyć uwagi.'; S.poLogowaniu = 'uwagi'; S.widok = 'logowanie'; }
    history.replaceState(null, '', location.pathname);
    return;
  }
  if (!q.has('potwierdzenie')) return;
  if (q.get('potwierdzenie') === 'ok') {
    const oczekuje = q.get('status') === 'oczekuje';
    S.komunikatLogowania = oczekuje
      ? `Adres e-mail potwierdzony. Konto czeka jeszcze na akceptację ${q.get('rola') === 'hurtownia' ? 'opiekuna z Kontakt-Simon' : 'administratora'} – dostał(a) powiadomienie.`
      : 'Adres e-mail potwierdzony – możesz się zalogować.';
    S.komunikatLogowaniaTyp = 'ok';
  } else {
    S.komunikatLogowania = q.get('komunikat') || 'Nie udało się potwierdzić adresu e-mail.';
    S.komunikatLogowaniaTyp = 'blad';
  }
  S.niepotwierdzony = null;
  S.widok = 'logowanie';
  history.replaceState(null, '', location.pathname);
}

// ---------- Powiadomienia ----------
function widokPowiadomienia() {
  if (!KONTO) return widokLogowanie();
  return `<section class="panel"><h1>Powiadomienia</h1>
    ${!POWIADOMIENIA.length ? '<p class="muted">Brak powiadomień.</p>' : POWIADOMIENIA.map(p => `<div class="zapytanie ${p.przeczytane ? '' : 'nowe'}">
      <b>${esc(p.tytul)}</b> <span class="small muted">${dataPl(p.data)}</span>
      <p style="margin:6px 0 0">${esc(p.tresc)}</p>
      ${p.kod ? `<button class="btn btn-sm" style="margin-top:6px" data-akcja="${p.typ === 'zapytanie' ? 'idz" data-widok="zapytania' : 'wycena-otworz" data-kod="' + esc(p.kod)}">${p.typ === 'zapytanie' ? 'Przejdź do zapytań' : 'Otwórz wycenę ' + esc(p.kod)}</button>` : ''}
      ${p.typ === 'akceptacja' ? `<button class="btn btn-sm" style="margin-top:6px" data-akcja="idz" data-widok="${adminKS() ? 'konta' : 'klienci'}">Przejdź do akceptacji</button>` : ''}
      ${p.typ === 'uwaga' ? (adminKS() ? '<button class="btn btn-sm" style="margin-top:6px" data-akcja="idz" data-widok="uwagi">Przejdź do uwag</button>' : '<button class="btn btn-sm" style="margin-top:6px" data-akcja="uwaga-otworz">Moje uwagi</button>') : ''}
    </div>`).join('')}
  </section>`;
}

// ---------- Wycena w ofercie ----------
// Maksymalny rabat – reguly.json → rabatMaks (domyślnie 45%)
const rabatMaks = () => { const m = Number(typeof R !== 'undefined' && R && R.rabatMaks); return m >= 0 && m <= 100 && m ? m : 45; };
const rabatOferty = () => Math.max(0, Math.min(rabatMaks(), Number(S.oferta.rabat) || 0));

// Czy zastosowany rabat jest zatwierdzony (zapytanie przyznane lub rabat standardowy) – liczone lokalnie
function zatwierdzenieOferty() {
  const o = S.oferta, r = rabatOferty();
  if (!r) return null;
  // administrator i pracownik Kontakt-Simon – rabat zawsze zatwierdzony
  if (personelKS()) return { rabat: r, przez: 'Kontakt-Simon', rolaPrzez: 'pracownik', osoba: [KONTO.imie, KONTO.rola === 'admin' ? null : KONTO.stanowisko].filter(Boolean).join(', ') || null, rodzaj: 'personel' };
  if (!o.rabatZapytanie) return null;
  if (o.rabatZapytanie === 'standard' && KONTO && KONTO.rola === 'hurtownia' && Number(KONTO.rabat) === r) return { rabat: r, przez: 'Kontakt-Simon', rolaPrzez: 'pracownik', rodzaj: 'standardowy' };
  if (String(o.rabatZapytanie).startsWith('standard:') && KONTO && KONTO.rola === 'instalator') {
    const h = (KONTO.hurtownie || []).find(p => p.login === o.rabatZapytanie.slice(9) && p.status === 'aktywne');
    if (h && Number(h.rabat) === r) return { rabat: r, przez: o.zatwierdzenie && o.zatwierdzenie.przez || 'hurtownię', rolaPrzez: 'hurtownia', rodzaj: 'standardowy' };
  }
  const z = (o.zapytania || []).find(q => q.id === o.rabatZapytanie && q.status === 'przyznany');
  if (z && Number(z.rabat) === r) return { rabat: r, przez: z.doNazwa, rolaPrzez: z.doRola, osoba: z.odpowiedzialOsoba, data: z.odpowiedzData };
  return null;
}

// Dopisek do PDF/Excela o statusie rabatu
function adnotacjaRabatu() {
  const r = rabatOferty();
  if (!r) return '';
  const z = zatwierdzenieOferty();
  if (!z) return `Rabat ${r}% nie został zatwierdzony – wycena orientacyjna.`;
  const kto = z.rolaPrzez === 'pracownik' ? `Kontakt-Simon${z.osoba ? ` (${z.osoba})` : ''}` : z.rolaPrzez === 'hurtownia' ? `hurtownię ${z.przez}` : `instalatora / biuro projektowe ${z.przez}`;
  return `Wycena zatwierdzona przez ${kto}: rabat ${r}%${z.rodzaj === 'standardowy' ? ' (rabat standardowy)' : ''}${z.data ? `, ${new Date(z.data).toLocaleDateString('pl-PL')}` : ''}.`;
}

function wycenaDoOferty(w) {
  S.oferta = {
    projekt: w.projekt || '', klient: w.klient || '', zestawy: w.zestawy || [],
    kod: w.mozeEdytowac ? w.kod : null, kodZrodlowy: w.mozeEdytowac ? null : w.kod,
    rabat: w.rabat || 0, rabatZapytanie: w.rabatZapytanie || null, zatwierdzenie: w.zatwierdzenie || null,
    zapytania: w.zapytania || [], wlasciciel: w.wlasciciel, wlascicielNazwa: w.wlascicielNazwa
  };
  // zestawy osprzętu – nazwy i ceny produktów spoza słownika puszek
  if (typeof uzupelnijProduktyOsprzetu === 'function') uzupelnijProduktyOsprzetu().then(z => z && render());
}

async function zapiszWycene(cicho) {
  if (!KONTO || !S.oferta.zestawy.length) return null;
  try {
    const o = S.oferta;
    const w = await api('/api/wyceny', { method: 'POST', body: { kod: o.kod, oferta: { projekt: o.projekt, klient: o.klient, zestawy: o.zestawy, rabat: rabatOferty(), rabatZapytanie: o.rabatZapytanie } } });
    wycenaDoOferty(w);
    odswiezDane('wyceny-moje', 'wyceny-wszystkie');
    if (!cicho) toast(`Zapisano wycenę ${w.kod}`);
    zapisz();
    return w;
  } catch (e) { if (!cicho) toast(e.message); return null; }
}

// Zmiana w ofercie – bez automatycznego zapisu: oferta czeka na „Zapisz zmiany” (można z niej wyjść bez zapisywania)
function autoZapisz() {
  if (S.oferta.zestawy.length) S.oferta.zmieniona = true;
  zapisz();
}
// czy wychodząc z oferty, można coś stracić: niezapisana nowa oferta albo zmiany w zapisanej
const ofertaDoZapisania = () => S.oferta.zestawy.length > 0 && !S.oferta.kodZrodlowy && (!S.oferta.kod || !!S.oferta.zmieniona);

function panelWyceny() {
  if (!KONTO) {
    return `<div class="komunikat info" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <span>Zaloguj się, aby zapisać wycenę, otrzymać jej <b>kod</b> i zapytać o rabat.</span>
      <span><button class="btn btn-sm" data-akcja="konto-logowanie">Zaloguj</button> <button class="btn btn-sm btn-primary" data-akcja="konto-rejestracja">Załóż konto</button></span></div>`;
  }
  const o = S.oferta;
  const kod = o.kod ? `<div class="kod-wyceny"><span class="small muted">Kod wyceny</span><b>${esc(o.kod)}</b><button class="btn-link small" data-akcja="kopiuj-kod">kopiuj</button></div>` : '';
  const zrodlo = o.kodZrodlowy ? `<p class="komunikat info">Otwarto wycenę <b>${esc(o.kodZrodlowy)}</b>${o.wlascicielNazwa ? ` (${esc(o.wlascicielNazwa)})` : ''} – tylko do odczytu. Zapis utworzy Twoją kopię z nowym kodem.</p>` : '';
  // odpowiedzi na zapytania o rabat
  const zapytania = (o.zapytania || []).filter(() => !o.kodZrodlowy);
  const odp = zapytania.length ? `<div><b class="small">Zapytania o rabat</b>
    <table class="tabela" style="margin-top:4px"><tbody>${zapytania.map(z => `<tr>
      <td>${esc(z.doNazwa)}<div class="small muted">${esc({ pracownik: 'Kontakt-Simon', hurtownia: 'hurtownia', instalator: 'instalator / projektant' }[z.doRola] || '')} · ${dataPl(z.data)}</div></td>
      <td>${plakietkaZapytania(z.status)}${z.komentarz ? `<div class="small">„${esc(z.komentarz)}”</div>` : ''}</td>
      <td class="num">${z.status === 'przyznany' ? `<b>${z.rabat}%</b> ${o.rabatZapytanie === z.id && rabatOferty() === Number(z.rabat) ? '<span class="plakietka zielona">zastosowany</span>' : `<button class="btn btn-sm btn-primary" data-akcja="zastosuj-rabat" data-id="${esc(z.id)}">Zastosuj</button>`}` : ''}</td>
    </tr>`).join('')}</tbody></table></div>` : '';
  // rabat standardowy do zastosowania
  let standard = '';
  if (KONTO.rola === 'hurtownia' && KONTO.rabat && !(o.rabatZapytanie === 'standard' && rabatOferty() === KONTO.rabat)) standard = `<p class="komunikat info" style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><span>Twój rabat standardowy od Kontakt-Simon: <b>${KONTO.rabat}%</b></span><button class="btn btn-sm" data-akcja="zastosuj-standard" data-hurtownia="" data-rabat="${KONTO.rabat}">Zastosuj</button></p>`;
  if (KONTO.rola === 'instalator') {
    const najl = (KONTO.hurtownie || []).filter(h => h.status === 'aktywne' && h.rabat).sort((a, b) => b.rabat - a.rabat)[0];
    if (najl && !(o.rabatZapytanie === 'standard:' + najl.login && rabatOferty() === najl.rabat)) standard = `<p class="komunikat info" style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><span>Masz rabat standardowy od hurtowni: <b>${najl.rabat}%</b></span><button class="btn btn-sm" data-akcja="zastosuj-standard" data-hurtownia="${esc(najl.login)}" data-rabat="${najl.rabat}">Zastosuj</button></p>`;
  }
  // formularz zapytania o rabat
  let zapytaj = '';
  if (pytaORabat() && !o.kodZrodlowy && o.zestawy.length) {
    const adresaci = S.pokazZapytaj ? daneWidoku('adresaci', '/api/adresaci') : null;
    const wybrani = S.adresaciWybrani || [];
    const grupy = { hurtownia: 'Hurtownie', instalator: 'Instalatorzy / biura projektowe', pracownik: 'Kontakt-Simon' };
    zapytaj = `<details class="wyslij-opiekun" ${S.pokazZapytaj ? 'open' : ''}><summary class="btn btn-sm" data-akcja="pokaz-zapytaj">✉ Zapytaj o rabat${KONTO.rola === 'hurtownia' ? ' opiekuna w Kontakt-Simon' : ''}</summary>
      ${!S.pokazZapytaj ? '' : !adresaci ? ladowanieHtml : !adresaci.length ? '<p class="muted small">Brak dostępnych adresatów.</p>' : `<div style="margin-top:10px;display:grid;gap:8px">
        ${Object.entries(grupy).filter(([r]) => adresaci.some(a => a.rola === r)).map(([r, t]) => `<div><b class="small">${t}</b><div class="lista-wyboru">${adresaci.filter(a => a.rola === r).map(a => `<label class="check"><input type="checkbox" data-adresat="${esc(a.id)}" ${wybrani.includes(a.id) ? 'checked' : ''}><span>${esc(a.nazwa)}${a.opis ? ` <span class="muted small">– ${esc(a.opis)}</span>` : ''}${a.polecany ? ' <span class="plakietka niebieska">' + (KONTO.rola === 'hurtownia' ? 'Twój opiekun' : 'współpraca potwierdzona') + '</span>' : ''}${a.powiazanie === 'oczekuje' ? ' <span class="plakietka">współpraca niepotwierdzona</span>' : ''}</span></label>`).join('')}</div></div>`).join('')}
        <textarea id="wiadomosc-zapytania" class="tekst" rows="3" placeholder="Wiadomość, np. termin realizacji, wielkość projektu…"></textarea>
        <label class="pole">Proponowany rabat (opcjonalnie) <input id="rabat-proponowany" type="number" min="0" max="${rabatMaks()}" step="0.5"> %</label>
        <button class="btn btn-primary btn-sm" data-akcja="wyslij-zapytanie" style="justify-self:start">Wyślij zapytanie (${wybrani.length})</button>
      </div>`}</details>`;
  }
  return `<div class="panel-wyceny">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      ${kod || '<span class="muted small">Wycena nie jest jeszcze zapisana.</span>'}
      <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${o.kod && o.zmieniona ? '<span class="plakietka pomaranczowa">Niezapisane zmiany</span>' : ''}
        <button class="btn btn-sm ${!o.kod || o.zmieniona ? 'btn-primary' : ''}" data-akcja="wycena-zapisz" ${o.zestawy.length && (!o.kod || o.zmieniona) ? '' : 'disabled'}>${o.kod ? (o.zmieniona ? 'Zapisz zmiany' : '✓ Zapisano') : 'Zapisz wycenę'}</button>
        ${o.zestawy.length ? '<button class="btn btn-sm" data-akcja="zamknij-oferte" title="Wyjście z oferty – z zapisem albo bez">Zamknij ofertę</button>' : ''}
      </span>
    </div>
    ${zrodlo}${standard}${odp}${zapytaj}
  </div>`;
}

// ---------- Akcje ----------
// Zwraca true, gdy akcja została obsłużona (app.js wtedy renderuje), 'bez' – obsłużona bez renderu
async function akcjeKont(a, el) {
  switch (a) {
    case 'konto-logowanie': S.komunikatLogowania = null; S.komunikatLogowaniaTyp = null; S.niepotwierdzony = null; S.widok = 'logowanie'; return true;
    case 'poczta-zapisz': {
      const v = id => ($('#smtp-' + id) || {}).value;
      try { await api('/api/poczta', { method: 'POST', body: { host: v('host'), port: v('port'), secure: $('#smtp-secure').checked, user: v('user'), pass: v('pass'), nadawca: v('nadawca') } }); odswiezDane('poczta'); toast('Zapisano ustawienia poczty'); }
      catch (e) { toast(e.message); }
      return true;
    }
    case 'poczta-usun':
      if (!confirm('Usunąć ustawienia SMTP? Maile wrócą do skrzynki testowej.')) return 'bez';
      await api('/api/poczta', { method: 'POST', body: { usun: true } }); odswiezDane('poczta'); return true;
    case 'poczta-test':
      try { const r = await api('/api/poczta/test', { method: 'POST', body: { do: ($('#smtp-test') || {}).value } }); odswiezDane('poczta'); toast(r.tryb === 'smtp' ? 'Wysłano testowy e-mail' : 'Zapisano w skrzynce testowej (brak SMTP)'); }
      catch (e) { toast('Błąd wysyłki: ' + e.message); }
      return true;
    case 'poczta-wyczysc': await api('/api/poczta/skrzynka', { method: 'DELETE' }); odswiezDane('poczta'); return true;
    case 'konto-rejestracja': S.widok = 'rejestracja'; odswiezDane('rej-pracownicy', 'rej-hurtownie'); return true;
    case 'konto-wyslij-link': {
      const email = ($('#f-email') && $('#f-email').value) || S.niepotwierdzony;
      try { await api('/api/konto/wyslij-link', { method: 'POST', body: { email } }); toast(`Wysłano nowy link na ${email}`); }
      catch (e) { toast(e.message); }
      return 'bez';
    }
    case 'konto-potwierdz-email':
      try { await api('/api/konta/' + encodeURIComponent(el.dataset.login), { method: 'POST', body: { emailPotwierdzony: true } }); odswiezDane('konta'); toast('Potwierdzono adres e-mail'); }
      catch (e) { toast(e.message); }
      return true;
    case 'konto-zaloguj': {
      try {
        S.ostatniEmail = $('#f-email').value;
        const r = await fetch('/api/konto/logowanie', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('#f-email').value, haslo: $('#f-haslo').value }) });
        const j = await r.json();
        if (!r.ok) {
          if (j.kod === 'niepotwierdzony') { S.niepotwierdzony = $('#f-email').value.trim().toLowerCase(); S.komunikatLogowania = null; return true; }
          throw new Error(j.blad);
        }
        S.niepotwierdzony = null;
        await wczytajKonto(); odswiezWszystko();
        toast(`Witaj, ${j.konto.imie || j.konto.nazwa}!`);
        // „Zaloguj się i zapisz” z okna zamykania oferty – od razu zapisz ofertę gościa jako wycenę
        if (S.poLogowaniu === 'oferta' && S.oferta.zestawy.length && !S.oferta.kod) await zapiszWycene(false);
        S.widok = S.poLogowaniu || 'start'; S.poLogowaniu = null;
        if (typeof odswiezAi === 'function') await odswiezAi();
      } catch (e) { toast(e.message); return 'bez'; }
      return true;
    }
    case 'konto-zarejestruj': {
      const r = S.rej || {};
      if (r.haslo !== r.haslo2) { toast('Hasła nie są takie same'); return 'bez'; }
      try {
        const typ = PIERWSZE_KONTO ? 'admin' : (r.typ || 'hurtownia');
        // region: pracownik wybiera sam, pozostali – z miasta / oddziału
        const region = typ === 'pracownik' ? r.region : ((typ === 'hurtownia' ? regionDlaMiasta(r.oddzial, r.woj) : regionDlaMiasta(r.miasto, r.woj)) || {}).id;
        const j = await api('/api/konto/rejestracja', { method: 'POST', body: { ...r, typ, region: region || null } });
        if (j.akceptacja) {
          // tryb bez poczty – konto aktywuje administrator (hurtownię także opiekun)
          S.komunikatLogowania = j.konto.rola === 'hurtownia'
            ? 'Konto założone. Musi je jeszcze zaakceptować wybrany opiekun z Kontakt-Simon lub administrator – po akceptacji zalogujesz się swoim e-mailem i hasłem.'
            : 'Konto założone. Musi je jeszcze zaakceptować administrator – po akceptacji zalogujesz się swoim e-mailem i hasłem.';
          S.komunikatLogowaniaTyp = 'ok';
          S.ostatniEmail = j.konto.email;
          S.widok = 'logowanie';
        } else if (!j.pierwsze) {
          // każde konto (poza pierwszym – administratorem) potwierdza adres e-mail przed logowaniem
          const dalej = j.konto.status === 'oczekuje'
            ? (j.konto.rola === 'hurtownia' ? ' Po potwierdzeniu adresu konto zaakceptuje wybrany opiekun z Kontakt-Simon.' : ' Po potwierdzeniu adresu konto zaakceptuje administrator.')
            : ' Po potwierdzeniu adresu możesz się zalogować.';
          S.komunikatLogowania = j.mail && j.mail.wyslano === false
            ? `Konto założone, ale nie udało się wysłać wiadomości (${j.mail.blad}). Spróbuj „Wyślij link ponownie” albo skontaktuj się z administratorem.`
            : `Konto założone. Wysłaliśmy link potwierdzający na ${j.konto.email} – kliknij go, aby aktywować logowanie.${dalej}${j.mail && j.mail.tryb === 'skrzynka-testowa' ? ' (Tryb testowy: wiadomość jest w skrzynce testowej administratora w zakładce Dane.)' : ''}`;
          S.komunikatLogowaniaTyp = j.mail && j.mail.wyslano === false ? 'blad' : 'ok';
          S.ostatniEmail = j.konto.email;
          S.widok = 'logowanie';
        } else {
          await api('/api/konto/logowanie', { method: 'POST', body: { email: j.konto.email, haslo: r.haslo } });
          await wczytajKonto(); odswiezWszystko();
          toast(j.pierwsze ? 'Utworzono konto administratora' : 'Konto założone – witaj!');
          S.widok = 'start';
          if (typeof odswiezAi === 'function') await odswiezAi();
        }
        S.rej = {};
      } catch (e) { toast(e.message); return 'bez'; }
      return true;
    }
    case 'konto-wyloguj':
      await api('/api/konto/wylogowanie', { method: 'POST' });
      KONTO = null; POWIADOMIENIA = []; odswiezWszystko();
      Object.assign(S.oferta, { kod: null, kodZrodlowy: null, zapytania: [], rabatZapytanie: null, zatwierdzenie: null });
      if (['wyceny', 'zapytania', 'klienci', 'moje-hurtownie', 'konta', 'admin', 'powiadomienia'].includes(S.widok)) S.widok = 'start';
      toast('Wylogowano'); return true;
    case 'wyceny-zakres': S.zakresWycen = el.dataset.wartosc; filtrWycen().autor = ''; return true;
    case 'wyceny-filtr-czysc': S.filtrWycen = { tekst: '', klient: '', autor: '' }; return true;
    case 'konta-filtr': S.filtrKont = el.dataset.wartosc; return true;
    case 'wycena-po-kodzie': case 'wycena-otworz': {
      const kod = (el.dataset.kod || ($('#kod-wyceny') && $('#kod-wyceny').value) || '').trim().toUpperCase();
      if (!kod) { toast('Wpisz kod wyceny'); return 'bez'; }
      if (!KONTO) { S.komunikatLogowania = `Zaloguj się, aby otworzyć wycenę ${kod}.`; S.poLogowaniu = 'wyceny'; S.widok = 'logowanie'; return true; }
      try { wycenaDoOferty(await api('/api/wyceny/' + encodeURIComponent(kod))); S.widok = 'oferta'; }
      catch (e) { toast(e.message); return 'bez'; }
      return true;
    }
    case 'wycena-usun':
      if (!confirm(`Usunąć wycenę ${el.dataset.kod}?`)) return 'bez';
      try { await api('/api/wyceny/' + encodeURIComponent(el.dataset.kod), { method: 'DELETE' }); if (S.oferta.kod === el.dataset.kod) S.oferta.kod = null; odswiezDane('wyceny-moje', 'wyceny-wszystkie'); toast('Usunięto wycenę'); }
      catch (e) { toast(e.message); }
      return true;
    case 'wycena-zapisz': await zapiszWycene(false); return true;
    case 'kopiuj-kod': try { await navigator.clipboard.writeText(S.oferta.kod); toast('Skopiowano kod ' + S.oferta.kod); } catch { window.prompt('Kod wyceny:', S.oferta.kod); } return 'bez';
    case 'pokaz-zapytaj': S.pokazZapytaj = !S.pokazZapytaj; if (S.pokazZapytaj) odswiezDane('adresaci'); return true;
    case 'wyslij-zapytanie': {
      const doKogo = S.adresaciWybrani || [];
      if (!doKogo.length) { toast('Zaznacz co najmniej jednego adresata'); return 'bez'; }
      const w0 = await zapiszWycene(true);
      if (!w0) { toast('Nie udało się zapisać wyceny'); return 'bez'; }
      try {
        const w = await api(`/api/wyceny/${encodeURIComponent(S.oferta.kod)}/zapytania`, { method: 'POST', body: { do: doKogo, wiadomosc: $('#wiadomosc-zapytania').value, rabatProponowany: $('#rabat-proponowany').value } });
        wycenaDoOferty(w); S.adresaciWybrani = []; S.pokazZapytaj = false; odswiezDane('wyceny-moje');
        toast(`Wysłano zapytanie do ${doKogo.length} ${doKogo.length === 1 ? 'adresata' : 'adresatów'}`);
      } catch (e) { toast(e.message); }
      return true;
    }
    case 'zastosuj-rabat': {
      const z = (S.oferta.zapytania || []).find(q => q.id === el.dataset.id);
      if (!z) return 'bez';
      S.oferta.rabat = Number(z.rabat); S.oferta.rabatZapytanie = z.id;
      await zapiszWycene(true); toast(`Zastosowano rabat ${z.rabat}% od: ${z.doNazwa}`);
      return true;
    }
    case 'zastosuj-standard':
      S.oferta.rabat = Number(el.dataset.rabat); S.oferta.rabatZapytanie = el.dataset.hurtownia ? 'standard:' + el.dataset.hurtownia : 'standard';
      if (S.widok !== 'oferta') S.widok = 'oferta';
      await zapiszWycene(true); toast(`Zastosowano rabat standardowy ${el.dataset.rabat}%`);
      return true;
    case 'zapytanie-odpowiedz': {
      const id = el.dataset.id;
      try {
        await api(`/api/wyceny/${encodeURIComponent(el.dataset.kod)}/zapytania/${encodeURIComponent(id)}`, { method: 'POST', body: { decyzja: el.dataset.decyzja, rabat: $('#rabat-' + id).value, komentarz: $('#kom-' + id).value } });
        odswiezDane('zapytania'); toast(el.dataset.decyzja === 'przyznany' ? 'Przyznano rabat – pytający dostał powiadomienie' : 'Odrzucono zapytanie');
      } catch (e) { toast(e.message); }
      return true;
    }
    case 'klient-akceptuj': case 'klient-odrzuc': case 'klient-rabat': {
      const login = el.dataset.login;
      const hurt = KONTO.rola === 'hurtownia';
      let zmiany;
      if (a === 'klient-rabat') zmiany = { rabat: $('#rabatstd-' + CSS.escape(login)).value };
      else if (hurt) zmiany = { powiazanie: a === 'klient-akceptuj' ? 'aktywne' : 'odrzucone' };
      else zmiany = { status: a === 'klient-akceptuj' ? 'aktywne' : 'zablokowane' };
      try { await api('/api/konta/' + encodeURIComponent(login), { method: 'POST', body: zmiany }); odswiezDane('konta'); toast('Zapisano'); }
      catch (e) { toast(e.message); }
      return true;
    }
    case 'dodaj-hurtownie': {
      const h = $('#nowa-hurtownia').value;
      if (!h) { toast('Wybierz hurtownię'); return 'bez'; }
      try { await api('/api/konto/hurtownie', { method: 'POST', body: { hurtownia: h } }); await wczytajKonto(); toast('Dodano – hurtownia dostała powiadomienie'); }
      catch (e) { toast(e.message); }
      return true;
    }
    case 'konto-akceptuj':
      try { await api('/api/konta/' + encodeURIComponent(el.dataset.login), { method: 'POST', body: { status: 'aktywne' } }); odswiezDane('konta'); toast('Konto zaakceptowane – użytkownik dostał powiadomienie'); }
      catch (e) { toast(e.message); }
      return true;
    case 'konto-haslo': {
      const h = prompt(`Nowe hasło dla ${el.dataset.login} (min. 8 znaków):`);
      if (!h) return 'bez';
      try { await api('/api/konta/' + encodeURIComponent(el.dataset.login), { method: 'POST', body: { haslo: h } }); toast('Zmieniono hasło'); }
      catch (e) { toast(e.message); }
      return 'bez';
    }
    case 'konto-usun':
      if (!confirm(`Usunąć konto ${el.dataset.login}? Tej operacji nie można cofnąć.`)) return 'bez';
      try { await api('/api/konta/' + encodeURIComponent(el.dataset.login), { method: 'DELETE' }); odswiezDane('konta'); toast('Usunięto konto'); }
      catch (e) { toast(e.message); }
      return true;
  }
  return false;
}

// Pola wyboru: hurtownie przy rejestracji, adresaci zapytania, zmiany w tabeli kont
document.addEventListener('change', async e => {
  const el = e.target;
  if (!el.dataset) return;
  if (el.dataset.rejHurtownia) {
    S.rej = S.rej || {};
    const w = new Set(S.rej.hurtownie || []);
    if (el.checked) w.add(el.dataset.rejHurtownia); else w.delete(el.dataset.rejHurtownia);
    S.rej.hurtownie = [...w];
    return;
  }
  if (el.dataset.adresat) {
    const w = new Set(S.adresaciWybrani || []);
    if (el.checked) w.add(el.dataset.adresat); else w.delete(el.dataset.adresat);
    S.adresaciWybrani = [...w];
    const b = document.querySelector('[data-akcja="wyslij-zapytanie"]');
    if (b) b.textContent = `Wyślij zapytanie (${S.adresaciWybrani.length})`;
    return;
  }
  if (el.dataset.akcjaZmiana !== 'konto-zmien') return;
  const wartosc = el.type === 'checkbox' ? el.checked : el.value;
  try { await api('/api/konta/' + encodeURIComponent(el.dataset.login), { method: 'POST', body: { [el.dataset.poleKonta]: wartosc } }); toast(el.dataset.poleKonta === 'ai' ? (wartosc ? 'Włączono AI – użytkownik dostał powiadomienie' : 'Wyłączono AI') : 'Zapisano'); }
  catch (err) { toast(err.message); }
  odswiezDane('konta');
  render();
});
