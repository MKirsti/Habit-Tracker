import { describe, expect, it } from 'vitest'
import { deriveGameState } from '../../domain/engine'
import { completeRange, makeChapter, makeGameData, makeHabit, makeMainQuest } from '../../domain/testing'
import type { Chapter, GameData, MainQuest } from '../../domain/types'
import { campaignEditLoss, campaignEditLossText as rawLossText } from './campaignXp'
import type { CampaignEditLoss } from './campaignXp'

/** Text mit normalen Leerzeichen (der echte nutzt geschützte vor „XP“). */
function campaignEditLossText(loss: CampaignEditLoss): string {
  return rawLossText(loss).replaceAll('\u00a0', ' ')
}

const TODAY = '2026-11-03'
const reading = makeHabit({ id: 'read', title: 'Lesen', createdDay: '2026-10-01' })

/** „Drei Tage“: 3 Erledigungen ab Start – erreicht mit 29.–31. Oktober. */
const THREE_DAYS: Chapter = makeChapter({
  id: 'three',
  title: 'Drei Tage',
  criterion: { type: 'habit', habitId: 'read', metric: 'completions', target: 3 },
})
const FIRST_BOOK: Chapter = makeChapter({ id: 'book', title: 'Erstes Buch', criterion: { type: 'manual' } })
const COUNTER_DONE: Chapter = makeChapter({
  id: 'books',
  title: 'Drei Bücher',
  criterion: { type: 'counter', target: 3, label: 'Bücher beendet' },
  counter: 3,
  completedDay: '2026-11-01',
})

