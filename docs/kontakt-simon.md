# Wiedza domenowa: Kontakt-Simon (osprzęt elektroinstalacyjny)

Źródła: strona producenta kontakt-simon.com.pl (przegląd 2026-09-26) + cennik `data/cennik_KS_3-2026.xlsx` (nr 3/2026,
8964 pozycji, 33 grupy). Dokument do wykorzystania przy rozwoju projektu: reguły dopasowania, nazewnictwo w interfejsie,
teksty pomocy, opisy. Fakty z cennika są pewne; opisy marketingowe ze strony – streszczone.

---

## 1. Obszary oferty producenta

| Obszar (menu strony) | Co obejmuje | Grupy w cenniku |
|---|---|---|
| **Osprzęt elektroinstalacyjny** | łączniki, gniazda, ramki, ściemniacze, ładowarki USB, termoregulatory, gniazda RTV/RJ45/HDMI/głośnikowe, sterowanie roletami | Simon 10, 24, 54 (+Premium, Nature, Touch), 55, 82 (+Detail, Nature), 100, Basic (+Standard, Neos), Akord, Aquarius, Aquaclick, 44 Aqua |
| **Inteligentny dom** | Simon GO (Wi-Fi, aplikacja, Alexa/Google), Simon iO (dla Simon 100) | Simon GO, Simon 24 GO, Simon 54 GO, Simon 55 GO |
| **Systemy rozprowadzania energii** (Simon Connect) | kanały instalacyjne (CABLOPLUS, CABLOMAX, DCS ALU), puszki podłogowe (KGT/KSE IP66, KGH, FB, KFR, KFP, SF, KF), kolumny i minikolumny (ALC, ALK), Ofiblok (PLUS/COMPACT/LINE), obudowy ścienne (SIMON 500, CIMA PRO), moduły **K45** (45×45 mm) | Simon Connect, Simon 400, Simon 480 |
| **Stacje ładowania EV** | Simon Xenon (przestrzeń biznesowa), Simon Neon (parkingi publiczne/prywatne), Simon SM34 (kompakt, PV); 7,4–44 kW; ścienne i wolnostojące | ładowarki samoch. |
| Pozostałe w cenniku | przedłużacze, puszki instalacyjne, uszczelki, wkłady komputerowe/telefoniczne, oprawki (żarówkowe), wyłączniki nadmiarowe wkrętkowe | przedłużacze, puszki instal., uszczelki, wkłady komp. i tel., oprawki, wył.nadm., pozostałe |

Narzędzia producenta: konfigurator osprzętu (konfigurator.kontakt-simon.com.pl), konfigurator puszek podłogowych,
konfigurator stacji ładowania, e-katalog (instrukcje, schematy, deklaracje w zakładce „Pliki do pobrania”), cenniki.

---

## 2. Budowa punktu osprzętu (anatomia) – słownik

Jeden „punkt” na rzucie (np. gniazdo) to w zamówieniu zwykle **kilka pozycji**, zależnie od systemu:

| Element | Opis | Uwagi dla projektu |
|---|---|---|
| **Mechanizm** | część elektryczna montowana w puszce | w Simon 82/100 osobna pozycja, często **bez koloru** |
| **Moduł** | mechanizm z frontem (klawiszem/pokrywą) jako jedna pozycja – dopisek „(moduł)” w nazwie | Simon 10, 24, 54, 55, Basic: zwykle 1 moduł = 1 pozycja + ramka |
| **Klawisz / klawisze** | front łącznika (pojedynczy, podwójny, z oczkiem, z piktogramem) | w części serii osobna pozycja (np. „Klawisz … do: SW1M”) |
| **Pokrywa** | front gniazda / gniazda teleinformatycznego / zaślepki | Simon 82, 100, 54 (np. do gniazd na Keystone) |
| **Ramka** | obramowanie; **krotność 1–5** („Ramka 3-krotna”), poziom/pion (w części serii uniwersalna) | kolor ramki może różnić się od koloru modułu (np. Simon 54: 11 kolorów ramek × 6 kolorów modułów = 66 kombinacji) |
| **Ramka montażowa** | nośna, pod ramkę dekoracyjną | Simon 100 |
| **Puszka** | podtynkowa, natynkowa („Puszka natynkowa 1-krotna do ramek LINE/DUO”), do karton-gipsu (ramki „do puszek karton-gips”) | nie liczymy z rzutu jako produktu osprzętu (blok `PUSZKA_*` pomijany) |
| **Uszczelka** | zestaw do wersji IP44 (np. DUN2/DUN3 w Simon 54 Nature, NU w Simon 24) | „do wersji IP44” = moduł + uszczelka/ramka |
| **Zestaw** | gotowy komplet (np. „Zestaw 3-krotny: 3 gniazda”, zestawy Simon 100) | |
| **Monoblok** | urządzenie kompletne, bez osobnej ramki | Simon Akord, gniazda podwójne „monoblok”, Aquarius, Aquaclick |

