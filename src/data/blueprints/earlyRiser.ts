/**
 * Vorlage "Der Frühaufsteher": die Morgenstunden zurückgewinnen.
 *
 * Kern ist eine feste Weckzeit – alles andere stützt sie:
 * - ⏰ **Früh aufstehen** (Disziplin, Kern): Einsteiger Montag bis Freitag vor 7:00 Uhr, das Wochenende ist frei;
 *   Fortgeschrittene jeden Tag vor 6:00 Uhr, denn eine gleichbleibende Weckzeit stellt die innere Uhr am besten.
 * - 🌙 **Rechtzeitig ins Bett** (aus `shared.ts`, Weisheit): Wer früh aufsteht, muss früh schlafen – die
 *   Schlafenszeit der Stufe lässt jeweils 7,5 Stunden bis zum Wecker.
 * - 🌱 **Morgenroutine** (Vitalität): ein kurzes Startritual, bevor das Handy dran ist. Bei Einsteigern gehört der
 *   kurze Blick auf das Wichtigste des Tages mit dazu.
 * - Fortgeschrittene ergänzen 📝 **Tagesplan schreiben** (Disziplin) und ☀️ **Morgenlicht-Spaziergang**
 *   (Vitalität, aus `shared.ts` – geteilt mit "Der stille Mönch").
 *
 * Einsteiger haben bewusst nur drei Quests: An Werktagen sind das schon drei Pflicht-Quests – mehr wäre für den
 * Anfang zu viel (Ziel der Bibliothek: höchstens drei Pflicht-Quests pro Tag auf der Einsteiger-Stufe).
 *
 * Kapitel: ein schneller erster Erfolg, Serien für Routine, Schlafenszeit (Einsteiger) und Weckzeit, Tagespläne
 * (Fortgeschritten), ein Sonnenaufgang draußen und am Ende 100 bzw. 120 frühe Morgen.
 */
import { bedtimeQuest, morningLightQuest } from './shared'
import type { BlueprintChapter, BlueprintLevel, BlueprintQuest, CampaignBlueprint } from './types'

/**
 * Laufzeit: 180 Tage (gut ein halbes Jahr). Eine neue Weckzeit fühlt sich erst nach einigen Wochen normal an, und
 * bis eine Gewohnheit von selbst läuft, vergehen im Schnitt gut zwei Monate. Das letzte Kapitel braucht bei
 * Einsteigern 100 von 128 Werktagen (Mo–Fr), bei Fortgeschrittenen 120 von 180 Tagen – Puffer für Krankheit,
 * Urlaub und Nächte, die einfach zu kurz waren.
 */
const DURATION_DAYS = 180

/**
 * ⏰ Früh aufstehen. Beide Stufen nutzen den Rhythmus-Typ "Wochentage" (Fortgeschritten: alle sieben Tage, wird als
 * "Täglich" angezeigt), damit die Quest in beiden Stufen gleich konfiguriert ist: Läuft sie aus einer früheren
 * Einsteiger-Kampagne weiter, zählen die Streak-Kapitel der Fortgeschrittenen-Stufe weiterhin in Tagen.
 */
function wakeUpQuest(level: BlueprintLevel): BlueprintQuest {
  const advanced = level === 'advanced'
  return {
    key: 'wakeUp',
    icon: '⏰',
    title: 'Früh aufstehen',
    description: advanced
      ? 'Jeden Tag vor 6:00 Uhr – auch am Wochenende. Eine feste Weckzeit stellt deine innere Uhr, und die stillen Morgenstunden gehören ganz dir.'
      : 'Montag bis Freitag vor 7:00 Uhr raus aus den Federn. Stell den Wecker außer Reichweite – wer zum Ausschalten aufstehen muss, bleibt auch auf.',
    attribute: 'discipline',
    difficulty: 'hard',
    schedule: { type: 'weekdays', days: advanced ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5] },
  }
}

function quests(level: BlueprintLevel): BlueprintQuest[] {
  const advanced = level === 'advanced'
  return [
    wakeUpQuest(level),
    {
      key: 'routine',
      icon: '🌱',
      title: 'Morgenroutine',
      description: advanced
        ? 'Dein Startritual, gut 20 Minuten: Wasser trinken, bewegen, frische Luft – erst danach kommt das Handy. Wer den Morgen führt, führt auch den Tag.'
        : 'Die ersten 10 Minuten gehören dir: ein Glas Wasser, Fenster auf, kräftig recken und strecken und kurz überlegen, was heute wirklich zählt. Erst danach kommt das Handy.',
      attribute: 'vitality',
      difficulty: 'medium',
      schedule: { type: 'daily' },
    },
    // Einsteiger: nur Weckzeit, Routine und Schlafenszeit – an Werktagen sind das schon drei Pflicht-Quests.
    ...(advanced
      ? [
          morningLightQuest(3),
          {
            key: 'dayPlan',
            icon: '📝',
            title: 'Tagesplan schreiben',
            description:
              'Schreib morgens die drei wichtigsten Aufgaben des Tages auf – auf Papier oder in deinen Kalender. Was aufgeschrieben ist, wird eher erledigt.',
            attribute: 'discipline',
            difficulty: 'easy',
            schedule: { type: 'daily' },
          } satisfies BlueprintQuest,
        ]
      : []),
    bedtimeQuest(level),
  ]
}

