import { Archive, Sparkles, Trophy } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameContext } from '../../app/gameContext'
import { archiveMainQuest } from '../../data/repository'
import { BALANCING } from '../../domain/balancing'
import type { Habit, MainQuestState } from '../../domain/types'
import { Button, Dialog, Switch, cn, formatNumber, useToast } from '../../ui'
import { campaignQuestsToArchive } from './campaignArchive'
import { countLabel } from './campaignText'
import { errorMessage } from './errors'

export interface ArchiveCampaignDialogProps {
  open: boolean
  onClose: () => void
  /** Die zu beendende (bzw. gemeisterte) Kampagne – beim Öffnen festgehalten. */
  campaign: MainQuestState
  /** Nach erfolgreichem Archivieren (direkt bevor sich der Dialog schließt). */
  onArchived?: (campaign: MainQuestState) => void
}

/**
 * Rückfrage „Kampagne beenden?“ (laufend) bzw. „In die Ruhmeshalle legen?“ (gemeistert) mit dem Schalter
 * „Zugehörige Quests ebenfalls archivieren“ (Standard: an). Verdiente XP bleiben in beiden Fällen.
 */
export function ArchiveCampaignDialog({ open, onClose, campaign, onArchived }: ArchiveCampaignDialogProps) {
  const { data, today, state } = useGameContext()
  const { toast } = useToast()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const [archiveQuests, setArchiveQuests] = useState(true)
  const [busy, setBusy] = useState(false)
  // Im Ladezustand ist der Bestätigen-Button deaktiviert (der Fokus landet auf <body>) – nach einem Fehler
  // bekommt er ihn zurück, sobald er wieder bedienbar ist.
  const refocusConfirm = useRef(false)
  useEffect(() => {
    if (busy || !refocusConfirm.current) return
    refocusConfirm.current = false
    const button = confirmRef.current
    const active = document.activeElement
    if (button?.isConnected && (active === null || active === document.body)) button.focus({ preventScroll: true })
  }, [busy])

  // Bei jedem Öffnen frisch: Schalter wieder an.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setArchiveQuests(true)
      setBusy(false)
    }
  }

  const { quest, complete, chapters } = campaign
  const quests = useMemo(
    () => campaignQuestsToArchive(campaign, data.habits, state.mainQuests, today),
    [campaign, data.habits, state.mainQuests, today],
  )
  const earnedXp = chapters.filter((chapter) => chapter.done).length * BALANCING.chapterXp + (complete ? BALANCING.mainQuestXp : 0)

  async function confirm() {
    if (busy) return
    setBusy(true)
    try {
      await archiveMainQuest(quest.id, today, { archiveQuests: archiveQuests && quests.archived.length > 0 })
    } catch (error) {
      toast({
        tone: 'error',
        title: complete ? 'Kampagne konnte nicht abgelegt werden' : 'Kampagne konnte nicht beendet werden',
        description: errorMessage(error),
      })
      refocusConfirm.current = true
      setBusy(false)
      return
    }
    toast({
      tone: 'success',
      title: complete ? 'In der Ruhmeshalle' : 'Kampagne beendet',
      description: complete
        ? `„${quest.title}“ hat ihren Ehrenplatz. Deine XP bleiben dir.`
        : `„${quest.title}“ ruht jetzt bei den beendeten Kampagnen. Du kannst sie jederzeit zurückholen.`,
    })
    setBusy(false)
    onArchived?.(campaign)
    onClose()
  }

  const title = complete ? 'In die Ruhmeshalle legen?' : 'Kampagne beenden?'
  const description = complete
    ? `„${quest.title}“ wandert mit all ihren Kapiteln in die Ruhmeshalle.`
    : `„${quest.title}“ wird beendet und gibt einen Kampagnen-Platz frei. Du kannst sie später zurückholen.`
  const xpText =
    earnedXp > 0
      ? `Deine verdienten XP bleiben erhalten – auch die ${formatNumber(earnedXp)} XP aus dieser Kampagne.`
      : 'Deine verdienten XP bleiben erhalten.'

  const archivedCount = quests.archived.length
  // Laufen auf jeden Fall weiter: eigene, die eine andere Kampagne mitbenutzt, und mitbenutzte anderer Kampagnen.
  const continuing = [...quests.kept, ...quests.borrowed]
  const keptCount = continuing.length

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      closeOnOverlayClick={!busy}
      role="alertdialog"
      size="md"
      icon={complete ? <Trophy /> : <Archive />}
      title={title}
      description={description}
      initialFocusRef={complete ? confirmRef : cancelRef}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button ref={confirmRef} onClick={confirm} loading={busy} icon={complete ? <Trophy /> : <Archive />}>
            {complete ? 'In die Ruhmeshalle legen' : 'Kampagne beenden'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="flex items-start gap-2.5 rounded-xl border border-gold/30 bg-gold/8 px-3.5 py-3 text-sm text-parchment/90">
          <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-gold-bright" />
          <span>{xpText}</span>
        </p>
        {archivedCount > 0 && (
          <div className="rounded-xl border border-border bg-bg-deep/40 px-3.5 pt-1 pb-3">
            <Switch
              checked={archiveQuests}
              onChange={setArchiveQuests}
              disabled={busy}
              label="Zugehörige Quests ebenfalls archivieren"
              description={
                archiveQuests
                  ? `${countLabel(archivedCount, 'Quest ruht', 'Quests ruhen')} dann und ${archivedCount === 1 ? 'erscheint' : 'erscheinen'} nicht mehr in deinem Tagesplan.`
                  : `${countLabel(archivedCount, 'Quest läuft', 'Quests laufen')} ohne Kampagne weiter.`
              }
            />
            {/* Welche genau – damit niemand rätseln muss, ob z. B. „Täglich lesen“ dabei ist. */}
            <QuestChips habits={quests.archived} label="Betroffene Quests" dimmed={!archiveQuests} />
          </div>
        )}
        {keptCount > 0 && (
          <div>
            <p className="text-sm text-muted">
              {countLabel(keptCount, 'geteilte Quest läuft', 'geteilte Quests laufen')} für deine anderen Kampagnen
              weiter:
            </p>
            <QuestChips habits={continuing} label="Geteilte Quests, die weiterlaufen" />
          </div>
        )}
      </div>
    </Dialog>
  )
}

/** Höchstens so viele Quests als Chips – der Rest als „+N weitere“. */
const MAX_CHIPS = 6

/** Quests als kleine Chips (Symbol + Titel). */
function QuestChips({ habits, label, dimmed = false }: { habits: readonly Habit[]; label: string; dimmed?: boolean }) {
  const shown = habits.slice(0, MAX_CHIPS)
  const rest = habits.length - shown.length
  return (
    <ul
      aria-label={label}
      className={cn('mt-2 flex flex-wrap gap-1.5 transition-opacity duration-200', dimmed && 'opacity-60')}
    >
      {shown.map((habit) => (
        <li
          key={habit.id}
          className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface/80 px-2.5 py-1 text-xs leading-none text-parchment/90"
        >
          <span aria-hidden="true">{habit.icon}</span>
          <span className="min-w-0 truncate">{habit.title}</span>
        </li>
      ))}
      {rest > 0 && <li className="inline-flex items-center px-1 text-xs text-muted">+{formatNumber(rest)} weitere</li>}
    </ul>
  )
}
