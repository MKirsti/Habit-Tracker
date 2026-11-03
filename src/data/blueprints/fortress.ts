/**
 * Vorlage "Die Festung": Ordnung & Finanzen.
 *
 * Eine Festung baut man Stein für Stein – mit kleinen täglichen Handgriffen statt großer Putz- und Sparaktionen:
 * - 🧹 **Aufräumen** (Disziplin, Kern): messbar in Minuten – Einsteiger 10, Fortgeschrittene 15 am Tag, mit Timer.
 * - 🧾 **Ausgaben eintragen** (Disziplin): das Haushaltsbuch. Wer weiß, wohin das Geld fließt, kann es lenken.
 * - 🧭 **Wochenplanung** (Weisheit): sonntags Rückblick auf die Woche und Plan für die neue – die Reflexion,
 *   die alles andere zusammenhält.
 * - 🐉 **Aufgeschobenes erledigen** (Disziplin): 2× bzw. 3× pro Woche einen "Drachen" erschlagen – den Anruf, das
 *   Formular, die kaputte Lampe.
 * - Fortgeschrittene ergänzen 💰 **Kein Spontankauf** (Disziplin, täglich) und 📦 **Ausmisten** (Disziplin, jede
 *   Woche eine Ecke).
 *
 * Kapitel: ein schneller erster Überblick über die Ausgaben, eine Aufräum-Serie, entrümpelte Ecken, der
 * Notgroschen, erschlagene Drachen, ein eingehaltenes Budget und am Ende der Schatzmeister, der sein Gold kennt.
 */
import type { BlueprintChapter, BlueprintLevel, BlueprintQuest, CampaignBlueprint } from './types'

/**
 * Laufzeit: 180 Tage (gut ein halbes Jahr). Nach einem Monat Haushaltsbuch siehst du deine Muster, nach zwei bis
 * drei Monaten hältst du ein Budget, und ein Notgroschen wächst über Monate. Das letzte Kapitel (120 bzw. 140 Tage
 * Ausgaben eingetragen) lässt zwei Monate bzw. gut einen Monat Puffer für Urlaub und Ausnahmetage.
 */
const DURATION_DAYS = 180

