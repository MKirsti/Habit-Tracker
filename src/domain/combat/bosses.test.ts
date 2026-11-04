import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS } from '../attributes'
import type { BossDefinition } from '../types'
import { BOSSES } from './bosses'

/**
 * Stabile IDs je Thema (stehen in `BossVictory.bossId` und bestimmen die Boss-Wahl). Wer hier etwas ändern muss,
 * benennt einen Boss um – gespeicherte Siege fänden ihn dann nicht mehr.
 */
const EXPECTED_IDS = {
  strength: ['couch-golem', 'drizzle-giant', 'lazy-hound'],
  intellect: ['bookworm-golem', 'prince-of-distraction', 'vocab-vampire'],
  wisdom: ['night-wolf', 'hustle-harpy', 'brooding-spider'],
  charisma: ['hermit-kraken', 'stage-fright-wyrm', 'silence-ghost'],
  vitality: ['sugar-dragon', 'swamp-troll', 'drought-wyrm'],
  discipline: ['shadow-lord', 'laundry-hydra', 'form-basilisk'],
}

const SINGLE_EMOJI = /^\p{Extended_Pictographic}️?$/u
const GENDERED_NOUNS = /\b(Held|Heldin|Helden|Siegerin|Sieger|Kämpferin|Kämpfer|Kriegerin|Krieger)\b/
const ADDRESSES_YOU = /(^|[^\p{L}])(du|dich|dir|dein\p{L}*)(?=[^\p{L}]|$)/iu
/** Ein entkommener Boss kostet nichts – sein Satz beschämt nie und droht nie. */
const SHAMING = /versag|schande|schäm|enttäusch|schwach|faul|verloren|verlier|schuld|peinlich|leider|strafe|kostet|bereu/i

/**
 * Sätze zählen: Ein Satz endet mit . ! ? vor einem Großbuchstaben oder am Textende. Satzzeichen in Zitaten („…“)
 * zählen nur, wenn das Zitat den Satz beendet („Sein Lieblingssatz: „Morgen …“ Dann …“).
 */
function sentenceCount(text: string): number {
  const outside = text.replace(/„[^“]*“/g, (quote) => (/[.!?]“$/.test(quote) ? '„…“.' : '„…“'))
  return (outside.match(/[.!?](?=\s+[A-ZÄÖÜ„]|$)/g) ?? []).length
}

function textsOf(boss: BossDefinition): string[] {
  return [boss.description, boss.defeatLine, boss.escapeLine]
}

describe('BOSSES – Vollständigkeit', () => {
  it('18 Bosse, genau 3 je Attribut-Thema', () => {
    expect(BOSSES).toHaveLength(18)
    for (const theme of ATTRIBUTE_IDS) expect(BOSSES.filter((boss) => boss.theme === theme), theme).toHaveLength(3)
    expect(BOSSES.every((boss) => ATTRIBUTE_IDS.includes(boss.theme))).toBe(true)
  })

  it('hat stabile IDs je Thema', () => {
    for (const theme of ATTRIBUTE_IDS) {
      expect(BOSSES.filter((boss) => boss.theme === theme).map((boss) => boss.id), theme).toEqual(EXPECTED_IDS[theme])
    }
  })

  it('IDs sind eindeutig, kebab-case und kollidieren nicht mit dem Notfall-Boss der Engine (shadow-<thema>)', () => {
    const ids = BOSSES.map((boss) => boss.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/)
      expect(ATTRIBUTE_IDS.map((theme) => `shadow-${theme}`)).not.toContain(id)
    }
  })

  it('Namen und Symbole sind eindeutig; jedes Symbol ist ein einzelnes Emoji', () => {
    expect(new Set(BOSSES.map((boss) => boss.name)).size).toBe(BOSSES.length)
    expect(new Set(BOSSES.map((boss) => boss.icon)).size).toBe(BOSSES.length)
    for (const boss of BOSSES) expect(boss.icon, boss.id).toMatch(SINGLE_EMOJI)
  })

  it('Namen stehen ohne Artikel und sind höchstens 40 Zeichen lang', () => {
    for (const boss of BOSSES) {
      expect(boss.name.trim(), boss.id).toBe(boss.name)
      expect(boss.name.length, boss.id).toBeGreaterThan(0)
      expect(boss.name.length, boss.id).toBeLessThanOrEqual(40)
      expect(boss.name, boss.id).not.toMatch(/^(Der|Die|Das|Ein|Eine) /)
    }
  })
})

describe('BOSSES – Texte', () => {
  it('Beschreibung, Siegessatz und Fluchtsatz: je 1–2 Sätze, verschieden, mit Satzzeichen am Ende', () => {
    for (const boss of BOSSES) {
      const texts = textsOf(boss)
      expect(new Set(texts).size, boss.id).toBe(3)
      for (const text of texts) {
        expect(text.trim(), boss.id).toBe(text)
        expect(sentenceCount(text), `${boss.id}: ${text}`).toBeGreaterThanOrEqual(1)
        expect(sentenceCount(text), `${boss.id}: ${text}`).toBeLessThanOrEqual(2)
        expect(text, boss.id).toMatch(/[.!?]“?$/)
        expect(text.length, boss.id).toBeLessThanOrEqual(140)
      }
    }
  })

  it('jeder Boss spricht den Helden in Du-Form an', () => {
    for (const boss of BOSSES) expect(textsOf(boss).join(' '), boss.id).toMatch(ADDRESSES_YOU)
  })

  it('ein entkommener Boss beschämt nie – der Fluchtsatz bleibt leicht', () => {
    for (const boss of BOSSES) expect(boss.escapeLine, boss.id).not.toMatch(SHAMING)
  })

  it('Texte passen zu jeder Sprachform (keine Personen-Bezeichnung mit Geschlecht für den Helden)', () => {
    for (const boss of BOSSES) {
      for (const text of textsOf(boss)) expect(text, boss.id).not.toMatch(GENDERED_NOUNS)
    }
  })

  it('deutsche Typografie: „…“ statt gerader Anführungszeichen, ’ statt Hochkomma, Gedankenstrich statt Bindestrich', () => {
    for (const boss of BOSSES) {
      for (const text of [boss.name, ...textsOf(boss)]) {
        expect(text, boss.id).not.toMatch(/["']/)
        expect(text, boss.id).not.toMatch(/ - /)
        // Jedes öffnende „ wird auch geschlossen.
        expect((text.match(/„/g) ?? []).length, boss.id).toBe((text.match(/“/g) ?? []).length)
      }
    }
  })
})
