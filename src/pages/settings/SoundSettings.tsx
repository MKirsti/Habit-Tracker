import { Vibrate, Volume2 } from 'lucide-react'
import { useId, useState } from 'react'
import { useGameContext } from '../../app/gameContext'
import { canPlaySound, canVibrate, useGameSounds, vibrateDevice } from '../../features/sound'
import { Button, Card, Switch } from '../../ui'
import { SOUND_SAMPLES, VIBRATION_CONFIRM_PATTERN, nextSample } from './soundText'
import { useSetting } from './useSetting'

/**
 * Klänge & Vibration (Phase 3b) – beides standardmäßig aus. Die Klänge werden im Gerät erzeugt (Web Audio, keine
 * Audiodateien); „Probe hören“ spielt sie der Reihe nach vor (nur bei eingeschalteten Klängen – so klingt es auch im
 * Spiel). Vibration über `navigator.vibrate`: Beim Einschalten summt es einmal kurz zur Bestätigung; auf dem iPhone
 * gibt es das nicht (Hinweis).
 */
export function SoundCard() {
  const { data } = useGameContext()
  const [sound, setSound] = useSetting('sound')
  const [haptics, setHaptics] = useSetting('haptics')
  const { play } = useGameSounds()
  const hintId = useId()
  const [sampleIndex, setSampleIndex] = useState(0)
  const [lastSample, setLastSample] = useState<string | undefined>(undefined)
  // Gespielt wird nur, was gespeichert ist (das Sound-Modul liest die Einstellungen) – nicht schon die Vormerkung.
  const soundStored = data.settings.sound === true
  // Ohne Web Audio bliebe die Probe stumm – das sagen wir lieber, statt „Gerade: …“ anzuzeigen.
  const audio = canPlaySound()
  const previewHint = !soundStored
    ? 'Schalte die Klänge ein, um reinzuhören.'
    : !audio
      ? 'Dieser Browser kann leider keine Klänge abspielen.'
      : lastSample
        ? `Gerade: ${lastSample}`
        : 'Jeder Tipp spielt einen anderen Klang.'

  function preview() {
    const sample = SOUND_SAMPLES[sampleIndex % SOUND_SAMPLES.length]
    try {
      play(sample.sound)
    } catch {
      // Klang ist Zugabe – was immer der Browser dazu meint, die Einstellungen laufen weiter.
    }
    setLastSample(sample.label)
    setSampleIndex((index) => nextSample(index))
  }

  function changeHaptics(value: boolean) {
    void setHaptics(value)
    // Kurzes Summen zur Bestätigung – direkt am Gerät, denn die gespeicherte Einstellung ist in diesem Moment noch aus
    // (`vibrateDevice` wirft nie und tut nichts, wo es keine Vibration gibt).
    if (value) vibrateDevice(VIBRATION_CONFIRM_PATTERN)
  }

  return (
    <Card title="Klänge & Vibration" titleAs="h3" icon={<Volume2 />} className="h-full">
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-8">
        <div className="min-w-0">
          <Switch
            checked={sound === true}
            onChange={(value) => void setSound(value)}
            label="Klänge"
            description="Leise, sanfte Töne beim Abhaken, bei Truhen, Level-Ups, Boss-Treffern und Siegen – im Gerät erzeugt."
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Button
              variant="secondary"
              size="sm"
              icon={<Volume2 />}
              onClick={preview}
              disabled={!soundStored || !audio}
              aria-describedby={hintId}
            >
              Probe hören
            </Button>
            <p id={hintId} className="text-[0.8125rem] text-muted" aria-live="polite">
              {previewHint}
            </p>
          </div>
        </div>
        <div className="min-w-0">
          <Switch
            checked={haptics === true}
            onChange={changeHaptics}
            label="Vibration"
            description="Ein kurzes Summen beim Abhaken, bei Truhen und Siegen."
          />
          <p className="mt-3 flex items-start gap-2 text-[0.8125rem] text-muted">
            <Vibrate aria-hidden className="mt-0.5 size-3.5 shrink-0 text-gold-dim" />
            <span>
              {canVibrate()
                ? 'Auf dem iPhone nicht verfügbar.'
                : 'Dieses Gerät kann leider nicht vibrieren – auf dem iPhone gibt es das nicht.'}
            </span>
          </p>
        </div>
      </div>
    </Card>
  )
}
