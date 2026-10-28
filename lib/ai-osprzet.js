// AI dla zapytania klienta: puszki podłogowe + osprzęt elektroinstalacyjny w JEDNEJ analizie.
// Mail / PDF / zdjęcie / rysunek CAD → zestawy puszek (jak lib/ai.js) + pozycje osprzętu w języku reguł doboru
// (te same nazwy co z listy bez AI – lib/osprzet-lista.js); produkty osprzętu dobiera potem lib/osprzet-dobor.js.
const dxf = require('./dxf');
const ai = require('./ai');

// nazwy, które rozumieją reguły doboru (data/reguly-osprzet.json)
const NAZWY = [
  'Gniazdo', 'Gniazdo wtyczkowe podwójne', 'Gniazdo IP44', 'Gniazdo DATA', 'Gniazdo z ładowarką USB', 'Ładowarka USB',
  'Gniazdo komputerowe RJ45', 'Gniazdo komputerowe podwójne RJ45', 'Gniazdo RTV', '2x + RJ45 (zestaw: n gniazd 230 V + gniazdo RJ45)',
  'Łącznik jednobiegunowy', 'Łącznik dwubiegunowy', 'Łącznik świecznikowy', 'Łącznik schodowy', 'Łącznik schodowy podwójny',
  'Łącznik krzyżowy', 'Łącznik krzyżowy podwójny', 'Łącznik roletowy', 'Przycisk dzwonkowy', 'Ściemniacz', 'Termostat', 'Czujnik ruchu',
  'Gniazdo głośnikowe 1-krotne', 'Gniazdo głośnikowe 2-krotne', 'Gniazdo głośnikowe 4-krotne', 'Gniazdo HDMI', 'Gniazdo telefoniczne', 'Wyjście kablowe',
  'Klawisz do łącznika jednobiegunowego', 'Klawisz do łącznika świecznikowego', 'Klawisz do łącznika schodowego',
  'Ramka 1-krotna', 'Ramka 2-krotna', 'Ramka 3-krotna', 'Ramka 4-krotna', 'Ramka 5-krotna'
];

const nullable = s => ({ anyOf: [s, { type: 'null' }] });
const OSPRZET = {
  type: 'object',
  additionalProperties: false,
  description: 'Osprzęt elektroinstalacyjny montowany w ścianach (gniazda, łączniki, ramki) – bez wyposażenia puszek podłogowych.',
  required: ['seria', 'linia_ramek', 'kolor', 'pozycje', 'uwagi'],
  properties: {
    seria: nullable({ type: 'string', description: 'Seria Simon wskazana przez klienta (dokładnie jedna z listy serii) albo null.' }),
    linia_ramek: nullable({ type: 'string', description: 'Linia/wzór ramek, jeśli klient ją wskazał (np. „Premium”, „Nature”, „LINE”, „DUO”) – inaczej null.' }),
    kolor: nullable({ type: 'string', description: 'Główny kolor osprzętu z zapytania, nazwą z listy kolorów wybranej serii, albo null.' }),
    pozycje: {
      type: 'array',
      description: 'Jedna pozycja na typ produktu (i kolor, jeśli różne). Pusta, gdy zapytanie nie dotyczy osprzętu.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nazwa', 'wariant', 'opis', 'ilosc', 'kolor', 'kod', 'cytat', 'pewnosc', 'uwagi'],
        properties: {
          nazwa: { type: 'string', description: 'Nazwa z listy nazw doboru (dokładnie tak zapisana); tylko gdy żadna nie pasuje – krótki opis z typowymi słowami z cennika.' },
          wariant: { type: 'string', enum: ['komplet', 'mechanizm', 'pokrywa', 'inne'], description: 'komplet – zwykły punkt (moduł z klawiszem/pokrywą); mechanizm – klient chce same mechanizmy; pokrywa – same pokrywy / klawisze / plakietki; inne – produkt nietypowy (np. ramka do puszek karton-gips, pokrywa Keystone skośna, wersja antybakteryjna, ramka szklana).' },
          opis: { type: 'string', description: 'Dla wariantu innego niż komplet: dokładny opis potrzebnego produktu (rodzaj, funkcja, kolor, krotność, wykonanie), np. „ramka 2-krotna do puszek karton-gips, biała”. Dla kompletu – pusty tekst.' },
          ilosc: { type: 'integer', description: 'Liczba sztuk (punktów).' },
          kolor: nullable({ type: 'string', description: 'Kolor tej pozycji, jeśli inny niż główny albo podany wprost – inaczej null.' }),
          kod: nullable({ type: 'string', description: 'Symbol produktu Kontakt-Simon podany przez klienta (np. „TGZ1M.01/11”) – inaczej null.' }),
          cytat: { type: 'string', description: 'Fragment zapytania / opis symbolu z rysunku, na którym oparto pozycję.' },
          pewnosc: { type: 'string', enum: ['pewna', 'do_sprawdzenia'], description: 'do_sprawdzenia – ilość policzona z obrazu rysunku/zdjęcia albo typ zgadnięty.' },
          uwagi: { type: 'string' }
        }
      }
    },
    uwagi: { type: 'string', description: 'Uwagi do odczytu osprzętu, np. jak liczono symbole z rysunku.' }
  }
};

