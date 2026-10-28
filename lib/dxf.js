// Rysunek CAD (DXF / DWG) → tekstowe zestawienie dla AI: ile razy wstawiono każdy blok (symbol) i jakie opisy są na rysunku.
// Logika liczenia bloków jak w AI Takeoff (takeoff/detect_dxf.py): bloki dynamiczne *U… → nazwa oryginału,
// nazwy z Archicada „PIĘTRO$0$Gniazdo podwójne[555]” → „Gniazdo podwójne”, bloki zagnieżdżone rozwijane.
// DWG (format binarny) wymaga konwertera do DXF: dwg2dxf (LibreDWG) albo ODA File Converter – jeśli jest zainstalowany.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const MAX_ZNAKOW = 60000;          // zestawienie dla AI – bez zalewania modelu tysiącami linii
const POMIN_BLOKI = [/^\*(D|X|T|Model_Space|Paper_Space)/i, /^A\$/];

// „03 PIĘTRO 1 (kond.2)$0$Gniazdo podwójne[555]” → „Gniazdo podwójne”; „gn_12” → „gn”; „S_12” zostaje (osobny typ)
function normalizujNazwe(nazwa) {
  const n = nazwa.split('$').pop().replace(/\[\d+\]$/, '');
  const baza = n.replace(/[ _]\d+(_\d+)?$/, '');
  return (baza.trim().length >= 2 ? baza : n).trim();
}

