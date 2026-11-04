import { ArrowRight, Hourglass, Plus, Trophy } from 'lucide-react'
import { useId, useMemo } from 'react'
import { Link } from 'react-router'
import { BALANCING } from '../../domain/balancing'
import { isCampaignActive } from '../../domain/campaigns'
import type { MainQuestState } from '../../domain/types'
import { ACCENT_SURFACE, accentVars, campaignColor } from '../../features/campaignTheme'
import { Card, ProgressBar, SectionTitle, buttonClassName, cn, formatNumber } from '../../ui'
import { CampaignFrame } from '../campaign/CampaignFrame'
import { campaignOrigin, originSummary } from '../campaign/campaignOrigin'
import { campaignChapterLine, deadlineText } from './dashboardText'

export interface CampaignSectionProps {
  /** Nicht archivierte Kampagnen (`state.mainQuests`): laufende und gemeisterte. */
  campaigns: readonly MainQuestState[]
}

/** Platz unter der Navigation, damit Links beim Tabben nicht dahinter verschwinden. */
const SCROLL_MARGIN = 'scroll-mb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+1rem)] md:scroll-mb-6'

function campaignHref(id: string): string {
  // Genau diese Kampagne öffnen – auch wenn mehrere laufen (die Seite liest `?id=`).
  return `/kampagne?${new URLSearchParams({ id }).toString()}`
}

/**
 * Abschnitt „Kampagne(n)“: eine Kampagne als große Karte, mehrere als kompakte Karten (laufende zuerst,
 * dann gemeisterte) – jede führt zu ihrer Kampagne. Ohne Kampagne eine Einladung, die erste zu beginnen.
 * Jede Karte trägt die Hauptfarbe ihrer Kampagne (`campaignColor`: Rahmen, Symbol, Fortschritt, Kapitel-Rauten);
 * „gemeistert“ bleibt golden.
 */
export function CampaignSection({ campaigns }: CampaignSectionProps) {
  const titleId = useId()
  // Laufende zuerst, gemeisterte (bis sie in die Ruhmeshalle wandern) danach – sonst gespeicherte Reihenfolge.
  const sorted = useMemo(
    () => [...campaigns].sort((a, b) => Number(isCampaignActive(b)) - Number(isCampaignActive(a))),
    [campaigns],
  )
  const activeCount = sorted.filter(isCampaignActive).length
  const max = BALANCING.maxActiveCampaigns
  const multiple = campaigns.length > 1

  return (
    <section aria-labelledby={titleId}>
      <SectionTitle
        id={titleId}
        meta={multiple ? `${formatNumber(activeCount)} / ${formatNumber(max)} aktiv` : undefined}
        action={
          campaigns.length > 0 && activeCount < max ? (
            <Link
              to="/kampagne?neu=1"
              // Sichtbar nur „Neue“ (schmale Spalte); der zugängliche Name beginnt mit dem sichtbaren Text.
              aria-label="Neue Kampagne beginnen"
              className={cn(buttonClassName({ variant: 'ghost', size: 'sm' }), '-my-2 -mr-2 px-2.5', SCROLL_MARGIN)}
            >
              <Plus aria-hidden />
              Neue
            </Link>
          ) : undefined
        }
      >
        {multiple ? 'Kampagnen' : 'Kampagne'}
      </SectionTitle>
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
            Ein großes Ziel, aufgeteilt in Kapitel – wähle eine Vorlage aus der Bibliothek oder erschaffe deine eigene.
          </p>
          <Link
            to="/kampagne"
            className={cn(buttonClassName({ variant: 'primary', size: 'sm' }), 'mt-4', SCROLL_MARGIN)}
          >
            Kampagne starten
            <ArrowRight aria-hidden />
          </Link>
        </Card>
      ) : multiple ? (
        <ul className="space-y-2.5">
          {sorted.map((campaign) => (
            <li key={campaign.quest.id}>
              <CompactCampaignCard campaign={campaign} />
            </li>
          ))}
        </ul>
      ) : (
        <CampaignCard campaign={sorted[0]} />
      )}
    </section>
  )
}

/** Eine einzige Kampagne: große Karte mit Kapitel-Rauten und Restlaufzeit. */
function CampaignCard({ campaign }: { campaign: MainQuestState }) {
  const { quest, chapters, currentChapterIndex, complete, progress, daysLeft } = campaign
  const percent = Math.round(progress * 100)
  const doneCount = chapters.filter((chapter) => chapter.done).length
  const deadline = complete ? undefined : deadlineText(daysLeft)
  const chapterLine = campaignChapterLine(campaign)
  const origin = campaignOrigin(quest)
  const color = campaignColor(campaign)

  return (
    <CampaignFrame
      campaign={campaign}
      as="article"
      padding="md"
      className="transition-[border-color] duration-200 hover:border-(--accent-60) has-[a:active]:scale-[0.995]"
    >
      <Link
        to={campaignHref(quest.id)}
        aria-label={`Kampagne „${quest.title}“ öffnen`}
        className={cn('absolute inset-0 z-10 rounded-2xl focus-visible:outline-offset-3', SCROLL_MARGIN)}
      />
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-xl bg-(--accent-10) text-[1.625rem] ring-1 ring-(--accent-35) ring-inset"
        >
          {quest.icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[1.0625rem] leading-snug font-semibold tracking-wide text-parchment">
            {quest.title}
          </h3>
          {origin && <p className="mt-0.5 text-xs font-medium text-(--accent-text)">{originSummary(origin)}</p>}
          <p className={cn('mt-0.5 text-sm', complete ? 'font-medium text-gold-bright' : 'text-muted')}>
            {complete && <Trophy aria-hidden className="mr-1.5 -mt-0.5 inline size-4" />}
            {chapterLine}
          </p>
        </div>
      </div>

      <ProgressBar
        value={progress}
        color={color}
        glow={complete}
        className="mt-4"
        label={<span className="text-xs text-muted">Gesamtfortschritt</span>}
        valueLabel={<span className="font-semibold text-(--accent-text)">{formatNumber(percent)} %</span>}
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
                  ? 'bg-(--accent) shadow-[0_0_6px_-1px_var(--accent)]'
                  : index === currentChapterIndex
                    ? 'bg-(--accent-20) ring-1 ring-(--accent)'
                    : 'bg-black/40 ring-1 ring-border-strong',
              )}
            />
          ))}
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        {deadline ? <DeadlineHint deadline={deadline} /> : <span />}
        <span
          aria-hidden="true"
          className="ml-auto inline-flex items-center gap-1 font-medium whitespace-nowrap text-(--accent-text)"
        >
          Zur Kampagne
          <ArrowRight className="size-4" />
        </span>
      </div>
    </CampaignFrame>
  )
}

