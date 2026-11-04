import { describe, expect, it } from 'vitest'
import {
  REWARD_SUGGESTIONS,
  REWARD_SUGGESTION_PRICE_RANGES,
  REWARD_SUGGESTION_SIZES,
  REWARD_SUGGESTION_SIZE_LABELS,
} from './rewardSuggestions'

/** Grobe Verdienst-Rate eines beständigen Helden mit einer Kampagne (½ Gold pro XP, ≈ 100 XP am Tag). */
const GOLD_PER_DAY = 50

function expectCleanGermanText(text: string, where: string) {
  expect(text.trim(), where).toBe(text)
  expect(text, `${where}: Du-Form`).not.toMatch(/\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/)
  expect(text, `${where}: deutsche Anführungszeichen`).not.toMatch(/["']/)
  expect(text, `${where}: Auslassungszeichen …`).not.toMatch(/\.\.\./)
  expect(text, `${where}: Gedankenstrich – statt Bindestrich`).not.toMatch(/\s-\s/)
  expect(text, `${where}: doppelte Leerzeichen`).not.toMatch(/ {2}/)
  expect(text, `${where}: Leerzeichen vor Satzzeichen`).not.toMatch(/\s[,.;:!?)]/)
}

describe('REWARD_SUGGESTIONS – Inhalt', () => {
  it('ist nach Größe und darin nach Preis sortiert – so stehen sie auch in der Schatzkammer', () => {
    const rank = (size: (typeof REWARD_SUGGESTIONS)[number]['size']) => REWARD_SUGGESTION_SIZES.indexOf(size)
    for (let i = 1; i < REWARD_SUGGESTIONS.length; i++) {
      const prev = REWARD_SUGGESTIONS[i - 1]
      const curr = REWARD_SUGGESTIONS[i]
      expect(rank(curr.size), `${prev.id} → ${curr.id}`).toBeGreaterThanOrEqual(rank(prev.size))
      if (curr.size === prev.size) expect(curr.price, `${prev.id} → ${curr.id}`).toBeGreaterThanOrEqual(prev.price)
    }
  })

  it('verteilt sich gleichmäßig auf die Größen (3–4 je Spalte)', () => {
    for (const size of REWARD_SUGGESTION_SIZES) {
      const count = REWARD_SUGGESTIONS.filter((suggestion) => suggestion.size === size).length
      expect(count, size).toBeGreaterThanOrEqual(3)
      expect(count, size).toBeLessThanOrEqual(4)
    }
  })

  it('Titel und Symbole sind eindeutig; runde Preise', () => {
    expect(new Set(REWARD_SUGGESTIONS.map((s) => s.title.toLocaleLowerCase('de-DE'))).size).toBe(REWARD_SUGGESTIONS.length)
    expect(new Set(REWARD_SUGGESTIONS.map((s) => s.icon)).size).toBe(REWARD_SUGGESTIONS.length)
    for (const suggestion of REWARD_SUGGESTIONS) {
      expect(suggestion.icon, suggestion.id).toMatch(/^\p{Extended_Pictographic}/u)
      expect(suggestion.price % 50, suggestion.id).toBe(0)
    }
  })

  it('Preise passen zum Verdienst: klein in wenigen Tagen, groß in höchstens etwa drei Monaten', () => {
    expect(REWARD_SUGGESTION_PRICE_RANGES.small.max / GOLD_PER_DAY).toBeLessThanOrEqual(4)
    expect(REWARD_SUGGESTION_PRICE_RANGES.medium.min / GOLD_PER_DAY).toBeGreaterThanOrEqual(7)
    expect(REWARD_SUGGESTION_PRICE_RANGES.medium.max / GOLD_PER_DAY).toBeLessThanOrEqual(21)
    expect(REWARD_SUGGESTION_PRICE_RANGES.large.max / GOLD_PER_DAY).toBeLessThanOrEqual(100)
  })

  it('kleine und mittlere Freuden sind wiederholbar, große Wünsche teils einmalig', () => {
    for (const suggestion of REWARD_SUGGESTIONS.filter((s) => s.size !== 'large')) {
      expect(suggestion.repeatable, suggestion.id).toBe(true)
    }
    expect(REWARD_SUGGESTIONS.some((s) => s.size === 'large' && !s.repeatable)).toBe(true)
  })

  it('deutsche Texte in Du-Form; Beschreibungen sind ganze Sätze', () => {
    for (const size of REWARD_SUGGESTION_SIZES) expectCleanGermanText(REWARD_SUGGESTION_SIZE_LABELS[size], size)
    for (const suggestion of REWARD_SUGGESTIONS) {
      expectCleanGermanText(suggestion.title, `${suggestion.id}.title`)
      expectCleanGermanText(suggestion.description, `${suggestion.id}.description`)
      expect(suggestion.title.length, suggestion.id).toBeLessThanOrEqual(24)
      expect(suggestion.description, suggestion.id).toMatch(/[.!]$/)
    }
  })

  it('gesund und echt: keine Suchtmittel, keine Spielgegenstände (die kommen als eigene Gegenstände)', () => {
    for (const suggestion of REWARD_SUGGESTIONS) {
      const text = `${suggestion.title} ${suggestion.description}`
      expect(text, suggestion.id).not.toMatch(/Alkohol|Bier|Wein|Sekt|Schnaps|Cocktail|Zigarette|Tabak|Rauch|Glücksspiel|Lotto/i)
      expect(text, suggestion.id).not.toMatch(/Trank|Streak-Schutz|Heiltrank|XP|Gold/)
    }
  })
})
