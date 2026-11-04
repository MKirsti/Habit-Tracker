import { describe, expect, it } from 'vitest'
import type { Purchase, Reward } from '../../domain/types'
import {
  DEFAULT_REWARD_ICON,
  daysToEarn,
  hasRewardErrors,
  initialRewardFormValues,
  rewardDraftFromValues,
  validateRewardForm,
} from './rewardForm'
import type { RewardFormValues } from './rewardForm'
import { REWARD_SUGGESTIONS, REWARD_SUGGESTION_PRICE_RANGES, openRewardSuggestions } from './rewardSuggestions'
import { missingGoldLabel, purchaseHistory, rewardStatus, rewardViews } from './treasuryState'

function reward(overrides: Partial<Reward> = {}): Reward {
  return { id: 'r1', title: 'Pizza', icon: '🍕', price: 400, repeatable: true, order: 0, createdAt: 1, ...overrides }
}

function purchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: 'p1',
    kind: 'reward',
    rewardId: 'r1',
    title: 'Pizza',
    icon: '🍕',
    price: 400,
    day: '2026-11-02',
    createdAt: 10,
    ...overrides,
  }
}

const VALID: RewardFormValues = { icon: '🍕', title: 'Pizza', description: '', price: 400, repeatable: true }

describe('rewardForm', () => {
  it('akzeptiert gültige Eingaben', () => {
    expect(validateRewardForm(VALID)).toEqual({})
    expect(hasRewardErrors(validateRewardForm(VALID))).toBe(false)
  })

  it('verlangt einen Namen (höchstens 60 Zeichen)', () => {
    expect(validateRewardForm({ ...VALID, title: '  ' }).title).toBe('Bitte gib der Belohnung einen Namen.')
    expect(validateRewardForm({ ...VALID, title: 'x'.repeat(61) }).title).toMatch(/höchstens 60 Zeichen/)
  })

  it('verlangt einen ganzzahligen Preis von 1 bis 1.000.000 Gold', () => {
    expect(validateRewardForm({ ...VALID, price: null }).price).toBe('Bitte gib einen Preis ein.')
    expect(validateRewardForm({ ...VALID, price: 12.5 }).price).toMatch(/ganze Zahl/)
    expect(validateRewardForm({ ...VALID, price: 0 }).price).toBe(
      'Der Preis muss zwischen 1 und 1.000.000 Gold liegen.',
    )
    expect(validateRewardForm({ ...VALID, price: 1_000_001 }).price).toMatch(/zwischen 1 und 1\.000\.000 Gold/)
    expect(validateRewardForm({ ...VALID, price: 1 })).toEqual({})
    expect(validateRewardForm({ ...VALID, price: 1_000_000 })).toEqual({})
  })

  it('begrenzt die Beschreibung', () => {
    expect(validateRewardForm({ ...VALID, description: 'x'.repeat(201) }).description).toMatch(/höchstens 200/)
  })

  it('baut einen getrimmten Entwurf (leere Beschreibung entfällt, leeres Symbol → Standard)', () => {
    expect(rewardDraftFromValues({ ...VALID, icon: '', title: '  Pizza  ', description: '   ' })).toEqual({
      icon: DEFAULT_REWARD_ICON,
      title: 'Pizza',
      description: undefined,
      price: 400,
      repeatable: true,
    })
    expect(rewardDraftFromValues({ ...VALID, description: ' Mit Käse ' }).description).toBe('Mit Käse')
  })

  it('startet mit Belohnung, Vorschlag oder leer', () => {
    expect(initialRewardFormValues(reward({ description: 'Lecker', repeatable: false }))).toEqual({
      icon: '🍕',
      title: 'Pizza',
      description: 'Lecker',
      price: 400,
      repeatable: false,
    })
    const suggestion = REWARD_SUGGESTIONS[0]
    expect(initialRewardFormValues(undefined, suggestion)).toMatchObject({
      title: suggestion.title,
      price: suggestion.price,
      repeatable: suggestion.repeatable,
    })
    expect(initialRewardFormValues()).toMatchObject({ title: '', repeatable: true, icon: DEFAULT_REWARD_ICON })
  })

  it('schätzt die Spar-Dauer erst ab dem dritten Tag und mit verdientem Gold', () => {
    // 300 Gold in 10 Tagen = 30 Gold/Tag → 400 Gold ≈ 14 Tage.
    expect(daysToEarn(400, 300, 10)).toBe(14)
    expect(daysToEarn(10, 300, 10)).toBe(1)
    expect(daysToEarn(400, 300, 2)).toBeUndefined()
    expect(daysToEarn(400, 0, 10)).toBeUndefined()
  })
})

