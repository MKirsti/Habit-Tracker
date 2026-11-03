/**
 * Vorlage "Der stille Mönch": Ruhe & Schlaf.
 *
 * Der Mönch sucht nicht mehr, sondern weniger: weniger Lärm, weniger Bildschirm, weniger Hetze am Abend.
 * - 🧘 **Meditieren** (Weisheit, Kern): messbar in Minuten – Einsteiger 5, Fortgeschrittene 15 am Tag.
 * - 🕯️ **Kerzenlicht statt Bildschirm** und 🌙 **Rechtzeitig ins Bett** (beide aus `shared.ts`, Weisheit): das
 *   Abendritual. Kerzenlicht teilt sich der Mönch mit dem Gelehrten, die Schlafenszeit mit dem Frühaufsteher.
 * - 📵 **Handyfreier Tag** (Disziplin): ein Tag pro Woche ohne Scrollen – die große Übung in Verzicht. Bewusst als
 *   Wochenquest (am liebsten sonntags, aber frei wählbar): So hat auch der Sonntag der Einsteiger höchstens drei
 *   Pflicht-Quests, und wer am Wochenende arbeitet, nimmt einen anderen Tag.
 * - ☀️ **Morgenlicht-Spaziergang** (aus `shared.ts`, Vitalität, geteilt mit "Der Frühaufsteher"): Tageslicht am
 *   Vormittag ist eines der wirksamsten Mittel für guten Schlaf am Abend.
 * - Fortgeschrittene ergänzen 📔 **Abendtagebuch** (Weisheit): den Tag in drei Sätzen ablegen.
 *
 * Kapitel: erste Meditationen, Serien für Schlafenszeit und Meditation, handyfreie Tage der Einkehr, ein Tag (bzw.
 * Vormittag) des Schweigens und am Ende die Gesamtzeit auf dem Kissen.
 */
import { bedtimeQuest, candlelightQuest, morningLightQuest } from './shared'
import type { BlueprintChapter, BlueprintLevel, BlueprintQuest, CampaignBlueprint } from './types'

/**
 * Laufzeit: 180 Tage (gut ein halbes Jahr). Meditation wirkt nach wenigen Wochen spürbar, ein neuer Schlafrhythmus
 * braucht Monate, bis er sich von selbst hält. Das letzte Kapitel (600 bzw. 1.800 Minuten) entspricht dem vollen
 * Tagesziel an zwei Dritteln aller Tage – längere Sitzungen zählen mit, verpasste Tage sind eingeplant.
 */
const DURATION_DAYS = 180

function quests(level: BlueprintLevel): BlueprintQuest[] {
  const advanced = level === 'advanced'
  return [
    {
      key: 'meditation',
      icon: '🧘',
      title: 'Meditieren',
      description: advanced
        ? 'Sitzen, atmen, beobachten – am besten jeden Tag zur selben Zeit. Trag ein, wie lange du gesessen hast: Längere Sitzungen zählen voll mit.'
        : 'Setz dich bequem und aufrecht hin, schließ die Augen und folge deinem Atem. Schweifen die Gedanken ab, kehr freundlich zurück – genau das ist die Übung.',
      attribute: 'wisdom',
      difficulty: advanced ? 'medium' : 'easy',
      schedule: { type: 'daily' },
      measure: { target: advanced ? 15 : 5, unit: 'Minuten' },
    },
    morningLightQuest(advanced ? 3 : 2),
    {
      key: 'phoneFreeDay',
      icon: '📵',
      title: 'Handyfreier Tag',
      description:
        'Ein Tag pro Woche ohne Scrollen, am liebsten der Sonntag: kein Social Media, keine Nachrichten, keine Spiele. Anrufe, Karten und Fotos sind erlaubt.',
      attribute: 'discipline',
      difficulty: 'hard',
      schedule: { type: 'weekly', times: 1 },
    },
    ...(advanced
      ? [
          {
            key: 'journal',
            icon: '📔',
            title: 'Abendtagebuch',
            description:
              'Drei Sätze vor dem Schlafen: Was war heute gut? Was hat dich bewegt? Wofür bist du dankbar? So legst du den Tag ab, bevor du dich hinlegst.',
            attribute: 'wisdom',
            difficulty: 'easy',
            schedule: { type: 'daily' },
          } satisfies BlueprintQuest,
        ]
      : []),
    candlelightQuest(),
    bedtimeQuest(level),
  ]
}

