import { describe, expect, it } from 'vitest'
import { BOSSES } from '../../domain/combat/bosses'
import { makeBossVictory, makeChapter, makeChest, makeHabit, makeMainQuest } from '../../domain/testing'
import { chestReveal, chestSourceLine } from './chestText'

const reading = makeHabit({ id: 'h-read', title: 'Lesen', icon: '📖', attribute: 'intellect' })
const campaign = makeMainQuest({
  id: 'mq-1',
  title: 'Der Weg des Gelehrten',
  icon: '📚',
  chapters: [makeChapter({ id: 'c-1', title: 'Erste Seiten', criterion: { type: 'manual' } })],
})
const sofa = BOSSES.find((boss) => boss.id === 'couch-golem')

describe('chestSourceLine', () => {
  it('nennt die Quest einer Quest-Truhe', () => {
    expect(chestSourceLine(makeChest('quest:h-read:2026-11-03'), { habits: [reading] })).toBe('📖 Lesen')
    expect(chestSourceLine(makeChest('quest:weg:2026-11-03'), { habits: [reading] })).toBe('Eine erledigte Quest')
  })

  it('nennt Kampagne und Kapitel einer Kapitel-Truhe', () => {
    expect(chestSourceLine(makeChest('chapter:mq-1:c-1'), { mainQuests: [campaign] })).toBe('📚 Kapitel „Erste Seiten“')
    expect(chestSourceLine(makeChest('chapter:mq-1:weg'), { mainQuests: [campaign] })).toBe('Ein abgeschlossenes Kapitel')
  })

  it('nennt den besiegten Boss – gespeichert oder gerade erst besiegt', () => {
    const stored = chestSourceLine(makeChest('boss:2026-10-26'), {
      victories: [makeBossVictory('2026-10-26', { bossId: 'couch-golem' })],
    })
    expect(stored).toBe('🛋️ Sofagolem besiegt')
    expect(sofa).toBeDefined()
    if (!sofa) return
    const live = chestSourceLine(makeChest('boss:2026-11-02'), {
      bosses: [
        {
          boss: sofa,
          weekStart: '2026-11-02',
          weekEnd: '2026-11-08',
          weakness: 'vitality',
          maxHp: 120,
          damage: 130,
          hp: 0,
          defeated: true,
          daysLeft: 6,
          attacks: [],
        },
      ],
    })
    expect(live).toBe('🛋️ Sofagolem besiegt')
    expect(chestSourceLine(makeChest('boss:2026-01-05'), {})).toBe('Wochen-Boss besiegt')
  })
})

describe('chestReveal', () => {
  it('zeigt Gold – und erklärt, wenn ein Streak-Schutz wegen vollem Beutel zu Gold wurde', () => {
    const gold = chestReveal({ kind: 'gold', amount: 1250 })
    expect(gold).toMatchObject({ kind: 'gold', name: '+1.250 Gold', spoken: 'In der Truhe: 1.250 Gold.' })
    expect(gold.detail).toContain('Schatzkammer')
    expect(chestReveal({ kind: 'gold', amount: 100 }, { freezeFallback: true }).detail).toContain('Beutel war schon voll')
  })

  it('zeigt den Streak-Schutz mit dem Vorrat', () => {
    const item = chestReveal({ kind: 'item', itemId: 'streakFreeze' }, { streakFreezes: 3 })
    expect(item).toMatchObject({ kind: 'item', icon: '❄️', name: 'Streak-Schutz' })
    expect(item.detail).toContain('Im Beutel: 3 / 5.')
  })

  it('zeigt einen Titel in der Sprachform mit Vorschau und lässt ihn anlegen', () => {
    const female = chestReveal({ kind: 'cosmetic', cosmeticKind: 'title', cosmeticId: 'timeless' }, { form: 'female', heroName: 'Aria' })
    expect(female).toMatchObject({ kind: 'title', label: 'Neuer Titel', name: 'die Zeitlose' })
    expect(female.detail).toBe('So klingt es: Aria, die Zeitlose')
    expect(female.cosmetic).toEqual({ kind: 'title', id: 'timeless' })
    expect(chestReveal({ kind: 'cosmetic', cosmeticKind: 'title', cosmeticId: 'timeless' }, { form: 'male' }).name).toBe('der Zeitlose')
    expect(chestReveal({ kind: 'cosmetic', cosmeticKind: 'title', cosmeticId: 'timeless' }).name).toBe('jenseits der Zeit')
  })

  it('zeigt einen Rahmen mit Namen', () => {
    const frame = chestReveal({ kind: 'cosmetic', cosmeticKind: 'frame', cosmeticId: 'stardust' })
    expect(frame).toMatchObject({ kind: 'frame', label: 'Neuer Rahmen', name: 'Sternenstaub', cosmetic: { kind: 'frame', id: 'stardust' } })
    expect(frame.spoken).toBe('In der Truhe: der Rahmen „Sternenstaub“.')
    // Spielerinnen und Spieler kennen „Heute“ und die Heldenseite – „Helden-Kopf“ ist ein Wort aus dem Code.
    expect(frame.detail).toBe('Ein Ring um dein Heldenbild – zu sehen auf „Heute“ und auf deiner Heldenseite.')
    expect(frame.detail).not.toMatch(/Kopf/)
  })

  it('bleibt bei unbekannter Kosmetik freundlich', () => {
    expect(chestReveal({ kind: 'cosmetic', cosmeticKind: 'title', cosmeticId: 'gibt-es-nicht' }).name).toBe('Ein neuer Titel')
    expect(chestReveal({ kind: 'cosmetic', cosmeticKind: 'frame', cosmeticId: 'gibt-es-nicht' }).name).toBe('Ein neuer Rahmen')
  })
})
