/**
 * Datei-Seite der Datensicherung: Backup als JSON herunterladen, Backup-Datei lesen und zusammenfassen.
 */
import { backupFileName, createBackup, parseBackup } from '../../data/backup'
import type { BackupFile } from '../../data/backup'

/** Wie lange die Blob-URL nach dem Klick gültig bleibt (manche Browser starten den Download verzögert). */
export const REVOKE_DELAY_MS = 1000

/**
 * Erstellt ein Backup aller Daten und lädt es als `questlog-backup-JJJJ-MM-TT.json` herunter
 * (über einen temporären Link mit `download`-Attribut). Liefert den Dateinamen.
 */
export async function downloadBackup(now: Date = new Date()): Promise<string> {
  const backup = await createBackup(now)
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const fileName = backupFileName(now)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
  }
  return fileName
}

export type ReadBackupResult = { ok: true; backup: BackupFile } | { ok: false; error: string }

/** Liest eine vom Nutzer gewählte Datei und prüft sie als Questlog-Backup (deutsche Fehlermeldung). */
export async function readBackupFile(file: Blob): Promise<ReadBackupResult> {
  let text: string
  try {
    text = await file.text()
  } catch {
    return { ok: false, error: 'Die Datei konnte nicht gelesen werden.' }
  }
  return parseBackup(text)
}

export interface BackupSummary {
  /** Name des Helden, falls das Backup ein Profil enthält. */
  heroName?: string
  avatar?: string
  quests: number
  completions: number
  campaigns: number
  /** Exportzeitpunkt, lesbar formatiert (de-DE). */
  exportedAt: string
}

/** Kennzahlen eines Backups für die Rückfrage vor dem Wiederherstellen. */
export function summarizeBackup(backup: BackupFile): BackupSummary {
  const { data } = backup
  return {
    heroName: data.profile?.name,
    avatar: data.profile?.avatar,
    quests: data.habits.length,
    completions: data.completions.length,
    campaigns: data.mainQuests.length,
    exportedAt: formatExportDate(backup.exportedAt),
  }
}

let exportFormatter: Intl.DateTimeFormat | undefined

/** "3. Nov. 2026, 14:05 Uhr" (lokale Zeit). Unlesbare Werte werden unverändert zurückgegeben. */
export function formatExportDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  exportFormatter ??= new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${exportFormatter.format(date)} Uhr`
}
