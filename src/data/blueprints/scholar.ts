/**
 * Vorlage "Der Weg des Gelehrten": ein Jahr voller Bücher.
 *
 * Kern ist die tägliche Lese-Quest. Drumherum gibt es kleine Rituale, die das Lesen leichter machen (Bildschirm
 * weg vor dem Schlafen), vertiefen (Gedanke des Tages, Tiefenlese-Session) und teilen (Bücher-Gespräch). Die
 * Kapitel führen vom ersten Funken bis zum zwölften (Fortgeschritten: vierundzwanzigsten) beendeten Buch.
 *
 * - **Einsteiger** ist exakt die frühere Vorlage-Kampagne aus dem ersten Onboarding (`createScholarCampaign` in
 *   `seed.ts`): 📖 10 Seiten am Tag, ⏳ 3× pro Woche eine halbe Stunde am Stück. Bestehende Spielstände (Upgrade in
 *   `db.ts`) und Tests verlassen sich darauf – Texte, Werte und Reihenfolge dieser Stufe nicht ändern.
 * - **Fortgeschritten**: 25 Seiten am Tag, 4× pro Woche eine Dreiviertelstunde – dieselbe Geschichte in sechs
 *   Kapiteln, mit höheren Zielen (30-Tage-Serie, 100 Gedanken, 3.000 Seiten, 24 Bücher).
 * - 🕯️ **Kerzenlicht statt Bildschirm** kommt aus `shared.ts` und wird mit "Der stille Mönch" geteilt.
 */
import { candlelightQuest } from './shared'
import type { BlueprintChapter, BlueprintContent, BlueprintLevel, BlueprintQuest, CampaignBlueprint } from './types'

/**
 * Laufzeit: ein Jahr. 12 Bücher à rund 300 Seiten sind gut 3.600 Seiten – genau das, was 10 Seiten am Tag in
 * einem Jahr ergeben (Tiefenlese-Sessions bringen den Puffer). Fortgeschrittene schaffen mit 25 Seiten am Tag über
 * 9.000 Seiten, 24 Bücher sind also ehrgeizig, aber machbar.
 */
const DURATION_DAYS = 365

function quests(level: BlueprintLevel): BlueprintQuest[] {
  const advanced = level === 'advanced'
  return [
    {
      key: 'reading',
      icon: '📖',
      title: 'Täglich lesen',
      description: advanced
        ? '25 Seiten in deinem aktuellen Buch – gern in zwei Etappen, morgens und abends.'
        : '10 Seiten in deinem aktuellen Buch.',
      attribute: 'intellect',
      difficulty: 'medium',
      schedule: { type: 'daily' },
      measure: { target: advanced ? 25 : 10, unit: 'Seiten' },
    },
    candlelightQuest(),
    {
      key: 'thought',
      icon: '✍️',
      title: 'Gedanke des Tages',
      description: advanced
        ? 'Ein Zitat oder eine Erkenntnis aus dem Gelesenen notieren – mit einem Satz dazu, was sie für dich bedeutet.'
        : 'Ein Zitat oder eine Erkenntnis aus dem Gelesenen notieren.',
      attribute: 'wisdom',
      difficulty: 'easy',
      schedule: { type: 'daily' },
    },
    {
      key: 'deepReading',
      icon: '⏳',
      title: 'Tiefenlese-Session',
      description: advanced
        ? '45 Minuten am Stück lesen, ohne Ablenkung – das Handy bleibt in einem anderen Raum.'
        : '30 Minuten am Stück lesen, ohne Ablenkung.',
      attribute: 'intellect',
      difficulty: 'hard',
      schedule: { type: 'weekly', times: advanced ? 4 : 3 },
    },
    {
      key: 'bookTalk',
      icon: '🗣️',
      title: 'Bücher-Gespräch',
      description: 'Mit jemandem über ein Buch sprechen oder eine Empfehlung teilen.',
      attribute: 'charisma',
      difficulty: 'medium',
      schedule: { type: 'weekly', times: 1 },
    },
  ]
}

