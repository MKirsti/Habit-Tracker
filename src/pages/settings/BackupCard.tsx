import { DatabaseBackup, Download, HardDrive } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, useToast } from '../../ui'
import { downloadBackup } from './backupFiles'
import { errorMessage } from './errorMessage'
import { RestoreBackupButton } from './RestoreBackupButton'

/** Datensicherung: Hinweis auf lokale Speicherung, Backup herunterladen und wiederherstellen. */
export function BackupCard() {
  const { toast } = useToast()
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    try {
      const fileName = await downloadBackup(new Date())
      toast({ tone: 'success', title: 'Backup heruntergeladen', description: fileName })
    } catch (error) {
      toast({ tone: 'error', title: 'Backup fehlgeschlagen', description: errorMessage(error) })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card title="Datensicherung" titleAs="h3" icon={<DatabaseBackup />} className="h-full">
      <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info/8 px-3.5 py-3 text-sm">
        <HardDrive aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
        <p className="text-parchment">
          Deine Daten liegen <strong className="font-semibold">nur auf diesem Gerät</strong> – in diesem Browser, ohne
          Konto und ohne Server.{' '}
          <span className="text-muted">
            Lade ab und zu ein Backup herunter, vor allem bevor du Browserdaten löschst oder das Gerät wechselst.
          </span>
        </p>
      </div>
      {/* Buttons nebeneinander nur in breiten Karten, sonst gleich breit untereinander. */}
      <div className="@container mt-4">
        <div className="grid gap-2 @min-[30rem]:grid-cols-2">
          <Button icon={<Download />} loading={downloading} onClick={handleDownload}>
            Backup herunterladen
          </Button>
          <RestoreBackupButton />
        </div>
      </div>
    </Card>
  )
}
