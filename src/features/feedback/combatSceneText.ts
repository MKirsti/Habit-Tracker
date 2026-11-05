/**
 * Texte der Kampf-Rückmeldungen (Phase 3a): Siegesszene, Klassenwechsel-Szene und „Truhe gefunden“ – Phase 3b:
 * Endgegner-Siegesszene und Entwicklung des Gefährten. Rein, damit testbar. Klassennamen in der Sprachform des Helden (`CharacterProfile.form`).
 */
import type { ChestRarity, GrammaticalForm } from '../../domain/types'
import { chestName, chestsFoundTitle, classBonusLines, classChangeKind, classDativeIn, classNameIn } from '../combat/combatText'
import type { ClassChangeKind } from '../combat/combatText'
import { formatNumber } from '../../ui/format'
import type { BossDefeatedEvent, ClassChangedEvent } from './combatFeedback'
import { stageLine, TOP_COMPANION_STAGE } from './companionTheme'
import type { CompanionEvolvedEvent } from './companionFeedback'
import type { EndBossDefeatedEvent } from './endBossFeedback'
import type { ToastText } from './feedbackText'

export interface BossVictorySceneText {
  eyebrow: string
  /** „Sofagolem ist besiegt!“ */
  title: string
  /** Der Siegessatz des Bosses. */
  line: string
  /** „120 HP bezwungen“ */
  hpBadge: string
  /** Nur beim Vorwochen-Boss: Nachtragen hat gezählt. */
  note?: string
}

export function bossVictorySceneText(event: Pick<BossDefeatedEvent, 'name' | 'defeatLine' | 'maxHp' | 'lastWeek'>): BossVictorySceneText {
  const text: BossVictorySceneText = {
    eyebrow: event.lastWeek ? 'Boss der Vorwoche besiegt' : 'Boss besiegt',
    title: `${event.name} ist besiegt!`,
    line: event.defeatLine,
    hpBadge: `${formatNumber(Math.max(0, Math.round(event.maxHp)))} HP bezwungen`,
  }
  if (event.lastWeek) text.note = 'Nachgetragen zählt – der Sieg gehört dir.'
  return text
}

/** Texte rund um die Truhe in der Siegesszene. */
export const VICTORY_CHEST_TEXT = {
  found: 'Truhe gefunden',
  open: 'Truhe öffnen',
  later: 'Du kannst sie auch später in deiner Sammlung öffnen.',
} as const

/** „Geöffnet: +45 Gold“ – nach dem Öffnen in der Siegesszene. */
export function openedChestLine(revealName: string): string {
  return `Geöffnet: ${revealName}`
}

export interface ClassChangeSceneText {
  kind: ClassChangeKind
  eyebrow: string
  /** „Du bist zur Erzmagierin aufgestiegen!“ / „Deine Klasse ist erwacht!“ / „Dein Weg hat sich gewandelt“ */
  title: string
  /** „Ab dieser Woche kämpfst du als Magierin.“ – fehlt, wenn der Titel die Klasse schon nennt. */
  line?: string
  from: { icon: string; name: string }
  to: { icon: string; name: string }
  /** Vorgelesen statt des Pfeils: „Bisher Magierin, jetzt Erzmagierin.“ */
  changeSpoken: string
  description: string
  /** „+10 % Arkaner Blitz“ … */
  bonus: string[]
}

/**
 * Klassenwechsel zu Wochenbeginn: vom Abenteurer → „Deine Klasse ist erwacht!“, von der Grund- zur passenden
 * Hybridklasse → „Du bist zur Erzmagierin aufgestiegen!“, sonst → „Dein Weg hat sich gewandelt“. Nie wertend: Auch
 * ein Wechsel zu einer „kleineren“ Klasse ist einfach ein neuer Weg.
 */
export function classChangeSceneText(
  event: Pick<ClassChangedEvent, 'from' | 'to' | 'classBonus'>,
  form?: GrammaticalForm,
): ClassChangeSceneText {
  const kind = classChangeKind(event.from, event.to)
  const toName = classNameIn(event.to, form)
  const fromName = classNameIn(event.from, form)
  const asClass = `Ab dieser Woche kämpfst du als ${toName}.`
  const base = {
    kind,
    from: { icon: event.from.icon, name: fromName },
    to: { icon: event.to.icon, name: toName },
    changeSpoken: `Bisher ${fromName}, jetzt ${toName}.`,
    description: event.to.description,
    bonus: classBonusLines(event.to, event.classBonus),
  }
  if (kind === 'awakened') return { ...base, eyebrow: 'Deine Klasse erwacht', title: 'Deine Klasse ist erwacht!', line: asClass }
  if (kind === 'ascended') {
    const dative = classDativeIn(event.to, form)
    return dative !== undefined
      ? { ...base, eyebrow: 'Klassenaufstieg', title: `Du bist ${dative} aufgestiegen!` }
      : { ...base, eyebrow: 'Klassenaufstieg', title: 'Du bist aufgestiegen!', line: asClass }
  }
  return { ...base, eyebrow: 'Neue Woche, neuer Weg', title: 'Dein Weg hat sich gewandelt', line: asClass }
}

