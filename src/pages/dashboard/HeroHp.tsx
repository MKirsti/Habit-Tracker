import { Heart } from 'lucide-react'
import type { HpState } from '../../domain/types'
import { HP_COLOR } from '../../features/feedback/hpTheme'
import { ProgressBar, cn, formatNumber } from '../../ui'
import { freezeStockTitle, hpValueText, isLowHp, lowHpHint } from './hpText'
import type { SettlementNote } from './hpText'

export interface HeroHpProps {
  hp: HpState
  /** Notiz zur letzten Abrechnung („Sonntag: −1 HP“), statt eines Toasts. */
  note?: SettlementNote
  /** Vorrätige Streak-Schutz-Gegenstände – ab einem als kleines „❄️ 2“ neben den HP: Du bist abgesichert. */
  freezes?: number
  className?: string
}

/**
 * Lebenspunkte im Helden-Kopf, unter dem XP-Balken: schmaler Balken mit „42 / 55 HP“, darunter bei Bedarf eine
 * ruhige Zeile – die letzte Abrechnung und, unter 25 %, ein ermutigender Hinweis. Liegt ein Streak-Schutz im Beutel,
 * steht er klein daneben („❄️ 2“). Nur mit Lebenspunkten (im Sanften Modus blendet der Aufrufer die Zeile aus).
 */
export function HeroHp({ hp, note, freezes = 0, className }: HeroHpProps) {
  const low = isLowHp(hp)
  const current = Math.max(0, Math.round(hp.current))
  const max = Math.max(0, Math.round(hp.max))
  const hint = low ? lowHpHint() : undefined

  return (
    <div className={cn('w-full', className)} data-hp-current={current} data-hp-max={max} data-hp-low={low || undefined}>
      <div className="flex items-center gap-2">
        <Heart
          aria-hidden
          className="size-3.5 shrink-0 fill-current opacity-85 md:size-4"
          style={{ color: HP_COLOR }}
          strokeWidth={2}
        />
        <ProgressBar
          value={hp.ratio}
          color={HP_COLOR}
          size="sm"
          aria-label="Lebenspunkte"
          valueText={hpValueText(current, max)}
          className="min-w-0 flex-1"
        />
        <span aria-hidden="true" className="shrink-0 text-xs whitespace-nowrap text-muted tabular-nums">
          <span className="font-medium text-parchment">{formatNumber(current)}</span> / {formatNumber(max)} HP
        </span>
        {freezes > 0 && (
          <span
            className="shrink-0 text-xs whitespace-nowrap text-info tabular-nums"
            title={freezeStockTitle(freezes)}
            data-hp-freezes={freezes}
          >
            <span aria-hidden="true">❄️ {formatNumber(freezes)}</span>
            <span className="sr-only">{freezeStockTitle(freezes)}</span>
          </span>
        )}
      </div>
      {(note !== undefined || hint !== undefined) && (
        // Eingerückt auf den Balkenanfang (Herz + Abstand).
        <p className="mt-1 pl-5.5 text-[0.6875rem] leading-snug text-muted md:pl-6 md:text-xs" data-hp-note={note?.tone}>
          {note !== undefined && (
            <>
              <span aria-hidden="true">{note.text}</span>
              <span className="sr-only">{note.spoken}</span>
            </>
          )}
          {note !== undefined && hint !== undefined && <span aria-hidden="true"> · </span>}
          {hint}
        </p>
      )}
    </div>
  )
}
