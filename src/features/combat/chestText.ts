/**
 * Texte zu Truhen (Phase 3a): Fundort und Inhalt in Worten – rein, ohne React. Genutzt vom Truhen-Dialog und den
 * Rückmeldungen („Truhe gefunden“, Siegesszene).
 */
import { BALANCING } from '../../domain/balancing'
import { bossById } from '../../domain/combat/boss'
import { FRAMES, TITLES } from '../../domain/combat/cosmeticDefinitions'
import type {
  BossVictory,
  Chest,
  ChestContent,
  FrameDefinition,
  GrammaticalForm,
  Habit,
  MainQuest,
  TitleDefinition,
  WeeklyBossState,
} from '../../domain/types'
import { formatNumber } from '../../ui/format'
import { heroWithTitle, titleNameIn } from './combatText'

/** Woher die Daten für den Fundort kommen (alles optional – ohne Treffer gibt es eine allgemeine Zeile). */
export interface ChestSourceContext {
  habits?: readonly Pick<Habit, 'id' | 'title' | 'icon'>[]
  mainQuests?: readonly Pick<MainQuest, 'id' | 'title' | 'icon' | 'chapters'>[]
  victories?: readonly Pick<BossVictory, 'weekStart' | 'bossId'>[]
  /** Bosse im Spielzustand (`state.bosses.current/previous`) – kennen auch noch nicht gespeicherte Siege. */
  bosses?: readonly (WeeklyBossState | undefined)[]
}

/** „Boss-Truhe“ / „Quest-Truhe“ / „Kapitel-Truhe“ (wie in der Sammlung). */
export const CHEST_SOURCE_LABELS: Record<Chest['source'], string> = {
  boss: 'Boss-Truhe',
  quest: 'Quest-Truhe',
  chapter: 'Kapitel-Truhe',
}

/**
 * Wofür es die Truhe gab – aus ihrer deterministischen ID: „🛋️ Sofagolem besiegt“, „📖 Lesen“,
 * „📚 Kapitel „Erste Seiten““. Unbekanntes → „Wochen-Boss besiegt“ / „Eine erledigte Quest“ / „Ein abgeschlossenes Kapitel“.
 */
export function chestSourceLine(chest: Pick<Chest, 'id' | 'source'>, context: ChestSourceContext): string {
  const source = chest.source
  const rest = chest.id.startsWith(`${source}:`) ? chest.id.slice(source.length + 1) : chest.id
  if (source === 'boss') {
    const live = context.bosses?.find((boss) => boss?.weekStart === rest)
    const victory = context.victories?.find((entry) => entry.weekStart === rest)
    const boss = live?.boss ?? (victory ? bossById(victory.bossId) : undefined)
    return boss ? `${boss.icon} ${boss.name} besiegt` : 'Wochen-Boss besiegt'
  }
  if (source === 'chapter') {
    for (const quest of context.mainQuests ?? []) {
      if (!rest.startsWith(`${quest.id}:`)) continue
      const chapter = quest.chapters.find((entry) => rest === `${quest.id}:${entry.id}`)
      if (chapter) return `${quest.icon} Kapitel „${chapter.title}“`
    }
    return 'Ein abgeschlossenes Kapitel'
  }
  // Quest-Truhe: `quest:<Erledigung>`, die ID einer Erledigung ist `<habitId>:<Tag>`.
  const habit = context.habits?.find((entry) => rest.startsWith(`${entry.id}:`))
  return habit ? `${habit.icon} ${habit.title}` : 'Eine erledigte Quest'
}

/** Inhalt einer geöffneten Truhe für die Enthüllung. */
export interface ChestReveal {
  kind: 'gold' | 'item' | 'title' | 'frame'
  /** Emoji der Beute (Gold/Streak-Schutz/Titel; der Rahmen zeigt sich selbst). */
  icon: string
  /** Kleine Zeile über dem Namen: „Gold“, „Gegenstand“, „Neuer Titel“, „Neuer Rahmen“. */
  label: string
  /** Groß: „+45 Gold“, „Streak-Schutz“, „die Zeitlose“, „Sternenstaub“. */
  name: string
  /** Erklärung darunter. */
  detail: string
  /** Vorgelesen (Live-Region): „In der Truhe: 45 Gold.“ */
  spoken: string
  /** Nur Titel/Rahmen: was sich anlegen lässt. */
  cosmetic?: { kind: 'title' | 'frame'; id: string }
}

export interface ChestRevealContext {
  form?: GrammaticalForm
  /** Name des Helden – für die Vorschau „Aria, die Zeitlose“. */
  heroName?: string
  /** Die Truhe versprach einen Streak-Schutz, der Beutel war aber voll – stattdessen Gold. */
  freezeFallback?: boolean
  /** Streak-Schutz im Beutel (nach dem Öffnen). */
  streakFreezes?: number
  titles?: readonly TitleDefinition[]
  frames?: readonly FrameDefinition[]
}

/** Was in der Truhe war – Gold, Streak-Schutz, Titel (in der Sprachform) oder Rahmen. */
export function chestReveal(content: ChestContent, context: ChestRevealContext = {}): ChestReveal {
  if (content.kind === 'gold') {
    const amount = formatNumber(Math.max(0, Math.round(content.amount)))
    return {
      kind: 'gold',
      icon: '🪙',
      label: 'Gold',
      name: `+${amount} Gold`,
      detail: context.freezeFallback
        ? `Dein Beutel war schon voll mit Streak-Schutz (${formatNumber(BALANCING.items.streakFreeze.max)}) – dafür gibt es Gold.`
        : 'Es liegt schon in deiner Schatzkammer.',
      spoken: `In der Truhe: ${amount} Gold.`,
    }
  }
  if (content.kind === 'item') {
    const stock =
      context.streakFreezes !== undefined
        ? ` Im Beutel: ${formatNumber(Math.max(0, context.streakFreezes))} / ${formatNumber(BALANCING.items.streakFreeze.max)}.`
        : ''
    return {
      kind: 'item',
      icon: '❄️',
      label: 'Gegenstand',
      name: 'Streak-Schutz',
      detail: `Fängt einen schwachen Tag von selbst auf – deine Serien bleiben bestehen.${stock}`,
      spoken: 'In der Truhe: ein Streak-Schutz.',
    }
  }
  if (content.cosmeticKind === 'title') {
    const title = (context.titles ?? TITLES).find((entry) => entry.id === content.cosmeticId)
    const name = title ? titleNameIn(title, context.form) : 'Ein neuer Titel'
    return {
      kind: 'title',
      icon: '🎖️',
      label: 'Neuer Titel',
      name,
      detail:
        title && context.heroName
          ? `So klingt es: ${heroWithTitle(context.heroName, title, context.form)}`
          : 'Du kannst ihn jederzeit in deiner Sammlung anlegen.',
      spoken: title ? `In der Truhe: der Titel „${name}“.` : 'In der Truhe: ein neuer Titel.',
      cosmetic: { kind: 'title', id: content.cosmeticId },
    }
  }
  const frame = (context.frames ?? FRAMES).find((entry) => entry.id === content.cosmeticId)
  const name = frame?.name ?? 'Ein neuer Rahmen'
  return {
    kind: 'frame',
    icon: '🖼️',
    label: 'Neuer Rahmen',
    name,
    detail: 'Ein Ring um dein Heldenbild – zu sehen auf „Heute“ und auf deiner Heldenseite.',
    spoken: frame ? `In der Truhe: der Rahmen „${name}“.` : 'In der Truhe: ein neuer Rahmen.',
    cosmetic: { kind: 'frame', id: content.cosmeticId },
  }
}
