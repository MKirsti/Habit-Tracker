# ⚔️ Plan: RPG-Habit-Tracker (Arbeitstitel: *Questlog*)

> Status: **Entwurf – wartet auf Freigabe.** Jedes Modul hat eine ID (z. B. `B3`), damit du einfach sagen kannst, was rein soll und was nicht.

---

## 1. Grundidee (Core Loop)

Du bist der Held. Deine Gewohnheiten sind **Quests**. Erledigst du sie, bekommst du **XP, Gold und Attribut-Punkte** und steigst im Level auf. Alle Quests zahlen auf ein großes Ziel ein: die **Hauptquest** (z. B. „Halbmarathon im Juni 2027“). Die ist in **Kapitel/Meilensteine** unterteilt, und am Ende wartet ein **Boss**.

```
Quest erledigt ──► XP + Gold + Attribut-XP ──► Level-Up, Erfolge, Belohnungen
      │
      └──► Fortschritt Meilenstein / Schaden am Boss ──► Hauptquest geschafft 🏆
```

---

## 2. Module zum Absegnen

Legende: **MVP** = erste nutzbare Version · **P2/P3/P4** = spätere Phase · **Optional** = Geschmackssache

### A – Charakter
| ID | Feature | Beschreibung | Empf. |
|----|---------|--------------|-------|
| A1 | Charakterprofil | Name, Avatar (Emoji oder Pixel-Figur), Titel | MVP |
| A2 | Level & XP | XP-Balken, Level-Up mit Animation | MVP |
| A3 | Attribute | 6 Werte, die einzeln leveln: 💪 Stärke (Sport), 🧠 Intelligenz (Lernen), 🧘 Weisheit (Achtsamkeit/Schlaf), 🗣️ Charisma (Soziales), ❤️ Vitalität (Ernährung/Gesundheit), ⚙️ Disziplin (Haushalt/Arbeit/Finanzen). Jede Quest gehört zu einem Attribut. | MVP |
| A4 | Klassen | Krieger/Magier/Mönch … mit kleinem XP-Bonus auf „ihr“ Attribut | Optional |
| A5 | Titel freischalten | z. B. „Frühaufsteher“, „Eiserner Wille“ – als Belohnung für Erfolge | P3 |

### B – Quests (die Habits)
| ID | Feature | Beschreibung | Empf. |
|----|---------|--------------|-------|
| B1 | Tägliche Quests | Abhaken mit einem Tipp | MVP |
| B2 | Rhythmen | täglich · bestimmte Wochentage · X-mal pro Woche | MVP |
| B3 | Messbare Quests | Zielwert mit Teilfortschritt (2 L Wasser, 30 Min Lesen, 10.000 Schritte) | MVP |
| B4 | Schwierigkeit | Leicht / Mittel / Schwer / Episch → bestimmt XP | MVP |
| B5 | Laster | negative Habits („Kein Zucker“) – Rückfall kostet HP | Optional |
| B6 | Nebenquests | einmalige To-dos mit XP (z. B. „Steuererklärung“) | P2 |
| B7 | Tageswechsel | einstellbar (z. B. 4 Uhr nachts statt Mitternacht) | MVP |
| B8 | Nachtragen | gestern vergessen? Bis 1 Tag rückwirkend abhakbar | MVP |

### C – Hauptquest & Meilensteine (das große Ziel)
| ID | Feature | Beschreibung | Empf. |
|----|---------|--------------|-------|
| C1 | Hauptquest | Titel, Beschreibung, **„Warum?“**, Zieldatum, selbst gewählte Belohnung | MVP |
| C2 | Kapitel/Meilensteine | Typen: (a) manuell abhaken, (b) automatisch („Quest X 30× erledigt“), (c) Messwert („10 km am Stück“) | MVP (a+b), P2 (c) |
| C3 | Verknüpfung | Quests einer Hauptquest zuordnen → zählt in deren Fortschritt | MVP |
| C4 | Boss-Kampf | Jedes Kapitel bzw. die Hauptquest ist ein Boss mit HP; jede verknüpfte Quest macht Schaden. Boss-HP wird aus Zieldatum + Quests automatisch berechnet. | P3 |
| C5 | Mehrere Hauptquests | bis zu 3 gleichzeitig | P2 |
| C6 | Ruhmeshalle | Archiv geschaffter Hauptquests mit Statistik | P2 |

