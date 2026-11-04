/**
 * Beutetruhen (Phase 3a, ARCHITECTURE.md „Truhen“) – rein und deterministisch.
 *
 * Fundorte (IDs sind deterministisch, so ergibt Abhaken → Zurücknehmen → wieder Abhaken dieselbe Truhe):
 * - **Boss-Truhe** `boss:<weekStart>` je Boss-Sieg (foundDay = Tag des Siegs).
 * - **Quest-Truhe** `quest:<completion.id>`: je Tag die erledigten Quest-Erledigungen (nach `id` sortiert); die erste
 *   mit `hash(heroSeed + ':' + completion.id) < questDropChance` (10 %) liefert eine Truhe – höchstens
 *   `maxQuestChestsPerDay` (1) pro Tag **inklusive** schon gespeicherter Quest-Truhen dieses Tages.
 * - **Kapitel-Truhe** `chapter:<questId>:<chapterId>` je abgeschlossenem Kapitel mit `doneDay`.
 *
 * Inhalt (festgelegt beim **Fund**, gespeicherte Truhen ändern sich nie): Seltenheit per `hash(key + ':rarity')` mit
 * `key = chestRollKey(heroSeed, id)` = `heroSeed + ':' + id` gegen `rarityWeights` (70/22/7/1) – der Helden-Seed gehört
 * dazu, weil die ID einer Boss-Truhe (`boss:<weekStart>`) für jeden Helden gleich ist: Ohne ihn bekämen zwei Helden
 * (etwa auf zwei Handys) jede Woche dieselbe Boss-Beute. common/uncommon Gold gleichverteilt im Bereich (per Hash);
 * rare 50 % Streak-Schutz / 50 % ein noch nicht freigeschalteter Truhen-Rahmen der Seltenheit rare (sonst 100 Gold); legendary ein noch nicht
 * freigeschalteter Truhen-Titel oder -Rahmen der Seltenheit legendary (sonst 150 Gold). „Noch nicht freigeschaltet“
 * heißt: weder freigeschaltet noch schon in einer anderen Truhe versprochen – so liegt nie zweimal dasselbe darin.
 *
 * **Fenster:** Neu gefunden werden Quest- und Kapitel-Truhen nur ab `chestWindowStart(today)` – dem Montag der Woche
 * von gestern (dieselben Wochen wie die Bosse: die laufende und, solange gestern nachgetragen werden kann, die
 * vorige). Ältere Tage lassen sich ohnehin nicht mehr ändern; ihre Truhen sind längst gespeichert. So beschert das
 * Update keinen Berg rückwirkender Truhen aus dem ganzen bisherigen Verlauf (Bosse gibt es rückwirkend ja auch nicht).
 */
import { BALANCING } from '../balancing'
import { addDays, compareDays, isValidDayKey, startOfWeek } from '../dates'
import { isDone } from '../schedule'
import type {
  BossVictory,
  Chest,
  ChestContent,
  ChestRarity,
  ChestSource,
  Completion,
  DayKey,
  FrameDefinition,
  TitleDefinition,
} from '../types'
import { FRAMES, TITLES } from './cosmeticDefinitions'
import { hashUnit, rendezvousPick } from './hash'

/** Gold einer rare-Truhe, wenn kein Truhen-Rahmen mehr frei ist. */
export const RARE_FALLBACK_GOLD = 100
/** Gold einer legendary-Truhe, wenn kein Truhen-Titel/-Rahmen mehr frei ist. */
export const LEGENDARY_FALLBACK_GOLD = 150

export const CHEST_RARITIES: readonly ChestRarity[] = ['common', 'uncommon', 'rare', 'legendary']

// ---------------------------------------------------------------------------
// IDs & Fenster
// ---------------------------------------------------------------------------

export function bossChestId(weekStart: DayKey): string {
  return `boss:${weekStart}`
}

export function questChestId(completionId: string): string {
  return `quest:${completionId}`
}

export function chapterChestId(questId: string, chapterId: string): string {
  return `chapter:${questId}:${chapterId}`
}

/** Erster Tag, für den Quest- und Kapitel-Truhen neu gefunden werden: Montag der Woche von gestern. */
export function chestWindowStart(today: DayKey): DayKey {
  return startOfWeek(addDays(today, -BALANCING.backfillDays))
}

// ---------------------------------------------------------------------------
// Fund & Inhalt
// ---------------------------------------------------------------------------

/** Lässt diese Erledigung eine Truhe fallen? `hash(heroSeed + ':' + completionId) < questDropChance`. */
export function isQuestDrop(heroSeed: string, completionId: string): boolean {
  return hashUnit(`${heroSeed}:${completionId}`) < BALANCING.chests.questDropChance
}

