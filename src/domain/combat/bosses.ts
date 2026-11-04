/**
 * Wochen-Bosse (Phase 3a): reine Daten – 18 Gegner, je 3 pro Attribut-Thema. Jeder verkörpert augenzwinkernd
 * den typischen Widerstand seines Bereichs (Stärke: Sofa und Ausreden, Intelligenz: Ablenkung und Vergessen …).
 * Welcher Boss in einer Woche erscheint, entscheidet `boss.ts` (Thema = Attribut mit dem größten geplanten
 * Schaden, Wahl per Hash über die `id`).
 *
 * Regeln (geprüft in `bosses.test.ts`):
 * - `id` ist stabil (steht in `BossVictory.bossId` und bestimmt die Boss-Wahl) – nie umbenennen.
 * - Texte in Du-Form, deutsche Anführungszeichen („…“). `description` und die Zeilen: 1–2 Sätze.
 * - `defeatLine` feiert den Sieg. `escapeLine` ist leicht und freundlich: Ein entkommener Boss kostet nichts –
 *   der Satz beschämt nie, er zwinkert und schaut nach vorn.
 * - Für alle Sprachformen gleich, also ohne „Held“, „Siegerin“ & Co.
 */
import type { BossDefinition } from '../types'

export const BOSSES: BossDefinition[] = [
  // --- Stärke: Bewegung, Sport -------------------------------------------------------------------------------
  {
    id: 'couch-golem',
    name: 'Sofagolem',
    icon: '🛋️',
    theme: 'strength',
    description: 'Ein Koloss aus Kissen und Kuscheldecken. Wer sich zu ihm setzt, versinkt – meist für den ganzen Abend.',
    defeatLine: 'Der Sofagolem zerfällt zu einem Haufen Kissen. Du stehst – stärker als je zuvor!',
    escapeLine: 'Der Sofagolem hat sich gemütlich zurück in die Polster gerollt. Soll er dösen – du ziehst weiter.',
  },
  {
    id: 'drizzle-giant',
    name: 'Nieselriese',
    icon: '🌧️',
    theme: 'strength',
    description: 'Sobald du die Laufschuhe schnürst, lässt er es nieseln. Sein Lieblingssatz: „Morgen wird das Wetter besser.“',
    defeatLine: 'Der Nieselriese verzieht sich grollend hinter den Horizont. Über dir: blauer Himmel und ein verdienter Sieg.',
    escapeLine: 'Der Nieselriese ist mit den Wolken weitergezogen. Nach Regen kommt Sonne – und mit ihr ein neuer Gegner.',
  },
  {
    id: 'lazy-hound',
    name: 'Innerer Schweinehund',
    icon: '🐗',
    theme: 'strength',
    description: 'Er kennt jede Ausrede beim Vornamen und flüstert sie dir ins Ohr – mit erstaunlich treuem Hundeblick.',
    defeatLine: 'Dein innerer Schweinehund trottet kleinlaut davon. Du hast ihn überwunden – und er weiß es.',
    escapeLine: 'Dein innerer Schweinehund hat sich zu einem Nickerchen davongeschlichen. Ihr seht euch wieder – nur keine Eile.',
  },

  // --- Intelligenz: Lesen, Lernen, Sprachen --------------------------------------------------------------------
  {
    id: 'bookworm-golem',
    name: 'Bücherwurm-Golem',
    icon: '📚',
    theme: 'intellect',
    description: 'Er besteht aus ungelesenen Büchern, angefangenen Kursen und Lesezeichen, die seit Monaten auf Seite 12 stecken.',
    defeatLine: 'Seite für Seite zerfällt der Bücherwurm-Golem. Was bleibt, ist Wissen – und das gehört jetzt dir.',
    escapeLine: 'Der Bücherwurm-Golem hat sich zwischen die Regale verkrochen. Keine Eile – gute Bücher laufen nicht weg.',
  },
  {
    id: 'prince-of-distraction',
    name: 'Fürst der Ablenkung',
    icon: '🌀',
    theme: 'intellect',
    description: 'Er schickt dir funkelnde Irrlichter: Benachrichtigungen, Videos und ein unschuldiges „nur noch kurz“.',
    defeatLine: 'Der Fürst der Ablenkung verliert sich in seinen eigenen Irrlichtern. Dein Fokus leuchtet heller.',
    escapeLine: 'Der Fürst der Ablenkung ist einem besonders hübschen Irrlicht hinterhergejagt. Soll er nur – deine nächste Lektion wartet schon.',
  },
  {
    id: 'vocab-vampire',
    name: 'Vokabelvampir',
    icon: '🦇',
    theme: 'intellect',
    description: 'Nachts saugt er dir frisch gelernte Wörter aus dem Kopf. Nur stete Wiederholung hält ihn fern.',
    defeatLine: 'Der Vokabelvampir zerfällt im Morgenlicht zu Staub. Jedes Wort sitzt – und bleibt.',
    escapeLine: 'Der Vokabelvampir ist vor dem ersten Hahnenschrei davongeflattert. Ach, Wiederholung ist ohnehin dein bester Zauber.',
  },

  // --- Weisheit: Achtsamkeit, Schlaf, Ruhe ---------------------------------------------------------------------
  {
    id: 'night-wolf',
    name: 'Nachtwolf der Unruhe',
    icon: '🐺',
    theme: 'wisdom',
    description: 'Wenn du schlafen willst, heult er deine Gedanken an den Mond: Termine, Sorgen, die To-dos von morgen.',
    defeatLine: 'Der Nachtwolf der Unruhe rollt sich zu deinen Füßen zusammen und schläft ein. Endlich Stille.',
    escapeLine: 'Der Nachtwolf der Unruhe ist im Morgennebel verschwunden. Atme durch – die nächste Nacht gehört dir.',
  },
  {
    id: 'hustle-harpy',
    name: 'Hektik-Harpyie',
    icon: '🌪️',
    theme: 'wisdom',
    description: 'Sie kreischt „Schneller! Mehr! Alles gleichzeitig!“ und jagt dich von einer Aufgabe zur nächsten.',
    defeatLine: 'Die Hektik-Harpyie flattert erschöpft davon. Du atmest tief ein – und hast alle Zeit der Welt.',
    escapeLine: 'Die Hektik-Harpyie ist kreischend weitergehetzt. Lass sie ziehen – Ruhe ist kein Wettrennen.',
  },
  {
    id: 'brooding-spider',
    name: 'Grübelspinne',
    icon: '🕸️',
    theme: 'wisdom',
    description: 'Aus jeder Kleinigkeit spinnt sie ein Netz aus Zweifeln und Was-wäre-wenn, bis du dich darin verhedderst.',
    defeatLine: 'Faden um Faden löst du das Netz der Grübelspinne. Dein Kopf ist klar wie ein Bergsee.',
    escapeLine: 'Die Grübelspinne hat sich in eine stille Ecke zurückgezogen. Nicht weiter drüber nachdenken – wirklich nicht.',
  },

  // --- Charisma: Freunde, Familie, Gespräche, Kreativität ------------------------------------------------------
  {
    id: 'hermit-kraken',
    name: 'Einsiedlerkrake',
    icon: '🐙',
    theme: 'charisma',
    description: 'Mit acht weichen Armen hält er dich zu Hause fest und flüstert: „Melde dich doch nächste Woche.“',
    defeatLine: 'Der Einsiedlerkrake lässt los und taucht ab. Die Tür steht offen – und draußen warten deine Leute.',
    escapeLine: 'Der Einsiedlerkrake ist zurück in seine Höhle geglitten. Kein Drama – echte Freundschaften halten auch eine stille Woche aus.',
  },
  {
    id: 'stage-fright-wyrm',
    name: 'Lampenfieber-Lindwurm',
    icon: '🐲',
    theme: 'charisma',
    description: 'Er bewacht die Bühne, die Leinwand und jedes ungesagte Wort. Sein Feueratem: „Was, wenn es keinem gefällt?“',
    defeatLine: 'Der Lampenfieber-Lindwurm schrumpft zu einer harmlosen Eidechse. Die Bühne gehört dir!',
    escapeLine: 'Der Lampenfieber-Lindwurm hat sich hinter den Vorhang verzogen. Die nächste Vorstellung kommt bestimmt.',
  },
  {
    id: 'silence-ghost',
    name: 'Gespenst der Funkstille',
    icon: '👻',
    theme: 'charisma',
    description: 'Es lässt Nachrichten unbeantwortet verblassen und raunt: „Jetzt ist es eh zu spät, sich zu melden.“',
    defeatLine: 'Ein einziges „Hey, wie geht’s dir?“ – und das Gespenst der Funkstille löst sich in Luft auf.',
    escapeLine: 'Das Gespenst der Funkstille ist durch die Wand entschwebt. Ach was – für ein „Hallo“ ist es nie zu spät.',
  },

  // --- Vitalität: Ernährung, Wasser, Selbstfürsorge ------------------------------------------------------------
  {
    id: 'sugar-dragon',
    name: 'Zuckerdrache',
    icon: '🐉',
    theme: 'vitality',
    description: 'Er hortet Schokolade, Limo und Gummibärchen und lockt dich mit süßem Duft in seine Höhle.',
    defeatLine: 'Der Zuckerdrache trollt sich mit leerem Hort. Du strotzt vor Energie – ganz ohne Zuckerrausch.',
    escapeLine: 'Der Zuckerdrache ist mit einer Tüte Gummibärchen davongeflogen. Soll er naschen – dein Körper merkt sich jede gute Mahlzeit.',
  },
  {
    id: 'swamp-troll',
    name: 'Sumpftroll',
    icon: '🧌',
    theme: 'vitality',
    description: 'Er haust zwischen Pizzakartons und Chipstüten und brummt: „Kochen? Viel zu anstrengend.“',
    defeatLine: 'Der Sumpftroll versinkt blubbernd in seinem Morast. Frisch gekocht schmeckt der Sieg am besten.',
    escapeLine: 'Der Sumpftroll ist zurück in sein Moor geschlurft. Lass ihn – dein Kochlöffel wartet schon auf die nächste Runde.',
  },
  {
    id: 'drought-wyrm',
    name: 'Dürrewurm',
    icon: '🐍',
    theme: 'vitality',
    description: 'Er schlängelt sich durch deinen Tag und trinkt heimlich dein Wasserglas leer, bis Kopf und Glieder schwer werden.',
    defeatLine: 'Der Dürrewurm vertrocknet in der Sonne – und du sprudelst frisch wie ein Gebirgsbach.',
    escapeLine: 'Der Dürrewurm hat sich in den Sand gegraben. Halb so wild – ein Glas Wasser, und du bist wieder obenauf.',
  },

  // --- Disziplin: Haushalt, Arbeit, Finanzen, Routinen ---------------------------------------------------------
  {
    id: 'shadow-lord',
    name: 'Schattenfürst der Prokrastination',
    icon: '⏳',
    theme: 'discipline',
    description: 'Sein Zepter heißt „Später“, sein Thron „Gleich“. Er herrscht über alles, was du eigentlich morgen anfangen wolltest.',
    defeatLine: 'Der Schattenfürst der Prokrastination zerfällt im Licht deiner Taten. Erledigt ist erledigt!',
    escapeLine: 'Der Schattenfürst der Prokrastination hat seine Flucht auf später verschoben – und dann doch geschafft. Typisch.',
  },
  {
    id: 'laundry-hydra',
    name: 'Wäschehydra',
    icon: '🧦',
    theme: 'discipline',
    description: 'Für jede Socke, die du faltest, wachsen ihr zwei neue Köpfe aus dem Wäschekorb.',
    defeatLine: 'Die Wäschehydra liegt gefaltet und gestapelt im Schrank. Ordnung ist auch eine Art Magie.',
    escapeLine: 'Die Wäschehydra ist zurück in den Wäschekorb abgetaucht. Keine Sorge, Socken laufen nicht weg – meistens.',
  },
  {
    id: 'form-basilisk',
    name: 'Formularbasilisk',
    icon: '📜',
    theme: 'discipline',
    description: 'Sein Blick lässt dich erstarren – besonders bei Wörtern wie „Steuererklärung“ oder „Kündigungsfrist“.',
    defeatLine: 'Der Formularbasilisk ist abgeheftet, gestempelt und erledigt. Die Bürokratie zittert vor dir.',
    escapeLine: 'Der Formularbasilisk ist zwischen zwei Aktenordnern verschwunden. Nur keine Panik – Papier ist geduldig.',
  },
]
