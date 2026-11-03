import { ArrowRight, Hourglass, Trophy } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import type { MainQuestState } from '../../domain/types'
import { Card, ProgressBar, SectionTitle, buttonClassName, cn, formatNumber } from '../../ui'
import { deadlineText } from './dashboardText'

export interface CampaignSectionProps {
  /** Nicht archivierte Kampagnen (`state.mainQuests`). */
  campaigns: readonly MainQuestState[]
}

/** Abschnitt „Kampagne“: Fortschritt der laufenden Kampagne(n) oder eine Einladung, eine zu starten. */
export function CampaignSection({ campaigns }: CampaignSectionProps) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId}>
      <SectionTitle id={titleId}>{campaigns.length > 1 ? 'Kampagnen' : 'Kampagne'}</SectionTitle>
      {campaigns.length === 0 ? (
        <Card tone="flat" className="border-dashed border-border-strong/80! text-center">
          <div
            aria-hidden="true"
            className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-radial from-gold/18 to-gold/4 text-[1.75rem] ring-1 ring-gold/30"
          >
            🗺️
          </div>
          <h3 className="font-display text-base font-semibold tracking-wide text-parchment">
            Starte deine erste Kampagne
          </h3>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted">
            Ein großes Ziel, aufgeteilt in Kapitel – deine Quests bringen dich Schritt für Schritt voran.
          </p>
          <Link
            to="/kampagne"
            className={cn(
              buttonClassName({ variant: 'primary', size: 'sm' }),
              'mt-4 scroll-mb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+1rem)] md:scroll-mb-6',
            )}
          >
            Kampagne starten
            <ArrowRight aria-hidden />
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <CampaignCard key={campaign.quest.id} campaign={campaign} />
          ))}
        </div>
      )}
    </section>
  )
}

function CampaignCard({ campaign }: { campaign: MainQuestState }) {
  const { quest, chapters, currentChapterIndex, complete, progress, daysLeft } = campaign
  const percent = Math.round(progress * 100)
  const doneCount = chapters.filter((chapter) => chapter.done).length
  const deadline = complete ? undefined : deadlineText(daysLeft)
  const current = currentChapterIndex >= 0 ? chapters[currentChapterIndex] : undefined

  let chapterLine: string
  if (chapters.length === 0) chapterLine = 'Noch keine Kapitel'
  else if (complete || !current) chapterLine = 'Alle Kapitel gemeistert'
  else
    chapterLine = `Kapitel ${formatNumber(currentChapterIndex + 1)} / ${formatNumber(chapters.length)}: ${current.chapter.title}`

  return (
    <Card
      as="article"
      tone="gold"
      ornate
      className="transition-[border-color] duration-200 hover:border-gold/60 has-[a:active]:scale-[0.995]"
    >
      <Link
        to="/kampagne"
        aria-label={`Kampagne „${quest.title}“ öffnen`}
        className="absolute inset-0 z-10 scroll-mb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+1rem)] rounded-2xl focus-visible:outline-offset-3 md:scroll-mb-6"
      />
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-xl bg-gold/10 text-[1.625rem] ring-1 ring-gold/30 ring-inset"
        >
          {quest.icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[1.0625rem] leading-snug font-semibold tracking-wide text-parchment">
            {quest.title}
          </h3>
          <p className={cn('mt-0.5 text-sm', complete ? 'font-medium text-gold-bright' : 'text-muted')}>
            {complete && <Trophy aria-hidden className="mr-1.5 -mt-0.5 inline size-4" />}
            {chapterLine}
          </p>
        </div>
      </div>

      <ProgressBar
        value={progress}
        glow={complete}
        className="mt-4"
        label={<span className="text-xs text-muted">Gesamtfortschritt</span>}
        valueLabel={<span className="font-semibold text-gold-bright">{formatNumber(percent)} %</span>}
        valueText={`${formatNumber(percent)} % – ${formatNumber(doneCount)} von ${formatNumber(chapters.length)} Kapiteln abgeschlossen`}
      />

      {chapters.length > 0 && chapters.length <= 12 && (
        <div aria-hidden="true" className="mt-2.5 flex gap-1.5">
          {chapters.map((chapter, index) => (
            <span
              key={chapter.chapter.id}
              className={cn(
                'size-2.5 rotate-45 rounded-[2px]',
                chapter.done
                  ? 'bg-gold shadow-[0_0_6px_-1px_rgb(240_201_106/0.8)]'
                  : index === currentChapterIndex
                    ? 'bg-gold/15 ring-1 ring-gold/70'
                    : 'bg-black/40 ring-1 ring-border-strong',
              )}
            />
          ))}
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        {deadline ? (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap',
              deadline.tone === 'overdue' ? 'text-danger' : deadline.tone === 'soon' ? 'text-warning' : 'text-muted',
            )}
          >
            <Hourglass aria-hidden className="size-4" />
            {deadline.text}
          </span>
        ) : (
          <span />
        )}
        <span aria-hidden="true" className="ml-auto inline-flex items-center gap-1 font-medium whitespace-nowrap text-gold">
          Zur Kampagne
          <ArrowRight className="size-4" />
        </span>
      </div>
    </Card>
  )
}