// schemat zapytania łączonego: wspólne pola + zestawy puszek (jak w lib/ai.js) + osprzęt
const SCHEMAT = {
  type: 'object',
  additionalProperties: false,
  required: ['podsumowanie', 'pytania_do_klienta', 'pozycje_poza_zakresem', 'zestawy', 'osprzet'],
  properties: {
    podsumowanie: { type: 'string', description: 'Jedno-dwa zdania: czego dotyczy zapytanie (puszki podłogowe i/lub osprzęt).' },
    pytania_do_klienta: { type: 'array', items: { type: 'string' }, description: 'Brakujące informacje istotne dla doboru puszek i osprzętu.' },
    pozycje_poza_zakresem: { type: 'array', items: { type: 'string' }, description: 'Inne produkty (oprawy, wypusty oświetleniowe, kable, rozdzielnice…) z ilością.' },
    zestawy: { ...ai.SCHEMAT.properties.zestawy, description: 'Puszki podłogowe – jeden element na każdy odrębny typ puszki. Pusta lista, gdy zapytanie nie dotyczy puszek.' },
    osprzet: OSPRZET
  }
};

function zasadyOsprzetu({ serie, koloryModulow, linieRamek }) {
  const opisSerii = serie.map(s => {
    const kolory = (koloryModulow[s] || []).join(', ');
    const linie = (linieRamek[s] || []).map(l => l.nazwa).join(', ');
    return `- ${s}${kolory ? ` – kolory: ${kolory}` : ''}${linie ? ` – linie ramek: ${linie}` : ''}`;
  }).join('\n');
  return `Serie osprzętu Simon (nazwy dokładnie tak):
${opisSerii}

Nazwy doboru osprzętu (pole „nazwa” – używaj dokładnie tych zapisów):
${NAZWY.map(n => '- ' + n).join('\n')}

Zasady dla osprzętu:
- Produkty dobierze program – podajesz typ, ilość i kolor.
- „Gniazdo” = pojedyncze gniazdo 230 V z uziemieniem. Gniazdo podwójne (2x) w jednej ramce jako jeden punkt → „Gniazdo wtyczkowe podwójne”. „Gniazdo 2x + RJ45” → nazwa „2x + RJ45”.
- „Włącznik” / „wyłącznik” = kompletny łącznik (mechanizm z klawiszem); „Klawisz do łącznika …” tylko, gdy klient pisze wprost o samych klawiszach. „Włącznik podwójny” = świecznikowy.
- Symbol produktu podany przez klienta (także niepełny, bez koloru, np. „cgz1c”, „DR2”) wpisz w „kod” DOKŁADNIE tak, jak go podał – nie zamieniaj go na inny produkt (np. na wersję z przesłonami) i nie „poprawiaj”; program sam znajdzie pełny symbol.
- Płyta indukcyjna, „siła”, wypust / przyłącze kablowe → „Wyjście kablowe” (to osprzęt Kontakt-Simon, np. CPK1.01/11 w Simon 10), nie pozycja poza zakresem. Gniazdo 3-fazowe 400 V to co innego – poza zakresem.
- Łącznik / przycisk IP44 (hermetyczny, bryzgoszczelny) → nazwa łącznika z dopiskiem „ IP44” (np. „Łącznik schodowy IP44”) – program dołoży uszczelkę IP44, jeśli seria jej wymaga.
- Gniazda głośnikowe, HDMI, telefoniczne to osobne typy – nigdy nie zamieniaj ich na „Gniazdo” 230 V.
- Wariant: domyślnie „komplet”. Gdy klient chce OSOBNO mechanizmy i osobno pokrywy/klawisze/plakietki/ramki („same mechanizmy”, „plakietki”, „klawisze”) – rozdziel to na pozycje z wariantem „mechanizm” i „pokrywa” (każda z własnym kolorem i ilością). Produkty nietypowe (ramki do puszek karton-gips / GK, pokrywy Keystone, wersje antybakteryjne, IP44 z klapką w kolorze, ramki szklane/metalowe) → wariant „inne”. Dla wariantów innych niż „komplet” opisz produkt dokładnie w „opis” – program dobierze go z cennika serii.
- Gniazda UPS, dedykowane, „DATA”, czerwone → „Gniazdo DATA”. Gniazda hermetyczne / bryzgoszczelne → „Gniazdo IP44”. Internet / LAN / komputerowe → RJ45; TV / SAT / antenowe → „Gniazdo RTV”.
- Ramki wpisuj TYLKO, gdy klient podaje je wprost (osobna lista ramek, np. „R-2 (ramka 2x): 10 szt.” → „Ramka 2-krotna” ×10). Nie dodawaj ramek „od siebie” – brakujące ramki użytkownik dobierze w programie.
- Rysunki i rzuty: policz symbole na wszystkich arkuszach, korzystając z legendy. Nie licz symboli z legendy ani z tabel. Opraw oświetleniowych, wypustów, rozdzielnic i klimatyzacji nie wpisuj do osprzętu – daj je do pozycje_poza_zakresem. Ilości policzone z obrazu oznacz pewnosc = „do_sprawdzenia” i opisz w uwagach, jak liczyłeś.
- Zestawienie z rysunku CAD podaje nazwy bloków i ich liczbę: przypisz bloki do typów po nazwach (np. „gn”, „GNIAZDO_2X”, „LSW”, „ŁĄCZNIK_SCH”, „TV”, „RJ45”) i po opisach/legendzie. Bloki, których znaczenia nie da się ustalić, wypisz w pytania_do_klienta. Bloki złożone: jeśli to kontener (np. całe piętro), licz wg „po rozwinięciu”; jeśli symbol z kilku części – licz sam blok. Liczby bloków z zestawienia CAD są dokładne – przy jednoznacznym przypisaniu bloku do typu pewnosc = „pewna”.
- Kolor: nazwa koloru modułów wybranej serii (np. „czarny” w Simon 55 → „czarny mat”). Jeśli klient nie podał koloru – null i pytanie do klienta.
- Seria: tylko gdy klient ją wskazał (albo podał symbole produktów tej serii). Jeśli podał serię spoza listy – null i uwaga.
- Łącz identyczne pozycje w jedną; nie zgaduj ilości – gdy brak, podaj 1 i pytanie do klienta.`;
}

