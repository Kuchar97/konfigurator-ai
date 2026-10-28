# Konfigurator AI Kontakt-Simon (prototyp)

Rozwinięcie konfiguratora puszek podłogowych (osobny projekt): **puszki podłogowe** KGT, KGH, FB, KFP, KFR
oraz **osprzęt elektroinstalacyjny** (gniazda, łączniki, ramki… w seriach Simon 10, 24, 54, 55, 82, 100, Basic, Akord…)
w jednej ofercie – z cenami, dostępnością, dokumentacją, PDF/Excel/Salesforce.

## Osprzęt elektroinstalacyjny

- Strona startowa → „Osprzęt elektroinstalacyjny”: wklej listę z maila („Gniazdo – 12 szt”, „5 x łącznik schodowy”,
  sekcje „Ramki:”, seria i kolor w treści) → ekran doboru: seria, kolor modułów, linia i kolor ramek, przycisk „Dobierz ramki” (ramki 1–5-krotne po 1 szt. jako
  osobne pozycje – ilość i kolor każdej ramki do zmiany w tabeli),
  produkt dla każdej pozycji (lista propozycji albo kod z cennika), „≈” = dopasowanie przybliżone → „Dodaj do oferty”.
- Logika przeniesiona z **AI Takeoff** (j-sobotka/electrical-takeoff): rozbiór cennika (`lib/osprzet-slownik.js`,
  zgodny 1:1 ze słownikiem AI Takeoff), reguły doboru (`data/reguly-osprzet.json`), dopasowanie (`lib/osprzet-dobor.js`),
  lista z maila bez AI (`lib/osprzet-lista.js`). Wiedza domenowa: [docs/kontakt-simon.md](docs/kontakt-simon.md).
- Słownik `data/slownik-osprzet.json` powstaje z cennika – przy imporcie cennika w zakładce Dane (razem z puszkami).
- **Analiza AI** (`POST /api/osprzet/ai`, `lib/ai-osprzet.js`): mail + załączniki PDF / JPG / PNG / DWG / DXF / EML → pozycje
  w języku reguł doboru, seria, linia ramek, kolor, pytania do klienta, puszki podłogowe (przycisk przenosi je do
  konfiguratora puszek) i pozycje poza zakresem. Rysunki CAD czyta `lib/dxf.js` (liczba wstawień bloków, bloki dynamiczne
  i zagnieżdżone, opisy/legenda – jak `detect_dxf.py` w AI Takeoff) i przekazuje AI jako tekst.
- **Kody produktów** w liście („DR1/11 3szt”) → dokładnie ten produkt (dowolna seria); seria startowa – z kodów.
  Wyszukiwarka `GET /api/osprzet/szukaj` – cały cennik, po kodzie albo słowach nazwy (najpierw seria i kolor).
- **Zamiana serii**: pozycje z kodem z innej serii → odpowiedniki w nowej serii przez AI (`POST /api/osprzet/zamienniki`,
  lista produktów zawężona do koloru modułów/ramek), bez AI – reguły doboru po nazwie produktu; oznaczenie „zamiast …”.