function chapters(level: BlueprintLevel): BlueprintChapter[] {
  if (level === 'advanced') {
    return [
      {
        title: 'Die erste Stille',
        description: 'Erreiche an 10 Tagen dein Meditationsziel. Zehn Inseln der Ruhe – deine ersten Schritte durch das Klostertor.',
        criterion: { type: 'habit', questKey: 'meditation', metric: 'completions', target: 10 },
      },
      {
        title: 'Der Hüter der Nacht',
        description: 'Geh 30 Nächte in Folge rechtzeitig ins Bett. Ein ganzer Monat im gleichen Takt – dein Körper weiß jetzt, wann Schlafenszeit ist.',
        criterion: { type: 'habit', questKey: 'bedtime', metric: 'streak', target: 30 },
      },
      {
        title: 'Das Buch der Nächte',
        description: 'Schreib 50 Einträge in dein Abendtagebuch. Blätterst du zurück, siehst du, wie viel Gutes in deinen Tagen steckt.',
        criterion: { type: 'habit', questKey: 'journal', metric: 'completions', target: 50 },
      },
      {
        title: 'Sechzig Tage auf dem Kissen',
        description: 'Meditiere 60 Tage in Folge. Zwei Monate ohne Unterbrechung – die Stille ist ein Teil von dir geworden.',
        criterion: { type: 'habit', questKey: 'meditation', metric: 'streak', target: 60 },
      },
      {
        title: 'Zwölf Tage der Einkehr',
        description: 'Erlebe 12 handyfreie Tage – Tage, an denen du nicht gescrollt, sondern gelebt hast.',
        criterion: { type: 'habit', questKey: 'phoneFreeDay', metric: 'completions', target: 12 },
      },
      {
        title: 'Der Rückzug ins Kloster',
        description: 'Verbringe einen ganzen Tag in Stille oder ein Wochenende im Kloster: kein Bildschirm, keine Termine, keine Gespräche – nur Gehen, Sitzen und Atmen.',
        criterion: { type: 'manual' },
      },
      {
        title: 'Dreißig Stunden Stille',
        description: 'Sammle insgesamt 1.800 Minuten Meditation – dreißig Stunden, in denen du nichts erreichen musstest und doch so viel gewonnen hast.',
        criterion: { type: 'habit', questKey: 'meditation', metric: 'total', target: 1800 },
      },
    ]
  }
  return [
    {
      title: 'Die erste Stille',
      description: 'Meditiere an 7 Tagen. Sieben kleine Inseln der Ruhe – deine ersten Schritte durch das Klostertor.',
      criterion: { type: 'habit', questKey: 'meditation', metric: 'completions', target: 7 },
    },
    {
      title: 'Der Hüter der Nacht',
      description: 'Geh 14 Nächte in Folge rechtzeitig ins Bett. Dein Körper lernt den Rhythmus – und das Einschlafen fällt dir leichter.',
      criterion: { type: 'habit', questKey: 'bedtime', metric: 'streak', target: 14 },
    },
    {
      title: 'Einundzwanzig Tage auf dem Kissen',
      description: 'Meditiere 21 Tage in Folge. Jetzt ist die Stille keine Übung mehr, sondern ein fester Teil deines Tages.',
      criterion: { type: 'habit', questKey: 'meditation', metric: 'streak', target: 21 },
    },
    {
      title: 'Das Schweigegelübde',
      description: 'Verbringe einen ganzen Vormittag in Stille: kein Handy, keine Musik, keine Gespräche. Nur du, ein Spaziergang und deine Gedanken.',
      criterion: { type: 'manual' },
    },
    {
      title: 'Acht Tage der Einkehr',
      description: 'Erlebe 8 handyfreie Tage – Tage, an denen du nicht gescrollt, sondern gelebt hast.',
      criterion: { type: 'habit', questKey: 'phoneFreeDay', metric: 'completions', target: 8 },
    },
    {
      title: 'Zehn Stunden Stille',
      description: 'Sammle insgesamt 600 Minuten Meditation – zehn Stunden, in denen du nichts erreichen musstest und doch so viel gewonnen hast.',
      criterion: { type: 'habit', questKey: 'meditation', metric: 'total', target: 600 },
    },
  ]
}

export const monkBlueprint: CampaignBlueprint = {
  id: 'monk',
  icon: '📿',
  title: 'Der stille Mönch',
  tagline: 'Ruhe finden: Meditation, Abendrituale und erholsamer Schlaf.',
  description:
    'Ein halbes Jahr auf dem Weg des Mönchs: Du meditierst, legst abends den Bildschirm beiseite und gehst rechtzeitig schlafen. Aus Unruhe wird Gelassenheit – und aus kurzen Nächten erholsamer Schlaf.',
  primaryAttribute: 'wisdom',
  secondaryAttributes: ['vitality', 'discipline'],
  durationDays: DURATION_DAYS,
  levelHints: {
    beginner: '5 Minuten Meditation am Tag, spätestens um 23:30 Uhr ins Bett, 2× pro Woche ins Morgenlicht und ein handyfreier Tag pro Woche.',
    advanced:
      '15 Minuten Meditation und ein Abendtagebuch am Tag, um 22:30 Uhr ins Bett, 3× pro Woche ins Morgenlicht und ein handyfreier Tag pro Woche.',
  },
  build({ level }) {
    return {
      title: 'Der stille Mönch',
      icon: '📿',
      description:
        'Ruhe und Schlaf auf dem Weg des Mönchs: tägliche Meditation, Abende ohne Bildschirmlicht und feste Schlafenszeiten. Vormittags holst du dir Tageslicht, einmal pro Woche legst du das Handy ganz beiseite – und findest eine Stille, die trägt.',
      why: 'Ich will zur Ruhe kommen: abends abschalten, tief schlafen, ausgeruht aufwachen. In der Stille finde ich die Klarheit und Gelassenheit, die mir im Lärm des Alltags fehlen.',
      reward: 'Ein Wochenende voller Ruhe – in einer Berghütte, einem Kloster oder einem Wellnesshotel',
      quests: quests(level),
      chapters: chapters(level),
    }
  },
}
