/**
 * Phase 3a – eine von Hand gerechnete Drei-Wochen-Geschichte (plus der Montag danach), Tag für Tag mit einem
 * nachgebauten `ProgressRecorder` (speichert Erfolge, Boss-Siege und Truhen) und Öffnen wie im Repository.
 *
 * Heldin „Juna“ (Abenteuer ab Montag, 19.10.2026, Sprachform weiblich), Quests:
 * - 📖 Lesen – Intelligenz, schwer (40 XP), täglich, ab 19.10.
 * - ☎️ Familie anrufen – Charisma, mittel (20 XP), 2× pro Woche, ab 19.10.
 * - 🧘 Meditieren – Weisheit, schwer (40 XP), täglich, ab Montag 26.10.
 *
 * Attribut-Level (40 × n^1,25): Level 2 ab 40 XP, 3 ab 135, 4 ab 293, 5 ab 519, 6 ab 818.
 * Streak-Bonus +5 % je Serientag davor: schwer 40, 42, 44, 46, 48, 50, 52, 54, 56 …; mittel 20, 21, 22 …
 *
 * Woche A (19.–25.10., Abenteurerin, alle Level 1, kein Klassen-Bonus):
 *   Geplant: Lesen 7 × 40 = 280, Familie 2 × 20 = 40 → 320 → Boss-HP round(0,7 × 320) = 224.
 *   Thema Intelligenz → „Fürst der Ablenkung“; Schwäche: einziges anderes Attribut mit Plan → Charisma.
 *   Lesen Mo–Do (je 40), Familie Mi (20 × 1,5 = 30): 40, 80, 150, 190 → entkommt mit 34 HP (kostet nichts).
 *   Attribut-XP: Intelligenz 40 + 42 + 44 + 46 = 172 (Level 3), Charisma 20 (Level 1).
 * Woche B (26.10.–01.11., Magierin: Intelligenz 3 → 40 × 1,2 × 1,2 = 57,6 → 58; Meditieren 40; Familie 20):
 *   Geplant: 7 × 58 + 7 × 40 + 2 × 20 = 726 → 508 HP. Thema Intelligenz → „Vokabelvampir“, Schwäche Weisheit
 *   (Meditieren 40 × 1,5 = 60). Am Dienstag plant Juna den Freitag als Ruhetag ein: 6 × 58 + 6 × 40 + 2 × 20 = 628
 *   → 440 HP. Mo–Mi je 118 → 354; Do Lesen + Meditieren + Familie (58 + 60 + 20) → 492 ≥ 440: **Sieg am Donnerstag**.
 *   Danach nimmt sie Meditieren vom Donnerstag zurück (432 < 440) – der gespeicherte Sieg bleibt.
 *   Do lassen Familie und Meditieren eine Truhe fallen – höchstens eine pro Tag: die erste nach ID (Familie).
 *   Attribut-XP: Lesen 40, 42, 44, 46, (Fr Ruhetag – Schontag), 48, 50 = 270 → 442 (Level 4);
 *   Meditieren 40, 42, 44, (Do zurückgenommen – Serie bricht), 40, 42 = 208 (Level 3); Charisma 20 → 40 (Level 2).
 * Woche C (02.–08.11., **Erzmagierin**: Intelligenz 4 und Weisheit 3 liegen ≤ 1 auseinander, je +10 % – der Hybrid
 *   entsteht wie ohne Klassen-Trägheit; die Trägheit hält nur das Verlassen einer Klasse auf):
 *   Lesen 40 × 1,3 × 1,1 = 57,2 → 57 (gegen die Schwäche × 1,5: 85,8 → 86); Meditieren 40 × 1,2 × 1,1 = 52,8 → 53;
 *   Familie 20 × 1,1 (Charisma 2) = 22.
 *   Geplant: 7 × 57 + 7 × 53 + 2 × 22 = 814 → 570 HP. Diese Woche kommt der Boss aus dem **zweitstärksten** Thema
 *   (Boss-Vielfalt, per Hash etwa jede 4. Woche): Weisheit (371 nach Intelligenz 399) → „Grübelspinne“, Schwäche
 *   Intelligenz.
 *   Mo–Di je 86 + 53 = 139 → 278; Mi nur Lesen → 364; Fr Meditieren → 417; Sa Lesen + Familie → 525: 45 HP fehlen,
 *   Sonntag vergessen. **Montag**: Sonntag nachgetragen (Lesen +86 → 611) – besiegt am Sonntag.
 *   Attribut-XP bis Sonntag: Lesen 52, 54, 56 (Serie aus Woche B), Sa 40, So 42 → 686 (Level 5); Meditieren 44, 46,
 *   Fr 40 → 338 (Level 4); Charisma 60 (Level 2).
 * Woche D (ab 09.11.): Intelligenz 5, Weisheit 4 – sie bleibt Erzmagierin (Abstand 1, ohnehin). Thema wieder
 *   Intelligenz – nie derselbe Boss wie in der Vorwoche (hier ohnehin ein anderes Thema): „Fürst der Ablenkung“.
 *
 * Wer welcher Boss wird, welche Erledigung eine Truhe fallen lässt und was darin liegt, entscheidet der Hash
 * (Helden-Seed „2026-10-19Juna“) – die Werte unten sind dafür einmal ermittelt und so festgeschrieben (deterministisch).
 */
