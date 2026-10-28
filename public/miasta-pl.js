/* Miasta Polski → województwo (ok. 170 największych i powiatowych). Służy do podpowiedzi regionu
   przedstawiciela Kontakt-Simon przy rejestracji; gdy miasta nie ma na liście, użytkownik wybiera województwo. */
'use strict';

const WOJEWODZTWA = ['dolnośląskie', 'kujawsko-pomorskie', 'lubelskie', 'lubuskie', 'łódzkie', 'małopolskie', 'mazowieckie', 'opolskie',
  'podkarpackie', 'podlaskie', 'pomorskie', 'śląskie', 'świętokrzyskie', 'warmińsko-mazurskie', 'wielkopolskie', 'zachodniopomorskie'];

const MIASTA_WOJ = {
  'dolnośląskie': ['Wrocław', 'Wałbrzych', 'Legnica', 'Jelenia Góra', 'Lubin', 'Głogów', 'Świdnica', 'Bolesławiec', 'Oleśnica', 'Dzierżoniów', 'Oława', 'Zgorzelec', 'Kłodzko', 'Bielawa', 'Polkowice', 'Jawor', 'Środa Śląska', 'Trzebnica', 'Kamienna Góra', 'Złotoryja', 'Lwówek Śląski', 'Milicz', 'Wołów', 'Góra', 'Strzelin', 'Ząbkowice Śląskie', 'Kobierzyce', 'Siechnice'],
  'kujawsko-pomorskie': ['Bydgoszcz', 'Toruń', 'Włocławek', 'Grudziądz', 'Inowrocław', 'Brodnica', 'Świecie', 'Chełmno', 'Nakło nad Notecią', 'Rypin', 'Golub-Dobrzyń', 'Wąbrzeźno', 'Mogilno', 'Żnin', 'Tuchola', 'Sępólno Krajeńskie', 'Aleksandrów Kujawski', 'Radziejów', 'Lipno', 'Solec Kujawski', 'Chełmża'],
  'lubelskie': ['Lublin', 'Zamość', 'Chełm', 'Biała Podlaska', 'Puławy', 'Świdnik', 'Kraśnik', 'Łuków', 'Biłgoraj', 'Lubartów', 'Łęczna', 'Tomaszów Lubelski', 'Hrubieszów', 'Krasnystaw', 'Radzyń Podlaski', 'Włodawa', 'Parczew', 'Ryki', 'Opole Lubelskie', 'Janów Lubelski', 'Bełżyce', 'Dęblin'],
  'lubuskie': ['Zielona Góra', 'Gorzów Wielkopolski', 'Nowa Sól', 'Żary', 'Żagań', 'Świebodzin', 'Międzyrzecz', 'Kostrzyn nad Odrą', 'Słubice', 'Sulechów', 'Gubin', 'Lubsko', 'Wschowa', 'Krosno Odrzańskie', 'Strzelce Krajeńskie', 'Drezdenko', 'Sulęcin'],
  'łódzkie': ['Łódź', 'Piotrków Trybunalski', 'Pabianice', 'Tomaszów Mazowiecki', 'Bełchatów', 'Zgierz', 'Skierniewice', 'Radomsko', 'Kutno', 'Zduńska Wola', 'Sieradz', 'Łowicz', 'Wieluń', 'Aleksandrów Łódzki', 'Ozorków', 'Łask', 'Konstantynów Łódzki', 'Łęczyca', 'Opoczno', 'Rawa Mazowiecka', 'Brzeziny', 'Poddębice', 'Wieruszów', 'Pajęczno', 'Koluszki', 'Rzgów'],
  'małopolskie': ['Kraków', 'Tarnów', 'Nowy Sącz', 'Oświęcim', 'Chrzanów', 'Olkusz', 'Nowy Targ', 'Bochnia', 'Gorlice', 'Zakopane', 'Skawina', 'Wieliczka', 'Andrychów', 'Wadowice', 'Myślenice', 'Limanowa', 'Brzesko', 'Dąbrowa Tarnowska', 'Miechów', 'Proszowice', 'Sucha Beskidzka', 'Niepołomice', 'Libiąż', 'Trzebinia', 'Kęty', 'Zabierzów'],
  'mazowieckie': ['Warszawa', 'Radom', 'Płock', 'Siedlce', 'Pruszków', 'Ostrołęka', 'Legionowo', 'Ciechanów', 'Otwock', 'Piaseczno', 'Żyrardów', 'Sochaczew', 'Mińsk Mazowiecki', 'Wołomin', 'Mława', 'Grodzisk Mazowiecki', 'Nowy Dwór Mazowiecki', 'Ząbki', 'Marki', 'Kobyłka', 'Sokołów Podlaski', 'Płońsk', 'Pułtusk', 'Wyszków', 'Ostrów Mazowiecka', 'Garwolin', 'Kozienice', 'Grójec', 'Gostynin', 'Sierpc', 'Żuromin', 'Przasnysz', 'Maków Mazowiecki', 'Węgrów', 'Łosice', 'Białobrzegi', 'Przysucha', 'Szydłowiec', 'Zwoleń', 'Lipsko', 'Łomianki', 'Józefów', 'Sulejówek', 'Konstancin-Jeziorna', 'Błonie', 'Nadarzyn', 'Raszyn', 'Janki', 'Ożarów Mazowiecki', 'Stare Babice', 'Jabłonna'],
  'opolskie': ['Opole', 'Kędzierzyn-Koźle', 'Nysa', 'Brzeg', 'Kluczbork', 'Prudnik', 'Strzelce Opolskie', 'Krapkowice', 'Namysłów', 'Głuchołazy', 'Olesno', 'Głubczyce'],
  'podkarpackie': ['Rzeszów', 'Przemyśl', 'Stalowa Wola', 'Mielec', 'Tarnobrzeg', 'Krosno', 'Dębica', 'Jarosław', 'Sanok', 'Jasło', 'Łańcut', 'Przeworsk', 'Ropczyce', 'Nisko', 'Leżajsk', 'Lubaczów', 'Strzyżów', 'Brzozów', 'Kolbuszowa', 'Ustrzyki Dolne', 'Lesko', 'Sędziszów Małopolski'],
  'podlaskie': ['Białystok', 'Suwałki', 'Łomża', 'Augustów', 'Bielsk Podlaski', 'Zambrów', 'Grajewo', 'Hajnówka', 'Sokółka', 'Siemiatycze', 'Kolno', 'Mońki', 'Wysokie Mazowieckie', 'Sejny', 'Choroszcz', 'Wasilków'],
  'pomorskie': ['Gdańsk', 'Gdynia', 'Sopot', 'Słupsk', 'Tczew', 'Starogard Gdański', 'Wejherowo', 'Rumia', 'Chojnice', 'Malbork', 'Kwidzyn', 'Lębork', 'Pruszcz Gdański', 'Reda', 'Bytów', 'Kościerzyna', 'Kartuzy', 'Puck', 'Człuchów', 'Sztum', 'Nowy Dwór Gdański', 'Ustka', 'Władysławowo', 'Żukowo', 'Pszczółki'],
  'śląskie': ['Katowice', 'Częstochowa', 'Sosnowiec', 'Gliwice', 'Zabrze', 'Bielsko-Biała', 'Bytom', 'Rybnik', 'Ruda Śląska', 'Tychy', 'Dąbrowa Górnicza', 'Chorzów', 'Jaworzno', 'Jastrzębie-Zdrój', 'Mysłowice', 'Siemianowice Śląskie', 'Żory', 'Tarnowskie Góry', 'Piekary Śląskie', 'Będzin', 'Racibórz', 'Świętochłowice', 'Zawiercie', 'Wodzisław Śląski', 'Mikołów', 'Czechowice-Dziedzice', 'Knurów', 'Cieszyn', 'Czeladź', 'Myszków', 'Żywiec', 'Pszczyna', 'Lubliniec', 'Łaziska Górne', 'Orzesze', 'Wisła', 'Ustroń', 'Skoczów', 'Kłobuck', 'Bieruń', 'Lędziny', 'Radzionków', 'Pyskowice', 'Gierałtowice'],
  'świętokrzyskie': ['Kielce', 'Ostrowiec Świętokrzyski', 'Starachowice', 'Skarżysko-Kamienna', 'Sandomierz', 'Końskie', 'Busko-Zdrój', 'Jędrzejów', 'Staszów', 'Pińczów', 'Włoszczowa', 'Opatów', 'Kazimierza Wielka', 'Połaniec', 'Suchedniów'],
  'warmińsko-mazurskie': ['Olsztyn', 'Elbląg', 'Ełk', 'Ostróda', 'Iława', 'Giżycko', 'Kętrzyn', 'Szczytno', 'Bartoszyce', 'Mrągowo', 'Działdowo', 'Pisz', 'Braniewo', 'Lidzbark Warmiński', 'Nidzica', 'Olecko', 'Nowe Miasto Lubawskie', 'Gołdap', 'Węgorzewo', 'Dobre Miasto', 'Biskupiec'],
  'wielkopolskie': ['Poznań', 'Kalisz', 'Konin', 'Piła', 'Ostrów Wielkopolski', 'Gniezno', 'Leszno', 'Swarzędz', 'Luboń', 'Śrem', 'Krotoszyn', 'Września', 'Turek', 'Jarocin', 'Kościan', 'Oborniki', 'Szamotuły', 'Środa Wielkopolska', 'Gostyń', 'Nowy Tomyśl', 'Rawicz', 'Chodzież', 'Wągrowiec', 'Złotów', 'Koło', 'Słupca', 'Kępno', 'Międzychód', 'Grodzisk Wielkopolski', 'Wolsztyn', 'Czarnków', 'Pleszew', 'Ostrzeszów', 'Tarnowo Podgórne', 'Komorniki', 'Suchy Las', 'Kórnik', 'Pobiedziska', 'Mosina', 'Puszczykowo'],
  'zachodniopomorskie': ['Szczecin', 'Koszalin', 'Stargard', 'Kołobrzeg', 'Świnoujście', 'Szczecinek', 'Police', 'Wałcz', 'Białogard', 'Goleniów', 'Gryfino', 'Nowogard', 'Gryfice', 'Świdwin', 'Choszczno', 'Pyrzyce', 'Myślibórz', 'Łobez', 'Drawsko Pomorskie', 'Barlinek', 'Kamień Pomorski', 'Darłowo', 'Sławno', 'Międzyzdroje', 'Dębno']
};

