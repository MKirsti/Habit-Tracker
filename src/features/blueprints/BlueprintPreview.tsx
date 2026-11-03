import { CalendarClock, Flame, Gift, Link2, Sparkles, Sprout } from 'lucide-react'
import { useId } from 'react'
import type { BlueprintContent, BlueprintLevel, BlueprintQuest } from '../../data/blueprints'
import { BLUEPRINT_LEVEL_LABELS } from '../../data/blueprints'
import { ATTRIBUTES } from '../../domain/attributes'
import { BALANCING } from '../../domain/balancing'
import { addDays } from '../../domain/dates'
import { describeSchedule, questXp } from '../../domain/schedule'
import type { DayKey, Habit } from '../../domain/types'
import { cn, formatNumber } from '../../ui'
import { countLabel, criterionSummary, durationLabel, formatDeadline, measureText } from './blueprintText'
import { otherLevel as flipLevel } from './levelCompare'
import type { LevelComparison, QuestLevelDelta } from './levelCompare'

export interface BlueprintPreviewProps {
  /** Inhalt aus `blueprint.build(options)`. */
  content: BlueprintContent
  durationDays: number
  /** Starttag (heutiger Spieltag) – daraus das Zieldatum. */
  today: DayKey
  /**
   * Vorhandene Quests, die statt einer neuen mitbenutzt würden (Titel der Vorlage-Quest → Quest).
   * Siehe `findSharedHabit`.
   */
  sharedHabits?: ReadonlyMap<string, Habit>
  /**
   * Zu geteilten Quests: Titel der aktiven Kampagne, der die vorhandene Quest gehört (Quest-ID → Titel). Fehlt
   * ein Eintrag, wird die Quest übernommen (sie gehört zu keiner aktiven Kampagne).
   */
  sharedOwners?: ReadonlyMap<string, string>
  /**
   * Vergleich mit der anderen Stufe (`compareLevels`): Abweichende Startwerte und Quests, die es nur in einer
   * Stufe gibt, sind markiert – so sieht man beim Stufenwechsel sofort, was sich ändert.
   */
  comparison?: LevelComparison
  className?: string
}

const LEVEL_ICON: Record<BlueprintLevel, typeof Sprout> = { beginner: Sprout, advanced: Flame }

/**
 * Live-Vorschau einer Vorlage: Kampagnen-Titel, Laufzeit bis zum Zieldatum, Quests (Rhythmus, Ziel,
 * Attribut, XP) und Kapitel mit ihren Zielen. Geteilte Quests sind markiert.
 */
