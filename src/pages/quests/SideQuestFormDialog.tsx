import { Check, ChevronDown, Info, Trash2, TriangleAlert } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useGameContext } from '../../app/gameContext'
import { createSideQuest, deleteSideQuest, updateSideQuest } from '../../data/repository'
import { DIFFICULTIES, DIFFICULTY_META } from '../../domain/balancing'
import { questXp } from '../../domain/schedule'
import type { SideQuest } from '../../domain/types'
import { goldForTotalXp } from '../../features/feedback/feedbackEvents'
import {
  Button,
  Chip,
  ConfirmDialog,
  Dialog,
  EmojiPicker,
  Field,
  SegmentedControl,
  TextArea,
  TextField,
  cn,
  formatNumber,
  useToast,
} from '../../ui'
import { AttributePicker } from './AttributePicker'
import { errorMessage } from './errors'
import {
  DESCRIPTION_MAX,
  SIDE_QUEST_FIELD_ORDER,
  TITLE_MAX,
  doneDifficultyNote,
  dueDayPresets,
  hasSideQuestErrors,
  initialSideQuestFormValues,
  sameSideQuestFormValues,
  sideQuestDeletionImpact,
  sideQuestDeletionText,
  sideQuestDraftFromValues,
  validateSideQuestForm,
} from './sideQuestForm'
import type {
  SideQuestDeletionImpact,
  SideQuestFormErrors,
  SideQuestFormField,
  SideQuestFormValues,
} from './sideQuestForm'

export interface SideQuestFormDialogProps {
  open: boolean
  onClose: () => void
  /** Zu bearbeitende Nebenquest. Ohne legt der Dialog eine neue an. */
  sideQuest?: SideQuest
  /** Nach erfolgreichem Anlegen (direkt bevor sich der Dialog schließt), z. B. um den Fokus zu setzen. */
  onCreated?: (quest: SideQuest) => void
  /** Nach erfolgreichem Löschen (direkt bevor sich der Dialog schließt). */
  onDeleted?: (quest: SideQuest) => void
}

const DIFFICULTY_OPTIONS = DIFFICULTIES.map((difficulty) => ({
  value: difficulty,
  label: DIFFICULTY_META[difficulty].label,
}))

/**
 * Dialog zum Anlegen und Bearbeiten einer Nebenquest (einmalige Aufgabe mit XP): Symbol, Titel, optionaler
 * Termin, Attribut, Schwierigkeit und Beschreibung. Speichert selbst über das Repository und zeigt Erfolg bzw.
 * Fehler als Toast. Beim Bearbeiten lässt sie sich hier auch löschen (mit Rückfrage – eine erledigte kostet ihre
 * XP). Geteilt von der Quests-Seite und dem Schnell-Anlegen auf dem Dashboard.
 */
