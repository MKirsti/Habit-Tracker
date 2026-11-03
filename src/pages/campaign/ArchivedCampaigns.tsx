import { Lock, RotateCcw, Trash2, Trophy } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useGameContext } from '../../app/gameContext'
import { deleteMainQuest } from '../../data/repository'
import { BALANCING } from '../../domain/balancing'
import { isCampaignActive } from '../../domain/campaigns'
import type { MainQuestState } from '../../domain/types'
import { Badge, Button, ConfirmDialog, IconButton, ProgressBar, SectionTitle, formatNumber, useToast } from '../../ui'
import { restoreBlockedReason } from './campaignArchive'
import { campaignOrigin, originSummary } from './campaignOrigin'
import { errorMessage } from './errors'

export interface ArchivedCampaignsProps {
  /** Archivierte Kampagnen (`state.archivedMainQuests`). */
  campaigns: readonly MainQuestState[]
  /** Zurückholen – meldet Erfolg/Fehler selbst. */
  onRestore: (campaign: MainQuestState) => Promise<void>
  /** Nach dem endgültigen Löschen (z. B. um den Fokus zu setzen). */
  onDeleted?: (campaign: MainQuestState) => void
}

/** XP, die das Löschen einer Kampagne kostet: Kapitel-XP plus ggf. der Kampagnen-Bonus. */
function campaignXp(campaign: MainQuestState): number {
  return (
    campaign.chapters.filter((chapter) => chapter.done).length * BALANCING.chapterXp +
    (campaign.complete ? BALANCING.mainQuestXp : 0)
  )
}

/**
 * „Beendete & gemeisterte Kampagnen“: archivierte Kampagnen mit Fortschritt bzw. „Gemeistert“, zum
 * Zurückholen oder endgültigen Löschen.
 */