export function BlueprintPreview({
  content,
  durationDays,
  today,
  sharedHabits,
  sharedOwners,
  comparison,
  className,
}: BlueprintPreviewProps) {
  const id = useId()
  const questsId = `${id}-quests`
  const chaptersId = `${id}-chapters`
  const questsByKey = new Map(content.quests.map((quest) => [quest.key, quest]))
  const deadline = addDays(today, durationDays)

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border bg-bg-deep/45 p-4 shadow-[inset_0_1px_0_rgb(255_236_200/0.04)] sm:p-5',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold/10 text-2xl leading-none ring-1 ring-gold/30 ring-inset"
        >
          {content.icon}
        </span>
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-semibold tracking-[0.16em] text-muted uppercase">Deine Kampagne</p>
          <p className="font-display text-base leading-snug font-semibold tracking-wide text-parchment">{content.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.8125rem] text-muted">
            <CalendarClock aria-hidden="true" className="size-3.5 shrink-0 text-gold/80" />
            <span>
              {durationLabel(durationDays)} · bis {formatDeadline(deadline)}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 sm:gap-6">
        <section aria-labelledby={questsId} className="min-w-0">
          <h4 id={questsId} className="mb-2.5 text-xs font-semibold tracking-[0.16em] text-gold uppercase">
            {countLabel(content.quests.length, 'Quest', 'Quests')}
          </h4>
          <ul role="list" className="flex flex-col gap-3">
            {content.quests.map((quest) => {
              const shared = sharedHabits?.get(quest.title)
              return (
                <QuestPreviewRow
                  key={quest.key}
                  quest={quest}
                  shared={shared}
                  sharedOwner={shared === undefined ? undefined : sharedOwners?.get(shared.id)}
                  delta={comparison?.quests.get(quest.key)}
                  otherLevel={comparison?.otherLevel}
                />
              )
            })}
          </ul>
          {comparison !== undefined && comparison.missing.length > 0 && (
            <p className="mt-3 flex items-start gap-1.5 text-xs leading-snug text-muted">
              <LevelIcon level={comparison.otherLevel} />
              <span>
                Bei {BLUEPRINT_LEVEL_LABELS[comparison.otherLevel]} zusätzlich:{' '}
                {comparison.missing.map((quest, index) => (
                  <span key={quest.key}>
                    {index > 0 && ', '}
                    <span aria-hidden="true">{quest.icon} </span>
                    {quest.title}
                  </span>
                ))}
              </span>
            </p>
          )}
        </section>

        <section aria-labelledby={chaptersId} className="min-w-0">
          <h4 id={chaptersId} className="mb-2.5 text-xs font-semibold tracking-[0.16em] text-gold uppercase">
            {countLabel(content.chapters.length, 'Kapitel', 'Kapitel')}
          </h4>
          <ol className="flex flex-col gap-2.5">
            {content.chapters.map((chapter, index) => {
              const { criterion } = chapter
              const quest = criterion.type === 'habit' ? questsByKey.get(criterion.questKey) : undefined
              return (
                <li key={`${index}-${chapter.title}`} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-px grid size-6 shrink-0 place-items-center rounded-full border border-gold/35 bg-gold/10 font-display text-[0.6875rem] font-semibold text-gold-bright tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm leading-snug text-parchment">{chapter.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {quest !== undefined && (
                        <span aria-hidden="true" className="mr-1">
                          {quest.icon}
                        </span>
                      )}
                      {criterionSummary(criterion, questsByKey)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      </div>

      <div className="mt-5 flex flex-col gap-1.5 border-t border-border/70 pt-3.5 text-xs text-muted">
        <p className="flex items-start gap-1.5">
          <Sparkles aria-hidden="true" className="mt-px size-3.5 shrink-0 text-gold" />
          <span>
            +{formatNumber(BALANCING.chapterXp)} XP pro Kapitel · +{formatNumber(BALANCING.mainQuestXp)} XP für die
            ganze Kampagne
          </span>
        </p>
        <p className="flex items-start gap-1.5">
          <Gift aria-hidden="true" className="mt-px size-3.5 shrink-0 text-gold" />
          <span>
            Belohnung: {content.reward} (später änderbar)
          </span>
        </p>
      </div>
    </div>
  )
}

function LevelIcon({ level, className }: { level: BlueprintLevel; className?: string }) {
  const Icon = LEVEL_ICON[level]
  return <Icon aria-hidden="true" className={cn('mt-px size-3.5 shrink-0 text-gold/80', className)} />
}

function QuestPreviewRow({
  quest,
  shared,
  sharedOwner,
  delta,
  otherLevel,
}: {
  quest: BlueprintQuest
  shared?: Habit
  sharedOwner?: string
  delta?: QuestLevelDelta
  otherLevel?: BlueprintLevel
}) {
  // Eine geteilte Quest wird mit ihren eigenen Einstellungen mitbenutzt – die Vorschau zeigt also diese.
  const shown = shared ?? quest
  const thisLevel = otherLevel === undefined ? undefined : flipLevel(otherLevel)
  const attribute = ATTRIBUTES[shown.attribute]
  const details = [attribute.name, describeSchedule(shown.schedule), shown.measure ? measureText(shown.measure) : undefined]
    .filter((part) => part !== undefined)
    .join(' · ')
  return (
    <li data-quest={quest.key} className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-black/25 text-lg leading-none ring-1 ring-white/6 ring-inset"
      >
        {shown.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 text-sm leading-snug font-medium text-parchment">
            {quest.title}
            {delta?.kind === 'only' && thisLevel !== undefined && (
              <span className="ml-1.5 inline-flex translate-y-[-1px] items-center rounded-full border border-gold/35 bg-gold/10 px-1.5 py-px align-middle text-[0.625rem] font-semibold tracking-wide whitespace-nowrap text-gold-bright">
                Nur {BLUEPRINT_LEVEL_LABELS[thisLevel]}
              </span>
            )}
          </span>
          <span className="shrink-0 text-xs leading-5 font-semibold text-gold-bright tabular-nums">
            +{formatNumber(questXp(shown.difficulty))} XP
          </span>
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: attribute.color, boxShadow: `0 0 6px ${attribute.color}` }}
          />
          <span className="min-w-0">{details}</span>
        </p>
        {/* Bei geteilten Quests gelten ihre eigenen Einstellungen – ein Stufen-Vergleich wäre irreführend. */}
        {shared === undefined && delta?.kind === 'changed' && otherLevel !== undefined && (
          <p data-level-delta className="mt-0.5 flex items-start gap-1 text-[0.6875rem] leading-snug text-muted">
            <LevelIcon level={otherLevel} className="size-3 text-gold/70" />
            <span>
              <span className="sr-only">Stufe </span>
              {BLUEPRINT_LEVEL_LABELS[otherLevel]}: {delta.other}
            </span>
          </p>
        )}
        {shared !== undefined && (
          <p className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-info/25 bg-info/8 px-2 py-1.5 text-xs leading-snug text-info">
            <Link2 aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            <span>
              {sharedOwner !== undefined
                ? `Hast du schon für „${sharedOwner}“ – sie zählt mit deinen Einstellungen für beide Kampagnen, nichts wird verdoppelt.`
                : 'Hast du schon – deine Quest wird mit ihren Einstellungen und ihrem Verlauf übernommen, nicht verdoppelt.'}
            </span>
          </p>
        )}
      </div>
    </li>
  )
}
