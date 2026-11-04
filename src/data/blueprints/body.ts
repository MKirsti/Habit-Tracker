/**
 * Vorlage "Der Weg des Körpers": Sport mit Klassenwahl.
 *
 * Der Held entscheidet sich für genau **eine** Klasse – jede ist ein eigener Trainingsweg mit eigenen Quests
 * und Kapiteln:
 * - 🗡️ **Krieger** (Kraftsport): Krafttraining als Kern, tägliche Liegestütze als messbares Ritual, Eiweiß und
 *   Dehnen als Unterstützung, die Wochenplanung als Anker für die Disziplin.
 * - 🏹 **Waldläufer** (Ausdauersport): Ausdauer-Einheiten in Minuten (Laufen, Radfahren, Schwimmen, Rudern),
 *   tägliche Schritte, Rumpfkraft gegen Verletzungen und Schlaf als Regeneration. Fortgeschrittene ergänzen
 *   eine lange Runde pro Woche.
 * - 🛡️ **Gladiator** (Sport allgemein & Spielsport): Training oder Spiel als Kern, Sport mit anderen
 *   (Charisma), Rumpfkraft als Fundament (1× bzw. 2× pro Woche), neue Sportarten ausprobieren und am Ende das
 *   erste Turnier.
 *
 * Jede Klasse trainiert ihr Haupt-Attribut am stärksten (geplante XP pro Woche, geprüft in blueprints.test.ts) –
 * es ist zugleich die Hauptfarbe der Kampagne. Deshalb sammelt der Gladiator keine täglichen Schritte (Vitalität
 * läge sonst vor Stärke), sondern stärkt den Rumpf.
 *
 * Gemeinsame Bausteine: "Dehnen & Mobilität", "Wasser trinken" und "Rechtzeitig ins Bett" kommen aus
 * `shared.ts`. "Schritte sammeln" und "Rumpf & Stabilität" sind in allen Pfaden, die sie nutzen, gleich
 * konfiguriert (gleicher Titel ⇒ dieselbe Quest).
 */
import { bedtimeQuest, stretchingQuest, waterQuest } from './shared'
import type { BlueprintChapter, BlueprintContent, BlueprintLevel, BlueprintPath, BlueprintQuest, CampaignBlueprint } from './types'

/**
 * Laufzeit: 224 Tage (32 Wochen, gut sieben Monate). Kraft und Ausdauer werden nach 6–8 Wochen spürbar,
 * sichtbar oft erst nach einigen Monaten. Das jeweils letzte Einheiten-Kapitel (z. B. 50 Trainings bei 2 pro
 * Woche, 100 bei 4 pro Woche) braucht 25 Wochen – die übrigen 7 Wochen (gut 20 %) sind Puffer für Krankheit,
 * Urlaub und Erholungswochen. Kürzer wäre zu knapp für echte Veränderung, länger ließe das Ziel verschwimmen.
 */
const DURATION_DAYS = 224

const PATHS: BlueprintPath[] = [
  {
    id: 'strength',
    icon: '🗡️',
    className: 'Krieger',
    label: 'Kraftsport',
    description: 'Hanteln, Geräte oder dein eigenes Körpergewicht: Du wirst stärker – Einheit für Einheit, Wiederholung für Wiederholung.',
    primaryAttribute: 'strength',
    secondaryAttributes: ['vitality', 'discipline'],
    levelHints: {
      beginner: '2 Krafttrainings pro Woche, jeden Tag 10 Liegestütze und 2 Portionen Eiweiß.',
      advanced: '4 Krafttrainings pro Woche, jeden Tag 30 Liegestütze und 3 Portionen Eiweiß – dazu 2,5 L Wasser.',
    },
  },
  {
    id: 'endurance',
    icon: '🏹',
    className: 'Waldläufer',
    label: 'Ausdauersport',
    description: 'Laufen, Radfahren, Schwimmen oder Rudern: Du gewinnst Atem für lange Wege und ein kräftiges Herz.',
    primaryAttribute: 'vitality',
    secondaryAttributes: ['strength', 'wisdom'],
    levelHints: {
      beginner: '3× pro Woche 20 Minuten Ausdauer, jeden Tag 6.000 Schritte und einmal pro Woche Rumpftraining.',
      advanced: '3× pro Woche 40 Minuten Ausdauer plus eine lange Runde von 75 Minuten, jeden Tag 10.000 Schritte.',
    },
  },
  {
    id: 'sports',
    icon: '🛡️',
    className: 'Gladiator',
    label: 'Sport allgemein & Spielsport',
    description: 'Fußball, Basketball, Tennis, Klettern, Kampfsport, Tanzen … Du trainierst, spielst und misst dich mit anderen.',
    primaryAttribute: 'strength',
    secondaryAttributes: ['charisma', 'vitality'],
    levelHints: {
      beginner: '2 Trainings oder Spiele pro Woche (je mindestens 30 Minuten), einmal Sport mit anderen und einmal Rumpftraining.',
      advanced: '3 Trainings oder Spiele pro Woche (je mindestens 45 Minuten), dazu Sport mit anderen und 2× Rumpftraining.',
    },
  },
]

