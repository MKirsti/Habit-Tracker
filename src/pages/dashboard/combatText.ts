/**
 * Texte und kleine Berechnungen rund um Klasse, Wochen-Boss und Beute auf der Tagesübersicht (Phase 3a): Helden-Kopf,
 * Boss-Karte, Treffer-Anzeige, Montags-Hinweis, Einführung. Rein (ohne React), damit einzeln testbar.
 *
 * Ton: verspielt und warm. Ein entkommener Boss kostet nichts – Texte darüber zwinkern und schauen nach vorn, sie
 * beschämen nie. Klassen- und Titelnamen erscheinen in der Sprachform des Helden (`CharacterProfile.form`).
 */
import { ATTRIBUTES } from '../../domain/attributes'
import { BALANCING } from '../../domain/balancing'
import { ATTACK_NAMES } from '../../domain/combat/classDefinitions'
import { classNameFor } from '../../domain/combat/classes'
import { addDays, isoWeekday, startOfWeek } from '../../domain/dates'
import type {
  AttackEvent,
  AttributeId,
  BossVictory,
  DayKey,
  GrammaticalForm,
  HeroClassState,
  WeeklyBossState,
} from '../../domain/types'
import { formatNumber } from '../../ui'

// ---------------------------------------------------------------------------
// Klasse im Helden-Kopf
// ---------------------------------------------------------------------------

/** Klasse in der Sprachform des Helden: `{ icon: '🔮', name: 'Magierin' }`. */
export function heroClassLabel(heroClass: Pick<HeroClassState, 'definition'>, form?: GrammaticalForm) {
  return { icon: heroClass.definition.icon, name: classNameFor(heroClass.definition, form) }
}

/** Vorgelesene Level-und-Klasse-Zeile: „Level 7, Klasse Magierin“. */
export function levelClassSpoken(level: number, className: string): string {
  return `Level ${formatNumber(level)}, Klasse ${className}`
}

// ---------------------------------------------------------------------------
// Boss-Karte
// ---------------------------------------------------------------------------

/** "84 / 120 HP" – gerundet, nie negativ. */
export function bossHpNumbers(hp: number, maxHp: number): string {
  return `${formatNumber(Math.max(0, Math.round(hp)))} / ${formatNumber(Math.max(0, Math.round(maxHp)))} HP`
}

/** Vorgelesen: „Sofagolem: noch 84 von 120 Lebenspunkten“. */
export function bossHpSpoken(name: string, hp: number, maxHp: number): string {
  return `${name}: noch ${formatNumber(Math.max(0, Math.round(hp)))} von ${formatNumber(Math.max(0, Math.round(maxHp)))} Lebenspunkten`
}

/** Anteil der verbleibenden Boss-Lebenspunkte (0..1) – für den Balken. */
export function bossHpRatio(boss: Pick<WeeklyBossState, 'hp' | 'maxHp'>): number {
  if (!(boss.maxHp > 0)) return 0
  return Math.min(1, Math.max(0, boss.hp / boss.maxHp))
}

/** Restzeit der Woche (inklusive heute): „noch 5 Tage“, am Sonntag „Letzter Tag“. */
export function daysLeftText(daysLeft: number): string {
  const n = Math.max(0, Math.round(daysLeft))
  if (n <= 1) return 'Letzter Tag'
  return `noch ${formatNumber(n)} Tage`
}

/** Angriffssymbol einer Attribut-Art (das Attribut-Symbol, z. B. 🧠 für den Arkanen Blitz). */
export function attackIcon(attribute: AttributeId): string {
  return ATTRIBUTES[attribute]?.icon ?? '⚔️'
}

/**
 * Schwäche als kurze Zeile – benannt nach dem **Attribut**, denn so stehen die Quests in der Liste („● Vitalität“):
 * Auf einen Blick ist klar, welche Quests diese Woche härter treffen. Der Angriffsname (`ATTACK_NAMES`) erscheint
 * beim Treffer und im Tooltip:
 * `{ icon: '❤️', label: 'Vitalität', title: 'Schwäche: Vitalität – Lebensfunke trifft 1,5-fach' }`.
 */
export function weaknessInfo(attribute: AttributeId) {
  const meta = ATTRIBUTES[attribute]
  const attackName = ATTACK_NAMES[attribute] ?? meta?.name ?? attribute
  const multiplier = BALANCING.combat.weaknessMultiplier.toLocaleString('de-DE')
  return {
    icon: attackIcon(attribute),
    label: meta?.name ?? attackName,
    color: meta?.color,
    title: `Schwäche: ${meta?.name ?? attackName} – ${attackName} trifft ${multiplier}-fach`,
  }
}

/** Hinweis auf die Beute, solange der Boss steht. */
export const CHEST_ON_VICTORY_TEXT = 'Truhe beim Sieg'

