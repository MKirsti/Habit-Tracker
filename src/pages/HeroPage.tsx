import { ChartNoAxesCombined, LayoutGrid, Settings, Trophy, UserRound } from 'lucide-react'
import { useId } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useGameContext } from '../app/gameContext'
import { SETTINGS_PATH } from '../app/navigation'
import { EmptyState, PageHeader, buttonClassName, formatNumber } from '../ui'
import { AchievementsTab } from './hero/AchievementsTab'
import { AttributeGrid } from './hero/AttributeGrid'
import { HeroSheet } from './hero/HeroSheet'
import { HeroStats, XpBreakdown } from './hero/HeroStats'
import { HeroTabs } from './hero/HeroTabs'
import type { HeroTab } from './hero/HeroTabs'
import { DEFAULT_HERO_TAB, HERO_TAB_PARAM, panelId, parseHeroTab, tabId } from './hero/heroTabs'
import type { HeroTabId } from './hero/heroTabs'
import { RankLadder } from './hero/RankLadder'
import { StatisticsTab } from './hero/stats/StatisticsTab'

/**
 * „Held“ – der Charakterbogen mit Reitern (`?tab=`): Übersicht (Avatar, Rang, Level, Attribute, Statistik,
 * XP-Herkunft, Rangleiter), Erfolge (`?tab=erfolge`) und Statistik (`?tab=statistik`: Kennzahlen, Heatmap,
 * Diagramme). Das Zahnrad im Kopf führt zu den Einstellungen.
 */
export function HeroPage() {
  const { data, state } = useGameContext()
  const { profile } = data
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = parseHeroTab(searchParams.get(HERO_TAB_PARAM))
  const idBase = `hero${useId().replace(/:/g, '')}`

  const unlocked = state.achievements.filter((achievement) => achievement.unlocked).length
  const tabs: HeroTab<HeroTabId>[] = [
    { id: 'uebersicht', label: 'Übersicht', icon: <LayoutGrid aria-hidden /> },
    {
      id: 'erfolge',
      label: 'Erfolge',
      icon: <Trophy aria-hidden />,
      meta: (
        <>
          <span aria-hidden="true">
            {formatNumber(unlocked)}/{formatNumber(state.achievements.length)}
          </span>
          <span className="sr-only">
            , {formatNumber(unlocked)} von {formatNumber(state.achievements.length)} freigeschaltet
          </span>
        </>
      ),
    },
    { id: 'statistik', label: 'Statistik', icon: <ChartNoAxesCombined aria-hidden /> },
  ]

  function selectTab(next: HeroTabId) {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current)
        if (next === DEFAULT_HERO_TAB) params.delete(HERO_TAB_PARAM)
        else params.set(HERO_TAB_PARAM, next)
        return params
      },
      { replace: true, preventScrollReset: true },
    )
  }

  return (
    <>
      {/* Zahnrad oben rechts, auch auf dem Handy (dort würde es als Aktion unter den Untertitel umbrechen). */}
      <div className="relative">
        <PageHeader
          eyebrow="Charakterbogen"
          title="Held"
          subtitle="Level, Attribute, Erfolge und alle Taten deines bisherigen Abenteuers."
          className="pr-14"
        />
        {/* Eigener Rahmen fürs Positionieren: Buttons bringen selbst `relative` mit. */}
        <div className="absolute top-0 right-0">
          <Link
            to={SETTINGS_PATH}
            aria-label="Einstellungen"
            title="Einstellungen"
            className={buttonClassName({ variant: 'secondary', iconOnly: true })}
          >
            <Settings aria-hidden />
          </Link>
        </div>
      </div>

      <HeroTabs
        tabs={tabs}
        value={tab}
        onChange={selectTab}
        aria-label="Bereiche des Charakterbogens"
        idBase={idBase}
      />

      <div
        role="tabpanel"
        id={panelId(idBase, tab)}
        aria-labelledby={tabId(idBase, tab)}
        // Ohne bedienbares Element am Anfang (Erfolge) erreicht die Tastatur das Panel so direkt nach den Reitern.
        tabIndex={0}
        className="mt-6 rounded-2xl"
      >
        {tab === 'erfolge' ? (
          <AchievementsTab achievements={state.achievements} goldFromAchievements={state.gold.fromAchievements} />
        ) : tab === 'statistik' ? (
          <StatisticsTab />
        ) : (
          <>
            {profile ? (
              <HeroSheet profile={profile} state={state} shimmer={data.settings.effects} />
            ) : (
              <EmptyState icon={<UserRound />} title="Noch kein Held" text="Erschaffe zuerst deinen Helden." />
            )}

            <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,20rem)] lg:items-start">
              <div className="flex min-w-0 flex-col gap-8">
                <AttributeGrid attributes={state.attributes} />
                <HeroStats state={state} />
              </div>
              <div className="flex min-w-0 flex-col gap-6">
                <XpBreakdown state={state} />
                <RankLadder level={state.level.level} />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