// ---------------------------------------------------------------------------
// Quests, die mehrere Pfade nutzen (gleicher Titel ⇒ gleiche Konfiguration)
// ---------------------------------------------------------------------------

/** 👣 Schritte sammeln – Vitalität, täglich, in Schritten. */
function stepsQuest(level: BlueprintLevel): BlueprintQuest {
  return {
    key: 'steps',
    icon: '👣',
    title: 'Schritte sammeln',
    description: 'Jeder Schritt zählt: Treppe statt Aufzug, ein Spaziergang in der Mittagspause. Handy oder Uhr zählen für dich mit.',
    attribute: 'vitality',
    difficulty: level === 'advanced' ? 'medium' : 'easy',
    schedule: { type: 'daily' },
    measure: { target: level === 'advanced' ? 10000 : 6000, unit: 'Schritte' },
  }
}

/** 🧱 Rumpf & Stabilität – Stärke, pro Woche. Ergänzung für Ausdauer- und Spielsportler. */
function coreQuest(times: number): BlueprintQuest {
  return {
    key: 'core',
    icon: '🧱',
    title: 'Rumpf & Stabilität',
    description: '15 Minuten Unterarmstütz, Seitstütz, Ausfallschritte und Wadenheben – schützt Knie und Rücken und macht dich belastbarer.',
    attribute: 'strength',
    difficulty: 'medium',
    schedule: { type: 'weekly', times },
  }
}

// ---------------------------------------------------------------------------
// 🗡️ Krieger – Kraftsport
// ---------------------------------------------------------------------------