import { describe, expect, it } from 'vitest'
import { BALANCING } from './balancing'
import { heroSeedOf, unrecordedVictories } from './combat/boss'
import { contentOnOpen, unrecordedChests } from './combat/chests'
import { dayRange } from './dates'
import { deriveGameState } from './engine'
import { makeCompletion, makeGameData, makeHabit, makeRestPeriod, seededRandom } from './testing'
import type { AttackEvent, Chest, CosmeticUnlock, DayKey, GameData, GameState, Habit } from './types'

const START: DayKey = '2026-10-19'
const WEEK_A: DayKey = '2026-10-19'
const WEEK_B: DayKey = '2026-10-26'
const WEEK_C: DayKey = '2026-11-02'
const WEEK_D: DayKey = '2026-11-09'

const lesen = makeHabit({ id: 'lesen', title: 'Lesen', icon: '📖', attribute: 'intellect', difficulty: 'hard', createdDay: START })
const familie = makeHabit({
  id: 'familie',
  title: 'Familie anrufen',
  icon: '☎️',
  attribute: 'charisma',
  difficulty: 'medium',
  schedule: { type: 'weekly', times: 2 },
  createdDay: START,
  order: 1,
})
const meditieren = makeHabit({
  id: 'meditieren',
  title: 'Meditieren',
  icon: '🧘',
  attribute: 'wisdom',
  difficulty: 'hard',
  createdDay: WEEK_B,
  order: 2,
})

/** Lokale Mittagszeit eines Tages (für `openedAt` – in jeder Zeitzone derselbe Spieltag). */
function localNoon(day: DayKey): number {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date, 12).getTime()
}

/** Kurzform der Angriffe: [Tag, Quelle, Angriff, Schaden, Schwäche]. */
function hits(attacks: readonly AttackEvent[]): [DayKey, string, string, number, boolean][] {
  return attacks.map((attack) => [attack.day, attack.sourceId, attack.attackName, attack.damage, attack.weakness])
}

/** Was „rückwirkend“ nicht kippen darf: Klasse, Bosse, Truhen, Titel & Rahmen, Gold, Vorrat, Level. */
function snapshot(state: GameState) {
  return {
    heroClass: state.heroClass,
    bosses: state.bosses,
    chests: state.chests,
    cosmetics: state.cosmetics,
    gold: state.gold,
    inventory: state.inventory,
    level: state.level,
    attributes: state.attributes,
  }
}

/** Gleiche Daten, andere Reihenfolge (so, wie sie etwa aus der Datenbank kommen). */
function shuffled(data: GameData, seed: number): GameData {
  const random = seededRandom(seed)
  const mix = <T,>(list: T[] | undefined) => (list === undefined ? undefined : [...list].sort(() => random() - 0.5))
  const copy = structuredClone(data)
  return {
    ...copy,
    habits: mix(copy.habits) ?? [],
    completions: mix(copy.completions) ?? [],
    chests: mix(copy.chests),
    bossVictories: mix(copy.bossVictories),
    achievementUnlocks: mix(copy.achievementUnlocks),
  }
}

