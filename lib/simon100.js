// Simon 100 – punkt składany „od zera” (zasady od użytkownika, 2026-10-27; wiedza: docs/simon100.md):
//   ramka + uchwyt (rama) montażowy tej samej krotności + mechanizmy (-039) + klawisze/pokrywy w kolorze.
// Ramka: 1-krotna z samą połówką (np. 1 łącznik) → Minimal (bez zaślepki); pełny moduł (gniazdo, 2 łączniki)
// albo ramka wielokrotna → Matrix, a każde wolne pół modułu → zaślepka ½ (10000800).
// Szerokość mechanizmu z nazwy w cenniku: „(mechanizm 1/2 …” = ½ modułu, inaczej cały moduł.
// Gniazdo podwójne = ramka 2-krotna + 2 gniazda. Zestawy (panel + zestaw mechanizmów) – nie, bo są „do wyczerpania”.

const SUFIKS = { 'biały': '130', 'biały mat': '230', 'czarny': '138', 'czarny mat': '238' };
const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

// typ punktu (nazwa z listy / AI) → elementy: [mechanizm (-039) albo '', klawisz/pokrywa (baza, bez koloru), ile]
const GN = ['10000458-039', '10000068'], SCH = ['10000201-039', '10000010'], KRZ = ['10000251-039', '10000010'];
const PUNKTY = [
  { wzor: /klawisz/, el: [['', '10000010']], bezRamki: true, uwaga: 'sam klawisz – bez mechanizmu i ramki' },
  { wzor: /wyjście kablowe|wypust kablow|indukc/, el: [['10002801-039', '10002051']] },
  { wzor: /głośnik|telefon/, brak: 'Simon 100 nie ma takiego gniazda – wybierz produkt ręcznie' },
  { wzor: /hdmi/, el: [['10000560-039', '10001094']] },
  { wzor: /(\d)\s*x\s*\+\s*rj ?45/, el: n => [[...GN, n], ['10000544-039', '10000005']] },
  { wzor: /komputerowe podwójne|podwójne rj ?45/, el: [['10002544-039', '10000006']] },
  { wzor: /rj ?45|komputer|\blan\b|internet/, el: [['10000544-039', '10000005']] },
  { wzor: /\brtv\b|\btv\b|antenow|r-tv/, el: [['10000466-039', '10000053']] },
  { wzor: /gniazd.*(usb|ładowark)/, el: [['10011458-039', '10000169']] },
  { wzor: /ładowark|\busb\b/, el: [['10000382-039', '10001197']] },
  { wzor: /\bdata\b/, brak: 'Simon 100 nie ma gniazda DATA z kluczem – wybierz ręcznie (np. pokrywa schuko z czerwonym pierścieniem 10000037)' },
  { wzor: /gniazd.*(ip ?44|szczeln|bryzgo|hermetycz)/, el: [GN, ['', '10000042']], uwaga: 'IP44: gniazdo z klapką 10000042' },
  { wzor: /gniazdo wtyczkowe podwójne|gniazd\S* podwójn/, el: [[...GN, 2]] },
  { wzor: /gniazd/, el: [GN] },
  { wzor: /ściemn/, el: [['10000321-039', '10001020']] },
  { wzor: /rolet/, el: [['10001358-039', '10001080']] },
  { wzor: /czujnik ruchu/, el: [['10001343-039', '10001060']] },
  { wzor: /dzwon|przycisk/, el: [['10000150-039', '10000017']] },
  { wzor: /termostat/, el: [['', '10000810']], bezRamki: true, uwaga: 'termostat iO – monoblok do puszki 1-krotnej (bez ramki)' },
  { wzor: /krzyżowy podw|podwójny krzyż/, el: [[...KRZ, 2]] },
  { wzor: /schodowy podw|podwójny schod|świecznik/, el: [[...SCH, 2]], uwaga: 'Simon 100 nie ma łącznika świecznikowego – 2 łączniki uniwersalne-schodowe' },
  { wzor: /krzyż/, el: [KRZ] },
  { wzor: /dwubieg|2[ -]?biegun/, el: [['10000133-039', '10000133']] },
  { wzor: /schod/, el: [SCH] },
  // „włącznik pojedynczy” / jednobiegunowy → łącznik uniwersalny-schodowy 10 AX (jak w zestawach Kontakt-Simon; wybór użytkownika 2026-10-27)
  { wzor: /łącznik|wyłącznik|włącznik/, el: [SCH] }
];

// produkt w kolorze: baza + sufiks koloru; brak w tym kolorze → pierwszy dostępny (z oznaczeniem „inny kolor”)
function wKolorze(baza, kolor, mapa, lista) {
  const s = SUFIKS[norm(kolor)];
  const p = s && mapa.get(`${baza}-${s}`);
  if (p) return { p, innyKolor: false };
  const inne = lista.filter(x => x.symbol.startsWith(baza + '-') && x.status !== 'wycofany');
  return { p: inne[0] || null, innyKolor: !!inne[0] };
}
const polowka = p => /mechanizm 1\/2/i.test(p.nazwa);