describe('rewardSuggestions', () => {
  it('hat 8–12 Vorschläge mit eindeutigen IDs und Preisen im Rahmen ihrer Größe', () => {
    expect(REWARD_SUGGESTIONS.length).toBeGreaterThanOrEqual(8)
    expect(REWARD_SUGGESTIONS.length).toBeLessThanOrEqual(12)
    expect(new Set(REWARD_SUGGESTIONS.map((suggestion) => suggestion.id)).size).toBe(REWARD_SUGGESTIONS.length)
    for (const suggestion of REWARD_SUGGESTIONS) {
      const { min, max } = REWARD_SUGGESTION_PRICE_RANGES[suggestion.size]
      expect(suggestion.price).toBeGreaterThanOrEqual(min)
      expect(suggestion.price).toBeLessThanOrEqual(max)
      expect(validateRewardForm(initialRewardFormValues(undefined, suggestion))).toEqual({})
    }
    expect(new Set(REWARD_SUGGESTIONS.map((suggestion) => suggestion.size))).toEqual(
      new Set(['small', 'medium', 'large']),
    )
  })

  it('blendet übernommene Vorschläge aus (Titel ohne Groß-/Kleinschreibung), ausgeblendete zählen nicht', () => {
    const open = openRewardSuggestions([{ title: ' pizza BESTELLEN ' }, { title: 'Kinoabend', archived: true }])
    expect(open.map((suggestion) => suggestion.title)).not.toContain('Pizza bestellen')
    expect(open.map((suggestion) => suggestion.title)).toContain('Kinoabend')
    expect(open).toHaveLength(REWARD_SUGGESTIONS.length - 1)
  })
})

describe('treasuryState', () => {
  it('bestimmt den Status: einlösbar, zu teuer, eingelöst', () => {
    expect(rewardStatus(reward(), 400, [])).toEqual({ kind: 'available' })
    expect(rewardStatus(reward(), 250, [])).toEqual({ kind: 'missing', missing: 150 })
    // Negatives Guthaben: Es fehlt mehr als der Preis.
    expect(rewardStatus(reward(), -50, [])).toEqual({ kind: 'missing', missing: 450 })
    expect(rewardStatus(reward({ repeatable: false }), 1000, [purchase()])).toEqual({
      kind: 'redeemed',
      day: '2026-11-02',
    })
    // Wiederholbar bleibt einlösbar.
    expect(rewardStatus(reward(), 1000, [purchase()])).toEqual({ kind: 'available' })
    expect(missingGoldLabel(1500)).toBe('Noch 1.500 Gold')
  })

  it('listet sichtbare Belohnungen sortiert mit Zähler und Spar-Fortschritt', () => {
    const views = rewardViews(
      [
        reward({ id: 'b', title: 'B', order: 2 }),
        reward({ id: 'a', title: 'A', order: 1, price: 1000 }),
        reward({ id: 'x', title: 'X', order: 0, archived: true }),
      ],
      [purchase({ rewardId: 'b' }), purchase({ id: 'p2', rewardId: 'b' })],
      500,
    )
    expect(views.map((view) => view.reward.id)).toEqual(['a', 'b'])
    expect(views[0]).toMatchObject({ saved: 0.5, timesRedeemed: 0, status: { kind: 'missing', missing: 500 } })
    expect(views[1]).toMatchObject({ saved: 1, timesRedeemed: 2, status: { kind: 'available' } })
  })

  it('zeigt die Chronik neueste zuerst', () => {
    const history = purchaseHistory([
      purchase({ id: 'old', createdAt: 1 }),
      purchase({ id: 'new', createdAt: 3 }),
      purchase({ id: 'mid', createdAt: 2 }),
    ])
    expect(history.map((entry) => entry.id)).toEqual(['new', 'mid', 'old'])
  })
})

describe('Chronik: kompaktes Datum', () => {
  it('„4. Nov. 2026“ – passt auf 360 px zusammen mit dem Preis in eine Zeile', async () => {
    const { formatShortDate } = await import('./treasuryState')
    expect(formatShortDate('2026-11-04')).toBe('4. Nov. 2026')
    expect(formatShortDate('2027-01-31')).toBe('31. Jan. 2027')
  })
})
