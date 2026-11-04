import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CircleCheck,
  Coins,
  Lock,
  Pencil,
  Repeat,
  Sparkle,
} from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useId } from 'react'
import type { Reward } from '../../domain/types'
import { Badge, Button, Card, IconButton, ProgressBar, cn, formatNumber } from '../../ui'
import { CoinBurst } from './CoinBurst'
import { rewardEditButtonId, rewardRedeemButtonId } from './focus'
import { formatDate, goldText, missingGoldLabel, timesRedeemedText } from './treasuryState'
import type { RewardView } from './treasuryState'

export type RewardMoveDirection = 'up' | 'down'

export interface RewardCardProps {
  view: RewardView
  isFirst: boolean
  isLast: boolean
  onRedeem: (reward: Reward) => void
  onEdit: (reward: Reward) => void
  onMove: (reward: Reward, direction: RewardMoveDirection) => void
  /** Münzregen zeigen (nach dem Einlösen, nur mit Effekten). */
  celebrating: boolean
  onCelebrationEnd: () => void
}

/**
 * Eine Belohnung im Raster: Symbol, Name, Beschreibung, Preis, „Wiederholbar“/„Einmalig“ und die Aktion
 * „Einlösen“ – zu teuer gesperrt mit „Noch N Gold“, einmalige nach dem Einlösen als „Eingelöst“.
 */
export function RewardCard({
  view,
  isFirst,
  isLast,
  onRedeem,
  onEdit,
  onMove,
  celebrating,
  onCelebrationEnd,
}: RewardCardProps) {
  const titleId = useId()
  const { reward, status, timesRedeemed, saved } = view
  const redeemed = status.kind === 'redeemed'

  // Wie bei den Quests: am Rand per aria-disabled gesperrt, damit der Fokus auf dem Button bleibt.
  function move(direction: RewardMoveDirection) {
    if (direction === 'up' ? isFirst : isLast) return
    onMove(reward, direction)
  }

  return (
    <Card
      as="li"
      padding="none"
      aria-labelledby={titleId}
      data-status={status.kind}
      className={cn(
        'flex flex-col p-4',
        status.kind === 'available' &&
          'border-gold/35 shadow-[0_0_0_1px_rgb(212_165_72/0.05),0_14px_34px_-20px_rgb(212_165_72/0.45)]',
      )}
    >
      <div className="flex items-start gap-3.5">
        <div
          aria-hidden="true"
          className={cn(
            'grid size-13 shrink-0 place-items-center rounded-2xl bg-radial from-gold/18 to-gold/4 text-[1.75rem] leading-none ring-1 ring-gold/30 ring-inset',
            redeemed && 'opacity-60 grayscale-[0.6]',
          )}
        >
          {reward.icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="font-display text-base leading-snug font-semibold tracking-wide text-parchment">
            {reward.title}
          </h3>
          {reward.description !== undefined && (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted">{reward.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="gold" icon={<Coins aria-hidden />}>
              <span className="sr-only">Preis: </span>
              {goldText(reward.price)}
            </Badge>
            {reward.repeatable ? (
              <Badge icon={<Repeat aria-hidden />}>Wiederholbar</Badge>
            ) : (
              <Badge icon={<Sparkle aria-hidden />}>Einmalig</Badge>
            )}
            {reward.repeatable && timesRedeemed > 0 && <Badge tone="success">{timesRedeemedText(timesRedeemed)}</Badge>}
          </div>
        </div>
      </div>

      {status.kind === 'missing' && (
        <ProgressBar
          value={saved}
          size="xs"
          animated={false}
          aria-label={`Gespart für „${reward.title}“`}
          valueLabel={<span className="text-xs font-medium text-parchment">{missingGoldLabel(status.missing)}</span>}
          valueText={`${formatNumber(Math.round(saved * 100))} % des Preises`}
          className="mt-4"
        />
      )}
      {status.kind === 'redeemed' && (
        <p className="mt-4 flex items-center gap-1.5 text-sm text-success">
          <CircleCheck aria-hidden className="size-4 shrink-0" />
          Eingelöst am {formatDate(status.day)}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <div className="flex items-center gap-0.5">
          <IconButton
            size="sm"
            icon={
              <>
                <ArrowUp className="sm:hidden" />
                <ArrowLeft className="hidden sm:block" />
              </>
            }
            aria-label={`„${reward.title}“ nach vorne verschieben`}
            title="Nach vorne"
            aria-disabled={isFirst || undefined}
            onClick={() => move('up')}
          />
          <IconButton
            size="sm"
            icon={
              <>
                <ArrowDown className="sm:hidden" />
                <ArrowRight className="hidden sm:block" />
              </>
            }
            aria-label={`„${reward.title}“ nach hinten verschieben`}
            title="Nach hinten"
            aria-disabled={isLast || undefined}
            onClick={() => move('down')}
          />
          <IconButton
            id={rewardEditButtonId(reward.id)}
            size="sm"
            variant="secondary"
            icon={<Pencil />}
            aria-label={`„${reward.title}“ bearbeiten`}
            title="Bearbeiten"
            onClick={() => onEdit(reward)}
            className="ml-1"
          />
        </div>

        <div className="relative">
          <AnimatePresence>{celebrating && <CoinBurst key="burst" onDone={onCelebrationEnd} />}</AnimatePresence>
          {status.kind === 'available' && (
            <Button
              id={rewardRedeemButtonId(reward.id)}
              size="sm"
              icon={<Coins />}
              onClick={() => onRedeem(reward)}
              aria-label={`„${reward.title}“ einlösen`}
            >
              Einlösen
            </Button>
          )}
          {status.kind === 'missing' && (
            // Gesperrt; was fehlt, steht direkt darüber am Spar-Balken („Noch N Gold“).
            <Button
              id={rewardRedeemButtonId(reward.id)}
              size="sm"
              variant="secondary"
              icon={<Lock />}
              disabled
              aria-label={`„${reward.title}“ einlösen – noch ${goldText(status.missing)}`}
            >
              Einlösen
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
