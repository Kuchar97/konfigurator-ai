// Lista pozycji z treści e-maila bez AI (tryb „Dobierz bez AI”) – przeniesione z AI Takeoff (takeoff/textlist.py).
// Linie „nazwa – ilość” / „5 x nazwa” / „nazwa 12 szt”, sekcje („Ramki:”, „Włączniki:”), seria i kolor z treści.
const MAX_TEKST = 20000;

const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

const ILOSC_RX = [
  // „5 x Gniazdo RJ45”, „5 szt. gniazd” – ilość na początku
  /^(?<qty>\d{1,5})\s*(szt\.?|sztuk[ai]?|x|×)\s*(?<name>\D.*)$/i,
  // „Gniazdo – 12 szt”, „Gniazdo: 3”, „Gniazdo 4 sztuki” – ilość na końcu (liczba przyklejona do liter, np. „RJ45”, to nie ilość)
  /^(?<name>.*?\S)(?:\s*[-–—:=]\s*|\s+)(?<qty>\d{1,5})\s*(?<unit>szt\.?|sztuk[ai]?|kpl\.?|x)?\s*[.;,]?\s*$/i
];
const POMIN_RX = /^(pozdrawiam|pozdrowienia|dzi[eę]kuj|dzie[nń] dobry|cze[sś][cć]|witam|tel\.?|telefon|kom\.?|nip|ul\.|www|e-?mail|faks)/i;
const SEKCJE = { ramk: 'ramki', 'włącz': 'łączniki', 'wyłącz': 'łączniki', 'łącz': 'łączniki', 'przełącz': 'łączniki', gniazd: 'gniazda' };
const KROTNOSC_RX = /(?<![\d.,])([1-5])\s*[x×](?!\d)|[x×]\s*([1-5])(?!\d)/;
const SERIA_RX = /\bsimon\s+(\d+|basic|akord|connect|go|aqua\w*)(\s+(go|premium|nature|touch|detail|standard|neos|aqua))?\b/i;
const KROTNE = { 'pojedyncz': 1, 'podwójn': 2, 'potrójn': 3, 'poczwórn': 4, 'pięciokrotn': 5, '1-krotn': 1, '2-krotn': 2, '3-krotn': 3, '4-krotn': 4, '5-krotn': 5 };

// Nazwa z e-maila → nazwa w języku reguł (reguly-osprzet.json); null = typ nierozpoznany
function normalizuj(nazwa, sekcja) {
  const n = fold(nazwa);
  const ma = (...w) => w.some(x => n.includes(fold(x)));
  let krot = null;
  for (const [w, k] of Object.entries(KROTNE)) if (n.includes(fold(w))) { krot = k; break; }
  if (krot == null) { const m = n.match(KROTNOSC_RX); if (m) krot = Number(m[1] || m[2]); }
  if (sekcja === 'ramki' || ma('ramk')) return `Ramka ${krot || 1}-krotna`;
  // płyta indukcyjna / „siła” / wypust kablowy – w Kontakt-Simon to wyjście kablowe (moduł), np. CPK1.01/11
  if (ma('indukc', 'wyjście kablow', 'wypust kablow', 'przyłącze kablow') || /\bsiła\b|płyt[aey] (grzew|kuchen|elektr)/.test(n)) return 'Wyjście kablowe';
  const ip44 = ma('ip44', 'ip 44', 'hermetycz', 'bryzgoszczel', 'szczeln');
  const lacznik = sekcja === 'łączniki' || ma('łącznik', 'wyłącznik', 'włącznik', 'przełącznik', 'schodow', 'krzyżow', 'świecznik', 'roletow', 'dzwon', 'klawisz');
  if (lacznik && !ma('gniazd')) {
    // domyślnie kompletny łącznik (mechanizm z klawiszem); sam klawisz tylko, gdy linia wprost o nim mówi
    const klawisz = ma('klawisz', 'plastik');
    if (ma('dzwon')) return 'Przycisk dzwonkowy';
    if (ma('ściemn')) return 'Ściemniacz';
    let typ;
    // „podwójny” albo „2x” („Łącznik 2x schodowy” = schodowy podwójny)
    const podw = ma('podwójn') || krot === 2;
    if (ma('roletow')) typ = klawisz ? 'roletowego' : 'roletowy';
    else if (ma('krzyżow')) typ = podw ? 'krzyżowy podwójny' : 'krzyżowy';
    else if (ma('schodow')) typ = podw ? 'schodowy podwójny' : 'schodowy';
    else if (ma('świecznik') || (podw && !ma('dwubieg', '2 biegun', '2-biegun'))) typ = 'świecznikowy';
    else if (ma('dwubieg', '2 biegun', '2-biegun')) typ = 'dwubiegunowy';
    else typ = 'jednobiegunowy';
    if (klawisz) {
      const dop = { 'krzyżowy podwójny': 'krzyżowego podwójnego', 'krzyżowy': 'krzyżowego', 'schodowy podwójny': 'schodowego podwójnego', 'schodowy': 'schodowego', 'świecznikowy': 'świecznikowego', 'dwubiegunowy': 'dwubiegunowego', 'jednobiegunowy': 'jednobiegunowego' };
      return 'Klawisz do łącznika ' + (dop[typ] || typ);
    }
    // IP44 – dobór dokłada uszczelkę do ramki (np. CU1 w Simon 10), gdy seria ją ma
    return 'Łącznik ' + typ + (ip44 ? ' IP44' : '');
  }
  if (ma('ściemn')) return 'Ściemniacz';
  if (ma('gniazd', 'gniazdk', 'gniazdek')) {
    // rodzaje gniazd, których nie wolno zamienić na zwykłe 230 V
    if (ma('głośnik')) return `Gniazdo głośnikowe ${krot || 1}-krotne`;
    if (ma('hdmi')) return 'Gniazdo HDMI';
    if (ma('telefon', 'rj11', 'rj12')) return 'Gniazdo telefoniczne';
    if (ma('internet', 'komputer', 'rj45', 'rj 45', 'lan', 'sieciow') || /\bkomp\b/.test(n)) return krot === 2 ? 'Gniazdo komputerowe podwójne RJ45' : 'Gniazdo komputerowe RJ45';
    if (ma('tv', 'rtv', 'antenow', 'sat', 'telewiz')) return 'Gniazdo RTV';
    if (ma('ip44', 'hermetycz', 'bryzgoszczel', 'szczeln')) return 'Gniazdo IP44';
    if (ma('usb')) return 'Gniazdo z ładowarką USB';
    if (ma('data')) return 'Gniazdo DATA';
    return krot === 2 ? 'Gniazdo wtyczkowe podwójne' : 'Gniazdo';
  }
  if (ma('ładowark', 'usb')) return 'Ładowarka USB';
  if (ma('termostat', 'termoregul')) return 'Termostat';
  return null;
}