function warriorContent(level: BlueprintLevel): BlueprintContent {
  const advanced = level === 'advanced'
  const quests: BlueprintQuest[] = [
    {
      key: 'training',
      icon: '🏋️',
      title: 'Krafttraining',
      description: advanced
        ? 'Eine Einheit nach deinem Plan, z. B. Ober- und Unterkörper im Wechsel. Notiere Gewichte und Wiederholungen – so weißt du, wann du steigern kannst.'
        : '30–45 Minuten Ganzkörpertraining: Kniebeugen, Drücken, Ziehen, Heben. Lieber sauber und leichter als schwer und schief.',
      attribute: 'strength',
      difficulty: 'hard',
      schedule: { type: 'weekly', times: advanced ? 4 : 2 },
    },
    {
      key: 'pushups',
      icon: '💪',
      title: 'Liegestütze',
      description: advanced
        ? 'Über den Tag verteilt, in Sätzen deiner Wahl. Körper gerade, Brust tief – sauber zählt mehr als schnell.'
        : 'Über den Tag verteilt – gern auch an der Tischkante oder auf den Knien. Sauber zählt mehr als schnell.',
      attribute: 'strength',
      difficulty: advanced ? 'medium' : 'easy',
      schedule: { type: 'daily' },
      measure: { target: advanced ? 30 : 10, unit: 'Mal' },
    },
    {
      key: 'protein',
      icon: '🥚',
      title: 'Eiweißreich essen',
      description:
        'Eine Portion ist etwa so groß wie deine Handfläche: Quark, Eier, Linsen, Fisch, Fleisch oder Tofu – verteilt auf deine Mahlzeiten. Das Baumaterial für deine Muskeln.',
      attribute: 'vitality',
      difficulty: 'easy',
      schedule: { type: 'daily' },
      measure: { target: advanced ? 3 : 2, unit: 'Portionen' },
    },
    stretchingQuest(level),
    ...(advanced ? [waterQuest(level)] : []),
    {
      key: 'plan',
      icon: '🗓️',
      title: 'Trainingswoche planen',
      description: 'Trag dir deine Trainings der kommenden Woche als feste Termine in den Kalender ein. Verabredungen mit dir selbst sagt man nicht ab.',
      attribute: 'discipline',
      difficulty: 'easy',
      schedule: { type: 'weekly', times: 1 },
    },
  ]

  const chapters: BlueprintChapter[] = advanced
    ? [
        {
          title: 'Die Feuertaufe',
          description: 'Schließe deine ersten 8 Krafttrainings ab – zwei Wochen nach Plan, und der Rhythmus sitzt.',
          criterion: { type: 'habit', questKey: 'training', metric: 'completions', target: 8 },
        },
        {
          title: 'Eiserne Gewohnheit',
          description: 'Erfülle 12 Wochen in Folge dein Trainingsziel der Woche – ein ganzes Quartal aus Eisen.',
          criterion: { type: 'habit', questKey: 'training', metric: 'streak', target: 12 },
        },
        {
          title: 'Der Rekordjäger',
          description: 'Stelle 12 neue Bestleistungen auf: mehr Gewicht, mehr Wiederholungen oder eine Übung, die du vorher nicht geschafft hast.',
          criterion: { type: 'counter', target: 12, label: 'Neue Bestleistungen' },
        },
        {
          title: 'Fünfzig am Stück',
          description: 'Schaffe 50 saubere Liegestütze ohne Absetzen – Körper gerade wie ein Speer, Brust bis knapp über den Boden.',
          criterion: { type: 'manual' },
        },
        {
          title: 'Fünftausend Liegestütze',
          description: 'Sammle insgesamt 5.000 Liegestütze. Jede zählt – auch die, die über dein Tagesziel hinausgehen.',
          criterion: { type: 'habit', questKey: 'pushups', metric: 'total', target: 5000 },
        },
        {
          title: 'Hundert Schlachten',
          description: 'Schließe 100 Krafttrainings ab. Hundertmal angetreten, hundertmal gewachsen – du bist ein Krieger.',
          criterion: { type: 'habit', questKey: 'training', metric: 'completions', target: 100 },
        },
      ]
    : [
        {
          title: 'Die Feuertaufe',
          description: 'Schließe deine ersten 4 Krafttrainings ab. Der Anfang ist gemacht – dein Körper weiß jetzt, was auf ihn zukommt.',
          criterion: { type: 'habit', questKey: 'training', metric: 'completions', target: 4 },
        },
        {
          title: 'Der Rekordjäger',
          description: 'Stelle 10 neue Bestleistungen auf: mehr Gewicht, mehr Wiederholungen oder eine Übung, die du vorher nicht geschafft hast.',
          criterion: { type: 'counter', target: 10, label: 'Neue Bestleistungen' },
        },
        {
          title: 'Eiserne Gewohnheit',
          description: 'Erfülle 8 Wochen in Folge dein Trainingsziel der Woche. Ab jetzt ist Training kein Vorsatz mehr, sondern ein Teil von dir.',
          criterion: { type: 'habit', questKey: 'training', metric: 'streak', target: 8 },
        },
        {
          title: 'Zwanzig am Stück',
          description: 'Schaffe 20 saubere Liegestütze ohne Absetzen – Körper gerade wie ein Speer, Brust bis knapp über den Boden.',
          criterion: { type: 'manual' },
        },
        {
          title: 'Tausend Liegestütze',
          description: 'Sammle insgesamt 1.000 Liegestütze. Jede zählt – auch die, die über dein Tagesziel hinausgehen.',
          criterion: { type: 'habit', questKey: 'pushups', metric: 'total', target: 1000 },
        },
        {
          title: 'Fünfzig Schlachten',
          description: 'Schließe 50 Krafttrainings ab. Aus dem Anfänger ist ein Krieger geworden – und das spürst du bei jedem Schritt.',
          criterion: { type: 'habit', questKey: 'training', metric: 'completions', target: 50 },
        },
      ]

  return {
    title: 'Der Pfad des Kriegers',
    icon: '🗡️',
    description:
      'Kraftsport auf dem Weg des Kriegers: feste Trainingstage, tägliche Liegestütze als Ritual und Eiweiß als Baumaterial. Meilenstein für Meilenstein wirst du spürbar stärker.',
    why: 'Ich will mich stark fühlen – beim Tragen, beim Treppensteigen, beim Blick in den Spiegel. Jede Wiederholung ist ein Hammerschlag, der mich formt.',
    reward: 'Ein neues Trainingsoutfit – die Rüstung eines Kriegers',
    quests,
    chapters,
  }
}

// ---------------------------------------------------------------------------
// 🏹 Waldläufer – Ausdauersport
// ---------------------------------------------------------------------------

