import { beforeAll, describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS, ATTRIBUTES } from '../../domain/attributes'
import type { AttributeId, MainQuest } from '../../domain/types'
import { TINT_TEXT_PERCENT } from '../../ui/tint'
import {
  ACCENT_BADGE_BACKGROUND,
  ACCENT_SURFACE,
  ACCENT_TEXT_PERCENT,
  accentVars,
  attributeAccentVars,
  CAMPAIGN_FALLBACK_COLOR,
  campaignAttribute,
  campaignColor,
} from './campaignTheme'

type Rgb = [number, number, number]

/** Theme-Tokens aus src/index.css (wie src/ui/theme.test.ts: das App-tsconfig kennt keine Node-Typen). */
let css = ''
beforeAll(async () => {
  const specifier = 'node:fs/promises'
  const fs = (await import(/* @vite-ignore */ specifier)) as {
    readFile(path: URL, encoding: 'utf8'): Promise<string>
  }
  css = await fs.readFile(new URL('../../index.css', import.meta.url), 'utf8')
})

function token(name: string): Rgb {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)
  if (!match) throw new Error(`Token ${name} fehlt`)
  return hex(match[1])
}

function hex(value: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb
}

/** Wie `color-mix(in srgb, a p%, b)` – bzw. eine Fläche mit p % Deckkraft über b. */
function mix(a: Rgb, b: Rgb, percent: number): Rgb {
  return a.map((channel, i) => channel * (percent / 100) + b[i] * (1 - percent / 100)) as Rgb
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Die Prozentzahl in einem `color-mix(…var(--accent) N%…)` bzw. `…_N%…` (Tailwind-Klasse). */
function accentPercent(source: string): number {
  const match = /var\(--accent\)[_ ](\d+)%/.exec(source)
  if (!match) throw new Error(`Kein Akzent-Anteil in ${source}`)
  return Number(match[1])
}

function campaign(patch: Partial<MainQuest> = {}, dominantAttribute?: AttributeId) {
  const quest: MainQuest = { id: 'c', title: 'C', icon: '📜', why: '', reward: '', startDay: '2026-11-01', chapters: [], createdAt: 1, ...patch }
  return dominantAttribute === undefined ? { quest } : { quest, dominantAttribute }
}

describe('campaignColor', () => {
  it('Reihenfolge: berechnetes Attribut → Pfad der Vorlage → Vorlage → Gold', () => {
    const body = { blueprint: { id: 'body', level: 'beginner' as const, pathId: 'endurance' } }
    expect(campaignAttribute(campaign(body, 'intellect'))).toBe('intellect')
    expect(campaignAttribute(campaign(body))).toBe('vitality')
    expect(campaignAttribute(campaign({ blueprint: { id: 'monk', level: 'advanced' } }))).toBe('wisdom')
    expect(campaignAttribute(campaign({ blueprint: { id: 'gibt-es-nicht', level: 'beginner' } }))).toBeUndefined()
    expect(campaignColor(campaign())).toBe(CAMPAIGN_FALLBACK_COLOR)
    expect(campaignColor(campaign(body))).toBe(ATTRIBUTES.vitality.color)
  })

  it('das Gold der Rückfallfarbe ist das Gold des Themes', () => {
    expect(hex(CAMPAIGN_FALLBACK_COLOR)).toEqual(token('gold'))
  })
})

describe('accentVars', () => {
  it('setzt alle Akzent-Variablen – samt aufgehellter Schriftfarbe wie im Design-System', () => {
    const style = accentVars('#e0654a') as Record<string, string>
    expect(style['--accent']).toBe('#e0654a')
    expect(style['--accent-20']).toBe('color-mix(in srgb, #e0654a 20%, transparent)')
    expect(style['--accent-text']).toBe(`color-mix(in srgb, #e0654a ${ACCENT_TEXT_PERCENT}%, var(--color-parchment))`)
    expect(ACCENT_TEXT_PERCENT).toBe(TINT_TEXT_PERCENT)
    expect(attributeAccentVars(undefined)).toEqual(accentVars(CAMPAIGN_FALLBACK_COLOR))
    expect(attributeAccentVars('wisdom')).toEqual(accentVars(ATTRIBUTES.wisdom.color))
  })
})

describe('Kontrast der Kampagnenfarbe als Schrift (--accent-text)', () => {
  const colors = [...ATTRIBUTE_IDS.map((id) => [ATTRIBUTES[id].name, ATTRIBUTES[id].color] as const), ['Gold', CAMPAIGN_FALLBACK_COLOR] as const]

  it.each(colors)('%s bleibt auf allen getönten Kampagnen-Flächen und Abzeichen ≥ 4.5:1 lesbar', (_name, color) => {
    const accent = hex(color)
    const text = mix(accent, token('parchment'), ACCENT_TEXT_PERCENT)
    const surface = token('surface')
    const raised = token('surface-raised')
    // Hervorgehobene Fläche (Kampagnen-Rahmen, gewählte Vorlage/Klasse) laut ACCENT_SURFACE, aktuelles Kapitel (8 %).
    const highlighted = mix(accent, raised, accentPercent(ACCENT_SURFACE))
    const currentChapter = mix(accent, surface, 8)
    const backgrounds: Record<string, Rgb> = {
      surface,
      'surface-raised': raised,
      'hervorgehoben (ACCENT_SURFACE)': highlighted,
      'aktuelles Kapitel': currentChapter,
      // Abzeichen in der Farbe: Badge-Tönung 13 % (Aktuelles Kapitel), Etikett 10 % (Klassenwahl auf gewählter Karte).
      'Abzeichen 13 % auf aktuellem Kapitel': mix(accent, currentChapter, 13),
      'Abzeichen 13 % auf surface-raised': mix(accent, raised, 13),
      'Etikett 10 % auf hervorgehobener Fläche': mix(accent, highlighted, 10),
      // Deckendes Abzeichen (Klasse im Banner) – unabhängig vom Lichtschein dahinter.
      'deckendes Abzeichen': mix(accent, surface, accentPercent(ACCENT_BADGE_BACKGROUND)),
      // Feier-Szene: Titel über bg-deep/90 mit Lichtschein (--accent-20).
      'Feier-Szene': mix(accent, token('bg-deep'), 20),
    }
    for (const [name, background] of Object.entries(backgrounds)) {
      expect(contrast(text, background), name).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(colors)('%s: der dunkle Haken auf dem gefüllten Kapitel-Knoten bleibt erkennbar (≥ 3:1)', (_name, color) => {
    expect(contrast(token('on-gold'), hex(color))).toBeGreaterThanOrEqual(3)
  })
})