Montaż i cechy (występują w nazwach pozycji):
- **szybkozłącza** (zaciski bezśrubowe) vs **zaciski śrubowe**; w Simon 24 **mocowanie PUSH IN** (bez wkrętów, do 3× szybciej);
  w Simon 82 mechanizm bez zdejmowania izolacji (1–2,5 mm²); montaż modułu **na łapki lub wkręty**.
- **przesłony torów prądowych** („z przesłonami”) – ochrona przed dziećmi; standard dla nowych instalacji.
- **gniazdo z uziemieniem** (typ E, polski standard, bolec) vs **Schuko** (typ F) vs „europejsko/amerykańskie” (inne standardy).
- **IP20** (standard), **IP44** (bryzgoszczelne – łazienki, kuchnie; „do wersji IP44 z uszczelką”, „klapka transparentna / w kolorze pokrywy”),
  **IP54** (Aquarius), **IP66** (puszki podłogowe KGT/KSE).
- **podświetlenie LED** („z podświetleniem”, „z sygnalizacją załączenia”), **piktogram** (np. „schody”, „dzwonek”, „światło”).
- **antybakteryjne** (Simon 24, 54 – kod „AB”), **16A/10AX 250V~** (gniazda / łączniki).
- gniazdo **DATA z kluczem uprawniającym** – gniazdo zasilania z wydzielonego obwodu (komputery), nie RJ45.

### Rodzaje łączników i przycisków (nazwy jak w cenniku)

| Nazwa | Zastosowanie |
|---|---|
| łącznik **jednobiegunowy** (pojedynczy) | 1 obwód, 1 miejsce |
| łącznik **dwubiegunowy** | rozłącza L i N (np. urządzenia, łazienki) |
| łącznik **świecznikowy** (podwójny) | 2 obwody z jednego miejsca (żyrandol, 2 grupy lamp) |
| łącznik **schodowy** (pojedynczy / podwójny) | ten sam obwód z 2 miejsc (parami) |
| łącznik **krzyżowy** | 3+ miejsc sterowania (między dwoma schodowymi) |
| łącznik / przycisk **roletowy** (trójpozycyjny 1-0-2, podwójny, elektroniczny) | rolety |
| **przycisk** zwierny / rozwierny, „dzwonek”, „światło” | dzwonki, przekaźniki bistabilne, automatyka schodowa |
| łącznik **hotelowy**, **na kluczyk**, **z czujnikiem ruchu**, **z opóźnieniem wyłączenia** | specjalne |
| **ściemniacz** (obrotowy, naciskowy, do LED 230 V) | regulacja jasności |
| **termostat / termoregulator** | ogrzewanie podłogowe itp. |

---

## 3. Serie – przegląd

