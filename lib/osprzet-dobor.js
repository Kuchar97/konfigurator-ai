// Dobór produktów osprzętu dla pozycji zapytania (seria + kolor) – logika przeniesiona z AI Takeoff (takeoff/match.py).
// Pozycja: { nazwa (znormalizowana, np. „Łącznik schodowy podwójny”), ilosc, kolor? } → składniki z produktami,
// kandydatami do ręcznego wyboru i ramką n-krotną.
const fs = require('fs');
const path = require('path');
const { slownik } = require('./osprzet-slownik');
const simon100 = require('./simon100');

const PLIK_REGUL = path.join(__dirname, '..', 'data', 'reguly-osprzet.json');
const MOD = '(moduł)';

const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
// fraza „a|b” = a albo b (np. kod mechanizmu albo słowo opisu)
const ma = (nazwa, fraza) => fraza.split('|').some(f => nazwa.includes(f));
const zaczyna = (nazwa, fraza) => fraza.split('|').some(f => nazwa.startsWith(f));

function regulyOsprzetu() { return JSON.parse(fs.readFileSync(PLIK_REGUL, 'utf8')); }

// „@gniazdoBez” → lista z sekcji „listy”
const lista = (v, R) => (typeof v === 'string' && v.startsWith('@') ? (R.listy || {})[v.slice(1)] || [] : v || []);

function regulaDla(nazwa, R) {
  const tekst = norm(nazwa).replace(/_/g, ' ');
  for (const { wzor, regula } of R.reguly) {
    const m = tekst.match(new RegExp(wzor, 'i'));
    if (!m) continue;
    if (!regula) return null;
    const g1 = m[1];
    return {
      ...regula,
      skladniki: regula.skladniki.map(s => ({
        ...s,
        bez: lista(s.bez, R),
        zawiera: (s.zawiera || []).map(w => (g1 ? w.replace('{1}', g1) : w)),
        ilosc: Number(String(s.ilosc ?? 1).replace('{1}', g1 || '1')) || 1
      }))
    };
  }
  return null;
}

// porządek: aktywne, z ceną, wersja podstawowa (najkrótsza nazwa)
const bazowo = p => [p.status !== 'aktywny' ? 1 : 0, p.cena == null ? 1 : 0, p.nazwa.length];
const porownaj = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

// Dopasowanie po frazach w nazwie, stopniowo luźniejsze (serie nazywają produkty różnie: „(moduł)” w 54/55,
// „(mechanizm)” w 82/100, brak dopisku w Akord). Zwraca [produkty od najlepszego, przybliżone?].
function wybierzPoFrazach(produkty, sk) {
  const potrzeba = (sk.zawiera || []).map(norm), unikaj = (sk.bez || []).map(norm);
  const nazwy = produkty.map(p => [p, norm(p.nazwa)]);
  const sortuj = arr => arr.sort((a, b) => porownaj(bazowo(a), bazowo(b)));
  // 1) wszystkie frazy, żadnej wykluczonej
  let traf = nazwy.filter(([, n]) => potrzeba.every(w => ma(n, w)) && !unikaj.some(w => ma(n, w))).map(([p]) => p);
  if (traf.length || !potrzeba.length) return [sortuj(traf), false];
  // 2) bez wymogu „(moduł)” – inna konwencja nazw serii (to nie przybliżenie)
  const potrzeba2 = potrzeba.filter(w => w !== MOD);
  traf = nazwy.filter(([, n]) => potrzeba2.every(w => ma(n, w)) && !unikaj.some(w => ma(n, w))).map(([p]) => p);
  if (traf.length) return [sortuj(traf), false];
  // 3) nazwa zaczyna się frazą główną – ranking wg zgodności cech (wykluczona cecha waży podwójnie)
  const rdzen = potrzeba2[0];
  const kand = nazwy.filter(([, n]) => zaczyna(n, rdzen));
  if (!kand.length) return [[], false];
  const ocena = ([p, n]) => [-(potrzeba2.filter(w => ma(n, w)).length - 2 * unikaj.filter(w => ma(n, w)).length), ...bazowo(p)];
  return [kand.sort((a, b) => porownaj(ocena(a), ocena(b))).map(([p]) => p), true];
}

