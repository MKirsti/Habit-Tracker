import { Check, ChevronDown, Info, Trash2, TriangleAlert, Trophy } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useGameContext } from '../../app/gameContext'
import { createMainQuest, deleteMainQuest, updateMainQuest } from '../../data/repository'
import { BALANCING } from '../../domain/balancing'
import { addDays, isValidDayKey } from '../../domain/dates'
import type { Chapter, MainQuest } from '../../domain/types'
import type { MainQuestDraft } from '../../data/repository'
import {
  Button,
  Chip,
  ConfirmDialog,
  Dialog,
  EmojiPicker,
  Field,
  SectionTitle,
  TextArea,
  TextField,
  cn,
  formatNumber,
  useToast,
} from '../../ui'
import {
  CAMPAIGN_FIELD_ORDER,
  DEFAULT_CAMPAIGN_ICON,
  DESCRIPTION_MAX,
  REWARD_MAX,
  TITLE_MAX,
  WHY_MAX,
  campaignDraftFromValues,
  hasErrors,
  initialCampaignFormValues,
  validateCampaignForm,
} from './campaignForm'
import type { CampaignFormErrors, CampaignFormField, CampaignFormValues } from './campaignForm'
import { countLabel, durationLabel } from './campaignText'
import { ChapterFormDialog } from './ChapterFormDialog'
import { ChapterListEditor } from './ChapterListEditor'
import { campaignEditLoss, campaignEditLossText } from './campaignXp'
import { errorMessage } from './errors'

export interface CampaignFormDialogProps {
  open: boolean
  onClose: () => void
  /** Zu bearbeitende Kampagne. Ohne Kampagne legt der Dialog eine neue an. */
  quest?: MainQuest
  /** Nach erfolgreichem Anlegen (direkt bevor sich der Dialog schließt). */
  onCreated?: (quest: MainQuest) => void
  /** Nach erfolgreichem Löschen (direkt bevor sich der Dialog schließt). */
  onDeleted?: (quest: MainQuest) => void
}

/** Schnellauswahl für das Zieldatum (Tage ab Start). */
const DEADLINE_PRESETS = [30, 90, 365] as const

/**
 * Dialog zum Anlegen und Bearbeiten einer Kampagne samt Kapiteln. Speichert selbst über das
 * Repository und zeigt Erfolg bzw. Fehler als Toast. Beim Bearbeiten lässt sich die Kampagne hier
 * auch löschen.
 */
