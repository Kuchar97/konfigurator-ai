// Osprzęt elektroinstalacyjny: cennik Kontakt-Simon (xls/xlsx) → słownik produktów pogrupowany wg GRUPA.
// Rozbiór nazw przeniesiony z AI Takeoff (takeoff/pricelist.py): rodzaj, kolor, krotność, moduł, IP, status.
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const PLIK = path.join(__dirname, '..', 'data', 'slownik-osprzet.json');

const STATUS = { aktywny: 'aktywny', wkrotce: 'wkrótce', eol: 'do wyczerpania', wycofany: 'wycofany' };
const RODZAJ_ALIASY = { gniazdko: 'Gniazdo', klawisze: 'Klawisz', 'łącznik/przycisk': 'Łącznik', ofiblock: 'Ofiblok' };
const KROTNOSC_SLOWA = [['pojedyncz', 1], ['podwójn', 2], ['potrójn', 3], ['poczwórn', 4]];
const RDZENIE_KOLOROW = ['biał', 'biel', 'czarn', 'szar', 'graf', 'alumin', 'srebr', 'złot', 'brąz', 'kaszmir', 'krem', 'beż',
  'antracyt', 'inox', 'stal', 'chrom', 'tytan', 'satyn', 'szampań', 'czerw', 'zielon', 'niebiesk', 'żółt', 'pomarańcz',
  'transparent', 'transp', 'błękit', 'mahon', 'mosiądz', 'szkło', 'miedź', 'dęb', 'perła', 'lawa', 'mgła', 'chmura', 'noc',
  'charakter', 'drewn', 'dąb', 'orzech'];
// notatka producenta: ' *Do wyczerpania…', ' !Wymagany zasilacz…' (ale nie 'IP44* (*IP44-…)' w nazwie)
const NOTATKA = /\s+[*!](?=\S)/;