// „Bielsko Biała”, „bielsko-biała ”, „m. Kraków” → „bielsko biala”
const normMiasto = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')
  .replace(/^(m\.|miasto)\s*/, '').replace(/[-‐–]/g, ' ').replace(/\s+/g, ' ').trim();

const WOJ_MIASTA = {};
for (const [woj, lista] of Object.entries(MIASTA_WOJ)) for (const m of lista) WOJ_MIASTA[normMiasto(m)] = woj;

// Region przedstawiciela dla miasta (i opcjonalnie województwa wybranego ręcznie).
// Zwraca { id, email, telefony, zrodlo } albo null, gdy miasta nie znamy i województwo nie jest wybrane.
function regionDlaMiasta(miasto, woj) {
  const RG = (typeof R !== 'undefined' && R && R.regiony) || {};
  const regiony = Object.entries(RG).filter(([k]) => !k.startsWith('_'));
  const n = normMiasto(miasto);
  if (n) {
    const wyjatek = regiony.find(([, r]) => (r.miasta || []).some(m => normMiasto(m) === n));
    if (wyjatek) return { id: wyjatek[0], ...wyjatek[1], zrodlo: 'miasto' };
  }
  const w = (n && WOJ_MIASTA[n]) || woj;
  if (!w) return null;
  const r = regiony.find(([, x]) => (x.wojewodztwa || []).includes(w));
  return r ? { id: r[0], ...r[1], wojewodztwo: w, zrodlo: n && WOJ_MIASTA[n] ? 'wojewodztwo-miasta' : 'wojewodztwo' } : null;
}
