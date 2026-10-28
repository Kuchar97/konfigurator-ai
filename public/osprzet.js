/* Osprzęt elektroinstalacyjny: lista z maila → dobór produktów w serii i kolorze → zestaw w ofercie.
   Logika doboru na serwerze (lib/osprzet-*.js, przeniesiona z AI Takeoff). */
'use strict';

// stan ekranu (część S – zapisuje się w przeglądarce); zAi – dobór z analizy AI (widok propozycji AI)
const nowyStanOsprzetu = () => ({ tekst: '', pozycje: [], serie: [], seria: null, kolor: null, liniaRamek: null, kolorRamek: null, ramki: null, wynik: null, wybory: {}, wylaczone: {}, edytowany: null, nierozpoznane: [], zAi: false, uwagiAi: '', dodanoZAi: false });
const inst = () => (S.inst = S.inst || nowyStanOsprzetu());
let OSPRZET_TRWA = false;
const PRODUKTY_SERII = {}; // seria → lista produktów (ręczny wybór, pobierana raz)

// ---------- Załączniki analizy AI (pole „Opisz, czego potrzebujesz”) ----------
function typPlikuOsprzetu(f) {
  const roz = f.name.split('.').pop().toLowerCase();
  return { dwg: 'application/acad', dxf: 'image/vnd.dxf' }[roz] || typPliku(f);
}
// duże zdjęcie (telefon) zmniejszane w przeglądarce – AI i tak czyta obraz ok. 2000 px, a plik wysyła się szybciej
async function zmniejszZdjecie(f) {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size < 1.5 * 1024 * 1024) return null;
  try {
    const img = await createImageBitmap(f);
    const skala = Math.min(1, 2400 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * skala); c.height = Math.round(img.height * skala);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', 0.85);
    return { typ: 'image/jpeg', dane: url.split(',')[1], rozmiar: Math.round(url.length * 0.75) };
  } catch { return null; }
}

// ---------- Strona startowa: powrót do ostatniego doboru (wpisywanie i AI – wspólne pole „Opisz, czego potrzebujesz”) ----------
function kartaOsprzetu() {
  const t = inst();
  return t.wynik && t.pozycje.length ? `<p class="small" style="margin:12px 0 0"><button class="btn-link" data-akcja="idz" data-widok="instalacja">Wróć do ostatniego doboru osprzętu (${t.pozycje.length} poz., ${esc(t.seria || '')})</button></p>` : '';
}

// ---------- Osprzęt z analizy AI (zapytanie łączone: puszki + osprzęt) ----------
// o = część „osprzet” z /api/ai/analiza: { pozycje, serie, seria, kolor, liniaRamek, nierozpoznane, uwagi }
async function przyjmijOsprzetZAi(o, tekst) {
  const t = inst();
  if (!o || !o.pozycje || !o.pozycje.length) { if (t.zAi) Object.assign(t, nowyStanOsprzetu()); return; }
  Object.assign(t, nowyStanOsprzetu(), {
    tekst, pozycje: o.pozycje.map((p, i) => ({ ...p, id: 'p' + (i + 1) })), serie: o.serie, seria: o.seria, kolor: o.kolor || kolorZTekstu(o),
    liniaRamek: o.liniaRamek, nierozpoznane: o.nierozpoznane || [], zAi: true, uwagiAi: o.uwagi || ''
  });
  try { await dobierzOsprzet(); } catch (e) { toast('Dobór osprzętu: ' + e.message); t.wynik = null; }
}
const osprzetZAi = () => { const t = inst(); return t.zAi && t.wynik && t.pozycje.length ? t : null; };
const osprzetDoDodaniaZAi = () => { const t = osprzetZAi(); return !!t && !t.dodanoZAi && podsumowanieOsprzetu().sztuk > 0; };
function dodajOsprzetZAi() {
  const t = inst();
  S.oferta.zestawy.push(zestawOsprzetu());
  t.dodanoZAi = true;
}
// sekcja w widoku propozycji AI: seria, kolor, tabela pozycji z produktami, przejście do pełnego doboru
function sekcjaOsprzetuAi() {
  const t = osprzetZAi();
  if (!t) return '';
  const w = t.wynik, sum = podsumowanieOsprzetu();
  const wiersze = w.pozycje.filter(p => !t.wylaczone[p.id]).map(p => {
    const zr = t.pozycje.find(x => x.id === p.id) || {};
    const prod = p.skladniki.map((s, i) => produktSkladnika(p, i)).filter(Boolean);
    const brak = p.skladniki.some((s, i) => !produktSkladnika(p, i));
    return `<tr><td><b>${esc(p.nazwa)}</b>${zr.doSprawdzenia ? ' <span class="plakietka pomaranczowa" title="Ilość policzona przez AI z rysunku lub zdjęcia – sprawdź">sprawdź ilość</span>' : ''}<div class="small muted">${esc(p.zrodlo !== p.nazwa && p.zrodlo !== 'Dobierz ramki' ? '„' + p.zrodlo + '”' : '')}</div></td>
      <td class="num">${p.ilosc}</td>
      <td>${prod.map(x => `<span class="symbol">${esc(x.symbol)}</span>`).join(' + ')}${brak ? ' <span class="plakietka czerwona">brak</span>' : ''}</td>
      <td class="num">${zl(p.skladniki.reduce((a, s, i) => { const pr = produktSkladnika(p, i); return a + (pr ? (pr.cena || 0) * ileSztuk(p, s) : 0); }, 0))}</td></tr>`;
  }).join('');
  return `<h2 class="ai-dzial">Osprzęt elektroinstalacyjny</h2>
    <section class="panel">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
        <div><h2 style="margin:0">${esc(w.seria)}${w.kolor ? ` – ${esc(w.kolor)}` : ''}${w.liniaRamek ? ` <span class="small muted">· ramki ${esc(w.liniaRamek)}</span>` : ''}</h2>
          <p class="small muted" style="margin:4px 0 0">${sum.pozycji} pozycji · ${sum.sztuk} szt.${sum.bez ? ` · <span style="color:var(--bad)">${sum.bez} bez produktu</span>` : ''}${sum.przybl ? ` · ${sum.przybl} przybliżonych ≈` : ''} · ${w.bezRamek ? 'seria bez ramek' : w.pozycje.some(p => p.ramka) ? 'ramki z listy' : 'bez ramek – dodasz je przyciskiem „Dobierz ramki” w doborze'}</p></div>
      </div>
      ${t.uwagiAi ? `<p class="komunikat info" style="margin-top:8px">${esc(t.uwagiAi)}</p>` : ''}
      ${t.nierozpoznane.length ? `<p class="komunikat" style="margin-top:8px">Nie rozpoznano typu: ${t.nierozpoznane.map(esc).join('; ')} – wybierz produkt w doborze.</p>` : ''}
      <table class="tabela" style="margin-top:10px"><thead><tr><th>Pozycja</th><th class="num">Ilość</th><th>Produkt</th><th class="num">Wartość netto</th></tr></thead>
        <tbody>${wiersze}</tbody>
        <tfoot><tr><td colspan="3" class="num">Razem netto</td><td class="num">${zl(sum.netto)}</td></tr></tfoot></table>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap">
        <button class="btn" data-akcja="idz" data-widok="instalacja">Zmień serię, kolor, produkty…</button>
        <button class="btn ${t.dodanoZAi ? '' : 'btn-primary'}" data-akcja="osprzet-ai-dodaj" ${t.dodanoZAi || !sum.sztuk ? 'disabled' : ''}>${t.dodanoZAi ? '✓ Dodano do oferty' : 'Dodaj osprzęt do oferty'}</button>
      </div>
    </section>`;
}

