import { ChevronDown, Eye, Trash2 } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { deleteReward, restoreReward } from '../../data/repository'
import type { Reward } from '../../domain/types'
import { Button, Card, ConfirmDialog, IconButton, cn, formatNumber, useToast } from '../../ui'
import { errorMessage } from './errors'
import { rewardEditButtonId, usePendingFocus } from './focus'
import { goldText } from './treasuryState'

export interface ArchivedRewardsProps {
  /** Ausgeblendete Belohnungen. */
  rewards: readonly Reward[]
  /** IDs der Belohnungen mit mindestens einer Einlösung (die lassen sich nicht löschen). */
  purchasedIds: ReadonlySet<string>
  /** Ref auf den Aufklapp-Knopf „Ausgeblendete Belohnungen“ (Fokusziel nach dem Ausblenden). */
  toggleRef?: RefObject<HTMLButtonElement | null>
  /** Fokusziel, wenn nach dem Löschen keine ausgeblendete Belohnung mehr übrig ist (z. B. „Neue Belohnung“). */
  fallbackFocus?: () => HTMLElement | null
  className?: string
}

/**
 * „Ausgeblendete Belohnungen“ (aufklappbar): wieder einblenden oder – solange nie eingelöst – endgültig löschen.
 * Eingelöste bleiben erhalten, weil die Chronik auf sie verweist.
 *
 * Bleibt auch ohne ausgeblendete Belohnung eingehängt (zeigt dann nichts): So zieht sie nach dem Einblenden bzw.
 * Löschen der letzten noch den Fokus nach – auf die wieder eingeblendete Karte bzw. `fallbackFocus`.
 */
export function ArchivedRewards({ rewards, purchasedIds, toggleRef, fallbackFocus, className }: ArchivedRewardsProps) {
  const panelId = useId()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Reward | null>(null)
  const [lastTarget, setLastTarget] = useState<Reward | null>(null)
  const ownToggle = useRef<HTMLButtonElement | null>(null)
  const toggle = toggleRef ?? ownToggle
  // Leer geworden: zugeklappt – taucht später wieder eine ausgeblendete Belohnung auf, beginnt die Liste geschlossen.
  if (rewards.length === 0 && open) setOpen(false)
  // Die Zeile verschwindet: weiter in der Liste („Ausgeblendete Belohnungen“), ist sie leer, bei der Karte bzw.
  // dem Ersatzziel.
  const requestFocus = usePendingFocus(rewards, deleteTarget !== null)

  async function restore(reward: Reward) {
    requestFocus({
      resolve: (current) =>
        current.some((item) => item.id === reward.id)
          ? undefined
          : (current.length > 0 ? toggle.current : null) ?? document.getElementById(rewardEditButtonId(reward.id)),
    })
    try {
      await restoreReward(reward.id)
      toast({
        tone: 'success',
        title: 'Belohnung wieder eingeblendet',
        description: `„${reward.title}“ ist wieder einlösbar.`,
      })
    } catch (error) {
      requestFocus(null)
      toast({ tone: 'error', title: 'Einblenden fehlgeschlagen', description: errorMessage(error) })
    }
  }

  async function confirmDelete() {
    const reward = deleteTarget
    if (!reward) return
    requestFocus({
      resolve: (current) =>
        current.some((item) => item.id === reward.id)
          ? undefined
          : (current.length > 0 ? toggle.current : null) ?? fallbackFocus?.() ?? null,
    })
    try {
      const result = await deleteReward(reward.id)
      toast(
        result === 'deleted'
          ? { tone: 'success', title: 'Belohnung gelöscht', description: `„${reward.title}“ ist endgültig entfernt.` }
          : {
              tone: 'info',
              title: 'Belohnung bleibt ausgeblendet',
              description: `„${reward.title}“ wurde schon eingelöst – die Chronik verweist auf sie.`,
            },
      )
    } catch (error) {
      requestFocus(null)
      toast({ tone: 'error', title: 'Löschen fehlgeschlagen', description: errorMessage(error) })
      throw error
    }
  }

  const shown = deleteTarget ?? lastTarget

  const confirmDialog = (
    <ConfirmDialog
      open={deleteTarget !== null}
      onClose={() => setDeleteTarget(null)}
      onConfirm={confirmDelete}
      danger
      icon={shown?.icon}
      title="Belohnung löschen?"
      message={shown && <>„{shown.title}“ wird endgültig entfernt. Das lässt sich nicht rückgängig machen.</>}
      confirmLabel="Endgültig löschen"
    />
  )

  // Keine ausgeblendete Belohnung (mehr): nur der Dialog, damit er nach dem Löschen der letzten sauber ausblendet.
  if (rewards.length === 0) return confirmDialog

  return (
    <section className={className}>
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-10 items-center gap-2 rounded-xl px-1 text-sm font-medium text-muted transition-colors hover:text-parchment"
      >
        <ChevronDown aria-hidden className={cn('size-4 text-gold transition-transform', open && 'rotate-180')} />
        Ausgeblendete Belohnungen
        <span className="tabular-nums">({formatNumber(rewards.length)})</span>
      </button>

      {open && (
        <div id={panelId} className="mt-2">
          <Card padding="none" tone="flat">
            <ul className="divide-y divide-border">
              {rewards.map((reward) => {
                const purchased = purchasedIds.has(reward.id)
                return (
                  <li key={reward.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                    <span aria-hidden="true" className="text-xl leading-none opacity-70">
                      {reward.icon}
                    </span>
                    {/* Mindestbreite: Reicht der Platz nicht, rutschen die Aktionen in eine eigene Zeile. */}
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="line-clamp-2 text-[0.9375rem] text-parchment">{reward.title}</p>
                      <p className="text-sm text-muted">
                        {goldText(reward.price)}
                        {purchased && ' · bleibt wegen der Chronik erhalten'}
                      </p>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Eye />}
                        onClick={() => void restore(reward)}
                        aria-label={`„${reward.title}“ wieder einblenden`}
                      >
                        Einblenden
                      </Button>
                      {!purchased && (
                        <IconButton
                          size="sm"
                          icon={<Trash2 />}
                          onClick={() => {
                            setDeleteTarget(reward)
                            setLastTarget(reward)
                          }}
                          aria-label={`„${reward.title}“ endgültig löschen`}
                          title="Löschen"
                        />
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>
      )}

      {confirmDialog}
    </section>
  )
}