export function ArchivedCampaigns({ campaigns, onRestore, onDeleted }: ArchivedCampaignsProps) {
  const titleId = useId()
  const { toast } = useToast()
  const { state } = useGameContext()
  // Aktive Kampagnen – damit „Zurückholen“ schon vorher sagt, wenn kein Platz frei ist (statt erst per Fehler).
  const active = useMemo(() => state.mainQuests.filter(isCampaignActive), [state.mainQuests])
  const [restoringId, setRestoringId] = useState<string | null>(null)
  // Beim Öffnen der Rückfrage festgehalten (nach dem Löschen ist die Kampagne aus der Liste verschwunden).
  const [deleteTarget, setDeleteTarget] = useState<{ campaign: MainQuestState; xp: number } | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  async function restore(campaign: MainQuestState) {
    if (restoringId !== null) return
    setRestoringId(campaign.quest.id)
    try {
      await onRestore(campaign)
    } finally {
      setRestoringId(null)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const { quest } = deleteTarget.campaign
    try {
      await deleteMainQuest(quest.id)
    } catch (error) {
      toast({ tone: 'error', title: 'Löschen fehlgeschlagen', description: errorMessage(error) })
      throw error
    }
    toast({
      tone: 'success',
      title: 'Kampagne gelöscht',
      description: `„${quest.title}“ ist Geschichte. Deine Quests bleiben erhalten.`,
    })
    onDeleted?.(deleteTarget.campaign)
  }

  if (campaigns.length === 0) return null
  return (
    <section aria-labelledby={titleId} className="mt-12">
      <SectionTitle id={titleId} meta={formatNumber(campaigns.length)}>
        Beendete &amp; gemeisterte Kampagnen
      </SectionTitle>
      <ul className="grid gap-3 md:grid-cols-2">
        {campaigns.map((campaign) => (
          <ArchivedCampaignRow
            key={campaign.quest.id}
            campaign={campaign}
            restoring={restoringId === campaign.quest.id}
            disabled={restoringId !== null}
            blockedReason={restoreBlockedReason(campaign, active, BALANCING.maxActiveCampaigns)}
            onRestore={() => restore(campaign)}
            onDelete={() => {
              setDeleteTarget({ campaign, xp: campaignXp(campaign) })
              setDeleteOpen(true)
            }}
          />
        ))}
      </ul>

      {deleteTarget && (
        <ConfirmDialog
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onConfirm={handleDelete}
          title="Kampagne löschen?"
          message={`„${deleteTarget.campaign.quest.title}“ wird mit allen Kapiteln gelöscht. Deine Quests bleiben erhalten, gehören danach aber zu keiner Kampagne mehr.${
            deleteTarget.xp > 0 ? ` Die mit der Kampagne verdienten ${formatNumber(deleteTarget.xp)} XP entfallen.` : ''
          }`}
          confirmLabel="Endgültig löschen"
          danger
          icon={<Trash2 />}
        />
      )}
    </section>
  )
}

function ArchivedCampaignRow({
  campaign,
  restoring,
  disabled,
  blockedReason,
  onRestore,
  onDelete,
}: {
  campaign: MainQuestState
  restoring: boolean
  disabled: boolean
  /** Warum „Zurückholen“ gerade nicht geht (kein Platz, Vorlage läuft schon) – sonst `undefined`. */
  blockedReason?: string
  onRestore: () => void
  onDelete: () => void
}) {
  const titleId = useId()
  const blockedId = useId()
  const blocked = blockedReason !== undefined && !restoring
  const { quest, chapters, complete, progress } = campaign
  const origin = campaignOrigin(quest)
  const doneCount = chapters.filter((chapter) => chapter.done).length
  const percent = Math.round(progress * 100)

  return (
    <li
      aria-labelledby={titleId}
      className="relative flex min-w-0 flex-col rounded-2xl border border-border bg-surface/70 p-4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={
            complete
              ? 'grid size-12 shrink-0 place-items-center rounded-xl bg-gold/12 text-[1.625rem] ring-1 ring-gold/35 ring-inset'
              : 'grid size-12 shrink-0 place-items-center rounded-xl bg-black/25 text-[1.625rem] ring-1 ring-white/6 ring-inset grayscale-[40%]'
          }
        >
          {quest.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id={titleId}
            className="font-display text-base leading-snug font-semibold tracking-wide wrap-anywhere text-parchment"
          >
            {quest.title}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {complete ? (
              <Badge tone="gold" icon={<Trophy />}>
                Gemeistert
              </Badge>
            ) : (
              <Badge>Beendet</Badge>
            )}
            {origin && <span className="text-xs text-muted">{originSummary(origin)}</span>}
          </div>
        </div>
      </div>

      {chapters.length > 0 && (
        <ProgressBar
          className="mt-3.5"
          size="sm"
          value={progress}
          glow={complete}
          label={
            <span className="text-xs text-muted tabular-nums">
              {formatNumber(doneCount)} / {formatNumber(chapters.length)} Kapitel
            </span>
          }
          valueLabel={<span className="text-xs font-semibold text-gold-bright">{formatNumber(percent)} %</span>}
          valueText={`${formatNumber(percent)} % – ${formatNumber(doneCount)} von ${formatNumber(chapters.length)} Kapiteln abgeschlossen`}
        />
      )}

      <div className="mt-3.5 flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          loading={restoring}
          disabled={(disabled && !restoring) || blocked}
          onClick={onRestore}
          aria-describedby={blocked ? `${titleId} ${blockedId}` : titleId}
          icon={blocked ? <Lock /> : <RotateCcw />}
          className="flex-1 sm:flex-none"
        >
          Zurückholen
        </Button>
        <IconButton
          aria-label={`„${quest.title}“ löschen`}
          icon={<Trash2 />}
          size="sm"
          onClick={onDelete}
          disabled={disabled}
          className="ml-auto hover:text-danger!"
        />
      </div>
      {blocked && (
        <p id={blockedId} className="mt-2 text-xs leading-snug text-warning">
          {blockedReason}
        </p>
      )}
    </li>
  )
}