function promptSystemowy(R, ctx) {
  return `Jesteś doradcą technicznym Kontakt-Simon i analizujesz zapytania klientów (maile, listy, specyfikacje PDF, zdjęcia notatek, rzuty instalacji elektrycznej jako PDF, zdjęcie albo zestawienie bloków z rysunku CAD DWG/DXF).
Zapytanie może dotyczyć puszek podłogowych, osprzętu elektroinstalacyjnego (gniazda, łączniki, ramki w ścianach) albo obu naraz. Zwróć wynik w podanym schemacie JSON: puszki w „zestawy”, osprzęt w „osprzet”. Część, której zapytanie nie dotyczy, zostaw pustą.

Rozdzielenie:
- Gniazda, RJ45, HDMI itp. montowane W PUSZKACH PODŁOGOWYCH to wyposażenie puszki – wpisz je tylko w „potrzeby” zestawu puszki, nigdy w osprzęt.
- Osprzęt to gniazda i łączniki montowane w ścianach (podtynkowe/natynkowe) z ramkami. Jeśli nie wiadomo, czy gniazda są w podłodze, czy w ścianie – przyjmij ścianę (osprzęt), chyba że mowa o puszce/podłodze, i dopisz pytanie.

=== PUSZKI PODŁOGOWE ===
${ai.zasadyPuszek(R)}

=== OSPRZĘT ELEKTROINSTALACYJNY ===
${zasadyOsprzetu(ctx)}

- Pisz po polsku.${require('./ai-wskazowki').doPromptu()}`;
}

