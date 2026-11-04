import { Gift, Plus } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useGameContext } from '../app/gameContext'
import { moveReward, purchaseReward } from '../data/repository'
import type { Purchase, Reward } from '../domain/types'
import { Button, ConfirmDialog, EmptyState, PageHeader, SectionTitle, formatNumber, useToast } from '../ui'
import { ArchivedRewards } from './treasury/ArchivedRewards'
import { errorMessage } from './treasury/errors'
import { enabledElementById, rewardEditButtonId, rewardRedeemButtonId, usePendingFocus } from './treasury/focus'
import { GoldBalance } from './treasury/GoldBalance'
import { ItemsTeaser } from './treasury/ItemsTeaser'
import { PurchaseHistory } from './treasury/PurchaseHistory'
import { RewardCard } from './treasury/RewardCard'
import type { RewardMoveDirection } from './treasury/RewardCard'
import { RewardFormDialog } from './treasury/RewardFormDialog'
import { RewardSuggestions } from './treasury/RewardSuggestions'
import { openRewardSuggestions } from './treasury/rewardSuggestions'
import type { RewardSuggestion } from './treasury/rewardSuggestions'
import { goldText, rewardViews } from './treasury/treasuryState'

/** Was der Belohnungs-Dialog gerade zeigt. Bleibt beim Schließen erhalten (für die Ausblend-Animation). */
type FormTarget = { mode: 'create'; suggestion?: RewardSuggestion } | { mode: 'edit'; rewardId: string }

/** Live-Daten, an denen das Nachziehen des Fokus erkennt, dass eine Änderung angekommen ist. */
interface TreasurySnapshot {
  rewards: readonly Reward[]
  purchases: readonly Purchase[]
}

/** Die zuletzt verschobene Belohnung und ihre zuletzt angesagte Position (für die Ansage nach dem Verschieben). */
interface MovedReward {
  rewardId: string
  index: number
}

/**
 * „Schatzkammer“ (`/schatzkammer`): Gold-Guthaben, eigene echte Belohnungen einlösen, anlegen, bearbeiten,
 * sortieren und ausblenden, Ideen übernehmen, Chronik der Einlösungen (mit „Rückgängig“) und ein Platz für die
 * Gegenstände, die später dazukommen.
 */
