import { useEffect, useRef, useState } from 'react'
import { settleHpDays } from '../data/repository'
import { useGameContext } from './gameContext'
import { createSettleQueue } from './settleQueue'

/**
 * Rechnet die Lebenspunkte ab (`settleHpDays`, ARCHITECTURE.md „Phase 2b … (Vertrag)“): beim Start, beim
 * Tageswechsel und bei der Rückkehr in die App. Endgültig abgerechnet werden nur Tage, die nicht mehr nachgetragen
 * werden können (gestern bleibt offen) – die Funktion ist idempotent, ein Aufruf zu viel schadet nicht.
 *
 * Still: keine Anzeige, keine Toasts. Was eine Abrechnung bringt (Niederlage, Streak-Schutz), meldet `GameFeedback`
 * aus den neuen Ledger-Einträgen; der übliche Tagesschaden steht ruhig im Helden-Kopf. Schutz vor Schleifen:
 * - angestoßen nur, wenn sich Spieltag, Held oder der Abrechnungsbeginn (`penalties.since`, z. B. nach dem
 *   Einspielen eines Backups ohne ihn) ändern – nicht bei jeder Datenänderung, also auch nicht durch die eigenen
 *   Schreibvorgänge; jeder solche Stand wird höchstens einmal angefragt;
 * - nie zwei Abrechnungen gleichzeitig (`createSettleQueue`);
 * - schlägt sie fehl, wird es erst beim nächsten Anlass wieder versucht (kein Wiederholen in einer Schleife);
 * - ohne Held (Onboarding, nach dem Zurücksetzen) passiert nichts – so beginnt die Abrechnung nicht vor dem Abenteuer.
 */
export function HpSettler() {
  const { data, today } = useGameContext()
  const { profile } = data
  const profileKey = profile ? `${profile.createdDay}|${profile.name}|${profile.avatar}` : ''
  const sinceKey = data.settings.penalties?.since ?? ''

  const [queue] = useState(() =>
    createSettleQueue(
      (day) => settleHpDays(day),
      (error) => {
        // Kein Toast: Offene Tage bleiben offen und werden beim nächsten Anlass abgerechnet.
        console.warn('Questlog: Lebenspunkte konnten nicht abgerechnet werden', error)
      },
    ),
  )
  useEffect(() => {
    queue.setPaused(false)
    return () => queue.setPaused(true)
  }, [queue])

  // Immer der aktuelle Spieltag – für die Rückkehr in die App.
  const latest = useRef({ today, active: profileKey !== '' })
  useEffect(() => {
    latest.current = { today, active: profileKey !== '' }
  })

  // Start, Tageswechsel, anderer Held, neuer Abrechnungsbeginn: jeder Stand nur einmal (auch im StrictMode).
  const requested = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (profileKey === '') return
    const key = `${today}|${profileKey}|${sinceKey}`
    if (requested.current === key) return
    requested.current = key
    queue.request(today)
  }, [queue, today, profileKey, sinceKey])

  // Rückkehr in die App (z. B. am nächsten Morgen aus dem Hintergrund): erneut abrechnen.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible' || !latest.current.active) return
      queue.request(latest.current.today)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [queue])

  return null
}