function chapters(level: BlueprintLevel): BlueprintChapter[] {
  if (level === 'advanced') {
    return [
      {
        title: 'Der erste Funke',
        description: 'Lies an 7 Tagen deine 25 Seiten.',
        criterion: { type: 'habit', questKey: 'reading', metric: 'completions', target: 7 },
      },
      {
        title: 'Das erste Buch',
        description: 'Beende das erste Buch auf diesem Weg – egal wie dick.',
        criterion: { type: 'manual' },
      },
      {
        title: 'Die Gewohnheit erwacht',
        description: '30 Tage am Stück lesen. Ein ganzer Monat ohne Lücke – jetzt sitzt die Gewohnheit.',
        criterion: { type: 'habit', questKey: 'reading', metric: 'streak', target: 30 },
      },
      {
        title: 'Der Gedankensammler',
        description: 'Sammle 100 Gedanken des Tages – dein eigenes Buch der Erkenntnisse.',
        criterion: { type: 'habit', questKey: 'thought', metric: 'completions', target: 100 },
      },
      {
        title: 'Dreitausend Seiten',
        description: 'Lies insgesamt 3.000 Seiten – so viel wie zehn Romane.',
        criterion: { type: 'habit', questKey: 'reading', metric: 'total', target: 3000 },
      },
      {
        title: 'Der Gelehrte',
        description: 'Beende 24 Bücher – zwei im Monat, ein ganzes Regal voller Welten.',
        criterion: { type: 'counter', target: 24, label: 'Bücher beendet' },
      },
    ]
  }
  return [
    {
      title: 'Der erste Funke',
      description: 'Lies an 7 Tagen deine 10 Seiten.',
      criterion: { type: 'habit', questKey: 'reading', metric: 'completions', target: 7 },
    },
    {
      title: 'Das erste Buch',
      description: 'Beende dein erstes Buch – egal wie dick.',
      criterion: { type: 'manual' },
    },
    {
      title: 'Die Gewohnheit erwacht',
      description: '21 Tage am Stück lesen. Jetzt sitzt die Gewohnheit.',
      criterion: { type: 'habit', questKey: 'reading', metric: 'streak', target: 21 },
    },
    {
      title: 'Der Gedankensammler',
      description: 'Sammle 50 Gedanken des Tages.',
      criterion: { type: 'habit', questKey: 'thought', metric: 'completions', target: 50 },
    },
    {
      title: 'Tausend Seiten',
      description: 'Lies insgesamt 1.000 Seiten.',
      criterion: { type: 'habit', questKey: 'reading', metric: 'total', target: 1000 },
    },
    {
      title: 'Der Gelehrte',
      description: 'Beende 12 Bücher.',
      criterion: { type: 'counter', target: 12, label: 'Bücher beendet' },
    },
  ]
}

function content(level: BlueprintLevel): BlueprintContent {
  if (level === 'advanced') {
    return {
      title: 'Der Weg des Gelehrten',
      icon: '📚',
      description:
        'Ein Jahr voller Bücher: Mit 25 Seiten am Tag und vier Tiefenlese-Sessions pro Woche wird aus deiner Lesegewohnheit ein Regal voller Welten – 24 Bücher in zwölf Monaten.',
      why: 'Ich will tiefer denken und mehr verstehen – die großen Bücher nicht nur besitzen, sondern gelesen haben und ihre Geschichten in mir tragen.',
      reward: 'Ein eigener Leseplatz: ein bequemer Sessel, gutes Licht und Platz im Regal für meine 24 Bücher',
      quests: quests(level),
      chapters: chapters(level),
    }
  }
  // Einsteiger: unverändert die frühere Vorlage-Kampagne.
  return {
    title: 'Der Weg des Gelehrten',
    icon: '📚',
    description: 'Ein Jahr voller Bücher: Aus kleinen täglichen Leseeinheiten wird ein belesener Geist.',
    why: 'Ich will mehr wissen, klarer denken und Geschichten in mir tragen.',
    reward: 'Eine wunderschöne Ausgabe meines Lieblingsbuchs',
    quests: quests(level),
    chapters: chapters(level),
  }
}

export const scholarBlueprint: CampaignBlueprint = {
  id: 'scholar',
  icon: '📚',
  title: 'Der Weg des Gelehrten',
  tagline: 'Ein Jahr voller Bücher: täglich lesen, Gedanken sammeln, tief eintauchen.',
  description:
    'Ein Jahr auf dem Weg des Gelehrten: Du liest jeden Tag ein paar Seiten, sammelst Gedanken und tauchst regelmäßig tief in ein Buch ein. Aus kleinen Leseeinheiten wird ein Regal voller gelesener Bücher.',
  primaryAttribute: 'intellect',
  secondaryAttributes: ['wisdom', 'charisma'],
  durationDays: DURATION_DAYS,
  levelHints: {
    beginner: '10 Seiten am Tag, 3× pro Woche eine halbe Stunde Tiefenlesen und einmal pro Woche ein Bücher-Gespräch.',
    advanced: '25 Seiten am Tag, 4× pro Woche eine Dreiviertelstunde Tiefenlesen – und 24 Bücher als großes Ziel.',
  },
  build({ level }) {
    return content(level)
  },
}
