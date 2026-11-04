import { describe, expect, it } from 'vitest'
import type { HpLedgerEntry, HpState } from '../../domain/types'
import {
  backfillStanding,
  canUndoRestToday,
  freezeStockTitle,
  goodDayMilestone,
  hpDeltaLabel,
  hpIntroPoints,
  hpNumbers,
  hpValueText,
  isLowHp,
  lowHpHint,
  restBannerText,
  restBannerTitle,
  restConfirmText,
  settlementNote,
  weekdayName,
  yesterdayPreview,
  yesterdayRestConfirmText,
} from './hpText'

/** Mittwoch, 4. November 2026. */
const TODAY = '2026-11-04'

function entry(day: string, extra: Partial<HpLedgerEntry> = {}): HpLedgerEntry {
  return { day, score: 'weak', frozen: false, hpDelta: -3, hpAfter: 52, maxHp: 55, penalties: true, ...extra }
}

const HP: Pick<HpState, 'enabled' | 'settledThrough'> = { enabled: true, settledThrough: '2026-11-02' }

/** HP-Änderungen trennen Zahl und „HP“ mit einem geschützten Leerzeichen. */
const nb = (text: string) => text.replace(/ HP/g, '\u00a0HP')

describe('HP-Zahlen', () => {
  it('formatiert Stand, vorgelesenen Stand und Änderungen (mit echtem Minuszeichen)', () => {
    expect(hpNumbers(42, 55)).toBe('42 / 55 HP')
    expect(hpNumbers(1234, 1250)).toBe('1.234 / 1.250 HP')
    expect(hpValueText(42, 55)).toBe('42 von 55 Lebenspunkten')
    expect(hpDeltaLabel(-3)).toBe(nb('−3 HP'))
    expect(hpDeltaLabel(10)).toBe(nb('+10 HP'))
    expect(hpDeltaLabel(0)).toBe(nb('±0 HP'))
    expect(hpDeltaLabel(Number.NaN)).toBe(nb('±0 HP'))
  })

  it('meldet wenig HP erst unter 25 % – und nie im Sanften Modus', () => {
    expect(isLowHp({ enabled: true, ratio: 0.24 })).toBe(true)
    expect(isLowHp({ enabled: true, ratio: 0.25 })).toBe(false)
    expect(isLowHp({ enabled: false, ratio: 0.1 })).toBe(false)
    expect(isLowHp({ enabled: true, ratio: Number.NaN })).toBe(false)
    // Ermutigend, mit dem Weg nach oben – keine Warnung.
    expect(lowHpHint()).toBe(nb('Etwas angeschlagen – ein Perfekter Tag heilt +10 HP.'))
  })

  it('nennt Wochentage auf Deutsch', () => {
    expect(weekdayName('2026-11-02')).toBe('Montag')
    expect(weekdayName('2026-11-01')).toBe('Sonntag')
  })
})

describe('settlementNote – die letzte Abrechnung ruhig im Helden-Kopf', () => {
  it('zeigt den Tagesschaden bzw. die Heilung mit Wochentag', () => {
    expect(settlementNote(HP, [entry('2026-11-01'), entry('2026-11-02')], TODAY)).toEqual({
      day: '2026-11-02',
      text: nb('Montag: −3 HP'),
      spoken: 'Montag abgerechnet: minus 3 Lebenspunkte',
      tone: 'down',
    })
    // Erfolge werden beim Namen genannt, Verluste bleiben eine leise Zahl.
    const healed = settlementNote(HP, [entry('2026-11-02', { score: 'perfect', hpDelta: 10 })], TODAY)
    expect(healed?.text).toBe(nb('Montag: Perfekter Tag · +10 HP'))
    expect(healed?.spoken).toBe('Montag abgerechnet: Perfekter Tag, plus 10 Lebenspunkte')
    expect(healed?.tone).toBe('up')
    expect(settlementNote(HP, [entry('2026-11-02', { score: 'good', hpDelta: 2 })], TODAY)?.text).toBe(
      nb('Montag: Gut geschafft · +2 HP'),
    )
    expect(settlementNote(HP, [entry('2026-11-02', { score: 'missed', hpDelta: -6 })], TODAY)?.text).toBe(
      nb('Montag: −6 HP'),
    )
    // Level-Up an einem verpassten Tag: Heilung ohne Lob für die Wertung.
    expect(settlementNote(HP, [entry('2026-11-02', { score: 'missed', hpDelta: 12 })], TODAY)?.text).toBe(
      nb('Montag: +12 HP'),
    )
  })

  it('heißt den Helden nach einer längeren Pause willkommen – statt nichts zu sagen', () => {
    const note = settlementNote(HP, [entry('2026-11-02', { score: 'absent', hpDelta: 0, hpAfter: 13 })], TODAY)
    expect(note?.text).toBe('Willkommen zurück – schön, dass du da bist!')
    expect(note?.tone).toBe('up')
    expect(note?.spoken).toContain('ruhen die Lebenspunkte')
  })

  it('nennt einen aufgefangenen Tag und eine Niederlage freundlich', () => {
    expect(settlementNote(HP, [entry('2026-11-02', { frozen: true, hpDelta: 0 })], TODAY)?.text).toBe(
      'Montag: ❄️ vom Streak-Schutz aufgefangen',
    )
    expect(
      settlementNote(HP, [entry('2026-11-02', { hpDelta: -4, hpAfter: 55, defeat: { goldLost: 40 } })], TODAY)?.text,
    ).toBe('Montag: gefallen – wieder bei voller Kraft')
  })

  it('schweigt ohne Wirkung, im Sanften Modus, ohne Abrechnung und bei alten Einträgen', () => {
    expect(settlementNote(HP, [entry('2026-11-02', { score: 'good', hpDelta: 0 })], TODAY)).toBeUndefined()
    expect(settlementNote({ ...HP, enabled: false }, [entry('2026-11-02')], TODAY)).toBeUndefined()
    expect(settlementNote(HP, [entry('2026-11-02', { penalties: false })], TODAY)).toBeUndefined()
    expect(settlementNote({ enabled: true }, [entry('2026-11-02')], TODAY)).toBeUndefined()
    expect(settlementNote({ enabled: true, settledThrough: '2026-10-20' }, [entry('2026-10-20')], TODAY)).toBeUndefined()
    expect(settlementNote(HP, undefined, TODAY)).toBeUndefined()
  })
})

