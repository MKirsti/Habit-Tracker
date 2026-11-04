import { describe, expect, it } from 'vitest'
import { BALANCING } from '../../domain/balancing'
import { BOSSES } from '../../domain/combat/bosses'
import { CLASS_DEFINITIONS } from '../../domain/combat/classDefinitions'
import type { AttackEvent, WeeklyBossState } from '../../domain/types'
import {
  bossHpNumbers,
  bossHpRatio,
  bossHpSpoken,
  bossSnapshot,
  combatIntroPoints,
  daysLeftText,
  heroClassLabel,
  hitSpoken,
  hitText,
  lastWeekNote,
  levelClassSpoken,
  newBossHits,
  unopenedChestsLabel,
  unopenedChestsSpoken,
  weaknessInfo,
} from './combatText'

const BOSS = BOSSES[0]

function attack(overrides: Partial<AttackEvent> = {}): AttackEvent {
  return {
    day: '2026-11-03',
    source: 'quest',
    sourceId: 'read',
    attribute: 'intellect',
    attackName: 'Arkaner Blitz',
    damage: 36,
    weakness: false,
    ...overrides,
  }
}

function bossState(overrides: Partial<WeeklyBossState> = {}): WeeklyBossState {
  return {
    boss: BOSS,
    weekStart: '2026-11-02',
    weekEnd: '2026-11-08',
    weakness: 'vitality',
    maxHp: 120,
    damage: 36,
    hp: 84,
    defeated: false,
    daysLeft: 6,
    attacks: [attack()],
    ...overrides,
  }
}

const byId = (id: string) => BOSSES.find((boss) => boss.id === id)

describe('Klasse im Helden-Kopf', () => {
  it('nennt die Klasse in der Sprachform des Helden (fehlt → neutral)', () => {
    const mage = { definition: CLASS_DEFINITIONS.mage }
    expect(heroClassLabel(mage, 'female')).toEqual({ icon: '🔮', name: 'Magierin' })
    expect(heroClassLabel(mage, 'male').name).toBe('Magier')
    expect(heroClassLabel(mage).name).toBe(CLASS_DEFINITIONS.mage.names.neutral)
    expect(levelClassSpoken(7, 'Magierin')).toBe('Level 7, Klasse Magierin')
  })
})

describe('Boss-Karte', () => {
  it('formatiert Lebenspunkte, Anteil und Restzeit', () => {
    expect(bossHpNumbers(84, 120)).toBe('84 / 120 HP')
    expect(bossHpNumbers(-3, 1200)).toBe('0 / 1.200 HP')
    expect(bossHpSpoken('Sofagolem', 84, 120)).toBe('Sofagolem: noch 84 von 120 Lebenspunkten')
    expect(bossHpRatio({ hp: 30, maxHp: 120 })).toBe(0.25)
    expect(bossHpRatio({ hp: 30, maxHp: 0 })).toBe(0)
    expect(daysLeftText(7)).toBe('noch 7 Tage')
    expect(daysLeftText(2)).toBe('noch 2 Tage')
    expect(daysLeftText(1)).toBe('Letzter Tag')
  })

  it('benennt die Schwäche nach dem Attribut (wie die Quests in der Liste), den Angriff im Tooltip', () => {
    expect(weaknessInfo('vitality')).toMatchObject({ icon: '❤️', label: 'Vitalität' })
    expect(weaknessInfo('vitality').title).toBe('Schwäche: Vitalität – Lebensfunke trifft 1,5-fach')
  })

  it('beschriftet ungeöffnete Truhen', () => {
    expect(unopenedChestsLabel(1)).toBe('Truhe öffnen')
    expect(unopenedChestsLabel(3)).toBe('3 Truhen öffnen')
    expect(unopenedChestsSpoken(1)).toBe('1 ungeöffnete Truhe – in der Sammlung öffnen')
    expect(unopenedChestsSpoken(2)).toBe('2 ungeöffnete Truhen – in der Sammlung öffnen')
  })
})

