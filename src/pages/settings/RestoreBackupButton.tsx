import { ArchiveRestore, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { restoreBackup } from '../../data/backup'
import type { BackupFile } from '../../data/backup'
import { Button, Dialog, formatNumber, useToast } from '../../ui'
import type { ButtonSize, ButtonVariant } from '../../ui'
import { readBackupFile, summarizeBackup } from './backupFiles'
import { errorMessage } from './errorMessage'

export interface RestoreBackupButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
  children?: ReactNode
  /** Hinweis in der Rückfrage. Standard: Warnung, dass alle Daten ersetzt werden. */
  warning?: ReactNode
}

/**
 * „Backup wiederherstellen“: Datei wählen (.json) → prüfen → Rückfrage mit Zusammenfassung →
 * alle Daten ersetzen. Fehler erscheinen als Toast. Ohne Profil im Spielstand schaltet die App
 * danach von selbst um (Onboarding ↔ App), weil die Daten live geladen werden.
 *
 * Die Rückfrage ist ein eigener Dialog statt `ConfirmDialog`: Dort stünde die Zusammenfassung im
 * Kopf, der nicht scrollt – auf niedrigen Bildschirmen (Handy quer) lägen die Buttons dann
 * außerhalb des sichtbaren Bereichs. Hier scrollt die Zusammenfassung, die Buttons bleiben stehen.
 */
export function RestoreBackupButton({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className,
  children = 'Backup wiederherstellen',
  warning = 'Achtung: Alle aktuellen Daten auf diesem Gerät werden durch das Backup ersetzt.',
}: RestoreBackupButtonProps) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const [reading, setReading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [pending, setPending] = useState<BackupFile | null>(null)
  // Bleibt während des Schließens erhalten, damit der Dialog nicht leer ausblendet.
  const [shown, setShown] = useState<BackupFile | null>(null)
  // Während des Wiederherstellens ist der Button deaktiviert – der Browser schiebt den Fokus dann auf
  // <body>. Schlägt es fehl, bekommt der Button den Fokus zurück, sobald er wieder bedienbar ist.
  const refocusConfirm = useRef(false)

  useEffect(() => {
    if (restoring || !refocusConfirm.current) return
    refocusConfirm.current = false
    const button = confirmRef.current
    const active = document.activeElement
    if (button?.isConnected && (active === null || active === document.body)) button.focus({ preventScroll: true })
  }, [restoring])

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    // Zurücksetzen, damit dieselbe Datei nach einer Korrektur erneut gewählt werden kann.
    input.value = ''
    if (!file) return
    setReading(true)
    try {
      const result = await readBackupFile(file)
      if (!result.ok) {
        toast({ tone: 'error', title: 'Backup konnte nicht gelesen werden', description: result.error })
        return
      }
      setPending(result.backup)
      setShown(result.backup)
    } finally {
      setReading(false)
    }
  }

  async function handleConfirm() {
    if (!pending || restoring) return
    setRestoring(true)
    try {
      await restoreBackup(pending)
    } catch (error) {
      refocusConfirm.current = true
      setRestoring(false)
      toast({ tone: 'error', title: 'Wiederherstellen fehlgeschlagen', description: errorMessage(error) })
      return
    }
    setRestoring(false)
    setPending(null)
    const name = pending.data.profile?.name
    toast({
      tone: 'success',
      title: 'Backup wiederhergestellt',
      description: name ? `Willkommen zurück, ${name}!` : 'Deine Daten wurden eingespielt.',
    })
  }

  function close() {
    if (!restoring) setPending(null)
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        fullWidth={fullWidth}
        className={className}
        icon={<Upload />}
        loading={reading}
        onClick={() => inputRef.current?.click()}
      >
        {children}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        tabIndex={-1}
        aria-hidden="true"
        hidden
        data-testid="backup-file-input"
        onChange={handleFile}
      />
      <Dialog
        open={pending !== null}
        onClose={close}
        role="alertdialog"
        size="sm"
        icon={<ArchiveRestore />}
        title="Backup wiederherstellen?"
        description={hasWarning(warning) ? <span className="text-warning">{warning}</span> : undefined}
        // Destruktive Aktion: Der Fokus startet auf „Abbrechen“.
        initialFocusRef={cancelRef}
        closeOnOverlayClick={!restoring}
        footer={
          <>
            <Button ref={cancelRef} variant="secondary" onClick={close} disabled={restoring}>
              Abbrechen
            </Button>
            <Button ref={confirmRef} variant="danger" onClick={handleConfirm} loading={restoring}>
              Wiederherstellen
            </Button>
          </>
        }
      >
        {shown && <BackupSummaryList backup={shown} />}
      </Dialog>
    </>
  )
}

function hasWarning(warning: ReactNode): boolean {
  return warning !== undefined && warning !== null && warning !== false && warning !== ''
}

function BackupSummaryList({ backup }: { backup: BackupFile }) {
  const summary = summarizeBackup(backup)
  const rows: { label: string; value: ReactNode }[] = [
    {
      label: 'Held',
      value: summary.heroName ? (
        <>
          <span aria-hidden="true">{summary.avatar} </span>
          {summary.heroName}
        </>
      ) : (
        'kein Held angelegt'
      ),
    },
    { label: 'Quests', value: formatNumber(summary.quests) },
    { label: 'Erledigungen', value: formatNumber(summary.completions) },
    { label: 'Kampagnen', value: formatNumber(summary.campaigns) },
    ...(summary.sideQuests > 0 ? [{ label: 'Nebenquests', value: formatNumber(summary.sideQuests) }] : []),
    ...(summary.rewards > 0 ? [{ label: 'Belohnungen', value: formatNumber(summary.rewards) }] : []),
    ...(summary.achievements > 0 ? [{ label: 'Erfolge', value: formatNumber(summary.achievements) }] : []),
    { label: 'Exportiert am', value: summary.exportedAt },
  ]
  return (
    <dl
      aria-label="Inhalt des Backups"
      className="mt-1 divide-y divide-border/70 rounded-xl border border-border bg-bg-deep/50 px-3.5 text-sm"
    >
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4 py-2">
          <dt className="shrink-0 text-muted">{row.label}</dt>
          <dd className="min-w-0 text-right font-medium wrap-anywhere text-parchment tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
