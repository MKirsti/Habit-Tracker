/**
 * Heldenklassen (Phase 3a): reine Daten – Namen in drei Sprachformen, Symbol, Attribute, Beschreibung –
 * plus die Angriffsnamen je Attribut. Welche Klasse ein Held in einer Woche hat, berechnet `classes.ts`
 * (dort auch die Zuordnung Attribute → Klasse und `classNameFor` für die Sprachform).
 *
 * Regeln für die Texte (geprüft in `classDefinitions.test.ts`):
 * - Eine Definition je `HeroClassId`: der Abenteurer (keine Attribute), 6 Grundklassen (ein Attribut) und
 *   15 Hybridklassen (jedes Attribut-Paar genau einmal), Tabelle siehe docs/ARCHITECTURE.md „Phase 3a → Klasse“.
 *   Attribute stehen in der Reihenfolge von `ATTRIBUTE_IDS`.
 * - Namen: weiblich / männlich / neutral (`CharacterProfile.form`, fehlt = neutral). Die neutrale Form ist ein
 *   eigenständiger, geschlechtsneutraler Name – kein Gendersternchen, keine „…kundige Person“, sondern ein Bild,
 *   das für sich steht und im Helden-Kopf natürlich klingt: „Aria · Lvl 7 · Arkane Seele“. Höchstens 20 Zeichen,
 *   damit „Lvl 7 · 🔮 Name“ auch auf 360 px in eine Zeile passt.
 * - Beschreibung: 1–2 Sätze in Du-Form, für alle Sprachformen gleich – also ohne „Held“, „Kriegerin“ & Co.
 *   Deutsche Anführungszeichen („…“).
 */
import type { AttributeId, GrammaticalForm, HeroClassDefinition, HeroClassId } from '../types'

/** Alle Sprachformen in Anzeige-Reihenfolge (Auswahl in Onboarding, Profil und Einführungskarte). */
export const GRAMMATICAL_FORMS: GrammaticalForm[] = ['female', 'male', 'neutral']

/** Beschriftung der Sprachformen für die Auswahl. */
export const GRAMMATICAL_FORM_LABELS: Record<GrammaticalForm, string> = {
  female: 'Heldin',
  male: 'Held',
  neutral: 'Neutral',
}

/** Angriffsname je Attribut (Treffer-Anzeige, `AttackEvent.attackName`). */
export const ATTACK_NAMES: Record<AttributeId, string> = {
  strength: 'Schwerthieb',
  intellect: 'Arkaner Blitz',
  wisdom: 'Mondlicht',
  charisma: 'Schlachtruf',
  vitality: 'Lebensfunke',
  discipline: 'Schildstoß',
}