/**
 * Mehrere Kampagnen: kompakte Karte – Symbol, Titel, Klasse/Stufe, aktuelles Kapitel und ein schmaler
 * Fortschrittsbalken. Die ganze Karte ist ein Link zur Kampagne.
 */
function CompactCampaignCard({ campaign }: { campaign: MainQuestState }) {
  const { quest, chapters, complete, progress, daysLeft } = campaign
  const percent = Math.round(progress * 100)
  const doneCount = chapters.filter((chapter) => chapter.done).length
  const deadline = complete ? undefined : deadlineText(daysLeft)
  const origin = campaignOrigin(quest)
  const chapterLine = compactChapterLine(campaign)
  const color = campaignColor(campaign)

  return (
    <article
      data-campaign-color={color}
      style={accentVars(color)}
      className={cn(
        'group relative isolate rounded-2xl border px-3.5 py-3 shadow-card transition-[border-color,background-color] duration-200 has-[a:active]:scale-[0.995] hover:border-(--accent-60)',
        // Laufend: nur ein Hauch der Kampagnenfarbe im Rand; gemeistert: etwas kräftiger, mit getönter Fläche.
        complete
          ? cn('border-(--accent-35)', ACCENT_SURFACE)
          : 'border-(--accent-20) bg-linear-to-b from-surface-raised/85 to-surface/90',
      )}
    >
      {/* Schmaler Farbstreifen am linken Rand – die Kampagne auf einen Blick. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-3 left-0 w-0.5 rounded-full bg-(--accent) opacity-80"
      />
      <Link
        to={campaignHref(quest.id)}
        aria-label={`Kampagne „${quest.title}“ öffnen`}
        className={cn('absolute inset-0 z-10 rounded-2xl focus-visible:outline-offset-3', SCROLL_MARGIN)}
      />
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--accent-10) text-[1.375rem] ring-1 ring-(--accent-35) ring-inset"
        >
          {quest.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="min-w-0 truncate font-display text-[0.9375rem] leading-snug font-semibold tracking-wide text-parchment">
              {quest.title}
            </h3>
            <span className="shrink-0 text-sm font-semibold text-(--accent-text) tabular-nums">
              {formatNumber(percent)} %
            </span>
          </div>
          {origin && <p className="truncate text-xs font-medium text-(--accent-text)">{originSummary(origin)}</p>}
          <p className={cn('truncate text-xs', complete ? 'font-medium text-gold-bright' : 'text-muted')}>
            {complete && <Trophy aria-hidden className="mr-1 -mt-0.5 inline size-3.5" />}
            {chapterLine}
          </p>
        </div>
        <ArrowRight
          aria-hidden="true"
          className="size-4 shrink-0 text-(--accent-60) transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </div>
      <div className="mt-2.5 flex items-center gap-3">
        <ProgressBar
          value={progress}
          color={color}
          size="sm"
          glow={complete}
          className="min-w-0 flex-1"
          aria-label={`Fortschritt: ${quest.title}`}
          valueText={`${formatNumber(percent)} % – ${formatNumber(doneCount)} von ${formatNumber(chapters.length)} Kapiteln abgeschlossen`}
        />
        {deadline && (
          <span className="shrink-0 text-xs">
            <DeadlineHint deadline={deadline} small />
          </span>
        )}
      </div>
    </article>
  )
}

/**
 * Kapitel-Zeile der kompakten Karte: Zähler vorn, damit beim Kürzen nur der Kapiteltitel abgeschnitten wird –
 * "2 / 6 Kapitel · Die Gewohnheit erwacht". „X / Y“ zählt wie überall die abgeschlossenen Kapitel.
 */
function compactChapterLine({ chapters, currentChapterIndex, complete }: MainQuestState): string {
  if (chapters.length === 0) return 'Noch keine Kapitel'
  const current = currentChapterIndex >= 0 ? chapters[currentChapterIndex] : undefined
  if (complete || !current) return 'Alle Kapitel gemeistert'
  const done = chapters.filter((chapter) => chapter.done).length
  return `${formatNumber(done)} / ${formatNumber(chapters.length)} Kapitel · ${current.chapter.title}`
}

function DeadlineHint({
  deadline,
  small = false,
}: {
  deadline: NonNullable<ReturnType<typeof deadlineText>>
  small?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap',
        small ? 'gap-1 [&_svg]:size-3.5' : 'gap-1.5 [&_svg]:size-4',
        deadline.tone === 'overdue' ? 'text-danger' : deadline.tone === 'soon' ? 'text-warning' : 'text-muted',
      )}
    >
      <Hourglass aria-hidden />
      {deadline.text}
    </span>
  )
}