### D – Belohnung & Motivation
| ID | Feature | Beschreibung | Empf. |
|----|---------|--------------|-------|
| D1 | Streaks | 🔥-Zähler pro Quest (MVP) + Combo-Bonus auf XP (P2) | MVP/P2 |
| D2 | Gold & Belohnungs-Shop | Du definierst echte Belohnungen („Pizza bestellen – 300 Gold“) und kaufst sie dir | P2 |
| D3 | Items | Streak-Schutz ❄️, Heiltrank 🧪, XP-Trank – im Shop kaufbar | P2 |
| D4 | Zufalls-Loot | Chance auf eine Truhe beim Abhaken (Überraschungseffekt) | P3 |
| D5 | Erfolge/Badges | ca. 30 Stück („100 Quests“, „30-Tage-Streak“, „Erster Boss“) | P2 |
| D6 | Effekte | Konfetti, Sounds, Level-Up-Szene (alles abschaltbar) | P3 (Basis-Animation im MVP) |
| D7 | Perfekter Tag | Bonus, wenn alle Quests des Tages erledigt sind | MVP |

### E – Konsequenzen (Grundsatzentscheidung!)
| ID | Feature | Beschreibung | Empf. |
|----|---------|--------------|-------|
| E1 | Lebenspunkte (HP) | Verpasste Quests kosten HP. Bei 0 HP „Niederlage“: du verlierst einen Teil deines Golds, aber **nie** Level. | P2 |
| E2 | Sanfter Modus | Keine Strafen, verpasste Quests werden nur angezeigt | P2 (als Schalter) |
| E3 | Ruhetage/Urlaub | pausiert Streaks und Schaden (Krankheit, Urlaub) | P2 |

### F – Dashboard & Statistik
| ID | Feature | Beschreibung | Empf. |
|----|---------|--------------|-------|
| F1 | Dashboard | siehe Skizze in Abschnitt 4 | MVP |
| F2 | Kalender-Heatmap | wie bei GitHub, pro Quest und gesamt | P2 |
| F3 | Diagramme | XP pro Woche, Erfüllungsquote, Attribut-Radar | P2 |
| F4 | Abenteuer-Tagebuch | automatisches Log („Tag 42: Level 7 erreicht“) + eigene Notiz pro Tag | P3 |
| F5 | Wochenrückblick | „Bericht des Gildenmeisters“: Woche zusammengefasst | P3 |

### G – Technik & Plattform
| ID | Feature | Beschreibung | Empf. |
|----|---------|--------------|-------|
| G1 | Web-App als PWA | läuft im Browser, auf dem Handy wie eine App installierbar, funktioniert offline | MVP |
| G2 | Lokale Speicherung | Daten bleiben auf deinem Gerät (IndexedDB) – kein Login, kein Server, kostenlos | MVP |
| G3 | Backup | Export/Import als JSON-Datei | MVP |
| G4 | Cloud-Sync | Login + Sync zwischen Handy und PC (z. B. Supabase) | P4 / Optional |
| G5 | Erinnerungen | Push-Benachrichtigungen (iPhone: nur als installierte App, iOS ≥ 16.4) | P4 |
| G6 | Hosting | GitHub Pages – kostenlos, eigene URL, Deployment automatisch bei jedem Push | MVP |

**Tech-Stack (Vorschlag):** React + TypeScript + Vite · Tailwind CSS · Zustand (State) · Dexie.js (IndexedDB) · Recharts (Diagramme) · Framer Motion (Animationen) · vite-plugin-pwa · Vitest (Unit-Tests) + Playwright (End-to-End-Tests).

Die gesamte Spiellogik (XP, Level, Streaks, Schaden, Boss) wird als reine Funktionen gebaut und vollständig per Unit-Tests abgesichert. Alle Zahlen stehen in **einer** Balancing-Datei, damit man sie später leicht nachjustieren kann.

---

## 3. Spielmechanik konkret (Balancing-Entwurf)

| Was | Wert |
|-----|------|
| XP pro Quest | Leicht 10 · Mittel 20 · Schwer 40 · Episch 80 |
| Messbare Quest | volle XP bei Erreichen des Zielwerts |
| Level-Kurve | XP für Level n → n+1 = `100 × n^1,5` → 1→2: 100 · 2→3: 283 · 5→6: 1.118 · 10→11: 3.162 |
| Attribut-XP | jede Quest gibt ihre XP auch ihrem Attribut (eigene, flachere Kurve) |
| Streak-Bonus | +5 % XP pro Tag in Folge, max. +50 % (ab Tag 10) |
| Perfekter Tag | +25 % der Tages-XP als Bonus |
| Gold | XP ÷ 2 |
| HP (falls E1) | Max. 50 + 5 pro Level · verpasst: Leicht −2 / Mittel −4 / Schwer −6 / Episch −8 · Perfekter Tag heilt +10 · Level-Up heilt komplett |
| Niederlage (0 HP) | −30 % Gold, HP wieder voll, Level und Streaks bleiben |

**Gefühlte Geschwindigkeit** bei ca. 5 mittleren Quests/Tag (≈ 100 XP + Boni):
Level 5 nach ~2–3 Wochen · Level 10 nach ~3 Monaten · Level 20 nach ~1,5 Jahren. Am Anfang schnelle Erfolgserlebnisse, später langsamer, aber jeder Level fühlt sich verdient an.

