// Analiza zapytania klienta (tekst maila, PDF, zdjęcie) przez Claude → lista potrzebnych puszek
// Tryby: 'api' – płatny klucz API; 'subskrypcja' – Claude Code na koncie Claude (Pro/Max), bez klucza API.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk');
const { tokenyZUsage, kosztZTokenow } = require('./ai-uzycie');

const USTAWIENIA = path.join(__dirname, '..', 'data', 'ustawienia.json');
const MODEL = 'claude-opus-5';

function ustawienia() {
  try { return JSON.parse(fs.readFileSync(USTAWIENIA, 'utf8')); } catch { return {}; }
}
function zapiszKlucz(apiKey) {
  const u = ustawienia();
  if (apiKey) u.apiKey = apiKey.trim(); else delete u.apiKey;
  fs.writeFileSync(USTAWIENIA, JSON.stringify(u, null, 1));
}
function klucz() { return process.env.ANTHROPIC_API_KEY || ustawienia().apiKey || null; }
function tryb() { return ustawienia().tryb || (klucz() ? 'api' : 'subskrypcja'); }
function zapiszUstawienie(klucz, wartosc) { const u = ustawienia(); u[klucz] = wartosc; fs.writeFileSync(USTAWIENIA, JSON.stringify(u, null, 1)); }
function ustawTryb(t) { zapiszUstawienie('tryb', t); }

// ---------- Subskrypcja: Claude Code (claude.exe) ----------
// Najnowszy claude.exe dołączony do aplikacji Claude albo „claude” z PATH
function sciezkaClaude() {
  // aplikacja Claude ze Sklepu Windows (MSIX) trzyma pliki w folderze pakietu – %APPDATA%\Claude widzi tylko ona sama,
  // a serwer uruchomiony skrótem z pulpitu musi szukać w %LOCALAPPDATA%\Packages\Claude_…\LocalCache\Roaming
  const bazy = [path.join(process.env.APPDATA || '', 'Claude', 'claude-code')];
  try {
    const pakiety = path.join(process.env.LOCALAPPDATA || '', 'Packages');
    for (const d of fs.readdirSync(pakiety)) if (/^Claude_/i.test(d)) bazy.push(path.join(pakiety, d, 'LocalCache', 'Roaming', 'Claude', 'claude-code'));
  } catch { /* brak folderu pakietów (Linux) */ }
  const znalezione = [];
  for (const baza of bazy) {
    try {
      // układ: <wersja>\claude.exe albo (od 2.1.286) <wersja>\<skrót>\claude.exe
      for (const d of fs.readdirSync(baza)) {
        if (fs.existsSync(path.join(baza, d, 'claude.exe'))) { znalezione.push({ wersja: d, plik: path.join(baza, d, 'claude.exe') }); continue; }
        try { for (const s of fs.readdirSync(path.join(baza, d))) if (fs.existsSync(path.join(baza, d, s, 'claude.exe'))) znalezione.push({ wersja: d, plik: path.join(baza, d, s, 'claude.exe') }); } catch { /* plik, nie folder */ }
      }
    } catch { /* brak aplikacji Claude w tym miejscu */ }
  }
  if (znalezione.length) return znalezione.sort((a, b) => a.wersja.localeCompare(b.wersja, undefined, { numeric: true })).pop().plik;
  if (process.platform === 'win32') return 'claude.exe';
  // Linux (serwer): instalator Claude Code kładzie plik w ~/.local/bin, którego usługa systemd nie ma w PATH
  const lokalny = path.join(os.homedir(), '.local', 'bin', 'claude');
  return fs.existsSync(lokalny) ? lokalny : 'claude';
}