// Poprawka propozycji (uwaga #22): ten sam wynik co analiza + ogólna wskazówka na przyszłość
const SCHEMAT_POPRAWKI = {
  ...SCHEMAT,
  required: [...SCHEMAT.required, 'wskazowka'],
  properties: {
    ...SCHEMAT.properties,
    wskazowka: nullable({ type: 'string', description: 'Ogólna reguła na przyszłe wyceny wynikająca z poprawki użytkownika – jedno zdanie, bez danych tego klienta (np. „W Simon 54 ramki do GK to DRK…”). null, gdy poprawka dotyczy tylko tego zapytania.' })
  }
};
const POPRAWKA = `

=== POPRAWKA ===
Doradca Kontakt-Simon poprawia Twoją poprzednią propozycję dla tego zapytania. Zastosuj poprawkę i zwróć PEŁNY poprawiony wynik (wszystkie puszki i cały osprzęt, nie tylko zmienione pozycje).
Jeśli z poprawki wynika ogólna zasada przydatna przy kolejnych wycenach – zapisz ją w „wskazowka” (jedno zdanie, bez danych tego klienta); jeśli nie – null.`;

// pliki z przeglądarki → pliki dla AI: rysunki CAD zamienione na tekstowe zestawienie bloków i opisów
function przygotujPliki(pliki) {
  const info = [];
  const wynik = (pliki || []).map(p => {
    if (!dxf.jestCad(p.nazwa)) return p;
    const z = dxf.podsumujCad(Buffer.from(p.dane, 'base64'), p.nazwa);
    info.push({ nazwa: p.nazwa, bloki: z.bloki, wstawien: z.wstawien, opisow: z.opisow });
    return { nazwa: p.nazwa.replace(/\.(dxf|dwg)$/i, '') + '_zestawienie.txt', typ: 'text/plain', dane: Buffer.from(z.tekst, 'utf8').toString('base64') };
  });
  return { pliki: wynik, cad: info };
}

// Zamiana serii: produkty wpisane kodem → odpowiedniki w nowej serii, dobrane przez AI spośród produktów nowej serii
// w wybranym kolorze modułów i ramek (lista zawężona, żeby zapytanie było tanie). Zwraca tylko symbole z tej listy.
// b: { seria, kolor, kolorRamek, pozycje: [{ id, symbol, nazwa, ilosc }] }
async function zamienniki(b, trybAi) {
  const dobor = require('./osprzet-dobor'), { fold } = require('./osprzet-lista');
  const pozycje = (Array.isArray(b.pozycje) ? b.pozycje : []).slice(0, 100).map(p => ({ id: String(p.id), symbol: String(p.symbol || ''), nazwa: String(p.nazwa || '').slice(0, 200), ilosc: Number(p.ilosc) || 1 }));
  if (!pozycje.length) return { zamiany: [] };
  const kolory = [b.kolor, b.kolorRamek].filter(Boolean).map(fold);
  const kandydaci = dobor.produktySerii(String(b.seria || '')).filter(p => !/wycofan/i.test(p.status || '') && (!p.kolor || kolory.includes(fold(p.kolor))));
  if (!kandydaci.length) throw Object.assign(new Error(`Brak produktów serii ${b.seria} w wybranym kolorze.`), { status: 400 });
  const dozwolone = new Map(kandydaci.map(p => [p.symbol, p]));
  const schemat = {
    type: 'object', additionalProperties: false, required: ['zamiany'],
    properties: { zamiany: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'symbol', 'uwagi'],
      properties: { id: { type: 'string' }, symbol: nullable({ type: 'string' }), uwagi: { type: 'string' } } } } }
  };
  const system = `Jesteś doradcą technicznym Kontakt-Simon. Klient zmienia serię osprzętu elektroinstalacyjnego na ${b.seria} (kolor modułów: ${b.kolor || '—'}, kolor ramek: ${b.kolorRamek || '—'}).
Dla każdej pozycji wskaż symbol odpowiednika z listy produktów serii ${b.seria} (wyłącznie symbole z tej listy).
Zasady:
- Ta sama funkcja i parametry: rodzaj (gniazdo, łącznik schodowy, klawisz, ramka, zaślepka…), krotność, przesłony, IP, RJ45 kat.
- Gdy stara seria ma mechanizm i osobną pokrywę/klawisz (np. Simon 55: SGZ… + TGZ…), a nowa ma kompletny moduł – mechanizm zamień na moduł, a pokrywę/klawisz na null z uwagą „ujęte w module …”. Odwrotnie: moduł zamień na mechanizm, a w uwagach podaj potrzebną pokrywę/klawisz.
- Ramki: ta sama krotność, w kolorze ramek.
- Brak odpowiednika – null i krótka uwaga dlaczego.
- Uwagi po polsku, krótko.

Produkty serii ${b.seria} (symbol | nazwa | kolor):
${kandydaci.map(p => `${p.symbol} | ${p.nazwa.slice(0, 110)} | ${p.kolor || '-'}`).join('\n')}`;
  const tekst = 'Pozycje do zamiany (id | symbol | nazwa | ilość):\n' + pozycje.map(p => `${p.id} | ${p.symbol} | ${p.nazwa} | ${p.ilosc}`).join('\n');
  const odp = await ai.zapytaj({ tekst, pliki: [] }, { system, schemat }, trybAi);
  const zamiany = (odp.zamiany || []).filter(z => pozycje.some(p => p.id === z.id)).map(z => ({
    id: z.id, uwagi: z.uwagi || '', produkt: z.symbol && dozwolone.has(z.symbol) ? dozwolone.get(z.symbol) : null
  }));
  return { zamiany, model: odp.model, zuzycie: odp.zuzycie, kandydatow: kandydaci.length };
}

