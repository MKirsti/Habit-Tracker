/**
 * Vorlage "Der Polyglotte": eine neue Sprache lernen – egal welche. (Die Person ist "der Polyglotte" – "der
 * Polyglott" wäre ein mehrsprachiges Buch.)
 *
 * Alle Texte sprechen von "deiner Zielsprache", damit die Vorlage für Spanisch genauso passt wie für Japanisch.
 * Sprache lernt man über vier Wege, und jeder hat hier seine Quest:
 * - 🗂️ **Vokabeln lernen** (Intelligenz, Kern): messbar in Minuten – Einsteiger 10, Fortgeschrittene 20 am Tag.
 * - 📓 **Tagebuch in der Zielsprache** (Weisheit): ein bzw. drei Sätze über den eigenen Tag – Schreiben und
 *   Reflexion in einem, mit genau den Wörtern, die du im Alltag brauchst.
 * - 🎧 **Fremdsprachige Serie oder Podcast** (Intelligenz): 2× bzw. 4× pro Woche – das Ohr an die Sprache
 *   gewöhnen.
 * - 🎙️ **Laut sprechen üben** (Charisma): 2× bzw. 3× pro Woche zehn Minuten laut – der Mund lernt mit.
 * - Fortgeschrittene ergänzen 💬 **Sprachtandem** (Charisma, schwer): jede Woche ein echtes Gespräch.
 *
 * Kapitel: die ersten Worte, eine Vokabel-Serie, eine Hör-Serie, das erste Gespräch (Fortgeschritten: zwanzig
 * Tandem-Gespräche), das Buch der Tage, eine Folge ohne Untertitel und am Ende die Gesamtzeit im Vokabeltraining.
 */
import type { BlueprintChapter, BlueprintLevel, BlueprintQuest, CampaignBlueprint } from './types'

/**
 * Laufzeit: ein Jahr. Eine neue Sprache braucht viele Stunden Kontakt – mit 10 Minuten Vokabeln am Tag, Serien und
 * Sprechübungen kommen Einsteiger in einem Jahr gut ins erste Gespräch. Das letzte Kapitel (2.500 bzw. 5.000
 * Minuten) entspricht dem Tagesziel an gut zwei Dritteln aller Tage; längere Einheiten zählen voll mit.
 */
const DURATION_DAYS = 365

