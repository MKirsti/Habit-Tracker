/**
 * Vorlage "Der Alchemist": gesunde Ernährung.
 *
 * Der Alchemist verwandelt einfache Zutaten in Kraft – ohne strenge Diät, mit wenigen klaren Gewohnheiten:
 * - 🥦 **Gemüse & Obst** (Vitalität, Kern): messbar in Portionen – Einsteiger 3 am Tag, Fortgeschrittene
 *   „5 am Tag“. Eine Portion ist eine Handvoll.
 * - 💧 **Wasser trinken** (aus `shared.ts`, Vitalität): das tägliche Elixier.
 * - 🍵 **Kein Naschen nach 20 Uhr** (Disziplin): ein klarer, machbarer Schnitt am Abend statt Zuckerverbot.
 * - 🍳 **Selbst kochen** (Disziplin): 2× bzw. 4× pro Woche eine Mahlzeit aus frischen Zutaten.
 * - Fortgeschrittene ergänzen 🍽️ **Achtsam essen** (Weisheit) und 🛒 **Speiseplan der Woche** (Disziplin).
 *
 * Kapitel: ein schneller erster Erfolg, Serien gegen das abendliche Naschen und fürs Kochen, ein Zähler für neue
 * Rezepte, ein Festmahl für andere und am Ende die Gesamtmenge an Portionen – der Stein der Weisen.
 */
import { waterQuest } from './shared'
import type { BlueprintChapter, BlueprintLevel, BlueprintQuest, CampaignBlueprint } from './types'

/**
 * Laufzeit: 180 Tage (gut ein halbes Jahr). Geschmack und Essgewohnheiten ändern sich langsam: Nach einigen Wochen
 * ist Gemüse selbstverständlich, nach Monaten ist Selbstkochen Alltag. Das letzte Kapitel (400 bzw. 700 Portionen)
 * braucht im Schnitt gut 2 bzw. knapp 4 Portionen pro Tag – Puffer für Feiern, Reisen und Kantinenwochen inklusive.
 */
const DURATION_DAYS = 180

function quests(level: BlueprintLevel): BlueprintQuest[] {
  const advanced = level === 'advanced'
  return [
    {
      key: 'produce',
      icon: '🥦',
      title: 'Gemüse & Obst',
      description: advanced
        ? 'Fünf am Tag – zum Beispiel drei Portionen Gemüse und zwei Obst. Eine Portion passt in deine Hand: ein Apfel, eine Paprika, eine Schale Salat.'
        : 'Eine Portion passt in deine Hand: ein Apfel, eine Paprika, eine Schale Salat, eine Handvoll Beeren. Trag jede Portion ein – bunt schlägt eintönig.',
      attribute: 'vitality',
      difficulty: advanced ? 'medium' : 'easy',
      schedule: { type: 'daily' },
      measure: { target: advanced ? 5 : 3, unit: 'Portionen' },
    },
    waterQuest(level),
    {
      key: 'noSnacks',
      icon: '🍵',
      title: 'Kein Naschen nach 20 Uhr',
      description:
        'Nach dem Abendessen ist die Küche geschlossen: keine Süßigkeiten, Chips oder Limo mehr. Meldet sich der Heißhunger, hilft ein Tee oder ein Glas Wasser.',
      attribute: 'discipline',
      difficulty: 'medium',
      schedule: { type: 'daily' },
    },
    {
      key: 'cooking',
      icon: '🍳',
      title: 'Selbst kochen',
      description:
        'Eine Mahlzeit aus frischen Zutaten, selbst zubereitet – auch einfache Gerichte zählen. Koch ruhig die doppelte Menge, dann ist für morgen schon gesorgt.',
      attribute: 'discipline',
      difficulty: 'medium',
      schedule: { type: 'weekly', times: advanced ? 4 : 2 },
    },
    ...(advanced
      ? [
          {
            key: 'mindful',
            icon: '🍽️',
            title: 'Achtsam essen',
            description: 'Eine Mahlzeit am Tag ohne Handy und Fernseher: langsam kauen, wirklich schmecken und aufhören, wenn du satt bist.',
            attribute: 'wisdom',
            difficulty: 'easy',
            schedule: { type: 'daily' },
          } satisfies BlueprintQuest,
          {
            key: 'mealPlan',
            icon: '🛒',
            title: 'Speiseplan der Woche',
            description:
              'Plane die Hauptmahlzeiten der kommenden Woche und schreib die Einkaufsliste gleich dazu. Wer einen Plan hat, greift seltener zum Lieferdienst.',
            attribute: 'discipline',
            difficulty: 'easy',
            schedule: { type: 'weekly', times: 1 },
          } satisfies BlueprintQuest,
        ]
      : []),
  ]
}

/** In beiden Stufen gleich – als Funktion, damit jeder `build`-Aufruf eigene Objekte liefert. */
function feastChapter(): BlueprintChapter {
  return {
    title: 'Das Festmahl',
    description: 'Koche ein ganzes Essen für Freunde oder Familie – frisch, bunt und selbst gemacht. Geteilte Alchemie schmeckt doppelt gut.',
    criterion: { type: 'manual' },
  }
}