---

## 4. Dashboard-Skizze

```
┌────────────────────────────────────────────────────────────┐
│ 🧙 Held · Level 7 „Wanderer“            💰 340   ❤️ 42/85   │
│ XP ████████████░░░░░░░░  820 / 1.470                       │
├───────────────────────────────┬────────────────────────────┤
│ 📜 HEUTIGE QUESTS  (3/5)       │ 🏔️ HAUPTQUEST               │
│ [✓] 🏃 30 Min laufen  +40 XP 🔥12│ Halbmarathon · 01.06.2027   │
│ [✓] 📖 20 Seiten lesen +20 XP  │ Kapitel 2/5: „10 km laufen“ │
│ [ ] 💧 Wasser   1,2 / 2 L      │ ████████░░░░░░░  54 %       │
│ [ ] 🧘 Meditieren     +10 XP   │ 🐉 Boss: 1.240 / 2.000 HP   │
│ [✓] 🦷 Zahnseide      +10 XP   │ noch 211 Tage               │
├───────────────────────────────┼────────────────────────────┤
│ 🏅 Neu: „Bücherwurm“ (30 Tage) │ 📊 Attribute                │
│ ⭐ Noch 2 Quests bis Perfekter Tag│ 💪 6  🧠 9  🧘 3  ❤️ 5 …   │
└───────────────────────────────┴────────────────────────────┘
```
Auf dem Handy untereinander, heutige Quests ganz oben.

**Seiten:** Dashboard · Quests verwalten · Hauptquest-Detail (Kapitel als Zeitleiste/Karte) · Charakter (Attribute, Erfolge, Titel) · Shop & Inventar · Statistik · Einstellungen (Tageswechsel, Strafen an/aus, Backup).

---

## 5. Datenmodell (Kurzfassung)

```ts
Character  { name, avatar, level, xp, gold, hp, attributes: Record<Attr, {level, xp}> }
Habit      { id, title, icon, attribute, difficulty, schedule, target?, unit?, mainQuestId?, archived }
Completion { habitId, date, value, xpGained }          // ein Eintrag pro Quest & Tag
MainQuest  { id, title, why, deadline, reward, status, chapters: Chapter[] }
Chapter    { id, title, type: 'manual'|'count'|'metric', criteria, done, bossHp? }
Reward     { id, title, cost }        Item { id, type, qty }
Achievement{ id, unlockedAt }         LogEntry { date, type, text }
Settings   { dayStartHour, penalties, sounds, ... }
```
Level, Streaks und Fortschritte werden aus den `Completion`-Einträgen **berechnet** statt nur gespeichert – dadurch bleibt alles konsistent, auch beim Nachtragen oder wenn man das Balancing ändert.

---

## 6. Roadmap

| Phase | Ziel | Inhalt (bei Standard-Empfehlung) |
|-------|------|----------------------------------|
| **0 – Setup** | Fundament | Projekt, Linting, Tests, automatisches Deployment auf GitHub Pages |
| **1 – MVP „Spielbar“** | ab hier täglich nutzbar | A1 A2 A3 · B1 B2 B3 B4 B7 B8 · C1 C2(a+b) C3 · D1(Zähler) D7 · F1 · G1 G2 G3 G6 |
| **2 – Motivation** | Belohnung & Konsequenz | D1(Bonus) D2 D3 D5 · E1 E2 E3 · B6 · C2(c) C5 C6 · F2 F3 |
| **3 – Episch** | Wow-Effekt | C4 Boss-Kampf · D4 Loot · D6 Effekte · F4 F5 · A5 (A4) |
| **4 – Überall** | mehrere Geräte | G4 Sync · G5 Erinnerungen |

Jede Phase endet mit einer **funktionierenden, getesteten und online erreichbaren** Version.

---

## 7. Offene Entscheidungen

1. **Plattform:** Web-App/PWA (Handy + PC) okay? *(Empfehlung: ja)*
2. **Nutzer:** Nur für dich, Daten lokal – oder von Anfang an mit Login/mehreren Nutzern? *(Empfehlung: nur du, Sync später)*
3. **Strafen:** HP-System (E1) oder nur Belohnungen (E2)? *(Empfehlung: E1 mit milden Werten, abschaltbar)*
4. **Optik:** (a) Dark Fantasy – dunkel, Gold, Pergament-Akzente · (b) Pixel-Art Retro – 8-Bit-Schrift, Sprites · (c) Modern & clean mit RPG-Elementen *(Empfehlung: a)*
5. **Module:** Welche IDs rein/raus? Oder „Empfehlung übernehmen“.
6. **Dein echtes Ziel:** Was ist deine erste Hauptquest, und welche 3–6 Gewohnheiten gehören dazu? Dann richte ich die App direkt damit ein und stimme das Balancing darauf ab.