describe('yesterdayPreview – Vorschau für den noch offenen Vortag', () => {
  it('erscheint nur, wenn gestern HP kosten würde oder ein Streak-Schutz greifen müsste', () => {
    // Geht davon aus, dass du etwas geschafft und nur nicht abgehakt hast.
    expect(yesterdayPreview({ day: '2026-11-03', score: 'missed', threatenedDelta: -6, savedByFreeze: false })).toEqual({
      title: 'Gestern ist noch offen',
      text: 'Schon erledigt, nur nicht abgehakt? Trag es noch nach.',
      effect: nb('Bleibt es so: −6 HP'),
      savedByFreeze: false,
    })
    const freeze = yesterdayPreview({ day: '2026-11-03', score: 'weak', threatenedDelta: 0, savedByFreeze: true })
    expect(freeze?.savedByFreeze).toBe(true)
    expect(freeze?.effect).toBeUndefined()
    expect(freeze?.text).toContain('Streak-Schutz')
    expect(freeze?.text).toContain('ganz ohne HP\u2011Verlust')

    expect(yesterdayPreview(undefined)).toBeUndefined()
    expect(yesterdayPreview({ day: '2026-11-03', score: 'good', threatenedDelta: 2, savedByFreeze: false })).toBeUndefined()
    // Sanfter Modus: keine drohende Wirkung.
    expect(yesterdayPreview({ day: '2026-11-03', score: 'missed', threatenedDelta: 0, savedByFreeze: false })).toBeUndefined()
  })

  it('erklärt den Ruhetag für gestern (Krankheitstag) – und dass ein Streak-Schutz dann im Beutel bleibt', () => {
    expect(yesterdayRestConfirmText(false)).toContain('Krank, unterwegs oder einfach eine Pause gebraucht?')
    expect(yesterdayRestConfirmText(false)).toContain('Was du gestern erledigt hast, bringt weiter XP.')
    expect(yesterdayRestConfirmText(false)).not.toContain('Streak-Schutz')
    expect(yesterdayRestConfirmText(true)).toContain('Dein ❄️ Streak-Schutz bleibt im Beutel.')
  })

  it('zeigt beim Nachtragen den laufenden Stand', () => {
    expect(backfillStanding({ day: '2026-11-03', score: 'weak', threatenedDelta: -3, savedByFreeze: false })).toBe(
      nb('Stand jetzt: −3 HP · Ein Anfang'),
    )
    expect(backfillStanding({ day: '2026-11-03', score: 'perfect', threatenedDelta: 10, savedByFreeze: false })).toBe(
      nb('Stand jetzt: +10 HP · Perfekter Tag'),
    )
    expect(backfillStanding({ day: '2026-11-03', score: 'missed', threatenedDelta: 0, savedByFreeze: true })).toContain(
      'Streak-Schutz',
    )
    expect(backfillStanding({ day: '2026-11-03', score: 'none', threatenedDelta: 0, savedByFreeze: false })).toBeUndefined()
    expect(backfillStanding(undefined)).toBeUndefined()
  })
})