/**
 * Schlüssel, aus dem Seltenheit und Inhalt einer neu gefundenen Truhe gewürfelt werden: `heroSeed + ':' + id`. Die IDs
 * von Boss-Truhen sind für alle Helden gleich (`boss:<weekStart>`) – erst der Seed macht die Beute je Held verschieden.
 */
export function chestRollKey(heroSeed: string, id: string): string {
  return `${heroSeed}:${id}`
}

/**
 * Seltenheit: `hash(key + ':rarity')` gegen die Gewichte (common 70 · uncommon 22 · rare 7 · legendary 1).
 * @param key Würfel-Schlüssel der Truhe (`chestRollKey`); `findChests` übergibt ihn so.
 */
export function chestRarity(key: string): ChestRarity {
  const weights = BALANCING.chests.rarityWeights
  const total = CHEST_RARITIES.reduce((sum, rarity) => sum + weights[rarity], 0)
  const roll = hashUnit(`${key}:rarity`) * total
  let cumulative = 0
  for (const rarity of CHEST_RARITIES) {
    cumulative += weights[rarity]
    if (roll < cumulative) return rarity
  }
  return 'common'
}

/** Gold einer common-/uncommon-Truhe: gleichverteilt in `[min, max]` (beide inklusive) per `hash(id + ':gold')`. */
export function chestGoldAmount(id: string, rarity: 'common' | 'uncommon'): number {
  const [min, max] = BALANCING.chests.gold[rarity]
  return min + Math.min(max - min, Math.floor(hashUnit(`${id}:gold`) * (max - min + 1)))
}

/** Eine Kosmetik, wie sie in einer Truhe liegen kann. */
export interface CosmeticRef {
  kind: 'title' | 'frame'
  id: string
}

function cosmeticKey(ref: CosmeticRef): string {
  return `${ref.kind}:${ref.id}`
}

export interface ChestContentContext {
  /** Schon vergeben: freigeschaltete Titel/Rahmen und solche, die in anderen Truhen liegen (`cosmeticKey`-Form). */
  taken: ReadonlySet<string>
  titles?: readonly TitleDefinition[]
  frames?: readonly FrameDefinition[]
}

/** Truhen-Kosmetik (Bedingung `chest`) der Seltenheit, die noch zu haben ist (Titel vor Rahmen, Definitionsreihenfolge). */
function availableCosmetics(rarity: ChestRarity, context: ChestContentContext, kinds: readonly CosmeticRef['kind'][]): CosmeticRef[] {
  const result: CosmeticRef[] = []
  if (kinds.includes('title')) {
    for (const title of context.titles ?? TITLES) {
      const ref: CosmeticRef = { kind: 'title', id: title.id }
      if (title.condition.type === 'chest' && title.rarity === rarity && !context.taken.has(cosmeticKey(ref))) result.push(ref)
    }
  }
  if (kinds.includes('frame')) {
    for (const frame of context.frames ?? FRAMES) {
      const ref: CosmeticRef = { kind: 'frame', id: frame.id }
      if (frame.condition.type === 'chest' && frame.rarity === rarity && !context.taken.has(cosmeticKey(ref))) result.push(ref)
    }
  }
  return result
}

function pickCosmetic(id: string, candidates: readonly CosmeticRef[]): ChestContent | undefined {
  const picked = rendezvousPick(candidates, `${id}:pick`, cosmeticKey)
  return picked === undefined ? undefined : { kind: 'cosmetic', cosmeticKind: picked.kind, cosmeticId: picked.id }
}

/**
 * Inhalt einer Truhe dieser Seltenheit (Regeln siehe Dateikopf).
 * @param id Würfel-Schlüssel der Truhe (`chestRollKey(heroSeed, chest.id)` – so übergibt ihn `findChests`).
 */
export function chestContent(id: string, rarity: ChestRarity, context: ChestContentContext): ChestContent {
  switch (rarity) {
    case 'common':
    case 'uncommon':
      return { kind: 'gold', amount: chestGoldAmount(id, rarity) }
    case 'rare':
      if (hashUnit(`${id}:rare`) < 0.5) return { kind: 'item', itemId: 'streakFreeze' }
      return pickCosmetic(id, availableCosmetics('rare', context, ['frame'])) ?? { kind: 'gold', amount: RARE_FALLBACK_GOLD }
    case 'legendary':
      return (
        pickCosmetic(id, availableCosmetics('legendary', context, ['title', 'frame'])) ?? {
          kind: 'gold',
          amount: LEGENDARY_FALLBACK_GOLD,
        }
      )
    default:
      return { kind: 'gold', amount: chestGoldAmount(id, 'common') }
  }
}