export function CampaignFormDialog({ open, onClose, quest, onCreated, onDeleted }: CampaignFormDialogProps) {
  const { data, today, state } = useGameContext()
  const { toast } = useToast()
  const baseId = useId()
  const formId = `${baseId}form`
  const pickerId = `${baseId}emoji`
  const ids: Record<CampaignFormField, string> = {
    title: `${baseId}title`,
    description: `${baseId}description`,
    why: `${baseId}why`,
    reward: `${baseId}reward`,
    startDay: `${baseId}start`,
    deadline: `${baseId}deadline`,
  }
  const isEdit = quest !== undefined

  const habitsById = useMemo(() => new Map(data.habits.map((habit) => [habit.id, habit])), [data.habits])
  // Abgeschlossene Kapitel (laut aktuellem Spielstand) – für den XP-Hinweis beim Löschen.
  const campaignState = state.mainQuests.find((candidate) => candidate.quest.id === quest?.id)
  const doneChapterIds = useMemo(() => {
    const done = new Set<string>()
    for (const chapter of campaignState?.chapters ?? []) if (chapter.done) done.add(chapter.chapter.id)
    return done
  }, [campaignState])
  // XP, die das Löschen der ganzen Kampagne kostet: alle Kapitel-XP plus ggf. der Kampagnen-Bonus.
  const campaignXp = doneChapterIds.size * BALANCING.chapterXp + (campaignState?.complete ? BALANCING.mainQuestXp : 0)

  const [values, setValues] = useState(() => initialCampaignFormValues(quest, today))
  const [touched, setTouched] = useState<ReadonlySet<CampaignFormField>>(() => new Set())
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Beim Öffnen der Rückfrage festgehalten (nach dem Löschen ändert sich der Spielstand schon beim Ausblenden).
  const [confirmXp, setConfirmXp] = useState(0)
  // Rückfrage vor dem Speichern, falls die Änderung XP kostet (späterer Start, höheres Ziel …):
  // Entwurf und Text beim Öffnen festgehalten.
  const [pendingSave, setPendingSave] = useState<{ draft: MainQuestDraft; warning: string } | null>(null)
  // Kapitel-Dialog: Position des bearbeiteten Kapitels, `null` = neues Kapitel.
  const [chapterIndex, setChapterIndex] = useState<number | null>(null)
  const [chapterOpen, setChapterOpen] = useState(false)

  // Bei jedem Öffnen frisch starten (Muster „State während des Renderns anpassen“).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setValues(initialCampaignFormValues(quest, today))
      setTouched(new Set())
      setSubmitted(false)
      setSaving(false)
      setPickerOpen(false)
      setConfirmDelete(false)
      setPendingSave(null)
      setChapterOpen(false)
    }
  }

  const errors = validateCampaignForm(values)
  function shownError(field: CampaignFormField): string | undefined {
    return submitted || touched.has(field) ? errors[field] : undefined
  }

  function update<K extends keyof CampaignFormValues>(key: K, value: CampaignFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function touch(field: CampaignFormField) {
    setTouched((current) => (current.has(field) ? current : new Set(current).add(field)))
  }

  function focusFirstError(currentErrors: CampaignFormErrors) {
    const first = CAMPAIGN_FIELD_ORDER.find((field) => currentErrors[field] !== undefined)
    if (first) document.getElementById(ids[first])?.focus()
  }

  function close() {
    if (!saving) onClose()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingRef.current) return
    setSubmitted(true)
    const currentErrors = validateCampaignForm(values)
    if (hasErrors(currentErrors)) {
      focusFirstError(currentErrors)
      return
    }
    const draft = campaignDraftFromValues(values)
    if (quest) {
      // Quest-Ziele werden live ab dem Start berechnet: Ein späterer Start, ein höheres Ziel oder ein neues
      // offenes Kapitel kann Abschlüsse (und XP) kosten – dann erst nachfragen.
      const loss = campaignEditLoss(data, today, quest.id, { ...quest, ...draft })
      if (loss.xp > 0) {
        setPendingSave({ draft, warning: campaignEditLossText(loss) })
        return
      }
    }
    savingRef.current = true
    setSaving(true)
    try {
      await save(draft)
    } catch {
      // Fehler wurde gemeldet – der Dialog bleibt offen.
    } finally {
      setSaving(false)
      savingRef.current = false
    }
  }

  /** Speichert bzw. legt an, meldet Erfolg und schließt; wirft nach einem Fehler-Toast weiter. */
  async function save(draft: MainQuestDraft) {
    try {
      if (quest) {
        await updateMainQuest(quest.id, draft)
        toast({ tone: 'success', title: 'Kampagne gespeichert', description: `„${draft.title}“ ist auf dem neuesten Stand.` })
      } else {
        const created = await createMainQuest(draft)
        toast({
          tone: 'success',
          title: 'Kampagne erstellt',
          description: `„${draft.title}“ beginnt. Verknüpfe jetzt Quests, die dich voranbringen.`,
        })
        onCreated?.(created)
      }
    } catch (error) {
      toast({ tone: 'error', title: 'Kampagne konnte nicht gespeichert werden', description: errorMessage(error) })
      throw error
    }
    onClose()
  }

  async function handleDelete() {
    if (!quest) return
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
    onDeleted?.(quest)
    onClose()
  }

  function openChapter(index: number | null) {
    setChapterIndex(index)
    setChapterOpen(true)
  }

  function saveChapter(chapter: Chapter) {
    setValues((current) => ({
      ...current,
      chapters:
        chapterIndex === null
          ? [...current.chapters, chapter]
          : current.chapters.map((existing, index) => (index === chapterIndex ? chapter : existing)),
    }))
  }

  const editedChapter = chapterIndex !== null ? values.chapters[chapterIndex] : undefined
  const startValid = isValidDayKey(values.startDay)
  const linkedCount = quest ? data.habits.filter((habit) => habit.mainQuestId === quest.id).length : 0

  return (
    <>
      <Dialog
        open={open}
        onClose={close}
        closeOnOverlayClick={!saving}
        size="lg"
        icon={values.icon || DEFAULT_CAMPAIGN_ICON}
        title={isEdit ? 'Kampagne bearbeiten' : 'Neue Kampagne'}
        description={isEdit ? undefined : 'Welches große Ziel willst du erreichen?'}
        footer={
          <>
            <div className={cn('gap-2 sm:contents', isEdit ? 'grid grid-cols-2' : 'flex')}>
              {isEdit && (
                <Button
                  variant="ghost"
                  icon={<Trash2 />}
                  onClick={() => {
                    setConfirmXp(campaignXp)
                    setConfirmDelete(true)
                  }}
                  disabled={saving}
                  className="text-danger! hover:text-danger! sm:mr-auto"
                >
                  Löschen
                </Button>
              )}
              <Button variant="secondary" onClick={close} disabled={saving} className="flex-1 sm:flex-none">
                Abbrechen
              </Button>
            </div>
            <Button type="submit" form={formId} loading={saving} icon={<Check />}>
              {isEdit ? 'Speichern' : 'Kampagne erstellen'}
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={handleSubmit} className="space-y-6">
          {/* Symbol + Titel */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Field id={`${baseId}icon`} label="Symbol" group>
                <button
                  type="button"
                  aria-label={`Symbol ändern (aktuell ${values.icon || DEFAULT_CAMPAIGN_ICON})`}
                  aria-expanded={pickerOpen}
                  aria-controls={pickerId}
                  onClick={() => setPickerOpen((current) => !current)}
                  className={cn(
                    'flex h-11 w-[4.5rem] items-center justify-center gap-1 rounded-xl border bg-bg-deep/70 transition-colors',
                    pickerOpen ? 'border-gold ring-2 ring-gold/25' : 'border-border-strong hover:border-gold-dim',
                  )}
                >
                  <span aria-hidden="true" className="text-2xl leading-none">
                    {values.icon || DEFAULT_CAMPAIGN_ICON}
                  </span>
                  <ChevronDown
                    aria-hidden
                    className={cn('size-4 text-gold transition-transform', pickerOpen && 'rotate-180')}
                  />
                </button>
              </Field>
              <TextField
                id={ids.title}
                label="Titel"
                value={values.title}
                onChange={(title) => update('title', title)}
                onBlur={() => touch('title')}
                error={shownError('title')}
                placeholder="z. B. Halbmarathon im Juni"
                className="scroll-mt-10"
                maxLength={TITLE_MAX}
                showCount
                required
                autoComplete="off"
                fieldClassName="min-w-0 flex-1"
              />
            </div>
            {pickerOpen && (
              <div id={pickerId}>
                <EmojiPicker value={values.icon} onChange={(icon) => update('icon', icon)} />
              </div>
            )}
          </div>

          <TextArea
            id={ids.description}
            label="Beschreibung"
            value={values.description}
            onChange={(description) => update('description', description)}
            onBlur={() => touch('description')}
            error={shownError('description')}
            hint="Optional – worum geht es in dieser Kampagne?"
            placeholder="z. B. Ein Jahr voller Bücher: Aus kleinen Leseeinheiten wird ein belesener Geist."
            maxLength={DESCRIPTION_MAX}
            showCount
            rows={2}
          />

          <TextArea
            id={ids.why}
            label="Warum?"
            value={values.why}
            onChange={(why) => update('why', why)}
            onBlur={() => touch('why')}
            error={shownError('why')}
            hint="Dein Antrieb – er steht als Leitspruch über deiner Kampagne."
            placeholder="z. B. Ich will mehr wissen, klarer denken und Geschichten in mir tragen."
            className="scroll-mt-10"
            maxLength={WHY_MAX}
            showCount
            rows={2}
            required
          />

          <TextField
            id={ids.reward}
            label="Belohnung"
            value={values.reward}
            onChange={(reward) => update('reward', reward)}
            onBlur={() => touch('reward')}
            error={shownError('reward')}
            hint="Womit belohnst du dich, wenn du es geschafft hast?"
            placeholder="z. B. Ein Wochenende in den Bergen"
            maxLength={REWARD_MAX}
            leading={<Trophy />}
            autoComplete="off"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={ids.startDay}
              type="date"
              label="Start"
              value={values.startDay}
              onChange={(startDay) => update('startDay', startDay)}
              onBlur={() => touch('startDay')}
              error={shownError('startDay')}
              hint="Ab hier zählen Erledigungen für Quest-Ziele."
              className="scroll-mt-10"
              required
            />
            <div className="space-y-2">
              <TextField
                id={ids.deadline}
                type="date"
                label="Zieldatum"
                value={values.deadline}
                onChange={(deadline) => {
                  touch('deadline')
                  update('deadline', deadline)
                }}
                onBlur={() => touch('deadline')}
                error={shownError('deadline')}
                hint="Optional – bis wann willst du es schaffen?"
                min={startValid ? values.startDay : undefined}
                className="scroll-mt-10"
              />
              <div role="group" aria-label="Zieldatum schnell wählen" className="flex flex-wrap gap-1.5">
                {DEADLINE_PRESETS.map((days) => {
                  const day = startValid ? addDays(values.startDay, days) : ''
                  return (
                    <Chip
                      key={days}
                      size="sm"
                      disabled={!startValid}
                      selected={startValid && values.deadline === day}
                      onClick={() => {
                        touch('deadline')
                        update('deadline', day)
                      }}
                    >
                      {durationLabel(days)}
                    </Chip>
                  )
                })}
                <Chip size="sm" selected={values.deadline === ''} onClick={() => update('deadline', '')}>
                  Ohne
                </Chip>
              </div>
            </div>
          </div>

          <section aria-labelledby={`${baseId}chapters`}>
            <SectionTitle
              id={`${baseId}chapters`}
              as="h3"
              meta={values.chapters.length > 0 ? formatNumber(values.chapters.length) : undefined}
            >
              Kapitel
            </SectionTitle>
            <p className="mb-3 text-sm text-muted">
              Etappen auf dem Weg zum Ziel – jedes bringt{' '}
              <span className="font-medium text-gold-bright">+{formatNumber(BALANCING.chapterXp)} XP</span>, alle zusammen
              weitere <span className="font-medium text-gold-bright">+{formatNumber(BALANCING.mainQuestXp)} XP</span>.
            </p>
            <ChapterListEditor
              chapters={values.chapters}
              habitsById={habitsById}
              onChange={(chapters) => update('chapters', chapters)}
              onEdit={(index) => openChapter(index)}
              onAdd={() => openChapter(null)}
              isDone={(chapter) => doneChapterIds.has(chapter.id)}
            />
          </section>

          {isEdit && (
            <p className="flex items-start gap-2.5 rounded-xl border border-info/30 bg-info/8 px-3.5 py-2.5 text-sm text-parchment/90">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
              <span>
                Quests verknüpfst du beim Anlegen oder Bearbeiten einer Quest
                {linkedCount > 0 ? ` – aktuell ${countLabel(linkedCount, 'Quest', 'Quests')}` : ''}.
              </span>
            </p>
          )}
        </form>
      </Dialog>

      {/* Außerhalb des <form>: Der Kapitel-Dialog hat ein eigenes Formular. */}
      <ChapterFormDialog
        open={open && chapterOpen}
        onClose={() => setChapterOpen(false)}
        chapter={editedChapter}
        number={chapterIndex === null ? values.chapters.length + 1 : chapterIndex + 1}
        campaignId={quest?.id}
        onSubmit={saveChapter}
        submitLabel={editedChapter ? 'Übernehmen' : 'Hinzufügen'}
      />

      <ConfirmDialog
        open={open && pendingSave !== null}
        onClose={() => setPendingSave(null)}
        onConfirm={async () => {
          if (pendingSave) await save(pendingSave.draft)
        }}
        title="Änderung kostet XP"
        message={pendingSave?.warning}
        confirmLabel="Trotzdem speichern"
        danger
        icon={<TriangleAlert />}
      />

      {quest && (
        <ConfirmDialog
          open={open && confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
          title="Kampagne löschen?"
          message={`„${quest.title}“ wird mit allen Kapiteln gelöscht. Deine Quests bleiben erhalten, gehören danach aber zu keiner Kampagne mehr.${
            confirmXp > 0 ? ` Die mit der Kampagne verdienten ${formatNumber(confirmXp)} XP entfallen.` : ''
          }`}
          confirmLabel="Endgültig löschen"
          danger
          icon={<Trash2 />}
        />
      )}
    </>
  )
}
