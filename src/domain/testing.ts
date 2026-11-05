/**
 * Test-Hilfen: kleine Fabriken für Domain-Objekte mit sinnvollen Standardwerten.
 * Nur für Tests gedacht – im App-Code wird diese Datei nicht importiert.
 */
import { ATTRIBUTE_IDS } from './attributes'
import { BALANCING, DEFAULT_SETTINGS } from './balancing'
import { dayRange } from './dates'
import type {
  AchievementDefinition,
  AchievementStats,
  AttributeId,
  BossDefinition,
  BossVictory,
  Chapter,
  Chest,
  ChestSource,
  CompanionChoice,
  CompanionDefinition,
  CompanionSpecies,
  Completion,
  CosmeticCondition,
  CosmeticUnlock,
  DayKey,
  EndBossDefinition,
  FrameDefinition,
  GameData,
  Habit,
  HeroClassDefinition,
  HeroClassId,
  HpLedgerEntry,
  ItemId,
  MainQuest,
  Purchase,
  RestPeriod,
  Reward,
  SideQuest,
  TitleDefinition,
} from './types'

export function makeHabit(overrides: Partial<Habit> & Pick<Habit, 'id'>): Habit {
  return {
    title: `Quest ${overrides.id}`,
    icon: '⭐',
    attribute: 'discipline',
    difficulty: 'medium',
    schedule: { type: 'daily' },
    order: 0,
    createdDay: '2026-01-01',
    ...overrides,
  }
}

/**
 * Completion zu einer Quest. Standard: erledigt (value = target), Snapshots aus der Quest.
 * Mit `value` < target entsteht ein Teilfortschritt.
 */
export function makeCompletion(habit: Habit, day: DayKey, overrides: Partial<Completion> = {}): Completion {
  const target = habit.measure?.target ?? 1
  return {
    id: `${habit.id}:${day}`,
    habitId: habit.id,
    day,
    value: target,
    target,
    difficulty: habit.difficulty,
    attribute: habit.attribute,
    updatedAt: 0,
    ...overrides,
  }
}

/** Erledigte Completions für alle Tage von `from` bis `to` (inklusive). */
export function completeRange(habit: Habit, from: DayKey, to: DayKey): Completion[] {
  return dayRange(from, to).map((day) => makeCompletion(habit, day))
}

/** Set von Tagen, z. B. für `computeStreak`. */
export function daySet(...days: DayKey[]): Set<DayKey> {
  return new Set(days)
}

/** Set aller Tage von `from` bis `to` (inklusive). */
export function daySetRange(from: DayKey, to: DayKey): Set<DayKey> {
  return new Set(dayRange(from, to))
}

export function makeChapter(overrides: Partial<Chapter> & Pick<Chapter, 'id' | 'criterion'>): Chapter {
  return { title: `Kapitel ${overrides.id}`, ...overrides }
}

export function makeMainQuest(overrides: Partial<MainQuest> & Pick<MainQuest, 'id'>): MainQuest {
  return {
    title: `Kampagne ${overrides.id}`,
    icon: '📚',
    why: 'Weil es mir wichtig ist.',
    reward: 'Ein neues Buch',
    startDay: '2026-01-01',
    chapters: [],
    createdAt: 0,
    ...overrides,
  }
}

/**
 * Deterministischer Zufallsgenerator (mulberry32) für reproduzierbare Zufallstests.
 * Liefert Zahlen in [0, 1). Gleicher `seed` → gleiche Folge.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

export function makeGameData(overrides: Partial<GameData> = {}): GameData {
  return {
    settings: { ...DEFAULT_SETTINGS },
    habits: [],
    completions: [],
    mainQuests: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Phase 2a: Schatzkammer, Nebenquests, Erfolge
// ---------------------------------------------------------------------------

export function makeReward(overrides: Partial<Reward> & Pick<Reward, 'id'>): Reward {
  return {
    title: `Belohnung ${overrides.id}`,
    icon: '🍕',
    price: 100,
    repeatable: true,
    order: 0,
    createdAt: 0,
    ...overrides,
  }
}

/** Eine Einlösung (Standard: 100 Gold am 2026-01-01). Mit `reward` werden Titel, Icon und Preis übernommen. */
export function makePurchase(overrides: Partial<Purchase> & Pick<Purchase, 'id'>, reward?: Reward): Purchase {
  return {
    kind: 'reward',
    title: reward?.title ?? `Einlösung ${overrides.id}`,
    icon: reward?.icon ?? '🍕',
    price: reward?.price ?? 100,
    day: '2026-01-01',
    createdAt: 0,
    ...(reward ? { rewardId: reward.id } : {}),
    ...overrides,
  }
}

export function makeSideQuest(overrides: Partial<SideQuest> & Pick<SideQuest, 'id'>): SideQuest {
  return {
    title: `Nebenquest ${overrides.id}`,
    icon: '📜',
    attribute: 'discipline',
    difficulty: 'medium',
    createdDay: '2026-01-01',
    order: 0,
    ...overrides,
  }
}

