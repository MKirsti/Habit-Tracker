import { Check, Crown, Lock } from 'lucide-react'
import { Badge, Card, cn, formatNumber } from '../../ui'
import { rankLadder } from './heroProfile'

export interface RankLadderProps {
  level: number
}

const STATUS_TEXT = {
  reached: 'erreicht',
  current: 'aktueller Rang',
  locked: 'noch nicht erreicht',
} as const

/** Alle Ränge von „Novize“ bis „Mythos“ – erreichte hervorgehoben, der aktuelle markiert. */
export function RankLadder({ level }: RankLadderProps) {
  const ranks = rankLadder(level)
  return (
    <Card title="Rangleiter" icon={<Crown />} subtitle="Mit jedem Level steigt dein Ruhm.">
      <ol className="flex flex-col">
        {ranks.map((rank, index) => {
          const last = index === ranks.length - 1
          const current = rank.status === 'current'
          const reached = rank.status !== 'locked'
          return (
            <li
              key={rank.title}
              aria-current={current ? 'step' : undefined}
              className={cn(
                'relative flex items-center gap-3 rounded-xl px-2.5 py-2',
                current && 'bg-gold/10 ring-1 ring-gold/35 ring-inset',
              )}
            >
              {/* Verbindungslinie zum nächsten Rang */}
              {!last && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-[calc(50%+0.875rem)] left-[calc(1.5rem-0.5px)] h-[calc(100%-1.75rem)] w-px',
                    ranks[index + 1].status !== 'locked' ? 'bg-gold/55' : 'bg-border-strong',
                  )}
                />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  'relative grid size-7 shrink-0 place-items-center rounded-full border [&_svg]:size-3.5',
                  current && 'border-gold-bright bg-gold-bright text-on-gold shadow-glow-sm',
                  rank.status === 'reached' && 'border-gold/60 bg-gold/15 text-gold-bright',
                  rank.status === 'locked' && 'border-border-strong bg-bg-deep/60 text-faint',
                )}
              >
                {current ? <Crown strokeWidth={2.4} /> : reached ? <Check strokeWidth={3} /> : <Lock />}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block font-display text-[0.9375rem] leading-tight font-semibold tracking-wide',
                    current ? 'text-gold-bright' : reached ? 'text-parchment' : 'text-muted',
                  )}
                >
                  {rank.title}
                </span>
                <span className="block text-xs text-muted tabular-nums">ab Level {formatNumber(rank.minLevel)}</span>
              </span>
              <span className="sr-only">({STATUS_TEXT[rank.status]})</span>
              {current && (
                <Badge tone="gold" aria-hidden="true">
                  Aktuell
                </Badge>
              )}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