/** Die Heldin und ihr Verlauf – Aktionen wie in der App, `record` wie der `ProgressRecorder`. */
class Story {
  data: GameData = makeGameData({
    profile: { name: 'Juna', avatar: '🧝‍♀️', createdDay: START, form: 'female' },
    habits: [lesen, familie],
  })
  private clock = 0

  addHabit(habit: Habit): void {
    this.data = { ...this.data, habits: [...this.data.habits, habit] }
  }

  tick(habit: Habit, day: DayKey): void {
    this.data = { ...this.data, completions: [...this.data.completions, makeCompletion(habit, day, { updatedAt: ++this.clock })] }
  }

  untick(habit: Habit, day: DayKey): void {
    this.data = { ...this.data, completions: this.data.completions.filter((c) => !(c.habitId === habit.id && c.day === day)) }
  }

  rest(id: string, from: DayKey, until: DayKey = from): void {
    this.data = { ...this.data, restPeriods: [...(this.data.restPeriods ?? []), makeRestPeriod(id, from, until)] }
  }

  state(today: DayKey): GameState {
    return deriveGameState(this.data, today)
  }

  /**
   * Speichert, was der Recorder speichern würde – und prüft dabei: Speichern ändert nichts am Spielstand (nur der
   * Vorwochen-Boss verschwindet, sobald sein Sieg gespeichert ist).
   */
  record(today: DayKey): GameState {
    const before = this.state(today)
    const storedAchievements = new Set((this.data.achievementUnlocks ?? []).map((unlock) => unlock.id))
    this.data = {
      ...this.data,
      achievementUnlocks: [
        ...(this.data.achievementUnlocks ?? []),
        ...before.achievements
          .filter((achievement) => achievement.unlocked && !storedAchievements.has(achievement.definition.id))
          .map((achievement) => ({ id: achievement.definition.id, day: achievement.unlockedDay ?? today })),
      ],
      bossVictories: [
        ...(this.data.bossVictories ?? []),
        ...unrecordedVictories([before.bosses.current, before.bosses.previous], this.data.bossVictories),
      ],
      chests: [...(this.data.chests ?? []), ...structuredClone(unrecordedChests(before.chests, this.data.chests))],
    }
    const after = this.state(today)
    const expected = snapshot(before)
    if (before.bosses.previous?.defeated === true) expected.bosses = { ...before.bosses, previous: undefined }
    expect(snapshot(after), `Speichern am ${today} ändert nichts`).toEqual(JSON.parse(JSON.stringify(expected)))
    return after
  }

  /** Öffnet eine Truhe wie `openChest`: Inhalt beim Öffnen (Ersatz-Gold bei vollem Vorrat), Kosmetik freischalten. */
  open(id: string, today: DayKey): Chest {
    const state = this.state(today)
    const chest = (this.data.chests ?? []).find((entry) => entry.id === id)
    if (chest === undefined || chest.openedAt !== undefined) throw new Error(`Truhe ${id} ist nicht zu öffnen`)
    const opened: Chest = { ...chest, content: contentOnOpen(chest.content, state.inventory.streakFreezes), openedAt: localNoon(today) }
    const unlocks: CosmeticUnlock[] =
      opened.content.kind === 'cosmetic'
        ? [{ id: opened.content.cosmeticId, kind: opened.content.cosmeticKind, day: today, source: 'chest' }]
        : []
    this.data = {
      ...this.data,
      chests: (this.data.chests ?? []).map((entry) => (entry.id === id ? opened : entry)),
      cosmeticUnlocks: [...(this.data.cosmeticUnlocks ?? []), ...unlocks],
    }
    return opened
  }
}