// pozycja → składniki punktu; opcje: { kolor, kolorRamek, ramki (false – ramki są osobnymi pozycjami w zapytaniu), produkty, krotko }
function punkt(poz, { kolor, kolorRamek, ramki, produkty, krotko }) {
  const tekst = norm(poz.nazwa);
  const mapa = new Map(produkty.map(p => [p.symbol, p]));
  const kand = (rodzaj, krot, kol) => produkty.filter(p => p.rodzaj === rodzaj && (krot == null || p.krotnosc === krot) && p.status !== 'wycofany')
    .sort((a, b) => (norm(a.kolor) === norm(kol) ? 0 : 1) - (norm(b.kolor) === norm(kol) ? 0 : 1)).slice(0, 15).map(krotko);
  const sk = (czesc, p, ile, extra = {}) => ({ rola: 'produkt', czesc, naPunkt: ile, produkt: krotko(p), przyblizone: false, innyKolor: false, kandydaci: p ? kand(p.rodzaj, null, kolor) : [], uwaga: p ? '' : `brak ${czesc} w cenniku Simon 100`, ...extra });

  // ramka zamówiona wprost („Ramka 2-krotna”) – Matrix n-krotna + uchwyt montażowy
  const r = /ramka (\d)-krotn/.exec(tekst);
  if (r) {
    const n = Number(r[1]);
    const { p, innyKolor } = wKolorze(`100006${n}0`, kolorRamek, mapa, produkty);
    return { skladniki: [
      { rola: 'ramka', czesc: `ramka Matrix ${n}-krotna`, naPunkt: 1, produkt: krotko(p), przyblizone: false, innyKolor, kandydaci: kand('Ramka', n, kolorRamek), uwaga: p ? '' : `brak ramki ${n}-krotnej` },
      sk('uchwyt montażowy', mapa.get(`100009${n}0-039`), 1)
    ] };
  }

  const def = PUNKTY.find(d => d.wzor.test(tekst));
  if (!def) return { uwaga: 'nie rozpoznano typu – wybierz produkt ręcznie', skladniki: [{ rola: 'produkt', czesc: poz.nazwa, naPunkt: 1, produkt: null, kandydaci: [], przyblizone: false }] };
  if (def.brak) return { uwaga: def.brak, skladniki: [{ rola: 'produkt', czesc: poz.nazwa, naPunkt: 1, produkt: null, kandydaci: [], przyblizone: false, uwaga: def.brak }] };

  const n2x = (/(\d)\s*x\s*\+/.exec(tekst) || [])[1];
  const elementy = typeof def.el === 'function' ? def.el(Number(n2x) || 2) : def.el;
  const skladniki = [];
  let szerokosc = 0;
  for (const [mech, pokr, ile = 1] of elementy) {
    if (mech) {
      const m = mapa.get(mech);
      skladniki.push(sk('mechanizm', m, ile));
      szerokosc += (m && polowka(m) ? 0.5 : 1) * ile;
    }
    if (pokr) {
      const { p, innyKolor } = wKolorze(pokr, kolor, mapa, produkty);
      skladniki.push({ ...sk(p && p.rodzaj ? p.rodzaj.toLowerCase() : 'pokrywa', p, ile), innyKolor });
    }
  }
  // ramka + uchwyt montażowy (+ zaślepki ½ w ramce Matrix)
  if (ramki !== false && !def.bezRamki && szerokosc > 0) {
    const moduly = Math.min(5, Math.ceil(szerokosc));
    const minimal = moduly === 1 && szerokosc === 0.5;
    const baza = minimal ? '10001610' : `100006${moduly}0`;
    const { p, innyKolor } = wKolorze(baza, kolorRamek, mapa, produkty);
    skladniki.push({ rola: 'ramka', czesc: `ramka ${minimal ? 'Minimal' : 'Matrix'} ${moduly}-krotna`, naPunkt: 1, produkt: krotko(p), przyblizone: false, innyKolor,
      kandydaci: kand('Ramka', moduly, kolorRamek), uwaga: p ? '' : `brak ramki ${moduly}-krotnej` });
    skladniki.push(sk('uchwyt montażowy', mapa.get(`100009${moduly}0-039`), 1));
    const polowki = minimal ? 0 : Math.round((moduly - szerokosc) * 2);
    if (polowki > 0) { const z = wKolorze('10000800', kolor, mapa, produkty); skladniki.push({ ...sk('zaślepka ½', z.p, polowki), innyKolor: z.innyKolor }); }
  }
  const uwagi = [def.uwaga, /ip ?44/.test(tekst) && /łącznik|przycisk/.test(tekst) ? 'IP44 w Simon 100 tylko jako panele zestawów (10020190–10020193) – sprawdź' : ''].filter(Boolean);
  return { skladniki, uwaga: uwagi.join('; ') };
}

module.exports = { punkt, SUFIKS };