| Seria (grupa cennika) | Typ | Budowa | Ramki | Kolory (cennik) | Prefiks kodu | Nazwy w cenniku |
|---|---|---|---|---|---|---|
| **Simon 10** | modułowy, ekonomiczny | moduły + ramki | w tej samej grupie (CR…, 1–5×, uniwersalne poziom/pion, tworzywo; 4-stopniowe zatrzaski) | 3 bazowe: biały, kremowy, czarny mat | C… (CGZ, CW, CGSZ) | „(moduł)” |
| **Simon 24** | modułowy, nowy | moduły PUSH IN + ramki | w tej samej grupie | 5: biały, kaszmirowy, szampański mat, grafitowy mat, czarny mat; wersje antybakteryjne | N… (NW, NGZ) | „(moduł)”, „mocowanie PUSH IN” |
| **Simon 54** | modułowy, średnia/premium | moduły + klawisze/pokrywy | **osobne grupy:** Simon 54 Premium (DR, DRK = karton-gips, puszki DPN), Simon 54 Nature (DRN – szkło, metal, drewno, beton) | moduły: 6 kolorów; ramki Premium 11 kolorów (metaliczne, metalizowane, pastelowe) | D… (DW, DGZ, DP) | „(moduł)” |
| Simon 54 **Premium** | rodzina ramek do Simon 54 | ramki 1–5×, metalowe/metalizowane/tworzywo/szklane | – | 14 | DR, DRK, DPN | „Ramka n-krotna PREMIUM IP20 / IP44” |
| Simon 54 **Nature** | rodzina ramek do Simon 54 | ramki z naturalnych materiałów (szkło 10, metal 6, drewno 4, beton 4 kolory) | – | 27 (np. biała perła, zastygła lawa, inox) | DRN | IP20/IP44 z uszczelką DUN |
| Simon 54 **Touch** | panele dotykowe (szkło hartowane, 1–3 moduły, KNX) | panel zastępuje łącznik; łączy się z Simon 54 | – | 6 (kolory szkieł Nature) | DSTR | „Panel dotykowy S54 Touch …” |
| **Simon 55** | modułowy, nowoczesny (maty) | moduły + klawisze | **w tej samej grupie:** linie **LINE** (klasyczne, TR…), **DUO** (z obwódką/podstawą, TRD…), **Nature** (szkło, metal, drewno) | 35 (biały mat, jasnoszary mat, grafitowy mat, kaszmirowy, aluminium mat, szampański mat, czarny mat…) | T… (TW, TGZ, TKW) | „(moduł)” |
| **Simon 82** | system mechanizm + pokrywa + ramka | **mechanizm (bez koloru)** + **pokrywa/klawisz (kolor)** + ramka | **osobne grupy:** Simon 82 Detail (Original/Select; „podstawa” wystająca od ściany, 38 kolorów), Simon 82 Nature (szkło, drewno, metal, kamień; „pierścień”) | mechanizmy: brak/4 kolory; pokrywy: grafit, aluminium, biały | 75… (mechanizmy), 82… (pokrywy, ramki) | „(mechanizm)” |
| **Simon 100** | premium, nietypowy design; Simon iO (smart) | **mechanizm 1/2 lub 1 + ramka montażowa + klawisz/pokrywa/panel + ramka dekoracyjna**; zestawy | w tej samej grupie | 4 (biały, czarny, biały mat, czarny mat) | 100… (np. 10000101-039) | „(mechanizm 1/2, bez ramki montażowej)” |
| **Simon Basic** | modułowy, klasyczny/ekonomiczny | moduły (montaż na łapki/wkręty) | **osobne grupy:** Simon Basic Standard (BMR – klasyczne), Simon Basic Neos (BMRC – nowoczesne: Classic/Metallic/Decorative, np. dąb, mahoń, tytan) | moduły 7 kolorów | BM… (BMW, BMGZ) | „(moduł)” |
| **Simon Akord** | **monoblok**, zaokrąglone narożniki, minimalizm | urządzenia kompletne, bez ramek; puszki natynkowe w kolorach | brak | 5: biały, beż, aluminium metalizowane, satyna, czarny mat | A… (AW, AGZ) | bez dopisku modułu |
| **Simon Aquarius** | natynkowy bryzgoszczelny **IP54** (łazienki, garaże, zadaszone tarasy) | kompaktowe natynkowe, klapka 180°, łączenie w zestawy pionowe | – (1 kolor) | biały | AQ… | „bryzgoszczelne IP54” |
| **Simon Aquaclick** | natynkowy **IP44**, system CLICK | gniazda 2–4× natynkowe, także z łącznikiem (garaże), klapka transparentna 180° | – | biały, ciemnoszary, czarny mat | AC… (ACW, ACGZ) | „natynkowe … IP44” |
| **Simon 44 Aqua** | pojedyncze pozycje IP (ramki, pokrywa) | – | – | – | 44… | – |
| **Simon GO / 24 GO / 54 GO / 55 GO** | smart home Wi-Fi (aplikacja, Alexa, Google; działa lokalnie) | sterowniki dopuszkowe, ściemniacze, rolety, termostaty, piloty, czujniki, uchwyty tabletów | wg serii bazowej (24/54/55) | wg serii | GO: EW/GFC/ETS; 24 GO: NE…; 54 GO: DE…/DKE; 55 GO: TE… | „sterowany smartfonem [Wi-Fi]” |
| **Simon Connect** | rozprowadzanie energii (biura, szkoły, szpitale) | moduły **K45**, płytki, wkłady, puszki podłogowe, kolumny, Ofiblok, kanały | – | 27 (np. czysta biel, szary grafit, stal nierdzewna) | K…, TKA…, KFH… | „K45”, „45x45” |
| **Simon 400 / Simon 480** | przyłącza meblowe/biurkowe (listwy, Indesk, Spinner, przewody Wieland) | – | – | biały, czarny, alu-biały, alu-czarny | 43…, 48…, CR… | – |

