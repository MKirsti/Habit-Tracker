import { useMemo } from 'react'
import { useGameContext } from '../../../app/gameContext'
import { attributeRadar, completionRates, dayHistory } from '../../../domain/statistics'
import { ActivityHeatmap } from './ActivityHeatmap'
import { AttributeRadarChart } from './AttributeRadarChart'
import { CompletionRates } from './CompletionRates'
import { KeyFigures } from './KeyFigures'
import { WeeklyXpChart } from './WeeklyXpChart'
import { XpTimelineChart } from './XpTimelineChart'

/**
 * Held → Statistik (`?tab=statistik`): Kennzahlen, Heatmap (gesamt oder pro Quest), XP pro Woche, XP-/Level-Verlauf,
 * Erfüllungsquote pro Quest und Attribut-Radar. Die Tages-Historie (`dayHistory`) wird einmal berechnet und von
 * allen Diagrammen geteilt – dieselben Regeln wie der Spielstand.
 */
export function StatisticsTab() {
  const { data, today, state } = useGameContext()
  const history = useMemo(() => dayHistory(data, today), [data, today])
  const rates = useMemo(() => completionRates(data, today), [data, today])
  const radar = useMemo(() => attributeRadar(state.attributes), [state.attributes])

  return (
    <div className="flex flex-col gap-8">
      <KeyFigures state={state} data={data} />
      <ActivityHeatmap history={history} data={data} today={today} />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <WeeklyXpChart history={history} />
        <XpTimelineChart history={history} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <CompletionRates rates={rates} />
        <AttributeRadarChart radar={radar} />
      </div>
    </div>
  )
}
