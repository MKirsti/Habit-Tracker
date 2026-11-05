import { CalendarDays, Flag, Flame, Hourglass, Sparkles, Sprout, Trophy } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { useId } from 'react'
import type { DayKey, EndBossState, MainQuestState } from '../../domain/types'
import { ACCENT_BADGE_BACKGROUND, campaignColor } from '../../features/campaignTheme'
import { Badge, ProgressBar, cn, formatNumber } from '../../ui'
import { bossVars } from '../dashboard/bossTheme'
import { CampaignFrame } from './CampaignFrame'
import { campaignOrigin, pathLabel } from './campaignOrigin'
import { campaignDayText, deadlineText, formatDate, xpHint } from './campaignText'
import type { DeadlineTone } from './campaignText'
import { END_BOSS_PHASE_LABELS, endBossPhase } from './endBossText'

export interface CampaignBannerProps {
  campaign: MainQuestState
  today: DayKey
  /** Ref auf die Überschrift (für den Fokus nach dem Anlegen/Löschen). */
  headingRef?: Ref<HTMLHeadingElement>
}

const TONE_CLASS: Record<DeadlineTone, string> = {
  normal: 'text-muted',
  soon: 'text-warning',
  overdue: 'text-danger',
}

/**
 * Kopf der Kampagne: Symbol, Titel, bei Vorlagen Klasse und Stufe, Beschreibung, das „Warum“ als
 * Pergament-Zitat, Belohnung, Endgegner (Phase 3b: „Endgegner: Der Bibliothekar der Ewigkeit · schläft noch“),
 * Zeitrahmen und Gesamtfortschritt.
 *
 * Rahmen, Leuchten, Symbol, Abzeichen und Fortschritt tragen die Hauptfarbe der Kampagne (`campaignColor`);
 * Gold bleibt für „Gemeistert“, die Belohnung und den XP-Hinweis.
 */