const wKolorze = (lista, kolor) => lista.find(p => norm(p.kolor) === norm(kolor)) || null;

// Propozycje do ręcznego wyboru: dopasowane (od najlepszego), potem pozostałe produkty tego samego rodzaju
// w serii i kolorze (np. inne gniazda) – ranking wg zgodności fraz
function zPokrewnymi(traf, produkty, sk, kolor, ile = 15) {
  const potrzeba = (sk.zawiera || []).map(norm), unikaj = (sk.bez || []).map(norm);
  const wKol = p => !p.kolor || norm(p.kolor) === norm(kolor);
  const rodzaje = new Set(traf.map(p => p.rodzaj));
  if (!rodzaje.size && potrzeba[0]) { const w = potrzeba[0].split(' ')[0]; rodzaje.add(w.charAt(0).toUpperCase() + w.slice(1)); }
  const ocena = p => { const n = norm(p.nazwa); return [-potrzeba.filter(w => ma(n, w)).length, unikaj.filter(w => ma(n, w)).length, ...bazowo(p)]; };
  const juz = new Set(traf.map(p => p.symbol));
  const reszta = produkty.filter(p => wKol(p) && rodzaje.has(p.rodzaj) && !juz.has(p.symbol)).sort((a, b) => porownaj(ocena(a), ocena(b)));
  return [...traf.filter(wKol), ...reszta].slice(0, ile);
}

// Kolory modułów serii: z reguł (koloryModulow), a gdy brak wpisu – kolory, w których seria ma i gniazdo,
// i łącznik jednobiegunowy (bez kolorów ramek, klawiszy, gniazd DATA); ostatecznie wszystkie kolory serii
function koloryModulow(seria, pozycje, R) {
  const zRegul = ((R.koloryModulow || {})[seria] || []).filter(k => pozycje.some(p => norm(p.kolor) === norm(k)));
  if (zRegul.length) return zRegul;
  const w = re => new Set(pozycje.filter(p => p.kolor && p.rodzaj !== 'Ramka' && re.test(p.nazwa)).map(p => p.kolor));
  const gn = w(/^gniazdo wtyczkowe/i), la = w(/^łącznik jednobiegunowy/i);
  const oba = koloryGrupy(pozycje).filter(k => gn.has(k) && la.has(k));
  return oba.length ? oba : koloryGrupy(pozycje);
}

// Kolor z zapytania → kolor modułów serii: dokładnie albo po rdzeniu pierwszego słowa
// („czarne” → „czarny mat”, „białe” → „biały mat”, „grafit” → „grafitowy mat”)
function kolorSerii(k, kolory) {
  if (!k) return null;
  const rdzen = s => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').split(/[\s,]+/)[0].slice(0, 4);
  return kolory.find(x => norm(x) === norm(k)) || (rdzen(k).length >= 4 ? kolory.find(x => rdzen(x) === rdzen(k)) : null) || null;
}