export const CLASS_DEFINITIONS: Record<HeroClassId, HeroClassDefinition> = {
  // --- Start: noch keine Klasse ----------------------------------------------------------------------------
  adventurer: {
    id: 'adventurer',
    names: { female: 'Abenteurerin', male: 'Abenteurer', neutral: 'Wanderseele' },
    icon: '🧭',
    attributes: [],
    description:
      'Noch suchst du deinen Weg und probierst alles aus. Sobald ein Attribut Level 3 erreicht, erwacht zu Beginn der nächsten Woche deine Klasse.',
  },

  // --- Grundklassen (ein Attribut, +20 %) ------------------------------------------------------------------
  warrior: {
    id: 'warrior',
    names: { female: 'Kriegerin', male: 'Krieger', neutral: 'Eisenherz' },
    icon: '⚔️',
    attributes: ['strength'],
    description: 'Schweiß und Eisen haben dich geformt. Wo andere zögern, packst du an – deine Schwerthiebe treffen mit voller Wucht.',
  },
  mage: {
    id: 'mage',
    names: { female: 'Magierin', male: 'Magier', neutral: 'Arkane Seele' },
    icon: '🔮',
    attributes: ['intellect'],
    description: 'Bücher, Sprachen und Neugier sind die Quellen deiner Magie. Mit jeder Lektion knistern deine Arkanen Blitze heller.',
  },
  druid: {
    id: 'druid',
    names: { female: 'Druidin', male: 'Druide', neutral: 'Stimme des Waldes' },
    icon: '🌳',
    attributes: ['wisdom'],
    description: 'Du ruhst in dir wie ein alter Wald. Stille, Schlaf und Achtsamkeit nähren deine Kraft – und dein Mondlicht findet jedes Ziel.',
  },
  bard: {
    id: 'bard',
    names: { female: 'Bardin', male: 'Barde', neutral: 'Goldkehle' },
    icon: '🪕',
    attributes: ['charisma'],
    description: 'Du verbindest Menschen – mit Worten, Liedern und offenen Ohren. Dein Schlachtruf hallt über jedes Feld und macht allen Mut.',
  },
  paladin: {
    id: 'paladin',
    names: { female: 'Paladinin', male: 'Paladin', neutral: 'Lichtgestalt' },
    icon: '☀️',
    attributes: ['vitality'],
    description:
      'Gutes Essen, frisches Wasser und Selbstfürsorge sind dein Weg zum Licht. Dein Lebensfunke leuchtet hell und trägt dich durch jeden Kampf.',
  },
  warden: {
    id: 'warden',
    names: { female: 'Wächterin', male: 'Wächter', neutral: 'Schildwacht' },
    icon: '🛡️',
    attributes: ['discipline'],
    description: 'Routinen sind deine Rüstung, Ordnung ist dein Schild. Tag für Tag hältst du deinen Posten – genau das macht dich unbezwingbar.',
  },

  // --- Hybridklassen (zwei Attribute, je +10 %) ------------------------------------------------------------
  battlemage: {
    id: 'battlemage',
    names: { female: 'Kampfmagierin', male: 'Kampfmagier', neutral: 'Arkane Klinge' },
    icon: '⚡',
    attributes: ['strength', 'intellect'],
    description: 'Du trainierst Körper und Kopf gleichermaßen. In deiner Klinge knistert arkane Energie – Kraft und Wissen in einem Hieb.',
  },
  monk: {
    id: 'monk',
    names: { female: 'Mönchin', male: 'Mönch', neutral: 'Stille Faust' },
    icon: '🥋',
    attributes: ['strength', 'wisdom'],
    description: 'Kraft ohne Hast, Ruhe ohne Trägheit. Dein Körper ist stark, dein Geist ist still – und du schlägst zu, wenn der Moment reif ist.',
  },
  bannerbearer: {
    id: 'bannerbearer',
    names: { female: 'Bannerträgerin', male: 'Bannerträger', neutral: 'Leuchtfeuer' },
    icon: '🦁',
    attributes: ['strength', 'charisma'],
    description: 'Wo du vorangehst, folgen andere. Deine Stärke gibt Halt, deine Begeisterung steckt an – du trägst das Banner für alle.',
  },
  berserker: {
    id: 'berserker',
    names: { female: 'Berserkerin', male: 'Berserker', neutral: 'Urgewalt' },
    icon: '🐻',
    attributes: ['strength', 'vitality'],
    description: 'Du strotzt vor Kraft und Lebensenergie. Einmal in Fahrt, bist du kaum noch zu bremsen.',
  },
  knight: {
    id: 'knight',
    names: { female: 'Ritterin', male: 'Ritter', neutral: 'Ehrenklinge' },
    icon: '⚜️',
    attributes: ['strength', 'discipline'],
    description: 'Dein Wort gilt, dein Arm ist stark. Mit eiserner Disziplin und ehrlichem Schweiß hältst du, was du versprichst.',
  },
  archmage: {
    id: 'archmage',
    names: { female: 'Erzmagierin', male: 'Erzmagier', neutral: 'Sternengeist' },
    icon: '🌌',
    attributes: ['intellect', 'wisdom'],
    description: 'In dir fließen Wissen und Weisheit zusammen. Du lernst nicht nur viel – du verstehst auch, was es bedeutet.',
  },
  illusionist: {
    id: 'illusionist',
    names: { female: 'Illusionistin', male: 'Illusionist', neutral: 'Zauberhand' },
    icon: '🎭',
    attributes: ['intellect', 'charisma'],
    description: 'Kluger Kopf, gewinnender Charme: Du verzauberst jedes Publikum. Mit Witz und Fantasie erweckst du Ideen zum Leben.',
  },
  healer: {
    id: 'healer',
    names: { female: 'Heilkundige', male: 'Heilkundiger', neutral: 'Heilende Hand' },
    icon: '🌿',
    attributes: ['intellect', 'vitality'],
    description: 'Du weißt, was deinem Körper guttut – und handelst danach. Wissen ist deine Medizin, Fürsorge deine Kunst.',
  },
  runesmith: {
    id: 'runesmith',
    names: { female: 'Runenschmiedin', male: 'Runenschmied', neutral: 'Runengenie' },
    icon: '⚒️',
    attributes: ['intellect', 'discipline'],
    description: 'Präzision und Wissen sind deine Werkzeuge. Geduldig schlägst du Rune um Rune in den Stahl – und jede hält ewig.',
  },
  seer: {
    id: 'seer',
    names: { female: 'Seherin', male: 'Seher', neutral: 'Orakel' },
    icon: '👁️',
    attributes: ['wisdom', 'charisma'],
    description:
      'Du hörst zu, wo andere reden, und siehst, was anderen verborgen bleibt. Deine Gelassenheit macht dich zum ruhenden Pol für alle um dich herum.',
  },
  shaman: {
    id: 'shaman',
    names: { female: 'Schamanin', male: 'Schamane', neutral: 'Trommelherz' },
    icon: '🥁',
    attributes: ['wisdom', 'vitality'],
    description: 'Du lauschst dem Rhythmus deines Körpers: Schlaf, Atem, Nahrung. Im Einklang mit dir selbst rufst du uralte Kräfte herbei.',
  },
  templar: {
    id: 'templar',
    names: { female: 'Templerin', male: 'Templer', neutral: 'Tempelwacht' },
    icon: '🏛️',
    attributes: ['wisdom', 'discipline'],
    description: 'Stille und Strenge sind dein Gelübde. Mit klarem Geist und fester Routine hältst du Wacht über dein inneres Heiligtum.',
  },
  troubadour: {
    id: 'troubadour',
    names: { female: 'Troubadourin', male: 'Troubadour', neutral: 'Frohnatur' },
    icon: '🌹',
    attributes: ['charisma', 'vitality'],
    description: 'Du sprühst vor Lebensfreude und teilst sie mit allen. Wo du einkehrst, wird gelacht, gesungen und gut gegessen.',
  },
  warlord: {
    id: 'warlord',
    names: { female: 'Feldherrin', male: 'Feldherr', neutral: 'Leitstern' },
    icon: '🗺️',
    attributes: ['charisma', 'discipline'],
    description: 'Du planst mit Weitblick und reißt andere mit. Klug und verlässlich führst du jede Schar zum Sieg.',
  },
  sentinel: {
    id: 'sentinel',
    names: { female: 'Grenzwächterin', male: 'Grenzwächter', neutral: 'Grenzwacht' },
    icon: '🏹',
    attributes: ['vitality', 'discipline'],
    description: 'Ausdauernd, gesund und unbeirrbar hütest du die Grenzen deines Reiches. Deine Routinen sind ein Wall, den kein Schatten überwindet.',
  },
}