function quests(level: BlueprintLevel): BlueprintQuest[] {
  const advanced = level === 'advanced'
  return [
    {
      key: 'vocab',
      icon: '🗂️',
      title: 'Vokabeln lernen',
      description: advanced
        ? 'Neue Wörter und fällige Wiederholungen, dazu ein Beispielsatz pro Wort. Im Zusammenhang gelernt, bleiben dir Vokabeln viel länger treu.'
        : 'Neue Wörter lernen und fällige wiederholen – mit Karteikarten oder deiner Sprach-App. Sprich jedes Wort einmal laut aus, dann bleibt es besser hängen.',
      attribute: 'intellect',
      difficulty: 'medium',
      schedule: { type: 'daily' },
      measure: { target: advanced ? 20 : 10, unit: 'Minuten' },
    },
    {
      key: 'journal',
      icon: '📓',
      title: 'Tagebuch in der Zielsprache',
      description: advanced
        ? 'Drei Sätze über deinen Tag – in deiner Zielsprache und ohne Übersetzer. Schlag fehlende Wörter nach und nimm sie gleich in deine Vokabeln auf.'
        : 'Ein Satz über deinen Tag – in deiner Zielsprache. Fehlt dir ein Wort, schlag es nach: So lernst du genau die Wörter, die du wirklich brauchst.',
      attribute: 'wisdom',
      difficulty: advanced ? 'medium' : 'easy',
      schedule: { type: 'daily' },
    },
    {
      key: 'listening',
      icon: '🎧',
      title: 'Fremdsprachige Serie oder Podcast',
      description: advanced
        ? 'Eine Folge in deiner Zielsprache, Untertitel höchstens in der Zielsprache. Schreib dir zwei, drei Wendungen heraus, die du selbst benutzen willst.'
        : 'Eine Folge in deiner Zielsprache – Untertitel in der Zielsprache sind erlaubt. Du musst nicht jedes Wort verstehen: Lass die Sprache einfach auf dich wirken.',
      attribute: 'intellect',
      difficulty: 'medium',
      schedule: { type: 'weekly', times: advanced ? 4 : 2 },
    },
    {
      key: 'speaking',
      icon: '🎙️',
      title: 'Laut sprechen üben',
      description:
        'Zehn Minuten laut: Sätze aus einer Aufnahme direkt nachsprechen, dich selbst aufnehmen oder erzählen, was du heute gemacht hast. Dein Mund lernt die Sprache mit.',
      attribute: 'charisma',
      difficulty: 'medium',
      schedule: { type: 'weekly', times: advanced ? 3 : 2 },
    },
    ...(advanced
      ? [
          {
            key: 'tandem',
            icon: '💬',
            title: 'Sprachtandem',
            description:
              'Ein echtes Gespräch in deiner Zielsprache, mindestens 30 Minuten: mit deinem Tandem, einer Lehrkraft oder Muttersprachlern. Fehler sind ausdrücklich erlaubt.',
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
        title: 'Die ersten Worte',
        description: 'Erreiche an 14 Tagen dein Vokabelziel. Zwei Wochen, in denen dein Wortschatz jeden Tag ein Stück gewachsen ist.',
        criterion: { type: 'habit', questKey: 'vocab', metric: 'completions', target: 14 },
      },
      {
        title: 'Der Wortschatz wächst',
        description: 'Lerne 60 Tage in Folge Vokabeln. Zwei Monate ohne Lücke – Wiederholen ist für dich so selbstverständlich wie Zähneputzen.',
        criterion: { type: 'habit', questKey: 'vocab', metric: 'streak', target: 60 },
      },
      {
        title: 'Das Ohr gewöhnt sich',
        description: 'Erfülle 12 Wochen in Folge dein Wochenziel an Serien und Podcasts. Ein Quartal lang hörst du zu – und verstehst immer mehr.',
        criterion: { type: 'habit', questKey: 'listening', metric: 'streak', target: 12 },
      },
      {
        title: 'Zwanzig Gespräche',
        description: 'Führe 20 Gespräche im Sprachtandem. Mit jedem Mal stockst du seltener – bis du vergisst, dass du in einer fremden Sprache sprichst.',
        criterion: { type: 'habit', questKey: 'tandem', metric: 'completions', target: 20 },
      },
      {
        title: 'Das Buch der Tage',
        description: 'Schreib an 150 Tagen dein Tagebuch in der Zielsprache – mindestens 450 Sätze, die zeigen, wie weit du gekommen bist.',
        criterion: { type: 'habit', questKey: 'journal', metric: 'completions', target: 150 },
      },
      {
        title: 'Ohne Untertitel',
        description: 'Schau einen ganzen Spielfilm ohne Untertitel und folge der Handlung bis zum Abspann. Was früher Rauschen war, ist jetzt eine Geschichte.',
        criterion: { type: 'manual' },
      },
      {
        title: 'Der Polyglotte',
        description: 'Sammle insgesamt 5.000 Minuten Vokabeltraining – über 80 Stunden, in denen deine Zielsprache Wort für Wort ein Teil von dir geworden ist.',
        criterion: { type: 'habit', questKey: 'vocab', metric: 'total', target: 5000 },
      },
    ]
  }
  return [
    {
      title: 'Die ersten Worte',
      description: 'Lerne an 7 Tagen deine Vokabeln. Die ersten Worte einer neuen Welt gehören dir – und mit ihnen der erste Schlüssel.',
      criterion: { type: 'habit', questKey: 'vocab', metric: 'completions', target: 7 },
    },
    {
      title: 'Der Wortschatz wächst',
      description: 'Lerne 30 Tage in Folge Vokabeln. Ein Monat ohne Lücke: Dein Gedächtnis hat sich an das tägliche Training gewöhnt.',
      criterion: { type: 'habit', questKey: 'vocab', metric: 'streak', target: 30 },
    },
    {
      title: 'Das Ohr gewöhnt sich',
      description: 'Erfülle 8 Wochen in Folge dein Wochenziel an Serien und Podcasts. Langsam wird aus fremdem Rauschen eine Sprache.',
      criterion: { type: 'habit', questKey: 'listening', metric: 'streak', target: 8 },
    },
    {
      title: 'Das erste Gespräch',
      description: 'Führe dein erstes echtes Gespräch in der Zielsprache – mit einer Muttersprachlerin, im Sprachcafé oder im Urlaub. Fünf Minuten reichen, Fehler inklusive.',
      criterion: { type: 'manual' },
    },
    {
      title: 'Das Buch der Tage',
      description: 'Schreib an 100 Tagen dein Tagebuch in der Zielsprache. Blätterst du zurück, siehst du, wie viel sicherer deine Sätze geworden sind.',
      criterion: { type: 'habit', questKey: 'journal', metric: 'completions', target: 100 },
    },
    {
      title: 'Ohne Untertitel',
      description: 'Verstehe eine ganze Folge ohne Untertitel – nicht jedes Wort, aber worum es geht. Kinderserien und Podcasts für Lernende zählen ausdrücklich mit.',
      criterion: { type: 'manual' },
    },
    {
      title: 'Der Polyglotte',
      description: 'Sammle insgesamt 2.500 Minuten Vokabeltraining – über 40 Stunden, in denen deine neue Sprache Wort für Wort gewachsen ist.',
      criterion: { type: 'habit', questKey: 'vocab', metric: 'total', target: 2500 },
    },
  ]
}

export const polyglotBlueprint: CampaignBlueprint = {
  id: 'polyglot',
  icon: '🌍',
  title: 'Der Polyglotte',
  tagline: 'Eine neue Sprache lernen: Wörter sammeln, zuhören, sprechen.',
  description:
    'Ein Jahr mit deiner Zielsprache – ob Spanisch, Japanisch oder Schwedisch: Du lernst jeden Tag Vokabeln, schreibst ein paar Sätze, hörst Serien und Podcasts und übst das Sprechen. Am Ende führst du Gespräche, wo früher nur Rauschen war.',
  primaryAttribute: 'intellect',
  secondaryAttributes: ['charisma', 'wisdom'],
  durationDays: DURATION_DAYS,
  levelHints: {
    beginner: '10 Minuten Vokabeln und ein Satz Tagebuch am Tag, 2× pro Woche eine Folge in der Zielsprache und 2× laut sprechen üben.',
    advanced: '20 Minuten Vokabeln und drei Sätze Tagebuch am Tag, 4× pro Woche eine Folge, 3× laut sprechen und jede Woche ein Tandem-Gespräch.',
  },
  build({ level }) {
    return {
      title: 'Der Polyglotte',
      icon: '🌍',
      description:
        'Eine neue Sprache auf dem Weg des Polyglotten: täglich Vokabeln und ein Tagebuch in deiner Zielsprache, regelmäßig Serien, Podcasts und lautes Sprechen. Wort für Wort öffnet sich eine neue Welt – bis du sie ohne Untertitel verstehst.',
      why: 'Ich will mich in einer anderen Sprache zu Hause fühlen: Menschen verstehen, mit ihnen lachen, Bücher und Filme im Original erleben. Jedes neue Wort öffnet mir eine Tür in eine andere Welt.',
      reward: 'Eine Reise in ein Land, in dem meine Zielsprache gesprochen wird',
      quests: quests(level),
      chapters: chapters(level),
    }
  },
}
