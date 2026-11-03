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