function chapters(level: BlueprintLevel): BlueprintChapter[] {
  if (level === 'advanced') {
    return [
      {
        title: 'Der erste Hahnenschrei',
        description: 'Steh an 7 Tagen vor 6:00 Uhr auf. Eine Woche im Takt der Frühaufsteher – der Anfang ist gemacht.',
        criterion: { type: 'habit', questKey: 'wakeUp', metric: 'completions', target: 7 },
      },
      {
        title: 'Das Morgenritual',
        description: 'Halte deine Morgenroutine 30 Tage in Folge. Ein Monat, und dein Startritual ist so selbstverständlich wie Zähneputzen.',
        criterion: { type: 'habit', questKey: 'routine', metric: 'streak', target: 30 },
      },
      {
        title: 'Der Kompass des Tages',
        description: 'Schreib 60 Tagespläne. Wer jeden Morgen weiß, was zählt, verliert sich nicht im Kleinkram.',
        criterion: { type: 'habit', questKey: 'dayPlan', metric: 'completions', target: 60 },
      },
      {
        title: 'Sonnenaufgang auf dem Gipfel',
        description:
          'Steig noch im Dunkeln auf einen Berg oder Hügel – mit Stirnlampe und auf einem Weg, den du kennst – und erlebe dort oben den Sonnenaufgang. Ein Morgen, den du nie vergisst.',
        criterion: { type: 'manual' },
      },
      {
        title: 'Sechsundsechzig Morgen',
        description: 'Steh 66 Tage in Folge vor 6:00 Uhr auf. So lange dauert es laut einer bekannten Studie im Mittel, bis eine Gewohnheit wie von selbst läuft.',
        criterion: { type: 'habit', questKey: 'wakeUp', metric: 'streak', target: 66 },
      },
      {
        title: 'Hundertzwanzig Morgen',
        description: 'Steh insgesamt 120-mal vor 6:00 Uhr auf. Morgenstund hat Gold im Mund – und du hast einen ganzen Schatz gehoben.',
        criterion: { type: 'habit', questKey: 'wakeUp', metric: 'completions', target: 120 },
      },
    ]
  }
  return [
    {
      title: 'Der erste Hahnenschrei',
      description: 'Steh an 5 Tagen vor 7:00 Uhr auf. Eine Arbeitswoche – und der Wecker hat seinen Schrecken verloren.',
      criterion: { type: 'habit', questKey: 'wakeUp', metric: 'completions', target: 5 },
    },
    {
      title: 'Das Morgenritual',
      description: 'Halte deine Morgenroutine 14 Tage in Folge. Zwei Wochen, und der Morgen läuft wie von selbst.',
      criterion: { type: 'habit', questKey: 'routine', metric: 'streak', target: 14 },
    },
    {
      title: 'Der Morgen beginnt am Abend',
      description: 'Geh 21 Abende in Folge rechtzeitig ins Bett. Wer ausgeschlafen ist, steht leichter auf – den Morgen gewinnst du schon am Abend davor.',
      criterion: { type: 'habit', questKey: 'bedtime', metric: 'streak', target: 21 },
    },
    {
      title: 'Einundzwanzig Morgen',
      description: 'Steh an 21 Werktagen in Folge vor 7:00 Uhr auf – das Wochenende unterbricht die Serie nicht. Nach gut vier Wochen gehört der Morgen dir.',
      criterion: { type: 'habit', questKey: 'wakeUp', metric: 'streak', target: 21 },
    },
    {
      title: 'Den Sonnenaufgang erlebt',
      description: 'Sei einmal draußen, wenn die Sonne aufgeht – auf einem Hügel, am Wasser oder einfach auf dem Balkon. Der Lohn des Frühaufstehers.',
      criterion: { type: 'manual' },
    },
    {
      title: 'Hundert Morgen',
      description: 'Steh insgesamt 100-mal vor 7:00 Uhr auf. Morgenstund hat Gold im Mund – aus dem Langschläfer ist ein Frühaufsteher geworden.',
      criterion: { type: 'habit', questKey: 'wakeUp', metric: 'completions', target: 100 },
    },
  ]
}

export const earlyRiserBlueprint: CampaignBlueprint = {
  id: 'earlyRiser',
  icon: '🌄',
  title: 'Der Frühaufsteher',
  tagline: 'Gewinne die Morgenstunden: früh aufstehen, klar in den Tag starten.',
  description:
    'Ein neuer Rhythmus für deine Morgen: Du stehst früh auf, startest mit einem eigenen Ritual, planst deinen Tag und gehst rechtzeitig schlafen. Am Ende gehört dir die stillste und klarste Stunde des Tages.',
  primaryAttribute: 'discipline',
  secondaryAttributes: ['vitality', 'wisdom'],
  durationDays: DURATION_DAYS,
  levelHints: {
    beginner: 'Montag bis Freitag vor 7:00 Uhr aufstehen, 10 Minuten Morgenroutine und spätestens um 23:30 Uhr ins Bett.',
    advanced:
      'Jeden Tag vor 6:00 Uhr aufstehen, 20 Minuten Morgenroutine und ein Tagesplan, um 22:30 Uhr ins Bett und 3× pro Woche ins Morgenlicht.',
  },
  build({ level }) {
    return {
      title: 'Der Frühaufsteher',
      icon: '🌄',
      description:
        'Eine feste Weckzeit, ein Morgenritual nur für dich und ein klarer Plan für den Tag – so gewinnst du die Morgenstunden zurück. Wer früh aufsteht, geht auch früh schlafen: Das gehört dazu.',
      why: 'Ich will den Tag beginnen, statt von ihm überrollt zu werden: in Ruhe aufwachen und Zeit für mich haben, bevor die Welt etwas von mir will. Die stillen Morgenstunden sollen mir gehören.',
      reward: 'Ein Lichtwecker, der mich sanft weckt – und ein Frühstück zum Sonnenaufgang in meinem Lieblingscafé',
      quests: quests(level),
      chapters: chapters(level),
    }
  },
}
