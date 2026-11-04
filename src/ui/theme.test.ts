import { beforeAll, describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS, ATTRIBUTES } from '../domain/attributes'
import type { AttributeId } from '../domain/types'
import { TINT_TEXT_PERCENT, tintStyle, tintTextColor } from './tint'

/**
 * Liest eine Datei relativ zu diesem Test. (Vitest liefert CSS-Importe – auch `?raw` – leer aus,
 * und das App-tsconfig kennt keine Node-Typen; daher der minimal typisierte dynamische Import.)
 */
async function readText(relativePath: string): Promise<string> {
  const specifier = 'node:fs/promises'
  const fs = (await import(/* @vite-ignore */ specifier)) as {
    readFile(path: URL, encoding: 'utf8'): Promise<string>
  }
  return fs.readFile(new URL(relativePath, import.meta.url), 'utf8')
}

/** Prüft, ob eine Datei relativ zu diesem Test existiert. */
async function exists(relativePath: string): Promise<boolean> {
  const specifier = 'node:fs/promises'
  const fs = (await import(/* @vite-ignore */ specifier)) as { access(path: URL): Promise<void> }
  return fs.access(new URL(relativePath, import.meta.url)).then(
    () => true,
    () => false,
  )
}

/** Alle `@font-face`-Blöcke (ohne Kommentare). */
function fontFaces(source: string): string[] {
  return [...source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1])
}

/** Relative WCAG-Leuchtdichte einer Hex-Farbe. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Wie `color-mix(in srgb, a p%, b)` bzw. eine Fläche mit p % Deckkraft über b – als Hex. */
function mixHex(a: string, b: string, percent: number): string {
  const channel = (hex: string, i: number) => Number.parseInt(hex.slice(i, i + 2), 16)
  return `#${[1, 3, 5]
    .map((i) => Math.round(channel(a, i) * (percent / 100) + channel(b, i) * (1 - percent / 100)))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** OKLab-Koordinaten [L, a, b] einer Hex-Farbe (wahrnehmungsnah: gleiche Abstände ≈ gleich große Unterschiede). */
function oklab(hex: string): [number, number, number] {
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(Number.parseInt(hex.slice(i, i + 2), 16) / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** Farbabstand ΔE in OKLab (0 = gleich, ~0.02 kaum unterscheidbar). */
function distance(a: string, b: string): number {
  const [la, aa, ba] = oklab(a)
  const [lb, ab, bb] = oklab(b)
  return Math.hypot(la - lb, aa - ab, ba - bb)
}

/** Buntheit (OKLCH-Chroma). */
function chroma(hex: string): number {
  const [, a, b] = oklab(hex)
  return Math.hypot(a, b)
}

function token(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6});`, 'i'))
  if (!match) throw new Error(`Token --color-${name} fehlt`)
  return match[1]
}

let css = ''
beforeAll(async () => {
  css = await readText('../index.css')
})

describe('Theme-Tokens (src/index.css)', () => {
  it('spiegeln die Attributfarben aus src/domain/attributes.ts', () => {
    for (const id of ATTRIBUTE_IDS) {
      expect(css, id).toContain(`--color-attr-${id}: ${ATTRIBUTES[id].color.toLowerCase()};`)
    }
  })

  it('definieren die Kernfarben und Schriften', () => {
    for (const token of [
      '--color-bg:',
      '--color-surface:',
      '--color-surface-raised:',
      '--color-border:',
      '--color-gold:',
      '--color-gold-bright:',
      '--color-gold-dim:',
      '--color-parchment:',
      '--color-muted:',
      '--color-success:',
      '--color-danger:',
      '--font-display:',
      '--font-sans:',
    ]) {
      expect(css).toContain(token)
    }
  })
})

