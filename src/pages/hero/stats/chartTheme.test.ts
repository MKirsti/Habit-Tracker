import { beforeAll, describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS, ATTRIBUTES } from '../../../domain/attributes'
import type { HeatLevel } from '../../../domain/statistics'
import { HEAT_EMPTY, HEAT_FAINT, heatFill, trackFill } from './chartTheme'

/**
 * Die Heatmap-Farben sind CSS-Ausdrücke (`color-mix` über Theme-Tokens). Dieser Test löst sie mit den echten Werten
 * aus `src/index.css` auf und prüft die Wahrnehmung in OKLab: Jede Stufe ist sichtbar heller als die vorige –
 * auf der Kartenfläche, für Gold und für jede Attributfarbe.
 */

async function readText(relativePath: string): Promise<string> {
  const specifier = 'node:fs/promises'
  const fs = (await import(/* @vite-ignore */ specifier)) as {
    readFile(path: URL, encoding: 'utf8'): Promise<string>
  }
  return fs.readFile(new URL(relativePath, import.meta.url), 'utf8')
}

let css = ''
beforeAll(async () => {
  css = await readText('../../../index.css')
})

function token(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6});`, 'i'))
  if (!match) throw new Error(`Token --color-${name} fehlt`)
  return match[1]
}

function channels(hex: string): number[] {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
}

function toHex(values: number[]): string {
  return `#${values.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

/** Argumente auf oberster Ebene (Kommas in verschachtelten Klammern bleiben). */
function splitArgs(inner: string): string[] {
  const args: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '(') depth++
    else if (inner[i] === ')') depth--
    else if (inner[i] === ',' && depth === 0) {
      args.push(inner.slice(start, i).trim())
      start = i + 1
    }
  }
  args.push(inner.slice(start).trim())
  return args
}

/** Löst `#hex`, `var(--color-…)` und `color-mix(in srgb, A p%, B)` zu einer Hex-Farbe auf. */
function resolve(expression: string): string {
  const value = expression.trim()
  if (value.startsWith('#')) return value
  const variable = /^var\(--color-([a-z-]+)\)$/.exec(value)
  if (variable) return token(variable[1])
  if (value.startsWith('color-mix(')) {
    const [space, first, second] = splitArgs(value.slice('color-mix('.length, -1))
    expect(space).toBe('in srgb')
    const percentMatch = /\s(\d+(?:\.\d+)?)%$/.exec(first)
    if (!percentMatch) throw new Error(`Anteil fehlt in ${first}`)
    const share = Number(percentMatch[1]) / 100
    const a = channels(resolve(first.slice(0, percentMatch.index)))
    const b = channels(resolve(second))
    return toHex(a.map((v, i) => v * share + b[i] * (1 - share)))
  }
  throw new Error(`Unbekannter Farbausdruck: ${value}`)
}

function lightness(hex: string): number {
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = channels(hex).map((c) => toLinear(c / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
}

const LEVELS: HeatLevel[] = [0, 1, 2, 3, 4]

describe('Farben der Statistik', () => {
  it('Gold-Heatmap: jede Stufe deutlich heller als die vorige, „perfekt“ im hellen Gold', () => {
    const ramp = LEVELS.map((level) => lightness(resolve(heatFill(level))))
    for (let i = 1; i < ramp.length; i++) expect(ramp[i] - ramp[i - 1]).toBeGreaterThanOrEqual(0.08)
    expect(resolve(heatFill(4))).toBe(token('gold-bright'))
  })

  it('Attribut-Heatmap: dieselbe monotone Skala in jeder Attributfarbe', () => {
    for (const id of ATTRIBUTE_IDS) {
      const color = ATTRIBUTES[id].color
      const ramp = LEVELS.map((level) => lightness(resolve(heatFill(level, color))))
      for (let i = 1; i < ramp.length; i++) expect(ramp[i] - ramp[i - 1], `${id}, Stufe ${i}`).toBeGreaterThanOrEqual(0.07)
      expect(heatFill(4, color)).toBe(color)
    }
  })

  it('„nichts erledigt“ hebt sich von „ohne Bedeutung“ und von der Karte ab', () => {
    const card = lightness(token('surface-raised'))
    const empty = lightness(resolve(HEAT_EMPTY))
    const faint = lightness(resolve(HEAT_FAINT))
    expect(empty - faint).toBeGreaterThanOrEqual(0.04)
    expect(empty).toBeGreaterThan(card)
  })

  it('die Leiste hinter der Erfüllungsquote bleibt dunkel – der Balken leuchtet', () => {
    for (const id of ATTRIBUTE_IDS) {
      const color = ATTRIBUTES[id].color
      expect(lightness(color) - lightness(resolve(trackFill(color)))).toBeGreaterThan(0.25)
    }
  })
})