function rangerContent(level: BlueprintLevel): BlueprintContent {
  const advanced = level === 'advanced'
  const quests: BlueprintQuest[] = [
    {
      key: 'cardio',
      icon: '🏃',
      title: 'Ausdauer-Einheit',
      description: advanced
        ? '40 Minuten Laufen, Radfahren, Schwimmen oder Rudern. Meist so locker, dass du dich unterhalten könntest – einmal pro Woche darf es zügiger sein.'
        : '20 Minuten Laufen, Radfahren, Schwimmen oder Rudern. Gehpausen sind erlaubt – trag ein, wie lange du unterwegs warst.',
      attribute: 'vitality',
      difficulty: 'hard',
      schedule: { type: 'weekly', times: 3 },
      measure: { target: advanced ? 40 : 20, unit: 'Minuten' },
    },
    ...(advanced
      ? [
          {
            key: 'longRun',
            icon: '🌲',
            title: 'Die lange Runde',
            description: 'Einmal pro Woche lang und locker: 75 Minuten oder mehr in gemächlichem Tempo. Hier wächst deine Ausdauer am stärksten.',
            attribute: 'vitality',
            difficulty: 'epic',
            schedule: { type: 'weekly', times: 1 },
            measure: { target: 75, unit: 'Minuten' },
          } satisfies BlueprintQuest,
        ]
      : []),
    stepsQuest(level),
    stretchingQuest(level),
    coreQuest(advanced ? 2 : 1),
    bedtimeQuest(level),
  ]

  const chapters: BlueprintChapter[] = advanced
    ? [
        {
          title: 'Die Fährte aufgenommen',
          description: 'Schließe deine ersten 6 Ausdauer-Einheiten ab. Die Fährte ist aufgenommen – jetzt folgst du ihr.',
          criterion: { type: 'habit', questKey: 'cardio', metric: 'completions', target: 6 },
        },
        {
          title: 'Zehn Kilometer am Stück',
          description: 'Lauf 10 km ohne Gehpause – oder schwimm 2 km bzw. fahr 50 km mit dem Rad am Stück.',
          criterion: { type: 'manual' },
        },
        {
          title: 'Zwölf Wochen auf der Fährte',
          description: 'Erfülle 12 Wochen in Folge dein Wochenziel an Ausdauer-Einheiten. Dein Herz schlägt jetzt im Takt des Waldläufers.',
          criterion: { type: 'habit', questKey: 'cardio', metric: 'streak', target: 12 },
        },
        {
          title: 'Der lange Atem',
          description: 'Absolviere 15 lange Runden. Auf den langen Wegen wächst deine Ausdauer am stärksten.',
          criterion: { type: 'habit', questKey: 'longRun', metric: 'completions', target: 15 },
        },
        {
          title: 'Dreitausend Minuten unterwegs',
          description: 'Sammle in deinen Ausdauer-Einheiten insgesamt 3.000 Minuten – 50 Stunden, in denen du weiter gekommen bist als je zuvor.',
          criterion: { type: 'habit', questKey: 'cardio', metric: 'total', target: 3000 },
        },
        {
          title: 'Die große Feuerprobe',
          description: 'Komm bei 2 Wettkämpfen mit Startnummer ins Ziel – Volkslauf, Radmarathon, Triathlon oder Freiwasserschwimmen.',
          criterion: { type: 'counter', target: 2, label: 'Teilnahmen mit Startnummer' },
        },
      ]
    : [
        {
          title: 'Die Fährte aufgenommen',
          description: 'Schließe deine ersten 5 Ausdauer-Einheiten ab. Die Fährte ist aufgenommen – jetzt folgst du ihr.',
          criterion: { type: 'habit', questKey: 'cardio', metric: 'completions', target: 5 },
        },
        {
          title: 'Eine halbe Stunde Atem',
          description: 'Bleib 30 Minuten am Stück in Bewegung – laufen, radeln oder schwimmen, ganz ohne Pause.',
          criterion: { type: 'manual' },
        },
        {
          title: 'Acht Wochen auf der Fährte',
          description: 'Erfülle 8 Wochen in Folge dein Wochenziel an Ausdauer-Einheiten. Dein Herz hat sich an den Rhythmus gewöhnt.',
          criterion: { type: 'habit', questKey: 'cardio', metric: 'streak', target: 8 },
        },
        {
          title: 'Tausend Minuten unterwegs',
          description: 'Sammle in deinen Ausdauer-Einheiten insgesamt 1.000 Minuten – über 16 Stunden, in denen dein Herz stärker geworden ist.',
          criterion: { type: 'habit', questKey: 'cardio', metric: 'total', target: 1000 },
        },
        {
          title: 'Fünf Kilometer am Stück',
          description: 'Lauf 5 km ohne Gehpause – oder schwimm 1 km bzw. fahr 20 km mit dem Rad am Stück.',
          criterion: { type: 'manual' },
        },
        {
          title: 'Die Feuerprobe',
          description: 'Melde dich für einen Volkslauf, eine Radtourenfahrt oder ein Schwimmfest an – und komm mit Startnummer ins Ziel.',
          criterion: { type: 'manual' },
        },
      ]

  return {
    title: 'Der Pfad des Waldläufers',
    icon: '🏹',
    description:
      'Ausdauersport auf dem Weg des Waldläufers: regelmäßige Einheiten, viele Schritte und gute Erholung. Aus den ersten Runden werden lange Wege – und am Ende trägst du eine Startnummer.',
    why: 'Ich will Atem für lange Wege: Treppen ohne Keuchen, Ausflüge ohne Grenzen, ein Herz, das kräftig schlägt. Draußen unterwegs sein und weiter kommen als gedacht.',
    reward: 'Eine Sportuhr oder ein Wochenende mit einer großen Tour durch die Natur',
    quests,
    chapters,
  }
}