/** Die Kosmetik in einer Truhe, falls sie eine enthält. */
export function chestCosmetic(chest: Pick<Chest, 'content'>): CosmeticRef | undefined {
  const content = chest.content
  return content?.kind === 'cosmetic' ? { kind: content.cosmeticKind, id: content.cosmeticId } : undefined
}

// ---------------------------------------------------------------------------
// Alle Truhen
// ---------------------------------------------------------------------------

/** Ein abgeschlossenes Kapitel (für Kapitel-Truhen). */
export interface CompletedChapter {
  questId: string
  chapterId: string
  doneDay?: DayKey
}

export interface FindChestsInput {
  heroSeed: string
  today: DayKey
  /** Erster Tag für neue Quest- und Kapitel-Truhen (Standard: `chestWindowStart(today)`). */
  from?: DayKey
  /** Quest-Erledigungen (nur erledigte zählen; Tage außerhalb `from … today` werden ignoriert). */
  completions: Iterable<Pick<Completion, 'id' | 'day' | 'value' | 'target'>>
  /** Boss-Siege: gespeicherte und gerade abgeleitete (je Woche eine Truhe). */
  victories: readonly Pick<BossVictory, 'weekStart' | 'day'>[]
  chapters: readonly CompletedChapter[]
  /** Gespeicherte Truhen – bleiben genau so, wie sie sind. */
  stored: readonly Chest[] | undefined
  /** Schon freigeschaltete Titel/Rahmen (IDs), damit eine neue Truhe nichts Doppeltes bringt. */
  unlocked: { titles: readonly string[]; frames: readonly string[] }
  titles?: readonly TitleDefinition[]
  frames?: readonly FrameDefinition[]
}

