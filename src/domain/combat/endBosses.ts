/**
 * Kampagnen-Endgegner (Phase 3b): reine Daten – einer je Vorlage bzw. Pfad, dazu ein allgemeiner für eigene
 * Kampagnen (`custom`). Welcher gilt, wann er erwacht und wie viel Leben er hat, entscheidet `endBoss.ts` (das letzte
 * Kapitel der Kampagne ist der Endgegner).
 *
 * Regeln (geprüft in `endBosses.test.ts`):
 * - Schlüssel laut Vertrag (`<vorlage>` bzw. `<vorlage>:<pfad>`, dazu `custom`); `id` = `end-<schlüssel>` mit
 *   Bindestrich statt Doppelpunkt – stabil, nie umbenennen (Tagebuch und Szenen finden den Endgegner darüber).
 * - Namen mit Artikel, wie die Titel der Kampagnen („Der Bibliothekar der Ewigkeit“). Sie stehen für sich – als
 *   Überschrift oder in „… besiegt“ –, nie mitten in einem Satz, der einen anderen Fall bräuchte.
 * - Jeder Endgegner gehört zur Geschichte seiner Kampagne und wartet am Ende ihres letzten Kapitels. `description`
 *   passt angekündigt wie erwacht, `defeatLine` gehört in die Siegesszene: je 1–2 Sätze in Du-Form, episch, aber
 *   freundlich – keine Zahlen (Einsteiger und Fortgeschrittene teilen sich den Endgegner), nichts Beschämendes.
 * - Icons: je ein Emoji, verschieden untereinander, von den Wochen-Bossen und von den Gefährten.
 */
import type { EndBossDefinition } from '../types'

