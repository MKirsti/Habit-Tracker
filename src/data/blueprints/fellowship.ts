/**
 * Vorlage "Die Gefährten": Freundschaft & Familie.
 *
 * Freundschaften schlafen selten im Streit ein, sondern im Schweigen. Die Gefährten halten sie mit kleinen,
 * regelmäßigen Gesten wach:
 * - 💌 **Jemandem schreiben oder anrufen** (Charisma, Kern): jeden Tag eine echte Nachricht oder ein kurzer Anruf.
 * - 👂 **Ganz zuhören** (Weisheit): im wichtigsten Gespräch des Tages bleibt das Handy weg – Achtsamkeit im
 *   Miteinander.
 * - 💐 **Ein ehrliches Kompliment** (Charisma): 3× bzw. 5× pro Woche. Bewusst als Wochenquest, damit Tage ohne
 *   Begegnung (Homeoffice, Krankheit) nichts kaputt machen.
 * - 🫂 **Zeit mit Freunden oder Familie** (Charisma): 1× bzw. 2× pro Woche bewusst zusammen sein.
 * - Fortgeschrittene ergänzen 🎁 **Etwas für andere tun** (Charisma, schwer): jede Woche eine echte Hilfe.
 *
 * Kapitel: ein schneller erster Erfolg, eine Serie im Zuhören, wiederbelebte alte Kontakte (Zähler), ein selbst
 * organisiertes Treffen, eine Serie gemeinsamer Wochen, Komplimente bzw. gute Taten und am Ende der Bund der
 * Gefährten.
 */
import type { BlueprintChapter, BlueprintLevel, BlueprintQuest, CampaignBlueprint } from './types'

/**
 * Laufzeit: 180 Tage (gut ein halbes Jahr). Nähe entsteht durch Wiederholung über Monate, nicht durch ein einzelnes
 * großes Treffen. Das letzte Kapitel (an 100 bzw. 140 Tagen gemeldet) lässt Puffer für Tage, an denen einfach
 * niemand dran war.
 */
const DURATION_DAYS = 180

function quests(level: BlueprintLevel): BlueprintQuest[] {
  const advanced = level === 'advanced'
  return [
    {
      key: 'reachOut',
      icon: '💌',
      title: 'Jemandem schreiben oder anrufen',
      description: advanced
        ? 'Melde dich bei jemandem, der dir wichtig ist – am liebsten mit einem Anruf statt einer Nachricht. Wer lange nichts von dir gehört hat, ist zuerst dran.'
        : 'Eine echte Nachricht an Freunde oder Familie: ein paar persönliche Zeilen, eine Sprachnachricht oder ein kurzer Anruf. Frag nach, wie es wirklich geht.',
      attribute: 'charisma',
      difficulty: 'easy',
      schedule: { type: 'daily' },
    },
    {
      key: 'listen',
      icon: '👂',
      title: 'Ganz zuhören',
      description:
        'Im wichtigsten Gespräch des Tages liegt das Handy außer Sicht – auch am Telefon kein Scrollen nebenbei. Hör zu, um zu verstehen, nicht um zu antworten.',
      attribute: 'wisdom',
      difficulty: 'medium',
      schedule: { type: 'daily' },
    },
    {
      key: 'compliment',
      icon: '💐',
      title: 'Ein ehrliches Kompliment',
      description:
        'Sag jemandem konkret, was du schätzt: „Wie du das vorhin gelöst hast, war richtig stark.“ Kostet dich eine Minute – und wärmt oft einen ganzen Tag.',
      attribute: 'charisma',
      difficulty: 'easy',
      schedule: { type: 'weekly', times: advanced ? 5 : 3 },
    },
    {
      key: 'together',
      icon: '🫂',
      title: 'Zeit mit Freunden oder Familie',
      description:
        'Bewusst Zeit miteinander: ein Kaffee, ein Spaziergang, ein Spieleabend oder ein gemeinsames Essen. Persönlich ist am schönsten – zur Not zählt auch ein langer Videoanruf.',
      attribute: 'charisma',
      difficulty: 'medium',
      schedule: { type: 'weekly', times: advanced ? 2 : 1 },
    },
    ...(advanced
      ? [
          {
            key: 'kindDeed',
            icon: '🎁',
            title: 'Etwas für andere tun',
            description:
              'Eine echte Hilfe, ohne dass man dich bitten muss: für jemanden kochen, beim Umzug anpacken, Kinder hüten, einen Weg abnehmen. So werden aus Freunden Gefährten.',
            attribute: 'charisma',
            difficulty: 'hard',
            schedule: { type: 'weekly', times: 1 },
          } satisfies BlueprintQuest,
        ]
      : []),
  ]
}