function compareChests(a: Pick<Chest, 'foundDay' | 'id'>, b: Pick<Chest, 'foundDay' | 'id'>): number {
  return compareDays(a.foundDay, b.foundDay) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/** Gespeicherte Truhen mit gültiger ID, je ID die erste. */
export function storedChests(stored: readonly Chest[] | undefined): Chest[] {
  const seen = new Set<string>()
  const result: Chest[] = []
  for (const chest of stored ?? []) {
    if (typeof chest.id !== 'string' || chest.id === '' || seen.has(chest.id)) continue
    seen.add(chest.id)
    result.push(chest)
  }
  return result
}

/**
 * `GameState.chests`: alle gespeicherten Truhen (unverändert) plus die neu gefundenen, noch nicht gespeicherten –
 * sortiert nach Fundtag, dann ID. Neue Truhen bekommen ihren Inhalt hier (in dieser Reihenfolge, jede Kosmetik höchstens
 * einmal); der Recorder speichert sie, danach ändern sie sich nie mehr.
 */
export function findChests(input: FindChestsInput): Chest[] {
  const stored = storedChests(input.stored)
  const storedIds = new Set(stored.map((chest) => chest.id))
  const from = input.from ?? chestWindowStart(input.today)
  const inWindow = (day: DayKey | undefined): day is DayKey =>
    day !== undefined && isValidDayKey(day) && compareDays(day, from) >= 0 && compareDays(day, input.today) <= 0

  const finds: { id: string; source: ChestSource; foundDay: DayKey }[] = []
  const addFind = (id: string, source: ChestSource, foundDay: DayKey) => {
    if (storedIds.has(id) || finds.some((find) => find.id === id)) return
    finds.push({ id, source, foundDay })
  }

  // Boss-Truhen: je Sieg eine (auch für gespeicherte Siege ohne gespeicherte Truhe).
  for (const victory of input.victories) {
    if (!isValidDayKey(victory.weekStart) || !isValidDayKey(victory.day)) continue
    addFind(bossChestId(victory.weekStart), 'boss', victory.day)
  }

  // Quest-Truhen: je Tag höchstens maxQuestChestsPerDay, gespeicherte des Tages eingerechnet.
  const doneByDay = new Map<DayKey, string[]>()
  for (const completion of input.completions) {
    if (!inWindow(completion.day) || !isDone(completion)) continue
    let ids = doneByDay.get(completion.day)
    if (ids === undefined) doneByDay.set(completion.day, (ids = []))
    ids.push(completion.id)
  }
  const storedQuestChestsByDay = new Map<DayKey, number>()
  for (const chest of stored) {
    if (chest.source === 'quest') storedQuestChestsByDay.set(chest.foundDay, (storedQuestChestsByDay.get(chest.foundDay) ?? 0) + 1)
  }
  for (const [day, ids] of doneByDay) {
    let remaining = BALANCING.chests.maxQuestChestsPerDay - (storedQuestChestsByDay.get(day) ?? 0)
    if (remaining <= 0) continue
    for (const completionId of [...ids].sort()) {
      if (remaining <= 0) break
      const id = questChestId(completionId)
      if (storedIds.has(id) || !isQuestDrop(input.heroSeed, completionId)) continue
      addFind(id, 'quest', day)
      remaining--
    }
  }

  // Kapitel-Truhen.
  for (const chapter of input.chapters) {
    if (!inWindow(chapter.doneDay)) continue
    addFind(chapterChestId(chapter.questId, chapter.chapterId), 'chapter', chapter.doneDay)
  }

  // Inhalt der neuen Truhen – chronologisch, jede Kosmetik höchstens einmal.
  const taken = new Set<string>([
    ...input.unlocked.titles.map((id) => cosmeticKey({ kind: 'title', id })),
    ...input.unlocked.frames.map((id) => cosmeticKey({ kind: 'frame', id })),
  ])
  for (const chest of stored) {
    const cosmetic = chestCosmetic(chest)
    if (cosmetic !== undefined) taken.add(cosmeticKey(cosmetic))
  }
  const context: ChestContentContext = { taken, titles: input.titles, frames: input.frames }
  const found: Chest[] = []
  for (const find of finds.sort(compareChests)) {
    const key = chestRollKey(input.heroSeed, find.id)
    const rarity = chestRarity(key)
    const content = chestContent(key, rarity, context)
    if (content.kind === 'cosmetic') taken.add(cosmeticKey({ kind: content.cosmeticKind, id: content.cosmeticId }))
    found.push({ ...find, rarity, content })
  }
  return [...stored, ...found].sort(compareChests)
}

/**
 * Neu gefundene, noch nicht gespeicherte Truhen (`GameState.chests` minus die gespeicherten) – speichert der Recorder
 * (`recordProgress({ chests })`), danach ändern sie sich nie mehr.
 */
export function unrecordedChests(chests: readonly Chest[], stored: readonly Chest[] | undefined): Chest[] {
  const known = new Set((stored ?? []).map((chest) => chest.id))
  return chests.filter((chest) => !known.has(chest.id))
}

/**
 * Inhalt beim **Öffnen** (für `openChest` im Repository): Ein Streak-Schutz, der den vollen Vorrat
 * (`items.streakFreeze.max`) überschreiten würde, wird zu `freezeFallbackGold` – das Repository speichert genau
 * diesen Inhalt, damit die Entscheidung beim Öffnen für immer gilt. Alles andere bleibt, wie es ist.
 * @param streakFreezes Vorrat vor dem Öffnen (`GameState.inventory.streakFreezes`).
 */
export function contentOnOpen(content: ChestContent, streakFreezes: number): ChestContent {
  if (content.kind === 'item' && content.itemId === 'streakFreeze' && streakFreezes >= BALANCING.items.streakFreeze.max) {
    return { kind: 'gold', amount: BALANCING.chests.freezeFallbackGold }
  }
  return content
}

// ---------------------------------------------------------------------------
// Geöffnete Truhen: Gold, Streak-Schutz, Kosmetik
// ---------------------------------------------------------------------------

/** Geöffnet = `openedAt` ist gesetzt. */
export function isChestOpened(chest: Pick<Chest, 'openedAt'>): boolean {
  return typeof chest.openedAt === 'number' && Number.isFinite(chest.openedAt)
}

/** `gold.fromChests`: Gold aller **geöffneten** Truhen (ungültige/negative Beträge zählen nicht). */
export function chestGold(chests: readonly Chest[] | undefined): number {
  let gold = 0
  for (const chest of chests ?? []) {
    if (!isChestOpened(chest) || chest.content?.kind !== 'gold') continue
    const amount = chest.content.amount
    if (Number.isFinite(amount) && amount > 0) gold += amount
  }
  return gold
}

/** Geöffnete Truhen, die einen Streak-Schutz enthielten (der Ersatz bei vollem Vorrat steht als Gold im Inhalt). */
export function openedFreezeChests(chests: readonly Chest[] | undefined): Chest[] {
  return (chests ?? []).filter(
    (chest) => isChestOpened(chest) && chest.content?.kind === 'item' && chest.content.itemId === 'streakFreeze',
  )
}

/** Gefundene, noch ungeöffnete Truhen. */
export function unopenedChestCount(chests: readonly Chest[]): number {
  return chests.reduce((count, chest) => count + (isChestOpened(chest) ? 0 : 1), 0)
}

/** Kosmetik aus geöffneten Truhen (zählt als freigeschaltet, auch falls der `CosmeticUnlock` fehlen sollte). */
export function openedChestCosmetics(chests: readonly Chest[] | undefined): CosmeticRef[] {
  const result: CosmeticRef[] = []
  for (const chest of chests ?? []) {
    const cosmetic = chestCosmetic(chest)
    if (cosmetic !== undefined && isChestOpened(chest)) result.push(cosmetic)
  }
  return result
}
