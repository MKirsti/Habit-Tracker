// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { XpBar } from './XpBar'

/**
 * Der Schalter „Effekte“ (settings.effects) stoppt dekorative Endlos-Animationen über
 * `<html data-effects="off">` und eine CSS-Regel in src/index.css. Diese Tests prüfen, dass die
 * Regel tatsächlich greifen kann – im Browser war sie zuvor wirkungslos:
 * 1. Sie lag in `@layer base`; die Animations-Utilities liegen in `@layer utilities` und gewinnen
 *    dort unabhängig von der Spezifität (Cascade Layers).
 * 2. Sie traf nur die Klasse `.animate-shimmer`, die XP-Leiste nutzt aber `motion-safe:animate-shimmer`.
 */

/** Liest eine Datei relativ zu diesem Test (CSS-Importe liefert Vitest leer aus). */
async function readText(relativePath: string): Promise<string> {
  const specifier = 'node:fs/promises'
  const fs = (await import(/* @vite-ignore */ specifier)) as {
    readFile(path: URL, encoding: 'utf8'): Promise<string>
  }
  return fs.readFile(new URL(relativePath, import.meta.url), 'utf8')
}

interface CssRule {
  selector: string
  body: string
  /** Verschachtelungstiefe der Regel (0 = außerhalb jedes `@layer`/`@media`-Blocks). */
  depth: number
}

/** Findet alle Regeln, deren Selektor `needle` enthält (Kommentare werden vorher entfernt). */
function findRules(css: string, needle: string): CssRule[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: CssRule[] = []
  let from = 0
  for (;;) {
    const hit = source.indexOf(needle, from)
    if (hit === -1) break
    const open = source.indexOf('{', hit)
    const close = source.indexOf('}', open)
    const start = Math.max(source.lastIndexOf('}', hit), source.lastIndexOf('{', hit), source.lastIndexOf(';', hit)) + 1
    const before = source.slice(0, start)
    const depth = (before.match(/\{/g)?.length ?? 0) - (before.match(/\}/g)?.length ?? 0)
    rules.push({ selector: source.slice(start, open).trim(), body: source.slice(open + 1, close), depth })
    from = close
  }
  return rules
}

let css = ''
beforeAll(async () => {
  MotionGlobalConfig.skipAnimations = true
  css = await readText('../index.css')
})
afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.effects
})

describe('Effekte abschalten (<html data-effects="off">)', () => {
  it('steht außerhalb der Cascade-Layer, damit sie die Animations-Utilities überschreibt', () => {
    const rules = findRules(css, 'data-effects="off"')
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      expect(rule.depth, rule.selector).toBe(0)
      expect(rule.body).toMatch(/animation:\s*none/)
    }
  })

  it('trifft den Glanz der XP-Leiste (auch mit Varianten wie motion-safe:)', () => {
    const [rule] = findRules(css, 'data-effects="off"')
    const { container } = render(<XpBar level={2} xpIntoLevel={40} xpForNextLevel={283} />)
    const shimmer = container.querySelector('[class*="animate-shimmer"]')
    expect(shimmer).not.toBeNull()

    expect(shimmer?.matches(rule.selector)).toBe(false)
    document.documentElement.dataset.effects = 'off'
    expect(shimmer?.matches(rule.selector)).toBe(true)
  })
})