**Rodziny serii** (seria bazowa → gdzie są ramki / dodatki):
- Simon 54 → ramki: **Simon 54 Premium**, **Simon 54 Nature**; panele: Simon 54 Touch; smart: Simon 54 GO.
- Simon 55 → ramki w tej samej grupie (LINE / DUO / Nature); smart: Simon 55 GO.
- Simon 82 → ramki: **Simon 82 Detail**, **Simon 82 Nature**.
- Simon Basic → ramki: **Simon Basic Standard**, **Simon Basic Neos**.
- Simon 10, Simon 24, Simon 100 → ramki w tej samej grupie; Simon 24 → smart: Simon 24 GO.
- Simon Akord, Aquarius, Aquaclick → bez ramek (monobloki / natynkowe).

---

## 4. Kody kolorów (końcówka symbolu)

Kolor jest zakodowany w końcówce symbolu po `/` (lub `-` w Simon 82/100/400/480). **Kody różnią się między seriami.**

| Seria | Przykłady kod = kolor |
|---|---|
| Simon 54, Basic, Akord, Aquaclick, puszki | 11 = biały, 12 = beż, 18 = ciemnoszary, 21 = stal inox, 26 = aluminiowy, 29 = satynowy, 41 = kremowy, 42 = kaszmirowy, 43 = srebrny mat, 44 = złoty mat, 46 = brąz mat, 48 = antracyt, 49 = czarny |
| Simon 24 | 11 = biały, 34 = szampański mat, 38 = grafitowy mat, 42 = kaszmirowy, 49 = czarny mat |
| Simon 55 / 55 GO | 111 = biały mat, 114 = jasnoszary mat, 116 = grafitowy mat, 142 = kaszmirowy, 143 = aluminium mat, 144 = szampański mat, 149 = czarny mat |
| Simon 54 Nature / Touch | 70 = biała perła, 71 = srebrna mgła, 72 = burzowa chmura, 73 = zastygła lawa, 74 = księżycowa lawa, 75 = wulkaniczna lawa, 77 = inox klasyczny |
| Simon 82 | 30/030 = biały, 38/038 = grafit, 93/093 = aluminium; Detail: kolor ramki / podstawy (np. 093 = aluminium / podstawa biała) |
| Simon 100 | 130 = biały, 138 = czarny, 230 = biały mat, 238 = czarny mat |

Dopiski: **A** po kodzie (np. `/11A`) = **klapka transparentna** (wersje IP44); **AB** (np. `/AB11`) = **antybakteryjny**.

---

## 5. Wnioski dla projektu (dopasowanie produktów)

1. **„Seria” dla ramek ≠ seria mechanizmów.** W Simon 54, 82 i Basic ramki są w osobnych grupach cennika (Premium/Nature,
   Detail/Nature, Standard/Neos). Wybór ramek powinien uwzględniać **rodzinę serii** (np. osobny wybór „linia ramek”),
   inaczej dla Simon 54/82/Basic nie ma żadnej ramki do zaproponowania. W Simon 55 linie ramek (LINE/DUO/Nature) są
   w tej samej grupie – rozróżnia je nazwa („Ramka 2-krotna LINE”, „DUO”).
2. **Simon 82 i Simon 100 wymagają kompletów:** mechanizm (bez koloru) + pokrywa/klawisz (kolor) + ramka (+ ramka montażowa
   w Simon 100). Dobór samego mechanizmu daje niepełną wycenę – potrzebne reguły „składników” jak w zestawach.
3. **Monobloki (Akord, Aquarius, Aquaclick)** – bez ramek; pole „ramka” powinno być dla nich niedostępne.
4. **Konwencje nazw:** „(moduł)” w Simon 10/24/54/55/Basic; „(mechanizm)” w Simon 82/100; brak dopisku w Akord;
   „bryzgoszczelne IP54” (Aquarius), „natynkowe … IP44” (Aquaclick). Reguły dopasowania nie mogą zakładać jednej konwencji.
5. **Gniazdo „z uziemieniem”** = typ E (standard PL); Schuko, „europejsko/amerykańskie” – tylko na wyraźne żądanie.
6. **Gniazdo DATA** = zasilanie z wydzielonego obwodu (z kluczem), nie gniazdo komputerowe RJ45.
7. **Kolor ramki może się różnić od koloru modułu** (Simon 54: 66 kombinacji) – docelowo osobny kolor ramek.
8. Grupy spoza osprzętu (EV, Connect, 400/480, przedłużacze, oprawki, wył.nadm.) nie mają odpowiedników symboli z rzutu
   instalacji mieszkaniowej – dopasowanie automatyczne słusznie nic tam nie proponuje.

