import { ArrowLeft } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useGameContext } from '../app/gameContext'
import { startAdventure } from '../data/seed'
import type { GrammaticalForm } from '../domain/types'
import { Button, useToast } from '../ui'
import { DEFAULT_HERO_AVATAR, validateHeroName } from './hero/heroProfile'
import { CampaignStep } from './onboarding/CampaignStep'
import type { CampaignChoice } from './onboarding/CampaignStep'
import { HeroStep } from './onboarding/HeroStep'
import { StepIndicator } from './onboarding/StepParts'
import { WelcomeStep } from './onboarding/WelcomeStep'
import { errorMessage } from './settings/errorMessage'

const STEPS = ['Willkommen', 'Held', 'Kampagne'] as const
type Step = 0 | 1 | 2

const stepMotion = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 28 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -28 }),
}

/**
 * Onboarding in drei Schritten: Willkommen → Held erschaffen → erste Kampagne aus der Bibliothek wählen
 * (Stufe, beim Sport die Klasse) oder ohne Vorlage starten.
 * Wird von `ProfileGate` bildschirmfüllend ohne Layout und ohne Router gezeigt (keine Router-Hooks!).
 * Sobald das Profil gespeichert ist, schaltet die App von selbst um.
 */
export function OnboardingPage() {
  const { today } = useGameContext()
  const { toast } = useToast()

  const [step, setStep] = useState<Step>(0)
  const [direction, setDirection] = useState(1)
  // Erst nach einem Schrittwechsel den Fokus verschieben – nicht beim ersten Aufruf der Seite.
  const [navigated, setNavigated] = useState(false)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState(DEFAULT_HERO_AVATAR)
  // Sprachform für Klassen- und Titelnamen; ohne Wahl neutral.
  const [form, setForm] = useState<GrammaticalForm>('neutral')
  // `undefined` = noch nichts gewählt; `null` = ohne Vorlage starten.
  const [campaign, setCampaign] = useState<CampaignChoice | undefined>(undefined)
  const [saving, setSaving] = useState(false)

  function goTo(next: Step) {
    setDirection(next > step ? 1 : -1)
    setNavigated(true)
    setStep(next)
  }

  async function finish() {
    if (saving) return
    if (validateHeroName(name) !== undefined) {
      goTo(1)
      return
    }
    if (campaign === undefined) return
    setSaving(true)
    try {
      // Eine Transaktion: Vorlage und Profil werden gemeinsam gespeichert oder gar nicht. Schlägt etwas fehl,
      // bleibt nichts zurück – ein neuer Versuch (auch nach einem Neuladen oder mit anderer Wahl) ist sauber.
      // Das gespeicherte Profil schaltet die App danach vom Onboarding in den Spielmodus.
      await startAdventure({ name: name.trim(), avatar, createdDay: today, form }, campaign, today)
    } catch (error) {
      toast({ tone: 'error', title: 'Dein Abenteuer konnte nicht beginnen', description: errorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
      <header className="mx-auto w-full max-w-xl pt-1 pb-4 sm:pt-6">
        <div className="mb-3 flex h-10 items-center justify-between gap-3">
          {step > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowLeft />}
              className="-ml-3"
              onClick={() => goTo((step - 1) as Step)}
              disabled={saving}
            >
              Zurück
            </Button>
          ) : (
            <span />
          )}
          <p className="text-xs font-medium text-muted tabular-nums">
            Schritt {step + 1} von {STEPS.length}
          </p>
        </div>
        <StepIndicator steps={STEPS} current={step} />
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={stepMotion}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-1 flex-col pt-4"
          >
            {step === 0 && <WelcomeStep onStart={() => goTo(1)} focusOnMount={navigated} />}
            {step === 1 && (
              <HeroStep
                name={name}
                avatar={avatar}
                form={form}
                onNameChange={setName}
                onAvatarChange={setAvatar}
                onFormChange={setForm}
                onNext={() => goTo(2)}
                focusOnMount={navigated}
              />
            )}
            {step === 2 && (
              <CampaignStep
                choice={campaign}
                onChoiceChange={setCampaign}
                onFinish={finish}
                saving={saving}
                focusOnMount={navigated}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
