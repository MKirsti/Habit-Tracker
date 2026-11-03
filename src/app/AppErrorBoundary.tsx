import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'

interface State {
  error: Error | null
}

/**
 * Fängt unerwartete Fehler außerhalb des Routers ab (z. B. wenn IndexedDB nicht verfügbar ist –
 * etwa in manchen privaten Browserfenstern) und zeigt eine verständliche Meldung statt einer leeren Seite.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Questlog: unerwarteter Fehler', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg items-center px-4 py-10">
        <EmptyState
          className="w-full"
          icon={<TriangleAlert />}
          title="Da ist etwas schiefgelaufen"
          text={
            <>
              Questlog konnte nicht gestartet werden. Falls du ein privates Browserfenster nutzt, öffne die App bitte
              in einem normalen Fenster – dort werden deine Daten gespeichert.
              <span className="mt-3 block font-mono text-xs break-words text-muted">{error.message}</span>
            </>
          }
          action={
            <Button icon={<RotateCcw />} onClick={() => window.location.reload()}>
              Neu laden
            </Button>
          }
        />
      </div>
    )
  }
}
