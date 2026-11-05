import { describe, expect, it } from 'vitest'
import { BLUEPRINTS } from '../../data/blueprints'
import { COMPANIONS } from '../companionDefinitions'
import type { EndBossDefinition } from '../types'
import { BOSSES } from './bosses'
import { CUSTOM_END_BOSS_KEY, endBossById, endBossDefinition } from './endBoss'
import { END_BOSSES } from './endBosses'

/**
 * Schlüssel und stabile IDs laut Vertrag (ARCHITECTURE.md „Kampagnen-Endgegner“). Wer hier etwas ändern muss,
 * benennt einen Endgegner um – Tagebuch und Szenen fänden ihn über die ID nicht mehr.
 */
const EXPECTED_IDS: Record<string, string> = {
  scholar: 'end-scholar',
  'body:strength': 'end-body-strength',
  'body:endurance': 'end-body-endurance',
  'body:sports': 'end-body-sports',
  alchemist: 'end-alchemist',
  monk: 'end-monk',
  earlyRiser: 'end-earlyRiser',
  fortress: 'end-fortress',
  fellowship: 'end-fellowship',
  polyglot: 'end-polyglot',
  custom: 'end-custom',
}

const ENTRIES = Object.entries(END_BOSSES)
const DEFINITIONS: EndBossDefinition[] = Object.values(END_BOSSES)

const SINGLE_EMOJI = /^\p{Extended_Pictographic}️?$/u
/** Die Texte sprechen den Spieler an – ohne Sprachformen und ohne „Held“, „Siegerin“ & Co. */
const GENDER_MARKERS = /[*_/]|\w:innen?\b|[a-zäöü]In(nen)?\b/u
const GENDERED_NOUNS = /\b(Held|Heldin|Helden|Siegerin|Sieger|Kämpferin|Kämpfer|Kriegerin|Krieger|Gladiatorin|Gladiator)\b/
const ADDRESSES_YOU = /(^|[^\p{L}])(du|dich|dir|dein\p{L}*)(?=[^\p{L}]|$)/iu
/** Episch, aber freundlich: nichts Beschämendes, keine Drohung. */
const SHAMING = /versag|schande|schäm|enttäusch|schwach|faul|verloren|verlier|schuld|peinlich|leider|strafe|kostet|bereu/i

/** Sätze zählen wie in `bosses.test.ts`: . ! ? vor einem Großbuchstaben oder am Ende; Zitate („…“) zählen nicht mit. */
function sentenceCount(text: string): number {
  const outside = text.replace(/„[^“]*“/g, (quote) => (/[.!?]“$/.test(quote) ? '„…“.' : '„…“'))
  return (outside.match(/[.!?](?=\s+[A-ZÄÖÜ„]|$)/g) ?? []).length
}

describe('END_BOSSES – Vollständigkeit', () => {
  it('genau die Schlüssel des Vertrags mit stabilen IDs (end-<schlüssel>)', () => {
    expect(Object.keys(END_BOSSES).sort()).toEqual(Object.keys(EXPECTED_IDS).sort())
    for (const [key, definition] of ENTRIES) {
      expect(definition.id, key).toBe(EXPECTED_IDS[key])
      expect(definition.id, key).toBe(`end-${key.replace(':', '-')}`)
    }
    expect(END_BOSSES[CUSTOM_END_BOSS_KEY]).toBeDefined()
  })

  it('jede Vorlage der Bibliothek und jeder Pfad hat einen eigenen Endgegner (nicht den allgemeinen)', () => {
    const custom = END_BOSSES[CUSTOM_END_BOSS_KEY]
    let checked = 0
    for (const blueprint of BLUEPRINTS) {
      const pathIds = blueprint.paths?.map((path) => path.id) ?? [undefined]
      for (const pathId of pathIds) {
        const ref = pathId === undefined ? { id: blueprint.id, level: 'beginner' as const } : { id: blueprint.id, level: 'beginner' as const, pathId }
        const definition = endBossDefinition({ blueprint: ref })
        expect(definition, `${blueprint.id}:${pathId ?? ''}`).not.toBe(custom)
        expect(definition.id.startsWith(`end-${blueprint.id}`), definition.id).toBe(true)
        checked++
      }
    }
    // 7 Vorlagen ohne Pfad + 3 Pfade des Körpers = alle Schlüssel außer custom.
    expect(checked).toBe(Object.keys(EXPECTED_IDS).length - 1)
  })

  it('eigene Kampagnen bekommen den allgemeinen Endgegner; jede ID findet ihren Endgegner wieder', () => {
    expect(endBossDefinition({})).toBe(END_BOSSES.custom)
    for (const definition of DEFINITIONS) expect(endBossById(definition.id)).toBe(definition)
  })

  it('IDs, Namen und Icons sind eindeutig; Icons verschieden von Wochen-Bossen und Gefährten', () => {
    expect(new Set(DEFINITIONS.map((boss) => boss.id)).size).toBe(DEFINITIONS.length)
    expect(new Set(DEFINITIONS.map((boss) => boss.name)).size).toBe(DEFINITIONS.length)
    expect(new Set(DEFINITIONS.map((boss) => boss.icon)).size).toBe(DEFINITIONS.length)
    const taken = new Set([...BOSSES.map((boss) => boss.icon), ...Object.values(COMPANIONS).map((companion) => companion.icon)])
    for (const boss of DEFINITIONS) {
      expect(boss.icon, boss.id).toMatch(SINGLE_EMOJI)
      expect(taken.has(boss.icon), boss.id).toBe(false)
    }
    // Kein Endgegner heißt wie ein Wochen-Boss oder der Notfall-Endgegner.
    const weekly = new Set(BOSSES.map((boss) => boss.name))
    for (const boss of DEFINITIONS) expect(weekly.has(boss.name), boss.id).toBe(false)
    expect(DEFINITIONS.map((boss) => boss.id)).not.toContain('end-custom-shadow')
  })

  it('der Gelehrte trifft am Ende auf den Bibliothekar der Ewigkeit', () => {
    expect(END_BOSSES.scholar.name).toBe('Der Bibliothekar der Ewigkeit')
  })
})