// MTEXT: kody formatowania („\P”, „{\fArial|b0;…}”, „\A1;”) → zwykły tekst
function czystyTekst(t) {
  return String(t)
    .replace(/\\[Pp]/g, ' ')
    .replace(/\\[ACcFfHhQqTtWw][^;\\{}]*;/g, '')
    .replace(/\\[LlOoKk]/g, '')
    .replace(/\\S([^;]*)[\^#/]([^;]*);/g, '$1/$2')
    .replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[uUoO]/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// pary (kod grupy, wartość) z pliku DXF ASCII
function* pary(tekst) {
  const linie = tekst.split(/\r?\n/);
  for (let i = 0; i + 1 < linie.length; i += 2) yield [Number(linie[i].trim()), linie[i + 1]];
}

function wczytajDxf(buf) {
  if (buf.slice(0, 22).toString('latin1').startsWith('AutoCAD Binary DXF')) {
    throw Object.assign(new Error('Binarny DXF nie jest obsługiwany – zapisz rysunek jako DXF tekstowy (ASCII).'), { status: 422 });
  }
  // DXF od AutoCAD 2007 jest w UTF-8; starsze w stronie kodowej Windows – polskie litery z cp1250 nie są krytyczne dla liczenia
  let tekst = buf.toString('utf8');
  if (tekst.includes('\uFFFD')) tekst = buf.toString('latin1');
  if (!/^\s*0\s*\r?\n\s*SECTION/m.test(tekst.slice(0, 2000))) {
    throw Object.assign(new Error('To nie wygląda na plik DXF.'), { status: 422 });
  }

  const bloki = {};              // nazwa bloku → { wstawienia: {nazwa: n}, teksty: [] }
  const rekordy = {};            // uchwyt BLOCK_RECORD → nazwa
  const oryginal = {};           // nazwa bloku dynamicznego (*U…) → uchwyt bloku oryginalnego
  const model = { wstawienia: [], teksty: [] };
  let sekcja = null, blok = null;
  let ob = null;                 // bieżący obiekt: { typ, kody }
  let poprzedni = null;          // poprzednia para – nazwa sekcji po „0 SECTION”

  const zamknij = () => {
    if (!ob) return;
    const k = ob.kody;
    if (sekcja === 'TABLES' && ob.typ === 'BLOCK_RECORD') {
      if (k[5] && k[2]) rekordy[k[5][0]] = k[2][0];
      // XDATA AcDbBlockRepBTag → 1005 = uchwyt bloku, z którego powstał blok dynamiczny
      const i = ob.lista.findIndex(([c, v]) => c === 1001 && v.trim() === 'AcDbBlockRepBTag');
      if (i >= 0 && k[2]) { const h = ob.lista.slice(i).find(([c]) => c === 1005); if (h) oryginal[k[2][0]] = h[1].trim(); }
    } else if (sekcja === 'BLOCKS' && ob.typ === 'BLOCK') {
      blok = k[2] ? k[2][0] : null;
      if (blok) bloki[blok] = bloki[blok] || { wstawienia: [], teksty: [] };
    } else if (sekcja === 'BLOCKS' && ob.typ === 'ENDBLK') {
      blok = null;
    } else if ((sekcja === 'ENTITIES' || (sekcja === 'BLOCKS' && blok)) && ['INSERT', 'TEXT', 'MTEXT', 'ATTRIB'].includes(ob.typ)) {
      if (sekcja === 'ENTITIES' && k[67] && k[67][0].trim() === '1') { ob = null; return; } // arkusz (paper space) – pomijamy
      const cel = sekcja === 'ENTITIES' ? model : bloki[blok];
      if (ob.typ === 'INSERT' && k[2]) cel.wstawienia.push({ nazwa: k[2][0], warstwa: (k[8] || [''])[0] });
      else if (ob.typ === 'ATTRIB' && k[1] && cel.wstawienia.length) {
        const w = cel.wstawienia[cel.wstawienia.length - 1];
        (w.atrybuty = w.atrybuty || []).push(`${(k[2] || [''])[0]}=${czystyTekst(k[1][0])}`);
      } else if (ob.typ !== 'ATTRIB') {
        const t = czystyTekst([...(k[3] || []), ...(k[1] || [])].join(''));
        if (t) cel.teksty.push(t);
      }
    }
    ob = null;
  };

  for (const [kod, wartoscSurowa] of pary(tekst)) {
    const wartosc = wartoscSurowa.replace(/\s+$/, '');
    if (kod === 0) {
      zamknij();
      const typ = wartosc.trim();
      if (typ === 'SECTION') { sekcja = null; poprzedni = 'SECTION'; continue; }
      if (typ === 'ENDSEC') { sekcja = null; continue; }
      ob = { typ, kody: {}, lista: [] };
      poprzedni = null;
      continue;
    }
    if (poprzedni === 'SECTION' && kod === 2) { sekcja = wartosc.trim(); poprzedni = null; continue; }
    if (ob) {
      (ob.kody[kod] = ob.kody[kod] || []).push(kod === 1 || kod === 3 ? wartosc : wartosc.trim());
      if (sekcja === 'TABLES') ob.lista.push([kod, wartosc]);
    }
  }
  zamknij();
  return { bloki, rekordy, oryginal, model };
}

// nazwa efektywna: blok dynamiczny *U12 → nazwa bloku, z którego powstał; potem normalizacja
function nazwaEfektywna(d, nazwa) {
  let n = nazwa;
  if (n.startsWith('*') && d.oryginal[n] && d.rekordy[d.oryginal[n]]) n = d.rekordy[d.oryginal[n]];
  return normalizujNazwe(n);
}

function podsumujDxf(buf, nazwaPliku = 'rysunek.dxf') {
  const d = wczytajDxf(buf);
  const pomin = n => POMIN_BLOKI.some(r => r.test(n));
  const bezposrednio = new Map(), warstwy = new Map(), atrybuty = new Map(), zlozone = new Map(), liscie = new Map();
  const dodaj = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);

  // rozwinięcie bloku zagnieżdżonego: liczy bloki-liście (bez własnych wstawień), z mnożnikiem
  const rozwin = (nazwaSurowa, mnoznik, glebokosc) => {
    const b = d.bloki[nazwaSurowa];
    const n = nazwaEfektywna(d, nazwaSurowa);
    if (pomin(nazwaSurowa) || pomin(n)) return;
    const dzieci = b ? b.wstawienia.filter(w => !pomin(w.nazwa)) : [];
    if (!dzieci.length || glebokosc >= 6) { dodaj(liscie, n, mnoznik); return; }
    for (const w of dzieci) rozwin(w.nazwa, mnoznik, glebokosc + 1);
  };

  for (const w of d.model.wstawienia) {
    if (pomin(w.nazwa)) continue;
    const n = nazwaEfektywna(d, w.nazwa);
    if (pomin(n)) continue;
    dodaj(bezposrednio, n);
    const lw = warstwy.get(n) || new Map(); dodaj(lw, w.warstwa || '0'); warstwy.set(n, lw);
    for (const a of w.atrybuty || []) dodaj(atrybuty, `${n}: ${a}`);
    const b = d.bloki[w.nazwa];
    if (b && b.wstawienia.some(x => !pomin(x.nazwa))) {
      const zaw = new Map();
      for (const x of b.wstawienia) if (!pomin(x.nazwa)) dodaj(zaw, nazwaEfektywna(d, x.nazwa));
      zlozone.set(n, zaw);
    }
    rozwin(w.nazwa, 1, 0);
  }

  // opisy na rysunku (teksty w modelu i wewnątrz wstawionych bloków) – z liczbą wystąpień
  const teksty = new Map();
  for (const t of d.model.teksty) if (t.length <= 120) dodaj(teksty, t);
  const wstawioneBloki = new Set(d.model.wstawienia.map(w => w.nazwa));
  // tekst wewnątrz bloku (np. „TV” w symbolu gniazda) – raz na typ bloku; ile razy blok wstawiono, widać w zestawieniu bloków
  for (const n of wstawioneBloki) for (const t of (d.bloki[n] || { teksty: [] }).teksty) if (t.length <= 60) teksty.set(`[w bloku ${nazwaEfektywna(d, n)}] ${t}`, 1);

  const posort = m => [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  const linie = [
    `Rysunek CAD „${nazwaPliku}” – zestawienie odczytane automatycznie z pliku (bloki = symbole na rzucie).`,
    '',
    `BLOKI WSTAWIONE W RZUCIE (nazwa bloku: liczba wstawień; warstwy):`,
    ...posort(bezposrednio).map(([n, ile]) => `- ${n}: ${ile}  [${posort(warstwy.get(n)).slice(0, 3).map(([w, c]) => `${w}${warstwy.get(n).size > 1 ? ` ×${c}` : ''}`).join(', ')}]`)
  ];
  if (zlozone.size) {
    linie.push('', 'BLOKI ZŁOŻONE (zawierają inne bloki – mogą to być symbole z kilku części albo kontenery, np. całe piętro):');
    for (const [n, zaw] of posort(new Map([...zlozone.keys()].map(k => [k, bezposrednio.get(k)])))) {
      linie.push(`- ${n} (wstawiony ${bezposrednio.get(n)}×) zawiera: ${posort(zlozone.get(n)).slice(0, 25).map(([x, c]) => `${x} ×${c}`).join(', ')}`);
    }
    linie.push('', 'PO ROZWINIĘCIU BLOKÓW ZŁOŻONYCH (bloki bez zagnieżdżeń, łącznie z mnożnikami):',
      ...posort(liscie).map(([n, ile]) => `- ${n}: ${ile}`));
  }
  if (atrybuty.size) linie.push('', 'ATRYBUTY BLOKÓW (nazwa: znacznik=wartość – liczba):', ...posort(atrybuty).slice(0, 200).map(([n, ile]) => `- ${n} – ${ile}`));
  if (teksty.size) linie.push('', 'OPISY NA RYSUNKU (tekst – liczba wystąpień; mogą zawierać legendę i oznaczenia symboli, np. „1DK”, „Z.TV”, „KL”):',
    ...posort(teksty).slice(0, 400).map(([t, ile]) => `- ${t}${ile > 1 ? ` – ${ile}` : ''}`));
  if (!bezposrednio.size && !teksty.size) linie.push('', '(W rzucie nie znaleziono bloków ani opisów – rysunek może składać się z samych linii.)');
  let wynik = linie.join('\n');
  if (wynik.length > MAX_ZNAKOW) wynik = wynik.slice(0, MAX_ZNAKOW) + '\n… (zestawienie skrócone)';
  return { tekst: wynik, bloki: bezposrednio.size, wstawien: [...bezposrednio.values()].reduce((a, b) => a + b, 0), opisow: teksty.size };
}

// ---------- DWG → DXF ----------
const ODA = ['ODAFileConverter', 'C:\\Program Files\\ODA\\ODAFileConverter\\ODAFileConverter.exe', '/usr/bin/ODAFileConverter'];
function ktoryProgram(nazwa) {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [nazwa], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    return String(out).split(/\r?\n/)[0].trim() || null;
  } catch { return null; }
}
function konwerterDwg() {
  const lokalny = path.join(__dirname, '..', 'narzedzia', 'libredwg', process.platform === 'win32' ? 'dwg2dxf.exe' : 'dwg2dxf');
  if (fs.existsSync(lokalny)) return { typ: 'dwg2dxf', exe: lokalny };
  const d = ktoryProgram('dwg2dxf');
  if (d) return { typ: 'dwg2dxf', exe: d };
  for (const c of ODA) { const e = fs.existsSync(c) ? c : ktoryProgram(c); if (e) return { typ: 'oda', exe: e }; }
  return null;
}

function dwgNaDxf(buf) {
  const k = konwerterDwg();
  if (!k) {
    throw Object.assign(new Error('Pliki DWG wymagają konwertera, który nie jest jeszcze zainstalowany. Zapisz rysunek jako DXF (w programie CAD: Zapisz jako → DXF) albo PDF i dodaj go ponownie.'), { status: 422 });
  }
  const katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'konfigurator-dwg-'));
  try {
    const wej = path.join(katalog, 'rysunek.dwg'), wyj = path.join(katalog, 'rysunek.dxf');
    fs.writeFileSync(wej, buf);
    const opcje = { timeout: 180000, stdio: 'ignore', windowsHide: true };
    if (k.typ === 'dwg2dxf') { try { execFileSync(k.exe, ['-y', '-o', wyj, wej], opcje); } catch { /* ostrzeżenia też dają kod ≠ 0 – liczy się plik */ } }
    else {
      const wynik = path.join(katalog, 'dxf'); fs.mkdirSync(wynik);
      execFileSync(k.exe, [katalog, wynik, 'ACAD2018', 'DXF', '0', '1', '*.DWG'], opcje);
      const f = fs.readdirSync(wynik).find(n => /\.dxf$/i.test(n));
      if (f) fs.renameSync(path.join(wynik, f), wyj);
    }
    if (!fs.existsSync(wyj) || !fs.statSync(wyj).size) throw Object.assign(new Error('Nie udało się odczytać pliku DWG – zapisz go jako DXF albo PDF.'), { status: 422 });
    return fs.readFileSync(wyj);
  } finally {
    fs.rmSync(katalog, { recursive: true, force: true });
  }
}

const jestCad = nazwa => /\.(dxf|dwg)$/i.test(nazwa || '');
function podsumujCad(buf, nazwa) {
  return podsumujDxf(/\.dwg$/i.test(nazwa) ? dwgNaDxf(buf) : buf, nazwa);
}

module.exports = { podsumujDxf, podsumujCad, jestCad, konwerterDwg, normalizujNazwe, czystyTekst };