export function SideQuestFormDialog({ open, onClose, sideQuest, onCreated, onDeleted }: SideQuestFormDialogProps) {
  const { data, today } = useGameContext()
  const { toast } = useToast()
  const baseId = useId()
  const formId = `${baseId}form`
  const ids: Record<SideQuestFormField, string> = {
    title: `${baseId}title`,
    description: `${baseId}description`,
    dueDay: `${baseId}due`,
  }
  const pickerId = `${baseId}emoji`
  const isEdit = sideQuest !== undefined

  const [initialValues, setInitialValues] = useState(() => initialSideQuestFormValues(sideQuest))
  const [values, setValues] = useState(initialValues)
  const [touched, setTouched] = useState<ReadonlySet<SideQuestFormField>>(() => new Set())
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Ziel samt Kennzahlen beim Öffnen der Rückfrage festhalten – der Text ändert sich beim Ausblenden nicht mehr.
  const [deleteImpact, setDeleteImpact] = useState<SideQuestDeletionImpact | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Bei jedem Öffnen frisch starten (Muster „State während des Renderns anpassen“).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      const next = initialSideQuestFormValues(sideQuest)
      setInitialValues(next)
      setValues(next)
      setTouched(new Set())
      setSubmitted(false)
      setSaving(false)
      setPickerOpen(false)
      setConfirmDelete(false)
    }
  }

  const errors = validateSideQuestForm(values)
  // Mit Eingaben schließt ein (versehentlicher) Tipp auf den Hintergrund den Dialog nicht.
  const dirty = !sameSideQuestFormValues(values, initialValues)
  function shownError(field: SideQuestFormField): string | undefined {
    return submitted || touched.has(field) ? errors[field] : undefined
  }

  function update<K extends keyof SideQuestFormValues>(key: K, value: SideQuestFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function touch(field: SideQuestFormField) {
    setTouched((current) => (current.has(field) ? current : new Set(current).add(field)))
  }

  function focusFirstError(currentErrors: SideQuestFormErrors) {
    const first = SIDE_QUEST_FIELD_ORDER.find((field) => currentErrors[field] !== undefined)
    if (first) document.getElementById(ids[first])?.focus()
  }

  function close() {
    if (!saving) onClose()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Ref statt State: schützt auch vor doppeltem Absenden innerhalb desselben Renders (Doppel-Enter).
    if (savingRef.current) return
    setSubmitted(true)
    const currentErrors = validateSideQuestForm(values)
    if (hasSideQuestErrors(currentErrors)) {
      focusFirstError(currentErrors)
      return
    }
    savingRef.current = true
    setSaving(true)
    const draft = sideQuestDraftFromValues(values)
    try {
      if (sideQuest) {
        await updateSideQuest(sideQuest.id, draft)
        toast({ tone: 'success', title: 'Nebenquest gespeichert', description: `„${draft.title}“ ist auf dem neuesten Stand.` })
      } else {
        const created = await createSideQuest(draft, today)
        toast({ tone: 'success', title: 'Nebenquest angelegt', description: `„${draft.title}“ wartet auf dich.` })
        onCreated?.(created)
      }
      setSaving(false)
      onClose()
    } catch (error) {
      setSaving(false)
      toast({ tone: 'error', title: 'Nebenquest konnte nicht gespeichert werden', description: errorMessage(error) })
    } finally {
      savingRef.current = false
    }
  }

  function askDelete() {
    if (!sideQuest) return
    // Wie das Löschen selbst gerechnet (Spielstand vorher − nachher) – der genannte Verlust stimmt exakt.
    setDeleteImpact(sideQuestDeletionImpact(data, sideQuest.id, today))
    setConfirmDelete(true)
  }

  async function handleDelete() {
    if (!sideQuest) return
    try {
      await deleteSideQuest(sideQuest.id)
    } catch (error) {
      toast({ tone: 'error', title: 'Löschen fehlgeschlagen', description: errorMessage(error) })
      throw error
    }
    toast({ tone: 'info', title: 'Nebenquest gelöscht', description: `„${sideQuest.title}“ wurde entfernt.` })
    onDeleted?.(sideQuest)
    onClose()
  }

  const xp = questXp(values.difficulty)
  const gold = goldForTotalXp(xp)
  const presets = dueDayPresets(today)
  const difficultyNote = doneDifficultyNote(sideQuest, values, today)

  return (
    <>
      <Dialog
        open={open}
        onClose={close}
        closeOnOverlayClick={!saving && !dirty}
        size="lg"
        icon={values.icon || initialSideQuestFormValues().icon}
        title={isEdit ? 'Nebenquest bearbeiten' : 'Neue Nebenquest'}
        description={isEdit ? undefined : 'Eine einmalige Aufgabe – erledigt bringt sie XP und Gold.'}
        footer={
          <>
            {/* Handy: „Löschen“ und „Abbrechen“ nebeneinander unter „Speichern“; ab sm eine Zeile. */}
            <div className={cn('gap-2 sm:contents', isEdit ? 'grid grid-cols-2' : 'flex')}>
              {isEdit && (
                <Button
                  variant="ghost"
                  icon={<Trash2 />}
                  onClick={askDelete}
                  disabled={saving}
                  className="text-danger! hover:bg-danger/10! sm:mr-auto"
                >
                  Löschen
                </Button>
              )}
              <Button variant="secondary" onClick={close} disabled={saving} className="flex-1 sm:flex-none">
                Abbrechen
              </Button>
            </div>
            <Button type="submit" form={formId} loading={saving} icon={<Check />}>
              {isEdit ? 'Speichern' : 'Nebenquest anlegen'}
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={handleSubmit} className="space-y-6">
          {!isEdit && (
            <p className="flex items-start gap-2.5 rounded-xl border border-info/30 bg-info/8 px-3.5 py-2.5 text-sm text-parchment/90">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
              <span>Nebenquests zählen nicht für den Perfekten Tag und kosten nie etwas, wenn sie liegen bleiben.</span>
            </p>
          )}
          {/* Symbol + Titel */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Field id={`${baseId}icon`} label="Symbol" group>
                <button
                  type="button"
                  aria-label={`Symbol ändern (aktuell ${values.icon || initialSideQuestFormValues().icon})`}
                  aria-expanded={pickerOpen}
                  aria-controls={pickerId}
                  onClick={() => setPickerOpen((current) => !current)}
                  className={cn(
                    'flex h-11 w-[4.5rem] items-center justify-center gap-1 rounded-xl border bg-bg-deep/70 transition-colors',
                    pickerOpen ? 'border-gold ring-2 ring-gold/25' : 'border-border-strong hover:border-gold-dim',
                  )}
                >
                  <span aria-hidden="true" className="text-2xl leading-none">
                    {values.icon || initialSideQuestFormValues().icon}
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
                placeholder="z. B. Steuererklärung abgeben"
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

          <div className="space-y-2">
            <TextField
              id={ids.dueDay}
              type="date"
              label="Termin"
              value={values.dueDay}
              onChange={(dueDay) => {
                touch('dueDay')
                update('dueDay', dueDay)
              }}
              onBlur={() => touch('dueDay')}
              error={shownError('dueDay')}
              hint="Optional – bis wann soll sie erledigt sein?"
              className="scroll-mt-10"
              fieldClassName="max-w-xs"
            />
            <div role="group" aria-label="Termin schnell wählen" className="flex flex-wrap gap-1.5">
              {presets.map((preset) => (
                <Chip
                  key={preset.label}
                  size="sm"
                  selected={values.dueDay === preset.day}
                  onClick={() => {
                    touch('dueDay')
                    update('dueDay', preset.day)
                  }}
                >
                  {preset.label}
                </Chip>
              ))}
              <Chip
                size="sm"
                selected={values.dueDay === ''}
                onClick={() => {
                  touch('dueDay')
                  update('dueDay', '')
                }}
              >
                Ohne Termin
              </Chip>
            </div>
          </div>

          <AttributePicker
            value={values.attribute}
            onChange={(attribute) => update('attribute', attribute)}
            hint="Dieses Attribut wächst, wenn du die Nebenquest erledigst."
          />

          <div className="space-y-3">
            <SegmentedControl
              label="Schwierigkeit"
              value={values.difficulty}
              onChange={(difficulty) => update('difficulty', difficulty)}
              options={DIFFICULTY_OPTIONS}
              hint={
                <span className="font-medium text-gold-bright tabular-nums">
                  +{formatNumber(xp)} XP · +{formatNumber(gold)} Gold bei Erledigung
                </span>
              }
            />
            <div aria-live="polite" className="empty:hidden">
              {difficultyNote !== undefined && (
                <p className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/8 px-3.5 py-2.5 text-sm text-parchment/90">
                  <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>{difficultyNote}</span>
                </p>
              )}
            </div>
          </div>

          <TextArea
            id={ids.description}
            label="Beschreibung"
            value={values.description}
            onChange={(description) => update('description', description)}
            onBlur={() => touch('description')}
            error={shownError('description')}
            hint="Optional – was gehört dazu?"
            placeholder="z. B. Belege sortieren und abschicken."
            maxLength={DESCRIPTION_MAX}
            showCount
            rows={2}
          />
        </form>
      </Dialog>

      {sideQuest && (
        <ConfirmDialog
          open={open && confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
          danger
          icon={sideQuest.icon}
          title="Nebenquest löschen?"
          message={deleteImpact && sideQuestDeletionText(sideQuest.title, deleteImpact)}
          confirmLabel="Löschen"
        />
      )}
    </>
  )
}