function setup(chapters: Chapter[]): { data: GameData; quest: MainQuest } {
  const quest = makeMainQuest({ id: 'mq', title: 'Der Weg des Gelehrten', startDay: '2026-10-29', chapters })
  const data = makeGameData({
    profile: { name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' },
    habits: [reading],
    completions: completeRange(reading, '2026-10-29', '2026-10-31'),
    mainQuests: [quest],
  })
  return { data, quest }
}

/** Tatsächlicher Rückgang der Gesamt-XP, wenn die Kampagne so gespeichert würde. */
function actualDrop(data: GameData, patched: MainQuest): number {
  const after = { ...data, mainQuests: data.mainQuests.map((quest) => (quest.id === patched.id ? patched : quest)) }
  return deriveGameState(data, TODAY).level.totalXp - deriveGameState(after, TODAY).level.totalXp
}

describe('campaignEditLoss', () => {
  it('erkennt einen späteren Start, der ein Quest-Ziel (und die gemeisterte Kampagne) kippt', () => {
    const { data, quest } = setup([THREE_DAYS])
    const patched = { ...quest, startDay: '2026-10-30' }
    const loss = campaignEditLoss(data, TODAY, quest.id, patched)
    expect(loss).toEqual({ xp: 600, chapters: ['Drei Tage'], removedChapters: [], campaignBonusLost: true })
    expect(loss.xp).toBe(actualDrop(data, patched))
  })

  it('erkennt ein erhöhtes Ziel bei einem abgeschlossenen Kapitel', () => {
    const { data, quest } = setup([THREE_DAYS, FIRST_BOOK])
    const raised: Chapter = { ...THREE_DAYS, criterion: { ...THREE_DAYS.criterion, target: 5 } as Chapter['criterion'] }
    const patched = { ...quest, chapters: [raised, FIRST_BOOK] }
    const loss = campaignEditLoss(data, TODAY, quest.id, patched)
    expect(loss).toEqual({ xp: 100, chapters: ['Drei Tage'], removedChapters: [], campaignBonusLost: false })
    expect(loss.xp).toBe(actualDrop(data, patched))
  })

  it('erkennt ein erhöhtes Zähler-Ziel', () => {
    const { data, quest } = setup([COUNTER_DONE, FIRST_BOOK])
    const raised: Chapter = { ...COUNTER_DONE, criterion: { type: 'counter', target: 12, label: 'Bücher beendet' } }
    const loss = campaignEditLoss(data, TODAY, quest.id, { ...quest, chapters: [raised, FIRST_BOOK] })
    expect(loss).toMatchObject({ xp: 100, chapters: ['Drei Bücher'] })
  })

  it('zählt entfernte abgeschlossene Kapitel mit', () => {
    const { data, quest } = setup([THREE_DAYS, FIRST_BOOK])
    const patched = { ...quest, chapters: [FIRST_BOOK] }
    const loss = campaignEditLoss(data, TODAY, quest.id, patched)
    expect(loss).toEqual({ xp: 100, chapters: [], removedChapters: ['Drei Tage'], campaignBonusLost: false })
    expect(loss.xp).toBe(actualDrop(data, patched))
  })

  it('meldet nichts, wenn die Änderung keine XP kostet', () => {
    const { data, quest } = setup([THREE_DAYS, FIRST_BOOK])
    // Titel, Zieldatum, früherer Start, gesenktes Ziel, neue Reihenfolge – alles harmlos.
    const lowered: Chapter = { ...THREE_DAYS, criterion: { ...THREE_DAYS.criterion, target: 2 } as Chapter['criterion'] }
    const patched: MainQuest = {
      ...quest,
      title: 'Neuer Titel',
      deadline: '2027-01-01',
      startDay: '2026-10-01',
      chapters: [FIRST_BOOK, lowered],
    }
    expect(campaignEditLoss(data, TODAY, quest.id, patched)).toEqual({
      xp: 0,
      chapters: [],
      removedChapters: [],
      campaignBonusLost: false,
    })
  })

  it('rechnet netto (wie der Level-Stand), nennt aber jedes Kapitel, das seinen Abschluss verliert', () => {
    const { data, quest } = setup([THREE_DAYS, FIRST_BOOK])
    // „Drei Tage“ kippt (−100), „Erstes Buch“ wird stattdessen abgehakt (+100): netto kein XP-Verlust.
    const raised: Chapter = { ...THREE_DAYS, criterion: { ...THREE_DAYS.criterion, target: 5 } as Chapter['criterion'] }
    const patched = { ...quest, chapters: [raised, { ...FIRST_BOOK, manualDone: true, completedDay: TODAY }] }
    const loss = campaignEditLoss(data, TODAY, quest.id, patched)
    expect(loss.xp).toBe(0)
    expect(loss.chapters).toEqual(['Drei Tage'])
  })

  it('liefert für eine unbekannte Kampagne keinen Verlust', () => {
    const { data, quest } = setup([THREE_DAYS])
    expect(campaignEditLoss(data, TODAY, 'gibt-es-nicht', { ...quest, id: 'gibt-es-nicht' }).xp).toBe(0)
  })
})

describe('campaignEditLossText', () => {
  it('hält Zahl und „XP“ zusammen', () => {
    expect(rawLossText({ xp: 100, chapters: ['A'], removedChapters: [], campaignBonusLost: false })).toContain('100\u00a0XP')
  })

  it('nennt Kapitel, Bonus und die genaue Summe', () => {
    expect(
      campaignEditLossText({ xp: 600, chapters: ['Drei Tage'], removedChapters: [], campaignBonusLost: true }),
    ).toBe(
      'Kapitel „Drei Tage“ verliert seinen Abschluss. Die Kampagne gilt dann nicht mehr als gemeistert. ' +
        'Dadurch entfallen 600 XP (davon 500 XP Kampagnen-Bonus).',
    )
  })

  it('fasst mehrere und entfernte Kapitel zusammen', () => {
    expect(
      campaignEditLossText({
        xp: 1_300,
        chapters: ['A', 'B', 'C'],
        removedChapters: ['D'],
        campaignBonusLost: false,
      }),
    ).toBe(
      'Die Kapitel „A“, „B“ und „C“ verlieren ihren Abschluss. Das abgeschlossene Kapitel „D“ wird entfernt. ' +
        'Dadurch entfallen 1.300 XP.',
    )
    expect(
      campaignEditLossText({ xp: 200, chapters: [], removedChapters: ['D', 'E'], campaignBonusLost: false }),
    ).toBe('Die abgeschlossenen Kapitel „D“ und „E“ werden entfernt. Dadurch entfallen 200 XP.')
  })

  it('nennt nur den Bonus, wenn allein er entfällt (neues offenes Kapitel)', () => {
    expect(campaignEditLossText({ xp: 500, chapters: [], removedChapters: [], campaignBonusLost: true })).toBe(
      'Die Kampagne gilt dann nicht mehr als gemeistert. Dadurch entfällt der Kampagnen-Bonus von 500 XP.',
    )
  })
})
