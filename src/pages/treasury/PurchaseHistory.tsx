import { CircleCheck, History, Undo2 } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import { useGameContext } from '../../app/gameContext'
import { undoPurchase } from '../../data/repository'
import { formatDay } from '../../domain/dates'
import type { Purchase } from '../../domain/types'
import { Button, Card, ConfirmDialog, SectionTitle, formatNumber, useToast } from '../../ui'
import { errorMessage } from './errors'
import { purchaseUndoButtonId, usePendingFocus } from './focus'
import { ITEM_OUTCOME_LABELS, POTION_HEAL, canUndoPurchase, itemOutcomes } from './items'
import { formatShortDate, goldText, purchaseHistory } from './treasuryState'

/** So viele Einlösungen zeigt die Chronik zunächst. */
export const HISTORY_PREVIEW = 8

export interface PurchaseHistoryProps {
  purchases: readonly Purchase[]
}

/**
 * „Chronik“: alle Einlösungen und Käufe, neueste zuerst, jeweils mit „Rückgängig“ (nach Rückfrage). Gegenstände
 * (Phase 2b) lassen sich nur am Kauftag zurückgeben, solange sie nicht verbraucht bzw. abgerechnet sind
 * (`canUndoItemPurchase`) – sonst steht dort ihr Verbleib („Getrunken“, „Im Beutel“, „Eingesetzt“).
 */