describe('Rast', () => {
  it('benennt Ruhetag und Urlaub', () => {
    expect(restBannerTitle({ from: TODAY, until: TODAY }, TODAY, TODAY)).toBe('Heute ist Ruhetag')
    expect(restBannerTitle({ from: '2026-11-02', until: '2026-11-06' }, TODAY, TODAY)).toBe('Urlaub · bis Freitag, 6. Nov.')
    expect(restBannerTitle({ from: '2026-11-02', until: TODAY }, TODAY, TODAY)).toBe('Urlaub · letzter Tag')
    expect(restBannerTitle({ from: '2026-11-03', until: '2026-11-03' }, '2026-11-03', TODAY)).toBe('Gestern war Ruhetag')
  })

  it('wünscht im Banner gute Erholung bzw. einen schönen Urlaub', () => {
    expect(restBannerText(TODAY, TODAY, { from: TODAY, until: TODAY })).toMatch(/^Erhol dich gut! Nichts ist heute Pflicht/)
    expect(restBannerText(TODAY, TODAY, { from: '2026-11-02', until: '2026-11-06' })).toMatch(/^Genieß die Zeit!/)
    expect(restBannerText(TODAY, TODAY)).toMatch(/^Erhol dich gut!/)
    expect(restBannerText('2026-11-03', TODAY, { from: '2026-11-03', until: '2026-11-03' })).toBe(
      'Nichts war Pflicht – nachgetragene Quests bringen trotzdem XP.',
    )
  })

  it('erklärt in der Rückfrage, was ein Ruhetag bedeutet', () => {
    expect(restConfirmText(false)).toContain('Nichts ist Pflicht')
    expect(restConfirmText(false)).not.toContain('Perfekten Tag')
    expect(restConfirmText(true)).toContain('Einen Perfekten Tag gibt es an einem Ruhetag allerdings nicht.')
  })

  it('bietet „Ruhetag aufheben“ nur für einen eintägigen Ruhetag genau heute an', () => {
    expect(canUndoRestToday({ from: TODAY, until: TODAY }, TODAY)).toBe(true)
    expect(canUndoRestToday({ from: '2026-11-03', until: TODAY }, TODAY)).toBe(false)
    expect(canUndoRestToday({ from: TODAY, until: '2026-11-05' }, TODAY)).toBe(false)
    expect(canUndoRestToday(undefined, TODAY)).toBe(false)
  })
})

describe('hpIntroPoints – Einführung „Neu: Lebenspunkte“', () => {
  it('erklärt Tageswertung (Heilung zuerst), Wochenquests, Gnadenfrist, Pause und Niederlage mit den echten Zahlen', () => {
    const points = hpIntroPoints()
    expect(points.map((point) => point.title)).toEqual(['Eine Wertung pro Tag', 'Wochenquests', 'Gnadenfrist', 'Pause', 'Bei 0 HP'])
    const text = points
      .map((point) => `${point.title} ${point.text}`)
      .join(' | ')
      .replace(/\u00a0/g, ' ')
    expect(text).toContain('Ein Perfekter Tag heilt +10 HP, die Hälfte bringt +2 HP, sonst höchstens −6 HP')
    // Das Gute steht vor dem Höchstverlust.
    expect(text.indexOf('+10 HP')).toBeLessThan(text.indexOf('−6 HP'))
    expect(text).toContain('Wochenquests kosten nie Lebenspunkte')
    expect(text).toContain('Gnadenfrist')
    expect(text).toContain('Ein Ruhetag schont Lebenspunkte und Serien')
    expect(text).toContain('ab dem 8. Tag')
    expect(text).toContain('stehst du mit vollen Lebenspunkten wieder auf. 15 % deines Goldes')
    expect(text).toContain('Level, XP und Serien bleiben')
  })
})

describe('goodDayMilestone – Zwischenziel „guter Tag“', () => {
  it('zeigt, ab wie vielen Tagesquests der Tag gut ist (die Hälfte, ganzzahlig wie die Abrechnung)', () => {
    expect(goodDayMilestone(7, 0)).toEqual({ reached: false, text: nb('Ab 4 von 7: guter Tag · +2 HP') })
    expect(goodDayMilestone(7, 3)).toEqual({ reached: false, text: nb('Ab 4 von 7: guter Tag · +2 HP') })
    // 2 von 4 ist genau die Hälfte.
    expect(goodDayMilestone(4, 1)?.text).toBe(nb('Ab 2 von 4: guter Tag · +2 HP'))
    expect(goodDayMilestone(2, 0)?.text).toBe(nb('Ab 1 von 2: guter Tag · +2 HP'))
  })

  it('feiert die erreichte Hälfte und schweigt bei perfekt bzw. ohne Zwischenstufe', () => {
    expect(goodDayMilestone(7, 4)).toEqual({ reached: true, text: nb('Guter Tag geschafft · +2 HP') })
    expect(goodDayMilestone(4, 2)?.reached).toBe(true)
    expect(goodDayMilestone(7, 7)).toBeUndefined()
    expect(goodDayMilestone(1, 0)).toBeUndefined()
    expect(goodDayMilestone(0, 0)).toBeUndefined()
    expect(goodDayMilestone(Number.NaN, 0)).toBeUndefined()
  })
})

describe('freezeStockTitle', () => {
  it('nennt den Vorrat an Streak-Schutz', () => {
    expect(freezeStockTitle(1)).toBe('1 Streak-Schutz im Beutel – fängt einen schwachen Tag auf')
    expect(freezeStockTitle(3)).toBe('3 Streak-Schutz im Beutel – fangen schwache Tage auf')
  })
})
