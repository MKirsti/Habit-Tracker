import { Check, UserPen } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { saveProfile } from '../../data/repository'
import type { CharacterProfile, FrameDefinition, GrammaticalForm } from '../../domain/types'
import { Button, Dialog, TextField, useToast } from '../../ui'
import { errorMessage } from '../settings/errorMessage'
import { AvatarMedallion } from './AvatarMedallion'
import { AvatarPicker } from './AvatarPicker'
import { FormChoice } from './FormChoice'
import type { FormExample } from './FormChoice'
import { HERO_NAME_MAX, formOrDefault, validateHeroName } from './heroProfile'

export interface EditHeroDialogProps {
  open: boolean
  onClose: () => void
  profile: CharacterProfile
  /** Namen, an denen die Sprachform live gezeigt wird – z. B. die aktuelle Klasse und der gewählte Titel. */
  formExamples?: readonly FormExample[]
  /** Gewählter (freigeschalteter) Avatar-Rahmen – die Vorschau zeigt ihn mit. */
  frame?: FrameDefinition
}

/**
 * Name, Avatar und Sprachform (für Klassen- und Titelnamen) des Helden ändern. Der Beginn des Abenteuers
 * (`createdDay`) sowie Titel und Rahmen bleiben unverändert.
 * Tipp: Mit wechselndem `key` öffnen, damit das Formular jedes Mal mit dem aktuellen Profil startet.
 */
export function EditHeroDialog({ open, onClose, profile, formExamples, frame }: EditHeroDialogProps) {
  const { toast } = useToast()
  const formId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(profile.name)
  const [avatar, setAvatar] = useState(profile.avatar)
  const [form, setForm] = useState<GrammaticalForm>(formOrDefault(profile.form))
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const error = submitted ? validateHeroName(name) : undefined

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSubmitted(true)
    if (validateHeroName(name) !== undefined) {
      nameRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      // Titel und Rahmen fehlen im Objekt und bleiben so, wie sie gespeichert sind.
      await saveProfile({ name: name.trim(), avatar, createdDay: profile.createdDay, form })
      toast({ tone: 'success', title: 'Held gespeichert' })
      onClose()
    } catch (saveError) {
      toast({ tone: 'error', title: 'Speichern fehlgeschlagen', description: errorMessage(saveError) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={saving ? () => {} : onClose}
      title="Held bearbeiten"
      description="Ein neuer Name, ein neues Gesicht – deine Taten bleiben."
      icon={<UserPen />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="submit" form={formId} icon={<Check />} loading={saving}>
            Speichern
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex items-end gap-4">
          <AvatarMedallion avatar={avatar} size="md" frame={frame} className="mb-0.5" />
          <TextField
            ref={nameRef}
            label="Name"
            required
            value={name}
            onChange={setName}
            maxLength={HERO_NAME_MAX}
            showCount
            error={error}
            autoComplete="nickname"
            autoCapitalize="words"
            spellCheck={false}
            fieldClassName="min-w-0 flex-1"
          />
        </div>
        <AvatarPicker value={avatar} onChange={setAvatar} />
        <FormChoice value={form} onChange={setForm} examples={formExamples} examplePrefix="So heißt du dann" />
      </form>
    </Dialog>
  )
}