/** Ohne geplanten Schaden in dieser Woche (keine Pflicht-Quests, nur Ruhetage …). */
export function noBossText(hasQuests: boolean): { title: string; text: string } {
  return hasQuests
    ? { title: 'Kein Boss in Sicht', text: 'Diese Woche steht nichts an – genieß die Ruhe. Am Montag zieht ein neuer Gegner auf.' }
    : { title: 'Kein Boss in Sicht', text: 'Sobald Quests anstehen, stellt sich dir jede Woche ein Boss in den Weg.' }
}

/** Nach dem Sieg: wann der nächste Gegner kommt. */
export const NEXT_BOSS_TEXT = 'Am Montag zieht ein neuer Gegner auf.'

/** Link zu den ungeöffneten Truhen: „Truhe öffnen“ / „3 Truhen öffnen“. */
export function unopenedChestsLabel(count: number): string {
  const n = Math.max(0, Math.round(count))
  return n === 1 ? 'Truhe öffnen' : `${formatNumber(n)} Truhen öffnen`
}

/** Vorgelesen: „1 ungeöffnete Truhe – in der Sammlung öffnen“. */
export function unopenedChestsSpoken(count: number): string {
  const n = Math.max(0, Math.round(count))
  return `${formatNumber(n)} ${n === 1 ? 'ungeöffnete Truhe' : 'ungeöffnete Truhen'} – in der Sammlung öffnen`
}

/** Ziel der Truhen-Links: Held → Sammlung. */
export const COLLECTION_PATH = '/held?tab=sammlung'

// ---------------------------------------------------------------------------
// Treffer-Anzeige
// ---------------------------------------------------------------------------

/** Mehr neue Angriffe auf einmal (Backup, Nachtragen vieler Quests) zeigen keine Treffer – wie `BULK_CHANGE_LIMIT`. */
export const HIT_BULK_LIMIT = 3

/** Eindeutiger Schlüssel eines Angriffs innerhalb der Woche. */
export function attackKey(attack: Pick<AttackEvent, 'source' | 'sourceId' | 'day'>): string {
  return `${attack.source}:${attack.sourceId}:${attack.day}`
}

/** Was die Treffer-Anzeige vom vorigen Stand braucht. */
export interface BossSnapshot {
  weekStart: DayKey
  bossId: string
  defeated: boolean
  keys: ReadonlySet<string>
}

export function bossSnapshot(boss: WeeklyBossState | undefined): BossSnapshot | undefined {
  if (boss === undefined) return undefined
  return { weekStart: boss.weekStart, bossId: boss.boss.id, defeated: boss.defeated, keys: new Set(boss.attacks.map(attackKey)) }
}

/**
 * Neue Treffer gegen den Boss seit dem vorigen Stand – nur echte Treffer durch Abhaken: derselbe Boss derselben Woche
 * (kein Wochenwechsel, kein erstes Laden), er stand vorher noch (gegen einen besiegten Boss gibt es keine Treffer
 * mehr) und höchstens `HIT_BULK_LIMIT` neue Angriffe auf einmal (sonst still, z. B. nach dem Einspielen eines
 * Backups). Entfernte Angriffe (Haken wieder weg) zeigen nichts.
 */
export function newBossHits(prev: BossSnapshot | undefined, next: WeeklyBossState | undefined): AttackEvent[] {
  if (prev === undefined || next === undefined) return []
  if (prev.weekStart !== next.weekStart || prev.bossId !== next.boss.id || prev.defeated) return []
  const fresh = next.attacks.filter((attack) => !prev.keys.has(attackKey(attack)) && attack.damage > 0)
  return fresh.length > HIT_BULK_LIMIT ? [] : fresh
}

/** Schaden mit echtem Minuszeichen: „−36“. */
export function damageLabel(damage: number): string {
  return `−${formatNumber(Math.max(0, Math.round(damage)))}`
}

/** Sichtbarer Treffer: „🧠 Arkaner Blitz −36“. */
export function hitText(attack: Pick<AttackEvent, 'attribute' | 'attackName' | 'damage'>): string {
  return `${attackIcon(attack.attribute)} ${attack.attackName} ${damageLabel(attack.damage)}`
}

/** Hervorhebung eines Treffers auf die Schwäche. */
export const WEAK_SPOT_TEXT = 'Schwachstelle!'