// Kolory grupy od najczęstszego
function koloryGrupy(pozycje) {
  const ile = {};
  for (const p of pozycje) if (p.kolor) ile[p.kolor] = (ile[p.kolor] || 0) + 1;
  return Object.entries(ile).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

// Linie ramek serii (reguly-osprzet.json → linieRamek): Simon 55 → LINE / DUO / Nature (fraza w nazwie),
// Simon 54 → Premium / Nature (osobne grupy cennika). Serie bez wpisu – jedna linia: ramki z własnej grupy.
function linieRamek(seria, R, S) {
  const linie = ((R.linieRamek || {})[seria] || [{ nazwa: '', grupa: seria }]).filter(l => S.grupy[l.grupa]);
  return linie.length ? linie : [{ nazwa: '', grupa: seria }];
}
const ramkiLinii = (linia, S) => (S.grupy[linia.grupa] || []).filter(p => p.rodzaj === 'Ramka' && (!linia.zawiera || norm(p.nazwa).includes(norm(linia.zawiera))));
const grupyRamek = (seria, R, S) => [...new Set(linieRamek(seria, R, S).map(l => l.grupa))];

// kompaktowy opis produktu dla przeglądarki
const krotko = p => p && { symbol: p.symbol, nazwa: p.nazwa, kolor: p.kolor, grupa: p.grupa, cena: p.cena, jm: p.jm, status: p.status, link: p.link };

// Dobór dla listy pozycji w serii i kolorze.
// opcje: { seria, kolor, liniaRamek, kolorRamek, ramki: true|false }
function dobierz(pozycje, opcje = {}) {
  const S = slownik();
  if (!S) throw Object.assign(new Error('Brak słownika osprzętu – wgraj cennik w zakładce Dane.'), { status: 503 });
  const R = regulyOsprzetu();
  const seria = opcje.seria;
  const produktySerii = S.grupy[seria];
  if (!produktySerii) throw Object.assign(new Error(`Nie ma serii „${seria}” w cenniku.`), { status: 400 });
  const uniwersalne = (R.uniwersalne || []).flatMap(g => S.grupy[g] || []);
  // ramki z innych grup rodziny (Simon 54 → Simon 54 Premium / Nature) też w puli produktów
  const ramkiRodziny = grupyRamek(seria, R, S).filter(g => g !== seria).flatMap(g => S.grupy[g].filter(p => p.rodzaj === 'Ramka'));
  const produkty = [...produktySerii, ...uniwersalne, ...ramkiRodziny];
  const kolory = koloryModulow(seria, produktySerii, R);
  const kolor = opcje.kolor && kolory.some(k => norm(k) === norm(opcje.kolor)) ? kolory.find(k => norm(k) === norm(opcje.kolor)) : kolory[0] || '';
  // ramki: wybrana linia (LINE / DUO / Nature, Premium / Nature…)
  const bezRamek = (R.bezRamek || []).includes(seria);
  const linie = linieRamek(seria, R, S);
  const linia = linie.find(l => l.nazwa === opcje.liniaRamek) || linie[0];
  const grupaRamek = linia.nazwa ? `${seria} ${linia.nazwa}`.replace(`${seria} ${seria}`, seria) : seria;
  const produktyRamek = ramkiLinii(linia, S);
  const wLinii = new Set(produktyRamek.map(p => p.symbol));
  const ramkaBez = R.ramkaBez || ['karton-gips', 'antybakter'];
  const koloryRamek = koloryGrupy(produktyRamek);
  const kolorRamek = opcje.kolorRamek && koloryRamek.some(k => norm(k) === norm(opcje.kolorRamek)) ? opcje.kolorRamek
    : koloryRamek.find(k => norm(k) === norm(kolor)) || koloryRamek[0] || '';
  // ramki są osobnymi pozycjami „Ramka n-krotna” (z zapytania albo przycisku „Dobierz ramki”); doklejanie ramki do każdej
  // pozycji tylko na wyraźne życzenie (opcje.ramki === true)
  const ramkiAuto = !bezRamek && opcje.ramki === true;
  // krotności ramek dostępne w wybranej linii – dla przycisku „Dobierz ramki”
  // Simon 100 – ramki składane razem z punktem (przycisk „Dobierz ramki” niepotrzebny), chyba że zapytanie ma własne ramki
  const komplety = seria === 'Simon 100';
  const ramkiWZapytaniu = pozycje.some(p => !p.kod && /\bramka \d-krotn/i.test(p.nazwa || ''));
  const krotnosciRamek = bezRamek || komplety ? [] : [...new Set(produktyRamek.filter(p => p.krotnosc >= 1 && p.krotnosc <= 5 && /^ramka/i.test(p.nazwa) && !ramkaBez.some(w => norm(p.nazwa).includes(w))).map(p => p.krotnosc))].sort((a, b) => a - b);

  const wynik = pozycje.map((poz, i) => {
    const kolorPoz = kolorSerii(poz.kolor, kolory) || kolor;
    const out = { id: poz.id || `p${i + 1}`, zrodlo: poz.zrodlo || poz.nazwa, nazwa: poz.nazwa, ilosc: Math.max(1, Number(poz.ilosc) || 1), kolor: kolorPoz, skladniki: [] };
    // pozycja dodana konkretnym kodem (np. z pola „Dodaj pozycję”) – dokładnie ten produkt, bez reguł i ramek
    if (poz.kod) {
      const p = poSymbolu(poz.kod);
      out.kod = poz.kod;
      out.skladniki.push({ rola: 'produkt', czesc: poz.nazwa, naPunkt: 1, produkt: krotko(p), przyblizone: false, kandydaci: p ? [krotko(p)] : [],
        uwaga: p ? '' : `nie ma kodu ${poz.kod} w cenniku` });
      return out;
    }
    const regula = regulaDla(poz.nazwa, R);
    if (!regula) {
      out.uwaga = 'nie rozpoznano typu – wybierz produkt ręcznie';
      out.skladniki.push({ rola: 'produkt', czesc: poz.nazwa, naPunkt: 1, produkt: null, kandydaci: [], przyblizone: false });
      return out;
    }
    // Simon 100: punkt składany od zera – mechanizmy + klawisze/pokrywy + ramka Minimal/Matrix + uchwyt montażowy (lib/simon100.js)
    if (seria === 'Simon 100') {
      const s100 = simon100.punkt(poz, { kolor: kolorPoz, kolorRamek, ramki: !ramkiWZapytaniu, produkty: produktySerii, krotko });
      out.skladniki = s100.skladniki;
      if (s100.uwaga) out.uwaga = s100.uwaga;
      if (/ramka \d-krotn/i.test(poz.nazwa)) out.ramka = true;
      return out;
    }
    let moduly = 0;
    for (const sk of regula.skladniki) {
      // ramka zamówiona wprost: z wybranej linii ramek i w kolorze ramek
      const toRamka = (sk.zawiera || []).some(w => /^ramka/i.test(w));
      const pula = toRamka ? produkty.filter(p => p.rodzaj === 'Ramka' && (wLinii.has(p.symbol) || !produktyRamek.length)) : produkty;
      const [traf, przyblizone] = wybierzPoFrazach(pula, sk);
      // ramka: kolor ustawiony w tym wierszu (kolorRamki) albo wspólny kolor ramek
      const kolorSk = toRamka ? (kolorSerii(poz.kolorRamki, koloryRamek) || kolorRamek) : kolorPoz;
      if (toRamka) { out.kolor = kolorSk; out.ramka = true; }
      // produkt w wybranym kolorze; gdy go nie ma (np. gniazdo DATA tylko czerwone) – najlepszy w innym kolorze, z oznaczeniem
      const wKol = wKolorze(traf, kolorSk);
      const najlepszy = wKol || (traf.length ? traf[0] : null);
      const innyKolor = !!(najlepszy && !wKol && najlepszy.kolor && kolorSk);
      moduly += sk.ilosc;
      out.skladniki.push({
        rola: 'produkt', czesc: sk.czesc || (sk.zawiera || [sk.kod || ''])[0], naPunkt: sk.ilosc,
        produkt: krotko(najlepszy), przyblizone: !!(najlepszy && przyblizone), innyKolor,
        kandydaci: zPokrewnymi(traf, pula, sk, kolorSk).map(krotko),
        uwaga: najlepszy ? '' : `brak w ${toRamka ? grupaRamek : 'serii ' + seria}${kolorSk ? ' / ' + kolorSk : ''} – wybierz ręcznie`
      });
    }
    // łącznik / przycisk IP44: zwykły moduł + uszczelka IP44 do ramki 1-krotnej (CU1 w Simon 10, TU1 w Simon 55),
    // jeśli seria ją ma (np. ramki Simon 54 PREMIUM są już IP20/IP44 – wtedy bez uszczelki)
    if (/\bip ?44\b/i.test(poz.nazwa) && /łącznik|przycisk|klawisz/i.test(poz.nazwa) && out.skladniki.every(s => !s.produkt || !/ip ?44/i.test(s.produkt.nazwa))) {
      const uszczelki = produktySerii.filter(p => /uszczelk/i.test(p.nazwa) && !/gniazd/i.test(p.nazwa));
      const uszczelka = uszczelki.find(p => /ramki 1-krotnej/i.test(p.nazwa)) || uszczelki[0];
      if (uszczelka) out.skladniki.push({ rola: 'produkt', czesc: 'uszczelka IP44', naPunkt: 1, produkt: krotko(uszczelka), przyblizone: false, kandydaci: uszczelki.map(krotko), uwaga: '' });
    }
    const n = regula.ramka ?? moduly;
    if (ramkiAuto && n > 0 && n <= 5) {
      const ramki = produktyRamek.filter(p => p.krotnosc === n && /^ramka/i.test(p.nazwa) && !ramkaBez.some(w => norm(p.nazwa).includes(w)))
        .sort((a, b) => porownaj(bazowo(a), bazowo(b)));
      const ramka = wKolorze(ramki, kolorRamek);
      out.skladniki.push({ rola: 'ramka', czesc: `ramka ${n}-krotna`, naPunkt: 1, produkt: krotko(ramka), przyblizone: false,
        // ramki n-krotne w kolorze ramek (wszystkie odmiany linii, np. PREMIUM / szklane / metalowe)
        kandydaci: ramki.filter(p => norm(p.kolor) === norm(kolorRamek)).concat(ramki.filter(p => norm(p.kolor) !== norm(kolorRamek))).slice(0, 20).map(krotko),
        uwaga: ramka ? '' : `brak ramki ${n}-krotnej w ${grupaRamek}${kolorRamek ? ' / ' + kolorRamek : ''}` });
    }
    return out;
  });
  return { seria, kolor, kolory, liniaRamek: linia.nazwa, linieRamek: linie.map(l => l.nazwa).filter(Boolean), grupaRamek,
    kolorRamek, koloryRamek, krotnosciRamek, ramki: ramkiAuto, bezRamek, komplety, pozycje: wynik };
}

// Serie do wyboru z liczbą rozpoznanych pozycji (na start – seria z największym pokryciem)
function serieZPokryciem(pozycje) {
  const S = slownik(), R = regulyOsprzetu();
  return (R.serie || []).filter(g => S && S.grupy[g]).map(g => {
    let pokryte = 0;
    try { pokryte = dobierz(pozycje, { seria: g, ramki: false }).pozycje.filter(p => p.skladniki.every(s => s.produkt)).length; } catch { /* seria bez produktów */ }
    return { seria: g, pokryte, kolory: koloryModulow(g, S.grupy[g], R) };
  });
}

// Produkty serii do ręcznego wyboru (lista „wszystkie produkty serii”)
function produktySerii(seria) {
  const S = slownik(), R = regulyOsprzetu();
  if (!S || !S.grupy[seria]) return [];
  const rodzina = grupyRamek(seria, R, S).filter(g => g !== seria).flatMap(g => S.grupy[g].filter(p => p.rodzaj === 'Ramka'));
  return [...S.grupy[seria], ...rodzina, ...(R.uniwersalne || []).flatMap(g => S.grupy[g] || [])].map(krotko);
}

// Symbol z zapytania, także niepełny – bez koloru („cgz1c” → CGZ1C.01/11, „DR1” → DR1/11): dokładny symbol albo
// produkty, których symbol zaczyna się od wpisu i dalej ma „.” lub „/”. Wybór: kolor pozycji, potem biały (/11), aktywne.
// Nie zamienia na inny produkt (CGZ1C ≠ CGZ1CZ) – przy braku trafienia zwraca null.
function kodZWpisu(wpis, kolor) {
  const S = slownik(), k = norm(wpis).replace(/\s+/g, '');
  if (!S || k.length < 3 || !/[a-z]/.test(k) || !/\d/.test(k)) return null;
  const dokladny = poSymbolu(k);
  if (dokladny) return dokladny;
  const pasujace = [];
  for (const lista of Object.values(S.grupy)) for (const p of lista) { const s = norm(p.symbol); if (s.startsWith(k + '.') || s.startsWith(k + '/')) pasujace.push(p); }
  if (!pasujace.length) return null;
  const ocena = p => [kolor && norm(p.kolor) === norm(kolor) ? 0 : 1, /\/11$/.test(p.symbol) ? 0 : 1, /wycofan/i.test(p.status || '') ? 1 : 0, p.symbol.length];
  return pasujace.sort((a, b) => { const x = ocena(a), y = ocena(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; })[0];
}

// jeden produkt po symbolu (wszystkie grupy cennika)
function poSymbolu(symbol) {
  const S = slownik(), s = norm(symbol);
  if (!S) return null;
  for (const lista of Object.values(S.grupy)) { const p = lista.find(x => norm(x.symbol) === s); if (p) return p; }
  return null;
}

// Wyszukiwarka w całym cenniku osprzętu – po kodzie albo słowach nazwy („gniazdo podwójne czarne”, „dgz2mz”).
// Kolejność: dokładny kod, początek kodu, potem trafienia w nazwie; w każdej grupie najpierw wybrana seria i kolor.
function szukaj(q, { seria, kolor, limit = 15 } = {}) {
  const S = slownik();
  const tekst = norm(q).trim();
  if (!S || tekst.length < 2) return [];
  const R = regulyOsprzetu();
  const rodzina = new Set(seria ? [seria, ...grupyRamek(seria, R, S), ...(R.uniwersalne || [])] : []);
  const zlozone = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
  // rdzeń dłuższych słów: „podwójnego” → „podwójn”, „czarne” → „czar”
  const slowa = zlozone(tekst).split(/\s+/).filter(Boolean).map(w => (w.length > 5 && /^[a-z]+$/.test(w) ? w.slice(0, -2) : w));
  const kod = tekst.replace(/\s+/g, '');
  const wyniki = [];
  for (const [grupa, lista] of Object.entries(S.grupy)) for (const p of lista) {
    const sym = norm(p.symbol);
    let typ;
    if (sym === kod) typ = 0;
    else if (sym.startsWith(kod)) typ = 1;
    else {
      const tx = zlozone(norm(`${p.symbol} ${p.nazwa} ${p.kolor || ''} ${grupa}`)), nazwa = zlozone(norm(p.nazwa));
      // pojedyncza cyfra to krotność („ramka 3” → 3-krotna), a nie dowolna cyfra w kodzie
      if (!slowa.every(w => (/^[1-5]$/.test(w) ? new RegExp(`(^|[^\\d])${w}(-krotn|x\\b)`).test(nazwa) : tx.includes(w)))) continue;
      // wyżej nazwy zaczynające się od pierwszego słowa i zawierające wszystkie słowa w nazwie (nie tylko w kolorze/grupie)
      const nk = `${nazwa} ${zlozone(norm(p.kolor || ''))}`;
      typ = 2 + (nazwa.startsWith(slowa[0]) ? 0 : 0.5) + (slowa.every(w => /^[1-5]$/.test(w) || nk.includes(w)) ? 0 : 0.25);
    }
    wyniki.push({ p, typ, wSerii: rodzina.has(grupa) ? 0 : 1, wKolorze: !kolor || !p.kolor || norm(p.kolor) === norm(kolor) ? 0 : 1, wycofany: /wycofan/i.test(p.status || '') ? 1 : 0 });
  }
  wyniki.sort((a, b) => a.typ - b.typ || a.wSerii - b.wSerii || a.wKolorze - b.wKolorze || a.wycofany - b.wycofany || a.p.nazwa.length - b.p.nazwa.length || a.p.symbol.localeCompare(b.p.symbol));
  return wyniki.slice(0, limit).map(w => ({ ...krotko(w.p), innaSeria: !!seria && w.wSerii === 1 }));
}

// Produkty po symbolach (dla oferty – nazwy, ceny, kolory)
function produktyPoSymbolach(symbole) {
  const S = slownik(), chce = new Set(symbole), out = {};
  if (!S) return out;
  for (const lista of Object.values(S.grupy)) for (const p of lista) if (chce.has(p.symbol)) out[p.symbol] = krotko(p);
  return out;
}

module.exports = { dobierz, szukaj, poSymbolu, kodZWpisu, serieZPokryciem, produktySerii, produktyPoSymbolach, regulaDla, regulyOsprzetu, koloryGrupy, koloryModulow };