describe('Treffer-Anzeige', () => {
  it('zeigt Treffer als „🧠 Arkaner Blitz −36“ und sagt die Schwachstelle an', () => {
    expect(hitText(attack())).toBe('🧠 Arkaner Blitz −36')
    expect(hitSpoken(attack(), 'Sofagolem')).toBe('Treffer gegen Sofagolem: Arkaner Blitz, 36 Schaden.')
    expect(hitSpoken(attack({ weakness: true, damage: 54 }), 'Sofagolem')).toBe(
      'Treffer gegen Sofagolem: Arkaner Blitz, 54 Schaden. Schwachstelle!',
    )
    expect(hitSpoken(attack(), 'Sofagolem', true)).toBe(
      'Treffer gegen Sofagolem: Arkaner Blitz, 36 Schaden. Sofagolem ist besiegt!',
    )
  })

  it('meldet nur neu hinzugekommene Angriffe desselben Bosses', () => {
    const before = bossState()
    const side = attack({ source: 'sideQuest', sourceId: 'tax', attribute: 'discipline', attackName: 'Schildstoß', damage: 40 })
    const after = bossState({ attacks: [attack(), side], damage: 76, hp: 44 })
    expect(newBossHits(bossSnapshot(before), after)).toEqual([side])
    // Nichts Neues, erstes Laden, kein Boss.
    expect(newBossHits(bossSnapshot(after), after)).toEqual([])
    expect(newBossHits(undefined, after)).toEqual([])
    expect(newBossHits(bossSnapshot(before), undefined)).toEqual([])
    // Haken wieder entfernt: kein Treffer.
    expect(newBossHits(bossSnapshot(after), before)).toEqual([])
  })

  it('bleibt still beim Wochenwechsel, gegen einen besiegten Boss und bei Massenänderungen', () => {
    const before = bossState()
    const next = attack({ sourceId: 'run', attribute: 'strength', attackName: 'Schwerthieb' })
    expect(newBossHits(bossSnapshot(before), bossState({ weekStart: '2026-11-09', attacks: [attack(), next] }))).toEqual([])
    expect(newBossHits(bossSnapshot(bossState({ defeated: true })), bossState({ attacks: [attack(), next] }))).toEqual([])
    const many = ['a', 'b', 'c', 'd'].map((id) => attack({ sourceId: id }))
    expect(newBossHits(bossSnapshot(before), bossState({ attacks: [attack(), ...many] }))).toEqual([])
    expect(newBossHits(bossSnapshot(before), bossState({ attacks: [attack(), ...many.slice(0, 3)] }))).toHaveLength(3)
  })
})

describe('Montags-Hinweis zur Vorwoche', () => {
  const MONDAY = '2026-11-09'
  const previous = bossState({ weekStart: '2026-11-02', hp: 12, damage: 108 })

  it('nur am Montag', () => {
    expect(lastWeekNote({ today: '2026-11-10', previous, bossById: byId, canBackfill: true })).toBeUndefined()
    expect(lastWeekNote({ today: MONDAY, bossById: byId, canBackfill: true })).toBeUndefined()
  })

  it('entkommen: der augenzwinkernde Spruch – und solange möglich die Einladung zum Nachtragen', () => {
    const note = lastWeekNote({ today: MONDAY, previous, bossById: byId, canBackfill: true })
    expect(note).toMatchObject({ kind: 'escaped', icon: BOSS.icon, text: BOSS.escapeLine })
    expect(note?.kind === 'escaped' && note.backfill?.text).toBe(
      'Sonntag vergessen abzuhaken? Es zählt noch – 12 HP bis zum Sieg.',
    )
    const later = lastWeekNote({ today: MONDAY, previous, bossById: byId, canBackfill: false })
    expect(later?.kind === 'escaped' && later.backfill).toBeUndefined()
  })

  it('besiegt: gespeicherter Sieg oder gerade durch Nachtragen', () => {
    const victory = { weekStart: '2026-11-02', bossId: BOSS.id, day: '2026-11-07', maxHp: 120 }
    expect(lastWeekNote({ today: MONDAY, victories: [victory], bossById: byId, canBackfill: true })).toEqual({
      kind: 'victory',
      icon: BOSS.icon,
      name: BOSS.name,
      text: `Letzte Woche besiegt: ${BOSS.name} – stark gekämpft!`,
    })
    const justNow = lastWeekNote({
      today: MONDAY,
      previous: bossState({ weekStart: '2026-11-02', defeated: true, hp: 0 }),
      bossById: byId,
      canBackfill: true,
    })
    expect(justNow?.kind).toBe('victory')
    // Ein gespeicherter Sieg mit unbekanntem Boss: lieber nichts als ein falscher Name.
    expect(
      lastWeekNote({ today: MONDAY, victories: [{ ...victory, bossId: 'unbekannt' }], bossById: byId, canBackfill: true }),
    ).toBeUndefined()
  })
})

describe('Einführung', () => {
  it('nennt die echten Zahlen und beschämt nie', () => {
    const text = combatIntroPoints()
      .map((point) => `${point.title} ${point.text}`)
      .join(' ')
    expect(text).toContain('sobald eines Level 3 erreicht')
    // Die Boss-Stärke folgt dem Plan (70 % davon): Ruhetage zählen nicht, ein perfekter Lauf ist nie nötig.
    expect(text).toContain('richtet sich nach deinem Wochenplan, Ruhetage zählen nicht')
    expect(text).toContain('perfekt musst du dafür nicht sein')
    expect(BALANCING.combat.bossHpShare).toBeLessThan(1)
    expect(text).toContain('1,5-fach')
    expect(text).toContain('10\u00a0%')
    expect(text).toContain('kostet dich das nichts')
    expect(text).not.toMatch(/Strafe|verlierst/)
  })
})
