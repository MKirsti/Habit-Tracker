import { Feather, Heart, Scale } from 'lucide-react'
import { useState } from 'react'
import { useGameContext } from '../../app/gameContext'
import { setPenaltiesEnabled } from '../../data/repository'
import { penaltiesEnabled } from '../../domain/hp'
import { HP_COLOR } from '../../features/feedback/hpTheme'
import { Badge, Card, ProgressBar, Switch, formatNumber, tintStyle, useToast } from '../../ui'
import { errorMessage } from './errorMessage'
import { HP_SWITCH_NOTE, dayScoreRows, hpRuleNotes, hpSwitchDescription } from './hpSettingsText'

/**
 * Lebenspunkte an/aus mit sofortiger Anzeige (wie die übrigen Einstellungen): Der gewählte Zustand erscheint direkt,
 * bis die Live-Daten ihn bestätigen; schlägt das Speichern fehl, springt er zurück und ein Toast erscheint.
 */
function usePenaltiesSwitch(): [boolean, (enabled: boolean) => Promise<void>] {
  const { data, today } = useGameContext()
  const { toast } = useToast()
  const stored = penaltiesEnabled(data.settings)
  const [pending, setPending] = useState<{ value: boolean; from: boolean } | null>(null)
  if (pending !== null && pending.from !== stored) setPending(null)
  const shown = pending !== null && pending.from === stored ? pending.value : stored

  async function change(enabled: boolean) {
    const next = { value: enabled, from: stored }
    setPending(next)
    try {
      await setPenaltiesEnabled(enabled, today)
    } catch (error) {
      setPending((current) => (current === next ? null : current))
      toast({ tone: 'error', title: 'Einstellung nicht gespeichert', description: errorMessage(error) })
    }
  }

  return [shown, change]
}

/**
 * Abschnitt „Lebenspunkte“ (Phase 2b): Schalter an = Lebenspunkte, aus = Sanfter Modus, der aktuelle Stand und die
 * Tageswertung mit genau den Zahlen aus `BALANCING`.
 */
export function LifePointsSettings() {
  const { state } = useGameContext()
  const [enabled, setEnabled] = usePenaltiesSwitch()
  const { hp } = state

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card title="Deine Lebenspunkte" titleAs="h3" icon={<Heart />}>
        <Switch
          checked={enabled}
          onChange={(value) => void setEnabled(value)}
          label="Lebenspunkte"
          description={hpSwitchDescription(enabled)}
        />
        <div className="mt-3 rounded-xl border border-border bg-black/20 px-3.5 py-3" aria-live="polite">
          {enabled && hp.enabled ? (
            <ProgressBar
              value={hp.ratio}
              size="sm"
              color={HP_COLOR}
              label={<span className="text-sm text-muted">Stand jetzt</span>}
              valueLabel={
                <span className="text-sm font-medium text-parchment">
                  {formatNumber(Math.round(hp.current))} / {formatNumber(Math.round(hp.max))} HP
                </span>
              }
              valueText={`${formatNumber(Math.round(hp.current))} von ${formatNumber(Math.round(hp.max))} Lebenspunkten`}
            />
          ) : enabled ? (
            <p className="text-sm text-muted">Lebenspunkte sind an – die erste Wertung folgt nach der Gnadenfrist.</p>
          ) : (
            <p className="flex items-start gap-2 text-sm text-parchment/90">
              <Feather aria-hidden className="mt-0.5 size-4 shrink-0 text-gold-dim" />
              <span>
                Sanfter Modus aktiv – ohne Lebenspunkte, ohne Schaden. Ein ❄️ Streak-Schutz schützt trotzdem deine
                Streaks.
              </span>
            </p>
          )}
        </div>
        <p className="mt-3 text-[0.8125rem] text-muted">{HP_SWITCH_NOTE}</p>
      </Card>

      <Card title="So wird ein Tag gewertet" titleAs="h3" icon={<Scale />}>
        <DayScoreTable />
        <ul className="mt-4 space-y-1.5 text-sm text-muted">
          {hpRuleNotes().map((note) => (
            <li key={note} className="flex gap-2">
              <span aria-hidden="true" className="mt-[0.55rem] size-1 shrink-0 rotate-45 bg-gold-dim" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

/**
 * Abzeichen für HP-Verluste: ruhiges HP-Rot, die Schrift stärker mit Pergament aufgehellt als bei `tintStyle`
 * (60 : 40) – die kleine Schrift bleibt so über 4.5:1 lesbar, ohne nach Alarm auszusehen.
 */
const HP_LOSS_BADGE_STYLE = {
  ...tintStyle(HP_COLOR, 14, 45),
  color: `color-mix(in srgb, ${HP_COLOR} 60%, var(--color-parchment))`,
}

/** Tabelle der Tageswertungen: Name, wann sie gilt, HP-Wirkung. */
function DayScoreTable() {
  const rows = dayScoreRows()
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">Tageswertung und ihre Wirkung auf die Lebenspunkte</caption>
      <thead>
        <tr className="text-left text-xs tracking-wide text-muted uppercase">
          <th scope="col" className="pb-2 font-medium">
            Wertung
          </th>
          <th scope="col" className="pb-2 text-right font-medium">
            HP
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/70 border-t border-border/70">
        {rows.map((row) => (
          <tr key={row.score} data-score={row.score}>
            <th scope="row" className="py-2 pr-3 text-left font-normal">
              <span className="block font-medium text-parchment">{row.label}</span>
              <span className="block text-[0.8125rem] text-muted">{row.when}</span>
            </th>
            <td className="py-2 text-right align-middle">
              {row.delta > 0 ? (
                <Badge tone="success">{row.deltaLabel}</Badge>
              ) : row.delta < 0 ? (
                <Badge style={HP_LOSS_BADGE_STYLE}>{row.deltaLabel}</Badge>
              ) : (
                <Badge>{row.deltaLabel}</Badge>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