---

## 5a. Język zamówień (e-maile od klientów / handlowców)

- **„włącznik” / „przełącznik” / „wyłącznik” = łącznik (komplet)** – domyślnie zawsze dobieramy **kompletny łącznik**
  (moduł: mechanizm z klawiszem, np. Simon 55 **TW…**: TW1 jednobiegunowy, TW5 świecznikowy, TW6 schodowy, TW6/2
  schodowy podwójny, TW7 krzyżowy), **nie sam klawisz**. **Klawisz** (sam plastik, np. Simon 55 **TKW…**) tylko gdy
  zamówienie wprost mówi „klawisz” – klawisze w cenniku opisane kodami mechanizmów: SW1M/SW6M/SW7M → klawisz
  pojedynczy, SW5M → podwójny, SW6/2M, SW7/2M → podwójny do tych mechanizmów.
- „podwójny” (bez „schodowy”) = łącznik **świecznikowy**; „pojedynczy” = **jednobiegunowy**.
- Ramki w zamówieniach: „pojedyncza / podwójna / potrójna / poczwórna / pięciokrotna” = ramka 1–5-krotna.
- „gniazdka” = gniazda wtyczkowe z uziemieniem; „gniazda internetowe” = RJ45; „gniazda tv” = RTV.
- Seria „Simon 55 GO” w treści zwykle oznacza system Simon 55 + sterowniki GO – osprzęt standardowy jest w „Simon 55”.

## 5b. Kody produktów – prefiks = seria

Pierwsza litera (znak) kodu zwykle wskazuje serię: **T** = Simon 55 (i 55 GO), **D** = Simon 54 (wszystkie odmiany),
**N** = Simon 24, **C** = Simon 10, **B** = Simon Basic, **8** = Simon 82, **1** = Simon 100, **A** = Simon Akord /
Aquaclick / Aquarius, **4** = Simon 400 / 480 / 44 Aqua. Prefiks nie jest jednoznaczny dla wszystkich grup (np. „A”,
„4”, Simon Connect: K/5/S/T; pojedyncze akcesoria z innymi literami) – traktuj jako wskazówkę, serię potwierdzaj
w cenniku. W serii: np. Simon 55 **TW** = łączniki, **TKW** = klawisze, **TGZ** = gniazda, **TR** = ramki.

## 6. Słownictwo do interfejsu i tekstów pomocy (PL)

- „osprzęt elektroinstalacyjny”, „łączniki i gniazda”, „seria”, „linia ramek”, „kolor modułu”, „kolor ramki”,
  „ramka n-krotna”, „montaż podtynkowy / natynkowy”, „wersja bryzgoszczelna IP44”, „z przesłonami torów prądowych”,
  „z podświetleniem LED”, „szybkozłącza / zaciski śrubowe”, „moduł”, „mechanizm”, „pokrywa”, „klawisz”, „monoblok”.
- Przykładowe podpowiedzi:
  - Seria: „Linia osprzętu producenta (np. Simon 54). Ramki części serii są w osobnych liniach (np. Simon 54 Premium).”
  - Ramka: „Obramowanie punktu; krotność = liczba modułów w jednej ramce (1–5).”
  - IP44: „Wersja bryzgoszczelna do łazienek i kuchni – moduł z uszczelką i klapką.”
  - Gniazdo DATA: „Gniazdo zasilania z wydzielonego obwodu (np. komputery), z kluczem – nie jest gniazdem RJ45.”

## 7. Strony producenta (źródła)

- https://kontakt-simon.com.pl/pl/ (menu, serie, konfiguratory)
- Serie: Simon-54-Premium, Simon-54-Nature, Simon-54-Touch, Simon-55, Simon-10, Simon-24, Simon-Basic-Standard,
  Simon-Basic-Neos, Simon-Detail-82, Simon-82-Nature, Simon-100, Simon-Akord, Simon-Aquarius, Simon Aquaclick, Simon-GO
  (`https://kontakt-simon.com.pl/pl/<nazwa>.html`)
- https://kontakt-simon.com.pl/pl/Systemy-rozprowadzania-energii.html, https://kontakt-simon.com.pl/pl/Puszki-podlogowe.html
- https://kontakt-simon.com.pl/pl/stacje-ladowania-pojazdow-elektrycznych
- https://kontakt-simon.com.pl/pl/Wsparcie-techniczne.html, e-katalog: https://kontakt-simon.com.pl/pl/Katalog/