describe('Kontrast der Text-Tokens', () => {
  const surfaces = ['bg-deep', 'bg', 'surface', 'surface-raised', 'surface-hover']

  it('parchment und muted erfüllen auf allen Flächen WCAG AA für Fließtext (≥ 4.5:1)', () => {
    for (const text of ['parchment', 'muted']) {
      for (const surface of surfaces) {
        expect(contrast(token(text), token(surface)), `${text} auf ${surface}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('Attributfarben (zugleich Kampagnenfarben) sind als Text auf allen Flächen lesbar (≥ 4.5:1)', () => {
    for (const id of ATTRIBUTE_IDS) {
      for (const surface of surfaces) {
        expect(contrast(token(`attr-${id}`), token(surface)), `${id} auf ${surface}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('Attribut-Chips und farbige Abzeichen (tintStyle) sind auch getönt lesbar (≥ 4.5:1) – auf jeder Fläche', () => {
    // Reines Stärke-Rot läge auf seinem 12-%-Chip über surface-raised bei 4.3:1, über surface-hover bei 3.9:1.
    // Deshalb mischt tintStyle die Schrift mit Pergament (TINT_TEXT_PERCENT).
    expect(tintStyle('#e0654a').color).toBe(tintTextColor('#e0654a'))
    for (const id of ATTRIBUTE_IDS) {
      const color = ATTRIBUTES[id].color
      const text = mixHex(color, token('parchment'), TINT_TEXT_PERCENT)
      const backgrounds: [string, string][] = [
        ...surfaces.map((surface): [string, string] => [surface, token(surface)]),
        // Chips auf einer hervorgehobenen Karte in derselben Farbe (gewählte Klasse, ACCENT_SURFACE: 6 %).
        ['getönte Karte', mixHex(color, token('surface-raised'), 6)],
      ]
      for (const [name, background] of backgrounds) {
        for (const chip of [12, 13]) {
          expect(contrast(text, mixHex(color, background, chip)), `${id}: ${chip} % auf ${name}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })

  it('faint bleibt unter 4.5:1 – deshalb nur für Platzhalter, Deaktiviertes und Dekoration', () => {
    // Steigt faint je über AA, darf der Hinweis im Kommentar von src/index.css angepasst werden.
    expect(Math.max(...surfaces.map((surface) => contrast(token('faint'), token(surface))))).toBeLessThan(4.5)
    expect(css).toMatch(/`faint` ist nur für Platzhalter, deaktivierte Elemente und dekorative/)
  })
})

describe('Attribut- bzw. Kampagnenfarben', () => {
  it('sind paarweise deutlich verschieden (OKLab ΔE ≥ 0.09)', () => {
    for (const [i, a] of ATTRIBUTE_IDS.entries()) {
      for (const b of ATTRIBUTE_IDS.slice(i + 1)) {
        expect(distance(ATTRIBUTES[a].color, ATTRIBUTES[b].color), `${a} / ${b}`).toBeGreaterThanOrEqual(0.09)
      }
    }
  })

  it('Weisheit (Silber/Eisblau) ist klar heller und viel weniger bunt als Intelligenz (Blau)', () => {
    const wisdom = ATTRIBUTES.wisdom.color
    const intellect = ATTRIBUTES.intellect.color
    expect(oklab(wisdom)[0] - oklab(intellect)[0]).toBeGreaterThanOrEqual(0.1)
    expect(chroma(wisdom)).toBeLessThanOrEqual(chroma(intellect) / 2)
  })

  it('folgen der Zuordnung Stärke Rot, Charisma Bernstein, Vitalität Grün, Intelligenz Blau, Weisheit Silber, Disziplin Violett', () => {
    // OKLCH-Farbton in Grad.
    const hue = (hex: string) => {
      const [, a, b] = oklab(hex)
      return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
    }
    const ranges: Record<AttributeId, [number, number]> = {
      strength: [15, 45],
      charisma: [60, 90],
      vitality: [130, 170],
      intellect: [230, 265],
      wisdom: [210, 265],
      discipline: [280, 320],
    }
    for (const id of ATTRIBUTE_IDS) {
      const [from, to] = ranges[id]
      expect(hue(ATTRIBUTES[id].color), id).toBeGreaterThanOrEqual(from)
      expect(hue(ATTRIBUTES[id].color), id).toBeLessThanOrEqual(to)
    }
    // Silber: kaum bunt; alle anderen sind klar farbig.
    expect(chroma(ATTRIBUTES.wisdom.color)).toBeLessThan(0.06)
    for (const id of ATTRIBUTE_IDS.filter((attribute) => attribute !== 'wisdom')) {
      expect(chroma(ATTRIBUTES[id].color), id).toBeGreaterThan(0.1)
    }
  })
})

describe('Ziffern in der Display-Schrift', () => {
  // Cinzel zeichnet die 1 wie ein römisches I („11“ liest sich wie „II“). Ziffern kommen deshalb aus Inter.
  it('stellt eine Ziffern-Schrift vor Cinzel, die nur 0–9 abdeckt', () => {
    const display = css.match(/--font-display:\s*([^;]+);/)?.[1] ?? ''
    expect(display.split(',').map((family) => family.trim().replace(/"/g, ''))[0]).toBe('Questlog Digits')
    expect(display).toContain('"Cinzel"')

    const face = fontFaces(css).find((body) => /font-family:\s*"Questlog Digits"/.test(body))
    expect(face, '@font-face für "Questlog Digits" fehlt').toBeDefined()
    expect(face).toMatch(/unicode-range:\s*U\+0030-0039\s*;/)
    expect(face).toMatch(/font-weight:\s*100 900\s*;/)
    expect(face).toMatch(/font-display:\s*swap\s*;/)
  })

  it('nutzt dieselbe (offline vorgehaltene) Inter-Datei wie der Fließtext', async () => {
    const face = fontFaces(css).find((body) => /font-family:\s*"Questlog Digits"/.test(body)) ?? ''
    const url = face.match(/url\("?([^")]+)"?\)/)?.[1] ?? ''
    expect(url).toMatch(/@fontsource-variable\/inter\/files\/inter-latin-wght-normal\.woff2$/)

    const fontsource = await readText('../../node_modules/@fontsource-variable/inter/index.css')
    const latin = fontFaces(fontsource).find((body) => /unicode-range:\s*U\+0000-00FF/.test(body)) ?? ''
    expect(latin).toContain('inter-latin-wght-normal.woff2')
    expect(await exists('../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')).toBe(true)
  })
})

describe('Fokus nicht verdeckt (WCAG 2.2 SC 2.4.11)', () => {
  const source = () => css.replace(/\/\*[\s\S]*?\*\//g, '')

  it('hält beim Scrollen zum Fokus Abstand zur festen unteren Navigation', () => {
    expect(source()).toMatch(
      /html\s*\{[^}]*scroll-padding-bottom:\s*calc\(var\(--bottom-nav-height\) \+ env\(safe-area-inset-bottom\) \+ 1rem\)/,
    )
    // Ab md gibt es keine untere Navigation mehr.
    expect(source()).toMatch(/@media \(width >= 48rem\)\s*\{\s*html\s*\{\s*scroll-padding-bottom:\s*1\.5rem;/)
  })

  it('hält im Onboarding Abstand zur klebenden Aktionsleiste', () => {
    expect(source()).toMatch(/--onboarding-cta:\s*[\d.]+rem;/)
    expect(source()).toMatch(
      /html:has\(\[data-step-actions="sticky"\]\)\s*\{\s*scroll-padding-bottom:\s*calc\(var\(--onboarding-cta\) \+ env\(safe-area-inset-bottom\) \+ 0\.5rem\)/,
    )
  })
})