function quests(level: BlueprintLevel): BlueprintQuest[] {
  const advanced = level === 'advanced'
  return [
    {
      key: 'tidy',
      icon: '🧹',
      title: 'Aufräumen',
      description: advanced
        ? 'Eine Viertelstunde mit Timer: erst die Flächen frei, dann ein Bereich im Wechsel – Küche, Bad, Flur. Wer täglich ein Stück pflegt, braucht kaum noch einen Großputz.'
        : 'Stell dir einen Timer auf 10 Minuten und räum auf, bis er klingelt: Flächen frei, Dinge an ihren Platz, Geschirr weg. Kleine Runden halten die Festung in Ordnung.',
      attribute: 'discipline',
      difficulty: advanced ? 'medium' : 'easy',
      schedule: { type: 'daily' },
      measure: { target: advanced ? 15 : 10, unit: 'Minuten' },
    },
    {
      key: 'expenses',
      icon: '🧾',
      title: 'Ausgaben eintragen',
      description: advanced
        ? 'Trag jede Ausgabe des Tages ein und ordne sie einer Kategorie zu. Ein kurzer Blick auf den Monat zeigt dir, ob du noch im Rahmen deines Budgets bist.'
        : 'Trag jede Ausgabe des Tages ins Haushaltsbuch oder in deine Finanz-App ein – auch das Brötchen beim Bäcker. Wer weiß, wohin sein Gold fließt, behält es.',
      attribute: 'discipline',
      difficulty: 'easy',
      schedule: { type: 'daily' },
    },
    ...(advanced
      ? [
          {
            key: 'noImpulse',
            icon: '💰',
            title: 'Kein Spontankauf',
            description:
              'Was nicht geplant war und mehr als 20 € kostet, kommt erst auf die Wunschliste. Nach 48 Stunden entscheidest du neu – meist ist der Reiz dann verflogen.',
            attribute: 'discipline',
            difficulty: 'medium',
            schedule: { type: 'daily' },
          } satisfies BlueprintQuest,
        ]
      : []),
    {
      key: 'weeklyPlan',
      icon: '🧭',
      title: 'Wochenplanung',
      description:
        'Sonntags eine Viertelstunde: Was lief gut, was ist liegen geblieben? Dann Termine, Aufgaben und größere Ausgaben der neuen Woche in den Kalender.',
      attribute: 'wisdom',
      difficulty: 'medium',
      schedule: { type: 'weekdays', days: [7] },
    },
    {
      key: 'dragon',
      icon: '🐉',
      title: 'Aufgeschobenes erledigen',
      description:
        'Erledige eine Sache, die du schon lange vor dir herschiebst: den Anruf, das Formular, die kaputte Lampe. Jeder erschlagene Drache macht die Festung sicherer.',
      attribute: 'discipline',
      difficulty: 'medium',
      schedule: { type: 'weekly', times: advanced ? 3 : 2 },
    },
    ...(advanced
      ? [
          {
            key: 'declutter',
            icon: '📦',
            title: 'Ausmisten',
            description:
              'Nimm dir eine Schublade, ein Regalbrett oder eine Ecke vor: alles raus, nur zurück, was du brauchst oder liebst. Der Rest wird verschenkt, verkauft oder entsorgt.',
            attribute: 'discipline',
            difficulty: 'medium',
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
        title: 'Das Fundament',
        description: 'Trag an 14 Tagen deine Ausgaben ein. Zwei Wochen schwarz auf weiß – jetzt weißt du, wohin dein Gold fließt.',
        criterion: { type: 'habit', questKey: 'expenses', metric: 'completions', target: 14 },
      },
      {
        title: 'Die Mauern stehen',
        description: 'Räume 30 Tage in Folge auf. Ein ganzer Monat ohne Lücke – Ordnung ist jetzt dein Normalzustand.',
        criterion: { type: 'habit', questKey: 'tidy', metric: 'streak', target: 30 },
      },
      {
        title: 'Die entrümpelte Festung',
        description: 'Miste 16 Ecken aus – Woche für Woche eine Schublade, ein Regal, einen Schrank. Am Ende hat jedes Ding in deiner Festung seinen Platz.',
        criterion: { type: 'habit', questKey: 'declutter', metric: 'completions', target: 16 },
      },
      {
        title: 'Ein Quartal im Rahmen',
        description: 'Halte drei Monate in Folge dein Monatsbudget ein. Dein Haushaltsbuch zeigt dir, wo du nachsteuern musst – und wo plötzlich Gold übrig bleibt.',
        criterion: { type: 'manual' },
      },
      {
        title: 'Fünfzig erschlagene Drachen',
        description: 'Erledige 50-mal etwas, das du lange vor dir hergeschoben hast. Die Drachen werden kleiner, weil du sie nicht mehr wachsen lässt.',
        criterion: { type: 'habit', questKey: 'dragon', metric: 'completions', target: 50 },
      },
      {
        title: 'Die volle Schatzkammer',
        description: 'Fülle deinen Notgroschen, bis er einen ganzen Monat deiner festen Kosten deckt – Miete, Versicherungen, Verträge. Ein Polster, das dich ruhig schlafen lässt.',
        criterion: { type: 'manual' },
      },
      {
        title: 'Der Schatzmeister',
        description: 'Trag an 140 Tagen deine Ausgaben ein. Du kennst jeden Winkel deiner Schatzkammer – und kein Taler verschwindet mehr spurlos.',
        criterion: { type: 'habit', questKey: 'expenses', metric: 'completions', target: 140 },
      },
    ]
  }
  return [
    {
      title: 'Das Fundament',
      description: 'Trag an 7 Tagen deine Ausgaben ein. Zum ersten Mal siehst du schwarz auf weiß, wohin dein Gold fließt.',
      criterion: { type: 'habit', questKey: 'expenses', metric: 'completions', target: 7 },
    },
    {
      title: 'Die Mauern stehen',
      description: 'Räume 21 Tage in Folge auf. Drei Wochen ohne Lücke – Ordnung ist jetzt kein Kraftakt mehr, sondern dein Alltag.',
      criterion: { type: 'habit', questKey: 'tidy', metric: 'streak', target: 21 },
    },
    {
      title: 'Die entrümpelte Kammer',
      description: 'Miste 5 Ecken aus: eine Schublade, ein Regalbrett, den Schrank im Flur. Alles raus, nur zurück, was du brauchst oder liebst.',
      criterion: { type: 'counter', target: 5, label: 'Ausgemistete Ecken' },
    },
    {
      title: 'Der Notgroschen',
      description: 'Eröffne ein eigenes Sparkonto für Notfälle und richte einen Dauerauftrag ein, der jeden Monat etwas zurücklegt – egal wie wenig. Der Grundstein deiner Schatzkammer.',
      criterion: { type: 'manual' },
    },
    {
      title: 'Zwanzig erschlagene Drachen',
      description: 'Erledige 20-mal etwas, das du lange vor dir hergeschoben hast. Zwanzig Drachen weniger, die dir den Schlaf rauben.',
      criterion: { type: 'habit', questKey: 'dragon', metric: 'completions', target: 20 },
    },
    {
      title: 'Ein Monat im Rahmen',
      description: 'Leg zu Monatsbeginn ein Budget fest und halte es bis zum Monatsende ein. Deine eingetragenen Ausgaben zeigen dir jederzeit, ob du auf Kurs bist.',
      criterion: { type: 'manual' },
    },
    {
      title: 'Der Schatzmeister',
      description: 'Trag an 120 Tagen deine Ausgaben ein. Du kennst jetzt jeden Winkel deiner Schatzkammer – und kein Taler verschwindet mehr spurlos.',
      criterion: { type: 'habit', questKey: 'expenses', metric: 'completions', target: 120 },
    },
  ]
}

export const fortressBlueprint: CampaignBlueprint = {
  id: 'fortress',
  icon: '🏰',
  title: 'Die Festung',
  tagline: 'Ordnung & Finanzen: ein aufgeräumtes Zuhause und eine gefüllte Schatzkammer.',
  description:
    'Ein halbes Jahr Festungsbau: Du hältst dein Zuhause mit kleinen Runden in Ordnung, behältst dein Geld im Blick und erschlägst die Drachen, die du lange vor dir hergeschoben hast. Am Ende steht eine Festung, die dir Ruhe schenkt.',
  primaryAttribute: 'discipline',
  secondaryAttributes: ['wisdom'],
  durationDays: DURATION_DAYS,
  levelHints: {
    beginner: 'Jeden Tag 10 Minuten aufräumen und die Ausgaben eintragen, sonntags die Woche planen und 2× pro Woche etwas Aufgeschobenes erledigen.',
    advanced:
      'Jeden Tag 15 Minuten aufräumen, Ausgaben eintragen und nichts spontan kaufen, 3× pro Woche Aufgeschobenes erledigen und jede Woche eine Ecke ausmisten.',
  },
  build({ level }) {
    return {
      title: 'Die Festung',
      icon: '🏰',
      description:
        'Ordnung und Finanzen nach Art der Festung: tägliche Aufräumrunden, ein Haushaltsbuch, das dir zeigt, wohin dein Gold fließt, und eine feste Wochenplanung am Sonntag. Stein für Stein baust du dir ein Zuhause und ein Polster, die dich tragen.',
      why: 'Ich will die Kontrolle zurück: ein Zuhause, in dem ich durchatmen kann, und ein Konto, bei dem ich nicht die Luft anhalte. Keine liegen gebliebenen Briefe mehr, keine bösen Überraschungen am Monatsende – meine Festung, meine Ruhe.',
      reward: 'Ein schönes Stück für mein aufgeräumtes Zuhause – bezahlt von dem, was am Monatsende übrig blieb',
      quests: quests(level),
      chapters: chapters(level),
    }
  },
}