/** Kennzahlen für Erfolge: alles 0 (Level und Attribut-Level 1, Abenteuertag 1), einzelne Werte überschreibbar. */
export function makeAchievementStats(overrides: Partial<AchievementStats> = {}): AchievementStats {
  const attributeLevels = Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 1])) as Record<AttributeId, number>
  return {
    questsCompleted: 0,
    perfectDays: 0,
    bestDayStreak: 0,
    bestWeekStreak: 0,
    activeDays: 0,
    adventureDay: 1,
    level: 1,
    totalXp: 0,
    attributeLevels,
    chaptersCompleted: 0,
    campaignsCompleted: 0,
    activeCampaigns: 0,
    sideQuestsCompleted: 0,
    purchases: 0,
    goldFromXp: 0,
    comebacks: 0,
    defeats: 0,
    perfectDaysAfterDefeat: 0,
    freezesUsed: 0,
    ...overrides,
  }
}

/**
 * Erfolgs-Definition für Tests: freigeschaltet, sobald `read(stats) ≥ target`.
 * Mit `deriveGameState(data, today, { achievements: [...] })` lassen sich so auch die Kennzahlen der Engine prüfen.
 */
export function makeAchievement(
  id: string,
  read: (stats: AchievementStats) => number,
  target: number,
  overrides: Partial<AchievementDefinition> = {},
): AchievementDefinition {
  return {
    id,
    title: `Erfolg ${id}`,
    description: 'Ein Erfolg für Tests.',
    icon: '🏅',
    tier: 'bronze',
    category: 'special',
    goldReward: 25,
    progress: (stats) => ({ current: read(stats), target }),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Phase 2b: Lebenspunkte, Rast & Urlaub, Gegenstände
// ---------------------------------------------------------------------------

const ITEM_META: Record<ItemId, { title: string; icon: string; price: number }> = {
  streakFreeze: { title: 'Streak-Schutz', icon: '❄️', price: BALANCING.items.streakFreeze.price },
  healingPotion: { title: 'Heiltrank', icon: '🧪', price: BALANCING.items.healingPotion.price },
}

/** Kauf eines Gegenstands (`kind: 'item'`) am Tag `day`, Titel/Icon/Preis wie in der Schatzkammer. */
export function makeItemPurchase(id: string, itemId: ItemId, day: DayKey, overrides: Partial<Purchase> = {}): Purchase {
  return { id, kind: 'item', itemId, ...ITEM_META[itemId], day, createdAt: 0, ...overrides }
}

/** Ruhetag bzw. Urlaub von `from` bis `until` (inklusive; Standard: ein einzelner Tag). */
export function makeRestPeriod(id: string, from: DayKey, until: DayKey = from, overrides: Partial<RestPeriod> = {}): RestPeriod {
  return { id, from, until, createdAt: 0, ...overrides }
}

/** Abgerechneter Tag (Standard: Wertung `none`, volle HP auf Level 1, Lebenspunkte aktiv). */
export function makeLedgerEntry(day: DayKey, overrides: Partial<HpLedgerEntry> = {}): HpLedgerEntry {
  return { day, score: 'none', frozen: false, hpDelta: 0, hpAfter: 50, maxHp: 50, penalties: true, ...overrides }
}


// ---------------------------------------------------------------------------
// Phase 3a: Klassen, Bosse, Truhen, Titel & Rahmen
// ---------------------------------------------------------------------------

const TEST_CLASS_IDS: HeroClassId[] = [
  'adventurer',
  'warrior', 'mage', 'druid', 'bard', 'paladin', 'warden',
  'battlemage', 'monk', 'bannerbearer', 'berserker', 'knight',
  'archmage', 'illusionist', 'healer', 'runesmith',
  'seer', 'shaman', 'templar',
  'troubadour', 'warlord',
  'sentinel',
]

/**
 * Klassen-Definitionen für Tests (unabhängig vom echten Inhalt): Namen `<id>-f`/`<id>-m`/`<id>-n`, Attribute leer –
 * welche Attribute eine Klasse hat, entscheidet ohnehin `combat/classes.ts`.
 */
export function makeClassDefinitions(): Record<HeroClassId, HeroClassDefinition> {
  const definitions = {} as Record<HeroClassId, HeroClassDefinition>
  for (const id of TEST_CLASS_IDS) {
    definitions[id] = {
      id,
      names: { female: `${id}-f`, male: `${id}-m`, neutral: `${id}-n` },
      icon: '⚔️',
      attributes: [],
      description: `Klasse ${id}.`,
    }
  }
  return definitions
}

/** Angriffsnamen für Tests: `Angriff <attribut>`. */
export const TEST_ATTACK_NAMES: Record<AttributeId, string> = Object.fromEntries(
  ATTRIBUTE_IDS.map((id) => [id, `Angriff ${id}`]),
) as Record<AttributeId, string>

/** Boss für Tests (Standard-Thema Stärke). */
export function makeBoss(id: string, theme: AttributeId = 'strength', overrides: Partial<BossDefinition> = {}): BossDefinition {
  return {
    id,
    name: `Boss ${id}`,
    icon: '👹',
    theme,
    description: 'Ein Boss für Tests.',
    defeatLine: 'Besiegt!',
    escapeLine: 'Entkommen!',
    ...overrides,
  }
}

/** Drei Bosse je Attribut (`<attribut>-1` … `<attribut>-3`) – wie der echte Inhalt. */
export function makeBossRoster(): BossDefinition[] {
  return ATTRIBUTE_IDS.flatMap((theme) => [1, 2, 3].map((n) => makeBoss(`${theme}-${n}`, theme)))
}

/** Gespeicherter Boss-Sieg (Standard: am Montag selbst, 60 HP). */
export function makeBossVictory(weekStart: DayKey, overrides: Partial<BossVictory> = {}): BossVictory {
  return { weekStart, bossId: 'strength-1', day: weekStart, maxHp: 60, ...overrides }
}

/** Gespeicherte Truhe (Standard: ungeöffnet, common, 20 Gold; Quelle aus dem ID-Präfix). */
export function makeChest(id: string, overrides: Partial<Chest> = {}): Chest {
  const prefix = id.split(':')[0]
  const source: ChestSource = prefix === 'boss' || prefix === 'chapter' || prefix === 'campaign' ? prefix : 'quest'
  return { id, source, foundDay: '2026-01-01', rarity: 'common', content: { kind: 'gold', amount: 20 }, ...overrides }
}

/** Freischaltung eines Titels/Rahmens aus einer Truhe. */
export function makeCosmeticUnlock(id: string, kind: CosmeticUnlock['kind'] = 'title', day: DayKey = '2026-01-01'): CosmeticUnlock {
  return { id, kind, day, source: 'chest' }
}

export function makeTitle(id: string, condition: CosmeticCondition, overrides: Partial<TitleDefinition> = {}): TitleDefinition {
  return {
    id,
    names: { female: `die ${id}`, male: `der ${id}`, neutral: id },
    condition,
    hint: `So bekommst du ${id}.`,
    rarity: 'common',
    ...overrides,
  }
}

export function makeFrame(id: string, condition: CosmeticCondition, overrides: Partial<FrameDefinition> = {}): FrameDefinition {
  return { id, name: `Rahmen ${id}`, condition, hint: `So bekommst du ${id}.`, rarity: 'common', colors: ['#d4a548'], ...overrides }
}


// ---------------------------------------------------------------------------
// Phase 3b: Gefährten, Endgegner
// ---------------------------------------------------------------------------

const TEST_COMPANION_SPECIES: CompanionSpecies[] = ['dragon', 'raccoon', 'snake', 'owl', 'fox']

/** Gewählter Gefährte (Standard: Fuchs „Flink“, gewählt am 2026-01-01). */
export function makeCompanionChoice(species: CompanionSpecies = 'fox', overrides: Partial<CompanionChoice> = {}): CompanionChoice {
  return { species, name: 'Flink', chosenDay: '2026-01-01', ...overrides }
}

/** Gefährten-Definitionen für Tests (unabhängig vom echten Inhalt): Stufen `<art>-0` … `<art>-3`. */
export function makeCompanionDefinitions(): Record<CompanionSpecies, CompanionDefinition> {
  const definitions = {} as Record<CompanionSpecies, CompanionDefinition>
  for (const species of TEST_COMPANION_SPECIES) {
    definitions[species] = {
      species,
      label: `Art ${species}`,
      icon: '🐾',
      stages: [0, 1, 2, 3].map((stage) => ({ name: `${species}-${stage}`, description: `Stufe ${stage}.` })),
      personality: `Persönlichkeit ${species}.`,
    }
  }
  return definitions
}

/** Endgegner für Tests. */
export function makeEndBoss(id: string, overrides: Partial<EndBossDefinition> = {}): EndBossDefinition {
  return { id, name: `Endgegner ${id}`, icon: '🐲', description: 'Ein Endgegner für Tests.', defeatLine: 'Bezwungen!', ...overrides }
}

/** Schlüssel der Endgegner laut Vertrag (Vorlage bzw. Vorlage:Pfad, dazu `custom`). */
export const END_BOSS_KEYS: readonly string[] = [
  'scholar',
  'body:strength',
  'body:endurance',
  'body:sports',
  'alchemist',
  'monk',
  'earlyRiser',
  'fortress',
  'fellowship',
  'polyglot',
  'custom',
]

/** Endgegner je Schlüssel (`end-<schlüssel>`, Doppelpunkt → Bindestrich) – wie der echte Inhalt aufgebaut. */
export function makeEndBossRoster(): Record<string, EndBossDefinition> {
  return Object.fromEntries(END_BOSS_KEYS.map((key) => [key, makeEndBoss(`end-${key.replace(':', '-')}`)]))
}