// Dokładny dobór pozycji nietypowych (uwaga #21): same mechanizmy, same pokrywy/klawisze/plakietki, ramki do GK, Keystone…
// AI wybiera konkretne symbole z cennika serii (lista zawężona do kolorów z zapytania + produktów bez koloru).
// b: { seria, kolor, pozycje: [{ id, nazwa, wariant, opis, kolor, ilosc }] } → { dobory: [{ id, produkty: [{ produkt, naPunkt }], uwagi }] }
async function dobierzDokladnie(b, trybAi) {
  const dobor = require('./osprzet-dobor'), { fold } = require('./osprzet-lista');
  const pozycje = (b.pozycje || []).slice(0, 60);
  if (!pozycje.length) return { dobory: [] };
  const rdzen = k => fold(k).split(/[^a-z]+/)[0].slice(0, 4);
  const kolory = new Set([b.kolor, ...pozycje.map(p => p.kolor)].filter(Boolean).map(rdzen));
  const wszystkie = dobor.produktySerii(String(b.seria || '')).filter(p => !/wycofan/i.test(p.status || ''));
  const kandydaci = kolory.size ? wszystkie.filter(p => !p.kolor || kolory.has(rdzen(p.kolor))) : wszystkie;
  if (!kandydaci.length) return { dobory: [] };
  const dozwolone = new Map(kandydaci.map(p => [p.symbol, p]));
  const schemat = {
    type: 'object', additionalProperties: false, required: ['dobory'],
    properties: { dobory: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'produkty', 'uwagi'], properties: {
      id: { type: 'string' },
      produkty: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['symbol', 'na_punkt'], properties: { symbol: { type: 'string' }, na_punkt: { type: 'integer' } } } },
      uwagi: { type: 'string' }
    } } } }
  };
  const system = `Jesteś doradcą technicznym Kontakt-Simon. Dla każdej pozycji wybierz konkretne produkty z cennika serii ${b.seria} (wyłącznie symbole z listy poniżej).
Zasady:
- wariant „mechanizm” → sam mechanizm (w nazwie „(mechanizm)”), bez pokrywy, klawisza i ramki.
- wariant „pokrywa” → sama pokrywa / klawisz / plakietka w podanym kolorze (bez mechanizmu i ramki); dla gniazd DATA – pokrywa z kluczem.
- wariant „inne” → produkt najlepiej pasujący do opisu (np. ramka do puszek karton-gips, pokrywa Keystone skośna).
- Zwykle jeden produkt na pozycję (na_punkt = 1). Kilka tylko wtedy, gdy opis wprost wymaga zestawu.
- Kolor zgodny z pozycją. Gdy nie ma odpowiedniego produktu – pusta lista i krótka uwaga dlaczego.
- Uwagi po polsku, krótko.

Produkty serii ${b.seria} (symbol | nazwa | kolor):
${kandydaci.map(p => `${p.symbol} | ${p.nazwa.slice(0, 110)} | ${p.kolor || '-'}`).join('\n')}`;
  const tekst = 'Pozycje (id | wariant | nazwa | opis | kolor | ilość):\n' + pozycje.map(p => `${p.id} | ${p.wariant} | ${p.nazwa} | ${p.opis || '-'} | ${p.kolor || b.kolor || '-'} | ${p.ilosc}`).join('\n');
  const odp = await ai.zapytaj({ tekst, pliki: [] }, { system, schemat }, trybAi);
  const dobory = (odp.dobory || []).filter(d => pozycje.some(p => p.id === d.id)).map(d => ({
    id: d.id, uwagi: d.uwagi || '',
    produkty: (d.produkty || []).filter(x => dozwolone.has(x.symbol)).map(x => ({ produkt: dozwolone.get(x.symbol), naPunkt: Math.max(1, Number(x.na_punkt) || 1) }))
  }));
  return { dobory, model: odp.model, zuzycie: odp.zuzycie, kandydatow: kandydaci.length };
}