// ---------------------------------------------------------------------------
// 🛡️ Gladiator – Sport allgemein & Spielsport
// ---------------------------------------------------------------------------

function gladiatorContent(level: BlueprintLevel): BlueprintContent {
  const advanced = level === 'advanced'
  const quests: BlueprintQuest[] = [
    {
      key: 'session',
      icon: '🏟️',
      title: 'Training oder Spiel',
      description: advanced
        ? 'Mindestens 45 Minuten Training oder ein Spiel in deinem Sport – mit vollem Einsatz und mit Aufwärmen davor, damit du lange dabei bleibst.'
        : 'Eine echte Einheit deines Sports, mindestens 30 Minuten: Vereinstraining, Spiel, Kletterhalle, Kampfsport oder Tanzkurs.',
      attribute: 'strength',
      difficulty: 'hard',
      schedule: { type: 'weekly', times: advanced ? 3 : 2 },
    },
    {
      key: 'together',
      icon: '🤝',
      title: 'Gemeinsam Sport machen',
      description: 'Sport mit anderen: im Team, mit Freunden, im Kurs – oder lade jemanden zum Mitmachen ein. Gemeinsam fällt das Dranbleiben leichter.',
      attribute: 'charisma',
      difficulty: 'medium',
      schedule: { type: 'weekly', times: 1 },
    },
    coreQuest(advanced ? 2 : 1),
    stretchingQuest(level),
    ...(advanced ? [waterQuest(level)] : []),
  ]

  const chapters: BlueprintChapter[] = advanced
    ? [
        {
          title: 'Der erste Gang in die Arena',
          description: 'Schließe deine ersten 6 Einheiten ab – Training oder Spiel, Hauptsache, du stehst auf dem Platz.',
          criterion: { type: 'habit', questKey: 'session', metric: 'completions', target: 6 },
        },
        {
          title: 'Neue Waffen erproben',
          description: 'Probiere 3 Sportarten aus, die du noch nie gemacht hast – ein Probetraining, ein Schnupperkurs, ein geliehener Schläger.',
          criterion: { type: 'counter', target: 3, label: 'Neue Sportarten ausprobiert' },
        },
        {
          title: 'Zwölf Wochen in der Arena',
          description: 'Erfülle 12 Wochen in Folge dein Wochenziel an Trainings und Spielen – ein ganzes Quartal ohne Ausrede.',
          criterion: { type: 'habit', questKey: 'session', metric: 'streak', target: 12 },
        },
        {
          title: 'Seite an Seite',
          description: 'Mach 20-mal gemeinsam mit anderen Sport. Wer zusammen schwitzt, hält zusammen.',
          criterion: { type: 'habit', questKey: 'together', metric: 'completions', target: 20 },
        },
        {
          title: 'Ruhm in der Arena',
          description: 'Tritt bei 3 Turnieren oder Wettkämpfen an – vom Hobbyturnier bis zur Stadtmeisterschaft.',
          criterion: { type: 'counter', target: 3, label: 'Turniere oder Wettkämpfe' },
        },
        {
          title: 'Fünfundsiebzig Kämpfe',
          description: 'Schließe 75 Einheiten ab. Die Menge ruft deinen Namen – du bist ein Gladiator.',
          criterion: { type: 'habit', questKey: 'session', metric: 'completions', target: 75 },
        },
      ]
    : [
        {
          title: 'Der erste Gang in die Arena',
          description: 'Schließe deine ersten 4 Einheiten ab – Training oder Spiel, Hauptsache, du stehst auf dem Platz.',
          criterion: { type: 'habit', questKey: 'session', metric: 'completions', target: 4 },
        },
        {
          title: 'Neue Waffen erproben',
          description: 'Probiere 3 Sportarten aus, die du noch nie gemacht hast – ein Probetraining, ein Schnupperkurs, ein geliehener Schläger.',
          criterion: { type: 'counter', target: 3, label: 'Neue Sportarten ausprobiert' },
        },
        {
          title: 'Acht Wochen in der Arena',
          description: 'Erfülle 8 Wochen in Folge dein Wochenziel an Trainings und Spielen. Jetzt gehört der Sport fest zu deiner Woche.',
          criterion: { type: 'habit', questKey: 'session', metric: 'streak', target: 8 },
        },
        {
          title: 'Seite an Seite',
          description: 'Mach 15-mal gemeinsam mit anderen Sport. Wer zusammen schwitzt, hält zusammen.',
          criterion: { type: 'habit', questKey: 'together', metric: 'completions', target: 15 },
        },
        {
          title: 'Das erste Turnier',
          description: 'Tritt bei einem Turnier, Wettkampf oder offiziellen Spiel an – egal, wie es ausgeht. Antreten ist der erste Sieg.',
          criterion: { type: 'manual' },
        },
        {
          title: 'Fünfzig Kämpfe',
          description: 'Schließe 50 Einheiten ab. Die Menge kennt jetzt deinen Namen, Gladiator.',
          criterion: { type: 'habit', questKey: 'session', metric: 'completions', target: 50 },
        },
      ]

  return {
    title: 'Der Pfad des Gladiators',
    icon: '🛡️',
    description:
      'Sport allgemein und Spielsport auf dem Weg des Gladiators: Training und Spiel, Sport mit anderen und neue Disziplinen. Am Ende trittst du im Turnier an – mit Mut statt Lampenfieber.',
    why: 'Ich will Sport, der Spaß macht: spielen, kämpfen, lachen – mit anderen. In der Arena zählt nicht nur der Sieg, sondern dass ich immer wieder antrete.',
    reward: 'Neue Ausrüstung für meinen Sport – Schuhe, Schläger oder Handschuhe',
    quests,
    chapters,
  }
}

