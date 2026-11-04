import { useId } from 'react'
import { useGameContext } from '../../app/gameContext'
import { FRAMES, TITLES } from '../../domain/combat/cosmeticDefinitions'
import { cn, formatNumber } from '../../ui'
import { BestiarySection } from './BestiarySection'
import { ChestSection } from './ChestSection'
import { CosmeticsSection } from './CosmeticsSection'
import { allVictories, bestiary, bestiarySummary, unlockedCountText, unopenedChests } from './collectionView'
import type { ProgressFacts } from './collectionView'

/** Feste IDs der Abschnitte (Sprungziele; es gibt die Sammlung nur einmal auf der Seite). */
const SECTION_IDS = {
  chests: 'sammlung-truhen',
  cosmetics: 'sammlung-titel-rahmen',
  bestiary: 'sammlung-bestiarium',
} as const

/**
 * Held → Sammlung (`?tab=sammlung`): Überblick mit Sprungzielen, dann Truhen (ungeöffnete zuerst – Ziel der
 * Truhen-Hinweise), Titel & Rahmen und das Bestiarium.
 */
export function CollectionTab() {
  const { data, state } = useGameContext()
  const { profile } = data
  const victories = allVictories(data.bossVictories, state.bosses)
  const groups = bestiary(victories, [state.bosses.current, state.bosses.previous])
  const bestiaryCount = bestiarySummary(groups)
  const unopened = unopenedChests(state.chests).length
  const opened = state.chests.length - unopened
  const facts: ProgressFacts = {
    achievements: state.achievements.filter((achievement) => achievement.unlocked).map((achievement) => achievement.definition.id),
    victories,
    campaignsMastered: [...state.mainQuests, ...state.archivedMainQuests].filter((campaign) => campaign.complete).length,
    level: state.level.level,
  }

  return (
    <div className="flex flex-col gap-10">
      <CollectionOverview
        tiles={[
          {
            target: SECTION_IDS.chests,
            icon: '🎁',
            label: 'Truhen',
            value: formatNumber(unopened > 0 ? unopened : opened),
            detail: unopened > 0 ? 'ungeöffnet' : 'geöffnet',
            highlight: unopened > 0,
          },
          {
            target: SECTION_IDS.cosmetics,
            icon: '🎖️',
            label: 'Titel',
            value: unlockedCountText(state.cosmetics.titles.length, TITLES.length),
            detail: 'freigeschaltet',
          },
          {
            target: SECTION_IDS.cosmetics,
            icon: '🖼️',
            label: 'Rahmen',
            value: unlockedCountText(state.cosmetics.frames.length, FRAMES.length),
            detail: 'freigeschaltet',
          },
          {
            target: SECTION_IDS.bestiary,
            icon: '🐉',
            label: 'Bestiarium',
            value: unlockedCountText(bestiaryCount.defeated, bestiaryCount.total),
            detail: 'bezwungen',
          },
        ]}
      />

      <ChestSection
        id={SECTION_IDS.chests}
        chests={state.chests}
        context={{ habits: data.habits, mainQuests: data.mainQuests, victories }}
        form={profile?.form}
        dayStartHour={data.settings.dayStartHour}
        effects={data.settings.effects}
      />

      {profile && <CosmeticsSection id={SECTION_IDS.cosmetics} profile={profile} state={state} facts={facts} />}

      <BestiarySection id={SECTION_IDS.bestiary} groups={groups} />
    </div>
  )
}

interface OverviewTile {
  /** DOM-ID des Abschnitts. */
  target: string
  icon: string
  label: string
  value: string
  detail: string
  highlight?: boolean
}

/** Überblick: vier Kacheln, jede springt zu ihrem Abschnitt (Scrollen + Fokus für Tastatur und Screenreader). */
function CollectionOverview({ tiles }: { tiles: readonly OverviewTile[] }) {
  const titleId = useId()

  function jump(target: string) {
    const section = document.getElementById(target)
    if (section === null) return
    // jsdom kennt scrollIntoView nicht.
    section.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    section.focus({ preventScroll: true })
  }

  return (
    <nav aria-labelledby={titleId}>
      <h2 id={titleId} className="sr-only">
        Deine Sammlung
      </h2>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <button
              type="button"
              onClick={() => jump(tile.target)}
              className={cn(
                'flex h-full w-full min-w-0 items-center gap-2.5 rounded-2xl border px-3 py-3 text-left transition-colors duration-150 sm:gap-3 sm:px-3.5',
                tile.highlight
                  ? 'border-gold/60 bg-gold/10 shadow-[0_0_22px_-10px_rgb(240_201_106/0.6)] hover:bg-gold/15'
                  : 'border-border bg-surface/60 hover:border-gold-dim hover:bg-surface-raised/60',
              )}
            >
              <span aria-hidden="true" className="text-2xl leading-none">
                {tile.icon}
              </span>
              <span className="min-w-0">
                {/* Auf 360 px muss „Bestiarium“ in eine Zeile passen. */}
                <span className="block text-[0.6875rem] font-semibold tracking-[0.08em] text-gold uppercase sm:text-xs sm:tracking-[0.12em]">
                  {tile.label}
                </span>
                <strong className="block font-display text-base leading-tight font-semibold text-parchment tabular-nums">
                  {tile.value}
                </strong>{' '}
                <span className="block truncate text-xs text-muted">{tile.detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