export function CampaignBanner({ campaign, today, headingRef }: CampaignBannerProps) {
  const { quest, chapters, progress, complete, daysLeft } = campaign
  const titleId = useId()
  const percent = Math.round(progress * 100)
  const doneCount = chapters.filter((chapter) => chapter.done).length
  const deadline = deadlineText(daysLeft)
  const origin = campaignOrigin(quest)
  const color = campaignColor(campaign)

  return (
    <CampaignFrame
      campaign={campaign}
      as="section"
      padding="lg"
      aria-labelledby={titleId}
      className="overflow-hidden"
    >
      {/* Lichtschein in der Kampagnenfarbe hinter dem Symbol */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 -left-16 size-64 rounded-full bg-radial from-(--accent-20) to-transparent opacity-60"
      />

      <div className="relative flex items-center gap-4 sm:gap-5">
        <div
          aria-hidden="true"
          className="grid size-16 shrink-0 place-items-center rounded-2xl bg-radial from-(--accent-20) to-(--accent-5) text-[2.25rem] leading-none shadow-[0_0_24px_-6px_var(--accent-35)] ring-1 ring-(--accent-35) sm:size-20 sm:text-[2.75rem]"
        >
          {quest.icon}
        </div>
        <div className="min-w-0 flex-1">
          {/* Kein „Hauptquest“-Eyebrow: Der Seitenkopf sagt schon „Dein großes Ziel“. */}
          {complete && <p className="mb-1 text-xs font-semibold tracking-[0.2em] text-gold uppercase">Gemeistert</p>}
          <h2
            id={titleId}
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-[1.375rem] leading-tight font-bold tracking-wide text-parchment focus:outline-none sm:text-[1.75rem]"
          >
            {quest.title}
          </h2>
          {/* Feine Linie in der Kampagnenfarbe unter dem Titel */}
          <span
            aria-hidden="true"
            className="mt-2 block h-px w-20 bg-linear-to-r from-(--accent) to-transparent sm:w-24"
          />
          {origin && (
            <ul aria-label="Aus der Bibliothek" className="mt-2 flex flex-wrap gap-1.5">
              {origin.path && (
                <li className="min-w-0 max-w-full">
                  {/* Darf umbrechen: „Gladiator · Sport allgemein & Spielsport“ ist auf 360 px zu lang. */}
                  <Badge
                    color={color}
                    size="md"
                    // `!`: cn löst widersprüchliche Klassen nicht auf (Badge ist sonst einzeilig und 28 px hoch).
                    className="h-auto! min-h-7 rounded-[0.875rem]! py-1! leading-snug whitespace-normal!"
                    // Deckend statt transparent getönt: Rahmen-Tönung und Lichtschein dahinter würden die (leicht
                    // aufgehellte) Schrift sonst unter 4.5:1 drücken (Stärke-Rot).
                    style={{ backgroundColor: ACCENT_BADGE_BACKGROUND }}
                  >
                    <span className="sr-only">Klasse: </span>
                    {pathLabel(origin.path)}
                  </Badge>
                </li>
              )}
              <li>
                <Badge
                  size="md"
                  icon={
                    origin.level === 'advanced' ? (
                      <Flame className="text-(--accent-text)" />
                    ) : (
                      <Sprout className="text-(--accent-text)" />
                    )
                  }
                  className="border-(--accent-20)!"
                >
                  <span className="sr-only">Stufe: </span>
                  {origin.levelLabel}
                </Badge>
              </li>
            </ul>
          )}
        </div>
      </div>

      {quest.description !== undefined && (
        <p className="relative mt-4 max-w-prose text-[0.9375rem] text-parchment/85">{quest.description}</p>
      )}

      {quest.why !== '' && <WhyScroll why={quest.why} />}

      {quest.reward !== '' && (
        <p className="relative mt-4 flex items-start gap-2.5 text-[0.9375rem]">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-gold/12 text-gold-bright ring-1 ring-gold/30 ring-inset"
          >
            <Trophy className="size-4" />
          </span>
          <span className="min-w-0 self-center">
            <span className="text-muted">Belohnung: </span>
            <span className="font-medium text-parchment">{quest.reward}</span>
          </span>
        </p>
      )}

      {campaign.endBoss !== undefined && (
        <EndBossHint endBoss={campaign.endBoss} className={quest.reward !== '' ? 'mt-2.5' : 'mt-4'} />
      )}

      <dl className="relative mt-5 grid grid-cols-2 gap-2.5 sm:gap-3">
        <Stat
          icon={<CalendarDays />}
          label="Start"
          value={formatDate(quest.startDay, today)}
          hint={campaignDayText(quest.startDay, today)}
        />
        <Stat
          icon={<Hourglass />}
          label="Zieldatum"
          value={quest.deadline !== undefined ? formatDate(quest.deadline, today) : 'Offen'}
          hint={
            complete ? (
              <span className="text-gold-bright">geschafft</span>
            ) : deadline ? (
              <span className={TONE_CLASS[deadline.tone]}>{deadline.text}</span>
            ) : (
              'ohne Zieldatum'
            )
          }
        />
      </dl>

      {chapters.length === 0 ? (
        // Ohne Kapitel gibt es keinen Fortschritt – und die Kampagne lässt sich nicht meistern.
        <p className="relative mt-5 flex items-start gap-2 rounded-xl border border-dashed border-(--accent-35) bg-bg-deep/40 px-3.5 py-3 text-sm text-parchment/90">
          <Flag aria-hidden className="mt-0.5 size-4 shrink-0 text-(--accent-text)" />
          <span>
            <span className="font-semibold text-parchment">Noch keine Kapitel.</span> Teile dein Ziel unten in Etappen
            auf – dann siehst du hier deinen Fortschritt.
          </span>
        </p>
      ) : (
        <ProgressBar
          className="relative mt-5"
          size="lg"
          value={progress}
          color={color}
          glow
          label={
            <span className="text-sm text-muted">
              <Flag aria-hidden className="mr-1.5 -mt-0.5 inline size-4 text-(--accent-text)" />
              <span className="font-semibold text-parchment tabular-nums">
                {formatNumber(doneCount)} / {formatNumber(chapters.length)}
              </span>{' '}
              Kapitel abgeschlossen
            </span>
          }
          valueLabel={
            <span className="font-display text-base font-semibold text-(--accent-text)">{formatNumber(percent)} %</span>
          }
          valueText={`${formatNumber(percent)} % – ${formatNumber(doneCount)} von ${formatNumber(chapters.length)} Kapiteln abgeschlossen`}
        />
      )}
      {/* XP bleiben golden. */}
      <p className="relative mt-2.5 flex items-center gap-1.5 text-[0.8125rem] text-gold/90">
        <Sparkles aria-hidden className="size-3.5 shrink-0" />
        {xpHint()}
      </p>
    </CampaignFrame>
  )
}

/** Wer am Ende der Kampagne wartet – der Endgegner (das letzte Kapitel) samt Zustand. */
function EndBossHint({ endBoss, className }: { endBoss: EndBossState; className?: string }) {
  const phase = endBossPhase(endBoss)
  return (
    <p
      className={cn('relative flex items-start gap-2.5 text-[0.9375rem]', className)}
      style={bossVars()}
      data-end-boss-hint={phase}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-lg text-base leading-none ring-1 ring-inset',
          phase === 'defeated' ? 'bg-gold/12 ring-gold/30' : 'bg-(--boss-20) ring-(--boss-35)',
          phase === 'asleep' && 'grayscale-[0.4]',
        )}
      >
        {endBoss.definition.icon}
      </span>
      <span className="min-w-0 self-center">
        <span className="text-muted">Endgegner: </span>
        <span className="font-medium text-parchment">{endBoss.definition.name}</span>
        <span className={phase === 'defeated' ? 'text-gold-bright' : 'text-muted'}> · {END_BOSS_PHASE_LABELS[phase]}</span>
      </span>
    </p>
  )
}

