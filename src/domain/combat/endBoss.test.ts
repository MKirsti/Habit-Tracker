import { describe, expect, it } from 'vitest'
import { END_BOSS_KEYS, makeChapter, makeEndBossRoster, makeMainQuest } from '../testing'
import type { ChapterState, MainQuest } from '../types'
import { CUSTOM_END_BOSS_KEY, endBossById, endBossDefinition, endBossKeys, endBossState } from './endBoss'
import { END_BOSSES } from './endBosses'

const ROSTER = makeEndBossRoster()

function chapterState(id: string, overrides: Partial<ChapterState> = {}): ChapterState {
  const done = overrides.done ?? false
  return {
    chapter: makeChapter({ id, criterion: { type: 'manual' } }),
    current: done ? 1 : 0,
    target: 1,
    progress: done ? 1 : 0,
    done,
    ...overrides,
  }
}

function quest(blueprint?: MainQuest['blueprint']): MainQuest {
  return makeMainQuest(blueprint === undefined ? { id: 'q' } : { id: 'q', blueprint })
}

describe('Welcher Endgegner?', () => {
  it('Vorlage mit Pfad → <vorlage>:<pfad>, sonst die Vorlage, zuletzt custom', () => {
    expect(endBossKeys({ blueprint: { id: 'body', level: 'beginner', pathId: 'endurance' } })).toEqual(['body:endurance', 'body', 'custom'])
    expect(endBossKeys({ blueprint: { id: 'scholar', level: 'advanced' } })).toEqual(['scholar', 'custom'])
    expect(endBossKeys({})).toEqual([CUSTOM_END_BOSS_KEY])
  })

  it('jede Vorlage und jeder Pfad hat seinen Endgegner; eigene Kampagnen und Unbekanntes den allgemeinen', () => {
    expect(endBossDefinition(quest({ id: 'body', level: 'beginner', pathId: 'sports' }), ROSTER).id).toBe('end-body-sports')
    expect(endBossDefinition(quest({ id: 'polyglot', level: 'beginner' }), ROSTER).id).toBe('end-polyglot')
    expect(endBossDefinition(quest({ id: 'earlyRiser', level: 'advanced' }), ROSTER).id).toBe('end-earlyRiser')
    expect(endBossDefinition(quest(), ROSTER).id).toBe('end-custom')
    expect(endBossDefinition(quest({ id: 'unbekannt', level: 'beginner', pathId: 'x' }), ROSTER).id).toBe('end-custom')
    // Pfad unbekannt: zurück auf den allgemeinen (body selbst hat keinen eigenen Schlüssel).
    expect(endBossDefinition(quest({ id: 'body', level: 'beginner', pathId: 'yoga' }), ROSTER).id).toBe('end-custom')
  })

  it('kennt der Inhalt gar nichts, gibt es einen Notfall-Endgegner statt eines Absturzes', () => {
    const fallback = endBossDefinition(quest({ id: 'scholar', level: 'beginner' }), {})
    expect(fallback.name.trim()).not.toBe('')
    expect(fallback.defeatLine.trim()).not.toBe('')
  })

  it('endBossById findet den Endgegner nach ID', () => {
    expect(endBossById('end-monk', ROSTER)?.id).toBe('end-monk')
    expect(endBossById('gibt-es-nicht', ROSTER)).toBeUndefined()
  })
})

describe('endBossState – das letzte Kapitel ist der Endgegner', () => {
  it('ohne Kapitel kein Endgegner', () => {
    expect(endBossState(quest(), [], ROSTER)).toBeUndefined()
  })

  it('erst angekündigt, erwacht, sobald alle anderen Kapitel erledigt sind (Reihenfolge der Kapitel)', () => {
    const open = [chapterState('c1', { done: true }), chapterState('c2'), chapterState('boss')]
    expect(endBossState(quest(), open, ROSTER)).toMatchObject({ chapterId: 'boss', awakened: false, defeated: false })
    const ready = [chapterState('c1', { done: true }), chapterState('c2', { done: true }), chapterState('boss')]
    expect(endBossState(quest(), ready, ROSTER)).toMatchObject({ chapterId: 'boss', awakened: true, maxHp: 1, hp: 1, defeated: false })
  })

  it('nur ein Kapitel: sofort erwacht', () => {
    expect(endBossState(quest(), [chapterState('only')], ROSTER)).toMatchObject({ awakened: true, hp: 1 })
  })

  it('Manuell: 1 bzw. 0 HP; erledigt → besiegt', () => {
    const defeated = endBossState(quest(), [chapterState('c1', { done: true }), chapterState('boss', { done: true })], ROSTER)
    expect(defeated).toMatchObject({ awakened: true, maxHp: 1, hp: 0, defeated: true })
  })

  it('HP = Ziel − Fortschritt (Zähler, Quest-Kennzahlen), nie unter 0', () => {
    const counting = chapterState('boss', { current: 7, target: 30, progress: 7 / 30 })
    expect(endBossState(quest(), [counting], ROSTER)).toMatchObject({ maxHp: 30, hp: 23, defeated: false })
    const over = chapterState('boss', { current: 35, target: 30, progress: 1, done: true })
    expect(endBossState(quest(), [over], ROSTER)).toMatchObject({ maxHp: 30, hp: 0, defeated: true })
    const fractional = chapterState('boss', { current: 29.7, target: 30, progress: 0.99 })
    expect(endBossState(quest(), [fractional], ROSTER)?.hp).toBeCloseTo(0.3, 9)
    const noise = chapterState('boss', { current: 30 - 1e-12, target: 30, progress: 1 })
    expect(endBossState(quest(), [noise], ROSTER)?.hp).toBe(0)
  })

  it('besiegt heißt besiegt – auch wenn der Endgegner vor den anderen Kapiteln fiel (noch nicht erwacht)', () => {
    const early = endBossState(quest(), [chapterState('c1'), chapterState('boss', { done: true })], ROSTER)
    expect(early).toMatchObject({ awakened: false, defeated: true, hp: 0 })
  })

  it('kaputte Ziele: mindestens 1 HP, kaputter Fortschritt zählt als 0', () => {
    const broken = chapterState('boss', { current: Number.NaN, target: Number.NaN, progress: 0 })
    expect(endBossState(quest(), [broken], ROSTER)).toMatchObject({ maxHp: 1, hp: 1 })
  })
})

describe('END_BOSSES (Inhalt) passt zum Vertrag', () => {
  it('ein Endgegner je Vorlage/Pfad und ein allgemeiner; IDs eindeutig, Texte gefüllt', () => {
    const ids = new Set<string>()
    for (const key of END_BOSS_KEYS) {
      const definition = END_BOSSES[key]
      expect(definition, key).toBeDefined()
      expect(definition.name.trim(), key).not.toBe('')
      expect(definition.icon.trim(), key).not.toBe('')
      expect(definition.defeatLine.trim(), key).not.toBe('')
      ids.add(definition.id)
    }
    expect(ids.size).toBe(END_BOSS_KEYS.length)
  })
})
