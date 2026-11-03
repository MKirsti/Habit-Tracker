import { Check, UserPen } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { saveProfile } from '../../data/repository'
import type { CharacterProfile } from '../../domain/types'
import { Button, Dialog, TextField, useToast } from '../../ui'
import { errorMessage } from '../settings/errorMessage'
import { AvatarMedallion } from './AvatarMedallion'
import { AvatarPicker } from './AvatarPicker'
import { HERO_NAME_MAX, validateHeroName } from './heroProfile'

export interface EditHeroDialogProps {
  open: boolean
  onClose: () => void
  profile: CharacterProfile
}

/**
 * Name und Avatar des Helden ändern. Der Beginn des Abenteuers (`createdDay`) bleibt unverändert.
 * Tipp: Mit wechselndem `key` öffnen, damit das Formular jedes Mal mit dem aktuellen Profil startet.
 */
export function EditHeroDialog({ open, onClose, profile }: EditHeroDialogProps) {
  const { toast } = useToast()
  const formId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(profile.name)
  const [avatar, setAvatar] = useState(profile.avatar)
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
      await saveProfile({ name: name.trim(), avatar, createdDay: profile.createdDay })
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
          <AvatarMedallion avatar={avatar} size="md" className="mb-0.5" />
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
      </form>
    </Dialog>
  )
}