/** Das „Warum“ als Pergament-Schriftrolle. */
function WhyScroll({ why }: { why: string }) {
  return (
    <figure className="relative mt-5">
      {/* Rollen oben und unten */}
      <span
        aria-hidden="true"
        className="absolute inset-x-1 top-0 h-2.5 -translate-y-1/2 rounded-full bg-linear-to-b from-gold-dim via-gold to-gold-dim shadow-[0_2px_4px_rgb(0_0_0/0.5)]"
      />
      <span
        aria-hidden="true"
        className="absolute inset-x-1 bottom-0 h-2.5 translate-y-1/2 rounded-full bg-linear-to-b from-gold-dim via-gold to-gold-dim shadow-[0_2px_4px_rgb(0_0_0/0.5)]"
      />
      <div className="mx-3 bg-linear-to-b from-parchment via-parchment/95 to-parchment/85 px-5 pt-4 pb-4 text-on-gold shadow-[inset_0_0_24px_rgb(120_80_30/0.35)] sm:px-6">
        <figcaption className="font-display text-[0.6875rem] font-bold tracking-[0.22em] text-gold-deep uppercase">
          Mein Warum
        </figcaption>
        <blockquote className="mt-1.5 font-serif text-[1.0625rem] leading-relaxed italic sm:text-lg">
          <p>„{why}“</p>
        </blockquote>
      </div>
    </figure>
  )
}

function Stat({ icon, label, value, hint }: { icon: ReactNode; label: string; value: ReactNode; hint: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/80 bg-bg-deep/45 px-2.5 py-2.5 sm:px-3.5 sm:py-3">
      <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-[0.12em] text-muted uppercase">
        <span aria-hidden="true" className="text-(--accent-text) [&_svg]:size-3.5">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="mt-1 text-[0.9375rem] leading-snug font-semibold text-parchment tabular-nums sm:text-base">
        {value}
      </dd>
      <dd className="mt-0.5 text-xs leading-snug text-muted">{hint}</dd>
    </div>
  )
}
