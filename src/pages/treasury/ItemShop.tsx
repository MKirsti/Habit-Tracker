import { CalendarCheck, Coins, HeartPulse, Info, Lock, Sparkles, Tent, WandSparkles, Zap } from 'lucide-react'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useGameContext } from '../../app/gameContext'
import { purchaseItem } from '../../data/repository'
import { BALANCING } from '../../domain/balancing'
import type { HpState, ItemId, Purchase } from '../../domain/types'
import { HP_COLOR } from '../../features/feedback/hpTheme'
import { Badge, Button, Card, ConfirmDialog, ProgressBar, SectionTitle, cn, formatNumber, tintStyle, useToast } from '../../ui'
import { errorMessage } from './errors'
import { enabledElementById, itemBuyButtonId, itemStatusId, usePendingFocus } from './focus'
import {
  FREEZE_MAX,
  POTION_HEAL,
  freezeStockSpoken,
  freezeStockText,
  hpText,
  itemViews,
  potionHealNow,
} from './items'
import type { ItemView } from './items'
import { goldText } from './treasuryState'

export interface ItemShopProps {
  /** Nach einem erfolgreichen Kauf (z. B. für das Aufleuchten des Guthabens). */
  onPurchased?: (purchase: Purchase) => void
}

/** Kurzer Satz unter dem Namen – was der Gegenstand für dich tut. */
const TAGLINES: Record<ItemId, string> = {
  streakFreeze: 'Fängt einen schwachen Tag auf – keine HP verloren, alle Streaks bleiben.',
  healingPotion: `Wird sofort getrunken und heilt +${formatNumber(POTION_HEAL)} HP.`,
}

/** Die Wirkung im Einzelnen (Zahlen aus `BALANCING`). */
function itemPoints(itemId: ItemId): { icon: ReactNode; text: string }[] {
  if (itemId === 'streakFreeze') {
    return [
      {
        icon: <WandSparkles />,
        text: 'Setzt sich von selbst ein: Schaffst du an einem Tag weniger als die Hälfte deiner Tagesquests, fängt er ihn bei der Abrechnung auf. In einer Pause bleibt er im Beutel – da kostet ein Tag ohnehin keine HP.',
      },
      {
        icon: <CalendarCheck />,
        text: 'Wirkt für Tage ab dem Kauftag – auch im Sanften Modus, dort schützt er deine Streaks.',
      },
      {
        icon: <Tent />,
        text: 'Krank oder im Urlaub? Dafür brauchst du keinen: Ein Ruhetag schützt HP und Streaks kostenlos.',
      },
    ]
  }
  return [
    { icon: <Zap />, text: `+${formatNumber(POTION_HEAL)} HP sofort, höchstens bis zu deinem Maximum.` },
    {
      icon: <Sparkles />,
      text: `Übrigens: Ein Perfekter Tag heilt +${formatNumber(BALANCING.hpByScore.perfect)} HP, ein Level-Aufstieg füllt deine Lebenspunkte ganz auf.`,
    },
  ]
}

/**
 * „Gegenstände“ der Schatzkammer (Phase 2b): ❄️ Streak-Schutz (Vorrat bis 5, wird automatisch eingesetzt) und
 * 🧪 Heiltrank (wird sofort getrunken). Kaufen nach Rückfrage; gesperrt mit freundlicher Begründung (Beutel voll,
 * Sanfter Modus, volle HP, zu wenig Gold). Die Meldung zum getrunkenen Heiltrank kommt zentral aus `GameFeedback`.
 */