function chapters(level: BlueprintLevel): BlueprintChapter[] {
  if (level === 'advanced') {
    return [
      {
        title: 'Das Signalfeuer',
        description: 'Melde dich an 14 Tagen bei jemandem. Vierzehn Signalfeuer brennen – und von überall kommen Antworten zurück.',
        criterion: { type: 'habit', questKey: 'reachOut', metric: 'completions', target: 14 },
      },
      {
        title: 'Das offene Ohr',
        description: 'Hör 30 Tage in Folge ganz zu, ohne Handy in der Hand. Ein Monat voller Gespräche, in denen dein Gegenüber wirklich gehört wurde.',
        criterion: { type: 'habit', questKey: 'listen', metric: 'streak', target: 30 },
      },
      {
        title: 'Verlorene Gefährten',
        description: 'Belebe 5 alte Kontakte wieder: Melde dich bei Menschen, von denen du lange nichts gehört hast, und triff dich mit mindestens einem davon.',
        criterion: { type: 'counter', target: 5, label: 'Alte Kontakte wiederbelebt' },
      },
      {
        title: 'Die Tafelrunde',
        description: 'Lade zu einem großen Treffen ein, das du selbst planst: ein Fest, einen Ausflug, ein gemeinsames Wochenende. Du rufst – und deine Gefährten kommen.',
        criterion: { type: 'manual' },
      },
      {
        title: 'Zwölf Wochen am Lagerfeuer',
        description: 'Erfülle 12 Wochen in Folge dein Wochenziel an gemeinsamer Zeit. Ein ganzes Quartal, in dem das Feuer nie ausgegangen ist.',
        criterion: { type: 'habit', questKey: 'together', metric: 'streak', target: 12 },
      },
      {
        title: 'Der gute Geist',
        description: 'Tu 15-mal etwas für andere, ohne gefragt zu werden. Du bist der Mensch geworden, auf den man sich verlassen kann.',
        criterion: { type: 'habit', questKey: 'kindDeed', metric: 'completions', target: 15 },
      },
      {
        title: 'Der Bund der Gefährten',
        description: 'Melde dich an 140 Tagen bei Menschen, die dir wichtig sind. Aus vielen kleinen Botschaften ist ein Bund geworden, der hält.',
        criterion: { type: 'habit', questKey: 'reachOut', metric: 'completions', target: 140 },
      },
    ]
  }
  return [
    {
      title: 'Das Signalfeuer',
      description: 'Melde dich an 7 Tagen bei jemandem. Sieben Signalfeuer sind entzündet – und die ersten Antworten kommen zurück.',
      criterion: { type: 'habit', questKey: 'reachOut', metric: 'completions', target: 7 },
    },
    {
      title: 'Das offene Ohr',
      description: 'Hör 14 Tage in Folge ganz zu, ohne Handy in der Hand. Die Menschen um dich merken es – und erzählen dir mehr als zuvor.',
      criterion: { type: 'habit', questKey: 'listen', metric: 'streak', target: 14 },
    },
    {
      title: 'Verlorene Gefährten',
      description: 'Belebe 3 alte Kontakte wieder: Melde dich bei jemandem, von dem du lange nichts gehört hast, und bring ein echtes Gespräch in Gang.',
      criterion: { type: 'counter', target: 3, label: 'Alte Kontakte wiederbelebt' },
    },
    {
      title: 'Die Tafelrunde',
      description: 'Organisiere selbst ein Treffen: Spieleabend, Grillen oder Wanderung. Du lädst ein, wählst Ort und Zeit – und die Gefährten kommen.',
      criterion: { type: 'manual' },
    },
    {
      title: 'Acht Wochen am Lagerfeuer',
      description: 'Nimm dir 8 Wochen in Folge Zeit für Freunde oder Familie. Woche für Woche brennt das Feuer, an dem ihr zusammensitzt.',
      criterion: { type: 'habit', questKey: 'together', metric: 'streak', target: 8 },
    },
    {
      title: 'Worte wie Gold',
      description: 'Mach 30 ehrliche Komplimente. Jedes davon hat jemandem den Tag ein Stück heller gemacht – und dir auch.',
      criterion: { type: 'habit', questKey: 'compliment', metric: 'completions', target: 30 },
    },
    {
      title: 'Der Bund der Gefährten',
      description: 'Melde dich an 100 Tagen bei Menschen, die dir wichtig sind. Aus vielen kleinen Botschaften ist ein Bund geworden, der hält.',
      criterion: { type: 'habit', questKey: 'reachOut', metric: 'completions', target: 100 },
    },
  ]
}

export const fellowshipBlueprint: CampaignBlueprint = {
  id: 'fellowship',
  icon: '🧑‍🤝‍🧑',
  title: 'Die Gefährten',
  tagline: 'Freundschaft & Familie: in Kontakt bleiben, zuhören, füreinander da sein.',
  description:
    'Ein halbes Jahr für die Menschen, die dir wichtig sind: Du meldest dich regelmäßig, hörst wirklich zu, verschenkst ehrliche Worte und nimmst dir Zeit füreinander. Aus losen Kontakten wird ein Kreis von Gefährten.',
  primaryAttribute: 'charisma',
  secondaryAttributes: ['wisdom'],
  durationDays: DURATION_DAYS,
  levelHints: {
    beginner: 'Jeden Tag bei jemandem melden und ganz zuhören, 3 Komplimente pro Woche und einmal pro Woche Zeit mit Freunden oder Familie.',
    advanced: 'Jeden Tag melden und ganz zuhören, 5 Komplimente und 2 Treffen pro Woche – dazu jede Woche etwas für andere tun.',
  },
  build({ level }) {
    return {
      title: 'Die Gefährten',
      icon: '🧑‍🤝‍🧑',
      description:
        'Freundschaft und Familie auf dem Weg der Gefährten: tägliche Botschaften, Gespräche ohne Handy, ehrliche Komplimente und feste Zeit miteinander. Du belebst alte Kontakte wieder, rufst selbst zur Tafelrunde – und spürst, wie dein Kreis wächst.',
      why: 'Ich will für die Menschen da sein, die mir wichtig sind – nicht nur, wenn es gerade passt. Freundschaften pflegen, statt sie einschlafen zu lassen, und wieder spüren, dass ich zu einer Gemeinschaft gehöre.',
      reward: 'Ein gemeinsamer Ausflug mit meinen liebsten Menschen – ich lade ein',
      quests: quests(level),
      chapters: chapters(level),
    }
  },
}