function chapters(level: BlueprintLevel): BlueprintChapter[] {
  if (level === 'advanced') {
    return [
      {
        title: 'Die ersten Zutaten',
        description: 'Erreiche an 10 Tagen dein Tagesziel an Gemüse & Obst. Die ersten Zutaten liegen auf dem Tisch – jetzt beginnt die Verwandlung.',
        criterion: { type: 'habit', questKey: 'produce', metric: 'completions', target: 10 },
      },
      {
        title: 'Der versiegelte Vorratsschrank',
        description: 'Halte 30 Abende in Folge durch: nach 20 Uhr nichts Süßes und keine Knabbereien. Ein ganzer Monat, in dem der Schrank versiegelt bleibt.',
        criterion: { type: 'habit', questKey: 'noSnacks', metric: 'streak', target: 30 },
      },
      {
        title: 'Die Zuckerprobe',
        description: 'Eine Woche ganz ohne zugesetzten Zucker: keine Süßigkeiten, keine Limo, kein gesüßter Joghurt. Lies die Zutatenlisten – du wirst staunen, wo er sich überall versteckt.',
        criterion: { type: 'manual' },
      },
      {
        title: 'Das Feuer unter dem Kessel',
        description: 'Erfülle 12 Wochen in Folge dein Kochziel der Woche. Ein ganzes Quartal lang brennt das Feuer – deine Küche ist jetzt dein Labor.',
        criterion: { type: 'habit', questKey: 'cooking', metric: 'streak', target: 12 },
      },
      {
        title: 'Das Rezeptbuch des Alchemisten',
        description: 'Probiere 12 neue Rezepte aus – eine fremde Landesküche, ein Gemüse, das du nie gekauft hast, ein Klassiker zum ersten Mal selbst gemacht.',
        criterion: { type: 'counter', target: 12, label: 'Neue Rezepte ausprobiert' },
      },
      feastChapter(),
      {
        title: 'Der Stein der Weisen',
        description: 'Sammle insgesamt 700 Portionen Gemüse & Obst. Das Geheimnis der Alchemisten war nie Gold, sondern Geduld – Portion für Portion.',
        criterion: { type: 'habit', questKey: 'produce', metric: 'total', target: 700 },
      },
    ]
  }
  return [
    {
      title: 'Die ersten Zutaten',
      description: 'Erreiche an 7 Tagen dein Tagesziel an Gemüse & Obst. Die ersten Zutaten liegen auf dem Tisch – jetzt beginnt die Verwandlung.',
      criterion: { type: 'habit', questKey: 'produce', metric: 'completions', target: 7 },
    },
    {
      title: 'Der versiegelte Vorratsschrank',
      description: 'Halte 14 Abende in Folge durch: nach 20 Uhr nichts Süßes und keine Knabbereien. Zwei Wochen, in denen der Schrank versiegelt bleibt.',
      criterion: { type: 'habit', questKey: 'noSnacks', metric: 'streak', target: 14 },
    },
    {
      title: 'Das Feuer unter dem Kessel',
      description: 'Erfülle 6 Wochen in Folge dein Kochziel der Woche. Das Feuer brennt – deine Küche wird zu deinem Labor.',
      criterion: { type: 'habit', questKey: 'cooking', metric: 'streak', target: 6 },
    },
    {
      title: 'Das Rezeptbuch des Alchemisten',
      description: 'Probiere 5 neue Rezepte aus – ein Gemüsecurry, eine Ofenpfanne, eine Suppe, die du noch nie gekocht hast. Die besten kommen in dein Rezeptbuch.',
      criterion: { type: 'counter', target: 5, label: 'Neue Rezepte ausprobiert' },
    },
    feastChapter(),
    {
      title: 'Der Stein der Weisen',
      description: 'Sammle insgesamt 400 Portionen Gemüse & Obst. Das Geheimnis der Alchemisten war nie Gold, sondern Geduld – Portion für Portion.',
      criterion: { type: 'habit', questKey: 'produce', metric: 'total', target: 400 },
    },
  ]
}

export const alchemistBlueprint: CampaignBlueprint = {
  id: 'alchemist',
  icon: '⚗️',
  title: 'Der Alchemist',
  tagline: 'Gesunde Ernährung: frisch, bunt und selbst gekocht.',
  description:
    'Sechs Monate in der Küche des Alchemisten: Du sammelst Gemüse und Obst, trinkst genug, kochst selbst und lässt abends das Naschen sein. Keine strenge Diät – eine gute Gewohnheit nach der anderen.',
  primaryAttribute: 'vitality',
  secondaryAttributes: ['discipline'],
  durationDays: DURATION_DAYS,
  levelHints: {
    beginner: '3 Portionen Gemüse & Obst und 1,5 L Wasser am Tag, nach 20 Uhr nicht mehr naschen, 2× pro Woche selbst kochen.',
    advanced: '5 Portionen Gemüse & Obst und 2,5 L Wasser am Tag, 4× pro Woche selbst kochen – dazu achtsam essen und die Woche planen.',
  },
  build({ level }) {
    return {
      title: 'Der Alchemist',
      icon: '⚗️',
      description:
        'Gesunde Ernährung nach Art des Alchemisten: Gemüse und Obst als Grundzutaten, Wasser als Elixier, die eigene Küche als Labor. Schritt für Schritt verwandelst du, was auf deinem Teller landet – und wie du dich fühlst.',
      why: 'Ich will mich von innen heraus stark fühlen: wach statt träge, satt statt vollgestopft. Was ich esse, wird zu dem, was ich bin – also braue ich mir jeden Tag mein bestes Elixier.',
      reward: 'Ein richtig gutes Küchenmesser oder ein Kochkurs für meine Lieblingsküche',
      quests: quests(level),
      chapters: chapters(level),
    }
  },
}