export function ItemShop({ onPurchased }: ItemShopProps) {
  const { data, state, today } = useGameContext()
  const { toast } = useToast()
  const titleId = useId()
  const views = itemViews(state)
  const [target, setTarget] = useState<ItemView | null>(null)
  // Bleibt beim Schließen stehen, damit der Dialog beim Ausblenden nicht leer wird.
  const [lastTarget, setLastTarget] = useState<ItemView | null>(null)
  const purchases = data.purchases
  const requestFocus = usePendingFocus(purchases, target !== null)

  const stock = state.inventory.streakFreezes
  const shown = target ?? lastTarget
  const remaining = shown ? state.gold.balance - shown.price : 0

  function ask(view: ItemView) {
    setTarget(view)
    setLastTarget(view)
  }

  async function confirmPurchase() {
    const view = target
    if (!view) return
    let purchase: Purchase
    try {
      purchase = await purchaseItem(view.id, today)
    } catch (error) {
      toast({ tone: 'error', title: 'Kauf nicht möglich', description: errorMessage(error) })
      throw error
    }
    if (view.id === 'streakFreeze') {
      toast({
        tone: 'success',
        icon: <span aria-hidden="true">{view.icon}</span>,
        title: 'Streak-Schutz gekauft',
        description: `Im Beutel: ${freezeStockText(stock + 1)} – er fängt deinen nächsten schwachen Tag auf. −${goldText(view.price)}`,
      })
    }
    onPurchased?.(purchase)
    // Ist „Kaufen“ danach gesperrt (Beutel voll, HP voll, Gold aufgebraucht), bleibt der Fokus auf der Karte.
    requestFocus({
      resolve: (current) =>
        (current ?? []).some((item) => item.id === purchase.id)
          ? (enabledElementById(itemBuyButtonId(view.id)) ?? document.getElementById(itemStatusId(view.id)))
          : undefined,
    })
  }

  return (
    <section aria-labelledby={titleId}>
      <SectionTitle id={titleId}>Gegenstände</SectionTitle>
      <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
        {views.map((view) => (
          <ItemCard key={view.id} view={view} hp={state.hp} stock={stock} onBuy={ask} />
        ))}
      </ul>

      <ConfirmDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        onConfirm={confirmPurchase}
        icon={shown?.icon}
        title={shown?.id === 'healingPotion' ? 'Heiltrank trinken?' : 'Streak-Schutz kaufen?'}
        message={
          shown && (
            <>
              Das kostet <strong className="font-semibold text-gold-bright">{goldText(shown.price)}</strong>, danach hast
              du noch <span className="tabular-nums">{goldText(Math.max(remaining, 0))}</span>.{' '}
              {shown.id === 'healingPotion' ? potionConfirmText(state.hp) : freezeConfirmText(stock)} Am Kauftag kannst du
              ihn in der Chronik noch zurückgeben.
            </>
          )
        }
        confirmLabel={
          shown?.id === 'healingPotion' ? `Für ${goldText(shown.price)} trinken` : `Für ${goldText(shown?.price ?? 0)} kaufen`
        }
      />
    </section>
  )
}

/** „Er kommt in deinen Beutel (dann 3 / 5) …“ */
function freezeConfirmText(stock: number): string {
  return `Er kommt in deinen Beutel (dann ${freezeStockText(stock + 1)}) und fängt von selbst deinen nächsten schwachen Tag auf.`
}

/** „Der Trank wirkt sofort: +20 HP (30 → 50 / 55 HP).“ */
function potionConfirmText(hp: HpState): string {
  const heal = potionHealNow(hp)
  const after = Math.min(hp.max, hp.current + heal)
  const capped = heal < POTION_HEAL ? ' – mehr passt gerade nicht hinein' : ''
  return `Der Trank wirkt sofort: +${formatNumber(heal)} HP${capped} (${formatNumber(Math.round(hp.current))} → ${hpText(after, hp.max)}).`
}

interface ItemCardProps {
  view: ItemView
  hp: HpState
  stock: number
  onBuy: (view: ItemView) => void
}