// ---------------------------------------------------------------------------
// Vorlage
// ---------------------------------------------------------------------------

export const bodyBlueprint: CampaignBlueprint = {
  id: 'body',
  icon: '⚔️',
  title: 'Der Weg des Körpers',
  tagline: 'Wähle deine Klasse: Kraftsport, Ausdauersport oder Sport allgemein & Spielsport.',
  description:
    'Sieben Monate, die deinen Körper verwandeln. Wähle deine Klasse – Krieger, Waldläufer oder Gladiator – und trainiere nach ihrem Weg: mit festen Einheiten, kleinen Tagesritualen und Meilensteinen, die du wirklich spürst.',
  primaryAttribute: 'strength',
  secondaryAttributes: ['vitality', 'discipline'],
  durationDays: DURATION_DAYS,
  // Allgemeiner Hinweis vor der Klassenwahl – danach zeigt die Einrichtung den der gewählten Klasse (PATHS).
  levelHints: {
    beginner: '2 Einheiten pro Woche (Ausdauer: 3× 20 Minuten) und kleine Tagesrituale wie 10 Liegestütze oder 6.000 Schritte.',
    advanced:
      '3–4 Einheiten pro Woche (Ausdauer: 3× 40 Minuten plus eine lange Runde) und höhere Tagesziele wie 30 Liegestütze oder 10.000 Schritte.',
  },
  paths: PATHS,
  build({ level, pathId }) {
    if (pathId === undefined || pathId.trim() === '') throw new Error('Bitte wähle einen Pfad.')
    switch (pathId) {
      case 'strength':
        return warriorContent(level)
      case 'endurance':
        return rangerContent(level)
      case 'sports':
        return gladiatorContent(level)
      default:
        throw new Error('Unbekannter Pfad.')
    }
  },
}