function status(uwagi, notatka, cena) {
  const t = `${uwagi} ${notatka}`.toLowerCase();
  if (t.includes('wycofan')) return STATUS.wycofany;
  if (t.includes('wyczerpania')) return STATUS.eol;
  if (t.includes('wkrótce') || (cena !== '' && cena != null && typeof cena === 'string' && isNaN(Number(cena.replace(',', '.'))))) return STATUS.wkrotce;
  return STATUS.aktywny;
}
function rodzaj(nazwa) {
  const w = nazwa.trim().split(/[\s,;(]/, 1)[0];
  return RODZAJ_ALIASY[w.toLowerCase()] || (w.charAt(0).toUpperCase() + w.slice(1));
}
function krotnosc(nazwa) {
  const n = nazwa.toLowerCase(), m = n.match(/(\d+)-krotn/);
  if (m) return Number(m[1]);
  for (const [w, k] of KROTNOSC_SLOWA) if (n.includes(w)) return k;
  return null;
}
const podobnyDoKoloru = s => { s = s.trim().toLowerCase(); return s.length > 0 && s.length <= 30 && !/\d/.test(s) && RDZENIE_KOLOROW.some(r => s.includes(r)); };

// 'Gniazdo …; biały *Do wyczerpania' → [nazwa, kolor, notatka]
function rozbierzNazwe(pelna) {
  const czesci = pelna.split(NOTATKA);
  const glowna = czesci[0].trim(), notatka = czesci.length > 1 ? czesci.slice(1).join(' ').trim() : '';
  const i = glowna.lastIndexOf(';');
  if (i >= 0) {
    const ogon = glowna.slice(i + 1).trim().replace(/\.$/, '').replace(/^kolor\s+/i, '');
    if (podobnyDoKoloru(ogon)) return [glowna.slice(0, i).trim(), ogon.toLowerCase(), notatka];
    // kolor w środkowym członie: 'Przewód …; czerwony; 4 m'
    for (const seg of glowna.split(';').slice(1, -1)) if (podobnyDoKoloru(seg)) return [glowna, seg.trim().toLowerCase(), notatka];
  }
  // kolor jako ostatni człon po przecinku ('…, zastygła lawa', '…, KSIĘŻYCOWA LAWA, IP20/IP44*')
  const segs = glowna.split(',').map(s => s.trim());
  while (segs.length > 1 && /^IP\d/.test(segs[segs.length - 1])) segs.pop();
  const ostatni = segs[segs.length - 1].replace(/^kolor\s+/i, '');
  if (segs.length > 1 && podobnyDoKoloru(ostatni)) return [glowna, ostatni.toLowerCase(), notatka];
  return [glowna, '', notatka];
}

const liczba = v => { if (typeof v === 'number') return v; const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
// adres strony produktu: formuła HYPERLINK albo sam URL (tekst „dane produktu” to tylko etykieta)
const link = v => { const s = String(v || '').trim(), m = s.match(/HYPERLINK\("([^"]+)"/); const u = m ? m[1] : s; return /^https?:\/\//i.test(u) ? u : ''; };

// Cennik (bufor xls/xlsx) → { cennik, aktualizacja, grupy: { nazwa: [pozycje] } }
function zbudujSlownik(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ark = wb.Sheets.Baza || wb.Sheets[wb.SheetNames.find(n => /baza/i.test(n))] || wb.Sheets[wb.SheetNames[0]];
  const wiersze = XLSX.utils.sheet_to_json(ark, { header: 1, defval: '' });
  const hi = wiersze.findIndex(r => r.some(c => String(c).trim() === 'GRUPA'));
  if (hi < 0) throw new Error('W cenniku nie ma kolumny GRUPA.');
  const nag = wiersze[hi].map(c => String(c).replace(/\s+/g, ' ').trim());
  const k = re => nag.findIndex(h => re.test(h));
  const C = { grupa: k(/^GRUPA$/), symbol: k(/^SYMBOL$/), indeks: k(/^Indeks$/i), nazwa: k(/^NAZWA$/), cena: k(/^CENA/i),
    jm: k(/Jedn\. miary/i), uwagi: k(/^uwagi$/i), link: k(/link do e-katalogu/i), hiper: k(/Hiperłącze/i), kategoria: k(/Opis kategorii/i) };
  const tytul = wiersze.slice(0, hi).flat().map(String).find(s => /cennik\s+nr/i.test(s)) || 'Cennik';
  const grupy = {};
  let liczbaPozycji = 0;
  for (const r of wiersze.slice(hi + 1)) {
    const symbol = String(r[C.symbol] || '').trim(), grupa = String(r[C.grupa] || '').trim();
    if (!symbol || !grupa) continue;
    const [nazwa, kolor, notatka] = rozbierzNazwe(String(r[C.nazwa] || ''));
    const cenaSur = r[C.cena], uwagi = String(r[C.uwagi] || '').trim();
    (grupy[grupa] = grupy[grupa] || []).push({
      symbol, grupa, kategoria: String(r[C.kategoria] || '').trim(),
      rodzaj: rodzaj(nazwa), nazwa, kolor, krotnosc: krotnosc(nazwa),
      ip: (nazwa.match(/IP\s?\d{2}/) || [''])[0].replace(' ', ''),
      cena: liczba(cenaSur), jm: String(r[C.jm] || 'szt.').trim() || 'szt.',
      status: status(uwagi, notatka, cenaSur), uwagi: [uwagi, notatka].filter(Boolean).join('; '),
      link: link(r[C.link]) || link(r[C.hiper])
    });
    liczbaPozycji++;
  }
  return { cennik: tytul.trim(), zbudowano: new Date().toISOString(), pozycji: liczbaPozycji, grupy };
}

let pamiec = null, pamiecCzas = 0;
function slownik() {
  try {
    const t = fs.statSync(PLIK).mtimeMs;
    if (!pamiec || t !== pamiecCzas) { pamiec = JSON.parse(fs.readFileSync(PLIK, 'utf8')); pamiecCzas = t; }
    return pamiec;
  } catch { return null; }
}
function zapiszSlownik(s) { fs.writeFileSync(PLIK, JSON.stringify(s)); pamiec = null; }

module.exports = { zbudujSlownik, slownik, zapiszSlownik, rozbierzNazwe, PLIK };
