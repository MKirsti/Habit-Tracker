import { Target } from 'lucide-react'
import { useId } from 'react'
import { ATTRIBUTES } from '../../../domain/attributes'
import { COMPLETION_RATE_DAYS } from '../../../domain/statistics'
import type { HabitCompletionRate } from '../../../domain/statistics'
import { Card, formatNumber } from '../../../ui'
import { trackFill } from './chartTheme'
import { rateDetail, rateLabel } from './statsText'

/**
 * Erfüllungsquote pro Quest (letzte 30 Tage) als waagerechte Balken in der Attributfarbe – in der Reihenfolge der
 * Quest-Liste, damit jede Quest ihren gewohnten Platz behält. Alle Werte stehen als Text daneben.
 */
export function CompletionRates({ rates }: { rates: readonly HabitCompletionRate[] }) {
  const listId = useId()
  return (
    <Card
      title="Erfüllungsquote"
      icon={<Target />}
      subtitle={`Letzte ${formatNumber(COMPLETION_RATE_DAYS)} Tage – was heute noch geht, zählt erst, wenn es erledigt ist.`}
      className="min-w-0"
    >
      {rates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          Sobald du Quests hast, siehst du hier, wie zuverlässig du sie erfüllst.
        </p>
      ) : (
        <ul id={listId} aria-label="Erfüllungsquote pro Quest" className="flex flex-col gap-3.5">
          {rates.map((entry) => {
            const color = ATTRIBUTES[entry.habit.attribute]?.color ?? 'var(--color-gold)'
            const percent = entry.rate === undefined ? 0 : Math.round(entry.rate * 100)
            return (
              // Handy: Quote rechts neben dem Namen, „18 von 29 Tagen“ unter dem Balken – so bleibt der Name lesbar
              // (sonst schrumpfte er auf „Kerzenlicht stat…“). Ab sm steht alles in einer Zeile über dem Balken.
              <li
                key={entry.habit.id}
                data-habit={entry.habit.id}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto]"
              >
                <span className="flex min-w-0 items-baseline gap-1.5 text-parchment">
                  <span aria-hidden="true" className="shrink-0">
                    {entry.habit.icon}
                  </span>
                  <span className="truncate">{entry.habit.title}</span>
                </span>
                <span className="text-right font-semibold text-parchment tabular-nums">{rateLabel(entry.rate)}</span>
                <span className="sr-only">, </span>
                <span className="col-span-2 row-start-3 mt-1 text-xs text-muted tabular-nums sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:text-right">
                  {rateDetail(entry.done, entry.due, entry.unit)}
                </span>
                <div
                  aria-hidden="true"
                  className="col-span-2 row-start-2 mt-1.5 h-2 overflow-hidden rounded-full sm:col-span-3"
                  style={{ backgroundColor: trackFill(color) }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
                    style={{ width: `${percent}%`, backgroundColor: color }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
