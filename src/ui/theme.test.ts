import { beforeAll, describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS, ATTRIBUTES } from '../domain/attributes'

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

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
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

  it('faint bleibt unter 4.5:1 – deshalb nur für Platzhalter, Deaktiviertes und Dekoration', () => {
    // Steigt faint je über AA, darf der Hinweis im Kommentar von src/index.css angepasst werden.
    expect(Math.max(...surfaces.map((surface) => contrast(token('faint'), token(surface))))).toBeLessThan(4.5)
    expect(css).toMatch(/`faint` ist nur für Platzhalter, deaktivierte Elemente und dekorative/)
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