// ---------- Komunikacja z serwerem ----------
async function dobierzOsprzet() {
  const t = inst();
  const w = await api('/api/osprzet/dobierz', { method: 'POST', body: { pozycje: t.pozycje, seria: t.seria, kolor: t.kolor, liniaRamek: t.liniaRamek, kolorRamek: t.kolorRamek } });
  t.wynik = w; t.seria = w.seria; t.kolor = w.kolor; t.liniaRamek = w.liniaRamek; t.kolorRamek = w.kolorRamek; t.ramki = w.ramki;
  zapamietajProdukty(w.pozycje.flatMap(p => p.skladniki.flatMap(s => [s.produkt, ...s.kandydaci])).filter(Boolean));
  pobierzProduktySerii(w.seria); // podpowiedzi kodów w polu produktu
}
// wszystkie produkty serii (kody do podpowiedzi) – pobierane raz na serię, potem odświeżenie widoku
function pobierzProduktySerii(seria) {
  if (PRODUKTY_SERII[seria]) return;
  PRODUKTY_SERII[seria] = [];
  api('/api/osprzet/produkty-serii?seria=' + encodeURIComponent(seria)).then(l => { PRODUKTY_SERII[seria] = l; if (S.widok === 'instalacja') odswiezPodpowiedzi(); }).catch(() => { delete PRODUKTY_SERII[seria]; });
}
function podpowiedziKodow(seria) {
  return `<datalist id="kody-osprzetu">${(PRODUKTY_SERII[seria] || []).map(p => `<option value="${esc(p.symbol)}" label="${esc(p.nazwa.slice(0, 90))}${p.kolor ? ' · ' + esc(p.kolor) : ''}"></option>`).join('')}</datalist>`;
}
function odswiezPodpowiedzi() { const d = document.getElementById('kody-osprzetu'); if (d && inst().wynik) d.outerHTML = podpowiedziKodow(inst().wynik.seria); }

// produkty osprzętu trafiają do P – oferta, PDF, Excel i stany czytają nazwy/ceny/kolory z P
function zapamietajProdukty(lista) {
  for (const p of lista) if (p && p.symbol && !(P[p.symbol] && !P[p.symbol].osprzet)) {
    P[p.symbol] = { symbol: p.symbol, nazwa: p.nazwa, cena: p.cena, jm: p.jm || 'szt.', grupa: p.grupa, link: p.link, kolorOsprzetu: p.kolor || '', osprzet: true, status: p.status };
  }
}
// oferta z zestawami osprzętu wczytana z pamięci lub po kodzie – dociągnij brakujące produkty
async function uzupelnijProduktyOsprzetu() {
  const brak = [...new Set(S.oferta.zestawy.filter(z => z.typ === 'osprzet').flatMap(z => z.pozycje.map(p => p.symbol)))].filter(s => !P[s]);
  if (!brak.length) return false;
  try { zapamietajProdukty(Object.values(await api('/api/osprzet/produkty?symbole=' + encodeURIComponent(brak.join(','))))); return true; }
  catch { return false; }
}

// ---------- Wybrany produkt składnika (ręczny wybór ma pierwszeństwo) ----------
function produktSkladnika(p, i) {
  const w = inst().wybory[`${p.id}:${i}`];
  return w === null ? null : w || p.skladniki[i].produkt;
}
const ileSztuk = (p, s) => p.ilosc * (s.naPunkt || 1);

function podsumowanieOsprzetu() {
  const t = inst(), w = t.wynik;
  let netto = 0, sztuk = 0, bez = 0, przybl = 0, pozycji = 0;
  for (const p of w.pozycje) {
    if (t.wylaczone[p.id]) continue;
    pozycji++;
    p.skladniki.forEach((s, i) => {
      const pr = produktSkladnika(p, i);
      if (!pr) { bez++; return; }
      if (s.przyblizone && !t.wybory[`${p.id}:${i}`]) przybl++;
      sztuk += ileSztuk(p, s); netto += ileSztuk(p, s) * (pr.cena || 0);
    });
  }
  return { netto, sztuk, bez, przybl, pozycji };
}