/** Vorgelesen: „Treffer gegen Sofagolem: Arkaner Blitz, 36 Schaden. Schwachstelle!“ (+ „Sofagolem ist besiegt!“) */
export function hitSpoken(
  attack: Pick<AttackEvent, 'attackName' | 'damage' | 'weakness'>,
  bossName: string,
  defeated = false,
): string {
  const parts = [`Treffer gegen ${bossName}: ${attack.attackName}, ${formatNumber(Math.max(0, Math.round(attack.damage)))} Schaden.`]
  if (attack.weakness) parts.push(WEAK_SPOT_TEXT)
  if (defeated) parts.push(`${bossName} ist besiegt!`)
  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Montags-Hinweis zur Vorwoche
// ---------------------------------------------------------------------------

export type LastWeekNote =
  | { kind: 'victory'; icon: string; name: string; text: string }
  | {
      kind: 'escaped'
      icon: string
      name: string
      text: string
      /** Gestern (am Montag also der Sonntag) kann noch nachgetragen werden und zählt dann gegen ihn (Gnadenfrist). */
      backfill?: { hpLeft: number; text: string }
    }

/** Boss-Daten, die der Hinweis braucht (ein gespeicherter Sieg kennt nur die `bossId`). */
export interface LastWeekNoteInput {
  today: DayKey
  /** `state.bosses.previous` – nur am Montag da, solange gestern nachtragbar und der Sieg nicht gespeichert ist. */
  previous?: WeeklyBossState
  /** `data.bossVictories`. */
  victories?: readonly BossVictory[]
  /** Boss-Definition zu einer ID (`bossById`). */
  bossById: (id: string) => { icon: string; name: string } | undefined
  /** Gestern ist (noch) wählbar – dann lohnt der Hinweis aufs Nachtragen. */
  canBackfill: boolean
}

/**
 * Kurzer Hinweis am **Montag** zum Boss der Vorwoche: besiegt (gespeichert oder gerade durch Nachtragen) → kleiner
 * Jubel; nicht besiegt → sein augenzwinkernder `escapeLine` – und, solange gestern noch nachtragbar ist, die Einladung,
 * Vergessenes nachzutragen (zählt noch gegen ihn). An anderen Tagen und ohne Boss in der Vorwoche: nichts.
 */
export function lastWeekNote(input: LastWeekNoteInput): LastWeekNote | undefined {
  const { today, previous } = input
  if (isoWeekday(today) !== 1) return undefined
  const lastWeek = startOfWeek(addDays(today, -1))
  const victory = (input.victories ?? []).find((entry) => entry.weekStart === lastWeek)
  if (victory !== undefined || (previous !== undefined && previous.defeated)) {
    const boss = previous?.weekStart === lastWeek ? previous.boss : input.bossById(victory?.bossId ?? '')
    if (boss === undefined) return undefined
    return { kind: 'victory', icon: boss.icon, name: boss.name, text: `Letzte Woche besiegt: ${boss.name} – stark gekämpft!` }
  }
  if (previous === undefined || previous.weekStart !== lastWeek) return undefined
  const note: LastWeekNote = {
    kind: 'escaped',
    icon: previous.boss.icon,
    name: previous.boss.name,
    text: previous.boss.escapeLine,
  }
  if (input.canBackfill && previous.hp > 0) {
    note.backfill = {
      hpLeft: previous.hp,
      text: `Sonntag vergessen abzuhaken? Es zählt noch – ${formatNumber(Math.round(previous.hp))} HP bis zum Sieg.`,
    }
  }
  return note
}

// ---------------------------------------------------------------------------
// Einführung „Neu: Klassen, Bosse & Beute“
// ---------------------------------------------------------------------------

/** Punkte der Einführungskarte – kurz, mit den echten Zahlen aus `BALANCING`. */
export function combatIntroPoints(): { title: string; text: string }[] {
  const { combat, chests } = BALANCING
  const percent = (value: number) => `${Math.round(value * 100).toLocaleString('de-DE')}\u00a0%`
  return [
    {
      title: 'Deine Klasse',
      text: `wächst aus deinen zwei stärksten Attributen. Sie erwacht, sobald eines Level ${combat.classMinLevel} erreicht, und wird jeden Montag neu bestimmt.`,
    },
    {
      title: 'Jede Quest ist ein Angriff:',
      text: `Ihre XP werden zu Schaden, verstärkt durch Attribut-Level und Klasse. Die Schwäche des Bosses trifft ${combat.weaknessMultiplier.toLocaleString('de-DE')}-fach.`,
    },
    {
      title: 'Jeden Montag ein Boss.',
      text:
        'Seine Stärke richtet sich nach deinem Wochenplan, Ruhetage zählen nicht – perfekt musst du dafür nicht sein. Besiegst du ihn bis Sonntag, winkt eine Truhe. Entkommt er, kostet dich das nichts.',
    },
    {
      title: 'Beute:',
      text: `Truhen gibt es für Boss-Siege, Kapitel und mit etwas Glück für Quests (${percent(chests.questDropChance)}). Darin: Gold, Streak-Schutz, Titel und Rahmen.`,
    },
  ]
}