export function TreasuryPage() {
  const { data, state, today } = useGameContext()
  const { toast } = useToast()
  const reduceMotion = useReducedMotion()
  const rewardsTitleId = useId()
  const effects = data.settings.effects && reduceMotion !== true

  const rewards = useMemo(() => data.rewards ?? [], [data.rewards])
  const purchases = useMemo(() => data.purchases ?? [], [data.purchases])
  const balance = state.gold.balance

  const views = useMemo(() => rewardViews(rewards, purchases, balance), [rewards, purchases, balance])
  const archived = useMemo(
    () => rewards.filter((reward) => reward.archived === true).sort((a, b) => a.order - b.order),
    [rewards],
  )
  const purchasedIds = useMemo(
    () => new Set(purchases.flatMap((purchase) => (purchase.rewardId === undefined ? [] : [purchase.rewardId]))),
    [purchases],
  )
  const suggestions = useMemo(() => openRewardSuggestions(rewards), [rewards])

  const [form, setForm] = useState<FormTarget>({ mode: 'create' })
  const [formOpen, setFormOpen] = useState(false)
  const [redeemTarget, setRedeemTarget] = useState<Reward | null>(null)
  const [lastRedeem, setLastRedeem] = useState<Reward | null>(null)
  const [celebrating, setCelebrating] = useState<string | null>(null)
  const [pulse, setPulse] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const lastMoved = useRef<MovedReward | null>(null)
  const newRewardRef = useRef<HTMLButtonElement>(null)
  const archivedToggleRef = useRef<HTMLButtonElement>(null)

  // Fokus nachziehen, sobald die Live-Daten die Änderung zeigen und kein Dialog der Seite mehr offen ist.
  const requestFocus = usePendingFocus<TreasurySnapshot>(
    { rewards, purchases },
    formOpen || redeemTarget !== null,
  )

  function announce(text: string) {
    // Gleicher Text zweimal hintereinander würde nicht erneut vorgelesen – daher abwechselnd ein Leerzeichen.
    setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text))
  }

  // Position nach dem Verschieben aus den frischen Daten ansagen (wie auf der Quests-Seite): Bei schnell
  // wiederholtem Drücken liegen mehrere Verschiebungen zwischen zwei gezeichneten Ständen.
  useEffect(() => {
    const moved = lastMoved.current
    if (!moved) return
    const index = views.findIndex((view) => view.reward.id === moved.rewardId)
    if (index === -1) {
      lastMoved.current = null
      return
    }
    if (index === moved.index) return
    moved.index = index
    announce(`„${views[index].reward.title}“ steht jetzt an Position ${index + 1} von ${views.length}.`)
  }, [views])

  const editedReward = form.mode === 'edit' ? rewards.find((reward) => reward.id === form.rewardId) : undefined

  function openCreate(suggestion?: RewardSuggestion) {
    setForm({ mode: 'create', suggestion })
    setFormOpen(true)
  }

  function openEdit(reward: Reward) {
    setForm({ mode: 'edit', rewardId: reward.id })
    setFormOpen(true)
  }

  /** Neue Belohnung: ihre Karte bekommt den Fokus (wie neue Quests) – auch wenn er zum Auslöser zurückkehrte. */
  function focusCreated(reward: Reward) {
    requestFocus({
      force: true,
      resolve: (snapshot) =>
        snapshot.rewards.some((item) => item.id === reward.id && item.archived !== true)
          ? document.getElementById(rewardEditButtonId(reward.id))
          : undefined,
    })
  }

  /** Ausgeblendet: Die Karte verschwindet – weiter geht es bei „Ausgeblendete Belohnungen“. */
  function focusArchived(reward: Reward) {
    requestFocus({
      resolve: (snapshot) =>
        snapshot.rewards.some((item) => item.id === reward.id && item.archived === true)
          ? (archivedToggleRef.current ?? newRewardRef.current)
          : undefined,
    })
  }

  async function move(reward: Reward, direction: RewardMoveDirection) {
    // Weitere Klicks, bevor die Liste neu gezeichnet ist, behalten die zuletzt angezeigte Position.
    if (lastMoved.current?.rewardId !== reward.id) {
      lastMoved.current = { rewardId: reward.id, index: views.findIndex((view) => view.reward.id === reward.id) }
    }
    try {
      await moveReward(reward.id, direction)
    } catch (error) {
      toast({ tone: 'error', title: 'Verschieben fehlgeschlagen', description: errorMessage(error) })
    }
  }

  function askRedeem(reward: Reward) {
    setRedeemTarget(reward)
    setLastRedeem(reward)
  }

  async function confirmRedeem() {
    const reward = redeemTarget
    if (!reward) return
    let purchase: Purchase
    try {
      purchase = await purchaseReward(reward.id, today)
    } catch (error) {
      toast({ tone: 'error', title: 'Einlösen nicht möglich', description: errorMessage(error) })
      throw error
    }
    toast({
      tone: 'xp',
      icon: <span aria-hidden="true">{reward.icon}</span>,
      title: 'Belohnung eingelöst!',
      description: `Gönn dir „${reward.title}“ – du hast es dir verdient. −${goldText(reward.price)}`,
    })
    if (effects) {
      setCelebrating(reward.id)
      setPulse((current) => current + 1)
    }
    // Einmalige Belohnung (oder jetzt zu teuer): „Einlösen“ verschwindet bzw. wird gesperrt – der Fokus bleibt
    // dann auf der Karte (Bearbeiten). Bleibt „Einlösen“ bedienbar, bleibt er dort.
    requestFocus({
      resolve: (snapshot) =>
        snapshot.purchases.some((item) => item.id === purchase.id)
          ? (enabledElementById(rewardRedeemButtonId(reward.id)) ?? document.getElementById(rewardEditButtonId(reward.id)))
          : undefined,
    })
  }

  const shownRedeem = redeemTarget ?? lastRedeem
  const remaining = shownRedeem ? balance - shownRedeem.price : 0

  return (
    <>
      <PageHeader
        eyebrow="Gold & Belohnungen"
        title="Schatzkammer"
        subtitle="Tausche dein Gold gegen echte Belohnungen, die du dir selbst gönnst."
        action={
          <Button ref={newRewardRef} icon={<Plus />} onClick={() => openCreate()}>
            Neue Belohnung
          </Button>
        }
      />

      <div className="flex flex-col gap-10">
        <GoldBalance gold={state.gold} pulse={pulse} effects={effects} />

        <section aria-labelledby={rewardsTitleId}>
          <SectionTitle id={rewardsTitleId} meta={views.length > 0 ? formatNumber(views.length) : undefined}>
            Belohnungen
          </SectionTitle>
          {views.length === 0 ? (
            <EmptyState
              icon={<Gift />}
              titleAs="h3"
              title="Deine Schatzkammer ist noch leer"
              text="Lege fest, womit du dich für deine Taten belohnst – eine Pizza, ein Kinoabend, ein lang ersehnter Wunsch. Oder übernimm unten eine Idee."
              action={
                <Button icon={<Plus />} onClick={() => openCreate()}>
                  Erste Belohnung anlegen
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
              {views.map((view, index) => (
                <RewardCard
                  key={view.reward.id}
                  view={view}
                  isFirst={index === 0}
                  isLast={index === views.length - 1}
                  onRedeem={askRedeem}
                  onEdit={openEdit}
                  onMove={(reward, direction) => void move(reward, direction)}
                  celebrating={celebrating === view.reward.id}
                  onCelebrationEnd={() => setCelebrating((current) => (current === view.reward.id ? null : current))}
                />
              ))}
            </ul>
          )}
          {/* Immer eingehängt: Nach dem Einblenden bzw. Löschen der letzten ausgeblendeten Belohnung zieht sie den
              Fokus noch nach (sie selbst verschwindet dann). */}
          <ArchivedRewards
            rewards={archived}
            purchasedIds={purchasedIds}
            toggleRef={archivedToggleRef}
            fallbackFocus={() => newRewardRef.current}
            className="mt-4"
          />
        </section>

        <RewardSuggestions suggestions={suggestions} onPick={(suggestion) => openCreate(suggestion)} />

        <PurchaseHistory purchases={purchases} />

        <ItemsTeaser />
      </div>

      <RewardFormDialog
        // Neuer Schlüssel je Ziel: Formular startet immer mit den Werten der gewählten Belohnung bzw. Idee.
        key={form.mode === 'edit' ? form.rewardId : `new-${form.suggestion?.id ?? ''}`}
        open={formOpen && (form.mode === 'create' || editedReward !== undefined)}
        onClose={() => setFormOpen(false)}
        reward={editedReward}
        suggestion={form.mode === 'create' ? form.suggestion : undefined}
        onCreated={focusCreated}
        onArchived={focusArchived}
      />

      <ConfirmDialog
        open={redeemTarget !== null}
        onClose={() => setRedeemTarget(null)}
        onConfirm={confirmRedeem}
        icon={shownRedeem?.icon}
        title={shownRedeem ? `„${shownRedeem.title}“ einlösen?` : 'Belohnung einlösen?'}
        message={
          shownRedeem && (
            <>
              Das kostet <strong className="font-semibold text-gold-bright">{goldText(shownRedeem.price)}</strong>.
              Danach hast du noch <span className="tabular-nums">{goldText(Math.max(remaining, 0))}</span>.
              {!shownRedeem.repeatable && ' Die Belohnung ist einmalig und danach eingelöst.'}
            </>
          )
        }
        confirmLabel={shownRedeem ? `Für ${goldText(shownRedeem.price)} einlösen` : 'Einlösen'}
      />

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  )
}