export function PurchaseHistory({ purchases }: PurchaseHistoryProps) {
  const titleId = useId()
  const { toast } = useToast()
  const { data, today } = useGameContext()
  const outcomes = useMemo(() => itemOutcomes(data), [data])
  const [showAll, setShowAll] = useState(false)
  const [undoTarget, setUndoTarget] = useState<Purchase | null>(null)
  // Bleibt beim Schließen stehen, damit der Dialog beim Ausblenden nicht leer wird.
  const [lastTarget, setLastTarget] = useState<Purchase | null>(null)

  const history = purchaseHistory(purchases)
  const visible = showAll ? history : history.slice(0, HISTORY_PREVIEW)
  const total = purchases.reduce((sum, purchase) => sum + purchase.price, 0)
  const emptyRef = useRef<HTMLParagraphElement>(null)
  // Die Zeile verschwindet: weiter bei der Einlösung, die nachrückt (bzw. der vorigen), sonst beim leeren Hinweis.
  const requestFocus = usePendingFocus(history, undoTarget !== null)

  async function confirmUndo() {
    const purchase = undoTarget
    if (!purchase) return
    const index = visible.findIndex((item) => item.id === purchase.id)
    requestFocus({
      resolve: (current) => {
        if (current.some((item) => item.id === purchase.id)) return undefined
        const next = current[Math.min(Math.max(index, 0), current.length - 1)]
        return next ? document.getElementById(purchaseUndoButtonId(next.id)) : emptyRef.current
      },
    })
    try {
      await undoPurchase(purchase.id, today)
    } catch (error) {
      requestFocus(null)
      toast({ tone: 'error', title: 'Rückgängig machen fehlgeschlagen', description: errorMessage(error) })
      throw error
    }
    toast({
      tone: 'success',
      title: purchase.kind === 'item' ? 'Kauf rückgängig gemacht' : 'Einlösung rückgängig gemacht',
      description: `${goldText(purchase.price)} für „${purchase.title}“ sind zurück in deiner Schatzkammer.`,
    })
  }

  const shown = undoTarget ?? lastTarget
  const hasItems = history.some((purchase) => purchase.kind === 'item')

  return (
    <section aria-labelledby={titleId}>
      <SectionTitle id={titleId} meta={history.length > 0 ? formatNumber(history.length) : undefined}>
        Chronik
      </SectionTitle>

      {history.length === 0 ? (
        <p
          ref={emptyRef}
          // Fokusziel, nachdem die letzte Einlösung rückgängig gemacht wurde.
          tabIndex={-1}
          className="flex items-center gap-2.5 rounded-2xl border border-dashed border-border-strong/80 bg-surface/45 px-4 py-4 text-sm text-muted focus:outline-none"
        >
          <History aria-hidden className="size-4 shrink-0 text-gold-dim" />
          Noch nichts eingelöst – deine erste Belohnung wartet schon.
        </p>
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-border">
            {visible.map((purchase) => (
              <li key={purchase.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/8 text-xl leading-none ring-1 ring-gold/20 ring-inset"
                >
                  {purchase.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-medium text-parchment">{purchase.title}</p>
                  {/* Handy: kompaktes Datum („4. Nov. 2026“), damit Datum und Preis in eine Zeile passen – sonst
                      bliebe der Trenner „·“ am Zeilenende bzw. -anfang hängen. */}
                  <p className="text-sm text-muted">
                    <span className="sm:hidden">{formatShortDate(purchase.day)}</span>
                    <span className="max-sm:hidden">{formatDay(purchase.day)}</span> ·{' '}
                    <span className="font-medium whitespace-nowrap text-gold tabular-nums">
                      −{goldText(purchase.price)}
                    </span>
                  </p>
                </div>
                {canUndoPurchase(data, purchase, today) ? (
                  <Button
                    id={purchaseUndoButtonId(purchase.id)}
                    variant="ghost"
                    size="sm"
                    icon={<Undo2 />}
                    onClick={() => {
                      setUndoTarget(purchase)
                      setLastTarget(purchase)
                    }}
                    aria-label={`${purchase.kind === 'item' ? 'Kauf' : 'Einlösung'} „${purchase.title}“ vom ${formatDay(purchase.day)} rückgängig machen`}
                    title="Rückgängig"
                    className="shrink-0"
                  >
                    <span className="hidden sm:inline">Rückgängig</span>
                  </Button>
                ) : (
                  <ItemOutcomeLabel outcome={outcomes.get(purchase.id)} />
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-sm text-muted">
            <span>
              Insgesamt ausgegeben: <span className="font-medium text-parchment tabular-nums">{goldText(total)}</span>
              {hasItems && (
                <span className="mt-0.5 block text-[0.8125rem]">Gegenstände kannst du nur am Kauftag zurückgeben.</span>
              )}
            </span>
            {history.length > HISTORY_PREVIEW && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll((current) => !current)}
                aria-expanded={showAll}
              >
                {showAll ? 'Weniger anzeigen' : `Alle ${formatNumber(history.length)} anzeigen`}
              </Button>
            )}
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={undoTarget !== null}
        onClose={() => setUndoTarget(null)}
        onConfirm={confirmUndo}
        icon={shown?.icon}
        title={shown?.kind === 'item' ? 'Kauf rückgängig machen?' : 'Einlösung rückgängig machen?'}
        message={
          shown && (
            <>
              „{shown.title}“ vom {formatDay(shown.day)} verschwindet aus der Chronik, und du bekommst{' '}
              <strong className="font-semibold text-gold-bright">{goldText(shown.price)}</strong> zurück.
              {shown.kind === 'item' && shown.itemId === 'healingPotion' &&
                ` Seine Heilung (bis zu +${formatNumber(POTION_HEAL)} HP) wird dabei zurückgenommen.`}
              {shown.kind === 'item' && shown.itemId === 'streakFreeze' && ' Der Streak-Schutz verlässt deinen Beutel.'}
            </>
          )
        }
        confirmLabel="Rückgängig machen"
      />
    </section>
  )
}

/** Verbleib eines Gegenstands, der sich nicht mehr zurückgeben lässt. */
function ItemOutcomeLabel({ outcome }: { outcome: keyof typeof ITEM_OUTCOME_LABELS | undefined }) {
  if (outcome === undefined) return null
  return (
    <span className="flex shrink-0 items-center gap-1 text-[0.8125rem] whitespace-nowrap text-muted">
      <CircleCheck aria-hidden className="size-3.5 text-success" />
      {ITEM_OUTCOME_LABELS[outcome]}
    </span>
  )
}