- **DWG** → DXF: LibreDWG `dwg2dxf` (GPL, osobny proces). Windows: `narzedzia/libredwg/` (wersja 0.14, z
  https://github.com/LibreDWG/libredwg/releases); Linux: `dwg2dxf` w PATH. Bez konwertera DWG jest odrzucany z prośbą o DXF/PDF.

## Uruchomienie

Dwuklik na **`Uruchom konfigurator.bat`** albo w terminalu:

```bash
npm start
```

Aplikacja działa pod adresem http://localhost:3490 (okno terminala musi pozostać otwarte). Może działać równolegle
z konfiguratorem puszek (port 3480) – ma osobne konta, wyceny i ciasteczko logowania.

## Analiza zapytań przez AI

Na ekranie startowym można wkleić treść maila i/lub dodać pliki (PDF, JPG, PNG, .eml, .txt). Model Claude (`claude-opus-5`, `lib/ai.js`) rozpoznaje, jakie puszki są potrzebne, a konfigurator dobiera serie i buduje gotowe zestawy do sprawdzenia i dodania do oferty.

Wymaga klucza API Anthropic – *Dane → AI – analiza zapytań klientów* (zapis lokalny w `data/ustawienia.json`, poza repozytorium) albo zmienna środowiskowa `ANTHROPIC_API_KEY`. Włączony jest serwerowy fallback (`fallbacks: "default"`): jeśli model odmówi analizy, zapytanie automatycznie przejmuje model zapasowy.

## Konta i wyceny

- Logowanie adresem e-mail. **Pierwsze założone konto zostaje jedynym administratorem** (tylko on widzi *Dane* i *Konta*).
- Rodzaje kont:
  - **Pracownik Kontakt-Simon** – stanowisko (4 do wyboru), aktywny po akceptacji administratora; akceptuje hurtownie, które wybrały go na opiekuna, i ustala im rabat standardowy.
  - **Hurtownia** – nazwa, oddział, stanowisko, wybór opiekuna z Kontakt-Simon (aktywuje ją opiekun); potwierdza instalatorów/projektantów i odpowiada na ich zapytania oraz zapytania klientów.
  - **Instalator / biuro projektowe** – firma (lub JDG), stanowisko, co najmniej jedna hurtownia (dostaje powiadomienie i potwierdza współpracę).
  - **Klient indywidualny** – e-mail + miasto inwestycji.
- Zapytania o rabat (do wielu adresatów naraz): klient → hurtownie i instalatorzy; instalator → hurtownie; hurtownia → pracownik Kontakt-Simon.
- Rabat w ofercie może wpisać każdy; na PDF/Excelu pojawia się dopisek „Wycena zatwierdzona przez …”, gdy rabat pochodzi z przyznanego zapytania lub rabatu standardowego, a w przeciwnym razie „wycena orientacyjna”.
- Wyceny zalogowanych zapisują się automatycznie i dostają kod `KS-XXXX-XXXX` (otwieranie po kodzie po zalogowaniu; cudza wycena – tylko odczyt).
- **Potwierdzenie e-maila:** po rejestracji wysyłany jest link (ważny 48 h); bez potwierdzenia nie da się zalogować, a prośby o akceptację trafiają do opiekuna/administratora dopiero po potwierdzeniu. Pierwsze konto (administrator) nie wymaga potwierdzenia; administrator może potwierdzić adres ręcznie w *Konta*.
- **Poczta:** *Dane → Poczta e-mail* – ustawienia SMTP (nodemailer) i test wysyłki. Bez SMTP wiadomości trafiają do *skrzynki testowej* (`data/poczta/`), widocznej tylko dla administratora.
- Powiadomienia (🔔) działają w aplikacji.
- Dane kont i wycen: `data/konta.json`, `data/wyceny.json`, `data/sesje.json`, `data/powiadomienia.json` (hasła szyfrowane scrypt).

## Aktualizacja danych

- **Nowy cennik** – w aplikacji: *Dane → Nowy cennik* (plik `.xls` „Cennik i arkusz wycen”). Albo: `npm run import -- ścieżka/do/cennika.xls`.
- **Nowy katalog PDF** – *Dane → Nowy katalog PDF*, przypisany do serii.
- **Reguły doboru** (wysokości, wielkości, kasety, nakładki, lista modułów) – `data/reguly.json`. Po zmianie: `npm run sprawdz` (czy wszystkie symbole są w cenniku).

## Struktura

| Ścieżka | Zawartość |
|---|---|
| `server.js` | serwer lokalny: dane, stany magazynowe, strony produktów, import, Excel |
| `lib/cennik.js` | parser cennika xls → `data/produkty.json` |
| `lib/kontakt-simon.js` | monitor stanów, zdjęcia, karty katalogowe, pliki produktu |
| `lib/oferta-xlsx.js` | oferta Excel z formułą rabatu |
| `public/` | aplikacja (HTML/CSS/JS) |
| `data/` | produkty, reguły, katalogi, cache stron produktów |
| `dane/` | materiały źródłowe (katalogi, cennik, notatki `serie-puszek.md`) |

## Format wymiany (AI Takeoff)

*Oferta → Eksport JSON* zapisuje:

```json
{
  "format": "kontakt-simon-wycena", "wersja": 1, "zrodlo": "konfigurator-puszek",
  "cennik": "Cennik nr 3/2026", "projekt": "…", "rabat": 0,
  "pozycje": [{ "symbol": "KGH401/8", "ilosc": 10, "nazwa": "…", "seria": "KGH", "kolor": "stal nierdzewna", "jm": "szt.", "cenaNetto": 358.71 }],
  "zestawy": [{ "nazwa": "…", "seria": "KGH", "liczba": 10, "pozycje": [{ "symbol": "KGH401/8", "ilosc": 1 }] }]
}
```