/** Ein Gegenstand: Symbol, Name, Preis, Wirkung, Vorrat bzw. Lebenspunkte und „Kaufen“. */
function ItemCard({ view, hp, stock, onBuy }: ItemCardProps) {
  const titleId = useId()
  const reasonId = useId()
  const { id, title, icon, price, status } = view
  const available = status.kind === 'available'
  const potion = id === 'healingPotion'
  const buyLabel = potion ? 'Kaufen & trinken' : 'Kaufen'

  return (
    <Card
      as="li"
      padding="none"
      aria-labelledby={titleId}
      data-item={id}
      data-status={status.kind === 'available' ? 'available' : status.reason}
      className={cn(
        'flex flex-col p-4',
        available && 'border-gold/35 shadow-[0_0_0_1px_rgb(212_165_72/0.05),0_14px_34px_-20px_rgb(212_165_72/0.45)]',
      )}
    >
      <div className="flex items-start gap-3.5">
        <div
          aria-hidden="true"
          className={cn(
            'grid size-13 shrink-0 place-items-center rounded-2xl border text-[1.75rem] leading-none',
            !potion && 'border-info/35 bg-radial from-info/22 to-info/5',
          )}
          style={potion ? tintStyle(HP_COLOR, 16, 40) : undefined}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="font-display text-base leading-snug font-semibold tracking-wide text-parchment">
            {title}
          </h3>
          <p className="mt-0.5 text-sm text-parchment/85">{TAGLINES[id]}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="gold" icon={<Coins aria-hidden />}>
              <span className="sr-only">Preis: </span>
              {goldText(price)}
            </Badge>
            {potion ? (
              <Badge icon={<Zap aria-hidden />}>Wirkt sofort</Badge>
            ) : (
              <Badge icon={<WandSparkles aria-hidden />}>Automatisch</Badge>
            )}
          </div>
        </div>
      </div>

      <ul className="mt-3.5 space-y-1.5 text-sm text-muted">
        {itemPoints(id).map((point) => (
          <li key={point.text} className="flex gap-2">
            <span aria-hidden="true" className="mt-0.5 shrink-0 text-gold-dim [&_svg]:size-4">
              {point.icon}
            </span>
            <span>{point.text}</span>
          </li>
        ))}
      </ul>

      {potion ? <PotionStatus hp={hp} /> : <FreezeStock stock={stock} />}

      {status.kind === 'blocked' && (
        <p id={reasonId} className="mt-3 flex items-start gap-2 text-sm text-parchment/85">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-gold-dim" />
          <span>
            {status.text}
            {status.reason === 'gentle' && (
              <>
                {' '}
                <Link to="/einstellungen" className="font-medium text-gold underline-offset-2 hover:underline">
                  Zu den Einstellungen
                </Link>
              </>
            )}
          </span>
        </p>
      )}

      <div className="mt-auto flex justify-end pt-4">
        {available ? (
          <Button
            id={itemBuyButtonId(id)}
            size="sm"
            icon={potion ? <HeartPulse /> : <Coins />}
            onClick={() => onBuy(view)}
            aria-label={`${title} für ${goldText(price)} ${potion ? 'kaufen und trinken' : 'kaufen'}`}
          >
            {buyLabel}
          </Button>
        ) : (
          <Button
            id={itemBuyButtonId(id)}
            size="sm"
            variant="secondary"
            icon={<Lock />}
            disabled
            aria-label={`${title} ${potion ? 'kaufen und trinken' : 'kaufen'} – ${status.label}`}
            aria-describedby={reasonId}
          >
            {buyLabel}
          </Button>
        )}
      </div>
    </Card>
  )
}

/** Vorrat an Streak-Schutz: fünf Fächer, gefüllte leuchten eisblau. */
function FreezeStock({ stock }: { stock: number }) {
  return (
    <div
      id={itemStatusId('streakFreeze')}
      // Fokusziel, wenn „Kaufen“ nach dem Kauf gesperrt ist (Beutel voll).
      tabIndex={-1}
      className="mt-4 rounded-xl border border-border bg-black/20 px-3.5 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
    >
      <p className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted">Im Beutel</span>
        <span className="font-medium text-parchment tabular-nums">
          <span aria-hidden="true">{freezeStockText(stock)}</span>
          <span className="sr-only">{freezeStockSpoken(stock)}</span>
        </span>
      </p>
      <ul aria-hidden="true" className="mt-2 flex gap-1.5">
        {Array.from({ length: FREEZE_MAX }, (_, index) => {
          const filled = index < stock
          return (
            <li
              key={index}
              data-filled={filled || undefined}
              className={cn(
                'grid h-8 flex-1 place-items-center rounded-lg border text-base leading-none',
                filled
                  ? 'border-info/45 bg-info/14 shadow-[0_0_12px_-4px_rgb(127_178_224/0.7)]'
                  : 'border-border-strong/70 bg-bg-deep/60 shadow-[inset_0_1px_2px_rgb(0_0_0/0.45)]',
              )}
            >
              <span className={cn(!filled && 'opacity-25 grayscale')}>❄️</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Lebenspunkte jetzt (bzw. der Hinweis auf den Sanften Modus). */
function PotionStatus({ hp }: { hp: HpState }) {
  return (
    <div
      id={itemStatusId('healingPotion')}
      // Fokusziel, wenn „Kaufen“ nach dem Trinken gesperrt ist (HP voll).
      tabIndex={-1}
      className="mt-4 rounded-xl border border-border bg-black/20 px-3.5 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
    >
      {hp.enabled ? (
        <ProgressBar
          value={hp.ratio}
          size="sm"
          color={HP_COLOR}
          label={<span className="text-sm text-muted">Deine Lebenspunkte</span>}
          valueLabel={<span className="text-sm font-medium text-parchment">{hpText(hp.current, hp.max)}</span>}
          valueText={`${formatNumber(Math.round(hp.current))} von ${formatNumber(Math.round(hp.max))} Lebenspunkten`}
        />
      ) : (
        <p className="text-sm text-muted">Sanfter Modus – ohne Lebenspunkte, ohne Schaden.</p>
      )}
    </div>
  )
}