// najdłuższa nazwa koloru z cennika występująca w linii (jako słowa)
function znajdzKolor(linia, kolory) {
  const fl = ` ${fold(linia)} `;
  let best = '';
  for (const k of kolory) {
    const fk = fold(k);
    if (fk.length > best.length && new RegExp(`(?<![a-z])${fk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`).test(fl)) best = k;
  }
  if (best) return best;
  // zapasowo: odmiana słowa koloru („grafitowy”, „czarne”, „białe”) – po rdzeniu (4 litery) pierwszego słowa nazwy
  // koloru, słowo w linii min. 5 liter; zwraca najkrótszą pasującą nazwę – silnik doboru dopasuje ją do kolorów serii
  const slowa = fl.split(/[^a-z]+/).filter(w => w.length >= 5);
  for (const k of [...kolory].sort((a, b) => a.length - b.length)) {
    const w1 = fold(k).split(/[^a-z]+/)[0];
    if (w1.length >= 4 && slowa.some(w => w.slice(0, 4) === w1.slice(0, 4))) return k;
  }
  return '';
}

// seria wskazana w tekście: najdłuższa nazwa grupy (np. „Simon 55 GO” przed „Simon 55”)
function znajdzSerie(tekst, grupy) {
  const ft = fold(tekst);
  for (const g of [...grupy].sort((a, b) => b.length - a.length)) {
    const rx = fold(g).split(/\s+/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
    if (new RegExp(`(?<![a-z0-9])${rx}(?![a-z0-9])`).test(ft)) return g;
  }
  return null;
}

function parsuj(tekst, grupy, kolory) {
  const out = { pozycje: [], seria: znajdzSerie(tekst || '', grupy), nierozpoznane: [] };
  let sekcja = '';
  for (const surowa of String(tekst || '').slice(0, MAX_TEKST).split(/\r?\n/)) {
    let linia = surowa.trim().replace(/^[`*•·\-–—\s]+|[`*•·\-–—\s]+$/g, '');
    if (SERIA_RX.test(linia)) linia = linia.replace(new RegExp(SERIA_RX.source, 'gi'), ' ').replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, '');
    if (!linia) continue;
    let m = null;
    for (const rx of ILOSC_RX) { m = linia.match(rx); if (m) break; }
    // „2x Gniazdo – 10”: 2x = krotność, 10 = ilość
    if (m && m[0] && ILOSC_RX[0].test(linia) && ILOSC_RX[1].test(linia) && /^\d\s*[x×]/.test(linia)) m = linia.match(ILOSC_RX[1]);
    if (!m) {
      const glowa = fold(linia.replace(/:$/, ''));
      if (linia.endsWith(':') || glowa.split(/\s+/).length <= 2) {
        const s = Object.entries(SEKCJE).find(([k]) => glowa.includes(fold(k)));
        if (s) sekcja = s[1];
      }
      continue;
    }
    const nazwa = m.groups.name.replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, ''), ilosc = Number(m.groups.qty);
    // nazwa ze słowem (min. 3 litery) albo kod produktu („DR1/11”, „TR1/142”, „DPS.01/49”) – sam numer to nie pozycja
    const kodProduktu = /^[a-z]{1,8}\d[\w.\/-]*$/i.test(nazwa);
    if (ilosc <= 0 || (!kodProduktu && !/[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{3,}/.test(nazwa)) || POMIN_RX.test(nazwa)) continue;
    if (ilosc >= 1900 && ilosc <= 2100 && !m.groups.unit) continue;          // rok w podpisie, nie ilość
    const kolor = znajdzKolor(nazwa, kolory);
    const baza = kolor ? nazwa.replace(new RegExp(kolor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim() : nazwa;
    let norm = normalizuj(baza, sekcja);
    if (norm == null) { norm = baza.replace(/^[\s.:\-–]+|[\s.:\-–]+$/g, ''); out.nierozpoznane.push(linia); }
    out.pozycje.push({ zrodlo: linia, nazwa: norm, ilosc, kolor, sekcja });
  }
  return out;
}

module.exports = { parsuj, normalizuj, fold };