describe('END_BOSSES – Texte', () => {
  it('Namen mit Artikel wie die Kampagnen-Titel, ohne Leerraum am Rand, höchstens 32 Zeichen', () => {
    for (const boss of DEFINITIONS) {
      expect(boss.name.trim(), boss.id).toBe(boss.name)
      expect(boss.name, boss.id).toMatch(/^(Der|Die|Das) \p{Lu}/u)
      expect(boss.name.length, boss.id).toBeLessThanOrEqual(32)
    }
  })

  it('Beschreibung und Siegessatz: je 1–2 Sätze, höchstens 200 Zeichen, verschieden, mit Satzzeichen am Ende', () => {
    for (const boss of DEFINITIONS) {
      expect(boss.description, boss.id).not.toBe(boss.defeatLine)
      for (const text of [boss.description, boss.defeatLine]) {
        const sentences = sentenceCount(text)
        expect(sentences, text).toBeGreaterThanOrEqual(1)
        expect(sentences, text).toBeLessThanOrEqual(2)
        expect(text.length, text).toBeLessThanOrEqual(200)
        expect(text.trim(), text).toBe(text)
        expect(text, text).toMatch(/[.!?…“]$/)
      }
    }
  })

  it('alle Texte sind einmalig', () => {
    const texts = DEFINITIONS.flatMap((boss) => [boss.description, boss.defeatLine])
    expect(new Set(texts).size).toBe(texts.length)
  })

  it('in Du-Form: jede Beschreibung und jeder Siegessatz spricht dich an', () => {
    for (const boss of DEFINITIONS) {
      expect(boss.description, boss.id).toMatch(ADDRESSES_YOU)
      expect(boss.defeatLine, boss.id).toMatch(ADDRESSES_YOU)
    }
  })

  it('der Siegessatz nennt den Endgegner (für die Szene ohne weiteren Kontext verständlich)', () => {
    for (const boss of DEFINITIONS) {
      // Erstes Hauptwort des Namens, z. B. „Bibliothekar“, „Kobold“, „Chamäleon“.
      const noun = boss.name.split(' ')[1]
      expect(boss.defeatLine, boss.id).toContain(noun)
    }
  })

  it('freundlich und ohne Sprachformen: nichts Beschämendes, kein „Held“ & Co., keine Zahlen', () => {
    for (const boss of DEFINITIONS) {
      for (const text of [boss.name, boss.description, boss.defeatLine]) {
        expect(text, text).not.toMatch(SHAMING)
        expect(text, text).not.toMatch(GENDER_MARKERS)
        expect(text, text).not.toMatch(GENDERED_NOUNS)
        // Einsteiger und Fortgeschrittene teilen sich den Endgegner – Zahlen aus den Kapiteln passten nur zu einer Stufe.
        expect(text, text).not.toMatch(/\d/)
        expect(text, text).not.toMatch(/["']/)
        expect(text, text).not.toMatch(/ - /)
      }
    }
  })
})
