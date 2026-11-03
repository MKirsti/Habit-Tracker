import { Target } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { HabitStatus } from '../../domain/types'
import { Button, Chip, Dialog, NumberField } from '../../ui'
import { formatValue } from './dashboardText'

export interface MeasureDialogProps {
  open: boolean
  onClose: () => void
  /** Die bearbeitete (messbare) Quest; bleibt während der Schließen-Animation gesetzt. */
  status: HabitStatus | undefined
  /** "heute" / "gestern" – für die Frage im Dialog. */
  dayWord: string
  /** Speichert den Wert; liefert `false` bei einem Fehler (der Dialog bleibt dann offen). */
  onSave: (habitId: string, value: number) => Promise<boolean>
}

/** Dialog zur genauen Eingabe eines Messwerts ("12 Seiten"). Werte über dem Ziel sind erlaubt. */
export function MeasureDialog({ open, onClose, status, dayWord, onSave }: MeasureDialogProps) {
  const formId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<number | null>(status?.value ?? 0)
  const [busy, setBusy] = useState(false)

  // Beim Öffnen mit dem aktuell gespeicherten Wert starten (State während des Renderns anpassen).
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setDraft(status?.value ?? 0)
  }

  // Inhalt markieren, damit direktes Tippen den alten Wert ersetzt.
  useEffect(() => {
    if (open) inputRef.current?.select()
  }, [open])

  const measure = status?.habit.measure
  if (!status || !measure) {
    return <Dialog open={false} onClose={onClose} title="" />
  }
  const habitId = status.habit.id
  const target = status.target

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    const ok = await onSave(habitId, Math.max(0, draft ?? 0))
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={status.habit.title}
      icon={status.habit.icon}
      description={`Wie viel hast du ${dayWord} geschafft?`}
      size="sm"
      initialFocusRef={inputRef}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            Speichern
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate>
        <NumberField
          ref={inputRef}
          label="Erfasster Wert"
          value={draft}
          onChange={setDraft}
          min={0}
          step={1}
          unit={measure.unit}
          hint={`Ziel: ${formatValue(target)} ${measure.unit} – mehr ist erlaubt, alles zählt.`}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip size="sm" icon={<Target />} selected={draft === target} onClick={() => setDraft(target)}>
            Ziel: {formatValue(target)}
          </Chip>
          <Chip size="sm" selected={draft === 0} onClick={() => setDraft(0)}>
            Zurücksetzen
          </Chip>
        </div>
      </form>
    </Dialog>
  )
}