// ---------- Widok doboru ----------
function widokInstalacja() {
  const t = inst(), w = t.wynik;
  if (!w) return `<section class="panel"><h1>Osprzęt elektroinstalacyjny</h1><p class="muted">Wklej listę albo mail w polu „Opisz, czego potrzebujesz” na stronie startowej.</p></section>
    ${pasekAkcji('<button class="btn" data-akcja="idz" data-widok="start">← Start</button>', '')}`;
  pobierzProduktySerii(w.seria); // po odświeżeniu strony – podpowiedzi kodów muszą być dociągnięte
  const sum = podsumowanieOsprzetu();
  const serieOpt = (t.serie.length ? t.serie : [{ seria: w.seria }]).map(s => `<option value="${esc(s.seria)}" ${s.seria === w.seria ? 'selected' : ''}>${esc(s.seria)}${s.pokryte != null ? ` – rozpoznane ${s.pokryte}/${t.pozycje.length}` : ''}</option>`).join('');
  const kolorOpt = (lista, wyb) => lista.map(k => `<option ${k === wyb ? 'selected' : ''}>${esc(k)}</option>`).join('');
  const wiersze = w.pozycje.map(p => wierszPozycji(p)).join('');
  return `<section class="panel">
    <div class="uwagi-naglowek"><h1>Osprzęt elektroinstalacyjny</h1>
      <span class="small muted">${t.edytowany != null ? `edytujesz zestaw ${t.edytowany + 1} z oferty · ` : ''}dobór wg reguł (AI Takeoff) · ${esc(META.cennik || 'cennik')}</span></div>
    ${t.nierozpoznane.length ? `<p class="komunikat" style="margin:8px 0">Nie rozpoznano typu ${t.nierozpoznane.length} ${t.nierozpoznane.length === 1 ? 'pozycji' : 'pozycji'} – wybierz produkt ręcznie: ${t.nierozpoznane.map(esc).join('; ')}</p>` : ''}
    <div class="osprzet-ustawienia">
      <label class="pole">Seria <select class="tekst" data-osprzet="seria">${serieOpt}</select></label>
      <label class="pole">Kolor modułów <select class="tekst" data-osprzet="kolor">${kolorOpt(w.kolory, w.kolor)}</select></label>
      ${w.bezRamek ? '<span class="small muted" style="align-self:center">Seria bez ramek (monobloki / natynkowe)</span>' : `
      ${w.linieRamek.length > 1 ? `<div class="pole"><span>Linia ramek</span><div class="opcje linie-ramek">${w.linieRamek.map(l => `<button class="opcja ${l === w.liniaRamek ? 'wybrana' : ''}" data-akcja="osprzet-linia" data-wartosc="${esc(l)}">${esc(l)}</button>`).join('')}</div></div>` : ''}
      <label class="pole">Kolor ramek <select class="tekst" data-osprzet="kolorRamek">${kolorOpt(w.koloryRamek, w.kolorRamek)}</select></label>
      ${w.komplety ? '<span class="small muted" style="align-self:center;max-width:320px">Simon 100: każdy punkt składany od zera – ramka Minimal (sama połówka) lub Matrix + uchwyt montażowy + zaślepki ½</span>'
        : `<button class="btn btn-sm" data-akcja="osprzet-dobierz-ramki" style="align-self:flex-end" ${w.krotnosciRamek && w.krotnosciRamek.length ? '' : 'disabled'} title="Dodaje ramki ${esc((w.krotnosciRamek || []).join(', '))}-krotne po 1 szt. w kolorze ramek – ilość i kolor zmienisz w tabeli">+ Dobierz ramki</button>`}`}
      <button class="btn btn-sm" data-akcja="osprzet-dobierz-auto" title="Wyczyść ręczne wybory i dobierz ponownie">Dobierz automatycznie</button>
    </div>
    <div style="overflow-x:auto"><table class="tabela osprzet-tabela">
      <thead><tr><th></th><th>Pozycja z zapytania</th><th class="num">Ilość</th><th>Produkt</th><th class="num">Cena netto</th><th class="num">Wartość</th></tr></thead>
      <tbody>${wiersze}</tbody>
      <tfoot><tr><td></td><td colspan="3">${sum.pozycji} pozycji · ${sum.sztuk} szt.${sum.bez ? ` · <span style="color:var(--bad)">${sum.bez} bez produktu</span>` : ''}${sum.przybl ? ` · ${sum.przybl} przybliżonych ≈` : ''}</td><td></td><td class="num"><b>${zl(sum.netto)}</b></td></tr></tfoot>
    </table></div>
    <div class="osprzet-dodaj">
      <div class="podpowiedz-pole">
        <input class="tekst" id="osprzet-nowa-nazwa" autocomplete="off" spellcheck="false" placeholder="Dodaj produkt: kod albo nazwa (↑↓ wybór, Tab – do ilości)" role="combobox" aria-autocomplete="list" aria-controls="osprzet-podpowiedzi" aria-expanded="false">
        <div id="osprzet-podpowiedzi" class="podpowiedzi" role="listbox" hidden></div>
      </div>
      <input class="tekst" id="osprzet-nowa-ilosc" type="number" min="1" value="1" style="width:90px" title="Ilość – Enter dodaje">
      <button class="btn btn-sm" data-akcja="osprzet-dodaj-pozycje">+ Dodaj</button>
    </div>
    <p class="small muted" style="margin:10px 0 0">≈ – dopasowanie przybliżone (seria nazywa produkt inaczej) – sprawdź. Kod produktu możesz zmienić: wpisz kod albo fragment nazwy – pole podpowie produkty serii; „▾” – propozycje dla tej pozycji.</p>
    ${podpowiedziKodow(w.seria)}
  </section>
  ${pasekAkcji(t.zAi && S.ai && t.edytowany == null ? '<button class="btn" data-akcja="idz" data-widok="ai">← Propozycja AI</button>' : '<button class="btn" data-akcja="idz" data-widok="start">← Start</button>',
    `<span class="muted">Razem netto: <b>${zl(sum.netto)}</b></span><button class="btn btn-primary" data-akcja="osprzet-do-oferty" ${sum.sztuk ? '' : 'disabled'}>${t.edytowany != null ? 'Zapisz zmiany w ofercie →' : 'Dodaj do oferty →'}</button>`)}`;
}