describe('Phase 3a – Geschichte: drei Wochen mit Juna', () => {
  it('Klasse, Boss, Schaden, Ruhetag, Sieg, Nachtragen, Truhen und Gold – Tag für Tag von Hand gerechnet', () => {
    const story = new Story()
    expect(heroSeedOf(story.data.profile)).toBe('2026-10-19Juna')

    // ---------------------------------------------------------------- Woche A: Abenteurerin
    story.tick(lesen, '2026-10-19')
    let state = story.record('2026-10-19')
    expect(state.heroClass).toMatchObject({ weekStart: WEEK_A, classBonus: {} })
    expect(state.heroClass.definition.id).toBe('adventurer')
    expect(state.heroClass.definition.names.female).toBe('Abenteurerin')
    expect(state.heroClass.previousId).toBeUndefined()
    expect(state.bosses.current).toMatchObject({
      weekStart: WEEK_A,
      weekEnd: '2026-10-25',
      weakness: 'charisma',
      maxHp: 224,
      damage: 40,
      hp: 184,
      defeated: false,
      daysLeft: 7,
    })
    expect(state.bosses.current?.boss.id).toBe('prince-of-distraction')
    expect(state.bosses.current?.boss.theme).toBe('intellect')
    expect(hits(state.bosses.current?.attacks ?? [])).toEqual([['2026-10-19', 'lesen', 'Arkaner Blitz', 40, false]])

    story.tick(lesen, '2026-10-20')
    expect(story.record('2026-10-20').bosses.current).toMatchObject({ damage: 80, hp: 144, daysLeft: 6 })

    story.tick(lesen, '2026-10-21')
    story.tick(familie, '2026-10-21')
    state = story.record('2026-10-21')
    expect(state.bosses.current).toMatchObject({ damage: 150, hp: 74 })
    expect(hits(state.bosses.current?.attacks ?? []).slice(-2)).toEqual([
      ['2026-10-21', 'lesen', 'Arkaner Blitz', 40, false],
      ['2026-10-21', 'familie', 'Schlachtruf', 30, true], // 20 × 1,5 gegen die Schwäche
    ])

    story.tick(lesen, '2026-10-22')
    expect(story.record('2026-10-22').bosses.current).toMatchObject({ damage: 190, hp: 34 })
    for (const day of dayRange('2026-10-23', '2026-10-25')) story.record(day)
    state = story.state('2026-10-25')
    expect(state.bosses.current).toMatchObject({ damage: 190, hp: 34, defeated: false, daysLeft: 1 })
    expect(state.attributes.intellect).toMatchObject({ totalXp: 172, level: 3 })
    expect(state.attributes.charisma).toMatchObject({ totalXp: 20, level: 1 })
    // Mitten in der Woche erreichtes Level 3 ändert die Klasse noch nicht.
    expect(state.heroClass.definition.id).toBe('adventurer')
    // In Woche A fiel keine Truhe.
    expect(state.chests).toEqual([])

    // ---------------------------------------------------------------- Woche B: Magierin
    story.addHabit(meditieren)
    state = story.state('2026-10-26')
    expect(state.heroClass.definition.id).toBe('mage')
    expect(state.heroClass.definition.names.female).toBe('Magierin')
    expect(state.heroClass).toMatchObject({ weekStart: WEEK_B, classBonus: { intellect: 0.2 }, previousId: 'adventurer' })
    expect(state.heroClass.attributeLevels).toEqual({ strength: 1, intellect: 3, wisdom: 1, charisma: 1, vitality: 1, discipline: 1 })
    // Montag (Gnadenfrist): der entkommene Boss der Vorwoche steht noch da – ohne Strafe, ohne Sieg.
    expect(state.bosses.previous).toMatchObject({ weekStart: WEEK_A, damage: 190, hp: 34, defeated: false, daysLeft: 0 })
    expect(state.bosses.current).toMatchObject({ weekStart: WEEK_B, weakness: 'wisdom', maxHp: 508, damage: 0, hp: 508 })
    expect(state.bosses.current?.boss.id).toBe('vocab-vampire')

    story.tick(lesen, '2026-10-26')
    story.tick(meditieren, '2026-10-26')
    state = story.record('2026-10-26')
    expect(state.bosses.current).toMatchObject({ damage: 118, hp: 390, daysLeft: 7 })
    expect(hits(state.bosses.current?.attacks ?? [])).toEqual([
      ['2026-10-26', 'lesen', 'Arkaner Blitz', 58, false],
      ['2026-10-26', 'meditieren', 'Mondlicht', 60, true],
    ])
    expect(state.bosses.previous?.defeated).toBe(false)
    expect(story.data.bossVictories).toEqual([]) // entkommen: nichts gespeichert

    // Dienstag: Freitag wird Ruhetag – Boss-HP sinken sofort auf 440.
    story.rest('freitag', '2026-10-30')
    story.tick(lesen, '2026-10-27')
    story.tick(meditieren, '2026-10-27')
    state = story.record('2026-10-27')
    expect(state.bosses.previous).toBeUndefined()
    expect(state.bosses.current).toMatchObject({ maxHp: 440, damage: 236, hp: 204, daysLeft: 6 })

    story.tick(lesen, '2026-10-28')
    story.tick(meditieren, '2026-10-28')
    expect(story.record('2026-10-28').bosses.current).toMatchObject({ damage: 354, hp: 86, defeated: false })

    // Donnerstag: der Sieg – und genau eine Quest-Truhe, obwohl zwei Erledigungen eine fallen ließen.
    story.tick(lesen, '2026-10-29')
    story.tick(meditieren, '2026-10-29')
    story.tick(familie, '2026-10-29')
    const beforeRecording = story.state('2026-10-29')
    expect(beforeRecording.bosses.current).toMatchObject({ damage: 492, hp: 0, defeated: true, defeatedDay: '2026-10-29', daysLeft: 4 })
    // Truhen-Gold halbiert (Nachbesserung 3a): common 10–25.
    expect(beforeRecording.chests.map((chest) => [chest.id, chest.source, chest.foundDay, chest.rarity, chest.content])).toEqual([
      ['boss:2026-10-26', 'boss', '2026-10-29', 'rare', { kind: 'item', itemId: 'streakFreeze' }],
      ['quest:familie:2026-10-29', 'quest', '2026-10-29', 'common', { kind: 'gold', amount: 20 }],
    ])
    expect(beforeRecording.inventory).toEqual({ streakFreezes: 0, unopenedChests: 2 })
    expect(beforeRecording.cosmetics.titles).toContain('fearless') // erster Boss-Sieg
    state = story.record('2026-10-29')
    expect(story.data.bossVictories).toEqual([{ weekStart: WEEK_B, bossId: 'vocab-vampire', day: '2026-10-29', maxHp: 440 }])

    // Versehentlich abgehakt: Meditieren vom Donnerstag zurück – 432 < 440, der gespeicherte Sieg bleibt.
    const recorded = structuredClone(story.data)
    story.untick(meditieren, '2026-10-29')
    state = story.record('2026-10-29')
    expect(state.bosses.current).toMatchObject({ damage: 432, hp: 0, defeated: true, defeatedDay: '2026-10-29', maxHp: 440 })
    expect(state.chests.map((chest) => chest.id)).toEqual(['boss:2026-10-26', 'quest:familie:2026-10-29'])
    // Ohne gespeicherten Sieg wäre er wieder offen (8 HP) – es ist das Speichern, das ihn hält.
    const unrecorded = { ...story.data, bossVictories: [], chests: [] }
    expect(deriveGameState(unrecorded, '2026-10-29').bosses.current).toMatchObject({ damage: 432, hp: 8, defeated: false })
    // Und nähme sie stattdessen „Familie“ zurück: Die gespeicherte Truhe bleibt, Meditieren bringt keine zweite.
    const otherUndo = { ...recorded, completions: recorded.completions.filter((c) => c.id !== 'familie:2026-10-29') }
    expect(deriveGameState(otherUndo, '2026-10-29').chests).toEqual(state.chests)

    // Freitag Ruhetag, Wochenende weiter.
    expect(story.record('2026-10-30').restToday).toBe(true)
    for (const day of ['2026-10-31', '2026-11-01']) {
      story.tick(lesen, day)
      story.tick(meditieren, day)
      story.record(day)
    }
    state = story.state('2026-11-01')
    expect(state.bosses.current).toMatchObject({ damage: 668, hp: 0, defeated: true })
    expect(state.chests).toHaveLength(2) // am Wochenende fiel nichts
    expect(state.attributes.intellect).toMatchObject({ totalXp: 442, level: 4 })
    expect(state.attributes.wisdom).toMatchObject({ totalXp: 208, level: 3 })
    expect(state.attributes.charisma).toMatchObject({ totalXp: 40, level: 2 })

    // Sonntag: beide Truhen öffnen – 20 Gold und ein Streak-Schutz.
    const goldBefore = state.gold
    expect(story.open('quest:familie:2026-10-29', '2026-11-01').content).toEqual({ kind: 'gold', amount: 20 })
    expect(story.open('boss:2026-10-26', '2026-11-01').content).toEqual({ kind: 'item', itemId: 'streakFreeze' })
    state = story.record('2026-11-01')
    expect(state.gold).toEqual({ ...goldBefore, fromChests: 20, earned: goldBefore.earned + 20, balance: goldBefore.balance + 20 })
    expect(state.inventory).toEqual({ streakFreezes: 1, unopenedChests: 0 })

    // ---------------------------------------------------------------- Woche C: Erzmagierin
    state = story.state('2026-11-02')
    expect(state.heroClass.attributeLevels).toEqual({ strength: 1, intellect: 4, wisdom: 3, charisma: 2, vitality: 1, discipline: 1 })
    expect(state.heroClass.definition.id).toBe('archmage')
    expect(state.heroClass.definition.names.female).toBe('Erzmagierin')
    expect(state.heroClass).toMatchObject({ weekStart: WEEK_C, classBonus: { intellect: 0.1, wisdom: 0.1 }, previousId: 'mage' })
    expect(state.bosses.previous).toBeUndefined() // Vorwoche besiegt und gespeichert
    // Boss-Vielfalt: Nebenthema-Woche – der Boss kommt aus Weisheit (zweitstärkstes geplantes Attribut).
    expect(state.bosses.current).toMatchObject({ weekStart: WEEK_C, weakness: 'intellect', maxHp: 570 })
    expect(state.bosses.current?.boss.id).toBe('brooding-spider')
    expect(state.bosses.current?.boss.theme).toBe('wisdom')

    for (const day of ['2026-11-02', '2026-11-03']) {
      story.tick(lesen, day)
      story.tick(meditieren, day)
      story.record(day)
    }
    story.tick(lesen, '2026-11-04') // Mittwoch nur Lesen
    state = story.record('2026-11-04')
    expect(hits(state.bosses.current?.attacks ?? []).slice(0, 2)).toEqual([
      ['2026-11-02', 'lesen', 'Arkaner Blitz', 86, true], // 40 × 1,3 × 1,1 × 1,5 = 85,8 gegen die Schwäche
      ['2026-11-02', 'meditieren', 'Mondlicht', 53, false],
    ])
    expect(state.bosses.current).toMatchObject({ damage: 364, hp: 206 })

    story.record('2026-11-05') // Donnerstag: nichts
    story.tick(meditieren, '2026-11-06')
    state = story.record('2026-11-06')
    expect(state.bosses.current).toMatchObject({ damage: 417, hp: 153 })
    expect(state.chests.at(-1)).toMatchObject({ id: 'quest:meditieren:2026-11-06', rarity: 'common', content: { kind: 'gold', amount: 16 } })

    story.tick(lesen, '2026-11-07')
    story.tick(familie, '2026-11-07')
    state = story.record('2026-11-07')
    expect(state.bosses.current).toMatchObject({ damage: 525, hp: 45, defeated: false })
    expect(hits(state.bosses.current?.attacks ?? []).slice(-2)).toEqual([
      ['2026-11-07', 'lesen', 'Arkaner Blitz', 86, true],
      ['2026-11-07', 'familie', 'Schlachtruf', 22, false],
    ])
    expect(state.chests.at(-1)).toMatchObject({ id: 'quest:lesen:2026-11-07', rarity: 'uncommon', content: { kind: 'gold', amount: 33 } })
    story.record('2026-11-08') // Sonntag vergessen

    // ---------------------------------------------------------------- Montag: Sonntag nachtragen
    state = story.state('2026-11-09')
    expect(state.bosses.previous).toMatchObject({ weekStart: WEEK_C, damage: 525, hp: 45, defeated: false, daysLeft: 0 })
    expect(state.bosses.current?.weekStart).toBe(WEEK_D)
    // Neue Woche: Intelligenz 5, Weisheit 4 – weiter Erzmagierin (keine Wechsel-Szene).
    expect(state.heroClass.definition.id).toBe('archmage')
    expect(state.heroClass.attributeLevels).toMatchObject({ intellect: 5, wisdom: 4, charisma: 2 })
    expect(state.heroClass.previousId).toBeUndefined()
    // Wieder das Thema Intelligenz – und nie derselbe Boss wie in der Vorwoche.
    expect(state.bosses.current?.boss.id).toBe('prince-of-distraction')
    expect(state.bosses.current?.boss.id).not.toBe(state.bosses.previous?.boss.id)

    story.tick(lesen, '2026-11-08') // nachgetragen
    story.tick(familie, '2026-11-09')
    const backfilled = story.state('2026-11-09')
    expect(backfilled.bosses.previous).toMatchObject({ damage: 611, hp: 0, defeated: true, defeatedDay: '2026-11-08' })
    expect(backfilled.cosmetics.titles).not.toContain('well-read') // der Bücherwurm-Golem kam diesmal nicht
    state = story.record('2026-11-09')
    expect(state.bosses.previous).toBeUndefined() // gespeichert → die Vorwoche ist erledigt
    expect(story.data.bossVictories?.at(-1)).toEqual({ weekStart: WEEK_C, bossId: 'brooding-spider', day: '2026-11-08', maxHp: 570 })
    expect(state.cosmetics.titles).toEqual(expect.arrayContaining(['daring', 'fearless']))
    expect(state.attributes.intellect).toMatchObject({ totalXp: 686, level: 5 })
    expect(state.attributes.wisdom).toMatchObject({ totalXp: 338, level: 4 })

    // Alle Truhen der Geschichte – je Fund genau eine, gespeichert und unverändert.
    expect(state.chests.map((chest) => [chest.id, chest.foundDay, chest.rarity, chest.content, chest.openedAt !== undefined])).toEqual([
      ['boss:2026-10-26', '2026-10-29', 'rare', { kind: 'item', itemId: 'streakFreeze' }, true],
      ['quest:familie:2026-10-29', '2026-10-29', 'common', { kind: 'gold', amount: 20 }, true],
      ['quest:meditieren:2026-11-06', '2026-11-06', 'common', { kind: 'gold', amount: 16 }, false],
      ['quest:lesen:2026-11-07', '2026-11-07', 'uncommon', { kind: 'gold', amount: 33 }, false],
      ['boss:2026-11-02', '2026-11-08', 'common', { kind: 'gold', amount: 13 }, false],
      ['quest:familie:2026-11-09', '2026-11-09', 'common', { kind: 'gold', amount: 19 }, false],
    ])
    expect(state.chests).toEqual(story.data.chests?.slice().sort((a, b) => a.foundDay.localeCompare(b.foundDay) || a.id.localeCompare(b.id)))
    expect(state.inventory).toEqual({ streakFreezes: 1, unopenedChests: 4 })

    // Gold: XP + Erfolge + Truhen (nur geöffnete); nichts ausgegeben.
    for (const id of ['quest:meditieren:2026-11-06', 'quest:lesen:2026-11-07', 'boss:2026-11-02', 'quest:familie:2026-11-09']) {
      story.open(id, '2026-11-09')
    }
    state = story.record('2026-11-09')
    expect(state.gold.fromChests).toBe(20 + 16 + 33 + 13 + 19)
    expect(state.gold.fromXp).toBe(Math.floor(state.level.totalXp * BALANCING.goldPerXp))
    expect(state.gold.earned).toBe(state.gold.fromXp + state.gold.fromAchievements + state.gold.fromChests)
    expect(state.gold.balance).toBe(state.gold.earned)
    expect(state.inventory).toEqual({ streakFreezes: 1, unopenedChests: 0 })

    // ---------------------------------------------------------------- Neu laden: dieselben Daten → derselbe Stand
    for (const seed of [1, 2, 3]) {
      expect(snapshot(deriveGameState(shuffled(story.data, seed), '2026-11-09'))).toEqual(snapshot(state))
    }
    // Ein späterer Blick auf vergangene Tage sieht dieselben gespeicherten Truhen und Siege.
    const later = deriveGameState(story.data, '2026-11-20')
    expect(later.chests).toEqual(state.chests)
    expect(later.cosmetics.titles).toEqual(expect.arrayContaining(['fearless']))
  })
})