/** Eine neu gefundene Truhe für den Toast: Seltenheit und wofür („📖 Lesen“, „📚 Kapitel „Erste Seiten““). */
export interface FoundChestInfo {
  rarity: ChestRarity
  sourceLine: string
}

/**
 * „Truhe gefunden!“ · „Seltene Truhe · 📖 Lesen – öffne sie in deiner Sammlung.“ (mehrere: „2 Truhen gefunden!“ ·
 * „Öffne sie in deiner Sammlung.“).
 */
export function chestFoundToastText(chests: readonly FoundChestInfo[]): ToastText {
  if (chests.length === 1) {
    const [chest] = chests
    return { title: chestsFoundTitle(1), description: `${chestName(chest.rarity)} · ${chest.sourceLine} – öffne sie in deiner Sammlung.` }
  }
  return { title: chestsFoundTitle(chests.length), description: 'Öffne sie in deiner Sammlung.' }
}

// ---------------------------------------------------------------------------
// Phase 3b: Endgegner besiegt, Entwicklung des Gefährten
// ---------------------------------------------------------------------------

export interface EndBossVictorySceneText {
  eyebrow: string
  /** „Der Bibliothekar der Ewigkeit ist besiegt!“ */
  title: string
  /** Der Siegessatz des Endgegners. */
  line: string
  /** „📚 Der Weg des Gelehrten“ – die Kampagne, an deren Ende er wartete. */
  campaign: string
  /** Wie es weitergeht: gleich die Kampagnen-Szene bzw. die noch offenen Kapitel. */
  note: string
}

/**
 * Endgegner besiegt (letztes Kapitel einer Kampagne): „… ist besiegt!“, sein Siegessatz, die Kampagne – und der Blick
 * nach vorn (die Kampagne ist gemeistert bzw. ein paar Kapitel warten noch).
 */
export function endBossVictorySceneText(
  event: Pick<EndBossDefeatedEvent, 'name' | 'defeatLine' | 'campaignTitle' | 'campaignIcon' | 'campaignComplete'>,
): EndBossVictorySceneText {
  return {
    eyebrow: 'Endgegner besiegt',
    title: `${event.name} ist besiegt!`,
    line: event.defeatLine,
    campaign: `${event.campaignIcon} ${event.campaignTitle}`,
    note: event.campaignComplete
      ? 'Das letzte Kapitel ist geschafft – deine Kampagne ist gemeistert!'
      : 'Ein paar Kapitel warten noch – dann ist deine Kampagne gemeistert.',
  }
}

export interface EvolutionSceneText {
  eyebrow: string
  /** „Krümel ist gewachsen!“ */
  title: string
  from: string
  to: string
  /** Vorgelesen statt des Pfeils: „Bisher Wuselwicht, jetzt Glitzerpfote.“ */
  changeSpoken: string
  /** „Stufe 2 von 4 · Gefährte“ */
  stage: string
  description: string
  /** „Nächste Stufe in 46 aktiven Tagen.“ bzw. auf der höchsten Stufe ein Abschluss. */
  next: string
}

/**
 * Entwicklung des Gefährten: der Name (ohne Pronomen – er ist frei gewählt), alte → neue Stufe, die Stufe in Worten,
 * ihr Text und wie weit es bis zur nächsten ist. Auf der höchsten Stufe: legendär.
 */
export function evolutionSceneText(
  event: Pick<CompanionEvolvedEvent, 'name' | 'to' | 'fromName' | 'toName' | 'description' | 'daysToNextStage'>,
): EvolutionSceneText {
  const top = event.to >= TOP_COMPANION_STAGE
  const days = event.daysToNextStage
  return {
    eyebrow: top ? 'Legendärer Gefährte' : 'Dein Gefährte wächst',
    title: top ? `${event.name} ist legendär!` : `${event.name} ist gewachsen!`,
    from: event.fromName,
    to: event.toName,
    changeSpoken: `Bisher ${event.fromName}, jetzt ${event.toName}.`,
    stage: stageLine(event.to),
    description: event.description,
    next:
      top || days === undefined
        ? 'Die höchste Stufe – an deiner Seite für alle Abenteuer, die noch kommen.'
        : days === 1
          ? 'Noch ein aktiver Tag bis zur nächsten Stufe.'
          : `Nächste Stufe in ${formatNumber(days)} aktiven Tagen.`,
  }
}