// Część „osprzet” odpowiedzi AI → pozycje z wariantem innym niż „komplet” zastąpione pozycjami z kodem (jedna na produkt).
// opcje: { trybAi, zuzycie(z) – zapis zużycia wywołania pomocniczego }
async function dokladnyDobor(o, { trybAi, zuzycie } = {}) {
  if (!o || !Array.isArray(o.pozycje)) return o;
  const doDoboru = o.pozycje.map((p, i) => ({ p, id: 'd' + i })).filter(({ p }) => p.wariant && p.wariant !== 'komplet' && !p.kod);
  if (!doDoboru.length) return o;
  const dobor = require('./osprzet-dobor'), { fold } = require('./osprzet-lista');
  const R = dobor.regulyOsprzetu();
  const seria = (R.serie || []).find(s => o.seria && (fold(o.seria) === fold(s) || fold(o.seria).startsWith(fold(s) + ' ')));
  const uwaga = (p, t) => { p.uwagi = [p.uwagi, t].filter(Boolean).join('; '); };
  if (!seria) { doDoboru.forEach(({ p }) => uwaga(p, 'nie podano serii – dokładny dobór pominięty, sprawdź produkt')); return o; }
  let wynik;
  try {
    wynik = await dobierzDokladnie({ seria, kolor: o.kolor, pozycje: doDoboru.map(({ p, id }) => ({ id, nazwa: p.nazwa, wariant: p.wariant, opis: p.opis, kolor: p.kolor, ilosc: p.ilosc })) }, trybAi);
    if (zuzycie && wynik.zuzycie) zuzycie(wynik.zuzycie);
  } catch (e) {
    console.error('Dokładny dobór:', e.message);
    doDoboru.forEach(({ p }) => uwaga(p, 'dokładny dobór się nie udał – sprawdź produkt'));
    return o;
  }
  const pozycje = [];
  o.pozycje.forEach((p, i) => {
    const d = wynik.dobory.find(x => x.id === 'd' + i);
    if (!d || !d.produkty.length) { if (d) uwaga(p, d.uwagi || 'brak dokładnego odpowiednika w cenniku – sprawdź'); pozycje.push(p); return; }
    for (const { produkt, naPunkt } of d.produkty) {
      pozycje.push({ ...p, nazwa: produkt.nazwa, kod: produkt.symbol, kolor: produkt.kolor || p.kolor, ilosc: (Number(p.ilosc) || 1) * naPunkt,
        uwagi: [p.uwagi, d.uwagi, p.wariant === 'mechanizm' ? 'sam mechanizm' : p.wariant === 'pokrywa' ? 'sama pokrywa / klawisz' : ''].filter(Boolean).join('; ') });
    }
  });
  return { ...o, pozycje, dokladnyDobor: { produktow: wynik.kandydatow } };
}

module.exports = { SCHEMAT, SCHEMAT_POPRAWKI, POPRAWKA, promptSystemowy, przygotujPliki, zamienniki, dobierzDokladnie, dokladnyDobor, NAZWY };