function wierszPozycji(p) {
  const t = inst(), wyl = !!t.wylaczone[p.id];
  // pozycja listy po id (źródło tylko dla starszych zapisów bez id – „Dobierz ramki” ma wspólne źródło)
  let idx = t.pozycje.findIndex(x => x.id === p.id);
  if (idx < 0) idx = t.pozycje.findIndex(x => !x.id && x.zrodlo === p.zrodlo);
  const zrodlowa = t.pozycje[idx] || {};
  return p.skladniki.map((s, i) => {
    const pr = produktSkladnika(p, i), reczny = !!t.wybory[`${p.id}:${i}`];
    const kand = [...(pr && !s.kandydaci.some(k => k.symbol === pr.symbol) ? [pr] : []), ...s.kandydaci];
    // pole kodu (edytowalne, z podpowiedziami produktów serii) + opis produktu + propozycje dla pozycji
    const wybor = `<div class="osprzet-kod">
        <input class="tekst kod" list="kody-osprzetu" value="${esc(pr ? pr.symbol : '')}" data-osprzet-kod="${esc(p.id)}:${i}" placeholder="kod lub nazwa…" autocomplete="off" spellcheck="false" ${wyl ? 'disabled' : ''} title="Wpisz kod albo fragment nazwy – podpowiedzi z serii">
        <select class="tekst propozycje" data-osprzet-produkt="${esc(p.id)}:${i}" ${wyl ? 'disabled' : ''} title="Propozycje dla tej pozycji">
          <option value="">▾</option>
          ${kand.map(k => `<option value="${esc(k.symbol)}" ${pr && k.symbol === pr.symbol ? 'selected' : ''}>${esc(k.symbol)} – ${esc(k.nazwa.slice(0, 70))}${k.kolor ? ' · ' + esc(k.kolor) : ''}</option>`).join('')}
          ${s.rola === 'ramka' ? '<option value="__bez">bez ramki</option>' : ''}
        </select>
        <span class="opis">${pr ? `${esc(pr.nazwa)}${pr.kolor ? ` <span class="muted">· ${esc(pr.kolor)}</span>` : ''}` : `<span class="muted">${esc(s.uwaga || p.uwaga || 'wybierz produkt')}</span>`}</span>
      </div>`;
    const znacznik = !pr ? `<span class="plakietka czerwona" title="${esc(s.uwaga || p.uwaga || '')}">brak</span>`
      : s.innyKolor && !reczny ? `<span class="plakietka pomaranczowa" title="Brak w wybranym kolorze – dobrano inny kolor">inny kolor</span>`
      : (s.przyblizone && !reczny ? '<span class="plakietka pomaranczowa" title="Dopasowanie przybliżone – sprawdź">≈</span>' : '');
    const pierwszy = i === 0;
    return `<tr class="${wyl ? 'wylaczony' : ''} ${pierwszy ? 'osprzet-pierwszy' : ''}">
      <td>${pierwszy ? `<input type="checkbox" data-osprzet-wlacz="${esc(p.id)}" ${wyl ? '' : 'checked'} title="W wycenie">` : ''}</td>
      <td>${pierwszy ? `<b>${esc(p.nazwa)}</b>${p.ramka && idx >= 0 && !wyl
        // ramka: własny kolor w wierszu (domyślnie wspólny „Kolor ramek”)
        ? ` <select class="tekst kolor-ramki" data-osprzet-kolor-ramki="${idx}" title="Kolor tej ramki">${t.wynik.koloryRamek.map(k => `<option ${k === p.kolor ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>`
        : p.kolor && p.kolor !== t.wynik.kolor ? ` <span class="small muted">· ${esc(p.kolor)}</span>` : ''}${zrodlowa.doSprawdzenia ? ' <span class="plakietka pomaranczowa" title="Ilość policzona przez AI z rysunku lub zdjęcia – sprawdź">sprawdź ilość</span>' : ''}${zrodlowa.zamiennikDla ? ` <span class="plakietka niebieska" title="Odpowiednik produktu z poprzedniej serii – sprawdź">zamiast ${esc(zrodlowa.zamiennikDla)}</span>` : ''}<div class="small muted">${esc(p.zrodlo !== p.nazwa && p.zrodlo !== 'Dobierz ramki' ? '„' + p.zrodlo + '”' : '')}${zrodlowa.uwagi ? ` · ${esc(zrodlowa.uwagi)}` : ''}</div>` :`<span class="small muted">${s.rola === 'ramka' ? '+ ramka' : '+ ' + esc(s.czesc)}</span>`}</td>
      <td class="num">${pierwszy ? (idx >= 0 ? licznik(`inst.pozycje.${idx}.ilosc`, p.ilosc, 1, 99999) : p.ilosc) : `<span class="small muted">${ileSztuk(p, s)}</span>`}</td>
      <td>${znacznik} ${wybor}${pr && pr.status && pr.status !== 'aktywny' ? ` <span class="plakietka" title="Status w cenniku">${esc(pr.status)}</span>` : ''}</td>
      <td class="num">${pr && pr.cena != null ? zl(pr.cena) : '—'}</td>
      <td class="num">${pr && pr.cena != null && !wyl ? zl(pr.cena * ileSztuk(p, s)) : ''}</td>
    </tr>`;
  }).join('');
}

// ---------- Zestaw do oferty ----------
function zestawOsprzetu() {
  const t = inst(), w = t.wynik, mapa = new Map();
  for (const p of w.pozycje) {
    if (t.wylaczone[p.id]) continue;
    p.skladniki.forEach((s, i) => {
      const pr = produktSkladnika(p, i);
      if (!pr) return;
      const e = mapa.get(pr.symbol) || { symbol: pr.symbol, ilosc: 0, rola: s.rola === 'ramka' ? 'ramka' : 'instalacja', opis: s.rola === 'ramka' ? 'Ramki' : p.nazwa };
      e.ilosc += ileSztuk(p, s);
      mapa.set(pr.symbol, e);
    });
  }
  const pozycje = [...mapa.values()];
  zapamietajProdukty(pozycje.map(x => w.pozycje.flatMap(p => p.skladniki.map((s, i) => produktSkladnika(p, i))).find(pr => pr && pr.symbol === x.symbol)));
  const netto = pozycje.reduce((a, x) => a + x.ilosc * ((P[x.symbol] && P[x.symbol].cena) || 0), 0);
  const sztuk = pozycje.reduce((a, x) => a + x.ilosc, 0);
  return {
    typ: 'osprzet', nazwa: `Osprzęt ${w.seria}${w.kolor ? ' – ' + w.kolor : ''}`, opis: `${pozycje.length} poz. · ${sztuk} szt.`,
    seria: w.seria, liczba: 1, pozycje, netto: Math.round(netto * 100) / 100,
    stan: JSON.parse(JSON.stringify({ ...t, edytowany: null }))
  };
}

// ---------- Akcje ----------
async function akcjeOsprzetu(a, el) {
  const t = inst();
  switch (a) {
    case 'osprzet-z-listy': {
      // bez AI – lista z pola „Opisz, czego potrzebujesz” (linie „nazwa – ilość”)
      const pole = $('#opis-zapytania');
      if (pole) S.opis = pole.value;
      const tekst = (S.opis || '').trim();
      if (!tekst) { toast('Wklej listę osprzętu, np. „Gniazdo – 12 szt”'); return 'bez'; }
      OSPRZET_TRWA = true; render();
      try {
        const l = await api('/api/osprzet/lista', { method: 'POST', body: { tekst } });
        if (!l.pozycje.length) { toast('Nie znaleziono pozycji z ilościami – zapisz np. „Gniazdo – 12 szt”'); return true; }
        Object.assign(t, nowyStanOsprzetu(), { tekst, pozycje: l.pozycje.map((p, i) => ({ ...p, id: 'p' + (i + 1) })), serie: l.serie, seria: l.seria, kolor: kolorZTekstu(l), nierozpoznane: l.nierozpoznane });
        await dobierzOsprzet();
        S.widok = 'instalacja'; window.scrollTo(0, 0);
      } catch (e) { toast(e.message); }
      finally { OSPRZET_TRWA = false; }
      return true;
    }
    case 'osprzet-dobierz-ramki': {
      // po 1 szt. każdej krotności dostępnej w linii ramek (bez dublowania ramek, które już są na liście)
      const jest = new Set(t.pozycje.filter(p => !p.kod).map(p => (/^ramka (\d)-krotn/i.exec(p.nazwa || '') || [])[1]).filter(Boolean).map(Number));
      const nowe = (t.wynik.krotnosciRamek || []).filter(n => !jest.has(n));
      if (!nowe.length) { toast('Ramki wszystkich krotności są już na liście – zmień ich ilość w tabeli'); return 'bez'; }
      nowe.forEach(n => t.pozycje.push({ id: 'r' + n + Date.now().toString(36), zrodlo: 'Dobierz ramki', nazwa: `Ramka ${n}-krotna`, ilosc: 1 }));
      await dobierzOsprzet().catch(e => toast(e.message));
      toast(`Dodano ramki ${nowe.join(', ')}-krotne po 1 szt. – ustaw ilości i kolory w tabeli`);
      setTimeout(() => { const r = document.querySelector('.kolor-ramki'); if (r) r.closest('tr').scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 50);
      return true;
    }
    case 'osprzet-ai-dodaj': {
      if (!osprzetDoDodaniaZAi()) return 'bez';
      dodajOsprzetZAi(); autoZapisz();
      toast(`Dodano do oferty: Osprzęt ${t.wynik.seria}`);
      return true;
    }
    case 'osprzet-dobierz-auto': t.wybory = {}; t.ramki = null; await dobierzOsprzet().catch(e => toast(e.message)); toast('Dobrano ponownie'); return true;
    case 'osprzet-linia': t.liniaRamek = el.dataset.wartosc; wyczyscWyboryRamek(); await dobierzOsprzet().catch(e => toast(e.message)); return true;
    case 'osprzet-dodaj-pozycje': {
      const nazwa = ($('#osprzet-nowa-nazwa') || {}).value || '', ilosc = Math.max(1, Number(($('#osprzet-nowa-ilosc') || {}).value) || 1);
      if (nazwa.trim().length < 2) { toast('Wpisz kod albo nazwę produktu'); return 'bez'; }
      const wybrany = PODPOW.produkt && PODPOW.produkt.symbol.toLowerCase() === nazwa.trim().toLowerCase() ? PODPOW.produkt
        : (PRODUKTY_SERII[t.seria] || []).find(p => p.symbol.toLowerCase() === nazwa.trim().toLowerCase());
      if (wybrany) {
        // konkretny produkt z podpowiedzi / kodu – dokładnie ten, w podanej ilości
        t.pozycje.push({ id: 'p' + Date.now().toString(36), zrodlo: `${wybrany.symbol} – ${wybrany.nazwa}`, nazwa: wybrany.nazwa, ilosc, kod: wybrany.symbol });
        zapamietajProdukty([wybrany]);
      } else {
        // opis słowny – ta sama normalizacja i reguły co dla listy z maila
        const l = await api('/api/osprzet/lista', { method: 'POST', body: { tekst: `${nazwa.trim()} – ${ilosc}` } }).catch(() => null);
        t.pozycje.push({ ...((l && l.pozycje[0]) || { zrodlo: nazwa, nazwa, ilosc }), id: 'p' + Date.now().toString(36) });
      }
      PODPOW.produkt = null;
      await dobierzOsprzet().catch(e => toast(e.message));
      toast(`Dodano: ${wybrany ? wybrany.symbol : nazwa.trim()} × ${ilosc}`);
      setTimeout(() => { const n = $('#osprzet-nowa-nazwa'); if (n) n.focus(); }, 0); // kolejny produkt od razu
      return true;
    }
    case 'osprzet-do-oferty': {
      if (t.zAi && t.dodanoZAi && t.edytowany == null && !confirm('Osprzęt z tej analizy jest już w ofercie. Dodać go drugi raz?')) return 'bez';
      const z = zestawOsprzetu();
      const zAi = t.zAi && t.edytowany == null;
      if (zAi) t.dodanoZAi = true;
      if (t.edytowany != null && S.oferta.zestawy[t.edytowany] && S.oferta.zestawy[t.edytowany].typ === 'osprzet') { S.oferta.zestawy[t.edytowany] = z; toast('Zapisano zmiany zestawu osprzętu'); }
      else { S.oferta.zestawy.push(z); toast(`Dodano do oferty: ${z.nazwa}`); }
      t.edytowany = null;
      // z tej samej analizy AI zostały puszki – wracamy do propozycji zamiast gubić resztę
      const reszta = zAi ? opisPozostalychZAi() : '';
      if (reszta) toast(`Dodano osprzęt – do dodania zostało jeszcze: ${reszta}`);
      S.widok = reszta ? 'ai' : 'oferta'; autoZapisz(); window.scrollTo(0, 0);
      return true;
    }
  }
  return false;
}
// kolor wskazany w treści (najczęstszy z linii) – domyślny kolor modułów
function kolorZTekstu(l) {
  const ile = {};
  for (const p of l.pozycje) if (p.kolor) ile[p.kolor] = (ile[p.kolor] || 0) + p.ilosc;
  return Object.entries(ile).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

// edycja zestawu osprzętu z oferty
function edytujZestawOsprzetu(i) {
  const z = S.oferta.zestawy[i];
  S.inst = { ...nowyStanOsprzetu(), ...JSON.parse(JSON.stringify(z.stan || {})), edytowany: i };
  S.widok = 'instalacja';
}

// ---------- Zdarzenia pól ekranu ----------
document.addEventListener('change', async e => {
  const el = e.target, t = S.inst;
  if (!t || !el.dataset) return;
  if (el.dataset.osprzet) {
    const pole = el.dataset.osprzet;
    // inna seria: produkty wpisane kodem z poprzedniej serii trzeba zamienić na odpowiedniki (zapamiętane przed doborem)
    const doZamiany = pole === 'seria' ? kodyInnejSerii(el.value) : [];
    t[pole] = pole === 'ramki' ? el.checked : el.value;
    // inna seria – ręczne wybory i linia ramek od nowa
    if (pole === 'seria') { t.wybory = {}; t.liniaRamek = null; t.kolorRamek = null; }
    if (doZamiany.length) {
      await dobierzOsprzet().catch(err => toast(err.message)); // kolory nowej serii – potrzebne do zawężenia listy dla AI
      await zamienKody(doZamiany);
      render();
      return;
    }
    // wspólny kolor ramek – wszystkie ramki od nowa w tym kolorze (także te z kolorem ustawionym w wierszu)
    if (pole === 'kolorRamek') { wyczyscWyboryRamek(); t.pozycje.forEach(p => { delete p.kolorRamki; }); }
    await dobierzOsprzet().catch(err => toast(err.message));
    render();
  } else if (el.dataset.osprzetKolorRamki) {
    const p = t.pozycje[Number(el.dataset.osprzetKolorRamki)];
    if (p) {
      p.kolorRamki = el.value;
      t.wynik.pozycje.filter(x => x.id === p.id).forEach(x => x.skladniki.forEach((s, i) => { delete t.wybory[`${x.id}:${i}`]; }));
      await dobierzOsprzet().catch(err => toast(err.message));
    }
    render();
  } else if (el.dataset.osprzetKod) {
    await ustawKod(el.dataset.osprzetKod, el.value);
    render();
  } else if (el.dataset.osprzetProdukt) {
    const klucz = el.dataset.osprzetProdukt, [pid, i] = klucz.split(':');
    const p = t.wynik.pozycje.find(x => x.id === pid), s = p && p.skladniki[Number(i)];
    if (el.value === '__bez') t.wybory[klucz] = null;
    else if (el.value) { const k = [...(s.kandydaci || []), s.produkt].find(x => x && x.symbol === el.value); if (k) t.wybory[klucz] = k; }
    render();
  } else if (el.dataset.osprzetWlacz) {
    if (el.checked) delete t.wylaczone[el.dataset.osprzetWlacz]; else t.wylaczone[el.dataset.osprzetWlacz] = true;
    render();
  }
});
// ---------- Pole „Dodaj produkt” z podpowiedziami (klawiatura: ↑↓ wybór, Tab/Enter → ilość, Enter w ilości → dodaj) ----------
const PODPOW = { lista: [], zaznaczony: 0, produkt: null };

function szukajProduktow(q) {
  const t = inst(), lista = PRODUKTY_SERII[t.seria] || [];
  const slowa = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!slowa.length) return [];
  const kolor = (t.kolor || '').toLowerCase(), kolorR = (t.kolorRamek || '').toLowerCase();
  // rdzeń dłuższych słów – „czarne” pasuje do „czarny mat”, „podwójnego” do „podwójny”
  const rdzen = w => (w.length > 5 && /^[a-ząćęłńóśźż]+$/.test(w) ? w.slice(0, -2) : w);
  const pasuje = lista.filter(p => { const tx = `${p.symbol} ${p.nazwa} ${p.kolor}`.toLowerCase(); return slowa.every(w => tx.includes(rdzen(w))); });
  // kolejność: kod zaczyna się od wpisu, kolor modułów (ramki – kolor ramek), krótsza nazwa
  const ocena = p => [p.symbol.toLowerCase().startsWith(slowa[0]) ? 0 : 1,
    !p.kolor || p.kolor.toLowerCase() === (/^ramka/i.test(p.nazwa) ? kolorR : kolor) ? 0 : 1, p.nazwa.length];
  return pasuje.sort((a, b) => { const x = ocena(a), y = ocena(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; }).slice(0, 12);
}
function pokazPodpowiedzi() {
  const box = $('#osprzet-podpowiedzi'), inp = $('#osprzet-nowa-nazwa');
  if (!box || !inp) return;
  const widoczne = PODPOW.lista.length > 0;
  box.hidden = !widoczne; inp.setAttribute('aria-expanded', String(widoczne));
  box.innerHTML = PODPOW.lista.map((p, i) => `<div class="podpowiedz ${i === PODPOW.zaznaczony ? 'aktywna' : ''}" role="option" aria-selected="${i === PODPOW.zaznaczony}" data-podpowiedz="${i}">
    <span class="symbol">${p.zRegul ? '<span title="Dobór wg reguł (jak dla listy z maila)">★</span> ' : ''}${esc(p.symbol)}</span><span class="nazwa">${esc(p.nazwa)}${p.kolor ? ` <span class="muted">· ${esc(p.kolor)}</span>` : ''}${p.innaSeria ? ` <span class="plakietka" title="Produkt spoza wybranej serii">${esc(p.grupa)}</span>` : ''}</span><span class="cena">${p.cena != null ? zl(p.cena) : ''}</span></div>`).join('');
  const akt = box.querySelector('.aktywna');
  if (akt) akt.scrollIntoView({ block: 'nearest' });
}
function wybierzPodpowiedz(i) {
  const p = PODPOW.lista[i];
  if (!p) return false;
  PODPOW.produkt = p; PODPOW.lista = [];
  $('#osprzet-nowa-nazwa').value = p.symbol;
  pokazPodpowiedzi();
  const il = $('#osprzet-nowa-ilosc'); il.focus(); il.select();
  return true;
}
let podpowTimer = null;
document.addEventListener('input', e => {
  if (e.target.id !== 'osprzet-nowa-nazwa') return;
  const q = e.target.value.trim();
  PODPOW.produkt = null;
  PODPOW.lista = q.length >= 2 ? szukajProduktow(q) : [];
  PODPOW.zaznaczony = 0;
  pokazPodpowiedzi();
  // po chwili: wyszukiwarka w całym cenniku (kody i nazwy z innych serii) + opis słowny → produkt wg reguł doboru (★)
  clearTimeout(podpowTimer);
  if (q.length >= 2) podpowTimer = setTimeout(async () => {
    const t = inst(), enc = encodeURIComponent;
    const [glob, r] = await Promise.all([
      api(`/api/osprzet/szukaj?q=${enc(q)}&seria=${enc(t.seria || '')}&kolor=${enc(t.kolor || '')}`).catch(() => []),
      q.length >= 3 && /[a-ząćęłńóśźż]{3,}/i.test(q) ? api('/api/osprzet/podpowiedz', { method: 'POST', body: { tekst: q, seria: t.seria, kolor: t.kolor } }).catch(() => null) : null
    ]);
    const inp = $('#osprzet-nowa-nazwa');
    if (!inp || inp.value.trim() !== q) return;
    const reg = r && r.produkty ? r.produkty.map(p => ({ ...p, zRegul: r.typ })) : [];
    const widziane = new Set();
    PODPOW.lista = [...reg, ...glob, ...PODPOW.lista].filter(p => !widziane.has(p.symbol) && widziane.add(p.symbol)).slice(0, 12);
    PODPOW.zaznaczony = 0;
    pokazPodpowiedzi();
  }, 200);
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'osprzet-nowa-nazwa') {
    const n = PODPOW.lista.length;
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); PODPOW.zaznaczony = (PODPOW.zaznaczony + 1) % n; pokazPodpowiedzi(); }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); PODPOW.zaznaczony = (PODPOW.zaznaczony - 1 + n) % n; pokazPodpowiedzi(); }
    else if ((e.key === 'Tab' && !e.shiftKey && n) || (e.key === 'Enter' && n)) { e.preventDefault(); wybierzPodpowiedz(PODPOW.zaznaczony); }
    else if (e.key === 'Enter' && e.target.value.trim()) { e.preventDefault(); const il = $('#osprzet-nowa-ilosc'); il.focus(); il.select(); }
    else if (e.key === 'Escape') { PODPOW.lista = []; pokazPodpowiedzi(); }
  } else if (e.target.id === 'osprzet-nowa-ilosc' && e.key === 'Enter') {
    e.preventDefault();
    akcjeOsprzetu('osprzet-dodaj-pozycje').then(w => { if (w === true) render(); });
  }
});
document.addEventListener('mousedown', e => {
  const el = e.target.closest && e.target.closest('[data-podpowiedz]');
  if (el) { e.preventDefault(); wybierzPodpowiedz(Number(el.dataset.podpowiedz)); }
  else if (!e.target.closest || !e.target.closest('.podpowiedz-pole')) { if (PODPOW.lista.length) { PODPOW.lista = []; pokazPodpowiedzi(); } }
});

// zmiana ilości pozycji (licznik) – przelicz bez ponownego doboru
const przeliczIlosci = () => { const t = S.inst; if (t && t.wynik) t.wynik.pozycje.forEach(p => { const x = t.pozycje.find(q => q.id === p.id); if (x) p.ilosc = Math.max(1, Number(x.ilosc) || 1); }); };

// Kod wpisany w pole produktu: dokładny kod z serii (także z podpowiedzi) albo fragment nazwy.
// Kilka trafień po nazwie – trafiają na górę propozycji „▾” tej pozycji.
async function ustawKod(klucz, wpis) {
  const t = inst(), seria = t.wynik.seria, q = String(wpis || '').trim();
  const [pid, i] = klucz.split(':');
  const poz = t.wynik.pozycje.find(x => x.id === pid), sk = poz.skladniki[Number(i)];
  if (!q) { if (sk.rola === 'ramka') t.wybory[klucz] = null; else delete t.wybory[klucz]; return; }
  const lista = [...(PRODUKTY_SERII[seria] || []), ...sk.kandydaci];
  const kod = lista.find(p => p.symbol.toLowerCase() === q.toLowerCase());
  if (kod) { t.wybory[klucz] = kod; zapamietajProdukty([kod]); return; }
  // cały cennik: dokładny kod z innej serii albo słowa z nazwy – najpierw seria i kolor pozycji (ramki – kolor ramek)
  const kolor = sk.rola === 'ramka' || poz.ramka ? t.wynik.kolorRamek : poz.kolor || t.wynik.kolor || '';
  const enc = encodeURIComponent;
  const wynik = await api(`/api/osprzet/szukaj?q=${enc(q)}&seria=${enc(seria)}&kolor=${enc(kolor)}&limit=40`).catch(() => []);
  const dokladny = wynik.find(p => p.symbol.toLowerCase() === q.replace(/\s+/g, '').toLowerCase());
  if (dokladny) {
    t.wybory[klucz] = dokladny; zapamietajProdukty([dokladny]);
    if (dokladny.innaSeria) toast(`${dokladny.symbol} jest z grupy „${dokladny.grupa}” – spoza serii ${seria}`);
    return;
  }
  const traf = wynik;
  if (!traf.length) { toast(`Nie znaleziono „${q}” w cenniku – sprawdź kod albo wpisz słowa z nazwy`); return; }
  if (traf.length === 1) { t.wybory[klucz] = traf[0]; zapamietajProdukty(traf); toast(`Wybrano ${traf[0].symbol}`); return; }
  sk.kandydaci = [...traf, ...sk.kandydaci.filter(k => !traf.some(x => x.symbol === k.symbol))];
  toast(`Pasuje ${traf.length} produktów – wybierz z propozycji ▾`);
}
// ---------- Zamiana serii: pozycje z kodem ----------
// pozycje wpisane kodem, których produkt należy do innej serii Simon niż nowa (wkłady RJ45 itp. – uniwersalne, zostają)
function kodyInnejSerii(nowa) {
  const t = inst();
  if (!t.wynik) return [];
  return t.pozycje.filter(p => p.kod).map(p => {
    const w = t.wynik.pozycje.find(x => x.id === p.id), pr = w && w.skladniki[0] && w.skladniki[0].produkt;
    return { poz: p, produkt: pr };
  }).filter(({ produkt }) => produkt && /^simon/i.test(produkt.grupa || '') && produkt.grupa !== nowa && !produkt.grupa.startsWith(nowa + ' '));
}
// AI (gdy dostępne) wybiera odpowiedniki z nowej serii; bez AI albo przy braku odpowiednika – reguły doboru po nazwie produktu
async function zamienKody(lista) {
  const t = inst();
  let zamiany = [];
  if (AI_OK) {
    toast(`AI dobiera odpowiedniki ${lista.length} produktów w serii ${t.wynik.seria}…`);
    OSPRZET_TRWA = true; render();
    try {
      const r = await api('/api/osprzet/zamienniki', { method: 'POST', body: { seria: t.wynik.seria, kolor: t.wynik.kolor, kolorRamek: t.wynik.kolorRamek,
        pozycje: lista.map(({ poz, produkt }) => ({ id: poz.id, symbol: produkt.symbol, nazwa: produkt.nazwa, ilosc: poz.ilosc })) } });
      zamiany = r.zamiany;
      Object.keys(KONTA_CACHE).filter(k => k.startsWith('ai-uzycie')).forEach(k => delete KONTA_CACHE[k]);
    } catch (e) { toast('AI: ' + e.message + ' – zamieniam według reguł'); }
    finally { OSPRZET_TRWA = false; }
  }
  let ai = 0, reguly = 0;
  for (const { poz, produkt } of lista) {
    const z = zamiany.find(x => x.id === poz.id);
    poz.zamiennikDla = produkt.symbol;
    poz.uwagi = z && z.uwagi ? z.uwagi : '';
    if (z && z.produkt) { poz.kod = z.produkt.symbol; poz.nazwa = z.produkt.nazwa; zapamietajProdukty([z.produkt]); ai++; }
    else { delete poz.kod; poz.nazwa = produkt.nazwa; reguly++; } // typ z nazwy starego produktu – reguły doboru
  }
  await dobierzOsprzet().catch(e => toast(e.message));
  toast(`Zamieniono ${lista.length} produktów z kodem: ${ai ? `${ai} przez AI` : ''}${ai && reguly ? ', ' : ''}${reguly ? `${reguly} według reguł` : ''} – sprawdź pozycje oznaczone „zamiast …”`);
}

// zmiana linii / koloru ramek – ręcznie wybrane ramki przestają pasować
function wyczyscWyboryRamek() {
  const t = inst();
  for (const p of (t.wynik ? t.wynik.pozycje : [])) p.skladniki.forEach((s, i) => { if (s.rola === 'ramka' || /^ramka/i.test(s.czesc)) delete t.wybory[`${p.id}:${i}`]; });
}