// Claude Code uruchamiany pojedynczo: kilka procesów naraz przy wygasającym tokenie OAuth kłóci się o jego odświeżenie
// („Failed to refresh OAuth token: another Claude Code process is refreshing it”)
let kolejka = Promise.resolve();
function uruchom(args, opcje = {}) {
  const zadanie = kolejka.then(() => new Promise(ok => {
    execFile(sciezkaClaude(), args, { timeout: 5 * 60 * 1000, maxBuffer: 20 * 1024 * 1024, windowsHide: true, ...opcje },
      (err, stdout, stderr) => ok({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  }));
  kolejka = zadanie.catch(() => {});
  return zadanie;
}

// status logowania pamiętany 2 minuty (strona pyta o niego przy każdym wejściu) – bez zbędnych procesów Claude Code
let statusPamiec = null;
async function statusSubskrypcji({ odswiez } = {}) {
  if (!odswiez && statusPamiec && Date.now() - statusPamiec.czas < 2 * 60 * 1000) return statusPamiec.wynik;
  const { err, stdout } = await uruchom(['auth', 'status'], { timeout: 30000 });
  let wynik;
  if (err && !stdout) wynik = { dostepne: false, zalogowany: false };
  else {
    try { const j = JSON.parse(stdout); wynik = { dostepne: true, zalogowany: !!j.loggedIn, metoda: j.authMethod || null }; }
    catch { wynik = { dostepne: true, zalogowany: false }; }
  }
  statusPamiec = { czas: Date.now(), wynik };
  return wynik;
}
const bladOdswiezaniaTokenu = t => /refresh(ing)? (the )?OAuth token|another Claude Code process/i.test(t || '');

// Otwiera okno logowania Claude Code (logowanie kończy użytkownik w przeglądarce)
function zalogujSubskrypcje() {
  statusPamiec = null; // po zalogowaniu strona ma od razu zobaczyć nowy stan
  spawn('cmd.exe', ['/c', `start "Logowanie Claude" "${sciezkaClaude()}" auth login`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
}

// zadanie: { system (prompt systemowy), schemat (JSON Schema wyniku) }
// chwilowy konflikt odświeżania tokenu OAuth – jedno ponowienie po 20 s
async function analizujSubskrypcja(dane, zadanie) {
  try { return await analizujSubskrypcjaRaz(dane, zadanie); }
  catch (e) {
    if (!bladOdswiezaniaTokenu(e.message)) throw e;
    await new Promise(r => setTimeout(r, 20000));
    try { return await analizujSubskrypcjaRaz(dane, zadanie); }
    catch (e2) {
      if (bladOdswiezaniaTokenu(e2.message)) {
        statusPamiec = null;
        throw Object.assign(new Error('Claude Code nie może odświeżyć logowania (token OAuth). Spróbuj za minutę; jeśli błąd wraca – zaloguj Claude Code ponownie (na serwerze: claude → /login).'), { status: 503 });
      }
      throw e2;
    }
  }
}
async function analizujSubskrypcjaRaz({ tekst, pliki }, zadanie) {
  const katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'konfigurator-ai-'));
  try {
    const nazwy = [];
    if (tekst && tekst.trim()) { fs.writeFileSync(path.join(katalog, 'zapytanie.txt'), tekst.trim()); nazwy.push('zapytanie.txt'); }
    (pliki || []).forEach((p, i) => {
      const n = `${i + 1}_${String(p.nazwa).replace(/[^\w.\-]+/g, '_')}`;
      fs.writeFileSync(path.join(katalog, n), Buffer.from(p.dane, 'base64'));
      nazwy.push(n);
    });
    const polecenie = `Przeanalizuj materiały klienta z tego katalogu (przeczytaj każdy plik narzędziem Read):\n${nazwy.map(n => '- ' + path.join(katalog, n)).join('\n')}\n\nZwróć wynik zgodnie ze schematem JSON.`;
    const { err, stdout, stderr } = await uruchom([
      '-p', polecenie,
      '--output-format', 'json',
      '--json-schema', JSON.stringify(zadanie.schemat),
      '--system-prompt', zadanie.system,
      '--tools', 'Read', '--allowedTools', 'Read',
      '--add-dir', katalog,
      '--permission-mode', 'dontAsk',
      '--no-session-persistence',
      '--max-turns', '12'
    ], { cwd: katalog });
    let j;
    try { j = JSON.parse(stdout); } catch {
      const e = new Error('Claude Code nie zwrócił odpowiedzi.' + (err ? ' ' + (stderr || err.message).slice(0, 300) : '')); e.status = 502; throw e;
    }
    if (j.is_error) {
      const brakLogowania = /not logged in|login/i.test(j.result || '');
      const e = new Error(brakLogowania ? 'Claude Code nie jest zalogowany – kliknij „Zaloguj” w zakładce Dane.' : `Claude Code: ${j.result || j.subtype || 'błąd'}`);
      e.status = brakLogowania ? 401 : 502; throw e;
    }
    const wynik = j.structured_output || JSON.parse(String(j.result).replace(/^```(?:json)?\s*|\s*```$/g, ''));
    wynik.model = Object.keys(j.modelUsage || {})[0] || 'Claude (subskrypcja)';
    // Claude Code podaje tokeny i równowartość kosztu wg cennika API (w subskrypcji rozliczane limitem planu)
    wynik.zuzycie = { tryb: 'subskrypcja', model: wynik.model, ...tokenyZUsage(j.usage), usd: Number(j.total_cost_usd) || 0, czasMs: j.duration_ms || null };
    return wynik;
  } finally {
    fs.rmSync(katalog, { recursive: true, force: true });
  }
}

// ---------- Tryb ręczny: polecenie do wklejenia w claude.ai ----------
// zadanie (opcjonalnie): { system, schemat } – domyślnie analiza samych puszek
function polecenieReczne(R, tekst, zadanie) {
  const z = zadanie || { system: promptSystemowy(R), schemat: SCHEMAT };
  return `${z.system}

Odpowiedz WYŁĄCZNIE jednym obiektem JSON (bez komentarzy i bez bloku kodu) zgodnym z tym schematem JSON:
${JSON.stringify(z.schemat)}

Materiały klienta${tekst && tekst.trim() ? ':\n' + tekst.trim() : ' są w załącznikach do tej wiadomości.'}`;
}

const nullable = s => ({ anyOf: [s, { type: 'null' }] });
const SCHEMAT = {
  type: 'object',
  additionalProperties: false,
  required: ['zestawy', 'podsumowanie', 'pytania_do_klienta', 'pozycje_poza_zakresem'],
  properties: {
    podsumowanie: { type: 'string', description: 'Jedno-dwa zdania: czego dotyczy zapytanie.' },
    pytania_do_klienta: { type: 'array', items: { type: 'string' }, description: 'Brakujące informacje istotne dla doboru.' },
    pozycje_poza_zakresem: { type: 'array', items: { type: 'string' }, description: 'Produkty z zapytania, które nie są puszkami podłogowymi ani ich osprzętem.' },
    zestawy: {
      type: 'array',
      description: 'Jeden element na każdy odrębny typ puszki (różne wyposażenie lub warunki montażu).',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nazwa', 'liczba_puszek', 'podloga', 'miejsce', 'wykonczenie', 'wysokosc_mm', 'zamek', 'seria', 'uzasadnienie_serii', 'potrzeby', 'kolor_osprzetu', 'symbol_wskazany', 'kaseta_zamontowana', 'nakladka', 'kolor_puszki', 'cytat', 'uwagi'],
        properties: {
          nazwa: { type: 'string', description: 'Krótka nazwa, np. pomieszczenie lub strefa: „Sala konferencyjna”.' },
          liczba_puszek: { type: 'integer', description: 'Ile identycznych puszek. 1, jeśli nie podano.' },
          podloga: nullable({ type: 'string', enum: ['wylewka', 'techniczna'] }),
          miejsce: { type: 'string', enum: ['suche', 'mokre', 'zewnatrz'] },
          wykonczenie: nullable({ type: 'string', enum: ['cienkie', '12', 'grube', 'brak'] }),
          wysokosc_mm: nullable({ type: 'integer' }),
          zamek: nullable({ type: 'boolean' }),
          seria: nullable({ type: 'string', enum: ['KGT', 'KGH', 'FB', 'KFP', 'KFR'] }),
          uzasadnienie_serii: { type: 'string' },
          potrzeby: {
            type: 'object',
            additionalProperties: false,
            required: ['zas', 'data', 'rj', 'usb', 'hdmi'],
            properties: {
              zas: { type: 'integer', description: 'Gniazda 230 V (zwykłe) w jednej puszce.' },
              data: { type: 'integer', description: 'Gniazda DATA / UPS / dedykowane w jednej puszce.' },
              rj: { type: 'integer', description: 'Liczba złączy RJ45 (portów) w jednej puszce.' },
              usb: { type: 'integer', description: 'Ładowarki USB w jednej puszce.' },
              hdmi: { type: 'integer', description: 'Złącza HDMI w jednej puszce.' }
            }
          },
          kolor_osprzetu: nullable({ type: 'string', enum: ['bialy', 'czarny', 'aluminium'] }),
          symbol_wskazany: nullable({ type: 'string', description: 'Symbol puszki podany przez klienta, np. wycofana „SF370/1” – dokładnie w formacie SERIA/KOLOR.' }),
          kaseta_zamontowana: nullable({ type: 'string', description: 'Symbol kasety, którą klient ma już zamontowaną (np. „G33”) – wtedy nie dodajemy kasety.' }),
          nakladka: nullable({ type: 'string', enum: ['standard', 'inox', 'brak'], description: 'standard = nakładka wykończeniowa S…05 w kolorze puszki; inox = nakładka ze stali nierdzewnej KF…01/8.' }),
          kolor_puszki: nullable({ type: 'string', enum: ['szary', 'grafit'], description: 'Kolor puszki KFR/nakładki: szary (/1) lub grafit (/14). „Jasnoszary” = szary.' }),
          cytat: { type: 'string', description: 'Fragment zapytania, na którym oparto ten zestaw.' },
          uwagi: { type: 'string' }
        }
      }
    }
  }
};

function opisSerii(R) {
  return Object.entries(R.serie).map(([id, s]) => {
    const wys = s.podlogi.map(p => `${p}: ${s.wysokosc[p][0]}–${s.wysokosc[p][1] >= 999 ? '…' : s.wysokosc[p][1]} mm`).join(', ');
    return `- ${id}: ${s.podtytul}. ${s.opis} Podłogi/wysokość: ${wys}. Moduły K45: ${s.moduly[0]}–${s.moduly[1]}. ${s.ip}, ${s.ik}. Zamek: ${s.zamek ? 'tak' : 'nie'}.`;
  }).join('\n');
}

function promptSystemowy(R) {
  return `Jesteś doradcą technicznym Kontakt-Simon i analizujesz zapytania klientów o puszki podłogowe (maile, opisy, specyfikacje PDF, zdjęcia rzutów lub notatek).
Twoje zadanie: wyodrębnić, jakie puszki podłogowe są potrzebne i z jakim wyposażeniem, i zwrócić wynik w podanym schemacie JSON.

${zasadyPuszek(R)}
- Produkty niebędące puszkami podłogowymi ani ich osprzętem wypisz w pozycje_poza_zakresem.
- Pisz po polsku.`;
}

// wiedza o puszkach – wspólna dla analizy samych puszek i zapytania łączonego (puszki + osprzęt)
function zasadyPuszek(R) {
  return `Aktualne serie puszek:
${opisSerii(R)}

Zasady:
- Każdy odrębny typ puszki (inne wyposażenie albo inne warunki montażu) to osobny zestaw; identyczne puszki łącz w jeden zestaw i podaj liczba_puszek.
- potrzeby opisują wyposażenie JEDNEJ puszki. 2 złącza RJ45 mieszczą się w jednym module K45.
- Gniazda oznaczone jako UPS, DATA, dedykowane lub czerwone licz jako „data”; pozostałe 230 V jako „zas”.
- wykonczenie: „cienkie” = wykładzina/panele/PCV (5 mm), „12” = płytki/parkiet/kamień (12 mm), „grube” = gres/gruby parkiet (20 mm), „brak” = nie wiadomo; null, jeśli nie ma żadnej wskazówki.
- wysokosc_mm: dostępna wysokość w podłodze (wylewka, przestrzeń podłogi technicznej) w mm – zawsze ją wpisz, jeśli pada w zapytaniu (przelicz cm → mm, np. „6,7 cm” = 67). Seria musi się zmieścić: KFP 55–90 mm (najpłytsza, 65 mm), KFR 70–130 mm, FB 70–120 mm, KGT od 81 mm, KGH 123–153 mm. Gdy klient prosi o puszkę „jak najpłytszą” / „płytką” albo wysokość jest mniejsza niż 75 mm – wybierz KFP (do wykończeń grubszych niż 5,5 mm z nakładką wykończeniową).
- miejsce: „mokre”, gdy podłoga jest myta na mokro (szpital, hala, gastronomia); „zewnatrz” dla zadaszonych przestrzeni zewnętrznych.
- seria: jeśli klient wskazał serię lub symbol – użyj jej. W przeciwnym razie stosuj reguły rekomendacji po kolei (każda kolejna zawęża wybór, a gdy go wyklucza – wygrywa): podłoga wylewana lub techniczna → KFR; wykończenie 5 mm → KFR, 12 mm → FB, 20 mm → KGH; zamek → KGT lub FB; mycie na mokro → KGT lub KGH, na zewnątrz → tylko KGT (to zawsze na końcu). Seria musi pomieścić potrzebną liczbę modułów K45 (KFR 2–12, FB 8–12, KGH 4–8, KFP 4–8, KGT 1–2) – jeśli nie mieści, wybierz najlepiej pasującą, która mieści.
- Puszki serii SF są wycofane. Ich zamiennikiem jest seria KFR – ustaw seria = „KFR” i symbol_wskazany = symbol SF z zapytania (np. „SF370/1”; „-035” = /1 szary, „-038” = /14 grafit). Tabela zamienników SF → KFR: ${Object.entries(R.zamienniki || {}).filter(([k]) => !k.startsWith('_')).map(([a, b]) => `${a}→${b}`).join(', ')}.
- Nowe puszki KFR pasują do już zamontowanych kaset G11, G22, G33, G44, G66, G300, G400, G600 (nakładki S105–S605 również). Jeśli klient ma zamontowane kasety, wpisz ich symbol w kaseta_zamontowana – kasety nie dodajemy ponownie. Kasety G201/G301C/G401 należą do KFP, GFB… do FB.
- Jeśli klient zamawia same puszki (np. zamienniki) bez gniazd, ustaw wszystkie potrzeby na 0 – nie dopisuj osprzętu.
- Nakładki: dostępne kolory to szary (/1, RAL 7011) i grafit (/14, RAL 7021) – „jasnoszary” traktuj jako szary i wspomnij o tym w uwagach.
- Nie zgaduj liczb, których nie ma w materiałach – wtedy ustaw rozsądne minimum i dopisz pytanie w pytania_do_klienta.`;
}

// pliki: [{ nazwa, typ (MIME), dane (base64) }]
// trybWymuszony: 'api' dla użytkowników innych niż administrator (serwer decyduje)
async function analizuj(dane, R, trybWymuszony) {
  return zapytaj(dane, { system: promptSystemowy(R), schemat: SCHEMAT }, trybWymuszony);
}
// wspólne wywołanie AI dla dowolnego zadania (puszki podłogowe, osprzęt) – tryb API albo subskrypcja
async function zapytaj(dane, zadanie, trybWymuszony) {
  return (trybWymuszony || tryb()) === 'subskrypcja' ? analizujSubskrypcja(dane, zadanie) : analizujApi(dane, zadanie);
}

async function analizujApi({ tekst, pliki }, zadanie) {
  const apiKey = klucz();
  if (!apiKey) { const e = new Error('Brak klucza API Anthropic – dodaj go w zakładce Dane.'); e.status = 400; throw e; }
  const client = new Anthropic({ apiKey });

  const tresc = [];
  for (const p of pliki || []) {
    if (p.typ === 'application/pdf') {
      tresc.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.dane }, title: p.nazwa });
    } else if (/^image\/(jpeg|png|gif|webp)$/.test(p.typ)) {
      tresc.push({ type: 'image', source: { type: 'base64', media_type: p.typ, data: p.dane } });
    } else {
      // mail (.eml), .txt i inne pliki tekstowe
      tresc.push({ type: 'text', text: `Plik „${p.nazwa}”:\n${Buffer.from(p.dane, 'base64').toString('utf8')}` });
    }
  }
  tresc.push({ type: 'text', text: tekst && tekst.trim() ? `Zapytanie klienta:\n${tekst.trim()}` : 'Przeanalizuj załączone materiały klienta.' });

  const start = Date.now();
  const odp = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: zadanie.system,
    output_config: { format: { type: 'json_schema', schema: zadanie.schemat } },
    messages: [{ role: 'user', content: tresc }]
  });

  if (odp.stop_reason === 'refusal') {
    const e = new Error('Model odmówił analizy tych materiałów.' + (odp.stop_details && odp.stop_details.explanation ? ' ' + odp.stop_details.explanation : ''));
    e.status = 422; throw e;
  }
  if (odp.stop_reason === 'max_tokens') { const e = new Error('Odpowiedź modelu została ucięta – materiały są zbyt obszerne.'); e.status = 422; throw e; }
  const tekstOdp = odp.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const wynik = JSON.parse(tekstOdp);
  wynik.model = odp.model;
  const tokeny = tokenyZUsage(odp.usage);
  wynik.zuzycie = { tryb: 'api', model: odp.model, ...tokeny, ...kosztZTokenow(odp.model, tokeny), czasMs: Date.now() - start };
  return wynik;
}

module.exports = { analizuj, zapytaj, SCHEMAT, zasadyPuszek, zapiszKlucz, klucz, MODEL, tryb, ustawTryb, ustawienia, zapiszUstawienie, statusSubskrypcji, zalogujSubskrypcje, polecenieReczne };