export const END_BOSSES: Record<string, EndBossDefinition> = {
  // 📚 Der Weg des Gelehrten – letztes Kapitel „Der Gelehrte“: 12 bzw. 24 Bücher beendet.
  scholar: {
    id: 'end-scholar',
    name: 'Der Bibliothekar der Ewigkeit',
    icon: '🕰️',
    description:
      'Zwischen Regalen, die bis zu den Sternen reichen, wacht er über jedes Buch, das je geschrieben wurde. Er fragt nicht, wie schnell du liest – nur, ob du bis zur letzten Seite gehst.',
    defeatLine:
      'Der Bibliothekar der Ewigkeit verneigt sich und schreibt deinen Namen in sein großes Verzeichnis. Die Geschichten all deiner Bücher trägst du jetzt in dir.',
  },

  // 🗡️ Der Weg des Körpers, Pfad Kraftsport – letztes Kapitel „Fünfzig“ bzw. „Hundert Schlachten“ (Trainings).
  'body:strength': {
    id: 'end-body-strength',
    name: 'Der Granitkoloss',
    icon: '🗿',
    description:
      'Ein Riese aus uraltem Fels, so schwer, dass die Erde unter seinen Schritten ächzt. Kein Hebel der Welt bewegt ihn – nur du, Training um Training.',
    defeatLine:
      'Der Granitkoloss gerät ins Wanken, lacht donnernd und reicht dir seine gewaltige Hand. Jede einzelne Einheit hat dich hierher getragen.',
  },

  // 🏹 Der Weg des Körpers, Pfad Ausdauersport – die Kapitel folgen einer Fährte, am Ende „Die (große) Feuerprobe“:
  // mit Startnummer ins Ziel.
  'body:endurance': {
    id: 'end-body-endurance',
    name: 'Der Silberhirsch',
    icon: '🦌',
    description:
      'Seit Menschengedenken zieht er durch die Wälder, und noch nie hat jemand mit ihm Schritt gehalten. Seine Fährte führt dich geradewegs zur Startlinie.',
    defeatLine:
      'Im Ziel bleibt der Silberhirsch stehen und senkt sein Geweih vor dir. Zum ersten Mal hat jemand die ganze Strecke mit ihm Schritt gehalten.',
  },

  // 🛡️ Der Weg des Körpers, Pfad Sport allgemein & Spielsport – letztes Kapitel „Fünfzig“ bzw. „Fünfundsiebzig Kämpfe“.
  'body:sports': {
    id: 'end-body-sports',
    name: 'Der Minotaurus der Arena',
    icon: '🐂',
    description:
      'Seit Jahren unbesiegt, stampft er durch den Sand, bis die Ränge beben. Er wartet darauf, dass du immer wieder in die Arena zurückkehrst.',
    defeatLine:
      'Der Minotaurus senkt schnaubend die Hörner und tritt zur Seite. Die Menge tobt und ruft deinen Namen – jeder Jubel ist verdient.',
  },

  // ⚗️ Der Alchemist – letztes Kapitel „Der Stein der Weisen“: Portion für Portion Gemüse & Obst.
  alchemist: {
    id: 'end-alchemist',
    name: 'Der Smaragdwächter',
    icon: '💎',
    description:
      'Tief im Labor bewacht er den Stein der Weisen. Ihn rührt kein Gold – nur die Geduld, mit der du Tag für Tag deinen Kessel füllst.',
    defeatLine:
      'Der Smaragdwächter öffnet seine steinerne Hand und legt dir den Stein der Weisen hinein. Der Stein schimmert in allen Farben deines Gemüsekorbs.',
  },

  // 📿 Der stille Mönch – letztes Kapitel „Zehn“ bzw. „Dreißig Stunden Stille“ (Meditation).
  monk: {
    id: 'end-monk',
    name: 'Der Gedankenaffe',
    icon: '🐒',
    description:
      'Er springt von Gedanke zu Gedanke, schnattert, plant und grübelt – am liebsten genau dann, wenn du still sitzen willst. Fangen lässt er sich nicht, nur zur Ruhe bringen.',
    defeatLine:
      'Der Gedankenaffe gähnt, rollt sich in deinem Schoß zusammen und schläft ein. Zum ersten Mal ist es in dir ganz still – und es fühlt sich wunderbar an.',
  },

  // 🌄 Der Frühaufsteher – letztes Kapitel „Hundert“ bzw. „Hundertzwanzig Morgen“.
  earlyRiser: {
    id: 'end-earlyRiser',
    name: 'Der Schlummerkönig',
    icon: '🛌',
    description:
      'Von seinem Thron aus Daunenkissen herrscht er über jeden Morgen und drückt für dich die Schlummertaste – nur noch fünf Minuten, für immer.',
    defeatLine:
      'Der Schlummerkönig blinzelt ins Morgenlicht, gähnt herzhaft und überlässt dir seine Krone. Ab heute gehören die Morgenstunden dir.',
  },

  // 🏰 Die Festung – letztes Kapitel „Der Schatzmeister“: kein Taler verschwindet mehr spurlos.
  fortress: {
    id: 'end-fortress',
    name: 'Der Kobold der leeren Taschen',
    icon: '👺',
    description:
      'Er haust in Geldbörsen und Schubladen und lässt Münzen verschwinden, ohne dass jemand weiß, wohin. Ins Licht deines Haushaltsbuchs traut er sich nicht.',
    defeatLine:
      'Ertappt: Der Kobold der leeren Taschen gibt jeden Taler zurück und zieht für immer aus. Deine Festung steht – bis in den letzten Winkel der Schatzkammer.',
  },

  // 🧑‍🤝‍🧑 Die Gefährten – Freundschaften schlafen im Schweigen ein; letztes Kapitel „Der Bund der Gefährten“.
  fellowship: {
    id: 'end-fellowship',
    name: 'Der Winter des Schweigens',
    icon: '🌨️',
    description:
      'Wo er vorüberzieht, frieren Gespräche ein und Freundschaften schlafen unter tiefem Schnee. Jede deiner Nachrichten, jeder Anruf ist ein kleines Feuer gegen ihn.',
    defeatLine:
      'Der Winter des Schweigens schmilzt in der Wärme all deiner Botschaften. Ringsum brennen die Lagerfeuer deiner Gefährten – ein Bund, der hält.',
  },

  // 🌍 Der Polyglotte – letztes Kapitel „Der Polyglotte“: Wort für Wort im Vokabeltraining.
  polyglot: {
    id: 'end-polyglot',
    name: 'Das Chamäleon der tausend Zungen',
    icon: '🦎',
    description:
      'Es wechselt die Sprache schneller als die Farbe und schnappt mit seiner langen Zunge jedes Wort weg, das du nicht wiederholst. Wer dranbleibt, versteht irgendwann, was es flüstert.',
    defeatLine:
      'Das Chamäleon nimmt die Farben deiner Zielsprache an und spricht nur noch sie – und du verstehst jedes Wort. Eine neue Welt steht dir offen.',
  },

  // Eigene Kampagnen (und unbekannte Vorlagen): der Widerstand, der am Ende jedes großen Vorhabens wartet.
  custom: {
    id: 'end-custom',
    name: 'Der Schatten des Zweifels',
    icon: '🌑',
    description:
      'Er wartet am Ende jedes großen Vorhabens und flüstert, das Ziel sei zu weit. Mit jedem Schritt, den du trotzdem gehst, wird seine Stimme leiser.',
    defeatLine:
      'Der Schatten des Zweifels löst sich im Licht deines Ziels auf. Du hast es geschafft – genau so, wie du es dir vorgenommen hast.',
  },
}
