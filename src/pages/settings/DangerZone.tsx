import { Trash2, TriangleAlert } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { resetAllData } from '../../data/repository'
import { Button, Card, Dialog, TextField, useToast } from '../../ui'
import { errorMessage } from './errorMessage'
import { RESET_CONFIRM_WORD, matchesConfirmWord } from './settingsText'

/** Gefahrenzone: alles zurücksetzen – mit Rückfrage, die das Eintippen von „LÖSCHEN“ verlangt. */
export function DangerZone() {
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [dialogKey, setDialogKey] = useState(0)
  return (
    <Card tone="flat" aria-labelledby={titleId} className="!border-danger/40 !bg-danger/[0.05]">
      <div className="mb-3 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger/12 text-danger ring-1 ring-danger/35 ring-inset [&_svg]:size-5"
        >
          <TriangleAlert />
        </span>
        <h2 id={titleId} className="font-display text-[1.0625rem] leading-snug font-semibold tracking-wide text-parchment">
          Gefahrenzone
        </h2>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <p className="max-w-prose text-sm text-muted">
          Löscht deinen Helden, alle Quests, Erledigungen und Kampagnen unwiderruflich von diesem Gerät. Lade vorher ein
          Backup herunter, wenn du deinen Fortschritt behalten willst.
        </p>
        <Button
          variant="danger"
          icon={<Trash2 />}
          className="shrink-0"
          onClick={() => {
            setDialogKey((key) => key + 1)
            setOpen(true)
          }}
        >
          Alles zurücksetzen
        </Button>
      </div>
      <ResetDialog key={dialogKey} open={open} onClose={() => setOpen(false)} />
    </Card>
  )
}

function ResetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const formId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const confirmed = matchesConfirmWord(text)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!confirmed || busy) return
    setBusy(true)
    try {
      await resetAllData()
    } catch (error) {
      toast({ tone: 'error', title: 'Zurücksetzen fehlgeschlagen', description: errorMessage(error) })
      setBusy(false)
      return
    }
    // Nach dem neuen Onboarding soll die App wieder auf „Heute“ starten, nicht in den Einstellungen.
    navigate('/', { replace: true })
    toast({ tone: 'info', title: 'Alles zurückgesetzt', description: 'Ein neues Abenteuer wartet auf dich.' })
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      role="alertdialog"
      size="sm"
      icon={<TriangleAlert />}
      title="Wirklich alles löschen?"
      description="Dein Held, alle Quests, Erledigungen und Kampagnen werden gelöscht. Das lässt sich nicht rückgängig machen."
      initialFocusRef={cancelRef}
      closeOnOverlayClick={!busy}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button type="submit" form={formId} variant="danger" icon={<Trash2 />} disabled={!confirmed} loading={busy}>
            Endgültig löschen
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={handleSubmit}>
        <TextField
          label={
            <>
              Tippe <span className="font-semibold tracking-wide text-danger">{RESET_CONFIRM_WORD}</span> zur Bestätigung
            </>
          }
          value={text}
          onChange={setText}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder={RESET_CONFIRM_WORD}
        />
      </form>
    </Dialog>
  )
}
