import { describe, expect, it } from 'vitest'
import { ACHIEVEMENT_TIER_COLORS } from '../../features/feedback/achievementTier'
import { TIER_COLORS } from './achievementView'

describe('Stufenfarben der Erfolge', () => {
  it('sind auf der Erfolge-Seite dieselben wie im Erfolgs-Toast und im Konfetti', () => {
    expect(TIER_COLORS).toEqual(ACHIEVEMENT_TIER_COLORS)
  })
})
